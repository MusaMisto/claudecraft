// Passive-mob acceptance: three seeds, spawn validity/caps, biome variants,
// deterministic sheep colors, movement/state coverage, audio, debug UI,
// lifecycle cleanup, and frame delivery.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seedReports = [];
const species = new Set();

for (const seed of ['passive-alpha', 'passive-beta', 'passive-gamma']) {
  await page.evaluate((worldSeed) => {
    window.app.settings.renderDistance = 6;
    window.app.settings.vibrantVisuals = false;
    window.app.startGame(worldSeed);
  }, seed);
  await sleep(6500);
  const before = await page.evaluate(() =>
    [...window.mobs.entities.values()].map((mob) => ({
      id: mob.id,
      x: mob.position.x,
      z: mob.position.z,
    })),
  );
  await sleep(3000);
  const report = await page.evaluate((initial) => {
    const initialById = new Map(initial.map((entry) => [entry.id, entry]));
    const mobs = [...window.mobs.entities.values()];
    const player = window.player.position;
    const byChunk = {};
    const states = {};
    let near = 0;
    let moved = 0;
    let invalidSpawn = 0;
    let invalidCurrent = 0;
    let variantMismatch = 0;
    for (const mob of mobs) {
      byChunk[mob.homeChunk] = (byChunk[mob.homeChunk] ?? 0) + 1;
      states[mob.state] = (states[mob.state] ?? 0) + 1;
      if (mob.position.distanceToSquared(player) <= 64 ** 2) near++;
      const old = initialById.get(mob.id);
      if (old && Math.hypot(mob.position.x - old.x, mob.position.z - old.z) > 0.2) moved++;
      if (!Number.isFinite(mob.position.x + mob.position.y + mob.position.z) || mob.position.y < 0) {
        invalidCurrent++;
      }

      const spawn = mob.spawnPosition;
      const x = Math.floor(spawn.x);
      const z = Math.floor(spawn.z);
      const groundY = Math.floor(spawn.y) - 1;
      const ground = window.world.getBlock(x, groundY, z);
      if (ground !== window.BlockId.Grass && ground !== window.BlockId.Snow) invalidSpawn++;
      const expectedVariant = window.animalVariantAt(x, z);
      if (mob.variant !== expectedVariant) variantMismatch++;
      const half = mob.physics.width * 0.5;
      for (let y = Math.floor(spawn.y); y <= Math.floor(spawn.y + mob.physics.height - 1e-6); y++) {
        for (let bz = Math.floor(spawn.z - half); bz <= Math.floor(spawn.z + half - 1e-6); bz++) {
          for (let bx = Math.floor(spawn.x - half); bx <= Math.floor(spawn.x + half - 1e-6); bx++) {
            const block = window.world.getBlock(bx, y, bz);
            if (block === window.BlockId.Water || block === window.BlockId.Glass) invalidSpawn++;
          }
        }
      }
    }
    return {
      counts: window.mobs.counts(),
      kinds: [...new Set(mobs.map((mob) => mob.kind))],
      variants: [...new Set(mobs.map((mob) => mob.variant))],
      woolColors: [...new Set(mobs.filter((mob) => mob.kind === 'sheep').map((mob) => mob.woolColor))],
      maxPerChunk: Math.max(0, ...Object.values(byChunk)),
      near,
      moved,
      states,
      invalidSpawn,
      invalidCurrent,
      variantMismatch,
      mobChunks: window.mobs.spawner.activeChunkCount,
    };
  }, before);
  for (const kind of report.kinds) species.add(kind);
  seedReports.push({ seed, ...report });
  await page.evaluate(() => window.app.quitToTitle());
  await sleep(500);
}

await page.evaluate(() => {
  window.app.settings.renderDistance = 5;
  window.app.startGame('passive-biome-variants');
});
await sleep(1200);

const variantChecks = await page.evaluate(() => {
  const generator = window.generator;
  const find = (biome, variant) => {
    for (let z = -4096; z <= 4096; z += 32) {
      for (let x = -4096; x <= 4096; x += 32) {
        if (generator.height(x, z) <= 64) continue;
        if (generator.landBiomeAt(x, z) !== biome) continue;
        if (window.animalVariantAt(x, z) !== variant) continue;
        let interior = true;
        for (const [dx, dz] of [[-48, 0], [48, 0], [0, -48], [0, 48]]) {
          if (
            generator.landBiomeAt(x + dx, z + dz) !== biome ||
            window.animalVariantAt(x + dx, z + dz) !== variant
          ) {
            interior = false;
          }
        }
        if (interior) return { x, z, y: generator.height(x, z) + 12 };
      }
    }
    return null;
  };
  return {
    warm: find('savanna', 'warm'),
    cold: find('taiga', 'cold') ?? find('snowy_plains', 'cold'),
    temperate: find('plains', 'temperate') ?? find('forest', 'temperate'),
    wool: {
      temperate: window.selectSheepWoolColor('temperate', 0.1),
      cold: window.selectSheepWoolColor('cold', 0.1),
      warm: window.selectSheepWoolColor('warm', 0.1),
      pink: window.selectSheepWoolColor('warm', 0.999),
      repeat: window.selectSheepWoolColor('warm', 0.1),
    },
  };
});

