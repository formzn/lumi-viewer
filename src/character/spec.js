import * as THREE from 'three'

/**
 * Character proportions, measured off the 4-view reference sheet.
 *
 * Two teardrops stacked ~2:1 (height : width). Everything is procedurally
 * generated, so these are the only "source assets" the character has.
 */
export const SPEC = {
  hood: {
    // Height of the generated lathe before scaling (profile spans ~1.71 units)
    // Broad and rounded at the bottom, tapering to a genuine point at the top.
    profile: [
      [0.000, 1.000],
      [0.018, 0.975],
      [0.048, 0.940],
      [0.090, 0.895],
      [0.150, 0.838],
      [0.240, 0.762],
      [0.345, 0.668],
      [0.452, 0.562],
      [0.548, 0.448],
      [0.620, 0.330],
      [0.665, 0.212],
      [0.692, 0.098],
      [0.700, -0.020],
      [0.690, -0.140],
      [0.640, -0.265],
      [0.545, -0.395],
      [0.420, -0.520],
      [0.270, -0.625],
      [0.115, -0.692],
      [0.000, -0.710],
    ],
    scale: 0.62,
    // The hood is a leaf seen edge-on: broad across the front, slim from the
    // side. Depth is a fraction of width, matching the reference's side view.
    depth: 0.78,
    tipLean: 0.30, // how far the point tips backwards
    position: [0, 0.22, 0],
    tilt: -0.06,
  },
  face: {
    radius: 0.345,
    position: [0, 0.155, 0.175],
    eyeYaw: 0.30,
    eyePitch: 0.075,
  },
  body: {
    profile: [
      [0.000, 0.500],
      [0.160, 0.495],
      [0.300, 0.460],
      [0.400, 0.390],
      [0.450, 0.290],
      [0.470, 0.160],
      [0.455, 0.000],
      [0.410, -0.140],
      [0.330, -0.270],
      [0.220, -0.380],
      [0.100, -0.455],
      [0.000, -0.500],
    ],
    scale: [0.60, 0.575, 0.60],
    position: [0, -0.52, 0],
    button: {
      position: [0.082, -0.335, 0.238],
      radius: 0.043,
    },
  },
  orbs: {
    // 6 orbs across 3 gyroscope rings, matching the reference palette
    palette: {
      purple: '#a163ff',
      lavender: '#c9a6ff',
      blue: '#79b4ff',
      pink: '#ff96d2',
      coral: '#ff8355',
    },
    layout: [
      { color: 'purple', size: 0.075, ring: 0, angle: 2.35, speed: 0.34, dir: 1 },
      { color: 'coral', size: 0.042, ring: 0, angle: 0.55, speed: -0.42, dir: -1 },
      { color: 'lavender', size: 0.052, ring: 1, angle: 4.10, speed: 0.27, dir: 1 },
      { color: 'blue', size: 0.058, ring: 1, angle: 1.35, speed: -0.31, dir: -1 },
      { color: 'pink', size: 0.040, ring: 2, angle: 3.05, speed: 0.45, dir: 1 },
      { color: 'coral', size: 0.048, ring: 2, angle: 5.30, speed: -0.24, dir: -1 },
    ],
    rings: [
      { radius: 0.74, rotation: [0.42, 0.2, 0.34] },
      { radius: 0.66, rotation: [-0.55, -0.35, 1.05] },
      { radius: 0.80, rotation: [1.16, 0.65, -0.28] },
    ],
    ringTube: 0.0055,
  },
  palette: {
    glassTint: '#c07a45',
    glassAttenuation: '#8f4a26',
    rim: '#ffb066',
    face: '#08060a',
    body: '#f0e3d2',
    bodyShade: '#d9c4ae',
    button: '#e8703f',
    eye: '#fff2d8',
    gold: '#d9a45f',
  },
}

/**
 * Lathe geometry from a [radius, y] profile.
 *
 * The profile is resampled with a monotone cubic rather than a plain Catmull-Rom
 * spline: a Catmull-Rom overshoots near the single sharp control point at the
 * apex and rounds the point off into a dome, which is the one thing that must
 * not happen to a teardrop hood.
 */
export function latheFromProfile(profile, segments = 72, samples = 170) {
  const pts = monotoneProfile(profile, samples)
  const geo = new THREE.LatheGeometry(pts, segments)
  geo.computeVertexNormals()
  return geo
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) over the profile, so the curve
 * never overshoots and the apex stays a true point.
 */
function monotoneProfile(profile, samples) {
  const n = profile.length
  const xs = profile.map((p) => p[1]) // y descending -> we interpolate r as f(y)
  const ys = profile.map((p) => p[0])

  // Fritsch-Carlson tangents, computed on the y axis.
  const d = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i]
    d[i] = h === 0 ? 0 : (ys[i + 1] - ys[i]) / h
  }
  const m = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0
    else m[i] = (d[i - 1] + d[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      m[i] = tau * a * d[i]
      m[i + 1] = tau * b * d[i]
    }
  }

  const out = []
  for (let sIdx = 0; sIdx < samples; sIdx++) {
    // Sample evenly across the profile's arc-ish parameter, then evaluate.
    const u = (sIdx / (samples - 1)) * (n - 1)
    const i = Math.min(Math.floor(u), n - 2)
    const t = u - i
    const h = xs[i + 1] - xs[i]
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const y = h00 * xs[i] + h10 * h * m[i] + h01 * xs[i + 1] + h11 * h * m[i + 1]
    const r = h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
    out.push(new THREE.Vector2(Math.max(0, r), y))
  }
  // Guarantee an exactly closed apex.
  out[0].x = 0
  out[out.length - 1].x = 0
  return out
}

/** Bend the pointed tip of the hood backwards so it reads as a leaf/hood. */
export function leanTip(geo, amount) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > 0) {
      const t = y / 1.0
      pos.setZ(i, pos.getZ(i) + amount * t * t)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export function buildHoodGeometry() {
  const g = latheFromProfile(SPEC.hood.profile, 96, 180)
  g.scale(SPEC.hood.scale, SPEC.hood.scale, SPEC.hood.scale * SPEC.hood.depth)
  leanTip(g, SPEC.hood.tipLean)
  g.computeVertexNormals()
  return g
}

export function buildBodyGeometry() {
  const g = latheFromProfile(SPEC.body.profile, 80, 150)
  g.scale(...SPEC.body.scale)
  g.computeVertexNormals()
  return g
}
