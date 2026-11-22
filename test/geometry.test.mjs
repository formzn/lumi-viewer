import * as THREE from 'three'
import { SPEC, buildHoodGeometry, buildBodyGeometry, latheFromProfile } from '../src/character/spec.js'

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

const bounds = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, min: b.min.clone(), max: b.max.clone() } }

console.log('\n== hood ==')
const hood = buildHoodGeometry()
const hb = bounds(hood)
t('hood is taller than wide', hb.h > hb.w, `h=${hb.h.toFixed(2)} w=${hb.w.toFixed(2)}`)
t('hood is a leaf: broad from the front, slim from the side', hb.w > hb.d * 1.15, `w=${hb.w.toFixed(2)} d=${hb.d.toFixed(2)}`)
t('hood has a pointed top', hb.max.y > 0.55, 'top=' + hb.max.y.toFixed(2))
t('hood is closed at both ends', hb.min.y < -0.40 && hb.max.y > 0.55)
t('hood has no NaN vertices', hood.attributes.position.array.every(Number.isFinite))
// Taper is a property of the profile: check it before the tip is leaned back,
// because the lean intentionally pushes the apex backwards in Z.
t('hood tapers to a point at the top', (() => {
  const raw = latheFromProfile(SPEC.hood.profile, 64, 170)
  raw.scale(SPEC.hood.scale, SPEC.hood.scale, SPEC.hood.scale * SPEC.hood.depth)
  raw.computeBoundingBox()
  const b = raw.boundingBox
  const pos = raw.attributes.position
  let widest = 0
  for (let i = 0; i < pos.count; i++) widest = Math.max(widest, Math.hypot(pos.getX(i), pos.getZ(i)))
  let nearTop = 0
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > b.max.y * 0.90) nearTop = Math.max(nearTop, Math.hypot(pos.getX(i), pos.getZ(i)))
  }
  return nearTop < widest * 0.22
})())
t('the hood tip leans backwards like a leaf', hb.max.z > 0.2, 'maxZ=' + hb.max.z.toFixed(2))
t('hood normals are unit length', (() => {
  const n = hood.attributes.normal.array
  let ok = true
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2])
    if (l > 0.001 && Math.abs(l - 1) > 0.02) { ok = false; break }
  }
  return ok
})())

console.log('\n== body ==')
const body = buildBodyGeometry()
const bb = bounds(body)
t('body is a teardrop: pointed at the bottom', Math.abs(bb.min.y + 0.5 * SPEC.body.scale[1]) < 0.02, 'bottom=' + bb.min.y.toFixed(2))
t('body is wider at the top than the bottom', (() => {
  const pos = body.attributes.position
  let topMax = 0, botMax = 0
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i))
    if (y > 0.18) topMax = Math.max(topMax, r)
    if (y < -0.30) botMax = Math.max(botMax, r)
  }
  return topMax > botMax * 1.3
})())
t('body has no NaN vertices', body.attributes.position.array.every(Number.isFinite))

console.log('\n== overall proportion (reference is about 2:1 tall:wide) ==')
{
  const hoodTop = SPEC.hood.position[1] + hb.max.y
  const bodyBottom = SPEC.body.position[1] + bb.min.y
  const totalH = hoodTop - bodyBottom
  const totalW = Math.max(hb.w, bb.w)
  const ratio = totalH / totalW
  t('character is roughly 2:1 height:width', ratio > 1.5 && ratio < 2.6, `ratio=${ratio.toFixed(2)} (H=${totalH.toFixed(2)} W=${totalW.toFixed(2)})`)
  t('head and body connect without a gap', (SPEC.hood.position[1] + hb.min.y) < (SPEC.body.position[1] + bb.max.y) + 0.1,
    `hood bottom=${(SPEC.hood.position[1]+hb.min.y).toFixed(2)} body top=${(SPEC.body.position[1]+bb.max.y).toFixed(2)}`)
}

console.log('\n== face sits inside the hood ==')
{
  const fr = SPEC.face.radius
  const fx = SPEC.face.position
  const insideX = Math.abs(fx[0]) + fr < hb.max.x
  const insideY = fx[1] + fr < SPEC.hood.position[1] + hb.max.y && fx[1] - fr > SPEC.hood.position[1] + hb.min.y
  t('face sphere fits inside the hood horizontally', insideX, `face edge=${(Math.abs(fx[0])+fr).toFixed(2)} hood=${hb.max.x.toFixed(2)}`)
  t('face sphere fits inside the hood vertically', insideY)
  t('face sphere protrudes toward the front (visible through the glass)', fx[2] + fr > 0.4)
}

console.log('\n== orbs ==')
{
  const layout = SPEC.orbs.layout
  t('5-6 orbs as specified', layout.length >= 5 && layout.length <= 6, 'count=' + layout.length)
  const colors = new Set(layout.map(o => o.color))
  t('uses the reference palette', ['purple','blue','pink','coral'].every(c => colors.has(c)), [...colors].join(', '))
  const sizes = new Set(layout.map(o => o.size))
  t('orbs are different sizes', sizes.size >= 4)
  const speeds = layout.map(o => o.speed)
  t('orbs move at different speeds', new Set(speeds).size === speeds.length)
  t('orbits run in both directions', layout.some(o => o.dir > 0) && layout.some(o => o.dir < 0))
  const ringR = SPEC.orbs.rings.map(r => r.radius)
  t('rings sit outside the hood', Math.min(...ringR) > hb.max.x * 0.9, `ring=${Math.min(...ringR)} hoodW=${hb.max.x.toFixed(2)}`)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
