import { Spring, kick, clamp } from '../lib/spring.js'

/**
 * One store for the character's whole emotional + physical state.
 *
 * Deliberately a plain mutable object rather than React state: the render loop
 * writes to it 60x a second and React should never re-render because a spring
 * moved 0.002 units.
 */
export const MOODS = { idle: 'idle', happy: 'happy', alert: 'alert', sleep: 'sleep' }

const ORB_COUNT = 6

export function createCharacterState() {
  const s = {
    // --- continuous physical springs -------------------------------------
    floatY: new Spring(0, { stiffness: 90, damping: 12 }),
    breath: new Spring(1, { stiffness: 70, damping: 11 }),
    // + = stretch tall, - = squash flat. Drives non-uniform scale.
    squash: new Spring(0, { stiffness: 320, damping: 14 }),
    wobble: new Spring(0, { stiffness: 210, damping: 9 }),
    spin: new Spring(0, { stiffness: 120, damping: 16 }),
    headTiltX: new Spring(0, { stiffness: 60, damping: 11 }),
    headTiltZ: new Spring(0, { stiffness: 60, damping: 11 }),
    bodyTiltX: new Spring(0, { stiffness: 45, damping: 10 }),
    bodyTiltZ: new Spring(0, { stiffness: 45, damping: 10 }),
    orbBurst: new Spring(0, { stiffness: 140, damping: 9 }),
    zoom: new Spring(1, { stiffness: 120, damping: 18 }),
    // Two separate channels so the idle loop and a tap cannot overwrite each
    // other: `eyeOpen` is the sustained state (1 awake, 0 asleep), `squint` is
    // the brief reaction to being tapped.
    eyeOpen: new Spring(1, { stiffness: 220, damping: 18 }),
    squint: new Spring(1, { stiffness: 200, damping: 16 }),
    glow: new Spring(1, { stiffness: 180, damping: 14 }),
    sleepAmount: new Spring(0, { stiffness: 40, damping: 10 }),

    // --- discrete state --------------------------------------------------
    mood: MOODS.idle,
    moodUntil: 0,
    blinkAmount: 0, // 0..1, 1 = fully closed
    asleep: false,

    // Where the head is looking, normalised -1..1, and its damped current value
    lookX: 0,
    lookY: 0,
    lookTargetX: 0,
    lookTargetY: 0,

    // Per-orb reaction channels, index matched to SPEC.orbs.layout
    orbFlash: [],
    orbSpin: [],

    // Rotation driven by drag gestures
    dragYaw: 0,
    dragPitch: 0,
    dragYawTarget: 0,
    dragPitchTarget: 0,
    autoYaw: 0,
    lastInteraction: 0,

    // Transient "haptic pop" marker at the exact tapped spot
    popAt: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this } },
    popStrength: 0,
    popAge: 99,
  }

  for (let i = 0; i < ORB_COUNT; i++) {
    s.orbFlash.push(new Spring(0, { stiffness: 190, damping: 10 }))
    s.orbSpin.push(new Spring(0, { stiffness: 90, damping: 12 }))
  }

  return s
}

export function setMood(s, mood, t) {
  s.mood = mood
  s.moodUntil = t ?? performance.now() / 1000
}

/**
 * Every interaction funnels through here, so "instant visual feedback" is
 * guaranteed in exactly one place: a squash, a glow pulse, and a ring at the
 * precise point that was touched.
 */
export function feedback(s, { strength = 1, spot = null, squash = -0.34 } = {}) {
  kick(s.squash, squash * strength)
  kick(s.glow, 0.45 * strength)
  if (spot) {
    s.popAt.set(spot.x, spot.y, spot.z)
    s.popStrength = clamp(strength, 0, 2)
    s.popAge = 0
  }
}

export function tapHead(s, t, spot) {
  feedback(s, { strength: 1, squash: -0.32, spot })
  kick(s.floatY, 0.30) // a real hop
  kick(s.bodyTiltX, 0.10)
  kick(s.orbBurst, 0.42) // beads burst outward, then spring home
  kick(s.squint, -0.85) // eyes squeeze shut, then open again
  setMood(s, MOODS.happy, t + 1.2)
  for (let i = 0; i < ORB_COUNT; i++) kick(s.orbFlash[i], 0.5 + (i % 3) * 0.07)
}

export function tapBody(s, t, spot) {
  feedback(s, { strength: 0.9, squash: -0.42, spot })
  kick(s.wobble, 1.9) // the jelly wobble
  kick(s.floatY, 0.17)
  kick(s.bodyTiltZ, 0.13)
  setMood(s, MOODS.happy, t + 0.85)
}

export function tapOrb(s, index, spot) {
  const flash = s.orbFlash[index]
  if (flash) {
    kick(flash, 1.0)
    kick(s.orbSpin[index], 1.9) // one fast lap
  }
  kick(s.glow, 0.35)
  kick(s.squash, -0.08)
  if (spot) {
    s.popAt.set(spot.x, spot.y, spot.z)
    s.popStrength = 0.65
    s.popAge = 0
  }
}

export function tapEmpty(s) {
  kick(s.squash, -0.06)
  setMood(s, MOODS.alert)
}

export function doubleTap(s, t, spot) {
  feedback(s, { strength: 1.15, squash: -0.20, spot })
  // Request a hair over one turn: the spring's peak lands a few percent below
  // the requested amplitude, and the gesture must visibly complete 360°.
  kick(s.spin, 2 * Math.PI * 1.08)
  kick(s.orbBurst, 0.34)
  kick(s.squint, -0.8)
  setMood(s, MOODS.happy, t + 1.5)
  for (let i = 0; i < ORB_COUNT; i++) kick(s.orbFlash[i], 0.7)
}

export function startSleep(s) {
  s.asleep = true
  s.mood = MOODS.sleep
}

export function wake(s, t) {
  s.asleep = false
  s.mood = MOODS.alert
  s.moodUntil = t + 1.1
  kick(s.eyeOpen, 0.35)
  kick(s.floatY, 0.1)
}
