// First-person lighting, view bobbing, and menu-animation acceptance check.
// Usage: npm run dev, then `node scripts/feel-check.mjs [url]`.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[console.error] ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });

const menu = await page.evaluate(async () => {
  const root = document.getElementById('options-menu');
  const panel = root.querySelector('.menu-panel');
  const button = root.querySelector('.mc-button');
  const before = {
    visible: window.app.optionsMenu.visible,
    opacity: getComputedStyle(root).opacity,
    pointerEvents: getComputedStyle(root).pointerEvents,
  };
  window.app.optionsMenu.show();
  await new Promise((resolve) => setTimeout(resolve, 240));
  const open = {
    visible: window.app.optionsMenu.visible,
    opacity: getComputedStyle(root).opacity,
    pointerEvents: getComputedStyle(root).pointerEvents,
    panelTransform: getComputedStyle(panel).transform,
    panelTransition: getComputedStyle(panel).transitionDuration,
    buttonTransition: getComputedStyle(button).transitionDuration,
  };
  return { before, open };
});
const animatedButton = await page.$('#options-menu .mc-button');
const buttonBox = await animatedButton.boundingBox();
await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
await page.mouse.down();
await sleep(50);
menu.pressedTransform = await page.evaluate(
  () => getComputedStyle(document.querySelector('#options-menu .mc-button')).transform,
);
await page.mouse.move(0, 0);
await page.mouse.up();
menu.hiddenAgain = await page.evaluate(() => {
  window.app.optionsMenu.hide();
  return !window.app.optionsMenu.visible;
});

await page.evaluate(() => {
  window.app.settings.renderDistance = 5;
  window.app.startGame('feel-check');
});
await sleep(3500);

const lighting = {};
for (const [name, time] of [['noon', 6000], ['midnight', 18000]]) {
  await page.evaluate((worldTime) => window.setTime(worldTime), time);
  await sleep(180);
  lighting[name] = await page.evaluate(() => {
    const held = window.heldBlock;
    return {
      blockLambert: held['material'].isMeshLambertMaterial === true,
      skinLambert: held['skinMaterial'].isMeshLambertMaterial === true,
      ambient: held['ambient'].intensity,
      hemisphere: held['hemisphere'].intensity,
      directional: held['directional'].intensity,
      directionalColor: held['directional'].color.getHex(),
    };
  });
}

await page.evaluate(() => {
  window.setTime(6000);
  window.player.flying = false;
  window.controller.debugMove = {};
  const centerX = Math.floor(window.player.position.x);
  const centerZ = Math.floor(window.player.position.z);
  const floorY = 110;
  for (let z = centerZ - 48; z <= centerZ + 48; z++) {
    for (let x = centerX - 3; x <= centerX + 3; x++) {
      window.world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
      window.setBlock(x, floorY, z, window.BlockId.Stone);
      for (let y = floorY + 1; y <= floorY + 3; y++) {
        window.setBlock(x, y, z, window.BlockId.Air);
      }
    }
  }
  window.__feelRunway = { x: centerX, z: centerZ, y: floorY + 1 };
  window.player.teleport(centerX + 0.5, floorY + 1, centerZ + 0.5);
});
await sleep(700);
const openLighting = await page.evaluate(() => ({
  exposure: window.heldBlock.environmentExposure,
  hemisphere: window.heldBlock['hemisphere'].intensity,
  directional: window.heldBlock['directional'].intensity,
}));
await page.evaluate(() => {
  const runway = window.__feelRunway;
  for (let z = runway.z - 2; z <= runway.z + 2; z++) {
    for (let x = runway.x - 2; x <= runway.x + 2; x++) {
      window.setBlock(x, runway.y + 3, z, window.BlockId.Stone);
    }
  }
});
await sleep(220);
const coveredLighting = await page.evaluate(() => ({
  exposure: window.heldBlock.environmentExposure,
  hemisphere: window.heldBlock['hemisphere'].intensity,
  directional: window.heldBlock['directional'].intensity,
}));
await page.evaluate(() => {
  const runway = window.__feelRunway;
  for (let z = runway.z - 2; z <= runway.z + 2; z++) {
    for (let x = runway.x - 2; x <= runway.x + 2; x++) {
      window.setBlock(x, runway.y + 3, z, window.BlockId.Air);
    }
  }
});
await sleep(220);
const idle = await page.evaluate(() => ({ ...window.viewBobbing.sample }));

