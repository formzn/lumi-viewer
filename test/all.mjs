// Runs every test file and reports a single summary.
import { spawnSync } from 'child_process'
const files = ['logic', 'interactions', 'geometry', 'shader', 'eyeshape', 'framing', 'hittest', 'idle', 'mount', 'preview']
let failed = []
for (const f of files) {
  const r = spawnSync(process.execPath, [`test/${f}.test.mjs`], { encoding: 'utf8' })
  const out = (r.stdout || '') + (r.stderr || '')
  const m = out.match(/(\d+) passed, (\d+) failed/)
  const ok = r.status === 0
  if (!ok) failed.push(f)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(14)} ${m ? m[1] + ' passed' : ''}`)
  if (!ok) console.log(out.split('\n').filter(l => /FAIL|Error|error/.test(l)).slice(0, 8).join('\n'))
}
console.log(failed.length ? `\n${failed.length} suite(s) failing: ${failed.join(', ')}` : '\nAll suites pass.')
process.exit(failed.length ? 1 : 0)
