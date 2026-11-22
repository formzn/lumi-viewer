# Lumi — interactive 3D character viewer

A standalone, fully procedural 3D companion. No model files, no external
textures, no fonts, no network calls at runtime: every surface, glowing orb and
eye is generated in code at load time.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # 147 assertions
```

## What it does

A small companion built from two teardrops — a transparent amber glass hood with
a glossy black sphere floating inside it, and a matte cream body with one coral
dot. Six glowing glass beads ride three thin golden rings around the hood.

Idle, the whole thing floats and breathes, the head turns to follow the cursor,
the face sphere drifts inside its glass, the rings rotate and tilt on three
separate axes, the beads orbit at six different speeds and directions, and dust
drifts through the warm air behind it.

## Interactions

| Gesture | Response |
| --- | --- |
| Tap head | hop, squash & stretch, big smile, beads burst outward and spring back |
| Tap body | jelly wobble, small jump, happy wiggle |
| Tap an orb | that bead flashes, spins a fast lap, glow bloom at the contact point |
| Double tap | full 360° joyful spin |
| Long press | eyes close, the character relaxes and sleeps, then wakes and looks at you |
| Drag | rotate 360° in any direction |
| Scroll / pinch | zoom |
| Mouse move / finger | the head follows you |
| Space / Enter | bounce (keyboard) |

Every tap leaves a soft glow ring at the exact point touched, and every reaction
passes through the same spring system, so nothing ever snaps.

## How it is built

- **React Three Fiber** for the scene graph; all per-frame animation mutates
  `Object3D` transforms and material uniforms directly. React never re-renders
  while the character is alive.
- **`src/lib/spring.js`** — a damped-spring integrator with fixed sub-steps. It
  is frame-rate independent, clamps pathological deltas (a backgrounded tab),
  and `kick()` takes an *amplitude in world units* and solves for the velocity
  that produces it, so animations are authored by how far they should visibly
  move.
- **`src/scene/Eyes.jsx`** — the face is a shader on a shell around the sphere.
  Each expression is a continuous parameter (arc depth, span, stroke width,
  scale), so blinking mid-smile morphs smoothly instead of swapping textures.
  Arc rendering is masked to the front hemisphere: the back and sides of the
  sphere stay plain, as in the reference.
- **Procedural geometry** — `spec.js` builds both teardrops by lathing a profile
  resampled with a monotone cubic (Fritsch–Carlson). A plain Catmull-Rom rounds
  the apex into a dome; monotone interpolation keeps the hood's point sharp and
  never overshoots.
- **Glass** — `MeshTransmissionMaterial` with attenuation tinted amber. Samples
  and buffer resolution drop on touch devices, where it is by far the most
  expensive part of the frame.

## Tests

There is no browser in the build sandbox, so the suite covers what can be
verified without one:

| Suite | Covers |
| --- | --- |
| `logic` | spring convergence, frame-rate independence, dt clamping, amplitude accuracy |
| `interactions` | every tap produces *visible* feedback, settles, and cannot run away |
| `geometry` | silhouette proportions, sharp apex, 2:1 build, face inside the hood |
| `shader` | GLSL ES 1.00 validity, matching varyings, uniform wiring |
| `eyeshape` | the eye field sampled in JS: arcs are continuous, open underneath |
| `framing` | nine viewports from iPhone SE to desktop all frame the whole character |
| `hittest` | hood/face/body/button/orb all resolve to the right reaction |
| `idle` | idle gait drift turns on only when ignored |
| `mount` | the real React tree boots and runs frames in jsdom |
| `preview` | built bundle, the brief's UI constraints, no external assets |

## Layout

```
src/
  App.jsx                 canvas, gesture pipeline, hit-testing, UI
  styles.css
  character/
    spec.js               proportions + procedural lathe geometry
    controller.js         emotional/physical state, one function per reaction
  lib/
    spring.js             damped springs, damping helpers, seeded random
    textures.js           eye/glow/backdrop/environment canvas textures
  scene/
    Stage.jsx             camera, lights, backdrop, quality tiers
    Character.jsx         hood, face, body, button, per-frame animation
    Eyes.jsx              expression shader
    Orbits.jsx            gyroscope rings + glass beads
    Dust.jsx              background motes
    TapPop.jsx            the glow ring at the touched point
```
