import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';
import { CARS } from './game/cars.js';
import { TRACKS } from './game/tracks.js';
import { formatTime } from './game/RaceManager.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
const base = import.meta.env.BASE_URL;
const MAP_URL = `${base}models/carracemap1.glb`;
const P1_CAR = { ...CARS.mercedes, url: `${base}${CARS.mercedes.url}` };
const P2_CAR = { ...CARS.lambo, url: `${base}${CARS.lambo.url}` };
const TRACK = { ...TRACKS.highway, gantry: { ...TRACKS.highway.gantry, url: `${base}${TRACKS.highway.gantry.url}` } };

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

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

  status.textContent = 'Loading Player 1 car…';
  await game.addCar(P1_CAR, TRACK.spawn);

  status.textContent = 'Loading Player 2 car…';
  await game.addPlayer2(P2_CAR, TRACK.p2Spawn);

  status.textContent = 'Placing start/finish line…';
  await game.addStartFinishGantry(TRACK.gantry);
  game.setupRace(TRACK, document.getElementById('minimap'));

  progressBar.style.width = '100%';
  overlay.classList.add('hidden');
  for (const id of ['controls-hint', 'p1-hud', 'p2-hud', 'divider', 'minimap-wrap']) {
    document.getElementById(id).classList.remove('hidden');
  }

  // Per-player HUD cells.
  const p1 = hudCells('p1-hud');
  const p2 = hudCells('p2-hud');
  const banner = document.getElementById('finish-banner');
  const cdEl = document.getElementById('countdown');
  let lastCd = '';

  const setPlayer = (cells, entry, race) => {
    const c = entry.car;
    cells.kmh.textContent = Math.abs(c.speed * 3.6).toFixed(0);
    cells.gear.textContent = c.gear === 0 ? 'R' : `${c.gear}`;
    cells.lap.textContent = `LAP ${race.lapOf(entry)}/${race.totalLaps}`;
    cells.pos.textContent = race.started ? ORDINAL[entry.position] : '—';
    cells.pos.style.color = entry.position === 1 ? '#46d36a' : '#ff9f43';
  };

  const updateHud = () => {
    const r = game.race;
    if (r) {
      setPlayer(p1, r.entries[0], r);
      if (r.entries[1]) setPlayer(p2, r.entries[1], r);

      // Countdown overlay (re-trigger the pop animation each time it changes).
      const t = r.countdownText;
      if (t) {
        if (t !== lastCd) {
          cdEl.textContent = t;
          cdEl.classList.toggle('go', t === 'GO!');
          cdEl.classList.remove('hidden', 'pop');
          void cdEl.offsetWidth; // reflow so the animation restarts
          cdEl.classList.add('pop');
          lastCd = t;
        }
      } else {
        cdEl.classList.add('hidden');
        lastCd = '';
      }

      if (r.finished && banner.classList.contains('hidden')) {
        const w = r.winner;
        banner.querySelector('.fb-title').textContent = `PLAYER ${w.index + 1} WINS! 🏆`;
        banner.querySelector('.result').textContent = `${w.name}`;
        banner.querySelector('.total').textContent = formatTime(w.finishTime);
        banner.classList.remove('hidden');
      } else if (!r.finished && !banner.classList.contains('hidden')) {
        banner.classList.add('hidden'); // hidden again after reset (R)
      }
    }
    requestAnimationFrame(updateHud);
  };
  updateHud();

  window.__game = game;
  console.info('[carrace] Split-screen race ready.', { laps: TRACK.laps });
}

function hudCells(rootId) {
  const root = document.getElementById(rootId);
  return {
    kmh: root.querySelector('.ph-kmh'),
    gear: root.querySelector('.ph-gear'),
    lap: root.querySelector('.ph-lap'),
    pos: root.querySelector('.ph-pos'),
  };
}

boot().catch((err) => {
  console.error(err);
  status.textContent = '⚠️ Failed to load. See console for details.';
  progressBar.style.background = '#ff3b30';
});
