// Procedural texture and clear-sky visual acceptance check.
// Usage: npm run dev, then `node scripts/procedural-visual-check.mjs`.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[console.error] ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  window.app.settings.useTexturePack = false;
  window.app.settings.renderDistance = 5;
  window.app.startGame('procedural-visuals');
  const generator = window.game['generator'];
  let plains = null;
  for (let z = -1024; z <= 1024 && !plains; z += 16) {
    for (let x = -1024; x <= 1024; x += 16) {
      if (generator.biomeAt(x, z) === 'plains') {
        plains = { x, z, y: generator.height(x, z) };
        break;
      }
    }
  }
  if (plains) {
    window.player.flying = true;
    window.player.teleport(plains.x + 0.5, plains.y + 4, plains.z + 0.5);
    window.player.yaw = Math.PI * 0.2;
    window.player.pitch = -0.12;
  }
  window.setTime(6000);
});
await new Promise((resolve) => setTimeout(resolve, 4000));

const result = await page.evaluate(() => {
  const app = window.app;
  const game = window.game;
  const atlas = app.atlas;
  const ctx = atlas.canvas.getContext('2d');
  const textureNames = ['grass_top', 'dirt', 'stone', 'cobblestone', 'planks', 'sand'];

  const samples = Object.fromEntries(
    textureNames.map((name) => {
      const origin = atlas.pixelOrigin(name);
      const data = ctx.getImageData(origin.x, origin.y, 64, 64).data;
      const values = [];
      for (let y = 2; y < 64; y += 4) {
        for (let x = 2; x < 64; x += 4) {
          const offset = (y * 64 + x) * 4;
          values.push(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722);
        }
      }
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return [
        name,
        {
          range: Math.max(...values) - Math.min(...values),
          standardDeviation: Math.sqrt(variance),
        },
      ];
    }),
  );

  return {
    texturePackOff: !app.settings.useTexturePack && !atlas.usingTexturePack,
    skyColor: game['sky'].skyColor.getHex(),
    viewColor: game['sky'].viewColor.getHex(),
    fogColor: game['scene'].fog.color.getHex(),
    samples,
  };
});

await page.screenshot({ path: '/tmp/claudecraft-procedural-shading.png' });
await browser.close();

const fail = (message) => {
  console.error('FAIL:', message);
  process.exit(1);
};
if (!result.texturePackOff) fail('procedural texture pack was not active');
console.log('Procedural texture contrast:', result.samples);
for (const color of ['skyColor', 'viewColor', 'fogColor']) {
  if (result[color] !== 0x78a7ff) {
    fail(`expected ${color} #78a7ff at noon, got #${result[color].toString(16).padStart(6, '0')}`);
  }
}
for (const [name, sample] of Object.entries(result.samples)) {
  if (sample.range < 24 || sample.standardDeviation < 5) {
    fail(`${name} lacks visible shading contrast: ${JSON.stringify(sample)}`);
  }
}
if (errors.length) {
  console.error('Console errors:');
  for (const error of errors) console.error('  ', error);
  process.exit(1);
}

console.log('PASS: procedural shading and #78a7ff noon sky verified.');
console.log('Screenshot: /tmp/claudecraft-procedural-shading.png');
