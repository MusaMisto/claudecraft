import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const durationMs = Number(process.argv[3] ?? 600000);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[console.error] ${message.text()}`);
});
await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  window.app.settings.renderDistance = 6;
  window.app.startGame('structure-ten-minute-soak');
  window.game.toggleDebugOverlay();
});

const started = Date.now();
let step = 0;
while (Date.now() - started < durationMs) {
  await page.evaluate((index) => {
    const leg = Math.floor(index / 30) % 4;
    const along = (index % 30) * 110;
    const points = [
      [along, 0],
      [3300, along],
      [3300 - along, 3300],
      [0, 3300 - along],
    ];
    const [x, z] = points[leg];
    const y = window.generator.height(x, z) + 35;
    window.player.teleport(x + 0.5, y, z + 0.5);
    window.player.flying = true;
  }, step++);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const result = await page.evaluate(() => ({
  fps: window.game.fpsValue,
  position: window.player.position.toArray(),
  chunks: window.world.chunks.size,
  placementCache: window.generator.structures.planner.cachedRegionCount,
  blueprintCache: window.generator.structures.cachedBlueprintCount,
  geometries: window.app.renderer.info.memory.geometries,
}));
await browser.close();
console.log(JSON.stringify({ durationMs, steps: step, result, errors }, null, 2));
if (errors.length || result.fps < 30) process.exit(1);
