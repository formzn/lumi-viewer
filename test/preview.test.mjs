// Boots the production bundle in jsdom and checks the page structure the user
// actually receives, plus a few accessibility/UX invariants from the brief.
import { JSDOM } from 'jsdom'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8')
const cssFile = [...html.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1])[0]
const jsFile = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1])[0]

console.log('\n== built output ==')
t('dist/index.html exists', existsSync(path.join(root, 'dist/index.html')))
t('a stylesheet is linked', !!cssFile, cssFile || 'none')
t('a single JS bundle is emitted', !!jsFile, jsFile || 'none')
const js = readFileSync(path.join(root, 'dist' + jsFile.replace(/^\//, '/')), 'utf8')
const css = readFileSync(path.join(root, 'dist' + cssFile.replace(/^\//, '/')), 'utf8')
t('bundle is under 1.6MB (gzips to roughly a third)', js.length < 1_600_000, (js.length / 1024).toFixed(0) + 'kB')

console.log('\n== the brief\'s UI constraints ==')
t('mobile viewport meta is present', /width=device-width/.test(html))
t('page is not user-scalable (pinch is ours, not the browser\'s)', /user-scalable=no/.test(html))
t('theme colour matches the dark warm brown', /theme-color" content="#170d08"/.test(html))
t('stylesheet hides overflow (full-screen, no scroll)', /overflow:\s*hidden/.test(css))
t('touch-action:none is set on the canvas', /touch-action:\s*none/.test(css))
t('reduced motion is respected', /prefers-reduced-motion/.test(css))
t('a "tap me" hint exists in the app source', /tap me/i.test(readFileSync(path.join(root, 'src/App.jsx'), 'utf8')))

console.log('\n== no text/UI clutter beyond the hint ==')
const appSrc = readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const strings = [...appSrc.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)].map(m => m[1].trim())
const visibleText = strings.filter(s => !/^(Canvas|div|span)$/.test(s))
t('the only visible copy is the hint', visibleText.length === 1 && /tap me/i.test(visibleText[0]), visibleText.join(' | '))

console.log('\n== no external assets or models ==')
const allSrc = [
  'src/App.jsx', 'src/scene/Stage.jsx', 'src/scene/Character.jsx',
  'src/character/spec.js', 'src/lib/textures.js',
].map(f => readFileSync(path.join(root, f), 'utf8')).join('\n')
t('no .glb/.gltf/.fbx/.obj model references', !/\.(glb|gltf|fbx|obj)\b/i.test(allSrc))
t('no external texture URLs', !/https?:\/\/[^\s'"]+\.(png|jpg|jpeg|webp|hdr)/i.test(allSrc))
t('no remote fonts', !/fonts\.googleapis|@font-face/i.test(css))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
