// Phase 13 acceptance: Vibrant Visuals — vertex AO, directional shadows,
// HDR pipeline (ACES + bloom + MSAA), animated glinting water, the options
// toggle, and frame rate. See TODO.md Phase 13 for the measured criteria.
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
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = true;
  window.app.startGame();
});
await new Promise((r) => setTimeout(r, 3000));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shared fixture: stone platform + wall high over the spawn ocean; clouds
// hidden so drifting cloud shadows can't land on the probe points.
await page.evaluate(() => {
  window.game['clouds'].group.visible = false;
  const S = window.BlockId.Stone;
  for (let x = 0; x <= 24; x++) {
    for (let z = 0; z <= 24; z++) window.setBlock(x, 120, z, S);
  }
  for (let z = 6; z <= 14; z++) {
    for (let y = 121; y <= 126; y++) window.setBlock(12, y, z, S);
  }
  window.setBlock(5, 121, 5, S); // lone block for the AO probe
  window.player.flying = true;
});
await sleep(1500); // let dirty chunks remesh

// Helper: center-pixel luminance with the camera straight down over (x, z).
const probeDown = async (x, z, y) => {
  await page.evaluate(
    ({ x, z, y }) => {
      window.player.teleport(x, y, z);
      window.player.pitch = -Math.PI / 2;
      window.player.yaw = 0;
      window.player.velocity.set(0, 0, 0);
    },
    { x, z, y },
  );
  await sleep(700);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl = window.app.renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const px = new Uint8Array(4);
          gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          resolve(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
        });
      }),
  );
};

// 1) Vertex AO: top faces ringing the lone block carry darkened corners.
const ao = await page.evaluate(() => {
  const entry = window.game['chunkRenderer']['meshes'].get('0,0');
  const geo = entry.opaque.geometry;
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const col = geo.attributes.color.array;
  let darkNearBlock = 1;
  let openTop = 0;
  for (let i = 0; i < pos.length; i += 3) {
    if (nrm[i + 1] !== 1 || pos[i + 1] !== 121) continue; // platform tops
    const x = pos[i];
    const z = pos[i + 2];
    const c = col[i];
    if (x >= 4 && x <= 7 && z >= 4 && z <= 7) darkNearBlock = Math.min(darkNearBlock, c);
    if (x >= 16 && x <= 24 && z >= 16 && z <= 24) openTop = Math.max(openTop, c);
  }
  return { darkNearBlock, openTop };
});

// 2) Shadows: mid-morning sun (tick 3000, 45° from +X) — the wall shades
//    the platform to its −X side. Probe shadowed vs sunlit ground.
await page.evaluate(() => window.setTime(3000));
const shadowOn = await probeDown(9.5, 10.5, 129);
const litOn = await probeDown(9.5, 20.5, 129);
await page.screenshot({ path: '/tmp/phase13-shadow.png' });

// Toggle off -> vanilla baseline: softer lighting, but block shadows remain.
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = false;
  window.applyVisuals();
});
await sleep(300);
const shadowOff = await probeDown(9.5, 10.5, 129);
const litOff = await probeDown(9.5, 20.5, 129);
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
});

// 3) Pipeline state: ACES + MSAA x4 with VV on; direct vanilla render off.
const pipeline = await page.evaluate(() => {
  const on = {
    toneMapping: window.app.renderer.toneMapping,
    samples: window.game['composer'].renderTarget1.samples,
    shadows: window.app.renderer.shadowMap.enabled,
  };
  window.app.settings.vibrantVisuals = false;
  window.applyVisuals();
  const off = {
    toneMapping: window.app.renderer.toneMapping,
    shadows: window.app.renderer.shadowMap.enabled,
  };
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
  return { on, off };
});

// 4) Bloom + halo: noon sun overhead; mean luminance in a ring around the
//    sun disk is clearly brighter with VV on than off.
const sunRing = async () => {
  await page.evaluate(() => {
    window.setTime(6000);
    window.player.teleport(12.5, 135, 12.5);
    window.player.pitch = Math.PI / 2 - 0.01; // straight up
    window.player.velocity.set(0, 0, 0);
  });
  await sleep(700);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl = window.app.renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const cx = w >> 1;
          const cy = h >> 1;
          let sum = 0;
          let n = 0;
          const px = new Uint8Array(4);
          for (let a = 0; a < 24; a++) {
            const x = Math.round(cx + Math.cos((a / 24) * Math.PI * 2) * 150);
            const y = Math.round(cy + Math.sin((a / 24) * Math.PI * 2) * 150);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            sum += 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
            n++;
          }
          resolve(sum / n);
        });
      }),
  );
};
const ringOn = await sunRing();
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = false;
  window.applyVisuals();
});
await sleep(300);
const ringOff = await sunRing();
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
});

