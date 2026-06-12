// Phase 10 soak: ~10 minutes of continuous play — sprinting, jumping,
// flying, breaking and placing — sampling FPS for degradation and
// collecting console errors. Driven in short evaluate() chunks so no single
// CDP call outlives puppeteer's protocol timeout.
import puppeteer from 'puppeteer-core';

const MINUTES = Number(process.argv[2] ?? 10);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 120000,
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
await new Promise((r) => setTimeout(r, 2000));

// Frame counter + 15 s FPS sampler installed once.
await page.evaluate(() => {
  window.__soak = { fpsSamples: [], frames: 0, last: performance.now() };
  const raf = () => {
    window.__soak.frames++;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  window.__soak.timer = setInterval(() => {
    const s = window.__soak;
    const now = performance.now();
    s.fpsSamples.push(Math.round((s.frames * 1000) / (now - s.last)));
    s.frames = 0;
    s.last = now;
  }, 15000);
});

// One play "scene" ≈ 30–45 s, executed repeatedly until time is up.
async function playScene(phase) {
  await page.evaluate(async (ph) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = window.controller;
    const game = window.game;
    window.player.yaw += Math.PI / 3;
    switch (ph % 6) {
      case 0: // sprint + jump across terrain
        c.debugMove = { forward: 1, sprint: true, jump: true };
        await sleep(8000);
        break;
      case 1: // walk
        c.debugMove = { forward: 1 };
        await sleep(6000);
        break;
      case 2: // fly up, around, back down
        window.player.flying = true;
        c.debugMove = { forward: 1, flyUp: true, sprint: true };
        await sleep(6000);
        c.debugMove = { forward: 1, flyDown: true };
        await sleep(4000);
        window.player.flying = false;
        break;
      case 3: { // build a ring of blocks around the player
        c.debugMove = {};
        window.player.pitch = -1.2;
        for (let i = 0; i < 12; i++) {
          game.interaction.updateTarget();
          game.interaction.placeBlock(window.hud.selectedBlock);
          window.hud.scroll(1);
          window.player.yaw += 0.5;
          await sleep(180);
        }
        break;
      }
      case 4: { // break whatever is targeted while spinning
        window.player.pitch = -0.9;
        for (let i = 0; i < 16; i++) {
          game.interaction.updateTarget();
          game.interaction.breakBlock();
          window.player.yaw += 0.4;
          await sleep(140);
        }
        window.player.pitch = 0;
        break;
      }
      case 5: // pause/resume cycle
        game.onPauseRequested();
        await sleep(900);
        window.app.pauseMenu.hide();
        game.resume();
        await sleep(1200);
        break;
    }
    c.debugMove = {};
  }, phase);
}

const start = Date.now();
let phase = 0;
while (Date.now() - start < MINUTES * 60 * 1000) {
  await playScene(phase++);
}

const report = await page.evaluate(() => {
  clearInterval(window.__soak.timer);
  return {
    fpsSamples: window.__soak.fpsSamples,
    finalPos: window.player.position.toArray().map((v) => Math.round(v)),
  };
});

await page.screenshot({ path: '/tmp/phase10-soak-end.png' });
await browser.close();

const first = report.fpsSamples.slice(0, 4);
const lastS = report.fpsSamples.slice(-4);
const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
console.log(JSON.stringify({
  minutes: MINUTES,
  fpsSamples: report.fpsSamples,
  avgFirstMinute: avg(first),
  avgLastMinute: avg(lastS),
  finalPos: report.finalPos,
}, null, 2));
console.log(errors.length ? `Console errors (${errors.length}):\n${errors.slice(0, 10).join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
