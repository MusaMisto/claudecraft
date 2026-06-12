// Phase 7 acceptance: clouds visible overhead, drifting westward over time,
// fly up through a cloud, and tint changes with time of day.
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
await new Promise((r) => setTimeout(r, 4000));

// Look up at the cloud layer from the ground at noon.
await page.evaluate(() => {
  window.player.flying = true;
  window.player.teleport(0.5, 90, 0.5);
  window.player.yaw = 0;
  window.player.pitch = 1.1;
  window.setTime(6000);
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/phase7-noon.png' });

// Same view at sunset and night for tint comparison.
await page.evaluate(() => window.setTime(12700));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/phase7-sunset.png' });
await page.evaluate(() => window.setTime(18000));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/phase7-night.png' });

// Inside a cloud: fly to the layer altitude.
await page.evaluate(() => {
  window.setTime(6000);
  window.player.teleport(0.5, 129, 0.5);
  window.player.pitch = 0.1;
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/phase7-inside.png' });

await browser.close();
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
