import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
const MAP_URL = `${import.meta.env.BASE_URL}models/carracemap1.glb`;
const CAR_URL = `${import.meta.env.BASE_URL}models/f1car.glb`;

// Start line: on the highway under the "CRESCENT CITY NORTH" gantry, facing down
// the map's longest straight. Lanes are ~7 units wide; spawn centred in a lane.
const LEFT_LINE_X = 2285.5;
const LANE_WIDTH = 7.1;
const LANE_INDEX = 3; // a central lane
const LANE_CENTER_X = LEFT_LINE_X + LANE_WIDTH * (LANE_INDEX + 0.5);
const CAR_SPAWN = { x: LANE_CENTER_X, z: 50.5, y: 0.8, heading: -Math.PI };

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');
const hud = document.getElementById('hud');
const mapStatsEl = document.getElementById('map-stats');
const speedEl = document.getElementById('speedo');
const speedoWrap = document.getElementById('speedo-wrap');

async function boot() {
  status.textContent = 'Initialising physics…';
  await RAPIER.init(); // load the Rapier WASM once, before any physics is created

  const game = new Game(document.getElementById('app'));
  game.start();

  const stats = await game.loadMap(MAP_URL, (pct, loaded, total) => {
    if (total > 0) {
      progressBar.style.width = `${pct.toFixed(0)}%`;
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    } else {
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} MB`;
    }
  });

  status.textContent = 'Loading car…';
  const car = await game.addCar(CAR_URL, CAR_SPAWN, {
    targetWidth: LANE_WIDTH * 0.39, // ~one-lane-wide
    flip: true,
  });

  progressBar.style.width = '100%';
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  speedoWrap.classList.remove('hidden');

  mapStatsEl.innerHTML = [
    `<strong>${stats.title}</strong>`,
    `Car: F1 (${car.size.x.toFixed(1)}×${car.size.y.toFixed(1)}×${car.size.z.toFixed(1)} m)`,
    `<b>W/A/S/D</b> drive · <b>Space</b> handbrake · <b>R</b> reset · <b>C</b> free cam`,
  ].join('<br/>');

  // Live speedometer (m/s -> km/h).
  const updateSpeedo = () => {
    if (speedEl && game.car) {
      speedEl.textContent = `${Math.abs(game.car.speed * 3.6).toFixed(0)} km/h`;
    }
    requestAnimationFrame(updateSpeedo);
  };
  updateSpeedo();

  window.__game = game;
  console.info('[carrace] Physics vehicle ready.', { carSize: car.size });
}

boot().catch((err) => {
  console.error(err);
  status.textContent = '⚠️ Failed to load. See console for details.';
  progressBar.style.background = '#ff3b30';
});
