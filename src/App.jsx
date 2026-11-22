import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Stage } from './scene/Stage.jsx'
import {
  createCharacterState,
  tapHead,
  tapBody,
  tapOrb,
  tapEmpty,
  doubleTap,
  startSleep,
  wake,
  setMood,
} from './character/controller.js'
import { clamp } from './lib/spring.js'

/* ------------------------------------------------------------------ *
 * Interaction layer
 *
 * One pointer pipeline handles mouse, touch and pen. Hit-testing is manual
 * (raycast against a small set of proxies) so we can tell "head", "body",
 * "orb N" and "background" apart and react to the exact spot.
 * ------------------------------------------------------------------ */

function Interaction({ state, onFirstTouch, api }) {
  const { camera, gl, size } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  const gesture = useRef({
    down: false,
    id: null,
    x: 0,
    y: 0,
    lastX: 0,
    lastY: 0,
    startYaw: 0,
    startPitch: 0,
    moved: 0,
    t0: 0,
    longTimer: null,
    lastTap: 0,
    lastTapX: 0,
    lastTapY: 0,
    pinchDist: 0,
    active: false,
  })

  /** Which part of the character is under this screen point? */
  const pick = useCallback(
    (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.x = ((cx - rect.left) / rect.width) * 2 - 1
      ndc.y = -((cy - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)

      const hit = { kind: 'empty', point: null, orb: -1, nx: 0, ny: 0 }

      // Orbs first — they are the smallest targets and float outermost.
      if (api.current.orbs) {
        const orbHits = raycaster.intersectObjects(api.current.orbs, true)
        if (orbHits.length) {
          let node = orbHits[0].object
          while (node && node.userData.orb === undefined) node = node.parent
          if (node) {
            hit.kind = 'orb'
            hit.orb = node.userData.orb
            hit.point = orbHits[0].point
            return hit
          }
        }
      }

      // Then character parts.
      const parts = api.current.parts
      if (parts) {
        const targets = []
        if (parts.head) targets.push(parts.head)
        if (parts.body) targets.push(parts.body)
        const hits = raycaster.intersectObjects(targets, true)
        if (hits.length) {
          const obj = hits[0].object
          let node = obj
          while (node && !node.name?.startsWith('hit-')) node = node.parent
          const point = hits[0].point
          hit.point = point
          if (node?.name === 'hit-body' || node?.name === 'hit-button') {
            hit.kind = 'body'
          } else if (
            node?.name === 'hit-face' ||
            node?.name === 'hit-head' ||
            node?.name === undefined
          ) {
            hit.kind = 'head'
          }
          return hit
        }
      }

      return hit
    },
    [api, camera, gl, ndc, raycaster],
  )

  /**
   * The tap ring is rendered at the scene root, so it must use the world-space
   * hit point directly — converting into character-local space would put the
   * ring in the wrong place as soon as the character is rotated.
   */
  const toLocal = useCallback((point) => ({ x: point.x, y: point.y, z: point.z }), [])

  const fire = useCallback(
    (x, y) => {
      const now = performance.now() / 1000
      const s = state
      s.lastInteraction = now

      const hit = pick(x, y)
      const spot = hit.point ? toLocal(hit.point) : null

      // Double tap: two taps within 320ms and 40px of each other.
      const isDouble =
        now - gesture.current.lastTap < 0.32 &&
        Math.hypot(x - gesture.current.lastTapX, y - gesture.current.lastTapY) < 40
      gesture.current.lastTap = now
      gesture.current.lastTapX = x
      gesture.current.lastTapY = y

      // While asleep, the first tap only wakes the character — it should not
      // also count as half of a double tap or trigger a head bounce.
      if (s.asleep) {
        wake(s, now)
        gesture.current.lastTap = 0
        onFirstTouch()
        return
      }

      if (isDouble) {
        doubleTap(s, now, spot)
        onFirstTouch()
        return
      }

      if (hit.kind === 'orb') {
        tapOrb(s, hit.orb, spot)
      } else if (hit.kind === 'head') {
        tapHead(s, now, spot)
      } else if (hit.kind === 'body') {
        tapBody(s, now, spot)
      } else {
        tapEmpty(s)
      }

      onFirstTouch()
    },
    [api, onFirstTouch, pick, state, toLocal],
  )

  // Pointer look-at tracking (mouse hover + finger position while touching).
  const lookFromEvent = useCallback(
    (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect()
      const nx = ((cx - rect.left) / rect.width) * 2 - 1
      const ny = -((cy - rect.top) / rect.height) * 2 + 1
      state.lookTargetX = clamp(nx, -1, 1) * 0.85
      state.lookTargetY = clamp(ny, -1, 1) * 0.85
    },
    [gl, state],
  )

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'

    const onPointerDown = (e) => {
      if (gesture.current.down) return
      const g = gesture.current
      g.down = true
      g.id = e.pointerId
      g.x = g.lastX = e.clientX
      g.y = g.lastY = e.clientY
      g.startYaw = state.dragYawTarget
      g.startPitch = state.dragPitchTarget
      g.moved = 0
      g.t0 = performance.now()
      lookFromEvent(e.clientX, e.clientY)

      // Long press -> fall asleep. Cancelled by any movement.
      clearTimeout(g.longTimer)
      g.longTimer = setTimeout(() => {
        if (g.moved < 6) {
          startSleep(state)
          g.active = false
          onFirstTouch()
        }
      }, 520)
    }

    const onPointerMove = (e) => {
      lookFromEvent(e.clientX, e.clientY)

      // Any pointer movement counts as attention, hover included: it suppresses
      // the idle gaze drift so the character follows the cursor instead of
      // fighting it. Real browsers fire this only on actual movement.
      state.lastInteraction = performance.now() / 1000

      const g = gesture.current
      if (!g.down || e.pointerId !== g.id) return
      const dx = e.clientX - g.lastX
      const dy = e.clientY - g.lastY
      g.lastX = e.clientX
      g.lastY = e.clientY
      g.moved += Math.abs(dx) + Math.abs(dy)

      if (g.moved > 6) {
        clearTimeout(g.longTimer)
        g.active = true
      }

      if (g.active) {
        // Drag rotates the character 360° in either direction.
        state.dragYawTarget = g.startYaw + (e.clientX - g.x) * 0.011
        state.dragPitchTarget = clamp(
          g.startPitch + (e.clientY - g.y) * 0.006,
          -0.5,
          0.5,
        )
      }
    }

    const onPointerUp = (e) => {
      const g = gesture.current
      if (!g.down || e.pointerId !== g.id) return
      clearTimeout(g.longTimer)
      g.down = false
      const dt = performance.now() - g.t0
      if (!g.active && g.moved < 8 && dt < 500) {
        fire(e.clientX, e.clientY)
      }
      g.active = false
      g.id = null
    }

    const onPointerCancel = () => {
      clearTimeout(gesture.current.longTimer)
      gesture.current.down = false
      gesture.current.active = false
      gesture.current.id = null
    }

    // Wheel / trackpad zoom, and pinch zoom on touch.
    const onWheel = (e) => {
      e.preventDefault()
      state.zoom.to(clamp(state.zoom.target * (1 + e.deltaY * 0.0012), 0.55, 1.75))
      state.lastInteraction = performance.now() / 1000
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 2) return
      const [a, b] = e.touches
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const g = gesture.current
      if (!g.pinchDist) {
        g.pinchDist = d
        return
      }
      const ratio = d / g.pinchDist
      g.pinchDist = d
      state.zoom.to(clamp(state.zoom.target * (1 / ratio), 0.55, 1.75))
      g.moved = 99
      clearTimeout(g.longTimer)
    }

    const onTouchEnd = () => {
      gesture.current.pinchDist = 0
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchstart', onTouchEnd, { passive: true })

    return () => {
      clearTimeout(gesture.current.longTimer)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchstart', onTouchEnd)
    }
  }, [fire, gl, lookFromEvent, onFirstTouch, state])

  return null
}

