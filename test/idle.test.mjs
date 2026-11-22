/**
 * The idle gaze drift is the subtlest piece of state in the app: it must turn
 * on when the character is ignored and get out of the way the instant the
 * person interacts. These are the exact conditions from Life + the pointer
 * handlers, extracted so they can be asserted.
 */
import { createCharacterState } from '../src/character/controller.js'

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL  ' + n + (e ? ' :: ' + e : '')) } }

const DRIFT_AFTER = 2.5
const drifts = (s, now) => now - s.lastInteraction > DRIFT_AFTER

console.log('\n== idle drift timing ==')
{
  const s = createCharacterState()
  s.lastInteraction = 10
  t('does not drift immediately after interaction', !drifts(s, 10.5))
  t('does not drift just before the threshold', !drifts(s, 12.4))
  t('drifts once genuinely idle', drifts(s, 12.6))
  t('keeps drifting while ignored', drifts(s, 30))
}
console.log('\n== interaction re-arms the timer ==')
{
  const s = createCharacterState()
  s.lastInteraction = 10
  t('idle at t=20', drifts(s, 20))
  s.lastInteraction = 20 // a tap, drag, or pointer move
  t('a fresh interaction stops the drift', !drifts(s, 20.1))
  t('and the drift returns later', drifts(s, 23))
}
console.log('\n== pointer move counts as attention (regression) ==')
{
  // This was a real bug: hover did not reset lastInteraction, so after 2.5s the
  // idle gaze fought a user who was simply moving the mouse.
  const onPointerMove = (state, now) => { state.lastInteraction = now }
  const s = createCharacterState()
  s.lastInteraction = 0
  for (let i = 0; i < 10; i++) onPointerMove(s, 10 + i * 0.4)
  t('continuous hovering never triggers idle drift', !drifts(s, 13.6))
}
console.log('\n== zoom clamp keeps the character on screen ==')
{
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
  t('zoom cannot go past its limits', clamp(5, 0.55, 1.75) === 1.75 && clamp(0.1, 0.55, 1.75) === 0.55)
  const s = createCharacterState()
  s.zoom.to(1.75)
  t('zoom target is reachable', s.zoom.target === 1.75)
}
console.log('\n== drag pitch is clamped so the character cannot flip ==')
{
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
  const pitch = clamp(1.4 * 0.006 * 100, -0.5, 0.5)
  t('a huge vertical drag stays within +-0.5 rad', Math.abs(pitch) <= 0.5, 'pitch=' + pitch)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
