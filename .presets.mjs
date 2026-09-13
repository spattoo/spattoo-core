import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name,w] of [['desktop',1180],['phone',375]]) {
  const p = await b.newPage({ viewport:{ width:w, height: 800 } });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:5190/topper-studio.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(2400);
  const n = await p.locator('button[aria-label="A name on a heart"]').count();
  await p.screenshot({ path:`${process.env.HOME}/Downloads/topper-presets-${name}.png` });
  console.log(name, JSON.stringify({ presetButtons: n, errs: errs.slice(0,2) }));
  if (name==='desktop') {
    await p.locator('button[aria-label="A name on a heart"]').click();
    await p.waitForTimeout(1800);
    const gone = await p.locator('button[aria-label="A name on a heart"]').count();
    await p.screenshot({ path:`${process.env.HOME}/Downloads/topper-preset-picked.png` });
    console.log('after picking →', JSON.stringify({ rowGone: gone===0 }));
  }
  await p.close();
}
await b.close();
