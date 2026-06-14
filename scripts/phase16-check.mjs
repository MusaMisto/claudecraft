// Phase 16 acceptance: half-texel atlas sampling, seamless sand fields,
// deterministic temperate foliage, and edit-aware crossed-quad rendering.
import puppeteer from 'puppeteer-core';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
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
await page.goto(baseUrl, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.app.startGame('phase16-foliage'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await sleep(3000);

const atlas = await page.evaluate(() => {
  const textureAtlas = window.game['atlas'];
  const size = textureAtlas.canvas.width;
  const tileSize = 64;
  const origin = textureAtlas.pixelOrigin('sand');
  const rect = textureAtlas.uvRect('sand');
  return {
    size,
    tileSize,
    origin,
    rect,
    inset: {
      left: rect.u0 * size - origin.x,
      top: rect.v0 * size - origin.y,
      right: origin.x + tileSize - rect.u1 * size,
      bottom: origin.y + tileSize - rect.v1 * size,
    },
  };
});

// Sample a broad coordinate range without generating chunks. This checks the
// fixed-seed selection itself, including variety and repeatability.
const selection = await page.evaluate(() => {
  const generator = window.game['generator'];
  const counts = {};
  let deterministic = true;
  for (let z = -128; z < 128; z++) {
    for (let x = -128; x < 128; x++) {
      const first = generator.foliageAt(x, z);
      const second = generator.foliageAt(x, z);
      if (first !== second) deterministic = false;
      if (first) counts[first] = (counts[first] ?? 0) + 1;
    }
  }
  return { counts, deterministic, variants: Object.keys(counts).length };
});

// Build a controlled grass surface in one chunk. Foliage is derived by the
// mesher, so world storage above every plant must remain Air.
const fixture = await page.evaluate(() => {
  const game = window.game;
  const generator = game['generator'];
  let cx = 0;
  let cz = 0;
  outer: for (let scanZ = -32; scanZ <= 32; scanZ++) {
    for (let scanX = -32; scanX <= 32; scanX++) {
      let candidates = 0;
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          if (generator.foliageAt(scanX * 16 + x, scanZ * 16 + z)) candidates++;
        }
      }
      if (candidates >= 8) {
        cx = scanX;
        cz = scanZ;
        break outer;
      }
    }
  }
  const chunk = window.world.ensureChunk(cx, cz);
  const originX = cx * 16;
  const originZ = cz * 16;
  const candidates = [];
  let maximumHeight = 0;
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const worldX = originX + x;
      const worldZ = originZ + z;
      const height = generator.height(worldX, worldZ);
      maximumHeight = Math.max(maximumHeight, height);
      for (let y = 0; y < height; y++) chunk.set(x, y, z, window.BlockId.Stone);
      chunk.set(x, height, z, window.BlockId.Grass);
      for (let y = height + 1; y < 128; y++) chunk.set(x, y, z, window.BlockId.Air);
      const kind = generator.foliageAt(worldX, worldZ);
      if (kind) candidates.push({ x: worldX, y: height, z: worldZ, kind });
    }
  }
  const key = `${cx},${cz}`;
  window.world.dirty.add(key);
  window.player.flying = true;
  window.player.teleport(originX + 8.5, maximumHeight + 4, originZ + 15.5);
  return {
    key,
    center: { x: originX + 8.5, z: originZ + 15.5 },
    candidates,
    maximumHeight,
    allDecorationCellsAir: candidates.every(
      ({ x, y, z }) => window.world.getBlock(x, y + 1, z) === window.BlockId.Air,
    ),
  };
});
await sleep(500);

const meshBefore = await page.evaluate((key) => {
  const renderer = window.game['chunkRenderer'];
  const entry = renderer['meshes'].get(key);
  const mesh = entry?.foliage;
  return {
    exists: Boolean(mesh),
    indices: mesh?.geometry.index?.count ?? 0,
    vertices: mesh?.geometry.attributes.position.count ?? 0,
    alphaTest: renderer['foliageMat'].alphaTest,
    side: renderer['foliageMat'].side,
    castShadow: mesh?.castShadow ?? false,
    receiveShadow: mesh?.receiveShadow ?? false,
  };
}, fixture.key);
await page.evaluate((fixture) => {
  window.setTime(6000);
  window.player.flying = true;
  window.player.teleport(fixture.center.x, fixture.maximumHeight + 4, fixture.center.z);
  window.player.pitch = -0.32;
  window.player.yaw = 0;
}, fixture);
await sleep(300);
await page.screenshot({ path: '/tmp/phase16-foliage.png' });

