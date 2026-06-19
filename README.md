# Car Race — Highway Battle 🏁

A 3D car racing game built with [Three.js](https://threejs.org/) and bundled
with [Vite](https://vitejs.dev/).

## Status

**Stage 1 — Map import (done).** The race map is imported and rendered, with
free-orbit camera controls so you can inspect it from any angle. Cars and
gameplay come next.

## Getting started

```bash
npm install
npm run dev      # start the dev server (prints a local URL)
```

Then open the printed URL (default http://localhost:5173) in a browser.
Drag to orbit, scroll to zoom, right-drag to pan.

### Other commands

```bash
npm run build         # production build into dist/
npm run preview       # preview the production build
npm run validate-map  # validate the .glb with the official Khronos validator
```

## The map

`public/models/carracemap1.glb` — a self-contained glTF 2.0 binary.

- glTF 2.0, single scene, **594 meshes**, **62 materials**, **61 embedded PNG textures**
- Only extension used: `KHR_materials_unlit` (no required extensions)
- No Draco / Meshopt / KTX2 compression → loads with a plain `GLTFLoader`,
  no extra decoders needed.

The loader (`src/game/MapLoader.js`) deliberately does **not** alter the map's
transforms or material colors: Three.js' `GLTFLoader` already applies the
Sketchfab Z-up→Y-up root matrix and decodes textures in the correct color
space, so the map renders exactly as authored.

### Attribution (required)

Map: **"NFS Undercover DS – Highway Battle"** by
[amogusstrikesback2](https://sketchfab.com/amogusstrikesback2) on
[Sketchfab](https://sketchfab.com/3d-models/nfs-undercover-ds-highway-battle-e8b1859b628a42209b8866d9a4b45936),
licensed under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
The attribution is also shown in-game (bottom-right).

## Project layout

```
index.html              # entry HTML + loading overlay & HUD
public/models/*.glb      # static map asset (served verbatim)
src/
  main.js                # boots the Game, wires the loading UI
  style.css              # UI / overlay styling
  game/
    Game.js              # renderer, scene, camera, lights, render loop
    MapLoader.js         # loads & prepares the .glb map correctly
scripts/
  validate-map.mjs       # Khronos glTF validation (npm run validate-map)
```
