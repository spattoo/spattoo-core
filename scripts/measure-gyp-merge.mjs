/* Does the rim ring fill the GAPS between roses, or skip the whole run of them?
 *
 * Reported off a render: *"on the rim, it should find the gaps between the roses and merge like an
 * arrangement. but it simply skipped the area where roses are present."*
 *
 * ⚠️ MEASURED IN THE SEATS, NOT IN PIXELS. Twice this week a pixel metric on this cake told me
 * something confidently wrong — one was reading the open panel, one could not tell a pink skirt from
 * a pink cake. What "skipped the area" means is precise and countable: how wide an ARC of the rim
 * carries no sprig, against how wide the roses themselves are. Both come out of the geometry.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/measure-gyp-merge.mjs
 */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?catalog=1&rimroses=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

/* ⚠️ THE ROSES COME FROM THE FIXTURE, NOT FROM FIVE TAPS AND FIVE DRAGS. `?rimroses` seeds the
   exact arrangement in the report. Placing then moving through React state read the list as it was
   before its own earlier calls applied, and stacked all five on one spot — three times, each time
   producing numbers that looked fine for a cake that did not exist. */
const placed = await page.evaluate(() =>
  window.__getStickers().filter(s => s.zone === 'top_surface').length);
console.log('  placed at: ' + JSON.stringify(await page.evaluate(() =>
  window.__getStickers().map(s => `${s.x.toFixed(2)},${s.z.toFixed(2)}`))));

await page.evaluate(() => window.__tapElementById?.('e-gyp'));
await page.waitForTimeout(3500);

/* ⚠️ THE ARITHMETIC IS HERE; THE SEATS COME FROM THE RENDERER. `window.__gypSeats` is what
   GypCloud actually drew — recomputing seats in this script would re-implement the clearance rule
   and agree with itself whatever the rule did. */
const m = await page.evaluate(() => {
  const g = window.__gypSeats;
  if (!g) return null;
  const TAU = Math.PI * 2;
  const ang = (x, z) => ((Math.atan2(x, z) % TAU) + TAU) % TAU;
  const used = g.seats.map(s => ang(s.x, s.z)).sort((a, b) => a - b);
  let widest = 0;
  for (let i = 0; i < used.length; i++) {
    const gap = (i === used.length - 1 ? used[0] + TAU : used[i + 1]) - used[i];
    if (gap > widest) widest = gap;
  }
  /* How much of the rim the roses themselves cover: each one's own half-width as an arc. */
  const R = Math.max(1e-6, ...g.avoid.map(o => Math.hypot(o.x, o.z)));
  const spans = g.avoid.map(o => ({ c: ang(o.x, o.z), h: Math.asin(Math.min(1, o.r / R)) }));
  spans.sort((a, b) => a.c - b.c);
  let span = 0, cur = null;
  for (const s of spans) {
    const lo = s.c - s.h, hi = s.c + s.h;
    if (cur && lo <= cur[1]) cur[1] = Math.max(cur[1], hi);
    else { if (cur) span += cur[1] - cur[0]; cur = [lo, hi]; }
  }
  if (cur) span += cur[1] - cur[0];
  return { seats: g.seats.length, avoid: g.avoid,
           widestGapDeg: widest * 180 / Math.PI, roseSpanDeg: span * 180 / Math.PI };
});
if (!m) { console.log('  ! no seat report'); await b.close(); process.exit(1); }
console.log(`\n  sprigs seated:       ${m.seats}`);
console.log(`  roses seen as avoid: ${m.avoid.length}`);
for (const o of m.avoid) console.log(`    r=${o.r.toFixed(3)}  at (${o.x.toFixed(2)}, ${o.z.toFixed(2)})`);
console.log(`\n  widest bare arc on the rim: ${(m.widestGapDeg).toFixed(1)}deg`);
console.log(`  the roses themselves span:  ${(m.roseSpanDeg).toFixed(1)}deg`);
console.log(`  skipped beyond the roses:   ${(m.widestGapDeg - m.roseSpanDeg).toFixed(1)}deg`);
await page.screenshot({ path: `${process.env.HOME}/Downloads/gyp-merge-before.png` });
await b.close();
