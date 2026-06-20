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
await new Promise((r) => setTimeout(r, 1500)); // bg image + fonts

await page.screenshot({ path: 'scripts/_menu-race.png' });

// Settings selected
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' })));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/_menu-settings-sel.png' });

// Open settings panel
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })));
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'scripts/_menu-settings-panel.png' });

// Lower the SFX a bit with Left, then close
await page.evaluate(() => { for (let i = 0; i < 8; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' })); });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'scripts/_menu-settings-40.png' });
const sfx = await page.evaluate(() => document.getElementById('mm-sfx-val').textContent);
console.log('sfx after 8 left from 100:', sfx);

await browser.close();
console.log('done');
