// Phase 17 acceptance: deterministic Overworld biomes, characteristic
// surfaces/vegetation, exact Java 26.1.2 water colors, and biome camera fog.
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
  window.app.settings.vibrantVisuals = false;
  window.app.startGame('phase17-biomes');
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await sleep(2500);

const discovery = await page.evaluate(() => {
  const generator = window.game['generator'];
  const landExpected = [
    'plains',
    'forest',
    'birch_forest',
    'taiga',
    'snowy_plains',
    'desert',
    'savanna',
    'swamp',
  ];
  const allExpected = [...landExpected, 'ocean', 'warm_ocean', 'frozen_ocean'];
  const found = {};

  const interior = (x, z, id) => {
    for (const dz of [-8, 0, 8]) {
      for (const dx of [-8, 0, 8]) {
        if (generator.biomeAt(x + dx, z + dz) !== id) return false;
      }
    }
    return true;
  };

  for (let z = -4096; z <= 4096 && Object.keys(found).length < allExpected.length; z += 32) {
    for (let x = -4096; x <= 4096; x += 32) {
      const id = generator.biomeAt(x, z);
      if (!found[id] && interior(x, z, id)) {
        found[id] = {
          x,
          z,
          height: generator.height(x, z),
          climate: generator.climateAt(x, z),
        };
      }
    }
  }

  let deterministic = true;
  for (const [id, point] of Object.entries(found)) {
    deterministic &&= generator.biomeAt(point.x, point.z) === id;
    deterministic &&= generator.height(point.x, point.z) === point.height;
  }
  return {
    found,
    deterministic,
    missing: allExpected.filter((id) => !found[id]),
    landFound: landExpected.filter((id) => found[id]).length,
  };
});

const generation = await page.evaluate((found) => {
  const generator = window.game['generator'];
  const world = window.world;
  const ids = window.BlockId;
  const result = { surfaces: {}, features: {} };
  const ensureAt = (x, z) => world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));

  for (const id of ['plains', 'forest', 'birch_forest', 'taiga', 'snowy_plains', 'desert', 'savanna', 'swamp']) {
    const point = found[id];
    ensureAt(point.x, point.z);
    result.surfaces[id] = world.getBlock(point.x, point.height, point.z);
  }

  const featureTargets = {
    oak: { biomes: ['plains', 'forest'], expected: ids.Log },
    birch: { biomes: ['birch_forest'], expected: ids.BirchLog },
    spruce: { biomes: ['taiga', 'snowy_plains'], expected: ids.SpruceLog },
    acacia: { biomes: ['savanna'], expected: ids.AcaciaLog },
  };

  for (const [name, target] of Object.entries(featureTargets)) {
    let match = null;
    for (const biome of target.biomes) {
      const center = found[biome];
      for (let radius = 0; radius <= 240 && !match; radius += 16) {
        for (let z = center.z - radius; z <= center.z + radius && !match; z += 8) {
          for (let x = center.x - radius; x <= center.x + radius; x += 8) {
            if (generator.landBiomeAt(x, z) !== biome) continue;
            ensureAt(x, z);
            const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
            for (const value of chunk.data) {
              if (value === target.expected) {
                match = { x, z, biome };
                break;
              }
            }
            if (match) break;
          }
        }
      }
    }
    result.features[name] = match;
  }

  const desert = found.desert;
  let cactus = null;
  for (let radius = 0; radius <= 320 && !cactus; radius += 16) {
    for (let z = desert.z - radius; z <= desert.z + radius && !cactus; z += 8) {
      for (let x = desert.x - radius; x <= desert.x + radius; x += 8) {
        if (generator.landBiomeAt(x, z) !== 'desert') continue;
        ensureAt(x, z);
        const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
        if (chunk.data.includes(ids.Cactus)) {
          cactus = { x, z };
          break;
        }
      }
    }
  }
  result.features.cactus = cactus;

  const frozen = found.frozen_ocean;
  ensureAt(frozen.x, frozen.z);
  result.frozenSurface = world.getBlock(frozen.x, 62, frozen.z);
  return result;
}, discovery.found);

// Controlled high-altitude water fixtures preserve the natural biome under
// each X/Z coordinate while making surface and underwater probes repeatable.
const fixtures = await page.evaluate((found) => {
  const selected = {
    normal: found.plains,
    swamp: found.swamp,
    warm_ocean: found.warm_ocean,
    frozen_ocean: found.frozen_ocean,
  };
  const out = {};
  for (const [name, point] of Object.entries(selected)) {
    const x = Math.floor(point.x / 16) * 16 + 8;
    const z = Math.floor(point.z / 16) * 16 + 8;
    out[name] = { x, z, biome: window.game['generator'].biomeAt(x, z) };
  }
  return out;
}, discovery.found);

