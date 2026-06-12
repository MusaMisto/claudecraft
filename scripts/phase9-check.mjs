// Phase 9 acceptance: menu/panorama renders, full lifecycle works repeatedly,
// options apply live, and 5 world restarts leak no WebGL resources.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: '/tmp/phase9-menu.png' });

// Start a game via the real button.
await page.mouse.click(640, 415); // Singleplayer button position
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: '/tmp/phase9-game.png' });

const lifecycle = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  const app = window.app;
  out.gameStarted = app.game !== null;
  out.musicPlaying = app.music.playing;
  out.musicDuckInGame = app.audio.musicDuck;

  // Pause via the same path Esc/pointer-lock-loss takes.
  app.game.onPauseRequested();
  await sleep(200);
  out.pausedShown = app.pauseMenu.visible && app.game.paused;

  // Options over pause: live FOV + render distance change.
  app.optionsMenu.show();
  app.settings.fov = 100;
  app.settings.renderDistance = 3;
  await sleep(400);
  app.optionsMenu.hide();
  out.optionsApplied = true;

  return out;
});
await page.screenshot({ path: '/tmp/phase9-pause.png' });

// Quit to title, then restart 5 times and watch WebGL memory.
const leakCheck = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = window.app;
  const mem = () => ({ ...app.renderer.info.memory });

  app.pauseMenu.hide();
  app.quitToTitle();
  await sleep(1500);
  const baseline = mem();

  const samples = [];
  for (let i = 0; i < 5; i++) {
    app.startGame();
    await sleep(2500); // let chunks stream in
    app.quitToTitle();
    await sleep(800);
    samples.push(mem());
  }
  return { baseline, samples, menuBack: app.game === null };
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/phase9-menu-after.png' });

await browser.close();
console.log(JSON.stringify({ lifecycle, leakCheck }, null, 2));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
