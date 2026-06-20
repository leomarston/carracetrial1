import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5188/';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE-THROW:', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Wait until both stages have finished streaming their default car (cs-busy clears).
await page
  .waitForFunction(() => {
    const a = document.getElementById('cs-p1'), b = document.getElementById('cs-p2');
    return a && b && !a.classList.contains('cs-busy') && !b.classList.contains('cs-busy');
  }, { timeout: 30000 })
  .catch(() => console.log('(timed out waiting for cars)'));

await new Promise((r) => setTimeout(r, 1200)); // let the turntable settle + fonts swap
await page.screenshot({ path: 'scripts/_carselect.png' });

// Optional: advance P1 a couple of cars and mark P2 ready, to check states.
if (process.env.STATES) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })));
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/_carselect-states.png' });
}

await browser.close();
console.log('done');
