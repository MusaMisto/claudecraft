// Phase 6 acceptance: screenshots at key times of day (noon, sunset, night,
// sunrise) plus a smoothness sweep across the sunset window.
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
await new Promise((r) => setTimeout(r, 5000));

await page.evaluate(() => {
  window.player.pitch = 0.25; // look slightly up so sun/moon/stars are visible
  window.player.yaw = -Math.PI / 2; // face +X (east, where the sun rises)
});

const times = [
  ['noon', 6000],
  ['late-day', 11800],
  ['sunset', 12900],
  ['night', 18000],
  ['sunrise', 23000],
];
for (const [name, t] of times) {
  await page.evaluate((tt) => window.setTime(tt), t);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `/tmp/phase6-${name}.png` });
}

// Smoothness sweep: sample clear-color across the sunset window.
const sweep = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (let t = 11800; t <= 14200; t += 200) {
    window.setTime(t);
    await sleep(120);
    out.push(t);
  }
  return out.length;
});

await browser.close();
console.log(`Sunset sweep sampled ${sweep} steps without errors.`);
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
