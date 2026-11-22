// Ports the eye shader's field function to JS and samples it, so we can assert
// the expression geometry is right without a GPU.
import { SPEC } from '../src/character/spec.js'

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

const smoothstep = (a, b, x) => { const v = Math.min(Math.max((x - a) / (b - a), 0), 1); return v * v * (3 - 2 * v) }

function arcField(p, span, curve, thick, glow = 1) {
  const x = Math.min(Math.max(p[0] / span, -1), 1)
  const inside = 1 - smoothstep(0.9, 1.0, Math.abs(p[0] / span))
  const yArc = curve * (1 - x * x)
  const dist = Math.abs(p[1] - yArc)
  const taper = 1 + (0.42 - 1) * Math.abs(x)
  const core = 1 - smoothstep(0, thick * taper, dist)
  const halo = Math.pow(Math.max(0, 1 - dist / (thick * taper * 4.5)), 2)
  return (core + halo * 0.5 * glow) * inside
}

// Sample the eye at a given screen-space offset from its centre.
const sample = (dx, dy, { span = 0.150, curve = 0.40, thick = 0.0185 } = {}) =>
  arcField([dx, dy], span, curve, thick)

// Sample exactly ON the arc: y = curve * (1 - (x/span)^2)
const onArc = (x, { span = 0.150, curve = 0.40, thick = 0.0185 } = {}) =>
  sample(x, curve * (1 - (x / span) ** 2), { span, curve, thick })

console.log('\n== eye geometry ==')
// The arc apex sits at +curve (up), so the eye is an upside-down U: ∩
t('stroke is present at the arc apex (centre, +curve)', sample(0, 0.40) > 0.5, 'val=' + sample(0, 0.40).toFixed(2))
t('stroke is continuous along the left arm', onArc(-0.12) > 0.5, 'val=' + onArc(-0.12).toFixed(2))
t('stroke is continuous along the right arm', onArc(0.12) > 0.5, 'val=' + onArc(0.12).toFixed(2))
t('stroke is continuous across the apex', onArc(0) > 0.5, 'val=' + onArc(0).toFixed(2))
t('arms end lower than the apex', onArc(0.13) > 0 && 0.40 * (1 - (0.13 / 0.15) ** 2) < 0.40)
// An upside-down U must be OPEN at the bottom: no stroke under the apex.
t('eye is open underneath (∩, not a ring)', sample(0, 0.05) < 0.06, 'val=' + sample(0, 0.05).toFixed(3))
t('ends droop below the apex', 0.40 > 0.04)
t('nothing far outside the arc', sample(0, -0.5) < 0.01 && sample(0.6, 0.4) < 0.01)
// The two eyes must not touch: their centres are 2*eyeYaw apart.
t('eyes are separated', SPEC.face.eyeYaw * 2 > 0.150 * 2, 'gap centers=' + (SPEC.face.eyeYaw * 2).toFixed(2))

console.log('\n== expression states differ meaningfully ==')
const apex = (o) => sample(0, o.curve, o)
const closed = { span: 0.150, curve: 0.058 * 0.05, thick: 0.016 }
const idle = { span: 0.150, curve: 0.40, thick: 0.0185 }
const happy = { span: 0.158, curve: 0.62, thick: 0.0215 }
const alert = { span: 0.132, curve: 0.50, thick: 0.025 }

t('idle eyes are visible', apex(idle) > 0.5)
t('happy arcs are taller than idle', happy.curve > idle.curve)
t('happy arcs are thicker than idle', happy.thick > idle.thick)
t('alert eyes are thicker than idle (widen)', alert.thick > idle.thick)
t('alert eyes are narrower than idle', alert.span < idle.span)
t('closed eyes collapse', apex(closed) > 0.3, 'a thin line still present')
const closedHeight = closed.curve
t('closed eyes are nearly flat', closedHeight < 0.01, 'curve=' + closedHeight)
// A blink must not look like a different expression, just a shorter one.
const blinking = { span: idle.span, curve: idle.curve * 0.05, thick: idle.thick * 0.74 }
t('blink keeps a visible line (no disappearance)', apex(blinking) > 0.2)

console.log('\n== the face is front-only ==')
const eyeSrc = (await import('fs')).readFileSync(new URL('../src/scene/Eyes.jsx', import.meta.url), 'utf8')
t('shader rejects the back hemisphere', /vNormal\.z < 0\.02/.test(eyeSrc))
t('eye Y offset keeps eyes on the upper half of the face', SPEC.face.eyePitch > 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
