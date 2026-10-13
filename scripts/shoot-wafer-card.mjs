/* Wafer paper on the tier card, driven the way a baker drives it.
 *
 *   Sandeep: "integrate the wafer paper studio into core designer. add another option in the tier
 *   edit popup card. this is where user can select the wafer paper. should be able to choose the
 *   adjustments as in admin."
 *
 * ⚠️ A JSX CLOSURE IS ONLY EVALUATED ON RENDER, which is why this exists rather than a unit test.
 * The whole panel — presets, colour wheel, two StyleControls, the cut chips — compiles and passes
 * check:bindings whether or not a single name in it resolves at runtime. `shoot-scatter-rows.mjs`
 * records the same lesson costing a `ReferenceError` past a green build, three green gates and
 * 2430 green tests.
 *
 * ⚠️ AND IT MEASURES THE CAKE, NOT JUST THE DOM. A panel full of working sliders that moves nothing
 * is the failure this feature is most exposed to: `toCanvasConfig` rebuilds each tier from an
 * allow-list, and the coat drew nothing at all for exactly that reason. The skirt is high-frequency
 * and a bare wall is flat, so wall texture separates them.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-wafer-card.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`page error: ${e.message}`); });

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(600);

/* ⚠️ MATCHED ON THE START OF THE LABEL, NOT ON THE WHOLE STRING. On a phone the tier sheet's
   sections are TABS, and each tab carries its current value underneath: the Frosting tab reads
   "FrostingButtercream" — two spans, textContent concatenated, and NOT separated by a newline,
   which was my second guess and also wrong. An exact match found nothing, every later assertion
   failed, and the screenshot showed the Colour tab still open: fifteen red lines for one selector,
   twice. */
const click = (label) => page.evaluate((t) => {
  const n = [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim() === t || x.textContent.trim().startsWith(t));
  if (!n) return false;
  n.click(); return true;
}, label);

/* ⚠️ COLOUR *AND* STRUCTURE, because each one alone has already been wrong once here.
   Texture first: wafer paper is white, fine and translucent, so an UNSHADED skirt reads SMOOTHER
   than the bare wall's own shading gradient — high-frequency energy went DOWN when the skirt went
   on and the assertion failed on a render that was plainly correct. Chroma replaced it and was
   unambiguous while the paper was unshaded: pink tier (max−min ≈ 25) against white paper (≈ 7).
   Then `bakeWaferAO` landed. Darkened sheets contribute less light, so the same band averages
   dimmer paper against the same pink and chroma only eases, 27.6 → 21.9 — the skirt got MORE
   visible and the measure moved the wrong way. The structure the AO added is what to read instead,
   so both are reported and either may carry the claim. Measured ACROSS each row, so the wall's own
   top-to-bottom gradient is not counted as structure.
   Read off the WebGL canvas, down the cake's own extent, measured each time because the designer
   re-frames when the sheet grows. Same route as shoot-coat-scope.mjs. */
const wallColour = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(cv.width * 0.40), w = Math.round(cv.width * 0.20);
  const d = t.getContext('2d').getImageData(x0, 0, w, cv.height).data;
  const px  = (x, y) => { const i = ((y * w) + x) << 2; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = (x, y) => { const c = px(x, y); return (c[0] + c[1] + c[2]) / 3; };
  const bg = lum(0, 2);
  let top = -1, bot = -1;
  const isCake = y => { for (let x = 0; x < w; x += 2) if (Math.abs(lum(x, y) - bg) > 12) return true; return false; };
  for (let y = 0; y < cv.height; y++) if (isCake(y)) { top = y; break; }
  for (let y = cv.height - 1; y >= 0; y--) if (isCake(y)) { bot = y; break; }
  if (top < 0 || bot - top < 60) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.round(top + (bot - top) * 0.45); y < Math.round(top + (bot - top) * 0.75); y++)
    for (let x = 0; x < w; x++) { const c = px(x, y); r += c[0]; g += c[1]; b += c[2]; n++; }
  const mean = [r / n, g / n, b / n];
  /* Horizontal variation, row by row, so the wall's own top-to-bottom gradient does not count as
     structure. A bare wall is smooth ACROSS; a dressed one alternates lit sheet and dark gap. */
  let sdSum = 0, rows = 0;
  for (let y = Math.round(top + (bot - top) * 0.45); y < Math.round(top + (bot - top) * 0.75); y++) {
    let s1 = 0, s2 = 0;
    for (let x = 0; x < w; x++) { const l = lum(x, y); s1 += l; s2 += l * l; }
    sdSum += Math.sqrt(Math.max(0, s2 / w - (s1 / w) ** 2)); rows++;
  }
  return { mean: mean.map(Math.round), chroma: Math.max(...mean) - Math.min(...mean),
           sd: sdSum / Math.max(1, rows) };
});

