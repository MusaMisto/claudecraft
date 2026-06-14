import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const outputDir = path.resolve(process.argv[3] ?? 'docs/screenshots');
const browserPath = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const viewport = { width: 1600, height: 900, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await fs.mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: [
    '--use-angle=metal',
    '--enable-gpu',
    `--window-size=${viewport.width},${viewport.height}`,
  ],
  defaultViewport: viewport,
});

const page = await browser.newPage();
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    runtimeErrors.push(`[console.${message.type()}] ${message.text()}`);
  }
});

const capture = async (name) => {
  const file = path.join(outputDir, name);
  await page.screenshot({ path: file, type: 'png' });
  console.log(`Captured ${file}`);
};

const frameCamera = async (camera, target, time, fov = 70, settleMs = 5000) => {
  await page.evaluate(({ camera, target, time, fov }) => {
    const dx = target.x - camera.x;
    const dy = target.y - (camera.y + 1.62);
    const dz = target.z - camera.z;
    const horizontal = Math.hypot(dx, dz);
    window.player.flying = true;
    window.player.teleport(camera.x, camera.y, camera.z);
    window.player.yaw = Math.atan2(-dx, -dz);
    window.player.pitch = Math.atan2(dy, horizontal);
    window.player.velocity.set(0, 0, 0);
    window.app.settings.fov = fov;
    window.setTime(time);
  }, { camera, target, time, fov });
  await sleep(settleMs);
};

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('fps-corner')?.remove();
  });
  await sleep(9000);
  await capture('main-menu.png');

  const points = await page.evaluate(() => {
    window.app.settings.renderDistance = 10;
    window.app.settings.vibrantVisuals = true;
    window.app.settings.useTexturePack = true;
    window.app.atlas.setTexturePackEnabled(true);
    window.app.animalTextures.setTexturePackEnabled(true);
    window.app.startGame('readme-gallery-2026');

    document.getElementById('crosshair')?.remove();
    document.getElementById('hotbar')?.remove();
    window.game['scene'].remove(window.interaction.highlight);
    window.heldBlock['hand'].visible = false;

    const generator = window.generator;
    let terrain = null;
    let sunrise = null;
    let warmCoast = null;

    for (let z = -2304; z <= 2304; z += 24) {
      for (let x = -2304; x <= 2304; x += 24) {
        const centerHeight = generator.height(x, z);
        const biome = generator.biomeAt(x, z);
        const samples = [];
        const biomes = new Set();
        for (const dz of [-48, -24, 0, 24, 48]) {
          for (const dx of [-48, -24, 0, 24, 48]) {
            samples.push(generator.height(x + dx, z + dz));
            biomes.add(generator.biomeAt(x + dx, z + dz));
          }
        }
        const relief = Math.max(...samples) - Math.min(...samples);
        const waterDirs = [
          { dx: 1, dz: 0, height: generator.height(x + 40, z) },
          { dx: -1, dz: 0, height: generator.height(x - 40, z) },
          { dx: 0, dz: 1, height: generator.height(x, z + 40) },
          { dx: 0, dz: -1, height: generator.height(x, z - 40) },
        ].sort((a, b) => a.height - b.height);
        const water = waterDirs[0];

        if (centerHeight > 72) {
          const score = relief * 3 + centerHeight + biomes.size * 8;
          if (!terrain || score > terrain.score) {
            terrain = { x, z, height: centerHeight, score };
          }
        }

        if (centerHeight > 64 && water.height <= 62) {
          const score = relief * 2 + biomes.size * 12 + centerHeight;
          if (!sunrise || score > sunrise.score) {
            sunrise = { x, z, height: centerHeight, score, dx: water.dx, dz: water.dz };
          }
        }

        if (biome === 'warm_ocean' && centerHeight <= 59) {
          const landDirs = [
            { dx: 1, dz: 0, height: generator.height(x + 56, z) },
            { dx: -1, dz: 0, height: generator.height(x - 56, z) },
            { dx: 0, dz: 1, height: generator.height(x, z + 56) },
            { dx: 0, dz: -1, height: generator.height(x, z - 56) },
          ].sort((a, b) => b.height - a.height);
          const land = landDirs[0];
          if (land.height > 64) {
            const score = land.height + relief * 2 + biomes.size * 10;
            if (!warmCoast || score > warmCoast.score) {
              warmCoast = { x, z, height: centerHeight, score, dx: land.dx, dz: land.dz };
            }
          }
        }
      }
    }

    const bounds = {
      minX: -3200,
      minY: 0,
      minZ: -3200,
      maxX: 3200,
      maxY: 127,
      maxZ: 3200,
    };
    const placements = generator.structures.placementsInBounds(bounds);
    const preferred = ['ancient_gate', 'settler_village', 'desert_sun_temple', 'mountain_watchtower'];
    let structure = null;
    for (const id of preferred) {
      structure = placements
        .filter((placement) => placement.id === id)
        .sort((a, b) =>
          Math.hypot(a.originX, a.originZ) - Math.hypot(b.originX, b.originZ))[0];
      if (structure) break;
    }

    return { terrain, sunrise, warmCoast, structure };
  });

  await sleep(3000);

  if (!points.sunrise || !points.terrain || !points.warmCoast || !points.structure) {
    throw new Error(`Could not find all screenshot locations: ${JSON.stringify(points)}`);
  }

  const sunrise = points.sunrise;
  await frameCamera(
    {
      x: sunrise.x - sunrise.dx * 34,
      y: sunrise.height + 22,
      z: sunrise.z - sunrise.dz * 34,
    },
    {
      x: sunrise.x + sunrise.dx * 48,
      y: 64,
      z: sunrise.z + sunrise.dz * 48,
    },
    23200,
    72,
  );
  await capture('world-sunrise.png');

  const terrain = points.terrain;
  await page.evaluate(() => {
    window.game['clouds'].group.visible = false;
  });
  await frameCamera(
    { x: terrain.x + 44, y: terrain.height + 18, z: terrain.z + 44 },
    { x: terrain.x, y: terrain.height - 2, z: terrain.z },
    5000,
    68,
  );
  await capture('world-terrain.png');
  await page.evaluate(() => {
    window.game['clouds'].group.visible = true;
  });

  const coast = points.warmCoast;
  await frameCamera(
    {
      x: coast.x - coast.dx * 22,
      y: 70,
      z: coast.z - coast.dz * 22,
    },
    {
      x: coast.x + coast.dx * 58,
      y: 63,
      z: coast.z + coast.dz * 58,
    },
    6500,
    68,
  );
  await capture('water-and-biomes.png');

  const structure = points.structure;
  const structureHeight = structure.boundingBox.maxY - structure.boundingBox.minY;
  await frameCamera(
    {
      x: structure.originX + 34,
      y: structure.originY + Math.max(13, structureHeight * 0.7),
      z: structure.originZ + 34,
    },
    {
      x: structure.originX,
      y: structure.originY + structureHeight * 0.35,
      z: structure.originZ,
    },
    5500,
    63,
  );
  await capture('structures.png');

  const findMobGroup = () => page.evaluate(() => {
    const groups = new Map();
    for (const mob of window.mobs.entities.values()) {
      const list = groups.get(mob.homeChunk) ?? [];
      list.push(mob);
      groups.set(mob.homeChunk, list);
    }
    const selected = [...groups.values()]
      .filter((mobs) => {
        if (mobs.length < 2) return false;
        return mobs[0].kind !== 'chicken';
      })
      .sort((a, b) => {
        const kindScore = (mobs) => mobs[0].kind === 'cow' ? 2 : 1;
        return kindScore(b) - kindScore(a) || b.length - a.length;
      })[0];
    if (!selected) return null;
    const center = selected.reduce(
      (sum, mob) => ({
        x: sum.x + mob.position.x / selected.length,
        y: sum.y + mob.position.y / selected.length,
        z: sum.z + mob.position.z / selected.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    return {
      center,
      count: selected.length,
      kind: selected[0].kind,
      positions: selected.map((mob) => mob.position.toArray()),
    };
  });

  let group = await findMobGroup();
  if (!group) {
    await sleep(8000);
    group = await findMobGroup();
  }
  if (!group) {
    throw new Error(`No passive-mob group spawned near ${JSON.stringify(structure)}`);
  }

  await frameCamera(
    { x: group.center.x + 9, y: group.center.y + 3.2, z: group.center.z + 9 },
    { x: group.center.x, y: group.center.y + 0.65, z: group.center.z },
    6200,
    50,
    900,
  );
  await capture('passive-mobs.png');

  console.log(JSON.stringify({ points, group }, null, 2));
} finally {
  await browser.close();
}

if (runtimeErrors.length) {
  console.error(runtimeErrors.join('\n'));
  process.exit(1);
}
