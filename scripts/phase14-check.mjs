// Phase 14 acceptance: vanilla visual baseline. AO, hard block shadows, and
// drawing-buffer anti-aliasing stay active with Vibrant Visuals off, while
// HDR, bloom, enhanced water, halo, and cloud shadows remain optional.
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
await page.evaluate(() => {
  window.app.settings.vibrantVisuals = false;
  window.app.startGame();
});
await new Promise((r) => setTimeout(r, 3500));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Controlled high-altitude fixture, isolated from terrain and cloud shadows.
await page.evaluate(() => {
  window.game['clouds'].group.visible = false;
  const stone = window.BlockId.Stone;
  for (let x = 0; x <= 24; x++) {
    for (let z = 0; z <= 24; z++) window.setBlock(x, 120, z, stone);
  }
  for (let z = 6; z <= 14; z++) {
    for (let y = 121; y <= 126; y++) window.setBlock(12, y, z, stone);
  }
  window.setBlock(5, 121, 5, stone);
  window.player.flying = true;
  window.setTime(3000);
});
await sleep(1500);

const probeDown = async (x, z) => {
  await page.evaluate(
    ({ x, z }) => {
      window.player.teleport(x, 129, z);
      window.player.pitch = -Math.PI / 2;
      window.player.yaw = 0;
      window.player.velocity.set(0, 0, 0);
    },
    { x, z },
  );
  await sleep(600);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl = window.app.renderer.getContext();
          const px = new Uint8Array(4);
          gl.readPixels(
            gl.drawingBufferWidth >> 1,
            gl.drawingBufferHeight >> 1,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px,
          );
          resolve(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
        });
      }),
  );
};

const ao = await page.evaluate(() => {
  const entry = window.game['chunkRenderer']['meshes'].get('0,0');
  const geo = entry.opaque.geometry;
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const col = geo.attributes.color.array;
  let darkNearBlock = 1;
  let openTop = 0;
  for (let i = 0; i < pos.length; i += 3) {
    if (nrm[i + 1] !== 1 || pos[i + 1] !== 121) continue;
    const x = pos[i];
    const z = pos[i + 2];
    if (x >= 4 && x <= 7 && z >= 4 && z <= 7) {
      darkNearBlock = Math.min(darkNearBlock, col[i]);
    }
    if (x >= 16 && x <= 24 && z >= 16 && z <= 24) {
      openTop = Math.max(openTop, col[i]);
    }
  }
  return { darkNearBlock, openTop };
});

const shadowed = await probeDown(9.5, 10.5);
const sunlit = await probeDown(9.5, 20.5);

const vanilla = await page.evaluate(() => {
  const game = window.game;
  const gl = window.app.renderer.getContext();
  return {
    antialias: gl.getContextAttributes()?.antialias === true,
    shadows: window.app.renderer.shadowMap.enabled,
    sunCastsShadow: game['sky']['sunLight'].castShadow,
    cloudCastsShadow: game['clouds']['mesh'].castShadow,
    haloVisible: game['sky']['halo'].visible,
    toneMapping: window.app.renderer.toneMapping,
    vibrantWater: game['chunkRenderer']['vibrantWater'],
  };
});

// Measure vanilla FPS while moving over streamed terrain.
await page.evaluate(() => {
  window.game['clouds'].group.visible = true;
  window.setTime(6000);
  window.player.teleport(0.5, 90, 0.5);
  window.player.pitch = -0.3;
  window.controller.debugMove = { forward: 1 };
});
await sleep(5000);
const vanillaFps = await page.evaluate(() => {
  window.controller.debugMove = {};
  return window.game['fpsValue'];
});

const vibrant = await page.evaluate(() => {
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
  const game = window.game;
  return {
    shadows: window.app.renderer.shadowMap.enabled,
    sunCastsShadow: game['sky']['sunLight'].castShadow,
    cloudCastsShadow: game['clouds']['mesh'].castShadow,
    haloVisible: game['sky']['halo'].visible,
    toneMapping: window.app.renderer.toneMapping,
    vibrantWater: game['chunkRenderer']['vibrantWater'],
    samples: game['composer'].renderTarget1.samples,
  };
});
await sleep(5000);
const vibrantFps = await page.evaluate(() => window.game['fpsValue']);

await page.screenshot({ path: '/tmp/phase14-vanilla-baseline.png' });
await browser.close();

const shadowRatio = shadowed / sunlit;
const report = {
  ao: `corner ${ao.darkNearBlock.toFixed(3)} (expect < 0.85), open ${ao.openTop.toFixed(3)} (expect 1.0)`,
  shadow: `${shadowed.toFixed(0)} / ${sunlit.toFixed(0)} = ${shadowRatio.toFixed(2)} (expect <= 0.82)`,
  vanilla,
  vibrant,
  fps: { vanilla: vanillaFps, vibrant: vibrantFps, minimum: 55 },
};
console.log(JSON.stringify(report, null, 2));

const pass =
  ao.darkNearBlock < 0.85 &&
  ao.openTop > 0.99 &&
  shadowRatio <= 0.82 &&
  vanilla.antialias &&
  vanilla.shadows &&
  vanilla.sunCastsShadow &&
  !vanilla.cloudCastsShadow &&
  !vanilla.haloVisible &&
  vanilla.toneMapping === 0 &&
  !vanilla.vibrantWater &&
  vibrant.shadows &&
  vibrant.sunCastsShadow &&
  vibrant.cloudCastsShadow &&
  vibrant.haloVisible &&
  vibrant.toneMapping === 4 &&
  vibrant.vibrantWater &&
  vibrant.samples === 4 &&
  vanillaFps >= 55 &&
  vibrantFps >= 55;

console.log(pass ? 'PASS' : 'FAIL');
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(pass && !errors.length ? 0 : 1);
