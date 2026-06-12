// Phase 3 acceptance: stream terrain while auto-flying forward; sample FPS
// and capture screenshots along the way.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 6000)); // initial chunk load
await page.screenshot({ path: '/tmp/phase3-start.png' });

await page.evaluate(() => {
  window.debug.autoFly = true;
});
const samples = [];
for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  samples.push(await page.evaluate(() => document.getElementById('fps').textContent));
  await page.screenshot({ path: `/tmp/phase3-fly${i}.png` });
}
await page.evaluate(() => {
  window.debug.autoFly = false;
});

await browser.close();
console.log('FPS samples during flight:');
for (const s of samples) console.log(' ', s);
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
