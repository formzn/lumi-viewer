import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SPEC } from '../character/spec.js'
import { damp } from '../lib/spring.js'

/**
 * The face's expressions, drawn on a shell wrapped around the black sphere.
 *
 * Why a shader instead of swapping textures: every expression is a continuous
 * parameter (arc depth, span, thickness, scale), so a blink can morph into a
 * smile and then into peacefully closed eyes without a single visible pop. The
 * arcs are masked to the front hemisphere, so the back and sides of the sphere
 * stay plain exactly like the reference sheet.
 */
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uCurve;   // arc height, radians. near 0 = eyes closed
  uniform float uSpan;    // arc half-span, radians
  uniform float uThick;   // stroke half-width, radians
  uniform float uGlow;    // halo strength
  uniform float uAlpha;   // overall opacity
  uniform float uY0;      // eye height on the sphere
  uniform float uYaw;     // eye separation from centre
  uniform float uScale;   // whole-eye scale (the "widen" reaction)
  uniform vec3  uColor;   // core colour
  uniform vec3  uHalo;    // halo colour

  varying vec3 vNormal;
  varying vec3 vPos;

  // Distance field for one smile arc, tapering toward its ends.
  float arcField(vec2 p, float span, float curve, float thick) {
    float x = clamp(p.x / span, -1.0, 1.0);
    float inside = 1.0 - smoothstep(0.9, 1.0, abs(p.x / span));
    float yArc = curve * (1.0 - x * x);
    float dist = abs(p.y - yArc);
    float taper = mix(1.0, 0.42, abs(x));
    float core = 1.0 - smoothstep(0.0, thick * taper, dist);
    float halo = pow(max(0.0, 1.0 - dist / (thick * taper * 4.5)), 2.0);
    return (core + halo * 0.5 * uGlow) * inside;
  }

  void main() {
    // Cheap reject for the back of the sphere.
    if (vNormal.z < 0.02) discard;

    vec3 n = normalize(vPos);
    vec2 p = vec2(atan(n.x, n.z), asin(clamp(n.y, -1.0, 1.0)));
    vec2 q = p * uScale;

    float e = arcField(q - vec2(-uYaw, uY0), uSpan, uCurve, uThick)
            + arcField(q - vec2( uYaw, uY0), uSpan, uCurve, uThick);

    // Softly fade the eyes as they rotate toward the silhouette, so they never
    // look painted onto a flat card.
    float front = smoothstep(0.02, 0.42, vNormal.z);

    if (e <= 0.004) discard;
    if (front <= 0.001) discard;

    vec3 col = mix(uHalo, uColor, clamp(e, 0.0, 1.0));
    gl_FragColor = vec4(col * (0.6 + e * 1.3), clamp(e, 0.0, 1.0) * uAlpha * front);
  }
`

export function Eyes({ state }) {
  const r = SPEC.face.radius * 1.004

  const uniforms = useMemo(
    () => ({
      uCurve: { value: 0.48 },
      uSpan: { value: 0.24 },
      uThick: { value: 0.034 },
      uGlow: { value: 1.0 },
      uAlpha: { value: 1.0 },
      uY0: { value: 0.05 },
      uYaw: { value: 0.33 },
      uScale: { value: 1.0 },
      uColor: { value: new THREE.Color('#fffaf0') },
      uHalo: { value: new THREE.Color('#ffb877') },
    }),
    [],
  )

  useFrame((_, dt) => {
    const u = uniforms
    const s = state
    const blink = Math.max(s.blinkAmount || 0, 0)

    // Target expression.
    let curve = 0.48
    let thick = 0.034
    let span = 0.24
    let scale = 1

    if (s.asleep) {
      curve = 0.058 // nearly flat, softly closed
      thick = 0.028
      span = 0.24
    } else if (s.mood === 'happy') {
      curve = 0.70 // big happy arc
      thick = 0.036
      span = 0.25
    } else if (s.mood === 'alert') {
      curve = 0.50 // rounder, wider eyes
      thick = 0.038
      span = 0.22
      scale = 1.0
    }

    // Two independent channels close the eyes: a blink, and the eyeOpen spring
    // (squint on a head tap, easing shut when falling asleep). They multiply, so
    // a blink during a squint still reads correctly.
    const openState = Math.min(Math.max(state.eyeOpen.value, 0), 1)
    const squint = Math.min(Math.max(state.squint.value, 0), 1.1)
    const open = (1 - blink) * openState * squint
    curve *= 0.05 + 0.95 * open
    thick *= 0.74 + 0.26 * open

    u.uCurve.value = damp(u.uCurve.value, curve, 20, dt)
    u.uThick.value = damp(u.uThick.value, thick, 20, dt)
    u.uSpan.value = damp(u.uSpan.value, span, 15, dt)
    u.uScale.value = damp(u.uScale.value, scale, 15, dt)

    // s.glow rests at 1; only the part above 1 is the reaction pulse.
    const glowBase = s.asleep ? 0.5 : 1.0
    const pulse = Math.min(Math.max(s.glow.value - 1, 0), 1.5)
    u.uGlow.value = damp(u.uGlow.value, glowBase * (1 + pulse * 0.45), 12, dt)
    u.uAlpha.value = damp(u.uAlpha.value, s.asleep ? 0.9 : 1.0, 16, dt)

  })

  return (
    <mesh renderOrder={2} name="face-eyes">
      <sphereGeometry args={[r, 64, 48]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}
