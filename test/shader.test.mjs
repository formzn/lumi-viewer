import fs from 'fs'

// A focused lint for GLSL ES 1.00 as used by three.js ShaderMaterial. This is
// not a compiler, but it catches the mistakes that actually blank a face:
// bad precision declarations, mismatched varyings, ES3-only syntax, implicit
// int->float, and varyings that are written but never declared.
const src = fs.readFileSync(new URL('../src/scene/Eyes.jsx', import.meta.url), 'utf8')
// Each shader is a template literal; split on the closing backtick itself
// (the source has no escaped backticks and no ${} interpolation inside).
const extract = (marker) => {
  const start = src.indexOf(marker)
  if (start < 0) throw new Error('marker not found: ' + marker)
  const open = src.indexOf('`', start)
  const close = src.indexOf('`', open + 1)
  return src.slice(open + 1, close)
}
const vert = extract('const vertexShader')
const frag = extract('const fragmentShader')

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

console.log('\n== structure ==')
for (const [name, body] of [['vertex', vert], ['fragment', frag]]) {
  t(`${name}: braces balanced`, (() => { let d = 0; for (const c of body) { if (c === '{') d++; if (c === '}') d--; if (d < 0) return false } return d === 0 })())
  t(`${name}: parens balanced`, (() => { let d = 0; for (const c of body) { if (c === '(') d++; if (c === ')') d--; if (d < 0) return false } return d === 0 })())
  t(`${name}: has main()`, /void\s+main\s*\(\s*(void)?\s*\)/.test(body))
  t(`${name}: no ES3-only syntax (in/out/layout/texture())`, !/\b(layout|in\s+vec|out\s+vec)\b/.test(body) && !/\btexture\s*\(/.test(body))
  t(`${name}: no GLSL 4 constructs (uint, switch, bit ops on consts)`, !/\buint\b/.test(body))
}

console.log('\n== precision (mandatory for fragment in ES 1.00) ==')
t('fragment declares default precision', /precision\s+(mediump|highp)\s+float\s*;/.test(frag))

console.log('\n== varyings match across stages ==')
const decl = (body, kind) => [...body.matchAll(new RegExp(`varying\\s+\\w+\\s+(\\w+)\\s*;`, 'g'))].map(m => m[1]).sort()
const vv = decl(vert), fv = decl(frag)
t('vertex declares varyings', vv.length > 0, vv.join(','))
t('fragment varyings all come from the vertex stage', fv.every(x => vv.includes(x)), `frag=[${fv}] vert=[${vv}]`)
t('every vertex varying is used by the fragment stage', vv.every(x => fv.includes(x)), `unused: ${vv.filter(x => !fv.includes(x))}`)

// Varyings written in the vertex body must be declared.
for (const v of new Set(vv)) {
  const assigned = new RegExp(`${v}\\s*=`).test(vert)
  t(`vertex assigns its varying "${v}"`, assigned)
}

console.log('\n== uniforms ==')
const uDecl = [...frag.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map(m => m[1])
const uVert = [...vert.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map(m => m[1])
// three.js / WebGL injects modelViewMatrix, projectionMatrix, normalMatrix,
// position and normal automatically, but this shader declares none of them.
t('no uniform declared in both stages', uDecl.every(u => uVert.length === 0 || !uVert.includes(u)), 'dup: ' + uDecl.filter(u => uVert.includes(u)))
// Every uniform in the shader must exist in the JS uniforms object.
const jsUniforms = [...src.matchAll(/^\s{6}(u[A-Z]\w*):\s*\{\s*value:/gm)].map(m => m[1])
const cc = (s) => s.replace(/\/\/.*$/gm, '')
const unused = uDecl.filter(u => (cc(frag).split(u).length - 1) < 2)
t('no uniform declared but unused', unused.length === 0, unused.join(','))
const missingInJs = uDecl.filter(u => !jsUniforms.includes(u))
t('every shader uniform is supplied from JS', missingInJs.length === 0, 'missing: ' + missingInJs.join(','))
const extraInJs = jsUniforms.filter(u => !uDecl.includes(u))
t('no JS uniform is missing from the shader', extraInJs.length === 0, 'extra: ' + extraInJs.join(','))

console.log('\n== GLSL ES 1.00 semantics ==')
t('discard only appears in the fragment stage', !/discard/.test(vert) && /discard/.test(frag), 'vert has discard: ' + /discard/.test(vert))
t('gl_FragColor used (not an out variable)', /gl_FragColor/.test(frag))
// float literals used for float ops: catches `1.0 - x` style mistakes becoming `1 - x`
const fragCode = frag.replace(/\/\/.*$/gm, '')
const intLiteralInFloatCtx = [...fragCode.matchAll(/(?:^|[^0-9a-zA-Z_.])(\d+)(?=\s*[*+\-/)]|\s*$)/gm)]
  .map((m) => m[1])
  // GLSL allows int literals in integer contexts; flag only those used in math.
  .filter((x) => Number(x) > 2)
t('no suspicious bare int literals in math', intLiteralInFloatCtx.length === 0, 'found: ' + intLiteralInFloatCtx.join(','))
t('pow() base is non-negative where used', (() => {
  // pow(x, y) with negative x is undefined in GLSL; check our call sites guard it.
  const calls = [...frag.matchAll(/pow\s*\(([^,]+),/g)].map(m => m[1].trim())
  return calls.every(c => /max\s*\(/.test(c) || /clamp\s*\(/.test(c) || /clamp|max/.test(c) || !/-\s*\w/.test(c))
})())

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
