/* The WALL pose, which is the one that was wrong: a wire leaving the icing horizontally holds the
   butterfly at the height of its own hole. `?zone=side` drives DraggableSideSticker — the renderer
   the fault lived in — so this sheet is a picture of the real path, not of the geometry in a vacuum. */
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

/* Framing knobs, because the one thing being judged — how far the piece stands off a wall — is only
   visible from beside it, and how far round is a judgement per sheet rather than a constant. */
const W = Number(process.env.W || 640), H = Number(process.env.H || 560);
const ORBIT = Number(process.env.ORBIT || 95);

/* macOS screenshot names carry a narrow no-break space (U+202F) before AM/PM, so a path copied out
   of `ls` does not open the file it names. Matched loosely — the same helper shoot-cavity.mjs has. */
function findFile(pathish) {
  try { readFileSync(pathish); return pathish; } catch { /* fall through */ }
  const dir = dirname(pathish), want = basename(pathish).replace(/\s+/g, ' ');
  const hit = readdirSync(dir).find(f => f.replace(/\s+/g, ' ') === want);
  if (!hit) throw new Error(`no such file, loosely: ${pathish}`);
  return join(dir, hit);
}
/* ⚠️ THE REFERENCE GOES IN THE SHEET. Judging a wire against a photograph in another window at
   another scale is how the horizontal run survived a whole round of "looks about right". */
const REF = process.env.REF
  ? `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${readFileSync(findFile(process.env.REF)).toString('base64')}" style="height:${H}px;display:block"><figcaption style="padding:8px 0;color:#B91C1C">THE REFERENCE</figcaption></figure>`
  : '';
const CASES = (process.env.CASES || 'zone=side|zone=side&fold=1|zone=side&len=7').split('|');
const b = await chromium.launch();
const shots = [];
for (const c of CASES) {
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/element-wire.html?${c}`, { waitUntil: 'networkidle' });
  /* ⚠️ SETTLE IS A KNOB BECAUSE THE DEFAULT FOOLED ME TWICE IN ONE INVESTIGATION. The env map lands
     a beat after the mesh, and a frame captured before it is DARK — which shows up as a huge pixel
     difference between two panels that differ only in lighting. Twice I read that as "this control
     has a big effect" and twice it was the HDRI arriving. The project memory says to discard the
     first frame; on a slow machine one discard is not enough. Raise SETTLE when comparing panels,
     and prefer a measurement the lighting cannot fake — a silhouette, not a mean. */
  await page.waitForTimeout(Number(process.env.SETTLE || 2600));
  /* ⚠️ ORBIT BEFORE CAPTURING, OR THE FIX IS INVISIBLE. Face-on to the wall the standoff points
     straight at the lens and foreshortens to nothing — the first sheet from here showed a butterfly
     apparently flat against the icing whichever way the wire ran. How far a piece stands OFF a wall
     can only be judged from beside it. */
  const cv = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await page.mouse.down();
  await page.mouse.move(cv.x + cv.width / 2 - ORBIT, cv.y + cv.height / 2 + 8, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.screenshot();                       // discard: the env map lands a frame late
  await page.waitForTimeout(Number(process.env.SETTLE2 || 1200));
  shots.push({ label: c, png: (await page.screenshot()).toString('base64') });
  await page.close();
  console.log('  shot', c);
}
const sheet = await b.newPage({ viewport: { width: W * (shots.length + (REF ? 1 : 0)), height: H + 50 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 13px system-ui;background:#fff">
${REF}${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:${W}px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
const out = `${process.env.HOME}/Downloads/${process.env.NAME || 'wall-wire'}.png`;
await sheet.screenshot({ path: out });
await b.close();
console.log('→', out);
