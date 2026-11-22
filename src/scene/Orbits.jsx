import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SPEC } from '../character/spec.js'
import { makeGlowTexture } from '../lib/textures.js'
import { clamp } from '../lib/spring.js'

/**
 * Five to six glass beads riding thin golden rings around the hood, in a loose
 * gyroscope: three rings, each tilted differently, each turning at its own
 * speed and direction. The beads are part of the character — they inherit its
 * float, squash and spin — but each has its own bob and pulse.
 */
export function Orbits({ state }) {
  const { rings, layout, palette, ringTube } = SPEC.orbs

  const glowTex = useMemo(() => makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(255,235,215,0.30)'), [])

  const ringRefs = useRef([])
  const groupRefs = useRef([])
  const orbRefs = useRef([])
  const haloRefs = useRef([])

  const ringGeos = useMemo(
    () =>
      rings.map(
        (r) =>
          new THREE.TorusGeometry(r.radius, ringTube, 8, 160),
      ),
    [ringTube, rings],
  )

  // Per-orb static random phase offsets so bobbing is not synchronised.
  const phases = useMemo(
    () => layout.map((_, i) => ({ bob: i * 1.7 + 0.4, pulse: i * 2.3 })),
    [layout],
  )

  const tmpColor = useMemo(() => new THREE.Color(), [])
  const ringColor = useMemo(() => new THREE.Color(SPEC.palette.gold), [])

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime
    const s = state
    const burst = s.orbBurst.value
    const asleep = s.sleepAmount.value

    // Rings turn and tilt continuously; the tilt wanders so the whole
    // constellation slowly re-configures itself.
    rings.forEach((ring, i) => {
      const g = groupRefs.current[i]
      if (!g) return
      const dir = i % 2 === 0 ? 1 : -1
      g.rotation.z = ring.rotation[2] + t * 0.055 * dir
      g.rotation.y = ring.rotation[1] + t * 0.038 * -dir
      g.rotation.x =
        ring.rotation[0] + Math.sin(t * 0.21 + i * 1.9) * 0.16 + burst * 0.05 * dir

      const mat = ringRefs.current[i]
      if (mat) {
        mat.opacity = (0.34 + Math.sin(t * 0.7 + i) * 0.06) * (1 - asleep * 0.35)
      }
    })

    layout.forEach((orb, i) => {
      const g = orbRefs.current[i]
      if (!g) return

      // Continuous orbit, faster when this orb was tapped.
      const spinBoost = s.orbSpin[i].value
      const speed = orb.speed * (1 + spinBoost * 0.55) * (1 - asleep * 0.7)
      const angle = orb.angle + t * speed * orb.dir

      const ring = rings[orb.ring]
      const radius = ring.radius + burst * 0.30 + s.orbFlash[i].value * 0.02
      const bob = Math.sin(t * 1.15 + phases[i].bob) * 0.026 * (1 + burst * 0.5)

      g.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.94 + bob,
        Math.sin(angle * 1.6 + phases[i].pulse) * 0.055,
      )

      // Pulse: breathing scale plus the tap flash.
      const pulse = 1 + Math.sin(t * 1.9 + phases[i].pulse) * 0.045
      const flash = s.orbFlash[i].value
      const scale = pulse * (1 + flash * 0.55) * (0.9 + asleep * 0.1)
      g.scale.setScalar(scale)

      const halo = haloRefs.current[i]
      if (halo) {
        halo.scale.setScalar(scale * (2.4 + flash * 1.9))
        halo.material.opacity = clamp(0.30 + flash * 0.55 + Math.sin(t * 1.9 + phases[i].pulse) * 0.05, 0, 1)
        tmpColor.set(palette[orb.color])
        halo.material.color.copy(tmpColor)
      }

      const mat = g.children[0]?.material
      if (mat) {
        tmpColor.set(palette[orb.color])
        mat.color.copy(tmpColor)
        mat.emissive.copy(tmpColor)
        // flash rests at 0, so the baseline is the 0.55 here.
        mat.emissiveIntensity = 0.55 + flash * 2.6 + Math.sin(t * 2.4 + phases[i].pulse) * 0.12
      }

      s.orbSpin[i].step(dt)
      s.orbFlash[i].step(dt)
    })
  })

  return (
    <group>
      {rings.map((ring, i) => (
        <group
          key={`ring-${i}`}
          ref={(el) => (groupRefs.current[i] = el)}
          rotation={ring.rotation}
        >
          <mesh geometry={ringGeos[i]} renderOrder={1}>
            <meshBasicMaterial
              ref={(m) => (ringRefs.current[i] = m)}
              color={ringColor}
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Beads live outside the ring groups so their bob and burst radius are
          independent of each ring's tilt — they still read as riding the rings
          because their radius matches it. */}
      {layout.map((orb, i) => (
        <group
          key={`orb-${i}`}
          ref={(el) => (orbRefs.current[i] = el)}
          userData={{ orb: i }}
        >
          <mesh>
            <sphereGeometry args={[orb.size, 24, 18]} />
            <meshStandardMaterial
              color={palette[orb.color]}
              emissive={palette[orb.color]}
              emissiveIntensity={0.6}
              roughness={0.12}
              metalness={0.0}
              toneMapped={false}
            />
          </mesh>
          <sprite ref={(el) => (haloRefs.current[i] = el)} scale={2.4}>
            <spriteMaterial
              map={glowTex}
              color={palette[orb.color]}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  )
}
