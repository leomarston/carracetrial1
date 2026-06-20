/** Headless smoke test for 2-player split-screen. */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
mkdirSync('scripts/shots', { recursive: true });
const browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--window-size=1280,800'] });
const page = await browser.newPage(); await page.setViewport({width:1280,height:800});
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:5188/',{waitUntil:'load',timeout:60000});
await page.waitForFunction(()=>window.__game&&window.__game.car&&window.__game.car2&&window.__game.race,{timeout:60000});
const info = await page.evaluate(()=>({p1:window.__game.car.name, p2:window.__game.car2.name, cams: !!window.__game.camera2, entries: window.__game.race.entries.length}));
console.log('READY:', JSON.stringify(info));

// Wait out the countdown, then hold P1=W and P2=ArrowUp.
await new Promise(r=>setTimeout(r,3500));
await page.keyboard.down('w');
await page.keyboard.down('ArrowUp');
await new Promise(r=>setTimeout(r,4000));
const s1 = await page.evaluate(()=>({
  p1: +(window.__game.car.speed*3.6).toFixed(0),
  p2: +(window.__game.car2.speed*3.6).toFixed(0),
  phase: window.__game.race.phase,
}));
console.log('after both throttle:', JSON.stringify(s1));
// turn: P1 left (A), P2 right (ArrowRight)
await page.keyboard.down('a'); await page.keyboard.down('ArrowRight');
await new Promise(r=>setTimeout(r,1500));
await page.keyboard.up('w'); await page.keyboard.up('a'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
await page.screenshot({path:'scripts/shots/split.png'});
console.log('ERRORS:', errs.length?errs.slice(0,8):'none');
await browser.close();