// 5) Water: the wave normal map scrolls, and a low-sun view across open
//    water shows a specular glint absent with VV off.
const waveMoves = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const off0 = window.game['chunkRenderer'].waterMat.waveOffset.x;
  await sleep(1000);
  return window.game['chunkRenderer'].waterMat.waveOffset.x !== off0;
});
// Find open water near spawn: a column whose +X run is water too, so the
// camera looks down the sun path across the surface.
const waterPos = await page.evaluate(() => {
  for (let r = 0; r < 250; r += 4) {
    for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      let allWater = true;
      for (let dx = 0; dx <= 30; dx += 2) {
        if (window.world.getBlock(x + dx, 61, z) !== window.BlockId.Water) {
          allWater = false;
          break;
        }
      }
      if (allWater) return { x, z };
    }
  }
  return null;
});
const glintMax = async () => {
  await page.evaluate(({ x, z }) => {
    window.setTime(1200); // early morning, sun ~18° above the +X horizon
    // Hover just above the water surface itself so terrain can't block the
    // view; the rest of the 30-block water run lies ahead along +X.
    window.player.flying = true;
    window.player.teleport(x + 1.5, 63.4, z + 0.5);
    window.player.yaw = -Math.PI / 2;
    window.player.pitch = -0.18;
    window.player.velocity.set(0, 0, 0);
  }, waterPos);
  await sleep(700);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl = window.app.renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          // Lower-LEFT band = water surface, clear of the held-item
          // viewmodel in the bottom-right (GL origin bottom-left).
          const rw = Math.floor(w * 0.45);
          const rh = Math.floor(h * 0.27);
          const px = new Uint8Array(rw * rh * 4);
          gl.readPixels(Math.floor(w * 0.05), Math.floor(h * 0.08), rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let max = 0;
          for (let i = 0; i < px.length; i += 4) {
            max = Math.max(max, 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
          }
          resolve(max);
        });
      }),
  );
};
const glintOn = await glintMax();
await page.screenshot({ path: '/tmp/phase13-glint.png' });
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = false;
  window.applyVisuals();
});
await sleep(300);
const glintOff = await glintMax();
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
  window.game['clouds'].group.visible = true;
});

// 6) FPS with everything on, flying over terrain for 5 s.
await page.evaluate(() => {
  window.setTime(6000);
  window.player.teleport(0.5, 90, 0.5);
  window.player.pitch = -0.3;
  window.controller.debugMove = { forward: 1 };
});
await sleep(5000);
const fps = await page.evaluate(() => {
  window.controller.debugMove = {};
  return window.game['fpsValue'];
});

await browser.close();

const report = {
  ao: `corner top vertex ${ao.darkNearBlock.toFixed(3)} (expect < 0.85), open top ${ao.openTop.toFixed(3)} (expect 1.0)`,
  shadow: `shadowed ${shadowOn.toFixed(0)} vs sunlit ${litOn.toFixed(0)} -> ratio ${(shadowOn / litOn).toFixed(2)} (expect <= 0.7); vanilla ratio ${(shadowOff / litOff).toFixed(2)} (expect <= 0.82)`,
  pipeline: `on: ACES=${pipeline.on.toneMapping === 4} samples=${pipeline.on.samples} shadows=${pipeline.on.shadows}; vanilla: none=${pipeline.off.toneMapping === 0} shadows=${pipeline.off.shadows}`,
  bloom: `sun ring ${ringOn.toFixed(0)} on vs ${ringOff.toFixed(0)} off (expect on > off + 15)`,
  water: `waves animate=${waveMoves}, glint max ${glintOn.toFixed(0)} on vs ${glintOff.toFixed(0)} off (expect on > off + 25) at ${JSON.stringify(waterPos)}`,
  fps: `${fps} (expect ≥ 55)`,
};
console.log(JSON.stringify(report, null, 2));

const pass =
  ao.darkNearBlock < 0.85 &&
  ao.openTop > 0.99 &&
  shadowOn / litOn <= 0.7 &&
  shadowOff / litOff <= 0.82 &&
  pipeline.on.toneMapping === 4 && // ACESFilmicToneMapping
  pipeline.on.samples === 4 &&
  pipeline.on.shadows === true &&
  pipeline.off.toneMapping === 0 && // NoToneMapping
  pipeline.off.shadows === true &&
  ringOn > ringOff + 15 &&
  waveMoves &&
  glintOn > glintOff + 25 &&
  fps >= 55;

console.log(pass ? 'PASS' : 'FAIL');
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(pass && !errors.length ? 0 : 1);