const naturalVariants = {};
for (const name of ['warm', 'cold', 'temperate']) {
  const point = variantChecks[name];
  if (!point) {
    naturalVariants[name] = { missingPoint: true, count: 0, mismatches: 0 };
    continue;
  }
  await page.evaluate((target) => {
    window.player.flying = true;
    window.player.teleport(target.x + 0.5, target.y, target.z + 0.5);
  }, point);
  await sleep(8500);
  naturalVariants[name] = await page.evaluate(({ target, expected }) => {
    const mobs = [...window.mobs.entities.values()].filter((mob) => {
      const dx = mob.spawnPosition.x - target.x;
      const dz = mob.spawnPosition.z - target.z;
      return dx * dx + dz * dz <= 96 ** 2;
    });
    return {
      count: mobs.length,
      kinds: [...new Set(mobs.map((mob) => mob.kind))],
      expectedCount: mobs.filter((mob) => mob.variant === expected).length,
      columnMismatches: mobs.filter((mob) =>
        mob.variant !== window.animalVariantAt(
          Math.floor(mob.spawnPosition.x),
          Math.floor(mob.spawnPosition.z),
        )
      ).length,
    };
  }, { target: point, expected: name });
}

const audioAndDebug = await page.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window.app.audio.ensureStarted();
  for (const mob of window.mobs.entities.values()) mob.soundTicks = 99999;
  await wait(1000);
  const player = window.player.position;
  const before = window.mobs.sfx.playedCount;
  for (const kind of ['cow', 'sheep', 'pig', 'chicken']) {
    window.mobs.sfx.play(kind, player.clone().add({ x: 2, y: 0, z: 0 }), player);
    await wait(800);
  }
  window.game.toggleDebugOverlay();
  await wait(600);
  return {
    played: window.mobs.sfx.playedCount - before,
    context: window.app.audio.ctx?.state,
    debug: document.getElementById('debug-overlay')?.textContent ?? '',
    textures: window.app.animalTextures.summary,
  };
});

const performance = await page.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const gaps = [];
  let prior = performance.now();
  let running = true;
  const frame = (now) => {
    gaps.push(now - prior);
    prior = now;
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  await wait(3000);
  running = false;
  return {
    fps: gaps.length / 3,
    maxGap: Math.max(...gaps),
    frames: gaps.length,
  };
});

const visualTarget = await page.evaluate(() => {
  const mob = [...window.mobs.entities.values()][0];
  if (!mob) return null;
  window.player.flying = true;
  window.player.teleport(mob.position.x, mob.position.y + 0.25, mob.position.z + 4);
  window.player.yaw = 0;
  window.player.pitch = -0.12;
  return { kind: mob.kind, variant: mob.variant, wool: mob.woolColor };
});
await sleep(500);
await page.screenshot({ path: '/tmp/passive-mobs-acceptance.png' });

const lifecycle = await page.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window.app.quitToTitle();
  await wait(500);
  const afterQuit = { ...window.app.renderer.info.memory };
  window.app.startGame('passive-lifecycle');
  await wait(3000);
  window.app.quitToTitle();
  await wait(500);
  return {
    gameDisposed: window.app.game === null,
    afterQuit,
    afterRestart: { ...window.app.renderer.info.memory },
  };
});

await browser.close();

const failures = [];
for (const report of seedReports) {
  if (report.counts.total < 8 || report.counts.total > 60) failures.push(`${report.seed}: total cap/count`);
  if (report.near > 35) failures.push(`${report.seed}: near cap`);
  if (report.maxPerChunk > 4) failures.push(`${report.seed}: chunk cap`);
  if (report.invalidSpawn || report.invalidCurrent) failures.push(`${report.seed}: invalid position`);
  if (report.variantMismatch) failures.push(`${report.seed}: variant mismatch`);
  if (report.moved < 1) failures.push(`${report.seed}: no wandering`);
  if (!report.states.idle && !report.states.looking) failures.push(`${report.seed}: no idle/look state`);
}
if (species.size !== 4) failures.push(`species coverage: ${[...species].join(',')}`);
for (const name of ['warm', 'cold', 'temperate']) {
  const result = naturalVariants[name];
  if (
    !variantChecks[name] ||
    result.count < 1 ||
    result.expectedCount < 1 ||
    result.columnMismatches
  ) {
    failures.push(`${name} natural variants`);
  }
}
if (
  variantChecks.wool.temperate !== 'white' ||
  variantChecks.wool.cold !== 'black' ||
  variantChecks.wool.warm !== 'brown' ||
  variantChecks.wool.pink !== 'pink' ||
  variantChecks.wool.repeat !== variantChecks.wool.warm
) {
  failures.push('sheep wool weighting/determinism');
}
if (audioAndDebug.played < 4 || audioAndDebug.context !== 'running') failures.push('animal audio');
if (!audioAndDebug.debug.includes('passive mobs') || !audioAndDebug.debug.includes('mob chunks active')) {
  failures.push('debug overlay');
}
if (
  audioAndDebug.textures.loaded !== 11 ||
  audioAndDebug.textures.missing.length ||
  audioAndDebug.textures.invalid.length
) {
  failures.push('Faithful entity textures');
}
if (performance.fps < 55 || performance.maxGap >= 250) failures.push('frame delivery');
if (!lifecycle.gameDisposed) failures.push('lifecycle dispose');
if (lifecycle.afterRestart.textures > lifecycle.afterQuit.textures + 2) failures.push('texture lifecycle');
if (errors.length) failures.push('console errors/warnings');

const report = {
  seedReports,
  species: [...species],
  variantChecks,
  naturalVariants,
  audioAndDebug,
  performance,
  visualTarget,
  lifecycle,
  errors,
  failures,
};
console.log(JSON.stringify(report, null, 2));
console.log(failures.length ? 'FAIL: Passive mob acceptance failed.' : 'PASS: Passive mob acceptance verified.');
process.exit(failures.length ? 1 : 0);