/* ------------------------------------------------------------------ *
 * Animation driver: blinking, mood decay, sleeping.
 * Kept out of React so it can run at 60fps without re-rendering.
 * ------------------------------------------------------------------ */

function Life({ state }) {
  const { nextBlink } = useMemo(() => ({ nextBlink: { at: 1.6 } }), [])
  const blinkRef = useRef({ t: -1, dur: 0.16, double: false, second: false })
  const sleepTimer = useRef(0)

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime
    const s = state
    const now = performance.now() / 1000

    // ---- blinking: every 3–5s, occasionally twice in a row -------------
    const b = blinkRef.current
    if (b.t < 0 && t > nextBlink.at) {
      b.t = 0
      b.dur = 0.14 + Math.random() * 0.05
      b.double = Math.random() < 0.22
      b.second = false
      const gap = 3 + Math.random() * 2
      nextBlink.at = t + gap
    }

    if (b.t >= 0) {
      b.t += dt
      const k = b.t / b.dur
      // Triangle profile: close, then open.
      s.blinkAmount = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2)
      if (k >= 1) {
        if (b.double && !b.second) {
          b.second = true
          b.t = 0
          b.dur = 0.13
        } else {
          b.t = -1
          s.blinkAmount = 0
        }
      }
    } else {
      s.blinkAmount = 0
    }

    // Asleep: never blink, eyes stay softly shut.
    if (s.asleep) s.blinkAmount = 0

    // ---- mood decay -----------------------------------------------------
    if (!s.asleep && s.mood !== 'idle' && now > s.moodUntil) {
      setMood(s, 'idle', 0)
    }

    // ---- eye openness spring -------------------------------------------
    const targetOpen = s.asleep ? 0 : 1
    s.eyeOpen.to(targetOpen)
    s.eyeOpen.step(dt, { stiffness: s.asleep ? 60 : 220, damping: s.asleep ? 14 : 18 })
    // The tapped-eyes squint always relaxes back to wide open.
    s.squint.to(1)
    s.squint.step(dt, { stiffness: 120, damping: 13 })

    // ---- sleep easing ---------------------------------------------------
    s.sleepAmount.to(s.asleep ? 1 : 0)
    if (s.asleep) {
      sleepTimer.current += dt
      // Wake up on its own after a while, and look at you.
      if (sleepTimer.current > 5.5) {
        sleepTimer.current = 0
        wake(s, now)
        s.lookTargetX = 0
        s.lookTargetY = 0
      }
    } else {
      sleepTimer.current = 0
    }

    // Idle: drift the gaze slightly so it doesn't look frozen.
    if (now - s.lastInteraction > 2.5) {
      s.lookTargetX = Math.sin(t * 0.42) * 0.55
      s.lookTargetY = Math.sin(t * 0.31 + 1.1) * 0.28
    }
  })

  return null
}

