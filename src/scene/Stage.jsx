import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Environment } from '@react-three/drei'
import { Character } from './Character.jsx'
import { Dust } from './Dust.jsx'
import { TapPop } from './TapPop.jsx'
import { makeBackgroundTexture, makeEnvironmentTexture } from '../lib/textures.js'
import { damp } from '../lib/spring.js'

/** Studio lighting: warm key, cool sky bounce, coral kicker. */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.35} color="#ffcaa0" />
      <hemisphereLight args={['#ffd0a8', '#2a1108', 0.45]} />

      <directionalLight
        position={[2.6, 3.4, 3.2]}
        intensity={2.1}
        color="#ffd9b0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />

      {/* cool bounce from behind, keeps the glass from going muddy */}
      <directionalLight position={[-3.0, 1.6, -2.4]} intensity={0.85} color="#8fb6ff" />

      {/* warm kicker, right side — the rim that makes the silhouette glow */}
      <pointLight position={[2.2, 0.3, -1.4]} intensity={2.2} color="#ffb27a" distance={7} decay={2} />
      <pointLight position={[-1.5, 1.4, 1.8]} intensity={1.4} color="#ffbe8a" distance={6} decay={2} />
      {/* low fill so the cream body never goes flat black underneath */}
      <pointLight position={[0, -2.2, 1.6]} intensity={2.0} color="#ffb98c" distance={5} decay={2} />
    </>
  )
}

/** The backdrop plate: a full-bleed gradient behind the character. */
function Backdrop() {
  const tex = useMemo(() => makeBackgroundTexture(), [])
  return (
    <mesh position={[0, 0, -6.5]} scale={[26, 26, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * Pointer-follow rig.
 *
 * The head follows the cursor, the whole character drifts its rotation a few
 * degrees, and the camera eases its zoom. Values are damped so a fast flick of
 * the mouse produces a smooth swivel rather than a snap.
 */
function Rig({ state }) {
  const { camera, pointer, size } = useThree()
  const parallax = useRef({ x: 0, y: 0 })

  useFrame((_, dt) => {
    const s = state

    // Cursor -> look, with a little smoothing on both axes.
    s.lookX = damp(s.lookX, s.lookTargetX, 5.5, dt)
    s.lookY = damp(s.lookY, s.lookTargetY, 5.5, dt)

    // Idle drift: if nobody has touched the character, it turns very slowly.
    const idleFor = performance.now() / 1000 - s.lastInteraction
    const idleTurn = idleFor > 3.5 ? Math.min((idleFor - 3.5) * 0.05, 0.34) : 0
    s.autoYaw = damp(s.autoYaw, idleTurn, 0.7, dt)

    // Gesture-driven rotation, spring-eased back toward zero only when the user
    // releases a drag — so the pose stays where they left it.
    s.dragYaw = damp(s.dragYaw, s.dragYawTarget, 9, dt)
    s.dragPitch = damp(s.dragPitch, s.dragPitchTarget, 9, dt)

    // Subtle camera parallax towards the pointer.
    parallax.current.x = damp(parallax.current.x, pointer.x * 0.18, 3.4, dt)
    parallax.current.y = damp(parallax.current.y, pointer.y * 0.12, 3.4, dt)

    // The character is wider than it is tall once the orbit rings are counted,
    // so on a tall phone it is width, not height, that runs out first. Frame on
    // whichever axis is tighter so the rings are never clipped.
    const aspect = size.width / size.height
    const vFov = (camera.fov * Math.PI) / 180
    const halfTan = Math.tan(vFov / 2)

    // Half-extents of the character, in world units, with breathing room.
    // Measured half-extents of the real geometry (hood tip + orbit rings),
    // verified by test/framing.test.mjs so they can't silently drift.
    const NEED_H = 1.06 // vertical half-extent above/below the look-at point
    const NEED_W = 1.10 // horizontal half-extent including the outer ring

    const distForHeight = NEED_H / halfTan
    const distForWidth = NEED_W / (halfTan * aspect)
    const fit = Math.max(distForHeight, distForWidth) / 4.35

    const targetZ = 4.35 * fit * s.zoom.value

    camera.position.x = damp(camera.position.x, parallax.current.x, 4, dt)
    camera.position.y = damp(camera.position.y, 0.32 + parallax.current.y, 4, dt)
    camera.position.z = damp(camera.position.z, targetZ, 5, dt)
    camera.lookAt(0, -0.02, 0)
  })

  return null
}

export function Stage({ state, quality }) {
  const envTex = useMemo(() => makeEnvironmentTexture(), [])
  const scene = useThree((st) => st.scene)
  const gl = useThree((st) => st.gl)

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.12
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  return (
    <>
      <Environment map={envTex} background={false} environmentIntensity={1.05} />
      <Lights />
      <Backdrop />
      <Dust />
      <Character state={state} quality={quality} />
      <TapPop state={state} />
      <Rig state={state} />
    </>
  )
}
