// Phase 5 acceptance: targeting, instant break/place, self-intersection
// rejection, jump-place pillar, hotbar selection.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 3000));

const results = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  // Flat platform arena.
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) window.setBlock(x, 100, z, window.BlockId.Stone);
  }
  window.player.teleport(0.5, 101, 0.5);
  window.player.yaw = 0;
  window.player.pitch = -0.5; // look down-forward at the platform
  await sleep(300);

  // Targeting: looking down-forward should target a platform block.
  out.target = window.interaction.target
    ? { ...window.interaction.target, highlightVisible: window.interaction.highlight.visible }
    : null;

  // Break it.
  const t = window.interaction.target;
  const before = window.world.getBlock(t.x, t.y, t.z);
  window.interaction.breakBlock();
  out.breakWorked = before !== 0 && window.world.getBlock(t.x, t.y, t.z) === 0;
  await sleep(200);

  // Place into the hole we just made (target its floor... retarget first).
  out.placeBack = (() => {
    if (!window.interaction.target) return 'no-target';
    const ok = window.interaction.placeBlock(window.BlockId.Cobblestone);
    const nt = window.interaction.target;
    return { ok, placedId: window.world.getBlock(nt.x + nt.nx, nt.y + nt.ny, nt.z + nt.nz) };
  })();

  // Self-intersection rejection: look straight down at the block under feet,
  // try to place on its top face (which is the player's own cell).
  window.player.teleport(3.5, 101, 3.5);
  window.player.pitch = -1.5;
  await sleep(150);
  out.selfPlaceRejected = window.interaction.placeBlock(window.BlockId.Stone) === false;

  // Jump-place pillar: look down, jump and place at apex, 3 times.
  window.player.teleport(0.5, 101, 0.5);
  window.player.pitch = -1.55;
  await sleep(150);
  const startY = window.player.position.y;
  for (let i = 0; i < 3; i++) {
    const baseY = window.player.position.y;
    window.controller.debugMove = { jump: true };
    // Poll until the feet clear the placement cell (≥ 1.05 above the base),
    // then place into the cell below and release the jump key.
    for (let tries = 0; tries < 100; tries++) {
      await sleep(15);
      if (window.player.position.y - baseY >= 1.05) {
        window.interaction.updateTarget();
        window.interaction.placeBlock(window.BlockId.Cobblestone);
        break;
      }
    }
    window.controller.debugMove = {};
    await sleep(800); // settle on the new block
  }
  out.pillarHeight = window.player.position.y - startY; // expect ≈ 3
  out.pillarBlocks = [1, 2, 3].map((i) => window.world.getBlock(0, 100 + i, 0));

  // Hotbar selection.
  window.hud.select(4);
  out.hotbarSelected = { index: window.hud.selectedIndex, block: window.hud.selectedBlock };
  window.hud.scroll(1);
  out.hotbarAfterScroll = window.hud.selectedIndex;

  return out;
});

// Visual: stand back and look at the pillar + hotbar.
await page.evaluate(() => {
  window.player.teleport(6.5, 101, 6.5);
  window.player.yaw = Math.PI / 4 + Math.PI; // look back toward origin… adjust below
  const dx = 0.5 - 6.5;
  const dz = 0.5 - 6.5;
  window.player.yaw = Math.atan2(-dx, -dz);
  window.player.pitch = 0.05;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/phase5.png' });

await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
