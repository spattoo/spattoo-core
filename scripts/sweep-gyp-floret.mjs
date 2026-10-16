/* How big a bloom has to be, against its own branch, before a sprig reads as FLOWERS.
 *
 * Sandeep, twice now: *"flowers still dont look like flowers. size should be little more bigger."*
 * The first time I answered with overall `size`, which is a different knob: scaling the whole sprig
 * makes a bigger haze, it does not make the blooms more legible against the branch they sit on.
 * This varies `floretSize` — the bloom alone — at a fixed overall size, which is the ratio that
 * decides whether the eye reads petals or fog. Default today is 0.016 against a 0.30 sprig: 10.7%.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/sweep-gyp-floret.mjs
 */
import { chromium } from 'playwright';

const FLORETS = [0.016, 0.022, 0.028, 0.034];
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

for (const f of FLORETS) {
  await page.evaluate((v) => window.__setGyp?.({ floretSize: v }), f);
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `/tmp/floret-${f}.png`, clip: { x: 150, y: 230, width: 400, height: 330 } });
  console.log(`  shot floretSize ${f}  (${(f * 2 / 0.3 * 100).toFixed(0)}% of the sprig)`);
}
await b.close();
