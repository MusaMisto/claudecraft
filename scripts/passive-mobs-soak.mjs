// Ten-minute passive-mob traversal soak. Usage:
//   node scripts/passive-mobs-soak.mjs [url] [duration-ms]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const durationMs = Number(process.argv[3] ?? 600000);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: [
    '--use-angle=metal',
    '--enable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
  ],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    errors.push(`[console.${message.type()}] ${message.text()}`);
  }
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  window.app.settings.renderDistance = 6;
  window.app.settings.vibrantVisuals = false;
  window.app.audio.ensureStarted();
  window.app.startGame('passive-ten-minute-soak');
  window.player.flying = true;
  window.player.teleport(window.player.position.x, 96, window.player.position.z);
  window.controller.debugMove = { forward: 1, sprint: true };
  window.__passiveSoak = {
    frames: 0,
    maxGap: 0,
    prior: performance.now(),
    running: true,
  };
  const frame = (now) => {
    const state = window.__passiveSoak;
    state.frames++;
    state.maxGap = Math.max(state.maxGap, now - state.prior);
    state.prior = now;
    if (state.running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

await new Promise((resolve) => setTimeout(resolve, 1500));
const textureBaseline = await page.evaluate(() => ({
  textures: window.app.renderer.info.memory.textures,
  expectedAnimalTextures: window.app.animalTextures.summary.loaded,
}));

const samples = [];
const started = Date.now();
let turn = 0;
while (Date.now() - started < durationMs) {
  const remaining = durationMs - (Date.now() - started);
  await new Promise((resolve) => setTimeout(resolve, Math.min(30000, remaining)));
  turn++;
  samples.push(await page.evaluate((yaw) => {
    window.player.yaw = yaw;
    const mobs = [...window.mobs.entities.values()];
    const player = window.player.position;
    let near = 0;
    let invalid = 0;
    for (const mob of mobs) {
      if (mob.position.distanceToSquared(player) <= 64 ** 2) near++;
      if (!Number.isFinite(mob.position.x + mob.position.y + mob.position.z) || mob.position.y < 0) {
        invalid++;
      }
    }
    return {
      elapsed: performance.now(),
      position: player.toArray(),
      counts: window.mobs.counts(),
      near,
      invalid,
      chunks: window.mobs.spawner.activeChunkCount,
      memory: { ...window.app.renderer.info.memory },
    };
  }, turn * Math.PI * 0.37));
}

const final = await page.evaluate((elapsedMs) => {
  window.__passiveSoak.running = false;
  window.controller.debugMove = {};
  return {
    fps: window.__passiveSoak.frames / (elapsedMs / 1000),
    maxGap: window.__passiveSoak.maxGap,
    playedSounds: window.mobs.sfx.playedCount,
    counts: window.mobs.counts(),
    memory: { ...window.app.renderer.info.memory },
  };
}, durationMs);
await page.screenshot({ path: '/tmp/passive-mobs-soak.png' });
await browser.close();

const failures = [];
if (errors.length) failures.push('console errors/warnings');
if (final.fps < 55 || final.maxGap >= 250) failures.push('frame delivery');
if (samples.some((sample) => sample.counts.total > 60 || sample.near > 35)) failures.push('spawn caps');
if (samples.some((sample) => sample.invalid > 0)) failures.push('invalid entity state');
const last = samples.at(-1)?.memory;
if (
  textureBaseline.expectedAnimalTextures !== 11 ||
  (last && last.textures > textureBaseline.textures + textureBaseline.expectedAnimalTextures)
) {
  failures.push('texture growth');
}

const report = { durationMs, textureBaseline, samples, final, errors, failures };
console.log(JSON.stringify(report, null, 2));
console.log(failures.length ? 'FAIL: Passive mob soak failed.' : 'PASS: Passive mob soak verified.');
process.exit(failures.length ? 1 : 0);
