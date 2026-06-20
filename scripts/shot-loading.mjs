import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5188/';
const PCT = process.env.PCT || '55';

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Wait until boot() finishes (it hides the overlay) so it can't overwrite the
// width we pin below; then force the overlay back open at a fixed fill.
await page
  .waitForFunction(() => document.getElementById('loading-overlay')?.classList.contains('hidden'), { timeout: 30000 })
  .catch(() => {});

await page.evaluate((pct) => {
  const ov = document.getElementById('loading-overlay');
  if (ov) ov.classList.remove('hidden');
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
  const st = document.getElementById('loading-status');
  if (st) st.textContent = 'Loading map… 4.2 / 7.8 MB';
}, PCT);

await new Promise((r) => setTimeout(r, 400));

await page.screenshot({ path: 'scripts/_loading-full.png' });

// Bottom-right corner crop (where the painted bar lives + our widget).
await page.screenshot({
  path: 'scripts/_loading-corner.png',
  clip: { x: 760, y: 470, width: 520, height: 250 },
});

await browser.close();
console.log('done', PCT);
