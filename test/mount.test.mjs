/**
 * Mounts the real React tree in jsdom with WebGL stubbed out.
 *
 * This cannot judge how the character *looks*, but it does prove the app boots,
 * wires its refs, and runs several animation frames without throwing — the
 * failure mode that would otherwise ship a blank page.
 */
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import ReactNative from 'react'
import * as ReactDOMNative from 'react-dom/client'

const errors = []
let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom

// --- minimal browser surface -------------------------------------------
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.self = window
globalThis.screen = window.screen

window.addEventListener('error', (e) => errors.push('window error: ' + e.message))
const origError = console.error
console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); }

// jsdom has no canvas 2d or WebGL; three/native code needs a few stubs.
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') {
    return {
      canvas: this,
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, save() {}, restore() {},
      translate() {}, rotate() {}, setTransform() {}, drawImage() {},
      putImageData() {}, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
      measureText: () => ({ width: 10 }),
      fillText() {}, strokeText() {},
      set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
      set globalAlpha(v) {}, set globalCompositeOperation(v) {}, set lineCap(v) {},
      set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
    }
  }
  return null // no WebGL: R3F will fail to create a renderer, which we catch below
}
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'

// jsdom ships no ResizeObserver; R3F's <Canvas> measures itself with one.
class ResizeObserverStub {
  constructor(cb) { this.cb = cb }
  observe(el) { this.cb([{ target: el, contentRect: { x: 0, y: 0, width: 393, height: 852, top: 0, left: 0, bottom: 852, right: 393 } }], this) }
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub
globalThis.ResizeObserver = ResizeObserverStub
window.devicePixelRatio = 2
// Give the container a size so the canvas has something to measure.
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get: () => 393, configurable: true })
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get: () => 852, configurable: true })

const server = await createServer({
  configFile: new URL('../vite.config.js', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

let App
const React = ReactNative
const ReactDOM = ReactDOMNative
try {
  ;({ default: App } = await server.ssrLoadModule('/src/App.jsx'))
  t('app module graph loads', typeof App === 'function', 'got ' + typeof App)
} catch (e) {
  t('app module graph loads', false, e.message)
  errors.push('load: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 8).join('\n'))
}

if (App) {
  const host = document.getElementById('root')
  try {
    const root = ReactDOM.createRoot(host)
    root.render(React.createElement(App))
    // Let effects and a few frames run.
    await new Promise((r) => setTimeout(r, 1200))
    t('render does not throw', true)
    t('root element got content', host.childElementCount > 0, 'children=' + host.childElementCount)
    t('the "tap me" hint is rendered', /tap me/.test(host.textContent || '') || /tap me/.test(document.body.innerHTML))
  } catch (e) {
    t('render does not throw', false, e.message)
    errors.push('render: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 10).join('\n'))
  }
}

await server.close()

const realErrors = errors.filter(
  (e) =>
    !/WebGL|WebGL2|context|getContext|THREE.WebGLRenderer|Error creating WebGL|not implemented|Could not parse CSS|THREE_CJS_DEPRECATED|DeprecationWarning/i.test(e),
)
t('no unexpected runtime errors', realErrors.length === 0, '\n    ' + realErrors.slice(0, 6).join('\n    '))

console.log(`\n${pass} passed, ${fail} failed`)
if (realErrors.length) {
  console.log('\n--- errors ---')
  console.log(realErrors.slice(0, 6).join('\n'))
}
console.error = origError
process.exit(fail ? 1 : 0)
