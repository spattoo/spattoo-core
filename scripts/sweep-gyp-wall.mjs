/* Gypsophila on the WALL, swept over size and lay.
 *
 * ⚠️ THE REPORT WAS "a cluster of white dots/sprinkles. not like gypsophila flowers", and the ask
 * was a size control. Size is one of two variables here, and the other is the one I suspect:
 * `lay: 90` tips a sprig fully horizontal, so it points straight OUT of the wall and the camera
 * sees it END-ON — and a sprig end-on is its bloom cluster and nothing else. Sweeping both rather
 * than tuning the one that was asked for, because a sweep only answers the question it varies.
 *
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/sweep-gyp-wall.mjs
 */
import { chromium } from 'playwright';

const SIZES = [1, 1.6, 2.2];
const LAYS  = [90, 55, 30];

/* ⚠️ CLIPPED TIGHT ON THE POSY, not on the cake. The first run framed the whole screen and the
   difference between 90° and 30° was a few pixels wide — a sweep you cannot see the answer in has
   not answered anything. Located once, below, rather than guessed. */
/* Measured by the diff below, in CSS px (the screenshot is 2x): the posy occupies roughly
   (279,499)–(391,588), padded out so the largest size in the sweep still fits the frame. */
let CLIP = { x: 244, y: 464, width: 184, height: 160 };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?catalog=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__tapElementById?.('e-gyp'));
await page.waitForTimeout(3000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'On the side')?.click();
});
await page.waitForTimeout(3000);

/* ⚠️ THE CROP IS MEASURED, NOT GUESSED. A first pass picked the box as fractions of the canvas and
   missed the posy entirely — nine photographs of a cake wall with the subject just off the edge.
   The honest way to aim at a thing whose position comes out of a 3D camera is to photograph the
   wall with it and without it and diff: whatever changed IS the posy. */
{
  const shot = async (name) => { await page.screenshot({ path: `/tmp/gw-${name}.png` }); };
  await page.evaluate(() => window.__setGyp?.({ size: 2.2, lay: 30 }));
  await page.waitForTimeout(2200);
  await shot('on');
  await page.evaluate(() => window.__setGyp?.({ size: 0.001 }));
  await page.waitForTimeout(2200);
  await shot('off');
  await page.evaluate(() => window.__setGyp?.({ size: 1 }));
}

/* ⚠️ DRIVEN THROUGH THE DESIGN, NOT THE CARD. There is no size dial yet — that is what this run is
   deciding the range for — and `__setGyp` writes the same field the card will. */
for (const size of SIZES) {
  for (const lay of LAYS) {
    await page.evaluate(([s, l]) => window.__setGyp?.({ size: s, lay: l }), [size, lay]);
    await page.waitForTimeout(2200);
    const name = `gyp-wall-size${String(size).replace('.', '')}-lay${lay}`;
    await page.screenshot({ path: `${process.env.HOME}/Downloads/${name}.png`, clip: CLIP });
    console.log(`  ${name}`);
  }
}
await b.close();