const sampleMotion = async (sprint) => {
  await page.evaluate(() => {
    const runway = window.__feelRunway;
    window.player.teleport(runway.x + 0.5, runway.y, runway.z + 32.5);
    window.player.yaw = 0;
    window.player.pitch = 0;
    window.player.flying = false;
    window.controller.debugMove = {};
  });
  await sleep(180);
  await page.evaluate((sprinting) => {
    window.controller.debugMove = { forward: 1, sprint: sprinting };
  }, sprint);
  await sleep(1400);
  const sampled = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      out.push({ ...window.viewBobbing.sample });
    }
    return {
      samples: out,
      player: {
        onGround: window.player.onGround,
        flying: window.player.flying,
        inWater: window.player.inWater,
        horizontalSpeed: window.player.horizontalSpeed,
        position: window.player.position.toArray(),
      },
    };
  });
  await page.evaluate(() => {
    window.controller.debugMove = {};
  });
  await sleep(300);
  const samples = sampled.samples;
  return {
    player: sampled.player,
    maxAmplitude: Math.max(...samples.map((sample) => sample.amplitude)),
    xRange: Math.max(...samples.map((sample) => sample.translateX)) -
      Math.min(...samples.map((sample) => sample.translateX)),
    yRange: Math.max(...samples.map((sample) => sample.translateY)) -
      Math.min(...samples.map((sample) => sample.translateY)),
    rollRange: Math.max(...samples.map((sample) => sample.roll)) -
      Math.min(...samples.map((sample) => sample.roll)),
    pitchRange: Math.max(...samples.map((sample) => sample.pitch)) -
      Math.min(...samples.map((sample) => sample.pitch)),
  };
};

const walk = await sampleMotion(false);
const sprint = await sampleMotion(true);
await page.screenshot({ path: '/tmp/claudecraft-feel-check.png' });
await browser.close();

const fail = (message) => {
  console.error('FAIL:', message);
  process.exit(1);
};

if (menu.before.visible || menu.before.opacity !== '0' || menu.before.pointerEvents !== 'none') {
  fail(`settings menu was not initially inert: ${JSON.stringify(menu.before)}`);
}
if (
  !menu.open.visible ||
  menu.open.opacity !== '1' ||
  menu.open.pointerEvents !== 'auto' ||
  menu.open.panelTransform !== 'matrix(1, 0, 0, 1, 0, 0)'
) {
  fail(`settings opening animation did not settle correctly: ${JSON.stringify(menu.open)}`);
}
if (menu.open.panelTransition === '0s' || menu.open.buttonTransition === '0s') {
  fail('settings panel or buttons have no transition duration');
}
if (menu.pressedTransform === 'none' || menu.pressedTransform === 'matrix(1, 0, 0, 1, 0, 0)') {
  fail(`button press animation was not applied: ${menu.pressedTransform}`);
}
if (!menu.hiddenAgain) fail('settings menu did not hide');

if (!lighting.noon.blockLambert || !lighting.noon.skinLambert) {
  fail('held block or arm is still using an unlit material');
}
const totalLight = (sample) => sample.ambient + sample.hemisphere + sample.directional;
if (totalLight(lighting.midnight) >= totalLight(lighting.noon) * 0.5) {
  fail(`held lighting does not darken enough at night: ${JSON.stringify(lighting)}`);
}
if (
  openLighting.exposure < 0.95 ||
  coveredLighting.exposure > 0.05 ||
  coveredLighting.directional > openLighting.directional * 0.1 ||
  coveredLighting.hemisphere >= openLighting.hemisphere * 0.6
) {
  fail(`held lighting does not respond to local cover: ${JSON.stringify({ openLighting, coveredLighting })}`);
}

if (idle.amplitude > 0.002) fail(`idle bob did not settle: ${JSON.stringify(idle)}`);
for (const [name, sample] of Object.entries({ walk, sprint })) {
  if (
    sample.maxAmplitude < 0.1 ||
    sample.xRange < 0.02 ||
    sample.yRange < 0.04 ||
    sample.rollRange < 0.005 ||
    sample.pitchRange < 0.002
  ) {
    fail(`${name} view bob lacks a full Minecraft-style transform: ${JSON.stringify(sample)}`);
  }
}
if (sprint.maxAmplitude <= walk.maxAmplitude * 1.15) {
  fail(`sprint bob should exceed walk bob: ${JSON.stringify({ walk, sprint })}`);
}
if (errors.length) {
  console.error('Console errors:');
  for (const error of errors) console.error('  ', error);
  process.exit(1);
}

console.log(JSON.stringify({ menu, lighting, openLighting, coveredLighting, idle, walk, sprint }, null, 2));
console.log('PASS: held lighting, view bobbing, and UI animation verified.');
console.log('Screenshot: /tmp/claudecraft-feel-check.png');
