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
- **Main menu (done).** The first screen is a racing-game style **main menu**
  (`src/game/MainMenu.js`) over a full-screen background (`src/image2.png`):
  a horizontal icon selector with **RACE / SETTINGS / QUIT** (navigate with the
  arrows or `A`/`D`, confirm with `Enter`). **Race** opens car select; **Settings**
  opens a panel with a **Sound Effects** volume slider (persisted to localStorage
  via `src/game/settings.js` and applied live to the `AudioManager`); **Quit** is
  inert for now.
- **Map select (done).** After **Race**, a **World Map** screen
  (`src/game/MapSelect.js` + `src/game/maps.js`) lists the stages: a vertical
  selector, a map preview and an event-info panel (Event Status / Race Type /
  Distance / Best Lap). **Stage 1 — Highway Battle** and **Stage 2 — Hyperdrive
  Circuit** are playable; remaining stages are scrollable but show **COMING
  SOON**. **Back** returns to the menu; selecting a map continues to loading →
  car select. New maps are just entries in `maps.js` + `tracks.js`.
- **Per-track config (done).** Each track names its road meshes (`roadRe`) and
  can: disable road-edge walls (`walls: false`) for maps whose asphalt is baked
  onto the terrain; scale a tiny asset up (`scale`) so the cars are proportioned;
  and disable the off-road respawn (`offRoad: false`) for open, uneven maps. Maps
  without a `path`/`botSpawns` run with no AI bots (e.g. the Hyperdrive circuit).
- **Car select (done).** Before the race, a split-screen **CAR SELECT** screen
  (`src/game/CarSelect.js`) lets each player browse the catalog and pick their
  own car — the model spins on a turntable (real 3D, livery-tinted) with its
  TOP SPEED / ACCELERATION / HANDLING ratings, tier badge and value, in a
  racing-game style. Whatever the two players don't pick becomes the AI bot
  field. It runs its own small renderer (disposed before the game starts), then
  hands the picks to the loading screen.
- **Two-player split-screen (done).** Two humans race head-to-head on one
  keyboard: **Player 1 drives the top half (WASD)** and **Player 2 drives the
  bottom half (arrow keys)** — each in the car they chose. The screen is split **horizontally**
  into two viewports, each with its own chase camera following its car; both cars
  live in the same physics world so they collide and can block each other. Each
  half has its own speed/gear/lap/position HUD, a shared minimap (P1 = blue,
  P2 = orange) sits on the divider, and the finish banner shows **PLAYER n WINS**
  when the first driver completes the laps. `R` restarts.
- **Driving assists (done).** Each human car keeps a rolling "last-good" checkpoint
  (last upright, on-road spot it was driving through); if it **flips** or drives
  **off the road** for a moment it's dropped back there, upright. A flashing,
  NFS-style **WRONG WAY** warning shows in a player's half whenever they travel
  against the track direction (turned around or reversing). On-road is tested
  against the road sample-cloud (winding-proof), not raycasts.
- **AI bots (done).** Five extra cars (McLaren, Audi, Renault Sport R.S. 01,
  Renault DeZir, Honda) race the loop as bots. They're driven *kinematically*
  along the racing line (`AIDriver.js` + `trackPath.js`): each advances by arc
  length at a curvature-derived speed (slow for corners, fast on straights), so
  they never spin or get stuck, and they're spread across the lane with slightly
  varied pace. They count as race entries (positions/laps) and show on the
  minimap. New bots are just more entries in `src/main.js`'s bot list.

## Getting started

```bash
npm install
npm run dev      # start the dev server (prints a local URL)
```

Then open the printed URL (default http://localhost:5173) in a browser.

### Controls — car select (before the race)

| Action       | Player 1        | Player 2                  |
| ------------ | --------------- | ------------------------- |
| Change car   | `A` / `D`       | `←` / `→`                 |
| Ready        | `W` / `Enter`   | `↑` / `Right-Shift`       |
| Cancel ready | `S`             | `↓`                       |

The arrows and the **Ready** button are also clickable. The race starts once
both players are ready.

### Controls (2-player split-screen)

| Action          | Player 1 (top) | Player 2 (bottom) |
| --------------- | ------------------ | ----------------------------- |
| Accelerate      | `W`                | `↑`                           |
| Brake / reverse | `S`                | `↓`                           |
| Steer left      | `A`                | `←`                           |
| Steer right     | `D`                | `→`                           |
| Handbrake       | `Space`            | `Right-Shift` / `Right-Ctrl`  |
| Nitro / boost   | `Left-Shift`       | `Numpad-0` / `/`              |

Each car is speed-limited to its top speed; holding **nitro** (while you have
charge) raises that limit and adds punch. The green HUD ring is the nitrous
charge — it drains while boosting and refills otherwise.

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
| `mercedes.glb`         | Player 1 — Mercedes-Benz Silver Lightning (rigged wheels, `KHR_materials_clearcoat`) |
| `lamborghini.glb`      | Player 2 — actually a Koenigsegg CC850 (rigged wheels, `KHR_materials_clearcoat`) |
| `mclaren.glb`, `audi.glb`, `rs01.glb`, `dezir.glb`, `honda.glb` | AI bots (McLaren Artura, Audi R8 e-tron, Renault Sport R.S. 01, Renault DeZir, Honda Civic Type R) — same rig family |
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
- **Livery tint**: these models ship a white/grayscale paint texture (just baked
  shading) so they'd render white; each car's `paintColor` multiplies its
  `carpaint` meshes to give it a colour while keeping the shading (chrome, glass,
  black trim and calipers are left untouched).
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
- **Bot cars (Sketchfab, CC-BY-4.0):** "McLaren Artura", "Audi R8 e-tron",
  "Renault Sport R.S. 01", "Renault DeZir", "Honda Civic Type R".
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
