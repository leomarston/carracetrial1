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
// AI bots that race the loop.
const BOT_IDS = ['mclaren', 'audi', 'rs01', 'dezir', 'honda'];
const BOT_CARS = BOT_IDS.map((id) => ({ ...CARS[id], url: `${base}${CARS[id].url}` }));
const TRACK = { ...TRACKS.highway, gantry: { ...TRACKS.highway.gantry, url: `${base}${TRACKS.highway.gantry.url}` } };

const NOS_C = 2 * Math.PI * 42; // nitrous-gauge ring circumference (r=42 in the SVG)

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');

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

  status.textContent = 'Loading bots…';
  await game.addBots(BOT_CARS, TRACK);

  status.textContent = 'Placing start/finish line…';
  await game.addStartFinishGantry(TRACK.gantry);
  game.setupRace(TRACK, document.getElementById('minimap'));

  progressBar.style.width = '100%';
  overlay.classList.add('hidden');
  for (const id of ['p1-hud', 'p2-hud', 'divider', 'minimap-wrap']) {
    document.getElementById(id).classList.remove('hidden');
  }

  const p1 = hudCells('p1-hud');
  const p2 = hudCells('p2-hud');
  const ww1 = document.getElementById('p1-wrongway');
  const ww2 = document.getElementById('p2-wrongway');
  const banner = document.getElementById('finish-banner');
  const cdEl = document.getElementById('countdown');
  let lastCd = '';

  const setPlayer = (cells, entry, race) => {
    const c = entry.car;
    cells.kmh.textContent = Math.abs(c.speed * 3.6).toFixed(0);
    cells.gear.textContent = c.gear === 0 ? 'R' : `${c.gear}`;
    cells.lap.textContent = `${race.lapOf(entry)}/${race.totalLaps}`;
    cells.pos.textContent = race.started ? `${entry.position}` : '—';
    cells.time.textContent = raceClock(race.raceTime);
    const nos = Math.max(0, Math.min(1, c.rpm / c.engine.redline));
    cells.nos.style.strokeDashoffset = `${NOS_C * (1 - nos)}`;
  };

  const updateHud = () => {
    const r = game.race;
    if (r) {
      setPlayer(p1, r.entries[0], r);
      if (r.entries[1]) setPlayer(p2, r.entries[1], r);

      // Wrong-way warnings (only while racing).
      const racing = r.phase === 'racing';
      ww1.classList.toggle('hidden', !(racing && game.car && game.car.wrongWay));
      ww2.classList.toggle('hidden', !(racing && game.car2 && game.car2.wrongWay));

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
        banner.querySelector('.fb-title').textContent = `PLAYER ${w.index + 1} WINS!`;
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
  const nos = root.querySelector('.nos-fill');
  nos.style.strokeDasharray = `${NOS_C}`;
  nos.style.strokeDashoffset = `${NOS_C}`;
  return {
    pos: root.querySelector('.rhud-pos'),
    time: root.querySelector('.rhud-time'),
    lap: root.querySelector('.rhud-lap'),
    kmh: root.querySelector('.rhud-kmh'),
    gear: root.querySelector('.rhud-gear'),
    nos,
  };
}

/** Race clock as m:ss.dd (always with minutes), e.g. 3:22.27. */
function raceClock(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

boot().catch((err) => {
  console.error(err);
  status.textContent = '⚠️ Failed to load. See console for details.';
  progressBar.style.background = '#ff3b30';
});
