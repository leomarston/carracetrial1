import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5188/';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE-THROW:', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#main-menu .mm-node', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));

// RACE -> map select
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })));
await page.waitForFunction(() => getComputedStyle(document.getElementById('map-select')).display !== 'none', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'scripts/_map-stage1.png' });

// Scroll down to a locked stage (Coming Soon)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' })));
await new Promise((r) => setTimeout(r, 350));
const status2 = await page.evaluate(() => document.getElementById('ms-status').textContent);
console.log('stage 2 status:', status2);
await page.screenshot({ path: 'scripts/_map-stage2-locked.png' });

// Try to select the locked stage -> toast, should NOT proceed
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })));
await new Promise((r) => setTimeout(r, 250));
const toastShown = await page.evaluate(() => document.getElementById('ms-toast').classList.contains('show'));
const stillOnMap = await page.evaluate(() => getComputedStyle(document.getElementById('map-select')).display !== 'none');
console.log('locked select -> toast:', toastShown, '| stayed on map:', stillOnMap);
await page.screenshot({ path: 'scripts/_map-coming-soon-toast.png' });

// Back to menu
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
const backToMenu = await page.waitForFunction(() => getComputedStyle(document.getElementById('main-menu')).display !== 'none' && !document.getElementById('main-menu').classList.contains('hidden'), { timeout: 5000 }).then(() => true).catch(() => false);
console.log('Back returned to menu:', backToMenu);

// RACE again -> map select -> select Stage 1 -> should go to loading then car select
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })));
await page.waitForFunction(() => getComputedStyle(document.getElementById('map-select')).display !== 'none', { timeout: 8000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))); // select stage 1
const reachedCarSelect = await page.waitForFunction(() => {
  const cs = document.getElementById('car-select');
  const brand = document.getElementById('cs-p1-brand');
  return getComputedStyle(cs).display !== 'none' && brand && brand.textContent !== 'Brand';
}, { timeout: 90000 }).then(() => true).catch(() => false);
console.log('selecting Stage 1 reached car select:', reachedCarSelect);

await browser.close();
console.log('done');
