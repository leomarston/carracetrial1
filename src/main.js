import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';
import { CARS } from './game/cars.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
const MAP_URL = `${import.meta.env.BASE_URL}models/carracemap1.glb`;
const CAR = { ...CARS.f1, url: `${import.meta.env.BASE_URL}${CARS.f1.url}` };

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
  const car = await game.addCar(CAR, CAR_SPAWN);

  progressBar.style.width = '100%';
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  speedoWrap.classList.remove('hidden');

  mapStatsEl.innerHTML = [
    `<strong>${stats.title}</strong>`,
    `<b>W/A/S/D</b> drive · <b>Space</b> handbrake · <b>R</b> reset · <b>C</b> free cam`,
  ].join('<br/>');

  // Car stats panel (ratings out of 10).
  renderCarStats(car);

  // Live speedometer / gear / tachometer.
  const gearEl = document.getElementById('gear');
  const rpmBar = document.getElementById('rpm-bar');
  const updateHud = () => {
    const c = game.car;
    if (c) {
      speedEl.textContent = `${Math.abs(c.speed * 3.6).toFixed(0)} km/h`;
      gearEl.textContent = c.gear === 0 ? 'R' : `${c.gear}`;
      rpmBar.style.width = `${Math.min(100, (c.rpm / c.engine.redline) * 100).toFixed(0)}%`;
    }
    requestAnimationFrame(updateHud);
  };
  updateHud();

  window.__game = game;
  console.info('[carrace] Physics vehicle ready.', { carSize: car.size });
}

function renderCarStats(car) {
  const el = document.getElementById('car-stats');
  if (!el) return;
  const rows = [
    ['speed', 'Speed'],
    ['acceleration', 'Acceleration'],
    ['grip', 'Grip · Yol tutuşu'],
    ['braking', 'Braking'],
    ['handling', 'Handling'],
  ];
  el.innerHTML =
    `<div class="car-name">${car.name}</div>` +
    rows
      .map(([k, label]) => {
        const v = car.stats[k] ?? 0;
        return `<div class="stat"><span class="stat-lbl">${label}</span>` +
          `<span class="stat-bar"><span style="width:${v * 10}%"></span></span>` +
          `<span class="stat-val">${v}</span></div>`;
      })
      .join('');
  el.classList.remove('hidden');
}

boot().catch((err) => {
  console.error(err);
  status.textContent = '⚠️ Failed to load. See console for details.';
  progressBar.style.background = '#ff3b30';
});
