# Car Race — Highway Battle 🏁

A 3D car racing game built with [Three.js](https://threejs.org/) and bundled
with [Vite](https://vitejs.dev/).

## Status

- **Stage 1 — Map import (done).** The highway-battle map is imported and rendered.
- **Stage 2 — Drivable car (done).** An F1 car is imported, collides with the
  map surface, and is drivable with the keyboard.

## Getting started

```bash
npm install
npm run dev      # start the dev server (prints a local URL)
```

Then open the printed URL (default http://localhost:5173) in a browser.

### Controls

| Key                 | Action            |
| ------------------- | ----------------- |
| `W` / `↑`           | Accelerate        |
| `S` / `↓`           | Brake / reverse   |
| `A` / `←`           | Steer left        |
| `D` / `→`           | Steer right       |
| `Space`             | Handbrake         |
| `C`                 | Toggle free-orbit camera (inspect) |

### Other commands

```bash
npm run build         # production build into dist/
npm run preview       # preview the production build
npm run validate-map  # validate both .glb assets with the Khronos validator
```

## Assets

Both files in `public/models/` are self-contained glTF 2.0 binaries and pass the
official Khronos validator with **0 errors**.

| Asset             | Contents                                              |
| ----------------- | ----------------------------------------------------- |
| `carracemap1.glb` | 594 meshes, 62 materials, 61 embedded PNG textures, `KHR_materials_unlit` |
| `f1car.glb`       | 11 meshes (body + 4 wheels), 5 PBR materials, no extensions |

Neither uses Draco / Meshopt / KTX2 compression, so both load with a plain
`GLTFLoader` — no extra decoders. The loaders deliberately do **not** alter the
assets' transforms or material colors; Three.js' `GLTFLoader` already applies
the Sketchfab Z-up→Y-up root matrix and correct texture color spaces, so they
render exactly as authored.

## How the car works

- **Import & sizing** (`src/game/Car.js`): the F1 model carries a 100× scale
  baked into its Sketchfab root matrix (native world size ~84×46×230). We scale
  it to a target **width** so it fits inside a single lane (~78% of the ~7-unit
  lane, measured from the road's painted lane markings ≈ 5.5 units), recenter it
  so the wheels sit at `y = 0`, and rotate it 180° so its nose points along the
  driving direction.
- **Start line**: the map's geometry is named, so the start position is derived
  from it: the car spawns centered on the highway under the **"CRESCENT CITY
  NORTH" gantry** (mesh `Finish_Strut001`), facing down the map's longest
  straight (~1060 units). The road there is ~45 units of asphalt wide.
- **Collision with the map**: each frame the car raycasts straight down onto the
  map's meshes and rests on the highest surface no more than a small step above
  it — so **overhead structures (the start gantry, tunnel ceilings, bridges) are
  ignored** while curbs/ramps are followed. Before moving it samples the ground
  at the *target* position: no surface (edge of the world) or only walls too
  high to climb → the move is blocked. Real collision against the actual map
  geometry, not a flat ground plane.
- **Driving** (arcade): throttle accelerates along the heading, steering rotates
  the heading (more effective the faster you go), with drag, rolling friction
  and braking/reverse.
- **Chase camera** (`src/game/ChaseCamera.js`): a close third-person camera with
  a **fixed follow distance** — it sits exactly the same distance behind the car
  at any speed (no spring/lag on the distance). Only the trailing angle eases, so
  turns stay smooth while the framing never changes as you accelerate.

### Attribution (required, CC-BY-4.0)

- **Map:** "NFS Undercover DS – Highway Battle" by
  [amogusstrikesback2](https://sketchfab.com/amogusstrikesback2).
- **Car:** "Low Poly F1 Car" by
  [Straight Design](https://sketchfab.com/creativemango).

Both on [Sketchfab](https://sketchfab.com/), licensed under
[CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/). The map attribution is
also shown in-game (bottom-right).

## Project layout

```
index.html               # entry HTML + loading overlay, HUD, speedometer
public/models/*.glb       # static map + car assets (served verbatim)
src/
  main.js                 # boots the Game, loads map + car, wires UI
  style.css               # UI / overlay styling
  game/
    Game.js               # renderer, scene, camera, lights, render loop
    MapLoader.js          # loads & prepares the map
    Car.js                # car import, raycast collision, driving physics
    Controls.js           # keyboard input (WASD / arrows)
    ChaseCamera.js         # third-person follow camera
scripts/
  validate-map.mjs        # Khronos glTF validation for both assets
```
