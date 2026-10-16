/* ── Is the picture standing still? ──────────────────────────────────────────────────────────────
 *
 * Captures the same canvas three times with nothing touched. A 3D scene that is not animating
 * should produce IDENTICAL frames; if it does not, something is being rebuilt every render.
 *
 * ⚠️ WRITTEN BECAUSE "IT IS SHAKING" HAS TWO VERY DIFFERENT CAUSES and they are hard to tell apart
 * by eye. Z-fighting between coplanar surfaces only shows while the camera moves; a rebuild shows
 * with the camera dead still. Sandeep: *"boarder ring is continuously shaking."* One run of this
 * said the frames differ with nothing touched, which ruled out z-fighting immediately and sent the
 * search to the right place.
 *
 * What it found that day, both in the same decoration:
 *   * a PRNG handed IN to a seating effect. A generator is a STREAM — the second run continues
 *     where the first stopped, so every piece got a new angle on every re-render. Re-seed inside
 *     the effect instead.
 *   * `hole={{ shape: … }}` written inline. A fresh object literal is a new dependency on every
 *     render, so the seat memo it feeds rebuilt every frame.
 *
 *   npm run dev                                  # core, 5190
 *   node scripts/measure-frame-steady.mjs
 *   PAGE=gypsophila.html PICK='rim + board' node scripts/measure-frame-steady.mjs
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const PAGE = process.env.PAGE ?? 'gypsophila.html';
const PICK = process.env.PICK ?? 'rim + board';
await page.goto(`http://localhost:5190/${PAGE}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
if (PICK) await page.evaluate((t) => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)?.click(), PICK);
await page.waitForTimeout(4000);
/* Same camera, three captures a second apart. If the frame changes with nothing touched, something
   is being rebuilt every render; if it is identical, the shake is z-fighting as the view moves. */
const grab = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  return t.toDataURL('image/png').length + ':' + t.toDataURL('image/png').slice(2000, 2200);
});
const a = await grab(); await page.waitForTimeout(1200);
const c = await grab(); await page.waitForTimeout(1200);
const d = await grab();
const steady = a === c && c === d;
console.log(`\n  ${PAGE}${PICK ? ` — ${PICK}` : ''}`);
console.log(`  frame 1 = frame 2 : ${a === c}`);
console.log(`  frame 2 = frame 3 : ${c === d}`);
console.log(steady
  ? '\n  ✓ steady — nothing is being rebuilt between frames\n'
  : '\n  ✗ the picture changes with nothing touched. Something rebuilds every render:\n'
    + '    a PRNG passed into an effect, or a fresh object literal feeding a memo.\n');
process.exitCode = steady ? 0 : 1;
await b.close();
