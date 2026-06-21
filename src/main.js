import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';
import { CARS } from './game/cars.js';
import { MAPS } from './game/maps.js';
import { formatTime } from './game/RaceManager.js';
import { runCarSelect } from './game/CarSelect.js';
import { runMainMenu } from './game/MainMenu.js';
import { runMapSelect } from './game/MapSelect.js';
import { preloadCars } from './game/carAssets.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
const base = import.meta.env.BASE_URL;
// Browse order on the CAR SELECT screen (all cars are selectable by either player).
const CAR_ORDER = ['mercedes', 'lambo', 'mclaren', 'audi', 'rs01', 'dezir', 'honda'];

const NOS_C = 2 * Math.PI * 42; // nitrous-gauge ring circumference (r=42 in the SVG)

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');

const setProgress = (pct, msg) => {
  progressBar.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
  if (msg) status.textContent = msg;
};

async function boot() {
  // 0) MAIN MENU → MAP SELECT. "Back" on the map screen returns to the menu, so
  //    this loops until the player actually selects a (playable) map.
  let chosen;
  for (;;) {
    await runMainMenu({ root: document.getElementById('main-menu') });
    const mapId = await runMapSelect({ root: document.getElementById('map-select'), maps: MAPS });
    if (mapId === 'back') continue;
    chosen = MAPS.find((m) => m.id === mapId);
    break;
  }
  const MAP_URL = `${base}${chosen.mapUrl}`;
  const TRACK = { ...chosen.track, gantry: { ...chosen.track.gantry, url: `${base}${chosen.track.gantry.url}` } };

  // 1) LOADING — after the map is chosen. Everything heavy loads here: physics,
  //    ALL car models (into a shared cache), the chosen map and the gantry. This
  //    is why car select is instant and the race starts right after the picks.
  overlay.classList.remove('hidden');
  setProgress(3, 'Initialising physics…');
  await RAPIER.init(); // load the Rapier WASM once, before any physics is created

  setProgress(6, 'Loading cars…');
  await preloadCars(
    CAR_ORDER.map((id) => ({ id, url: `${base}${CARS[id].url}` })),
    (frac) => setProgress(6 + frac * 24, 'Loading cars…'), // 6 → 30 %
  );

  const game = new Game(document.getElementById('app'));
  game.roadRe = TRACK.roadRe || /Road2/i; // which meshes are road (minimap/on-road/walls)
  game.buildWalls = TRACK.walls !== false; // some maps bake the road onto the terrain
  game.mapScale = TRACK.scale || 1; // scale tiny maps up so cars are proportioned
  await game.loadMap(MAP_URL, (pct, loaded, total) => {
    setProgress(30 + pct * 0.5, total > 0 // 30 → 80 %
      ? `Loading map… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
      : `Loading map… ${(loaded / 1e6).toFixed(1)} MB`);
  });

  setProgress(84, 'Placing start/finish line…');
  await game.addStartFinishGantry(TRACK.gantry);
  if (TRACK.path) game._buildRacingLine(TRACK); // AI line (only on maps with bots)
  setProgress(90, 'Choose your car…');

  // 2) CAR SELECT — instant, since every model is already cached. The loading
  //    overlay just waits behind this screen until both players lock in.
  const picks = await runCarSelect({
    cars: CARS,
    order: CAR_ORDER,
    defaults: { p1: 'mercedes', p2: 'lambo' },
    base,
    root: document.getElementById('car-select'),
  });

  // 3) Spawn the chosen cars + the remaining cars as bots — all from the cache,
  //    so this is near-instant (no network).
  setProgress(93, 'Starting race…');
  const withUrl = (id) => ({ ...CARS[id], url: `${base}${CARS[id].url}` });
  await game.addCar(withUrl(picks.p1), TRACK.spawn);
  await game.addPlayer2(withUrl(picks.p2), TRACK.p2Spawn);
  setProgress(97);
  // AI bots only on maps that define a racing line + bot grid.
  if (TRACK.path && TRACK.botSpawns) {
    await game.addBots(
      CAR_ORDER.filter((id) => id !== picks.p1 && id !== picks.p2).slice(0, 5).map(withUrl),
      TRACK,
    );
  }
  game.setupRace(TRACK, document.getElementById('minimap'));
  game.start();

  setProgress(100, 'Ready');
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
