/* The dished top, swept. One sheet, because the question is a comparison.
 *
 * ⚠️ TWO CAPTURES, KEEPING THE SECOND. The environment map lands a frame or two after the mesh and
 * a cream ridge judged under the wrong lighting is a judgement about the wrong variable.
 */
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

/* ⚠️ macOS SCREENSHOT NAMES CONTAIN A NARROW NO-BREAK SPACE (U+202F) before AM/PM, so a path copied
   from `ls` and pasted into a shell does not open the file it names — `ls` prints it, readFileSync
   says ENOENT, and nothing about the error says why. Matched loosely instead: any run of whitespace
   in the pattern matches any whitespace on disk. */
function findFile(pathish) {
  try { readFileSync(pathish); return pathish; } catch { /* fall through to the loose match */ }
  const dir = dirname(pathish);
  const want = basename(pathish).replace(/\s+/g, ' ');
  const hit = readdirSync(dir).find(f => f.replace(/\s+/g, ' ') === want);
  if (!hit) throw new Error(`no such file, loosely: ${pathish}`);
  return join(dir, hit);
}

/* ⚠️ THE REFERENCE GOES IN THE SHEET, NOT IN THE OTHER WINDOW. `REF=<path>` puts the photograph
   being copied as the first panel, at the same size as the renders beside it. Judging a render
   against a picture in a different window, at a different scale, is how three rounds of "closer
   now" went past without anyone able to say by how much — and the project memory is explicit about
   it: wire the reference into the harness rather than making Sandeep do the comparing. */
const REF = process.env.REF
  ? `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${readFileSync(findFile(process.env.REF)).toString('base64')}" style="width:460px;display:block;object-fit:cover"><figcaption style="padding:8px 0;color:#B91C1C">THE REFERENCE</figcaption></figure>`
  : '';
const CASES = (process.env.CASES || 'off=1|lip=0&dish=0.05|dish=0|lip=0.09|').split('|');
const OUT = `${process.env.HOME}/Downloads/${process.env.NAME || 'cavity'}.png`;
const b = await chromium.launch();
const shots = [];
for (const c of CASES) {
  const page = await b.newPage({ viewport: { width: 460, height: 420 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/top-cavity.html?${c}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
  await page.screenshot();
  await page.waitForTimeout(1200);
  shots.push({ label: c || 'defaults', png: (await page.screenshot()).toString('base64') });
  await page.close();
  console.log('  shot', c || 'defaults');
}
const sheet = await b.newPage({ viewport: { width: 460 * (shots.length + (REF ? 1 : 0)), height: 470 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 14px system-ui;background:#fff">
${REF}${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:460px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
