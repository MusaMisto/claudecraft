// Faithful 64x texture-pack acceptance check. Verifies the pack defaults off,
// toggles live for blocks and mobs, and restores the procedural pixels.
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
const toggle = await page.evaluate(async () => {
  const app = window.app;
  const atlas = app.atlas;
  const stone = atlas.pixelOrigin('stone');
  const cowTexture = app.animalTextures.texture('cow', 'temperate');
  const cowCanvas = cowTexture.image;
  const pixel = (canvas, x, y) =>
    [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
  const sample = () => ({
    stone: pixel(atlas.canvas, stone.x + 20, stone.y + 20),
    cow: pixel(cowCanvas, 10, 10),
  });
  const before = sample();
  const defaultOff =
    !app.settings.useTexturePack &&
    !atlas.usingTexturePack &&
    !app.animalTextures.usingTexturePack;
  app.optionsMenu.show();
  const row = [...document.querySelectorAll('#options-menu .option-row')].find(
    (element) => element.querySelector('span')?.textContent === 'Faithful 64x Pack',
  );
  const button = row?.querySelector('button');
  const buttonDefault = button?.textContent;
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const enabled = sample();
  const enabledState =
    app.settings.useTexturePack &&
    atlas.usingTexturePack &&
    app.animalTextures.usingTexturePack &&
    button?.textContent === 'ON';
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const restored = sample();
  return {
    defaultOff,
    buttonDefault,
    enabledState,
    blockChanged: JSON.stringify(before.stone) !== JSON.stringify(enabled.stone),
    mobChanged: JSON.stringify(before.cow) !== JSON.stringify(enabled.cow),
    blockRestored: JSON.stringify(before.stone) === JSON.stringify(restored.stone),
    mobRestored: JSON.stringify(before.cow) === JSON.stringify(restored.cow),
    sameMobTexture: app.animalTextures.texture('cow', 'temperate') === cowTexture,
  };
});
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#options-menu .option-row')].find(
    (element) => element.querySelector('span')?.textContent === 'Faithful 64x Pack',
  );
  row?.querySelector('button')?.click();
  window.app.optionsMenu.hide();
  window.app.startGame('faithful-qa');
});
await new Promise((r) => setTimeout(r, 6000));
const inGame = await page.evaluate(async () => {
  const icon = () => document.querySelector('#hotbar .slot canvas');
  const hash = (canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let value = 0x811c9dc5;
    for (const byte of data) {
      value ^= byte;
      value = Math.imul(value, 0x01000193);
    }
    return value >>> 0;
  };
  const faithfulHash = hash(icon());
  const row = [...document.querySelectorAll('#options-menu .option-row')].find(
    (element) => element.querySelector('span')?.textContent === 'Faithful 64x Pack',
  );
  const button = row?.querySelector('button');
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const proceduralHash = hash(icon());
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    hotbarChanged: faithfulHash !== proceduralHash,
    restoredOn: button?.textContent === 'ON' && window.app.atlas.usingTexturePack,
  };
});
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
for (const [key, value] of Object.entries(toggle)) {
  if (key === 'buttonDefault') {
    if (value !== 'OFF') fail(`expected texture-pack button OFF by default, got ${value}`);
  } else if (!value) {
    fail(`texture toggle check failed: ${key}`);
  }
}
for (const [key, value] of Object.entries(inGame)) {
  if (!value) fail(`in-game texture toggle check failed: ${key}`);
}
if (errors.length) {
  console.error('Console errors/warnings:');
  for (const e of errors) console.error('  ', e);
  process.exit(1);
}
console.log(`PASS: ${summary.loaded} Faithful textures loaded and toggle live. Screenshot: /tmp/faithful-game.png`);
