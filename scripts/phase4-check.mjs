// Phase 4 acceptance: steady-state walk/sprint speed over 100 blocks on a
// flat runway, jump apex, wall clipping, and 1- vs 2-block step jumps.
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
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.app.startGame()); // hooks exist once a world starts
await new Promise((r) => setTimeout(r, 2500));

// Build a stone runway at y=100 along +X and teleport the player onto it.
await page.evaluate(() => {
  for (let x = 0; x <= 124; x++) {
    for (let z = -1; z <= 1; z++) window.setBlock(x, 100, z, window.BlockId.Stone);
  }
  window.player.teleport(2.5, 101, 0.5);
  window.player.yaw = -Math.PI / 2; // forward = +X
  window.player.pitch = 0;
});
await new Promise((r) => setTimeout(r, 300));

async function timedRun(sprint) {
  return page.evaluate(async (sprintFlag) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.player.teleport(2.5, 101, 0.5);
    window.player.yaw = -Math.PI / 2;
    window.controller.debugMove = { forward: 1, sprint: sprintFlag };
    let t0 = null;
    let t1 = null;
    let speedSample = 0;
    while (t1 === null) {
      await sleep(20);
      const x = window.player.position.x;
      const now = performance.now();
      if (t0 === null && x >= 10) t0 = now;
      if (x >= 60) speedSample = window.player.horizontalSpeed;
      if (x >= 110) t1 = now;
      if (x > 122) break;
    }
    window.controller.debugMove = {};
    await sleep(300);
    const stoppedSpeed = window.player.horizontalSpeed;
    return { seconds: (t1 - t0) / 1000, speedSample, stoppedSpeed };
  }, sprint);
}

const walk = await timedRun(false);
const sprint = await timedRun(true);

// Jump apex on flat ground (poll position; ~20ms sampling vs 50ms ticks).
const apex = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(60.5, 101, 0.5);
  await sleep(200);
  const baseY = window.player.position.y;
  let peak = 0;
  window.controller.debugMove = { jump: true };
  for (let i = 0; i < 60; i++) {
    await sleep(20);
    peak = Math.max(peak, window.player.position.y - baseY);
    if (i > 6) window.controller.debugMove = {};
  }
  return peak;
});

// Sprint-jump into a wall: must not clip through.
const wall = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 101; y <= 105; y++) {
    for (let z = -1; z <= 1; z++) window.setBlock(80, y, z, window.BlockId.Stone);
  }
  window.player.teleport(70.5, 101, 0.5);
  window.player.yaw = -Math.PI / 2;
  window.controller.debugMove = { forward: 1, sprint: true, jump: true };
  await sleep(3000);
  window.controller.debugMove = {};
  return { x: window.player.position.x, clipped: window.player.position.x > 79.71 };
});

// Step tests: 1-block step should be jumpable, 2-block should not.
const steps = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 1-block step at x>=30: a raised slab on top of the runway.
  for (let x = 30; x <= 36; x++) {
    for (let z = -1; z <= 1; z++) window.setBlock(x, 101, z, window.BlockId.Stone);
  }
  window.player.teleport(26.5, 101, 0.5);
  window.player.yaw = -Math.PI / 2;
  window.controller.debugMove = { forward: 1, jump: true };
  await sleep(2500);
  window.controller.debugMove = {};
  const oneBlockY = window.player.position.y;

  // 2-block step at x>=50.
  for (let x = 50; x <= 56; x++) {
    for (let z = -1; z <= 1; z++) {
      window.setBlock(x, 101, z, window.BlockId.Stone);
      window.setBlock(x, 102, z, window.BlockId.Stone);
    }
  }
  window.player.teleport(46.5, 101, 0.5);
  window.player.yaw = -Math.PI / 2;
  window.controller.debugMove = { forward: 1, jump: true };
  await sleep(2500);
  window.controller.debugMove = {};
  return { oneBlockY, twoBlockX: window.player.position.x, twoBlockY: window.player.position.y };
});

await page.screenshot({ path: '/tmp/phase4.png' });
await browser.close();

const report = {
  walk100: `${walk.seconds.toFixed(2)} s (expect ≈ 23.2)`,
  walkSpeed: `${walk.speedSample.toFixed(3)} m/s (expect 4.317)`,
  walkStop: `${walk.stoppedSpeed.toFixed(4)} m/s after release (expect < 0.01)`,
  sprint100: `${sprint.seconds.toFixed(2)} s (expect ≈ 17.8)`,
  sprintSpeed: `${sprint.speedSample.toFixed(3)} m/s (expect 5.612)`,
  jumpApex: `${apex.toFixed(3)} blocks (expect ≈ 1.25)`,
  wallX: `${wall.x.toFixed(3)} (wall face at 79.7), clipped=${wall.clipped}`,
  oneBlockStepY: `${steps.oneBlockY.toFixed(2)} (expect 102 = climbed)`,
  twoBlockStep: `x=${steps.twoBlockX.toFixed(2)} y=${steps.twoBlockY.toFixed(2)} (expect x<50, y=101 = blocked)`,
};
console.log(JSON.stringify(report, null, 2));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
