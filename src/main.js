import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';
import { CARS } from './game/cars.js';
import { TRACKS } from './game/tracks.js';
import { formatTime } from './game/RaceManager.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
const base = import.meta.env.BASE_URL;
const MAP_URL = `${base}models/carracemap1.glb`;
const CAR = { ...CARS.f1, url: `${base}${CARS.f1.url}` };
const TRACK = { ...TRACKS.highway, gantry: { ...TRACKS.highway.gantry, url: `${base}${TRACKS.highway.gantry.url}` } };
const CAR_SPAWN = TRACK.spawn;

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

  status.textContent = 'Placing start/finish line…';
  await game.addStartFinishGantry(TRACK.gantry);
  game.setupRace(TRACK, document.getElementById('minimap'));

  progressBar.style.width = '100%';
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  speedoWrap.classList.remove('hidden');
  document.getElementById('race-hud').classList.remove('hidden');
  document.getElementById('minimap-wrap').classList.remove('hidden');

  mapStatsEl.innerHTML = [
    `<strong>${stats.title}</strong>`,
    `<b>W/A/S/D</b> drive · <b>Space</b> handbrake · <b>R</b> restart · <b>C</b> free cam`,
  ].join('<br/>');

  renderCarStats(car);

  // HUD: speedometer / gear / tach + race (laps & timing).
  const gearEl = document.getElementById('gear');
  const rpmBar = document.getElementById('rpm-bar');
  const lapEl = document.getElementById('lap-count');
  const curEl = document.getElementById('lap-time');
  const bestEl = document.getElementById('best-time');
  const banner = document.getElementById('finish-banner');
  const updateHud = () => {
    const c = game.car, r = game.race;
    if (c) {
      speedEl.textContent = `${Math.abs(c.speed * 3.6).toFixed(0)} km/h`;
      gearEl.textContent = c.gear === 0 ? 'R' : `${c.gear}`;
      rpmBar.style.width = `${Math.min(100, (c.rpm / c.engine.redline) * 100).toFixed(0)}%`;
    }
    if (r) {
      lapEl.textContent = `LAP ${r.currentLap}/${r.totalLaps}`;
      curEl.textContent = r.started ? formatTime(r.lapTime) : 'cross the line to start';
      bestEl.textContent = r.bestLap ? `best ${formatTime(r.bestLap)}` : '';
      if (r.finished && banner.classList.contains('hidden')) {
        banner.querySelector('.total').textContent = formatTime(r.raceTime);
        banner.querySelector('.best').textContent = r.bestLap ? `Best lap ${formatTime(r.bestLap)}` : '';
        banner.classList.remove('hidden');
      } else if (!r.finished && !banner.classList.contains('hidden')) {
        banner.classList.add('hidden'); // hidden again after reset (R)
      }
    }
    requestAnimationFrame(updateHud);
  };
  updateHud();

  window.__game = game;
  console.info('[carrace] Race ready.', { laps: TRACK.laps });
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
