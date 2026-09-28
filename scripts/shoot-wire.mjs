/* A contact sheet of the wire's shape, one picture per setting, labelled.
 *
 * ⚠️ ONE SHEET, NOT FIVE FILES. The question "does this read as wire rather than a pin" is a
 * comparison, and a comparison nobody can see is a comparison nobody makes — project memory:
 * "put the reference beside the render yourself; never make Sandeep do the comparing."
 *
 * ⚠️ A FRESH PAGE PER SHOT, AND THE REASON IS VISIBLE IN ANY SHEET TAKEN WITHOUT IT. Reusing one
 * page across `goto`s left the first render correctly lit and every one after it dark — the scene
 * re-mounts on navigation but the environment map does not re-apply in time, so the sheet compared
 * geometry under two different lightings and invited a judgement about the wrong variable. A new
 * page mounts like the first one did, every time.
 *
 * ⚠️ AND IT STILL WAITS. The env map arrives a frame or two after the mesh, so an early capture is a
 * different picture of the same geometry — project memory, learned the same way.
 *
 *   node scripts/shoot-wire.mjs
 *   CASES='lean=0|lean=25|lean=50' node scripts/shoot-wire.mjs
 *   GLB='https://…/butterfly.glb' node scripts/shoot-wire.mjs
 */
import { chromium } from 'playwright';

const CASES = (process.env.CASES ||
  'wire=0|bend=0|bend=0.12|bend=0.22|bend=0.35|bend=0.5').split('|');
const GLB = process.env.GLB ? `&glb=${encodeURIComponent(process.env.GLB)}` : '';
const OUT = `${process.env.HOME}/Downloads/${process.env.NAME || 'wire-sheet'}.png`;

const b = await chromium.launch();
const shots = [];
for (const c of CASES) {
  const page = await b.newPage({ viewport: { width: 460, height: 500 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/element-wire.html?${c}${GLB}`, { waitUntil: 'networkidle' });
  /* ⚠️ SHOOT, WAIT, SHOOT AGAIN, AND KEEP THE SECOND. A fixed pause is a bet on how long the
     environment map takes, and it is a bet that loses intermittently — one frame in five came back
     unlit, and an unlit frame beside four lit ones invites a judgement about lighting in a sheet
     about geometry. Two captures a second apart cost a second and settle it: whatever the first one
     caught mid-load, the second has the finished scene. */
  await page.waitForTimeout(3200);
  await page.screenshot();
  await page.waitForTimeout(1200);
  shots.push({ label: c, png: (await page.screenshot()).toString('base64') });
  await page.close();
  console.log('  shot', c);
}

/* Composed in a page rather than with an image library: the repo already has a browser open and
   this needs no dependency that only this script would use. */
const sheet = await b.newPage({ viewport: { width: 460 * shots.length, height: 560 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 15px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center">
  <img src="data:image/png;base64,${s.png}" style="width:460px;display:block">
  <figcaption style="padding:8px 0;color:#2C4433">${s.label.replace(/img=[^&]*&?/, '')||'defaults'}</figcaption>
</figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