const edits = await page.evaluate((candidates) => {
  const [unsupported, covered] = candidates;
  window.setBlock(unsupported.x, unsupported.y, unsupported.z, window.BlockId.Dirt);
  window.setBlock(covered.x, covered.y + 1, covered.z, window.BlockId.Stone);
  return { unsupported, covered };
}, fixture.candidates);
await sleep(500);

const meshAfter = await page.evaluate((key) => {
  const mesh = window.game['chunkRenderer']['meshes'].get(key)?.foliage;
  return {
    indices: mesh?.geometry.index?.count ?? 0,
    vertices: mesh?.geometry.attributes.position.count ?? 0,
  };
}, fixture.key);

// Replace the fixture with a broad sand platform and look straight down.
// WebGL pixels exclude DOM HUD elements; remove the in-world target outline.
await page.evaluate((fixture) => {
  const game = window.game;
  game['scene'].remove(window.interaction.highlight);
  const centerX = Math.floor(fixture.center.x);
  const centerZ = Math.floor(fixture.center.z);
  for (let z = centerZ - 16; z <= centerZ + 16; z++) {
    for (let x = centerX - 16; x <= centerX + 16; x++) {
      window.setBlock(x, 110, z, window.BlockId.Sand);
      for (let y = 111; y <= 113; y++) window.setBlock(x, y, z, window.BlockId.Air);
    }
  }
  window.setTime(6000);
  window.player.flying = true;
  window.player.teleport(centerX + 0.5, 118, centerZ + 0.5);
  window.player.pitch = -Math.PI / 2 + 0.001;
  window.player.yaw = 0;
}, fixture);
await sleep(900);

const sandPixels = await page.evaluate(
  () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        const gl = window.app.renderer.getContext();
        const width = 360;
        const height = 360;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(
          (gl.drawingBufferWidth - width) >> 1,
          (gl.drawingBufferHeight - height) >> 1,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        let darkPixels = 0;
        let minimum = 255;
        let total = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
          minimum = Math.min(minimum, luminance);
          total += luminance;
          if (luminance < 55) darkPixels++;
        }
        resolve({
          darkPixels,
          minimum,
          average: total / (pixels.length / 4),
          sampled: pixels.length / 4,
        });
      });
    }),
);
await page.screenshot({ path: '/tmp/phase16-sand.png' });
await browser.close();

const totalPlants = Object.values(selection.counts).reduce((sum, count) => sum + count, 0);
const flowerCounts = ['dandelion', 'poppy', 'cornflower', 'oxeye_daisy', 'wildflowers']
  .map((kind) => selection.counts[kind] ?? 0);
const grassCount = (selection.counts.short_grass ?? 0) + (selection.counts.tall_grass ?? 0);
const halfTexel = Object.values(atlas.inset).every((value) => Math.abs(value - 0.5) < 1e-6);
const expectedBeforeIndices = fixture.candidates.length * 24;
const expectedBeforeVertices = fixture.candidates.length * 8;
const expectedAfterIndices = Math.max(0, fixture.candidates.length - 2) * 24;
const expectedAfterVertices = Math.max(0, fixture.candidates.length - 2) * 8;

const report = {
  atlas,
  selection: { ...selection, totalPlants, grassCount, largestFlower: Math.max(...flowerCounts) },
  fixture: { candidates: fixture.candidates.length, allDecorationCellsAir: fixture.allDecorationCellsAir },
  meshBefore,
  edits,
  meshAfter,
  sandPixels,
  errors,
};
console.log(JSON.stringify(report, null, 2));

const pass =
  halfTexel &&
  selection.deterministic &&
  selection.variants >= 6 &&
  totalPlants > 0 &&
  grassCount > Math.max(...flowerCounts) &&
  fixture.candidates.length >= 2 &&
  fixture.allDecorationCellsAir &&
  meshBefore.exists &&
  meshBefore.indices === expectedBeforeIndices &&
  meshBefore.vertices === expectedBeforeVertices &&
  meshBefore.alphaTest >= 0.4 &&
  meshBefore.side === 0 &&
  meshBefore.castShadow &&
  meshBefore.receiveShadow &&
  meshAfter.indices === expectedAfterIndices &&
  meshAfter.vertices === expectedAfterVertices &&
  sandPixels.darkPixels === 0 &&
  sandPixels.minimum >= 55 &&
  errors.length === 0;

console.log(pass ? 'PASS: Phase 16 acceptance verified.' : 'FAIL: Phase 16 acceptance failed.');
process.exit(pass ? 0 : 1);
