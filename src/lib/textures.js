import * as THREE from 'three'

const SIZE = 256

function canvas(size = SIZE) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return c
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/**
 * One curved happy eye. Shape is a smile-arc: an upside-down U, i.e. the ends
 * curve downwards. `curve` controls how deep the U is, `width` its span.
 */
function drawEye(ctx, { curve = 0.42, span = 0.62, thickness = 0.115, glow = 1 }) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  const w = SIZE * span
  const h = SIZE * curve
  const lw = SIZE * thickness

  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.lineCap = 'round'
  ctx.globalCompositeOperation = 'lighter'

  const path = () => {
    ctx.beginPath()
    ctx.moveTo(cx - w / 2, cy + h / 2)
    ctx.quadraticCurveTo(cx, cy - h / 2, cx + w / 2, cy + h / 2)
  }

  // Soft bloom layers, then a hot core.
  const layers = [
    { lw: lw * 5.0, a: 0.05 * glow, color: '#ffb066' },
    { lw: lw * 3.0, a: 0.11 * glow, color: '#ffc98a' },
    { lw: lw * 1.9, a: 0.26 * glow, color: '#ffe6bf' },
    { lw: lw * 1.15, a: 0.72 * glow, color: '#fff6e6' },
    { lw: lw * 0.62, a: 1.0, color: '#ffffff' },
  ]
  for (const layer of layers) {
    ctx.lineWidth = layer.lw
    ctx.strokeStyle = layer.color
    ctx.globalAlpha = layer.a
    path()
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** A flat, softly-glowing line — used when the character sleeps. */
function drawSleepEye(ctx) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.lineCap = 'round'
  ctx.globalCompositeOperation = 'lighter'
  for (const [lw, a, col] of [
    [SIZE * 0.5, 0.06, '#ffb066'],
    [SIZE * 0.28, 0.16, '#ffc98a'],
    [SIZE * 0.14, 0.5, '#ffeccd'],
    [SIZE * 0.075, 0.95, '#fffaf0'],
  ]) {
    ctx.lineWidth = lw
    ctx.strokeStyle = col
    ctx.globalAlpha = a
    ctx.beginPath()
    ctx.moveTo(cx - SIZE * 0.28, cy)
    ctx.quadraticCurveTo(cx, cy + SIZE * 0.055, cx + SIZE * 0.28, cy)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Eye expression set. Generated once, swapped by reference. */
export function makeEyeTextures() {
  const out = {}

  const idle = canvas()
  drawEye(idle.getContext('2d'), { curve: 0.40, span: 0.60, thickness: 0.105 })
  out.idle = toTexture(idle)

  const happy = canvas()
  drawEye(happy.getContext('2d'), {
    curve: 0.58,
    span: 0.66,
    thickness: 0.115,
    glow: 1.15,
  })
  out.happy = toTexture(happy)

  // Wide-eyed: taller, taller-curved arcs read as "eyes open"
  const alert = canvas()
  drawEye(alert.getContext('2d'), {
    curve: 0.72,
    span: 0.52,
    thickness: 0.135,
    glow: 1.2,
  })
  out.alert = toTexture(alert)

  const blink = canvas()
  drawEye(blink.getContext('2d'), {
    curve: 0.16,
    span: 0.56,
    thickness: 0.085,
    glow: 0.8,
  })
  out.blink = toTexture(blink)

  const sleep = canvas()
  drawSleepEye(sleep.getContext('2d'))
  out.sleep = toTexture(sleep)

  return out
}

/** Soft circular glow sprite for orbs, rim bloom and the dust particles. */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,180,0.35)') {
  const c = canvas()
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.22, inner)
  g.addColorStop(0.45, mid)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
  return toTexture(c)
}

/**
 * The warm studio backdrop: a radial gradient that keeps the centre slightly
 * lighter than the corners, matching the reference sheet's plate.
 */
export function makeBackgroundTexture() {
  const c = canvas(1024)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(
    512,
    420,
    40,
    512,
    512,
    720,
  )
  g.addColorStop(0, '#3a2318')
  g.addColorStop(0.32, '#24140d')
  g.addColorStop(0.66, '#170d08')
  g.addColorStop(1, '#0d0604')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1024, 1024)

  // Faint vignette grain so flat areas never band on 8-bit phone screens.
  const img = ctx.getImageData(0, 0, 1024, 1024)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 5
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)

  return toTexture(c)
}

/** Equirectangular environment: warm key, cool bounce, dim floor. */
export function makeEnvironmentTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')

  const base = ctx.createLinearGradient(0, 0, 0, 256)
  base.addColorStop(0, '#2a1a12')
  base.addColorStop(0.45, '#1a0f09')
  base.addColorStop(1, '#0a0503')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 512, 256)

  const blob = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.globalCompositeOperation = 'source-over'
  }

  // Key light, upper front-left (matches the highlight on the hood)
  blob(150, 70, 130, 'rgba(255,214,170,0.95)')
  // Cool sky bounce
  blob(330, 30, 150, 'rgba(150,190,255,0.30)')
  // Warm fill from the right
  blob(430, 120, 120, 'rgba(255,150,90,0.34)')
  // Soft floor bounce
  blob(256, 240, 160, 'rgba(180,120,80,0.22)')

  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
