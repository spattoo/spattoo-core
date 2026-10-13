/* A band AND hand strokes, on the same cake.
 *
 *   Sandeep: "its not either 'round the cake' vs 'draw', it can be both. i can do the round first
 *   and then i want to add few strokes by hand above that. this was the reason i wanted a separate
 *   card popup (sub popup) for each hand stroke differently."
 *
 * ⚠️ THE RENDERER NEVER DISAGREED — ONLY THE CARD DID. `BrushStrokes` draws `tier.brushStrokes`
 * whatever the band is doing, and the two have always been separate fields. The card tied them
 * together: "Draw them myself INSTEAD" set `mode: 'draw'`, and `brushBandRings` reads that as "no
 * ring", so reaching for the brush took the band off the cake. A unit test on either half would
 * have passed throughout.
 *
 * So what this asserts is the COMBINATION, which is the only place the bug lived: after drawing,
 * the band must still be ringing the cake. Checking "a stroke appeared" passes on the broken build.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes a dev server on 5190.
 *   node scripts/shoot-brush-both.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

const btn = (t) => page.evaluate((src) => {
  const n = [...document.querySelectorAll('button')].find(x => new RegExp(src, 'i').test(x.textContent));
  if (!n) return false; n.click(); return true;
}, t);
const band = () => page.evaluate(() => window.__design?.().tiers?.[0]?.brushBand ?? null);
const strokes = () => page.evaluate(() => window.__design?.().tiers?.[0]?.brushStrokes ?? []);

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(1500);

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

console.log('\nringing the cake first');
ok(await page.evaluate(() => window.__tapElementById?.('e33') ?? false), 'the Cream strokes row opens the card');
await page.waitForTimeout(2500);
ok(await btn('Strokes round the cake'), 'picked the band');
await page.waitForTimeout(1200);
ok((await band())?.mode === 'band', `the band rings the cake (mode ${(await band())?.mode})`);
await page.screenshot({ path: `${OUT}/brush-both-1-band.png` });

console.log('\nthen adding strokes by hand, WITHOUT losing the band');
ok(await btn('Add strokes by hand'), 'the band card offers to add hand strokes');
await page.waitForTimeout(900);
/* ⚠️ THIS IS THE ASSERTION THE OLD BUILD FAILED. The button used to say "instead" and set
   mode:'draw', so the band came off the cake the moment drawing was switched on. */
ok((await band())?.mode === 'band', `the band is STILL on the cake (mode ${(await band())?.mode})`);

await drag(0.47, 0.46, 0.47, 0.66);
const list = await strokes();
ok(list.length === 1, `a hand stroke is laid (${list.length})`);
ok((await band())?.mode === 'band', 'and the band survived the drawing');
ok(/This stroke/i.test(await page.evaluate(() => document.body.innerText)),
   'the stroke that was just drawn has its own card');

console.log('\nboth are on the cake at once');
const b = await band();
ok(b?.mode === 'band' && (await strokes()).length === 1,
   `band ringing AND ${(await strokes()).length} drawn`);
await page.screenshot({ path: `${OUT}/brush-both-2-band-plus-drawn.png` });

console.log('\nand the drawn ones can go without taking the band with them');
ok(await btn('Clear the ones I drew'), 'the card offers to clear just the drawn ones');
await page.waitForTimeout(900);
ok((await strokes()).length === 0, 'the drawn strokes go');
ok((await band())?.mode === 'band', 'the band stays');

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
