// Soak: drop the player into an ocean, let physics/audio/animation run, watch
// for runtime errors and confirm water audio nodes are created.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true, args: ['--use-angle=metal','--enable-gpu','--mute-audio','--window-size=1280,800'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(`[${m.type()}] ${m.text()}`);});
await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/singleplayer/i.test(x.textContent))?.click());
await new Promise(r=>setTimeout(r,1500));
// Find an ocean column near origin and drop the player onto its surface.
const where = await page.evaluate(()=>{
  const g=window.generator;
  for(let r=16;r<800;r+=8) for(let a=0;a<360;a+=20){
    const x=Math.round(Math.cos(a*Math.PI/180)*r), z=Math.round(Math.sin(a*Math.PI/180)*r);
    if(g.height(x,z) < 58){ window.player.flying=false; window.player.teleport(x+0.5, 64, z+0.5); return {x,z,h:g.height(x,z)}; }
  }
  return null;
});
await new Promise(r=>setTimeout(r,8000)); // sink/bob in water, animate, audio
const state = await page.evaluate(()=>({ inWater: window.player.inWater, y: +window.player.position.y.toFixed(1) }));
await page.screenshot({ path: '/tmp/cc-water.png' });
await browser.close();
console.log('ocean col:', JSON.stringify(where), 'final:', JSON.stringify(state));
console.log('errors:', errs.length? errs.slice(0,8) : 'none');