console.log('\nopening the tier card');
await page.evaluate(() => window.__selectTier?.(0));
await page.waitForTimeout(1500);
const bare = await wallColour();
ok(bare != null, `the cake is on screen (bare wall ${bare?.mean}, chroma ${bare?.chroma.toFixed(1)}, sd ${bare?.sd.toFixed(1)})`);

ok(await click('Frosting'), 'the tier sheet has a Frosting tab');
await page.waitForTimeout(800);

console.log('\nthe Wafer paper chip');
ok(await click('Wafer paper'), 'the Frosting tab offers "Wafer paper"');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/wafer-card-panel.png` });

const text = await page.evaluate(() => document.body.innerText);
/* ⚠️ THIS USED TO LOOK FOR "Pink, notched hem" as proof the looks came from core, and that preset is
   now withheld from customers — so the check went red on a card that is working correctly. The
   claim it was making is better made by the names that ARE offered: all three, in core's order, is
   something only `waferPresetsOffered()` produces. */
ok(/White, waved/.test(text) && /White, rippled/.test(text) && /White, on edge/.test(text),
   'and unfolds the looks from core');

/* ⚠️ THE CAKE MUST STILL BE VISIBLE WHILE THESE SLIDERS ARE LIVE (INVARIANTS #11). This was a
   `Panel` first: on a phone that is a full-height sheet with the cake behind a blur, eleven live
   sliders and nothing to watch. The measurement caught it before Sandeep did — wall texture went
   DOWN when the skirt went on, because the probe was reading the backdrop. */
const canvasSeen = await page.evaluate(() => {
  const c = document.querySelector('canvas')?.getBoundingClientRect();
  if (!c) return 0;
  const top = Math.max(0, c.top), bot = Math.min(window.innerHeight, c.bottom);
  return Math.max(0, bot - top);
});
ok(canvasSeen > 180, `the cake is still on screen beside the controls (${Math.round(canvasSeen)}px)`);

console.log('\napplying a look');
/* ⚠️ TWO PRESETS ARE WITHHELD FROM A CUSTOMER, and the card is where that has to be true — the
   admin studio still lists all five, because that is the screen that would fix them. */
{
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(n => n.textContent.trim()));
  ok(!chips.includes('Pink, notched hem'), 'the card does not offer "Pink, notched hem"');
  ok(!chips.includes('White, broad'), 'the card does not offer "White, broad"');
  ok(chips.includes('White, waved') && chips.includes('White, rippled'),
     'and still offers the two that were kept');
}
ok(await click('White, rippled'), 'tapped "White, rippled"');
await page.waitForTimeout(2500);
const stored = await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer ?? null);
ok(!!stored, `the tier stores a skirt (${stored ? `${stored.count} sheets, hem ${stored.hem}` : 'none'})`);
const dressed = await wallColour();
/* ⚠️ CHROMA ALONE STOPPED WORKING WHEN THE GAP AO LANDED, and that is the third probe this one
   feature has broken. Unshaded paper covered the pink wall and the chroma fell 27.6 → 5.0. Baked
   occlusion darkens the sheets, so the same region now averages DIMMER paper against the same pink
   and reads 21.9 — the skirt is more visible, not less, and the measure moved the wrong way.
   So the thing to measure is STRUCTURE: the bare wall is smooth across, a dressed one alternates
   lit sheet and dark gap, and that is exactly what the AO put there. Chroma stays as a reported
   figure with a loose bound, because it still has to fall. Both are read off the cake. */
/* EITHER, not both: which one fires depends on how hard the gaps are shaded, and that is a
   different question from whether the skirt rendered at all. Unshaded, coverage shows as a collapse
   in chroma (27.6 → 5.0) and barely any structure; shaded, as structure (10.2 → 23.3) with chroma
   only easing. A test that demanded both would fail on every `ao` a sweep tries. */
ok(dressed != null && bare != null && dressed.chroma < bare.chroma
   && (dressed.sd > bare.sd * 2 || dressed.chroma < bare.chroma * 0.6),
   `and the WALL is wearing paper now (structure sd ${bare?.sd.toFixed(1)} → ${dressed?.sd.toFixed(1)}, `
   + `chroma ${bare?.chroma.toFixed(1)} pink → ${dressed?.chroma.toFixed(1)})`);
await page.screenshot({ path: `${OUT}/wafer-card-applied.png` });

console.log('\nthe adjustments');
const after = await page.evaluate(() => document.body.innerText);
for (const label of ['Panels', 'Width', 'Height', 'Fold depth', 'Folds across', 'Curl', 'Hem swing']) {
  ok(new RegExp(label).test(after), `"${label}" is on the panel`);
}
ok(/Zigzag/.test(after) && /Petal/.test(after), 'and the cuts are offered as chips');

/* A slider that moves and changes nothing is this feature's most likely failure. Drive one with
   REAL input — assigning .value bypasses React's tracker and onChange never fires. */
const moved = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('div')].filter(d => d.textContent.trim().startsWith('Panels'));
  const row = heads[heads.length - 1]?.parentElement;
  const input = row?.querySelector('input[type=range]');
  if (!input) return null;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(input, String(Math.min(Number(input.max), Number(input.value) + 20)));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return Number(input.value);
});
await page.waitForTimeout(2000);
const after2 = await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer?.count ?? null);
ok(moved != null && after2 === moved, `dragging Panels to ${moved} reaches the design (${after2})`);

/* ⚠️ THE MOUNTING, which is the first control on the card because it changes what Width MEANS.
   And it is the one a merging setter can strand: tap a preset that stands the sheets on edge, then
   a flat one, and without `fin` on both you get a look tuned flat rendered standing. */
console.log('\nthe mounting');
// `innerText` applies CSS, and these headings are text-transform: uppercase.
ok(/HOW IT IS STUCK ON/i.test(after), 'the card leads with how the paper is stuck on');
ok(await click('White, on edge'), 'tapped "White, on edge" — the measured look');
await page.waitForTimeout(2500);
const onEdge = await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer ?? {});
ok(onEdge.fin === true && onEdge.count === 110 && onEdge.width === 3.9,
   `it stands them on edge (fin ${onEdge.fin}, ${onEdge.count} strips, width ${onEdge.width})`);
ok(/Edge angle/.test(await page.evaluate(() => document.body.innerText)),
   'and the edge angle appears, which flat has no use for');
await page.screenshot({ path: `${OUT}/wafer-card-on-edge.png` });

ok(await click('White, waved'), 'tapped a flat look straight afterwards');
await page.waitForTimeout(2000);
const backFlat = await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer ?? {});
ok(backFlat.fin === false, `and the sheets lie back down (fin ${backFlat.fin}) — the merge cannot strand it`);
ok(!/Edge angle/.test(await page.evaluate(() => document.body.innerText)),
   'the edge angle goes away with it');

ok(await click('Stood on edge'), 'and the chip stands them up without a preset');
await page.waitForTimeout(1500);
ok(await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer?.fin) === true,
   'a preset is a starting point, not a lock');

console.log('\ntaking it off');
ok(await click('Wafer paper'), 'tapped the chip again');
await page.waitForTimeout(2000);
ok(await page.evaluate(() => !window.__design?.().tiers?.[0]?.wafer), 'the skirt comes off again');
await page.screenshot({ path: `${OUT}/wafer-card-removed.png` });

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await b.close();
process.exit(fails.length ? 1 : 0);
