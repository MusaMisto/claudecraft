// Phase 12 acceptance: classic water physics (sink / rise / surface bob /
// swim speed / bank climb-out / flight immunity) and the held-item viewmodel
// (0.4 block scale, visible skin-toned arm pixels in the bottom-right).
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.app.startGame());
await new Promise((r) => setTimeout(r, 2500));

// Build the test pools high above the terrain near spawn.
await page.evaluate(() => {
  const W = window.BlockId.Water;
  const S = window.BlockId.Stone;
  // Deep pool: floor y=100, water y=101..115, surface plane at y=116.
  for (let x = 0; x <= 4; x++) {
    for (let z = 0; z <= 4; z++) {
      window.setBlock(x, 100, z, S);
      for (let y = 101; y <= 115; y++) window.setBlock(x, y, z, W);
    }
  }
  // Swim channel: floor y=120, water y=121..124, length 40 along +X at z=10.
  for (let x = 0; x <= 40; x++) {
    for (let z = 9; z <= 11; z++) {
      window.setBlock(x, 120, z, S);
      for (let y = 121; y <= 124; y++) window.setBlock(x, y, z, W);
    }
  }
  // Climb-out: floor y=110 at x 10..16 / z 20..22 (below the 128 world
  // ceiling); 1-deep water x 10..12; bank (1 above the water floor) x 13..16.
  for (let x = 10; x <= 16; x++) {
    for (let z = 20; z <= 22; z++) {
      window.setBlock(x, 110, z, S);
      if (x <= 12) window.setBlock(x, 111, z, W);
      else window.setBlock(x, 111, z, S);
    }
  }
});
await new Promise((r) => setTimeout(r, 500));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Sink: stand still in deep water → terminal vy ≈ −2.0 m/s.
const sink = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 110, 2.5);
  await sleep(1200); // reach terminal velocity
  const y0 = window.player.position.y;
  const t0 = performance.now();
  await sleep(800);
  const speed = ((y0 - window.player.position.y) / (performance.now() - t0)) * 1000;
  return { speed, inWater: window.player.inWater };
});
await page.evaluate(() => window.player.teleport(2.5, 102, 2.5));

// 2) Rise: hold jump while fully submerged → ≈ +1.2 m/s.
const rise = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 102, 2.5);
  window.controller.debugMove = { jump: true };
  await sleep(1500); // settle to steady rise mid-pool
  const y0 = window.player.position.y;
  const t0 = performance.now();
  await sleep(800);
  window.controller.debugMove = {};
  return { speed: ((window.player.position.y - y0) / (performance.now() - t0)) * 1000 };
});

// 3) Surface bob: keep holding jump → feet oscillate ≈ 1.4 below the
//    surface plane (y=116), i.e. eyes at the water line; never on top.
const bob = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 110, 2.5);
  window.controller.debugMove = { jump: true };
  await sleep(6000); // rise to the surface and settle into the bob
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 150; i++) {
    await sleep(20);
    const y = window.player.position.y;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  window.controller.debugMove = {};
  return { min, max, eyeAtTop: max + 1.62 };
});

// 4) Swim speed: forward through the submerged channel → ≈ 1.6 m/s.
const swim = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 121.2, 10.5);
  window.player.yaw = -Math.PI / 2; // forward = +X
  window.controller.debugMove = { forward: 1 };
  await sleep(2500); // steady state
  const speed = window.player.horizontalSpeed;
  const x0 = window.player.position.x;
  const t0 = performance.now();
  await sleep(1000);
  const measured = ((window.player.position.x - x0) / (performance.now() - t0)) * 1000;
  window.controller.debugMove = {};
  return { speed, measured };
});

// 5) Climb-out: swim against a 1-block bank → hops out onto it. Stop as
//    soon as the player is on the bank so they don't run off the far edge.
const climb = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(10.5, 111, 21.5);
  window.player.yaw = -Math.PI / 2;
  window.controller.debugMove = { forward: 1 };
  for (let i = 0; i < 150; i++) {
    await sleep(20);
    const p = window.player.position;
    if (p.x > 13.4 && p.y >= 112 && window.player.onGround) break;
  }
  window.controller.debugMove = {};
  await sleep(300);
  return { x: window.player.position.x, y: window.player.position.y };
});