const expectedWater = {
  normal: 0x3f76e4,
  swamp: 0x617b64,
  warm_ocean: 0x43d5ee,
  frozen_ocean: 0x3938c9,
};
const waterGeometry = { result: {}, classicColor: null, vibrantColor: null };
const underwater = {};
for (const [name, fixture] of Object.entries(fixtures)) {
  waterGeometry.result[name] = await page.evaluate(({ fixture, target }) => {
    const ids = window.BlockId;
    const renderer = window.game['chunkRenderer'];
    const { x, z } = fixture;
    window.player.flying = true;
    window.player.teleport(x + 0.5, 113, z + 0.5);
    window.world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        window.setBlock(x + dx, 109, z + dz, ids.Stone);
        for (let y = 110; y <= 115; y++) window.setBlock(x + dx, y, z + dz, ids.Water);
        for (let y = 116; y <= 117; y++) window.setBlock(x + dx, y, z + dz, ids.Air);
      }
    }
    renderer.update(Infinity);
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    const colors = renderer['meshes'].get(key)?.water?.geometry.attributes.color.array ?? [];
    const rgb = [((target >> 16) & 255) / 255, ((target >> 8) & 255) / 255, (target & 255) / 255];
    let exactVertices = 0;
    for (let i = 0; i < colors.length; i += 3) {
      if (
        Math.abs(colors[i] - rgb[0]) < 1e-5 &&
        Math.abs(colors[i + 1] - rgb[1]) < 1e-5 &&
        Math.abs(colors[i + 2] - rgb[2]) < 1e-5
      ) exactVertices++;
    }
    return { expected: target, exactVertices, vertexCount: colors.length / 3 };
  }, { fixture, target: expectedWater[name] });

  for (const vibrant of [false, true]) {
    await page.evaluate((on) => {
      window.app.settings.vibrantVisuals = on;
      window.applyVisuals();
    }, vibrant);
    await sleep(180);
    underwater[`${vibrant ? 'vibrant' : 'classic'}:${name}`] = await page.evaluate(() => {
      const game = window.game;
      const fog = game['scene'].fog;
      return {
        fogColor: fog.color.getHex(),
        viewColor: game['sky'].viewColor.getHex(),
        fogNear: fog.near,
        fogFar: fog.far,
        overlayColor: game['underwaterOverlay']['material'].color.getHex(),
      };
    });
  }
}
const waterMaterials = await page.evaluate(() => {
  // Water is now one unified vanilla material (white base, biome tint comes
  // through vertex colors) used in both profiles.
  const mat = window.game['chunkRenderer']['waterMat'];
  return { classicColor: mat.color.getHex(), vibrantColor: mat.color.getHex() };
});
waterGeometry.classicColor = waterMaterials.classicColor;
waterGeometry.vibrantColor = waterMaterials.vibrantColor;

await page.evaluate(({ x, z }) => {
  window.player.teleport(x + 0.5, 117, z + 0.5);
  window.game.toggleDebugOverlay();
}, fixtures.normal);
await sleep(250);
const surfaced = await page.evaluate(() => {
  const game = window.game;
  return {
    fogFar: game['scene'].fog.far,
    viewMatchesSky: game['sky'].viewColor.getHex() === game['sky'].skyColor.getHex(),
    debug: document.getElementById('debug-overlay').textContent,
  };
});

// Measure frame delivery while progressively streaming distance 6.
const performance = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window.app.settings.renderDistance = 6;
  window.player.flying = true;
  window.controller.debugMove = { forward: 1, sprint: true };
  const gaps = [];
  let previous = window.performance.now();
  let running = true;
  const frame = (now) => {
    gaps.push(now - previous);
    previous = now;
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  await sleep(3000);
  running = false;
  window.controller.debugMove = {};
  return {
    frames: gaps.length,
    fps: gaps.length / 3,
    maxGap: Math.max(...gaps),
  };
});

// Visual records: one cold forest and one warm dry/water region.
await page.evaluate((fixtures) => {
  const renderer = window.game['chunkRenderer'];
  for (const fixture of Object.values(fixtures)) {
    const cx = Math.floor(fixture.x / 16);
    const cz = Math.floor(fixture.z / 16);
    renderer.disposeChunk(cx, cz);
    window.world.removeChunk(cx, cz);
  }
}, fixtures);
for (const name of ['taiga', 'desert', 'swamp', 'warm_ocean']) {
  const point = discovery.found[name];
  await page.evaluate(({ x, z, height }) => {
    window.player.flying = true;
    window.player.teleport(x + 0.5, Math.max(height + 14, 78), z + 0.5);
    window.player.pitch = -0.38;
    window.player.yaw = Math.PI * 0.25;
  }, point);
  await sleep(900);
  await page.screenshot({ path: `/tmp/phase17-${name}.png` });
}

