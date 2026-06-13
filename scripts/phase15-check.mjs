// Phase 15 acceptance: unified clouds, Minecraft-like underwater camera
// rendering, Vibrant Visuals default off, and render distance 12 / max 16.
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

const defaults = await page.evaluate(() => {
  window.app.optionsMenu.show();
  const row = [...document.querySelectorAll('#options-menu .option-row')].find((el) =>
    el.textContent.includes('Render Distance'),
  );
  const slider = row?.querySelector('input[type="range"]');
  window.app.optionsMenu.hide();
  return {
    vibrantVisuals: window.app.settings.vibrantVisuals,
    renderDistance: window.app.settings.renderDistance,
    sliderMax: Number(slider?.max),
  };
});

await page.evaluate(() => window.app.startGame('phase15-underwater'));
await new Promise((r) => setTimeout(r, 3500));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Unified cloud topology: no duplicate opposing quads on shared cell
// boundaries, and substantially fewer faces than isolated boxes.
const cloud = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clouds = window.game['clouds'];
  const mesh = clouds['mesh'];
  const geo = mesh.geometry;
  const positions = geo.attributes.position.array;
  const index = geo.index.array;
  const faceKeys = new Map();
  for (let i = 0; i < index.length; i += 6) {
    const vertices = [...new Set(Array.from(index.slice(i, i + 6)))].map((vertex) => {
      const p = vertex * 3;
      return `${positions[p].toFixed(3)},${positions[p + 1].toFixed(3)},${positions[p + 2].toFixed(3)}`;
    });
    const key = vertices.sort().join('|');
    faceKeys.set(key, (faceKeys.get(key) ?? 0) + 1);
  }
  const duplicateSharedFaces = [...faceKeys.values()].filter((count) => count > 1).length;
  const stats = clouds.meshStats;
  const x0 = clouds.group.position.x;
  const noon = mesh.material.color.getHex();
  await sleep(1000);
  const drift = clouds.group.position.x - x0;
  window.setTime(18000);
  await sleep(200);
  const night = mesh.material.color.getHex();
  window.app.settings.vibrantVisuals = true;
  window.applyVisuals();
  const shadowOn = mesh.castShadow;
  window.app.settings.vibrantVisuals = false;
  window.applyVisuals();
  const shadowOff = mesh.castShadow;
  return {
    ...stats,
    duplicateSharedFaces,
    drift,
    retinted: noon !== night,
    shadowOn,
    shadowOff,
  };
});

// Build a deep, controlled water tank in a normal-water biome so this phase's
// original blue-water contract remains stable as the world gains biomes.
const tank = await page.evaluate(() => {
  const generator = window.game['generator'];
  let center = { x: 0, z: 0 };
  outer: for (let z = -512; z <= 512; z += 16) {
    for (let x = -512; x <= 512; x += 16) {
      if (window.BIOMES[generator.biomeAt(x + 8, z + 8)].waterFogColor === 0x050533) {
        center = { x: x + 8, z: z + 8 };
        break outer;
      }
    }
  }
  const stone = window.BlockId.Stone;
  const water = window.BlockId.Water;
  for (let cz = Math.floor((center.z - 5) / 16); cz <= Math.floor((center.z + 5) / 16); cz++) {
    for (let cx = Math.floor((center.x - 5) / 16); cx <= Math.floor((center.x + 5) / 16); cx++) {
      window.world.ensureChunk(cx, cz);
    }
  }
  for (let x = center.x - 5; x <= center.x + 5; x++) {
    for (let z = center.z - 5; z <= center.z + 5; z++) {
      window.setBlock(x, 109, z, stone);
      for (let y = 110; y <= 115; y++) window.setBlock(x, y, z, water);
    }
  }
  window.player.flying = true;
  window.player.teleport(center.x + 0.5, 113, center.z + 0.5);
  window.setTime(6000);
  return {
    ...center,
    fogColor: window.BIOMES[generator.biomeAt(center.x, center.z)].waterFogColor,
  };
});
await sleep(900);

const sampleCenter = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl = window.app.renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const size = 32;
          const px = new Uint8Array(size * size * 4);
          gl.readPixels((w - size) >> 1, (h - size) >> 1, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let r = 0;
          let g = 0;
          let b = 0;
          for (let i = 0; i < px.length; i += 4) {
            r += px[i];
            g += px[i + 1];
            b += px[i + 2];
          }
          const n = px.length / 4;
          resolve({ r: r / n, g: g / n, b: b / n });
        });
      }),
  );

