// Faithful 64x texture-pack acceptance check. Boots the dev server in Brave,
// starts a world, and asserts the Faithful load summary + a clean console.
// Usage: npm run dev (in another shell), then `node scripts/faithful-check.mjs`.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
let summary = null;
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  const sum = /\[Faithful\] (\d+) mapped textures loaded, (\d+) missing, (\d+) invalid/.exec(t);
  if (sum) summary = { loaded: +sum[1], missing: +sum[2], invalid: +sum[3] };
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${t}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.app.startGame('faithful-qa'));
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: '/tmp/faithful-game.png' });
await browser.close();

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};
if (!summary) fail('no [Faithful] load summary logged (loader did not run)');
console.log('Faithful summary:', summary);
if (summary.loaded !== 37) fail(`expected 37 mapped textures loaded, got ${summary.loaded}`);
if (summary.invalid !== 0) fail(`expected 0 invalid textures, got ${summary.invalid}`);
if (errors.length) {
  console.error('Console errors/warnings:');
  for (const e of errors) console.error('  ', e);
  process.exit(1);
}
console.log(`PASS: ${summary.loaded} Faithful textures loaded, no console errors. Screenshot: /tmp/faithful-game.png`);
