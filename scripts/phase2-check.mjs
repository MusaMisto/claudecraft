// Phase 2 acceptance: normal + wireframe screenshots, then a border-block
// edit via the console API to confirm both touching chunks remesh.
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
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/phase2-normal.png' });

await page.evaluate(() => window.toggleWireframe());
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/phase2-wireframe.png' });
await page.evaluate(() => window.toggleWireframe());

// Border edit: world x=15 is the last column of chunk (0,*); x=16 begins
// chunk (1,*). Place a cobblestone tower straddling the border at y=8.
const result = await page.evaluate(() => {
  window.setBlock(15, 8, 24, window.BlockId.Cobblestone);
  window.setBlock(16, 8, 24, window.BlockId.Cobblestone);
  window.setBlock(15, 9, 24, window.BlockId.Cobblestone);
  // Also carve a hole at a border to expose interior faces of the neighbor.
  window.setBlock(31, 7, 40, window.BlockId.Air);
  window.setBlock(32, 7, 40, window.BlockId.Air);
  return {
    placed: window.world.getBlock(15, 8, 24) === window.BlockId.Cobblestone,
    carved: window.world.getBlock(31, 7, 40) === window.BlockId.Air,
  };
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/phase2-edited.png' });

await browser.close();
console.log('Border edit result:', JSON.stringify(result));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
