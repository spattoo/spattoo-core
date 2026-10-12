/* Drawing cream strokes by hand, on the cake, with a real drag.
 *
 *   Sandeep: "in the cream stroke studio, we did not integrate the hand stroke feature. we did this
 *   piece already in admin. user should be able to do the strokes by himself. vertical or
 *   horizontal."
 *
 * ⚠️ VERTICAL OR HORIZONTAL IS THE DRAG, NOT A SETTING, so that is what this asserts: a drag DOWN
 * the wall must come back as climb with no sweep, and a drag ACROSS it as sweep with little climb.
 * Checking only that "a stroke appeared" would pass on a feature that ignored the direction
 * entirely, which is the whole of what was asked for.
 *
 * ⚠️ AND IT HAS TO BE A REAL POINTER DRAG. The bug this caught on its first run was a wiring one:
 * the wall target handed `brushGestureFromDrag` a point as [x, y, z] where it reads .x / .y / .z,
 * so every coordinate fell back to 0, every gesture measured zero travel, and the function
 * correctly returned null for a tap. Nothing threw. Nothing warned. The cake simply never took a
 * stroke, and no unit test would have seen it because both halves were right on their own.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-brush-draw.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

const btn = (src) => page.evaluate((t) => {
  const n = [...document.querySelectorAll('button')].find(x => new RegExp(t, 'i').test(x.textContent));
  if (!n) return false; n.click(); return true;
}, src);
const strokes = () => page.evaluate(() => window.__design?.().tiers?.[0]?.brushStrokes ?? []);

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(1500);

console.log('\nthe cream-strokes card');
ok(await page.evaluate(() => window.__tapElementById?.('e33') ?? false), 'the Cream strokes row puts a band on the cake');
await page.waitForTimeout(2500);
ok(await page.evaluate(() => !!window.__design?.().tiers?.[0]?.brushBand), 'and the tier carries it');
ok(await btn('Draw your own'), 'the card offers "Draw your own"');
await page.waitForTimeout(900);

/* The cake sits in the middle of the canvas; these are drags across its front. */
const cv = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height };
});
const drag = async (x0, y0, x1, y1) => {
  await page.mouse.move(cv.l + cv.w * x0, cv.t + cv.h * y0);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(cv.l + cv.w * (x0 + (x1 - x0) * k / 8), cv.t + cv.h * (y0 + (y1 - y0) * k / 8));
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  await page.waitForTimeout(1400);
};

console.log('\ndragging DOWN the wall');
await drag(0.47, 0.50, 0.47, 0.70);
let list = await strokes();
ok(list.length === 1, `one stroke is laid (${list.length})`);
const down = list[0];
if (down) {
  ok(Math.abs(down.climb) > 0.15, `and it RUNS DOWN the wall (climb ${down.climb?.toFixed(3)})`);
  ok(Math.abs(down.sweep) < 0.03, `without sweeping round it (sweep ${down.sweep?.toFixed(3)})`);
}

console.log('\ndragging ACROSS the wall');
await drag(0.40, 0.55, 0.56, 0.55);
list = await strokes();
ok(list.length === 2, `a second stroke is laid (${list.length})`);
const across = list[1];
if (across) {
  ok(Math.abs(across.sweep) > 0.04, `and it SWEEPS round the wall (sweep ${across.sweep?.toFixed(3)})`);
  ok(Math.abs(across.climb) < Math.abs(down?.climb ?? 1), `travelling less up it than the first (climb ${across.climb?.toFixed(3)})`);
}
/* A drawn stroke takes the colour in front of the baker, not a default — the studio has the same
   note, from the same report ("its not keeping the same thickness, its resetting"). */
ok(list.every(st => st.color), `each stroke carries a colour (${list.map(st => st.color).join(', ')})`);
await page.screenshot({ path: `${OUT}/brush-draw.png` });

console.log('\nclearing');
ok(await btn('Clear the ones I drew'), 'the card offers to clear them');
await page.waitForTimeout(1200);
ok((await strokes()).length === 0, 'and the drawn strokes go, leaving the band');
ok(await page.evaluate(() => !!window.__design?.().tiers?.[0]?.brushBand), 'the band is still there');

/* ⚠️ THE TAP TEST GOES LAST, because a tap on the cake SELECTS the tier and that closes the
   cream-strokes card — so every button lookup after it failed, and the run reported "the card does
   not offer to clear them" about a card that was no longer on screen. Ordering, not a bug. */
console.log('\na tap is not a stroke');
await page.mouse.click(cv.l + cv.w * 0.50, cv.t + cv.h * 0.60);
await page.waitForTimeout(1200);
ok((await strokes()).length === 0, 'tapping the wall leaves no cream behind');

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
