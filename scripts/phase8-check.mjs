// Phase 8 acceptance: audio starts on gesture, footstep materials differ
// spectrally, break/place always produce sound, music keeps a healthy
// scheduling lookahead, and volume changes apply live.
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
await new Promise((r) => setTimeout(r, 3000));

// Simulate a user gesture to unlock audio.
await page.mouse.click(640, 400);
await new Promise((r) => setTimeout(r, 800));

const results = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  const audio = window.audio;
  out.contextState = audio.ctx?.state ?? 'missing';
  out.musicPlaying = window.music.playing;

  // Spectral centroid per footstep material, sampled via an analyser.
  const ctx = audio.ctx;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  audio.sfxGain.connect(analyser);
  const bins = new Float32Array(analyser.frequencyBinCount);

  async function centroidOf(fn) {
    let best = { energy: -Infinity, centroid: 0 };
    fn();
    for (let i = 0; i < 12; i++) {
      await sleep(15);
      analyser.getFloatFrequencyData(bins);
      let num = 0;
      let den = 0;
      for (let b = 0; b < bins.length; b++) {
        const mag = 10 ** (bins[b] / 20);
        num += mag * b;
        den += mag;
      }
      const hzPerBin = ctx.sampleRate / analyser.fftSize;
      const energy = den;
      if (energy > best.energy) best = { energy, centroid: (num / den) * hzPerBin };
    }
    return Math.round(best.centroid);
  }

  out.footstepCentroids = {};
  for (const mat of ['grass', 'stone', 'sand', 'wood']) {
    out.footstepCentroids[mat] = await centroidOf(() => window.sfx.footstep(mat));
    await sleep(250);
  }

  // Break/place sounds increment the played counter.
  const before = window.sfx.playedCount;
  window.sfx.blockBreak('stone');
  window.sfx.blockPlace('wood');
  window.sfx.click();
  out.sfxCounterDelta = window.sfx.playedCount - before;

  // Music scheduling lookahead stays positive over several seconds.
  const ahead = [];
  for (let i = 0; i < 5; i++) {
    ahead.push(Number(window.music.scheduledAhead.toFixed(2)));
    await sleep(900);
  }
  out.musicLookahead = ahead;

  // Live volume: change settings and confirm bus gains follow.
  window.settings.sfxVolume = 0.25;
  window.settings.musicVolume = 0.1;
  await sleep(400);
  out.gains = {
    sfx: Number(audio.sfxGain.gain.value.toFixed(3)),
    music: Number(audio.musicGain.gain.value.toFixed(3)),
  };
  window.settings.sfxVolume = 1;
  window.settings.musicVolume = 0.7;
  return out;
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
process.exit(errors.length ? 1 : 0);
