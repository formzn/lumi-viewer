import {
  createCharacterState, tapHead, tapBody, tapOrb, doubleTap, tapEmpty,
  startSleep, wake, MOODS,
} from '../src/character/controller.js'

let pass = 0, fail = 0
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')) }
}
const peakOf = (spring, frames = 400, dt = 1/60) => {
  let peak = 0
  const start = spring.value
  for (let i = 0; i < frames; i++) { spring.step(dt); peak = Math.max(peak, Math.abs(spring.value - start)) }
  return peak
}

console.log('\n== tap feedback is VISIBLE (not a 1% twitch) ==')
{
  const s = createCharacterState()
  tapHead(s, 10, { x: 0, y: 0.2, z: 0.4 })
  const sq = peakOf(s.squash)
  t('head tap squashes >= 15%', sq >= 0.15, 'peak=' + sq.toFixed(3))
  t('head tap pops a ring at the spot', s.popAge === 0 && s.popAt.z === 0.4)
  t('head tap sets happy mood', s.mood === MOODS.happy)
}
{
  const s = createCharacterState()
  tapBody(s, 10, { x: 0, y: -0.5, z: 0.2 })
  const wob = peakOf(s.wobble)
  const sq = peakOf(s.squash)
  t('body tap wobbles', wob > 0.4, 'wobble peak=' + wob.toFixed(3))
  t('body tap squashes more than head', sq >= 0.2, 'peak=' + sq.toFixed(3))
}
{
  const s = createCharacterState()
  tapOrb(s, 2)
  const f = peakOf(s.orbFlash[2])
  const spin = peakOf(s.orbSpin[2])
  t('orb tap flashes bright', f > 0.3, 'flash=' + f.toFixed(3))
  t('orb tap spins fast', spin > 0.4, 'spin=' + spin.toFixed(3))
  t('other orbs unaffected', s.orbFlash[0].value === 0 && s.orbFlash[0].velocity === 0)
}
{
  const s = createCharacterState()
  doubleTap(s, 10, { x: 0, y: 0, z: 0.5 })
  const spin = peakOf(s.spin)
  t('double tap completes at least a full 360° turn', spin >= Math.PI * 2, 'spin=' + ((spin * 180) / Math.PI).toFixed(0) + '°')
}
console.log('\n== sleep / wake ==')
{
  const s = createCharacterState()
  startSleep(s)
  t('sleep sets asleep + mood', s.asleep === true && s.mood === MOODS.sleep)
  wake(s, 20)
  t('wake clears asleep', s.asleep === false && s.mood === MOODS.alert)
  t('wake has a look-at-you reaction', s.eyeOpen.velocity > 0)
}
console.log('\n== eye channels are independent (regression) ==')
{
  // A head tap squints on the `squint` channel; the idle loop drives `eyeOpen`.
  // They must not be able to overwrite each other.
  const s = createCharacterState()
  tapHead(s, 10, null)
  let minSquint = 99
  for (let i = 0; i < 180; i++) {
    s.squint.to(1)
    s.squint.step(1 / 60)
    s.eyeOpen.to(1)
    s.eyeOpen.step(1 / 60)
    minSquint = Math.min(minSquint, s.squint.value)
  }
  t('a head tap visibly closes the eyes', minSquint < 0.35, 'dipped to ' + minSquint.toFixed(2))
  t('the eyes reopen afterwards', Math.abs(s.squint.value - 1) < 0.02)
  t('the idle loop does not cancel the squint', Math.abs(s.eyeOpen.value - 1) < 0.02)
}
{
  const s = createCharacterState()
  startSleep(s)
  for (let i = 0; i < 300; i++) { s.eyeOpen.to(0); s.eyeOpen.step(1 / 60, { stiffness: 60, damping: 14 }) }
  t('sleeping closes the eyes fully', Math.abs(s.eyeOpen.value) < 0.02)
}

console.log('\n== every reaction settles (no runaway) ==')
{
  const s = createCharacterState()
  tapHead(s, 10, { x: 0, y: 0, z: 0 })
  doubleTap(s, 11, null)
  tapBody(s, 12, null)
  for (const i of [0, 1, 2, 3, 4, 5]) tapOrb(s, i)
  for (let f = 0; f < 1800; f++) {
    for (const k of ['squash','wobble','spin','floatY','orbBurst','glow','bodyTiltX','bodyTiltZ','headTiltX','headTiltZ']) s[k].step(1/60)
    for (let i = 0; i < 6; i++) { s.orbFlash[i].step(1/60); s.orbSpin[i].step(1/60) }
  }
  // `glow` and `breath` rest at 1, everything else at 0.
  let ok = true
  for (const k of ['squash','wobble','spin','floatY','orbBurst','bodyTiltX','bodyTiltZ']) {
    if (!Number.isFinite(s[k].value) || Math.abs(s[k].value) > 0.01) { ok = false; console.log('    ' + k + ' = ' + s[k].value) }
  }
  if (Math.abs(s.glow.value - 1) > 0.01) { ok = false; console.log('    glow = ' + s.glow.value) }
  t('all springs return to rest after a burst of taps', ok)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
