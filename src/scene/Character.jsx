import { useMemo, useRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshTransmissionMaterial } from '@react-three/drei'
import { SPEC, buildHoodGeometry, buildBodyGeometry } from '../character/spec.js'
import { Eyes } from './Eyes.jsx'
import { Orbits } from './Orbits.jsx'
import { clamp, damp } from '../lib/spring.js'

/**
 * The character. Two teardrops: a glass hood with a black sphere floating
 * inside it, and a matte cream body below, ringed by glass beads.
 *
 * Everything animates by mutating object3D transforms inside useFrame —
 * no React re-renders while the character is alive.
 */
export const Character = ({ state, ref: forwarded, quality }) => {
  const rootRef = useRef()
  const innerRef = useRef()
  const hoodRef = useRef()
  const hoodMeshRef = useRef()
  const faceRef = useRef()
  const bodyRef = useRef()
  const buttonRef = useRef()
  const bodyGlowRef = useRef()
  const rimRef = useRef()

  const hoodGeo = useMemo(() => buildHoodGeometry(), [])
  const bodyGeo = useMemo(() => buildBodyGeometry(), [])

  const bodyMatRef = useRef()
  const buttonMatRef = useRef()

  useImperativeHandle(forwarded, () => ({
    // Groups exposed for hit-testing in the scene.
    hood: hoodMeshRef,
    face: faceRef,
    body: bodyRef,
  }))

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime
    const s = state

    // --- idle: float + breathe ------------------------------------------
    const idleFade = 1 - s.sleepAmount.value * 0.65
    const float = Math.sin(t * 1.05) * 0.045 * idleFade
    s.floatY.step(dt)
    s.breath.step(dt)
    s.squash.step(dt)
    s.wobble.step(dt)
    s.spin.step(dt)
    s.headTiltX.step(dt)
    s.headTiltZ.step(dt)
    s.bodyTiltX.step(dt)
    s.bodyTiltZ.step(dt)
    s.orbBurst.step(dt)
    s.glow.step(dt)
    s.sleepAmount.step(dt)

    const root = rootRef.current
    if (!root) return

    // Whole-character placement: float, plus the gesture spin.
    root.position.y = float + s.floatY.value * 0.055
    root.rotation.y = s.dragYaw + s.autoYaw + s.spin.value
    root.rotation.x = s.dragPitch * 0.55

    // Squash & stretch. Volume preserving, which is what makes it read as soft
    // rather than as a scale animation.
    const inner = innerRef.current
    if (inner) {
      const sq = clamp(s.squash.value, -0.45, 0.45)
      const breath = 1 + Math.sin(t * 1.6) * 0.012 * idleFade
      const sx = (1 - sq * 0.55) * breath
      const sy = (1 + sq * 0.75) * breath
      const sz = (1 - sq * 0.55) * breath
      inner.scale.set(sx, sy, sz)

      // Jelly wobble travels up the body.
      const wob = s.wobble.value * 0.06
      inner.rotation.z = Math.sin(t * 13) * wob + s.bodyTiltZ.value * 0.12
      inner.rotation.x = Math.sin(t * 11 + 1.2) * wob * 0.6 + s.bodyTiltX.value * 0.10
    }

    // --- head: tilts toward the cursor or finger ------------------------
    const hood = hoodRef.current
    if (hood) {
      const lookYaw = s.lookX * 0.30
      const lookPitch = -s.lookY * 0.16
      const sleeping = s.sleepAmount.value
      const tilt = sleeping * 0.22

      hood.rotation.y = damp(hood.rotation.y, lookYaw + s.headTiltZ.value * 0.10 - tilt, 6, dt)
      hood.rotation.x =
        damp(hood.rotation.x, SPEC.hood.tilt + lookPitch + s.headTiltX.value * 0.08 + sleeping * 0.12, 6, dt)
      hood.rotation.z = damp(hood.rotation.z, lookYaw * 0.22 - sleeping * 0.16, 6, dt)

      // Breathing lifts the head very slightly out of the body.
      hood.position.y = SPEC.hood.position[1] + Math.sin(t * 1.6 + 0.4) * 0.006 * idleFade
    }

    // The face sphere drifts inside the glass — this is what makes the hood
    // feel hollow and the character feel alive.
    if (faceRef.current) {
      const f = faceRef.current
      f.position.x = damp(f.position.x, s.lookX * 0.055, 5, dt)
      f.position.y = damp(f.position.y, SPEC.face.position[1] - s.lookY * 0.04, 5, dt)
      f.position.z = SPEC.face.position[2] + Math.sin(t * 0.9) * 0.004
      f.rotation.y = damp(f.rotation.y, s.lookX * 0.16, 5, dt)
    }

    // Rim light breathes with the character's glow channel. s.glow rests at 1,
    // so the baseline is subtracted to keep the rim at its intended strength
    // until something actually happens.
    if (rimRef.current) {
      const pulse = clamp(s.glow.value - 1, 0, 1.5)
      rimRef.current.material.opacity = 0.30 + pulse * 0.22 + Math.sin(t * 1.3) * 0.03
    }

    // Body material: a touch warmer when happy, cooler when asleep.
    const glowPulse = clamp(s.glow.value - 1, 0, 1.5)
    if (bodyMatRef.current) {
      bodyMatRef.current.emissiveIntensity = damp(
        bodyMatRef.current.emissiveIntensity,
        glowPulse * 0.08,
        8,
        dt,
      )
    }
    if (buttonMatRef.current) {
      buttonMatRef.current.emissiveIntensity = damp(
        buttonMatRef.current.emissiveIntensity,
        0.22 + glowPulse * 0.4,
        10,
        dt,
      )
    }
    if (buttonRef.current) {
      buttonRef.current.scale.setScalar(1 + Math.sin(t * 2.1) * 0.04)
    }
    if (bodyGlowRef.current) {
      bodyGlowRef.current.material.opacity = 0.30 + glowPulse * 0.16
    }
  })

  return (
    <group ref={rootRef} name="character-root">
      <group ref={innerRef} name="character-inner">
        {/* ---------------- BODY ---------------- */}
        <group ref={bodyRef} position={SPEC.body.position} name="hit-body">
          <mesh geometry={bodyGeo} castShadow receiveShadow>
            <meshPhysicalMaterial
              ref={bodyMatRef}
              color={SPEC.palette.body}
              emissive={SPEC.palette.button}
              emissiveIntensity={0}
              roughness={0.62}
              metalness={0}
              clearcoat={0.25}
              clearcoatRoughness={0.55}
              sheen={0.35}
              sheenColor={SPEC.palette.bodyShade}
            />
          </mesh>

          {/* warm bounce where the glass hood meets the body */}
          <mesh ref={bodyGlowRef} position={[0, 0.40, 0.06]} scale={[0.44, 0.14, 0.44]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial
              color="#ffb277"
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          {/* the coral dot on the chest */}
          <mesh
            ref={buttonRef}
            position={SPEC.body.button.position}
            rotation={[0.32, 0.28, 0]}
            name="hit-button"
          >
            <sphereGeometry args={[SPEC.body.button.radius, 24, 18]} />
            <meshStandardMaterial
              ref={buttonMatRef}
              color={SPEC.palette.button}
              emissive={SPEC.palette.button}
              emissiveIntensity={0.25}
              roughness={0.35}
              metalness={0}
            />
          </mesh>
        </group>

        {/* ---------------- HEAD ---------------- */}
        <group ref={hoodRef} position={SPEC.hood.position} name="hit-head">
          {/* the black face sphere, floating inside the glass */}
          <group ref={faceRef} position={SPEC.face.position} name="hit-face">
            <mesh>
              <sphereGeometry args={[SPEC.face.radius, 64, 48]} />
              <meshPhysicalMaterial
                color={SPEC.palette.face}
                roughness={0.08}
                metalness={0.0}
                clearcoat={1}
                clearcoatRoughness={0.05}
                reflectivity={0.7}
                envMapIntensity={1.6}
              />
            </mesh>
            {/* An invisible-ish depth shell so the additive eyes are occluded
                by the black sphere on the far side, the way paint would be. */}
            <mesh renderOrder={1}>
              <sphereGeometry args={[SPEC.face.radius * 1.002, 48, 36]} />
              <meshBasicMaterial colorWrite={false} side={THREE.FrontSide} />
            </mesh>
            <Eyes state={state} />
          </group>

          {/* the glass hood */}
          <mesh ref={hoodMeshRef} geometry={hoodGeo} renderOrder={3}>
            <MeshTransmissionMaterial
              // Samples and buffer resolution are the two knobs that decide
              // whether a phone holds 60fps; the hood still reads as glass at
              // these values because it is lit by the environment map.
              samples={quality.transmissionSamples}
              resolution={quality.transmissionResolution}
              transmission={1}
              thickness={0.42}
              roughness={0.10}
              ior={1.42}
              chromaticAberration={0.09}
              anisotropicBlur={0.35}
              distortion={0.12}
              distortionScale={0.22}
              temporalDistortion={0.04}
              attenuationDistance={1.5}
              attenuationColor={SPEC.palette.glassAttenuation}
              color={SPEC.palette.glassTint}
              specularIntensity={0.85}
              envMapIntensity={1.15}
              backside
              backsideThickness={0.28}
            />
          </mesh>

          {/* thin glowing warm rim, hugging the silhouette */}
          <mesh ref={rimRef} geometry={hoodGeo} scale={1.012} renderOrder={4}>
            <meshBasicMaterial
              color={SPEC.palette.rim}
              transparent
              opacity={0.32}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.BackSide}
              toneMapped={false}
            />
          </mesh>

          <Orbits state={state} />
        </group>
      </group>
    </group>
  )
}