/* ------------------------------------------------------------------ *
 * App shell
 * ------------------------------------------------------------------ */

/**
 * Coarse quality tiers, chosen before the canvas mounts.
 *
 * Glass transmission re-renders the scene into its own buffer, which is the one
 * thing here that can make a mid-range phone drop frames. On touch devices and
 * very dense screens it gets a smaller buffer and fewer samples; the hood still
 * reads as glass because most of its look comes from the environment map.
 */
function pickQuality() {
  if (typeof window === 'undefined') {
    return { transmissionSamples: 6, transmissionResolution: 256, dpr: [1, 2] }
  }
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
  const px = window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1) ** 2
  if (coarse || px > 2_400_000) {
    return { transmissionSamples: 3, transmissionResolution: 128, dpr: [1, 1.6] }
  }
  return { transmissionSamples: 6, transmissionResolution: 256, dpr: [1, 2] }
}

export default function App() {
  const state = useMemo(() => createCharacterState(), [])
  const api = useRef({ parts: null, orbs: null, root: null })
  const [quality] = useState(() => pickQuality())
  const [hintVisible, setHintVisible] = useState(true)
  const [entered, setEntered] = useState(false)
  const hintTimer = useRef(null)

  const onFirstTouch = useCallback(() => {
    setHintVisible((v) => {
      if (!v) return v
      return false
    })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60)
    hintTimer.current = setTimeout(() => setHintVisible(false), 9000)
    return () => {
      clearTimeout(t)
      clearTimeout(hintTimer.current)
    }
  }, [])

  // Keyboard: space to bounce, esc nothing. Kept minimal per the brief.
  useEffect(() => {
    const onKey = (e) => {
      const now = performance.now() / 1000
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        tapHead(state, now, { x: 0, y: 0.1, z: 0.5 })
        onFirstTouch()
      }
      if (e.key === 'ArrowLeft') state.dragYawTarget -= 0.4
      if (e.key === 'ArrowRight') state.dragYawTarget += 0.4
      if (e.key === 's') {
        state.asleep ? wake(state, now) : startSleep(state)
        onFirstTouch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFirstTouch, state])

  return (
    <div className="stage">
      <Canvas
        dpr={quality.dpr}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 0.32, 4.35], fov: 36, near: 0.1, far: 60 }}
        shadows
        onCreated={({ gl }) => {
          gl.setClearColor('#150c07', 1)
        }}
      >
        <StageBridge api={api} />
        <Stage state={state} quality={quality} />
        <Interaction state={state} onFirstTouch={onFirstTouch} api={api} />
        <Life state={state} />
      </Canvas>

      <div className={`hint ${!hintVisible ? 'hint--gone' : ''}`} aria-hidden="true">
        tap me
      </div>

      <div className={`veil ${entered ? 'veil--up' : ''}`} aria-hidden="true" />
    </div>
  )
}

/**
 * Bridges the imperative character refs into the pointer layer, and keeps the
 * controller's hit-test registry current.
 */
function StageBridge({ api }) {
  const { scene } = useThree()

  // The character mounts asynchronously (Suspense inside <Canvas>), so the refs
  // are not guaranteed to exist on the first effect run. Poll briefly until the
  // graph is there, then stop — this runs a handful of times at most.
  useEffect(() => {
    let cancelled = false
    let tries = 0

    const wire = () => {
      if (cancelled) return
      const root = scene.getObjectByName('character-root')
      if (!root) {
        if (tries++ < 120) requestAnimationFrame(wire)
        return
      }
      api.current.root = root
      api.current.parts = {
        head: root.getObjectByName('hit-head') || null,
        body: root.getObjectByName('hit-body') || null,
      }
      const orbs = []
      root.traverse((o) => {
        if (o.userData?.orb !== undefined) orbs[o.userData.orb] = o
      })
      api.current.orbs = orbs.length ? orbs : null
    }

    wire()
    return () => {
      cancelled = true
    }
  }, [api, scene])

  return null
}
