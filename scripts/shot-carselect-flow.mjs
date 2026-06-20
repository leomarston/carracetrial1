import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5188/';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (/carrace|error/i.test(t)) console.log('PAGE:', t); });
page.on('pageerror', (e) => console.log('PAGE-THROW:', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });

await page.waitForFunction(() => {
  const a = document.getElementById('cs-p1'), b = document.getElementById('cs-p2');
  return a && b && !a.classList.contains('cs-busy') && !b.classList.contains('cs-busy');
}, { timeout: 30000 });

// Ready up both players (P1 default mercedes, P2 default lambo).
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })));

// car-select should fade out (display:none) and the loading overlay become visible.
await page.waitForFunction(() => {
  const cs = document.getElementById('car-select');
  return cs && getComputedStyle(cs).display === 'none';
}, { timeout: 10000 }).then(() => console.log('OK: car-select dismissed')).catch(() => console.log('FAIL: car-select still visible'));

await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'scripts/_carselect-loading.png' });

// Wait for the race to be ready (HUD un-hidden) — map + cars load can be slow headless.
await page.waitForFunction(() => {
  const h = document.getElementById('p1-hud');
  return h && !h.classList.contains('hidden');
}, { timeout: 90000 }).then(() => console.log('OK: race ready')).catch(() => console.log('FAIL: race not ready in time'));

await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'scripts/_carselect-ingame.png' });

await browser.close();
console.log('done');
