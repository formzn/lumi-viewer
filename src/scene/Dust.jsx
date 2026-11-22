import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeGlowTexture } from '../lib/textures.js'
import { seeded } from '../lib/spring.js'

/**
 * Slow drifting motes in the warm air. Two depth layers so there is always
 * something moving at the edge of vision without competing with the character.
 */
export function Dust({ count = 130 }) {
  const geoRef = useRef()
  const glow = useMemo(
    () => makeGlowTexture('rgba(255,240,220,0.95)', 'rgba(255,190,130,0.22)'),
    [],
  )

  const { positions, meta } = useMemo(() => {
    const rnd = seeded(20261122)
    const positions = new Float32Array(count * 3)
    const meta = []
    for (let i = 0; i < count; i++) {
      // Spread wide, but denser around the character.
      const radius = 1.1 + Math.pow(rnd(), 0.65) * 5.2
      const angle = rnd() * Math.PI * 2
      const y = (rnd() - 0.5) * 5.4
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = Math.sin(angle) * radius - 1.5
      meta.push({
        baseX: positions[i * 3],
        baseY: y,
        baseZ: positions[i * 3 + 2],
        rise: 0.02 + rnd() * 0.055,
        sway: 0.06 + rnd() * 0.16,
        phase: rnd() * Math.PI * 2,
        speed: 0.35 + rnd() * 0.8,
        size: 0.012 + Math.pow(rnd(), 2) * 0.05,
      })
    }
    return { positions, meta }
  }, [count])

  const pointsRef = useRef()

  useFrame((st) => {
    const t = st.clock.elapsedTime
    const attr = pointsRef.current?.geometry?.attributes?.position
    if (!attr) return
    for (let i = 0; i < count; i++) {
      const m = meta[i]
      const y = m.baseY + ((t * m.rise + m.phase * 0.1) % 1.0) * 2.4 - 1.2
      attr.array[i * 3] = m.baseX + Math.sin(t * m.speed * 0.6 + m.phase) * m.sway
      attr.array[i * 3 + 1] = y
      attr.array[i * 3 + 2] = m.baseZ + Math.cos(t * m.speed * 0.5 + m.phase) * m.sway
    }
    attr.needsUpdate = true
    if (pointsRef.current) {
      pointsRef.current.material.opacity = 0.5 + Math.sin(t * 0.35) * 0.08
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glow}
        color="#ffd9ab"
        size={0.075}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
