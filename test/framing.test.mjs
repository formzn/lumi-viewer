import { SPEC, buildHoodGeometry, buildBodyGeometry } from '../src/character/spec.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

// Pull the real constants out of Stage.jsx so the test can't drift from the app.
const stage = readFileSync(new URL('../src/scene/Stage.jsx', import.meta.url), 'utf8')
const NEED_H = Number(stage.match(/const NEED_H = ([\d.]+)/)[1])
const NEED_W = Number(stage.match(/const NEED_W = ([\d.]+)/)[1])
const FOV = 36

const hood = buildHoodGeometry(); hood.computeBoundingBox()
const body = buildBodyGeometry(); body.computeBoundingBox()
const ringR = Math.max(...SPEC.orbs.rings.map((r) => r.radius))
const orbMax = ringR + 0.10 // bead radius + glow headroom

console.log('\n== the framing constants cover the real character ==')
const top = Math.max(SPEC.hood.position[1] + hood.boundingBox.max.y, orbMax) + 0.10
const bottom = SPEC.body.position[1] + body.boundingBox.min.y - 0.10
const halfW = Math.max(orbMax, hood.boundingBox.max.x) + 0.06
console.log(`  extents: top=${top.toFixed(2)} bottom=${bottom.toFixed(2)} halfW=${halfW.toFixed(2)}`)
t('NEED_H covers the real vertical half-extent', NEED_H >= Math.max(top, Math.abs(bottom)), `need ${Math.max(top, Math.abs(bottom)).toFixed(2)} <= ${NEED_H}`)
t('NEED_W covers the real horizontal half-extent', NEED_W >= halfW, `need ${halfW.toFixed(2)} <= ${NEED_W}`)
t('framing is not wasteful (within 40% headroom)', NEED_H < top * 1.4 && NEED_W < halfW * 1.4)

console.log('\n== every viewport fits both axes ==')
const halfTan = Math.tan((FOV * Math.PI) / 360)
for (const [label, w, h] of [
  ['iPhone SE', 375, 667], ['iPhone 15', 393, 852], ['tall Android', 360, 800],
  ['iPhone 14 Pro Max', 430, 932], ['iPad portrait', 820, 1180],
  ['laptop', 1440, 900], ['desktop', 1920, 1080],
  ['landscape phone', 667, 375], ['square', 800, 800],
]) {
  const aspect = w / h
  const dist = Math.max(NEED_H / halfTan, NEED_W / (halfTan * aspect))
  const halfV = halfTan * dist
  const halfHoriz = halfV * aspect
  const fitsV = NEED_H <= halfV + 1e-9
  const fitsH = NEED_W <= halfHoriz + 1e-9
  t(`${label} (${w}x${h}) frames the whole character`, fitsV && fitsH,
    `V ${NEED_H}<=${halfV.toFixed(2)} H ${NEED_W}<=${halfHoriz.toFixed(2)}`)
}

console.log('\n== the character is large enough to be the subject ==')
for (const [label, w, h] of [['iPhone SE', 375, 667], ['iPhone 15', 393, 852], ['laptop', 1440, 900]]) {
  const aspect = w / h
  const dist = Math.max(NEED_H / halfTan, NEED_W / (halfTan * aspect))
  const halfV = halfTan * dist
  const occupancy = (top - bottom) / (halfV * 2)
  t(`${label} fills at least 35% of the viewport height`, occupancy >= 0.35, (occupancy * 100).toFixed(0) + '%')
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
