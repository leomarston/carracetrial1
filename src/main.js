import { Game } from './game/Game.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
// BASE_URL keeps the paths correct under any deploy sub-path.
const MAP_URL = `${import.meta.env.BASE_URL}models/carracemap1.glb`;
const CAR_URL = `${import.meta.env.BASE_URL}models/f1car.glb`;

// Start line: on the highway under the "CRESCENT CITY NORTH" gantry (mesh
// "Finish_Strut001"), facing down the map's longest straight (~1060 units).
// Reading the road markings (yellow edge lines at x≈2285.5 / 2328 and dashed
// white dividers) shows the lanes are only ~7 units wide. We spawn centered in
// a single lane so the car sits between two lane lines.
const LEFT_LINE_X = 2285.5; // left (yellow) lane line of the carriageway
const LANE_WIDTH = 7.1; // ~7 units between lane lines
const LANE_INDEX = 3; // 0-based lane from the left edge (a central lane)
const LANE_CENTER_X = LEFT_LINE_X + LANE_WIDTH * (LANE_INDEX + 0.5);
const CAR_SPAWN = { x: LANE_CENTER_X, z: 50.5, y: 0.8, heading: -Math.PI };

const overlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('loading-status');
const hud = document.getElementById('hud');
const mapStatsEl = document.getElementById('map-stats');
const speedEl = document.getElementById('speedo');
const speedoWrap = document.getElementById('speedo-wrap');

const game = new Game(document.getElementById('app'));
game.start();

game
  .loadMap(MAP_URL, (pct, loaded, total) => {
    if (total > 0) {
      progressBar.style.width = `${pct.toFixed(0)}%`;
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    } else {
      status.textContent = `Loading map… ${(loaded / 1e6).toFixed(1)} MB`;
    }
  })
  .then(async (stats) => {
    status.textContent = 'Loading car…';

    // Size the car to fit inside ONE ~7-unit lane (~78% of the lane width, so it
    // sits between the lane lines with margin). flip=true: the model's nose
    // points -Z but "forward" is +Z, so we rotate it 180° to drive nose-first.
    const car = await game.addCar(CAR_URL, CAR_SPAWN, {
      targetWidth: LANE_WIDTH * 0.78,
      flip: true,
    });

    progressBar.style.width = '100%';
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    speedoWrap.classList.remove('hidden');

    const { size } = stats.bounds;
    mapStatsEl.innerHTML = [
      `<strong>${stats.title}</strong>`,
      `Car: F1 (${car.size.x.toFixed(0)}×${car.size.y.toFixed(0)}×${car.size.z.toFixed(0)})`,
      `<b>W/A/S/D or arrows</b> to drive · <b>C</b> = free camera`,
    ].join('<br/>');

    // Live speedometer.
    const updateSpeedo = () => {
      if (speedEl && game.car) {
        speedEl.textContent = `${Math.abs(game.car.speed).toFixed(0)} u/s`;
      }
      requestAnimationFrame(updateSpeedo);
    };
    updateSpeedo();

    window.__game = game;
    console.info('[carrace] Map + car imported. Driving enabled.', { map: stats, carSize: car.size });
  })
  .catch((err) => {
    console.error(err);
    status.textContent = '⚠️ Failed to load. See console for details.';
    progressBar.style.background = '#ff3b30';
  });
