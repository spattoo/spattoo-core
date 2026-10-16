/* How much of a gypsophila ring is STEM and how much is BLOOM?
 *
 * ⚠️ THE REFERENCE ANSWERS THIS AND THE EYE DOES NOT. Sandeep, on a ring that looked wrong in three
 * ways at once: *"such thin stems cant hold the bunch… against physics… stems are also little
 * thick… the bunches are usually big."* Three complaints, one measurable quantity: counting pixels
 * that lead green against pixels that are bright and neutral, his reference cake is **5% stem** —
 * on both its rings, which is a good sign the number means something.
 *
 * So the target is not a thickness or a bloom size, it is the BALANCE between them, and a sweep can
 * find it. Scale-invariant, so the harness framing does not have to match a photograph's.
 *
 *   npm run dev                                       # core, 5190
 *   node scripts/measure-gyp-balance.mjs
 *   KNOB=thickness VALUES=0.001,0.002,0.003 node scripts/measure-gyp-balance.mjs
 */
import { chromium } from 'playwright';

/* ⚠️ 5% IS A CEILING, NOT A TARGET, and finding out why was worth more than hitting it. The green
   in the reference photographs is mostly FOLIAGE: its green runs measure a median 1.93% of the
   cake's width, which is the same scale as a floret (1.45%) and nothing like a hairline. Our sprig
   has no leaves — only bare stems, which the blooms largely hide — so no stem thickness reaches 5%
   without turning a stem into something it is not. Swept to 0.007 it reached 0.3%.
   Read this as "do not exceed the reference", and if the green matters, the honest fix is leaves. */
const TARGET = 5.0;                       // % stem, measured off the reference cake, both rings
const KNOB = process.env.KNOB ?? 'thickness';
const DEFAULTS = {
  thickness:  '0.001,0.0015,0.002,0.003',
  floretSize: '0.006,0.009,0.012,0.016',
  florets:    '5,7,9,10',
  spacing:    '1,1.4,1.9,2.4',
};
const VALUES = (process.env.VALUES ?? DEFAULTS[KNOB] ?? '').split(',').map(Number);
const LABEL = { thickness: 'Stem', floretSize: 'Bloom size', florets: 'Per tip',
                spacing: 'Spacing ×', shadeVary: 'Crowd depth', ao: 'Depth' }[KNOB] ?? KNOB;

/* Hold other sliders somewhere while sweeping one: HOLD='Bloom size=0.014,Per tip=5'. Two knobs
   that fight each other cannot be settled one at a time — bigger blooms bury the twigs unless there
   are fewer of them, and a single-knob sweep just reports the burial. */
const HOLD = (process.env.HOLD ?? '').split(',').filter(Boolean)
  .map(s => { const [k, v] = s.split('='); return [k.trim(), Number(v)]; });

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5190/gypsophila.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'ring the rim')?.click());
await page.waitForTimeout(3500);

const setSlider = (label, value) => page.evaluate(([l, v]) => {
  const span = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === l);
  let row = span?.parentElement;
  while (row && !row.querySelector('input[type=range]')) row = row.parentElement;
  const input = row?.querySelector('input[type=range]');
  if (!input) return null;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(input, String(v));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return Number(input.value);
}, [label, value]);

/* ⚠️ A WHITE CAKE IS "BRIGHT AND NEUTRAL" TOO, and the first version of this counted it as bloom —
   220,000 pixels of iced wall drowning every stem and reporting 0.9% against a reference's 5%. The
   ring is HIGH-FREQUENCY and the cake is flat, so local variance separates them: the same trick the
   wafer probe ended up needing when chroma stopped being able to see the skirt. Only pixels with
   structure around them are counted at all. */
const balance = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const y0 = Math.round(t.height * 0.25), h = Math.round(t.height * 0.34);
  const d = t.getContext('2d').getImageData(0, y0, t.width, h).data;
  const W = t.width;
  const lumAt = (x, y) => { const i = ((y * W) + x) << 2; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  let stem = 0, bloom = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = ((y * W) + x) << 2;
    const r = d[i], g = d[i + 1], b = d[i + 2], lum = (r + g + b) / 3;
    if (lum < 60) continue;
    // Structure: how much this pixel differs from its neighbours. Flat icing scores ~0.
    const v = Math.max(Math.abs(lum - lumAt(x - 1, y)), Math.abs(lum - lumAt(x + 1, y)),
                       Math.abs(lum - lumAt(x, y - 1)), Math.abs(lum - lumAt(x, y + 1)));
    const green = g > r + 4 && g > b + 4;
    if (!green && v < 6) continue;                       // flat and not green: that is the cake
    if (green) stem++;
    else if (lum > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 22) bloom++;
  }
  return { stem, bloom, pct: stem + bloom ? (stem / (stem + bloom)) * 100 : 0 };
});

for (const [k, v] of HOLD) {
  const got = await setSlider(k, v);
  console.log(`  holding ${k} at ${got ?? '(no such slider)'}`);
}
await page.waitForTimeout(1500);
console.log(`\nreference cake: ${TARGET}% stem (top ring 5.0, board ring 4.6)\n`);
console.log(`${LABEL.padStart(11)}    stem px   bloom px   stem share   vs reference`);
console.log('-'.repeat(62));
for (const v of VALUES) {
  const got = await setSlider(LABEL, v);
  if (got === null) { console.log(`${String(v).padStart(11)}    (no slider named "${LABEL}")`); continue; }
  await page.waitForTimeout(2600);
  const m = await balance();
  const flag = Math.abs(m.pct - TARGET) < 1.5 ? '  <- close' : '';
  console.log(`${String(got).padStart(11)}  ${String(m.stem).padStart(9)}  ${String(m.bloom).padStart(9)}`
            + `   ${m.pct.toFixed(1).padStart(9)}%   ${(m.pct / TARGET).toFixed(2)}×${flag}`);
}
await b.close();
