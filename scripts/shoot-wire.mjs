/* A contact sheet of the wire's shape, one picture per setting, labelled.
 *
 * ⚠️ ONE SHEET, NOT FIVE FILES. The question "does this read as wire rather than a pin" is a
 * comparison, and a comparison nobody can see is a comparison nobody makes — project memory:
 * "put the reference beside the render yourself; never make Sandeep do the comparing."
 *
 * ⚠️ AND IT WAITS BEFORE IT SHOOTS. The env map arrives a frame or two after the mesh, so an early
 * capture is a different picture of the same geometry.
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
const page = await b.newPage({ viewport: { width: 460, height: 500 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

const shots = [];
for (const c of CASES) {
  await page.goto(`http://localhost:5190/element-wire.html?${c}${GLB}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3200);
  shots.push({ label: c, png: (await page.screenshot()).toString('base64') });
  console.log('  shot', c);
}

/* Composed in a page rather than with an image library: the repo already has a browser open and
   this needs no dependency that only this script would use. */
const sheet = await b.newPage({ viewport: { width: 460 * shots.length, height: 560 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 15px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center">
  <img src="data:image/png;base64,${s.png}" style="width:460px;display:block">
  <figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption>
</figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
