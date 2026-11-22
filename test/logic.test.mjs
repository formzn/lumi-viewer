// Node-side smoke tests for logic that doesn't need a GPU.
import * as THREE from 'three'
import { Spring, damp, clamp, seeded, smoothstep } from '../src/lib/spring.js'

let pass = 0, fail = 0
const t = (name, cond, extra='') => {
  if (cond) { pass++; console.log('  ok   ' + name) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')) }
}

console.log('\n== Spring ==')
{
  const s = new Spring(0, { stiffness: 180, damping: 16 })
  s.to(1)
  let max = -Infinity
  for (let i = 0; i < 600; i++) { s.step(1/60); max = Math.max(max, s.value) }
  t('converges to target', Math.abs(s.value - 1) < 0.001, 'value=' + s.value)
  t('no explosive overshoot', max < 1.35, 'max=' + max)
  t('never NaN', Number.isFinite(s.value))
}
{
  const s = new Spring(0, { stiffness: 320, damping: 14 })
  s.impulse(3.4)
  let min = Infinity, max = -Infinity
  for (let i = 0; i < 400; i++) { s.step(1/60); min=Math.min(min,s.value); max=Math.max(max,s.value) }
  t('impulse overshoots then settles', max > 0.05 && Math.abs(s.value) < 0.01, 'max='+max+' end='+s.value)
}
{
  // Frame-rate independence: same time, different dt -> similar result.
  const a = new Spring(0, { stiffness: 120, damping: 16 }); a.to(1)
  const b = new Spring(0, { stiffness: 120, damping: 16 }); b.to(1)
  for (let i = 0; i < 60; i++) a.step(1/60)
  for (let i = 0; i < 120; i++) b.step(1/120)
  t('frame-rate independent', Math.abs(a.value - b.value) < 0.02, a.value.toFixed(4)+' vs '+b.value.toFixed(4))
}
{
  const s = new Spring(0, { stiffness: 200, damping: 14 })
  s.step(5.0) // a backgrounded tab
  t('huge dt is clamped, stays finite', Number.isFinite(s.value) && Math.abs(s.value) < 50, 'v='+s.value)
}
console.log('\n== helpers ==')
t('damp is monotone toward target', damp(0, 1, 5, 1/60) > 0 && damp(0,1,5,1/60) < 1)
t('clamp', clamp(5, 0, 1) === 1 && clamp(-5, 0, 1) === 0)
t('smoothstep edges', smoothstep(0,1,0)===0 && smoothstep(0,1,1)===1)
{
  const a = seeded(42), b = seeded(42)
  t('seed is deterministic', a() === b() && a() === b())
  const r = seeded(7); let ok = true
  for (let i=0;i<1000;i++){const v=r(); if(v<0||v>=1) ok=false}
  t('seed stays in [0,1)', ok)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
