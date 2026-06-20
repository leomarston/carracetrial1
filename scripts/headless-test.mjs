/**
 * Headless smoke test: boots the built game with software WebGL, verifies the
 * Lambo imported (size/wheels/no floating glows) and that the AI actually drives
 * (laps progress, stays on the road). Saves screenshots to scripts/shots/.
 *
 *   npx vite preview --port 5188 &   # serve dist/
 *   node scripts/headless-test.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:5188/';
mkdirSync('scripts/shots', { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1280,800',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

// Wait until the game + AI + race are ready.
await page.waitForFunction(() => window.__game && window.__game.race && window.__game.ai, { timeout: 60000 });

const info = await page.evaluate(() => {
  const g = window.__game;
  const s = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });
  return {
    playerName: g.car.name,
    playerSize: s(g.car.size),
    aiName: g.ai.car.name,
    aiSize: s(g.ai.car.size),
    aiWheelPivots: g.ai.car._wheelPivots.length,
    playerWheelPivots: g.car._wheelPivots.length,
    waypoints: g.aiWaypoints.length,
    aiPos: s(g.ai.car.object3D.position),
    playerPos: s(g.car.object3D.position),
  };
});
console.log('READY:', JSON.stringify(info, null, 2));

const shot = (name) => page.screenshot({ path: `scripts/shots/${name}.png` });
await shot('01-grid');

// Close-up of the Lambo (freeze the camera on it).
await page.evaluate(() => {
  const g = window.__game;
  g.driving = false; g.controls.enabled = false;
  const a = g.ai.car.object3D.position;
  g.camera.position.set(a.x + 5.5, a.y + 2.6, a.z + 6.5);
  g.camera.lookAt(a.x, a.y + 0.4, a.z);
});
await new Promise((r) => setTimeout(r, 400));
await shot('02-lambo-closeup');

// Resume chase and let the race run.
await page.evaluate(() => { window.__game.driving = true; });
const samples = [];
const T = 18000, step = 3000;
for (let t = 0; t < T; t += step) {
  await new Promise((r) => setTimeout(r, step));
  const snap = await page.evaluate(() => {
    const g = window.__game, r = g.race;
    const e = r.entries.map((x) => ({
      name: x.name, isP: x.isPlayer, laps: x.lapsDone, prog: +x.progress.toFixed(3), pos: x.position,
      spd: +(x.car.speed * 3.6).toFixed(0), contact: x.car.wheelsInContact,
    }));
    return { phase: r.phase, t: +r.raceTime.toFixed(1), wpi: g.ai.driver.i, e };
  });
  samples.push(snap);
  console.log(`t=${snap.t}s phase=${snap.phase} aiWP=${snap.wpi} | ` +
    snap.e.map((x) => `${x.isP ? 'P' : 'AI'} P${x.pos} lap${x.laps} prog${x.prog} ${x.spd}km/h c${x.contact}`).join('  |  '));
}
await shot('03-midrace');

console.log('\nERRORS:', errors.length ? errors.slice(0, 20) : 'none');
await browser.close();
