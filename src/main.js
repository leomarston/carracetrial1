import { Game } from './game/Game.js';

// Assets live in /public so they are served verbatim (never bundled/transformed).
// BASE_URL keeps the paths correct under any deploy sub-path.
const MAP_URL = `${import.meta.env.BASE_URL}models/carracemap1.glb`;
const CAR_URL = `${import.meta.env.BASE_URL}models/f1car.glb`;

// Spawn on the large flat area found by the surface analysis (verified driveable).
const CAR_SPAWN = { x: -1856, z: 563, heading: Math.PI / 2 };

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

    // flip=true: the model's nose points -Z, but our "forward" is +Z, so we
    // rotate it 180° to make the car drive nose-first.
    const car = await game.addCar(CAR_URL, CAR_SPAWN, { targetLength: 80, flip: true });

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
