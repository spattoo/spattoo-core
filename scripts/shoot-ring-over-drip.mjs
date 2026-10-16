/* A ring of decorations sitting on a rim that also carries a drip: clicking one must open ITS card.
 *
 * Sandeep: *"when chocolate ball is on chocolate drip, chocolate ball is loosing its pointer. when i
 * click on chocolate ball, drip popup opens."*
 *
 * ⚠️ BOTH ARE PIPING LAYERS ON ONE RIM. The balls are a ring with `top_ring_finish: 'element'`, not
 * stickers — which is why this is not the sticker-vs-border question it looks like. A rim can carry
 * several layers, they look alike from the DOM, and the only thing on screen that tells them apart
 * is the card's heading. `window.__selectedPiping` answers by NAME so the assertion is about the
 * layer rather than about a heading.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-ring-over-drip.mjs
 */
import { chromium } from 'playwright';

const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

await page.goto('http://localhost:5190/designer-mobile.html?catalog=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

/* ⚠️ A PIPING RING IS NOT PLACED BY TAPPING THE MENU. It takes a tap on the 3D rim to set the
   target and then a style chosen from a popup — two gestures a script cannot aim — so the harness
   sets the same target the tap sets and calls the same handler the popup calls. Tapping the row
   placed NOTHING on the first run and every assertion below it failed on an empty cake.
   The drip goes on FIRST, so it is `tops[0]` — which is the order the report hit. */
for (const id of ['e14', 'e34']) {
  /* ⚠️ `'top'`, NOT `'rim'`. `pipingTarget` speaks top/board while `addPipingLayer` speaks
     rim/board, and `handlePipingStyleSelect` converts between them with `zone === 'top'`. Passing
     the storage word put both layers on the BOARD and left the rim empty, which read as "nothing
     was placed" for three runs. */
  await page.evaluate((x) => window.__placePiping?.(0, 'top', x), id);
  await page.waitForTimeout(600);
  await page.evaluate((x) => window.__choosePiping?.(x), id);
  await page.waitForTimeout(3000);
}

const layers = await page.evaluate(() => (window.__design().tiers[0]?.topPipings ?? []).map(p => p.name));
ok(layers.length >= 2, `the rim carries both layers, drip first (${layers.join(' | ')})`);

/* ⚠️ WHAT CHANGED IS THE BODY CLICK, so that is what this drives. Each ring renders its own shell
   and reports its own layerId, so a click that LANDS on a ball was never ambiguous. The fault was a
   click that missed every ring and fell through to the tier: `handleClick` answered `tops[0]` — the
   first layer on the rim, whichever one the baker was reaching for — so the drip, added first, won
   every time and the ball ring could not be reached at all.
   With two layers the honest answer is none: let the click mean what it would mean with no border
   there, rather than hand over a card nobody asked for and hide the one they did. */
const canvas = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

async function clickBody(fracX, fracY) {
  await page.mouse.click(canvas.x + canvas.w * fracX, canvas.y + canvas.h * fracY);
  await page.waitForTimeout(1200);
  return page.evaluate(() => window.__selectedPiping?.());
}

/* Near the rim, on the cake itself. */
const twoLayers = await clickBody(0.30, 0.42);
ok(twoLayers == null,
   `with two rim layers, a body click opens neither card rather than the first (${JSON.stringify(twoLayers)})`);

/* ⚠️ AND ONE LAYER STILL OPENS, because declining to guess is not the same as breaking the rule.
   Take the ring off and the rim is unambiguous again. */
await page.evaluate(() => {
  const t = window.__design().tiers[0];
  const ring = (t.topPipings ?? []).find(p => /Rosette/i.test(p.name ?? ''));
  if (ring) window.__removePiping?.(0, 'rim', ring.layerId);
});
await page.waitForTimeout(2500);
const left = await page.evaluate(() => (window.__design().tiers[0]?.topPipings ?? []).map(p => p.name));
ok(left.length === 1, `one layer left (${left.join(' | ')})`);
/* ⚠️ SWEPT, NOT AIMED AT ONE GUESSED POINT. A single fraction of the canvas tests where I think the
   rim is, not the rule — the first version failed here on a correctly-working cake because the
   point was on the wall rather than in the rim band. Several points across the top, and one opening
   it is the claim. */
let oneLayer = null;
for (const [fx, fy] of [[0.30, 0.42], [0.34, 0.40], [0.26, 0.44], [0.30, 0.38], [0.38, 0.43], [0.22, 0.41]]) {
  oneLayer = await clickBody(fx, fy);
  if (oneLayer?.name) break;
}
ok(oneLayer?.name != null, `with one, the body click still opens it (${JSON.stringify(oneLayer)})`);

await page.screenshot({ path: `${process.env.HOME}/Downloads/ring-over-drip.png` });
await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
