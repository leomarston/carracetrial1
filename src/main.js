import { Game } from './game/Game.js';

// The map lives in /public so it is served verbatim (never bundled/transformed).
// BASE_URL keeps the path correct under any deploy sub-path.
const MAP_URL = `${import.meta.env.BASE_URL}models/carracemap1.glb`;

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');
const hud = document.getElementById('hud');
const mapStatsEl = document.getElementById('map-stats');

const game = new Game(document.getElementById('app'));
game.start();

game
  .loadMap(MAP_URL, (pct, loaded, total) => {
    if (total > 0) {
      progressBar.style.width = `${pct.toFixed(0)}%`;
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    } else {
      // No Content-Length: show bytes downloaded so far.
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} MB`;
    }
  })
  .then((stats) => {
    progressBar.style.width = '100%';
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');

    const { size } = stats.bounds;
    mapStatsEl.innerHTML = [
      `<strong>${stats.title}</strong>`,
      `${stats.meshCount} meshes · ${stats.triangleCount.toLocaleString()} tris`,
      `${stats.materialCount} materials`,
      `size ≈ ${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)}`,
      `drag to orbit · scroll to zoom · right-drag to pan`,
    ].join('<br/>');

    // Surface the imported map for debugging / the upcoming car stage.
    window.__game = game;
    console.info('[carrace] Map imported successfully:', stats);
  })
  .catch((err) => {
    console.error(err);
    status.textContent = '⚠️ Failed to load map. See console for details.';
    progressBar.style.background = '#ff3b30';
  });
