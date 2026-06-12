// Headless browser smoke test: loads the dev server in Brave (Chromium),
// captures console errors, measures FPS, and saves a screenshot.
// Usage: node scripts/browser-check.mjs [url] [screenshot-path] [wait-ms]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? '/tmp/claudecraft.png';
const waitMs = Number(process.argv[4] ?? 4000);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(`[console.${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise((r) => setTimeout(r, waitMs));

const fps = await page.evaluate(() => document.getElementById('fps')?.textContent ?? 'n/a');
await page.screenshot({ path: shot });
await browser.close();

console.log('FPS readout:', fps);
console.log('Screenshot:', shot);
if (errors.length) {
  console.log('Console errors/warnings:');
  for (const e of errors) console.log(' ', e);
  process.exit(1);
} else {
  console.log('No console errors or warnings.');
}
