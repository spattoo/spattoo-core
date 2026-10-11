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

/* ⚠️ THE WALL'S COLOUR, NOT ITS TEXTURE, and the first version of this got it backwards. Wafer
   paper is white, fine and translucent: dressed, the band reads SMOOTHER than the bare wall's own
   shading gradient, so high-frequency energy went DOWN when the skirt went on and the assertion
   failed on a render that was plainly correct. Chroma is unambiguous — this fixture's tier is pink
   (max−min ≈ 25) and the paper is white (≈ 7) — and it needs no guess about how busy a pleat is.
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
  return { mean: mean.map(Math.round), chroma: Math.max(...mean) - Math.min(...mean) };
});

console.log('\nopening the tier card');
await page.evaluate(() => window.__selectTier?.(0));
await page.waitForTimeout(1500);
const bare = await wallColour();
ok(bare != null, `the cake is on screen (bare wall ${bare?.mean}, chroma ${bare?.chroma.toFixed(1)})`);

ok(await click('Frosting'), 'the tier sheet has a Frosting tab');
await page.waitForTimeout(800);

console.log('\nthe Wafer paper chip');
ok(await click('Wafer paper'), 'the Frosting tab offers "Wafer paper"');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/wafer-card-panel.png` });

const text = await page.evaluate(() => document.body.innerText);
ok(/Pink, notched hem/.test(text), 'and unfolds the looks from core');

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
ok(await click('White, rippled'), 'tapped "White, rippled"');
await page.waitForTimeout(2500);
const stored = await page.evaluate(() => window.__design?.().tiers?.[0]?.wafer ?? null);
ok(!!stored, `the tier stores a skirt (${stored ? `${stored.count} sheets, hem ${stored.hem}` : 'none'})`);
const dressed = await wallColour();
ok(dressed != null && bare != null && dressed.chroma < bare.chroma * 0.6,
   `and the WALL is wearing paper now (chroma ${bare?.chroma.toFixed(1)} pink → ${dressed?.chroma.toFixed(1)} white)`);
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

console.log('\ntaking it off');
ok(await click('Wafer paper'), 'tapped the chip again');
await page.waitForTimeout(2000);
ok(await page.evaluate(() => !window.__design?.().tiers?.[0]?.wafer), 'the skirt comes off again');
await page.screenshot({ path: `${OUT}/wafer-card-removed.png` });

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await b.close();
process.exit(fails.length ? 1 : 0);