const boundaryBlend = await page.evaluate((warm) => {
  const game = window.game;
  const generator = game['generator'];
  const renderer = game['chunkRenderer'];
  const colorAt = (x, z) => window.BIOMES[generator.biomeAt(x, z)].waterColor;
  let boundary = null;
  for (let z = warm.z - 512; z <= warm.z + 512 && !boundary; z += 8) {
    for (let x = warm.x - 512; x <= warm.x + 512; x += 8) {
      const a = colorAt(x, z);
      for (const [dx, dz] of [[8, 0], [0, 8]]) {
        const b = colorAt(x + dx, z + dz);
        if (a === b) continue;
        for (let step = 0; step < 8; step++) {
          const x0 = x + Math.sign(dx) * step;
          const z0 = z + Math.sign(dz) * step;
          const x1 = x0 + Math.sign(dx);
          const z1 = z0 + Math.sign(dz);
          const c0 = colorAt(x0, z0);
          const c1 = colorAt(x1, z1);
          if (c0 !== c1) {
            boundary = { x: x0, z: z0, dx: Math.sign(dx), dz: Math.sign(dz), a: c0, b: c1 };
            break;
          }
        }
        if (boundary) break;
      }
      if (boundary) break;
    }
  }
  if (!boundary) return { found: false, blended: false };

  for (let z = boundary.z - 2; z <= boundary.z + 2; z++) {
    for (let x = boundary.x - 2; x <= boundary.x + 2; x++) {
      window.world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
      window.setBlock(x, 114, z, window.BlockId.Stone);
      window.setBlock(x, 115, z, window.BlockId.Water);
      window.setBlock(x, 116, z, window.BlockId.Air);
    }
  }
  window.player.teleport(boundary.x + 0.5, 118, boundary.z + 0.5);
  renderer.update(Infinity);

  const channels = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const a = channels(boundary.a);
  const b = channels(boundary.b);
  let blended = false;
  for (const key of renderer.loadedMeshKeys) {
    const mesh = renderer['meshes'].get(key)?.water;
    const positions = mesh?.geometry.attributes.position.array ?? [];
    const colors = mesh?.geometry.attributes.color.array ?? [];
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < 114) continue;
      const color = [colors[i], colors[i + 1], colors[i + 2]];
      const endpoint = [a, b].some((end) => color.every((value, channel) => Math.abs(value - end[channel]) < 1e-5));
      const bounded = color.every(
        (value, channel) => value >= Math.min(a[channel], b[channel]) - 1e-5 &&
          value <= Math.max(a[channel], b[channel]) + 1e-5,
      );
      if (!endpoint && bounded) blended = true;
    }
  }
  return { found: true, blended, boundary };
}, discovery.found.warm_ocean);
await browser.close();

const fogExpected = {
  normal: { color: 0x050533, scale: 1 },
  swamp: { color: 0x232317, scale: 0.85 },
  warm_ocean: { color: 0x041f33, scale: 1 },
  frozen_ocean: { color: 0x050533, scale: 1 },
};
const baseFogFar = 20;
const underwaterPass = Object.entries(underwater).every(([key, value]) => {
  const name = key.split(':')[1];
  const expected = fogExpected[name];
  return (
    value.fogColor === expected.color &&
    value.viewColor === expected.color &&
    value.overlayColor === expected.color &&
    value.fogNear === 0.5 &&
    Math.abs(value.fogFar - baseFogFar * expected.scale) < 0.02
  );
});

const report = {
  discovery,
  generation,
  fixtures,
  waterGeometry,
  underwater,
  surfaced,
  performance,
  boundaryBlend,
  errors,
};
console.log(JSON.stringify(report, null, 2));

const pass =
  discovery.deterministic &&
  discovery.missing.length === 0 &&
  discovery.landFound === 8 &&
  generation.surfaces.desert === 8 &&
  generation.surfaces.snowy_plains === 11 &&
  generation.frozenSurface === 12 &&
  Object.values(generation.features).every(Boolean) &&
  Object.values(waterGeometry.result).every((entry) => entry.exactVertices > 0) &&
  waterGeometry.classicColor === 0xffffff &&
  waterGeometry.vibrantColor === 0xffffff &&
  boundaryBlend.found &&
  boundaryBlend.blended &&
  underwaterPass &&
  surfaced.fogFar > 80 &&
  surfaced.viewMatchesSky &&
  surfaced.debug.includes('biome ') &&
  performance.fps >= 55 &&
  performance.maxGap < 250 &&
  errors.length === 0;

console.log(pass ? 'PASS: Phase 17 acceptance verified.' : 'FAIL: Phase 17 acceptance failed.');
process.exit(pass ? 0 : 1);
