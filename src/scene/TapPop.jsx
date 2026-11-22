import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The "haptic pop": a soft ring that blooms out of the exact point that was
 * tapped and fades in ~450ms. This is the visual stand-in for a vibration, so
 * the feedback lands on the spot the finger touched rather than on the whole
 * character.
 */
export function TapPop({ state }) {
  const ref = useRef()
  const innerRef = useRef()

  useFrame((_, dt) => {
    const s = state
    s.popAge += dt
    const life = 0.5
    const k = Math.min(s.popAge / life, 1)
    const el = ref.current
    const inner = innerRef.current
    if (!el || !inner) return

    if (k >= 1) {
      el.visible = false
      return
    }

    el.visible = true
    el.position.copy(s.popAt)

    const ease = 1 - Math.pow(1 - k, 3)
    const scale = (0.09 + ease * 0.30) * (0.7 + s.popStrength * 0.5)
    el.scale.setScalar(scale)
    el.material.opacity = (1 - k) * 0.55 * Math.min(s.popStrength, 1.2)
    // Always face the camera-ish plane; the ring reads as a soft bloom.
    el.lookAt(0, 0, 8)

    inner.scale.setScalar(1)
    inner.material.opacity = (1 - k) * (1 - k) * 0.7 * Math.min(s.popStrength, 1.2)
  })

  return (
    <group ref={ref} visible={false}>
      <mesh>
        <ringGeometry args={[0.72, 1.0, 48]} />
        <meshBasicMaterial
          color="#ffd2a1"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={innerRef}>
        <circleGeometry args={[0.9, 40]} />
        <meshBasicMaterial
          color="#fff0d8"
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
