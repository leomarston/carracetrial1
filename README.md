# Car Race — Highway Battle 🏁

A 3D car racing game built with [Three.js](https://threejs.org/), the
[Rapier](https://rapier.rs/) physics engine, and [Vite](https://vitejs.dev/).

## Status

- **Stage 1 — Map import (done).** The highway-battle map is imported and rendered.
- **Stage 2 — Drivable cars (done).** Cars are imported and drivable.
- **Stage 3 — Real driving physics (in progress).** The car is a Rapier
  raycast vehicle: a dynamic chassis with four suspension wheels, grip/slip,
  weight transfer and real collisions. **Feel pass:** spinning/steering wheels,
  brake lights, RPM/gear model, dynamic chase camera (speed-FOV, shake,
  look-into-corner), tyre **skid marks & smoke**, procedural **audio**, and
  **invisible road-edge walls** that keep you on the track.
- **Cars & stats.** Each car is defined in `src/game/cars.js` by ratings out of
  10 (Speed, Acceleration, Grip / *yol tutuşu*, Braking, Handling) that directly
  drive the physics — so new cars are just a new entry + model. The Mercedes is
  fast (top speed ~340 km/h) and a touch loose: it slides when pushed (demanding
  through corners). The Koenigsegg is grippier and more planted. Grip/feel are all
  just numbers in
  `statsToTuning()`.
- **Race (done).** A start/finish gantry spans the track with a proper
  **standing start**: every car is held on the grid while the gantry start-lights
  and an on-screen counter run **3 · 2 · 1 · GO!** (engine revving), then they're
  released and the clock starts. **2-lap race** with a **minimap** and
  lap/total/best-lap timing. Tracks live in `src/game/tracks.js`; lap logic
  (`RaceManager.js`) counts a lap only when you cross the line *and* have gone a
  full ~360° around the loop (no cheating, no hand-placed checkpoints). `R`
  restarts the race.
- **Two-player split-screen (done).** Two humans race head-to-head on one
  keyboard: **Player 1 drives the Mercedes (top half, WASD)** and **Player 2 drives the
  Koenigsegg (bottom half, arrow keys)**. The screen is split **horizontally**
  into two viewports, each with its own chase camera following its car; both cars
  live in the same physics world so they collide and can block each other. Each
  half has its own speed/gear/lap/position HUD, a shared minimap (P1 = blue,
  P2 = orange) sits on the divider, and the finish banner shows **PLAYER n WINS**
  when the first driver completes the laps. `R` restarts.

## Getting started

```bash
npm install
npm run dev      # start the dev server (prints a local URL)
```

Then open the printed URL (default http://localhost:5173) in a browser.

### Controls (2-player split-screen)

| Action          | Player 1 (top, Mercedes) | Player 2 (bottom, Koenigsegg) |
| --------------- | ------------------ | ----------------------------- |
| Accelerate      | `W`                | `↑`                           |
| Brake / reverse | `S`                | `↓`                           |
| Steer left      | `A`                | `←`                           |
| Steer right     | `D`                | `→`                           |
| Handbrake       | `Space`            | `Right-Shift` / `Right-Ctrl`  |

| Key  | Action                              |
| ---- | ----------------------------------- |
| `R`  | Restart the race (resets both cars) |
| `P`  | Toggle physics-collider debug view  |

### Other commands

```bash
npm run build         # production build into dist/
npm run preview       # preview the production build
npm run validate-map  # validate both .glb assets with the Khronos validator
```

## Assets

All files in `public/models/` are self-contained glTF 2.0 binaries and pass the
official Khronos validator with **0 errors**.

| Asset                  | Contents                                              |
| ---------------------- | ----------------------------------------------------- |
| `carracemap1.glb`      | 594 meshes, 62 materials, 61 embedded PNG textures, `KHR_materials_unlit` |
| `mercedes.glb`         | Player 1 — Mercedes-Benz Silver Lightning, 29 meshes (rigged wheels), 5 materials, `KHR_materials_clearcoat` |
| `lamborghini.glb`      | Player 2 — actually a Koenigsegg CC850, 25 meshes (rigged wheels), 6 materials, `KHR_materials_clearcoat` |
| `start_finish_line.glb`| the start/finish gantry arch placed across the line |

Neither uses Draco / Meshopt / KTX2 compression, so both load with a plain
`GLTFLoader` — no extra decoders. The loaders deliberately do **not** alter the
assets' transforms or material colors; Three.js' `GLTFLoader` already applies
the Sketchfab Z-up→Y-up root matrix and correct texture color spaces, so they
render exactly as authored.

## How it works

Units are **metres / kilograms / Newtons** (1 world unit = 1 m; the lane-fitted
car is ~2.8 m wide, realistic for an F1).

- **Physics world** (`src/physics/PhysicsWorld.js`): a Rapier world stepped on a
  **fixed 1/60 s timestep** (accumulator) decoupled from rendering — essential
  for stable vehicle dynamics. The whole map (594 meshes) is baked into one
  static **trimesh collider**, so the car collides with the road, terrain,
  buildings and barriers.
- **Vehicle** (`src/game/Vehicle.js`): a dynamic **chassis rigid body**
  (~850 kg, CCD on so it can't tunnel through walls) driven by Rapier's
  `DynamicRayCastVehicleController` with **four raycast wheels**. Each wheel has
  a suspension spring/damper (ride height, dive, squat, body roll), grip via
  friction-slip, and steering/engine/brake forces. Rear-wheel drive, front
  braking bias, speed-sensitive steering, reverse and handbrake.
- **Import & sizing**: each car model is scaled to a fixed body width
  (`CAR_WIDTH`, ~2.8 m) and recentred so the chassis origin is its centre, with
  decorative emissive "glow" planes hidden so they don't float or skew sizing.
- **Start line**: spawns centred in a lane under the **"CRESCENT CITY NORTH"
  gantry** (mesh `Finish_Strut001`), facing the map's longest straight.
- **Chase camera** (`src/game/ChaseCamera.js`): close, with a **fixed follow
  distance** (no lag when accelerating); only the trailing angle eases on turns.

### Attribution (required, CC-BY-4.0)

- **Map:** "NFS Undercover DS – Highway Battle" by
  [amogusstrikesback2](https://sketchfab.com/amogusstrikesback2).
- **Player 1 car:** "Mercedes-Benz Silver Lightning" (Sketchfab, CC-BY-4.0).
- **Player 2 car:** "Koenigsegg CC850" by
  [amogusstrikesback2](https://sketchfab.com/amogusstrikesback2).
- **Start/Finish gantry:** "Race drag Start and Finish Line" by
  [rohit143r](https://sketchfab.com/rohit143r).

All on [Sketchfab](https://sketchfab.com/), licensed under
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
