/* Our rim ring beside a reference cake, at several flower sizes.
 *
 * Sandeep, with the reference open next to the designer: *"in the ref image pls see the size ration
 * between rose and the gypsophila. ours look like sprinkles (too small for roses)."*
 *
 * ⚠️ THE RATIO IS THE MEASURABLE PART. Off the reference, a floret is about 13% of a rose's
 * diameter (24px against 190px). Ours was 3.6% — `floretSize` 0.016 radius against a rose 0.896
 * across — which is where "sprinkles" comes from. This renders the same cake at several `size`
 * values so the ratio can be judged against the photograph rather than against itself.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-gyp-vs-rose.mjs
 */
import { chromium } from 'playwright';

const SIZES = [1, 2, 3];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?catalog=1&rimroses=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__tapElementById?.('e-gyp'));
await page.waitForTimeout(3500);

for (const size of SIZES) {
  await page.evaluate((s) => window.__setGyp?.({ size: s }), size);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `/tmp/gvr-${size}.png`, clip: { x: 60, y: 170, width: 580, height: 420 } });
  console.log(`  shot size ${size}`);
}
await b.close();