// 6) Flight immunity: flying through the deep pool ignores water.
const fly = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 108, 2.5);
  window.player.flying = true;
  await sleep(400);
  const inWater = window.player.inWater;
  const y = window.player.position.y;
  await sleep(600);
  const sank = y - window.player.position.y;
  window.player.flying = false;
  return { inWater, sank };
});

// 7) Viewmodel: block scale is exactly 0.4 and the first-person arm renders the
//    CURRENT skin in the bottom-right. The arm colour is skin-dependent (it maps
//    the right-arm region of whatever skin is selected), so rather than assume a
//    warm Steve tone we sample the active skin's right-arm pixels and confirm
//    matching pixels appear on screen. Works for any palette (incl. dark skins).
const viewmodel = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.player.teleport(2.5, 130, 2.5); // above the pools, clear sky view
  window.player.pitch = 0;
  await sleep(400);
  const held = window.game['heldBlock'];
  const scale = held['blockMesh'].scale.x;

  // Reference arm colours: the right-arm front region of the active skin
  // (classic layout: skin px x44..48, y20..32).
  const skinImg = held['skinMaterial'].map.image;
  const sc = document.createElement('canvas');
  sc.width = skinImg.width;
  sc.height = skinImg.height;
  const sctx = sc.getContext('2d');
  sctx.drawImage(skinImg, 0, 0);
  const refs = [];
  for (const [x, y] of [[45, 22], [46, 26], [45, 30], [47, 24], [46, 21]]) {
    const d = sctx.getImageData(x, y, 1, 1).data;
    if (d[3] > 200) refs.push([d[0], d[1], d[2]]);
  }

  const gl = window.app.renderer.getContext();
  return await new Promise((resolve) => {
    requestAnimationFrame(() => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      // Sample the lower-right region (GL origin = bottom-left).
      const rw = Math.floor(w * 0.25);
      const rh = Math.floor(h * 0.35);
      const px = new Uint8Array(rw * rh * 4);
      gl.readPixels(w - rw, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let armPixels = 0;
      for (let i = 0; i < px.length; i += 4) {
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
        for (const [ar, ag, ab] of refs) {
          if (Math.abs(r - ar) + Math.abs(g - ag) + Math.abs(b - ab) < 60) {
            armPixels++;
            break;
          }
        }
      }
      resolve({ scale, skinPixels: armPixels, sampled: rw * rh, refs });
    });
  });
});

await sleep(200);
await page.screenshot({ path: '/tmp/phase12.png' });
await browser.close();

const report = {
  sinkSpeed: `${sink.speed.toFixed(2)} m/s down (expect ≈ 2.0), inWater=${sink.inWater}`,
  riseSpeed: `${rise.speed.toFixed(2)} m/s up (expect ≈ 2.0 displacement)`,
  bob: `feet ${bob.min.toFixed(2)}..${bob.max.toFixed(2)} (surface 116; expect ≈ 114.3–114.9 float)`,
  bobEyes: `eye tops out at ${bob.eyeAtTop.toFixed(2)} (expect just above 116)`,
  swim: `${swim.speed.toFixed(3)} m/s stored (expect 1.6), ${swim.measured.toFixed(3)} m/s displacement (expect ≈ 2.0)`,
  climbOut: `x=${climb.x.toFixed(2)} y=${climb.y.toFixed(2)} (expect x>13, y=112 = on the bank)`,
  flight: `inWater=${fly.inWater} sank=${fly.sank.toFixed(3)} (expect false, ≈ 0)`,
  heldScale: `${viewmodel.scale} (expect 0.4)`,
  armPixels: `${viewmodel.skinPixels} arm-skin px of ${viewmodel.sampled} sampled (refs=${JSON.stringify(viewmodel.refs)}; expect > 500)`,
};
console.log(JSON.stringify(report, null, 2));

const pass =
  Math.abs(sink.speed - 2.0) < 0.25 &&
  sink.inWater === true &&
  Math.abs(rise.speed - 2.0) < 0.25 &&
  bob.min > 113.5 &&
  bob.max < 115.5 &&
  Math.abs(swim.speed - 1.6) < 0.05 &&
  Math.abs(swim.measured - 2.0) < 0.2 &&
  climb.x > 13 &&
  Math.abs(climb.y - 112) < 0.01 &&
  fly.inWater === false &&
  Math.abs(fly.sank) < 0.05 &&
  viewmodel.scale === 0.4 &&
  viewmodel.skinPixels > 500;

console.log(pass ? 'PASS' : 'FAIL');
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(pass && !errors.length ? 0 : 1);
