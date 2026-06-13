// Headless terrain validation: starts a game, samples generator.height/biomeAt
// over a wide grid, reports distribution + ocean fraction, runs biome-adjacency
// validation, and screenshots. Usage: node scripts/terrain-sample.mjs [url]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5174/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /singleplayer/i.test(x.textContent));
  b?.click();
});
await new Promise((r) => setTimeout(r, 3500));

const result = await page.evaluate(() => {
  const g = window.generator;
  if (!g) return { error: 'no generator hook' };
  const heights = [];
  let ocean = 0,
    total = 0;
  const biomes = {};
  const step = 24;
  const span = 1200;
  for (let x = -span; x <= span; x += step) {
    for (let z = -span; z <= span; z += step) {
      const h = g.height(x, z);
      heights.push(h);
      total++;
      if (h <= 62) ocean++;
      const b = g.biomeAt(x, z);
      biomes[b] = (biomes[b] || 0) + 1;
    }
  }
  heights.sort((a, b) => a - b);
  const pct = (p) => heights[Math.floor((heights.length - 1) * p)];
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  // Biome-adjacency warnings at several world centers.
  let warns = [];
  for (const [cx, cz] of [[0, 0], [600, -400], [-800, 700], [400, 900]]) {
    warns = warns.concat(g.validateBiomeAdjacency ? window.validateBiomeAdjacency(cx, cz, 300) : []);
  }
  return {
    samples: total,
    min: heights[0],
    p05: pct(0.05),
    p50: pct(0.5),
    mean: Math.round(mean * 10) / 10,
    p95: pct(0.95),
    max: heights[heights.length - 1],
    oceanFraction: Math.round((ocean / total) * 1000) / 10,
    biomes,
    spawn: g.findSpawn ? g.findSpawn() : null,
    warnCount: warns.length,
    warnSample: warns.slice(0, 8),
  };
});

console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: '/tmp/cc-terrain.png' });
await browser.close();
if (errors.length) {
  console.log('Console errors/warnings:');
  for (const e of errors) console.log(' ', e);
}
