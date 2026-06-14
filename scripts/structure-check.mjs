import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`[console.error] ${message.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
const result = await page.evaluate(() => {
  window.app.startGame('structure-check-bootstrap');
  const TerrainGenerator = window.generator.constructor;
  const World = window.world.constructor;
  const seeds = ['cloud-amber', 'cloud-cobalt', 'cloud-fern', 'cloud-rain', 'cloud-snow'];
  const required = [
    'stone_cairn',
    'small_ruin',
    'forest_waystone',
    'settler_village',
    'desert_sun_temple',
    'mountain_watchtower',
    'coastal_ruins',
    'cloudwright_obelisk',
    'buried_archive',
    'ancient_gate',
  ];
  const bounds = { minX: -3500, minY: 0, minZ: -3500, maxX: 3500, maxY: 127, maxZ: 3500 };
  const summaries = [];
  const failures = [];
  let crossing = null;

  const placementKey = (placement) =>
    `${placement.id}:${placement.originX},${placement.originY},${placement.originZ}:${placement.rotation}`;
  const chunkRange = (placement) => {
    const box = placement.boundingBox;
    const chunks = [];
    for (let cz = Math.floor(box.minZ / 16); cz <= Math.floor(box.maxZ / 16); cz++) {
      for (let cx = Math.floor(box.minX / 16); cx <= Math.floor(box.maxX / 16); cx++) chunks.push([cx, cz]);
    }
    return chunks;
  };
  const hashChunk = (chunk) => {
    let hash = 0x811c9dc5;
    for (const value of chunk.data) {
      hash ^= value;
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  };

  for (const seed of seeds) {
    const started = performance.now();
    const generator = new TerrainGenerator(seed);
    const placements = generator.structures.placementsInBounds(bounds);
    const repeat = new TerrainGenerator(seed).structures.placementsInBounds(bounds);
    const signature = placements.slice(0, 100).map(placementKey).join('|');
    const repeatSignature = repeat.slice(0, 100).map(placementKey).join('|');
    if (signature !== repeatSignature) failures.push(`${seed}: placement signature changed`);

    const counts = Object.fromEntries(required.map((id) => [id, 0]));
    for (const placement of placements) {
      counts[placement.id]++;
      const biome = placement.biome;
      if (placement.id === 'desert_sun_temple' && !['desert', 'savanna'].includes(biome)) {
        failures.push(`${seed}: temple in ${biome}`);
      }
      if (placement.id === 'forest_waystone' && !['forest', 'birch_forest', 'taiga'].includes(biome)) {
        failures.push(`${seed}: waystone in ${biome}`);
      }
      if (
        placement.id === 'settler_village' &&
        !['plains', 'forest', 'birch_forest', 'taiga', 'savanna'].includes(biome)
      ) {
        failures.push(`${seed}: village in ${biome}`);
      }
      if (placement.id === 'mountain_watchtower' && placement.originY < 83) {
        failures.push(`${seed}: low watchtower at y=${placement.originY}`);
      }
      if (
        placement.id === 'coastal_ruins' &&
        (!generator.isNearWater(placement.originX, placement.originZ, 10) || placement.originY > 69)
      ) {
        failures.push(`${seed}: invalid coastal ruin`);
      }
      if (
        placement.id === 'ancient_gate' &&
        Math.hypot(placement.originX, placement.originZ) < 12 * 16
      ) {
        failures.push(`${seed}: ancient gate too close to spawn`);
      }
    }
    for (const id of required) {
      if (counts[id] === 0) failures.push(`${seed}: missing ${id}`);
    }

    const sampleById = new Map();
    for (const placement of placements) {
      if (!sampleById.has(placement.id)) sampleById.set(placement.id, placement);
    }
    for (const placement of sampleById.values()) {
      const blocks = generator.structures.blocksForPlacement(placement);
      const keys = new Set(blocks.map((block) => `${block.x},${block.y},${block.z}`));
      for (const block of blocks) {
        if (
          block.y !== placement.originY ||
          block.block === 0 ||
          block.replaceRule === 'always' ||
          block.replaceRule === 'path'
        ) continue;
        const surface = generator.height(block.x, block.z);
        for (let y = surface + 1; y < placement.originY; y++) {
          if (!keys.has(`${block.x},${y},${block.z}`)) {
            failures.push(`${seed}: unsupported ${placement.id} floor at ${block.x},${block.z}`);
            break;
          }
        }
      }
    }

    crossing ??= placements.find((placement) => {
      const chunks = chunkRange(placement);
      return placement.id === 'settler_village' && chunks.length >= 4;
    });
    summaries.push({
      seed,
      placements: placements.length,
      counts,
      scanMs: Math.round(performance.now() - started),
    });
  }

  let crossChunk = null;
  if (!crossing) {
    failures.push('no cross-chunk village found');
  } else {
    const generator = new TerrainGenerator('cloud-amber');
    const candidates = generator.structures.placementsInBounds(bounds);
    crossing = candidates.find((placement) => placementKey(placement) === placementKey(crossing)) ?? candidates.find(
      (placement) => placement.id === 'settler_village' && chunkRange(placement).length >= 4,
    );
    const chunks = chunkRange(crossing);
    for (const [cx, cz] of chunks) {
      const overlap = generator.structures.placementsOverlappingChunk(cx, cz).some(
        (placement) => placementKey(placement) === placementKey(crossing),
      );
      if (!overlap) failures.push(`cross-chunk query missed ${cx},${cz}`);
    }

    const worldA = new World(generator);
    for (const [cx, cz] of chunks) worldA.ensureChunk(cx, cz);
    const generatorB = new TerrainGenerator('cloud-amber');
    const worldB = new World(generatorB);
    for (const [cx, cz] of [...chunks].reverse()) worldB.ensureChunk(cx, cz);
    const hashesA = chunks.map(([cx, cz]) => hashChunk(worldA.getChunk(cx, cz)));
    const hashesB = chunks.map(([cx, cz]) => hashChunk(worldB.getChunk(cx, cz)));
    if (hashesA.join(',') !== hashesB.join(',')) failures.push('chunk data depends on load order');
    crossChunk = { placement: placementKey(crossing), chunks: chunks.length, hashes: hashesA };
  }

  return { summaries, crossChunk, failures };
});

await browser.close();
console.log(JSON.stringify({ ...result, runtimeErrors }, null, 2));
if (runtimeErrors.length || result.failures.length) process.exit(1);
