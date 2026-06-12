// Phase 10 acceptance: F3 debug overlay, void respawn, remesh timing under
// ~4 ms, resize correctness, crosshair present.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.app.startGame());
await new Promise((r) => setTimeout(r, 2500));

const results = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  out.crosshair = !!document.getElementById('crosshair');

  // F3 overlay toggle.
  window.game.toggleDebugOverlay();
  await sleep(600);
  const overlay = document.getElementById('debug-overlay');
  out.overlayShown = overlay.style.display !== 'none';
  out.overlayText = overlay.textContent;
  window.game.toggleDebugOverlay();
  out.overlayHidden = overlay.style.display === 'none';

  // Void respawn: drop below the world.
  const spawnY = window.player.position.y;
  window.player.teleport(0.5, -30, 0.5);
  await sleep(400);
  out.respawned = window.player.position.y > 40 && Math.abs(window.player.position.y - spawnY) < 30;

  // Remesh timing: average single-block edit → rebuild, including neighbors.
  const cr = window.game.chunkRenderer;
  const times = [];
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(window.player.position.x) + (i % 5) - 2;
    const z = Math.floor(window.player.position.z) + Math.floor(i / 5) - 3;
    const y = 90 + (i % 3);
    window.setBlock(x, y, z, i % 2 === 0 ? window.BlockId.Stone : window.BlockId.Air);
    const t0 = performance.now();
    cr.update();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  out.remeshMsMedian = Number(times[15].toFixed(2));
  out.remeshMsMax = Number(times[times.length - 1].toFixed(2));

  return out;
});

// Resize: shrink viewport, confirm canvas + camera follow.
await page.setViewport({ width: 900, height: 600 });
await new Promise((r) => setTimeout(r, 600));
const resize = await page.evaluate(() => {
  const canvas = window.app.renderer.domElement;
  return {
    canvasCss: `${canvas.clientWidth}x${canvas.clientHeight}`,
    aspectOk: Math.abs(window.game.camera.aspect - 900 / 600) < 0.01,
  };
});
await page.setViewport({ width: 1280, height: 800 });

await browser.close();
console.log(JSON.stringify({ results, resize }, null, 2));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
