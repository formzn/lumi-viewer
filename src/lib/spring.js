/**
 * Critically-ish damped spring integration.
 *
 * Every animated value in the scene runs through one of these so motion is
 * frame-rate independent and can never snap. `impulse()` adds velocity without
 * touching the target, which is what gives taps their punch.
 */
export class Spring {
  constructor(value = 0, { stiffness = 180, damping = 16 } = {}) {
    this.value = value
    this.target = value
    this.velocity = 0
    this.stiffness = stiffness
    this.damping = damping
  }

  set(value) {
    this.value = value
    this.target = value
    this.velocity = 0
    return this
  }

  to(target) {
    this.target = target
    return this
  }

  /** Kick the spring. Positive throws it up/out, negative pulls it back. */
  impulse(v) {
    this.velocity += v
    return this
  }

  /**
   * @param {number} dt seconds
   * @param {{stiffness?: number, damping?: number}} [opts] per-frame override,
   *   used to make a value feel snappy in one moment and lazy in another.
   */
  step(dt, opts) {
    const k = opts?.stiffness ?? this.stiffness
    const d = opts?.damping ?? this.damping
    // Clamp dt: a backgrounded tab can hand us a huge delta that would make the
    // integrator explode if we let it through.
    const h = Math.min(dt, 1 / 30)

    // Fixed-size substeps. Semi-implicit Euler gains energy at large h/k, which
    // used to make a full-turn spin overshoot silently; keeping each substep
    // under ~4ms keeps the result within a fraction of a percent of the
    // analytic solution.
    const steps = Math.max(1, Math.ceil(h / 0.004))
    const sh = h / steps
    for (let i = 0; i < steps; i++) {
      const accel = (this.target - this.value) * k - this.velocity * d
      this.velocity += accel * sh
      this.value += this.velocity * sh
    }
    return this.value
  }
}

/**
 * Kick a spring so its peak displacement is approximately `amplitude`.
 *
 * Raw impulses are impossible to reason about: the visible result depends on
 * both stiffness and damping. Everything in the controller is expressed as the
 * displacement you actually want on screen, and this solves the damped
 * oscillator for the velocity that produces it.
 */
export function kick(spring, amplitude) {
  const k = spring.stiffness
  const c = spring.damping
  const w0 = Math.sqrt(k)
  const zeta = c / (2 * w0) // damping ratio

  let velocity
  if (zeta < 0.999) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    // Time of first extremum, and the decay envelope there.
    const tPeak = Math.atan2(Math.sqrt(1 - zeta * zeta), zeta) / wd
    const decay = Math.exp(-zeta * w0 * tPeak)
    const unitPeak = (decay * Math.sin(wd * tPeak)) / wd
    velocity = amplitude / unitPeak
  } else {
    // Critically / over-damped: a velocity kick peaks at v0 / (e * w0).
    velocity = amplitude * w0 * Math.E
  }
  return spring.impulse(velocity)
}

/** Exponential smoothing that is independent of frame rate. */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

/** Smooth 0..1 ramp. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Deterministic pseudo-random in [0,1). Seeded so the character looks identical
 * on every load, which matters for a "hero" object people will screenshot.
 */
export function seeded(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3)
export const easeInOutCubic = (t) => {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
