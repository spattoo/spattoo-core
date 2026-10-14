/* Tapping the gypsophila on the cake opens its card.
 *
 * Sandeep: *"gypsophila does not have a popup pointer."* What the side stack's own roadmap note
 * calls a pointer is a pointer HANDLER on the cake — and gypsophila had none. On the rim that is
 * the only way in: a band has no position of its own, so it carries no drag handle to tap instead.
 *
 * ⚠️ IT CLICKS A PIXEL THE FLOWERS ACTUALLY OCCUPY, found by photographing the cake with them and
 * without and diffing. Aiming at a fraction of the canvas put the first attempt on bare backdrop
 * and reported the feature broken while it worked — the same mistake that cost three runs on the
 * wafer sweep. A separate script from shoot-gyp-card.mjs because proving this means CLOSING the
 * card, which strands every assertion that needs it open.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-gyp-tap.mjs
 */
import { chromium } from 'playwright';

const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

/* ⚠️ THE DIFF HAPPENS IN THE PAGE, against the WebGL canvas itself. Comparing two PNGs on disk
   wanted a decoder this repo does not carry, and adding a dependency to aim a mouse click is the
   wrong trade. The canvas is already readable — `preserveDrawingBuffer` is on for the capture
   paths — so a frame can be kept as pixels and the next one subtracted from it. */
/* ⚠️ THE CANVAS DOES NOT SPAN THE WINDOW, and assuming it did is what made the first two attempts
   read the wrong pixels entirely — one found no rose anywhere on a cake covered in them. The
   decoration stack takes part of the width, so a point in PAGE coordinates has to be mapped through
   the canvas's own bounding rect before it indexes into the readback. */
const grab = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const t = document.createElement('canvas');
  t.width = c.width; t.height = c.height;
  t.getContext('2d').drawImage(c, 0, 0);
  return { w: t.width, h: t.height, rect: { x: r.x, y: r.y, w: r.width, h: r.height },
           data: [...t.getContext('2d').getImageData(0, 0, t.width, t.height).data] };
});
/* page (CSS) point → index into a readback */
const idx = (f, x, y) => {
  const px = Math.round((x - f.rect.x) * (f.w / f.rect.w));
  const py = Math.round((y - f.rect.y) * (f.h / f.rect.h));
  if (px < 0 || py < 0 || px >= f.w || py >= f.h) return -1;
  return (f.w * py + px) * 4;
};

await page.goto('http://localhost:5190/designer-mobile.html?catalog=1&rimroses=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

const before = await grab();
await page.evaluate(() => window.__tapElementById?.('e-gyp'));
await page.waitForTimeout(3500);
const after = await grab();

/* Whatever changed between the two frames IS the gypsophila — the canvas carries no card. */
const spots = [];
for (let y = Math.round(after.rect.y) + 20; y < after.rect.y + after.rect.h - 20; y += 2) {
  for (let x = Math.round(after.rect.x) + 20; x < after.rect.x + after.rect.w - 20; x += 2) {
    const i = idx(after, x, y);
    if (i < 0) continue;
    const d = Math.abs(after.data[i] - before.data[i])
            + Math.abs(after.data[i + 1] - before.data[i + 1])
            + Math.abs(after.data[i + 2] - before.data[i + 2]);
    if (d > 54) spots.push([x, y]);
  }
}
ok(spots.length > 200, `the flowers are on the cake (${spots.length} changed pixels)`);

/* ⚠️ PROVED BY A FLIP, NOT BY A CLEAN SLATE. Clicking bare backdrop does NOT deselect in this
   designer — the first version asserted "nothing is selected to begin with" and went red against
   correct behaviour. So: select a ROSE, then tap the flowers, and watch the selection move. That
   also rules out the tap merely leaving an already-open card alone, which a blank-slate test would
   have counted as a pass. */
let best = -1, rose = null;
for (let y = Math.round(after.rect.y) + 20; y < after.rect.y + after.rect.h - 20; y += 2) {
  for (let x = Math.round(after.rect.x) + 20; x < after.rect.x + after.rect.w - 20; x += 2) {
    const i = idx(after, x, y);
    if (i < 0) continue;
    /* The reddest pixel wins rather than a fixed threshold: the rose's own shading, the scene light
       and the baked AO all move its RGB, and a hardcoded cut returned nothing on a cake covered in
       roses. */
    const red = after.data[i] - Math.max(after.data[i + 1], after.data[i + 2]);
    if (red > best) { best = red; rose = [x, y]; }
  }
}
if (best <= 40) rose = null;
ok(!!rose, `found a rose to select first (${rose})`);
if (!rose) { console.log('\n✗ cannot run without one'); await b.close(); process.exit(1); }
await page.mouse.click(rose[0], rose[1]);
await page.waitForTimeout(1300);
const first = await page.evaluate(() => window.__selectedEl?.());
ok(first?.type === 'sticker', `a rose is selected to begin with (${JSON.stringify(first)})`);

/* ⚠️ SEVERAL CANDIDATES, because a thin band has gaps and a ray through one correctly hits what is
   behind. The claim is "tapping the flowers opens the card", not "every pixel near them does". */
let opened = null;
for (const [x, y] of spots.filter((_, k) => k % Math.ceil(spots.length / 14) === 0)) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(1100);
  const sel = await page.evaluate(() => window.__selectedEl?.());
  if (sel?.type === 'gyp') { opened = [x, y]; break; }
}
ok(!!opened, `tapping the flowers opens their card (${opened ? `at ${opened}` : 'no tap landed'})`);

const txt = await page.evaluate(() => document.body.innerText);
ok(/Baby's breath/.test(txt), 'and it is the gypsophila card that opened');
await page.screenshot({ path: `${process.env.HOME}/Downloads/gyp-tap-opens-card.png` });
await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
