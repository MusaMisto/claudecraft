// Phase 3 regression: progressively stream terrain while flying forward,
// measure frame delivery, and capture visual checkpoints.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  window.app.settings.renderDistance = 6;
  window.app.startGame();
  window.player.flying = true;
  window.player.yaw = 0;
  window.player.pitch = -0.12;
  window.player.position.y += 18;
  window.player.prevPosition.copy(window.player.position);
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await sleep(3000);
await page.screenshot({ path: '/tmp/phase3-start.png' });

await page.evaluate(() => {
  const samples = [];
  let frames = 0;
  let previous = performance.now();
  let maxGap = 0;
  window.__phase3Frames = { samples, frames, maxGap, previous };
  const frame = (now) => {
    const state = window.__phase3Frames;
    state.frames++;
    state.maxGap = Math.max(state.maxGap, now - state.previous);
    state.previous = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.controller.debugMove = { forward: 1, sprint: true };
});

const samples = [];
for (let i = 0; i < 4; i++) {
  await sleep(3000);
  samples.push(await page.evaluate(() => {
    const state = window.__phase3Frames;
    const sample = {
      frames: state.frames,
      maxGap: state.maxGap,
      x: window.player.position.x,
      y: window.player.position.y,
      z: window.player.position.z,
      chunks: window.world.chunks.size,
      meshes: [...window.game['chunkRenderer'].loadedMeshKeys].length,
    };
    state.frames = 0;
    state.maxGap = 0;
    return sample;
  }));
  await page.screenshot({ path: `/tmp/phase3-fly${i}.png` });
}
await page.evaluate(() => {
  window.controller.debugMove = {};
});
await browser.close();

const fps = samples.map((sample) => sample.frames / 3);
const distance = Math.hypot(
  samples.at(-1).x - samples[0].x,
  samples.at(-1).z - samples[0].z,
);
const report = { samples, fps, distance, errors };
console.log(JSON.stringify(report, null, 2));

const pass =
  fps.every((value) => value >= 55) &&
  samples.every((sample) => sample.maxGap < 250 && sample.chunks > 0 && sample.meshes > 0) &&
  distance >= 80 &&
  errors.length === 0;
console.log(pass ? 'PASS: Phase 3 terrain streaming verified.' : 'FAIL: Phase 3 regression failed.');
process.exit(pass ? 0 : 1);