const underwaterProfile = async (vibrant) => {
  await page.evaluate(({ on, tank }) => {
    window.app.settings.vibrantVisuals = on;
    window.applyVisuals();
    window.player.teleport(tank.x + 0.5, 113, tank.z + 0.5); // eye below y=116 surface
    window.player.pitch = Math.PI / 2 - 0.05;
    window.player.yaw = 0;
  }, { on: vibrant, tank });
  await sleep(350);
  const pixels = await sampleCenter();
  const underwater = await page.evaluate(() => {
    const game = window.game;
    const fog = game['scene'].fog;
    return {
      fogNear: fog.near,
      fogFar: fog.far,
      fogColor: fog.color.getHex(),
      viewColor: game['sky'].viewColor.getHex(),
      skyColor: game['sky'].skyColor.getHex(),
      overlayColor: game['underwaterOverlay']['material'].color.getHex(),
      // Water is now one unified vanilla material used in both profiles.
      classicSide: game['chunkRenderer']['waterMat'].side,
      vibrantSide: game['chunkRenderer']['waterMat'].side,
    };
  });

  await page.evaluate((tank) => {
    window.player.teleport(tank.x + 0.5, 116.5, tank.z + 0.5);
    window.player.pitch = 0;
  }, tank);
  await sleep(250);
  const surfaced = await page.evaluate(() => {
    const game = window.game;
    const fog = game['scene'].fog;
    return {
      fogFar: fog.far,
      viewMatchesSky: game['sky'].viewColor.getHex() === game['sky'].skyColor.getHex(),
    };
  });
  return { pixels, underwater, surfaced };
};

const underwaterVanilla = await underwaterProfile(false);
const underwaterVibrant = await underwaterProfile(true);

// 3) Distance 16 streams beyond the old max while animation frames continue.
const distance16 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gaps = [];
  let previous = performance.now();
  let running = true;
  const frame = (now) => {
    gaps.push(now - previous);
    previous = now;
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.app.settings.renderDistance = 16;
  await sleep(4000);
  running = false;
  const px = Math.floor(window.player.position.x / 16);
  const pz = Math.floor(window.player.position.z / 16);
  let farthestData = 0;
  for (const key of window.world.chunks.keys()) {
    const [x, z] = key.split(',').map(Number);
    farthestData = Math.max(farthestData, Math.max(Math.abs(x - px), Math.abs(z - pz)));
  }
  let farthestMesh = 0;
  for (const key of window.game['chunkRenderer'].loadedMeshKeys) {
    const [x, z] = key.split(',').map(Number);
    farthestMesh = Math.max(farthestMesh, Math.max(Math.abs(x - px), Math.abs(z - pz)));
  }
  return {
    farthestData,
    farthestMesh,
    frames: gaps.length,
    maxFrameGap: Math.max(...gaps),
  };
});

await page.screenshot({ path: '/tmp/phase15-underwater.png' });

// One restart at the new default verifies that the larger initial stream and
// underwater overlay release their GPU resources with the normal lifecycle.
await page.evaluate(() => {
  window.app.settings.renderDistance = 12;
  window.app.settings.vibrantVisuals = false;
  window.app.quitToTitle();
});
await sleep(900);
const lifecycle = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = window.app;
  const baseline = { ...app.renderer.info.memory };
  app.startGame();
  await sleep(2500);
  app.quitToTitle();
  await sleep(800);
  return {
    baseline,
    after: { ...app.renderer.info.memory },
    menuBack: app.game === null,
  };
});

await browser.close();

const waterVisible = (profile) =>
  profile.pixels.b > profile.pixels.r + 4 &&
  profile.underwater.fogFar <= 32 &&
  profile.underwater.fogNear <= 1 &&
  profile.underwater.fogColor === tank.fogColor &&
  profile.underwater.viewColor === tank.fogColor &&
  profile.underwater.overlayColor === tank.fogColor &&
  profile.underwater.classicSide === 2 &&
  profile.underwater.vibrantSide === 2 &&
  profile.surfaced.fogFar > 100 &&
  profile.surfaced.viewMatchesSky;

const report = {
  defaults,
  cloud,
  tank,
  underwaterVanilla,
  underwaterVibrant,
  distance16,
  lifecycle,
};
console.log(JSON.stringify(report, null, 2));

const pass =
  defaults.vibrantVisuals === false &&
  defaults.renderDistance === 12 &&
  defaults.sliderMax === 16 &&
  cloud.occupiedCells > 0 &&
  cloud.renderedQuads < cloud.occupiedCells * 6 &&
  cloud.duplicateSharedFaces === 0 &&
  cloud.drift < -0.4 &&
  cloud.retinted &&
  cloud.shadowOn &&
  !cloud.shadowOff &&
  waterVisible(underwaterVanilla) &&
  waterVisible(underwaterVibrant) &&
  distance16.farthestData >= 12 &&
  distance16.farthestMesh >= 11 &&
  distance16.frames >= 120 &&
  distance16.maxFrameGap < 250 &&
  lifecycle.menuBack &&
  lifecycle.after.textures === lifecycle.baseline.textures &&
  lifecycle.after.geometries <= lifecycle.baseline.geometries + 3;

console.log(pass ? 'PASS' : 'FAIL');
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(pass && !errors.length ? 0 : 1);
