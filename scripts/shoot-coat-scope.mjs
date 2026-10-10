/* Three ways to coat a cake, looked at rather than asserted about.
 *
 *   Sandeep: "we need to enhance the 'cover entire cake' feature. we should give an option to
 *   cover only the side. or cover only top. as well."
 *
 * ⚠️ NO FIXTURE CARRIED `can_coat` UNTIL NOW, so the coat had no harness at all: every bug in it —
 * the rings left behind, the default colour, the dead click, the ombré that could not reach half
 * the cake — was found on Sandeep's screen and reported back to me. `e34` carries the flag now and
 * this drives the feature the way a baker does: place the ring, open its card, tap a chip.
 *
 * ⚠️ AND IT MEASURES THE PICTURE, NOT THE STATE. `__design().tiers[0].coat.scope` proves only that
 * a chip wrote a field. The question is whether the GPU drew that surface and left the other one
 * bare. Rosettes are high-frequency and plain cream is flat, so LOCAL VARIANCE inside a lid band
 * and a wall band separates covered from bare without caring about colour or lighting.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-coat-scope.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`page error: ${e.message}`); });

await page.goto(`${B}/designer-mobile.html?catalog=1&realglb=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click();
});
await page.waitForTimeout(600);

console.log('\nplacing the rosette ring on the rim');
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(1500);
/* ⚠️ `__openPiping`, AND NEITHER OF THE OTHER TWO DOORS. `__placeElementByIdZone` goes through
   handleElementDrop and reported true while putting nothing on the cake; `__tapElementById` opened
   the decoration card instead — "PLACEMENT / EDGE / BOARD", no coat section in sight. A piping row
   is filtered out of the decorations grid and reached only through the ring-picker tile, which is
   exactly what the hook's own comment in CakeDesigner says. Two wasted runs for a trap that was
   already written down. */
ok(await page.evaluate(() => window.__openPiping?.('e34') ?? false), 'the rosette piping card is open');
await page.waitForTimeout(3000);

const CHIPS = ['Whole cake', 'Sides only', 'Top only'];
const found = await page.evaluate((names) => names.map(t => {
  const n = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t);
  return n ? { t, x: n.getBoundingClientRect().x, w: n.getBoundingClientRect().width } : null;
}), CHIPS);
ok(found.every(Boolean), `all three scope chips are on the card: ${CHIPS.join(', ')}`);
if (!found.every(Boolean)) {
  await page.screenshot({ path: `${OUT}/coat-scope-no-chips.png` });
  console.log('  page text:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700));
  await b.close(); process.exit(1);
}
// Rule 5: a baker's screen is a phone. Three chips must fit one without scrolling sideways.
const rightmost = Math.max(...found.map(c => c.x + c.w));
ok(rightmost <= 390, `and they fit a 390px phone (rightmost edge ${Math.round(rightmost)}px)`);

/* ── what actually got drawn ─────────────────────────────────────────────────────────────────── */
/* ⚠️ READ OFF THE WEBGL CANVAS, not off a screenshot. A screenshot carries the card, the chips and
   the toolbar, so a band in page coordinates would measure the UI as often as the cake. Same
   drawImage/getImageData route `measure-tier-colour.mjs` uses, and no new dependency.
 *
 * ⚠️ AND OF THE CAKE, NOT OF THE CANVAS. Fixed fractions of the viewport sampled background: the
 * designer re-frames when a card opens and re-frames AGAIN between scopes, because a coat changes
 * how tall the cake is. The extent is measured every time, down the middle column where the board
 * cannot widen it.
 *
 * TWO DIFFERENT QUESTIONS, because one measure could not answer both:
 *
 *   the WALL — high-frequency energy, |Δ| between neighbouring pixels. Rosettes are busy and a
 *     painted wall is flat, and the profile is unambiguous: 2.4–4.1 covered against 0.2–1.2 bare.
 *
 *   the LID — COLOUR, because at the designer's three-quarter view the lid is nearly edge-on and
 *     the middle column crosses the rosettes on the FAR rim whether the lid is coated or not. The
 *     energy there reads the same for all three scopes. The colour does not: this fixture's tier is
 *     pink and its coat is cream, so blue-minus-green separates them with nothing in between. */
const probe = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(cv.width * 0.44), w = Math.round(cv.width * 0.12);
  const d = t.getContext('2d').getImageData(x0, 0, w, cv.height).data;
  const px  = (x, y) => { const i = ((y * w) + x) << 2; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = (x, y) => { const c = px(x, y); return (c[0] + c[1] + c[2]) / 3; };
  const bg = lum(0, 2);

  let top = -1, bot = -1;
  const isCake = (y) => { for (let x = 0; x < w; x += 2) if (Math.abs(lum(x, y) - bg) > 12) return true; return false; };
  for (let y = 0; y < cv.height; y++) if (isCake(y)) { top = y; break; }
  for (let y = cv.height - 1; y >= 0; y--) if (isCake(y)) { bot = y; break; }
  if (top < 0 || bot - top < 60) return null;

  const row = (f) => Math.round(top + (bot - top) * f);
  let e = 0, n = 0;
  for (let y = row(0.50); y < row(0.80); y++) for (let x = 1; x < w; x++) { e += Math.abs(lum(x, y) - lum(x - 1, y)); n++; }

  const y0 = row(0.26);
  let r = 0, g = 0, b = 0, m = 0;
  for (let y = y0 - 4; y <= y0 + 4; y++) for (let x = Math.round(w * 0.35); x < Math.round(w * 0.65); x++) {
    const c = px(x, y); r += c[0]; g += c[1]; b += c[2]; m++;
  }
  return { top, bot, wall: n ? e / n : 0, lid: [r / m, g / m, b / m].map(Math.round) };
});

console.log('\nwhat each chip draws');
const report = {};
for (const [key, label] of [['all', 'Whole cake'], ['side', 'Sides only'], ['top', 'Top only']]) {
  await page.evaluate((t) => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)?.click();
  }, label);
  await page.waitForTimeout(3200);
  const stored = await page.evaluate(() => window.__design?.().tiers?.[0]?.coat?.scope ?? null);
  ok(stored === key, `"${label}" stores scope "${key}" (got ${stored})`);

  const file = `${OUT}/coat-scope-${key}.png`;
  await page.screenshot({ path: file });
  /* One retry: a capture taken while the camera is still re-fitting comes back empty, and that is
     a measurement of the timing, not of the feature. */
  let p = await probe();
  if (!p) { await page.waitForTimeout(2500); p = await probe(); }
  ok(!!p, `the cake is on screen for "${label}"`);
  if (!p) continue;
  report[key] = p;
  console.log(`    ${key.padEnd(5)} wall energy ${p.wall.toFixed(1).padStart(4)}   lid ${String(p.lid).padEnd(15)}`
            + ` B-G ${String(p.lid[2] - p.lid[1]).padStart(4)}   rows ${p.top}-${p.bot}   → ${file}`);
}

console.log('\ncovered vs bare');
const r = report;
const creamy = (c) => c[2] - c[1] <= -4;      // the coat
const pinky  = (c) => c[2] - c[1] >= 0;       // this fixture's bare tier
if (r.all && r.side && r.top) {
  ok(r.all.wall  > 1.5, `whole cake: the wall is covered (energy ${r.all.wall.toFixed(1)})`);
  ok(creamy(r.all.lid), `whole cake: and so is the lid (${r.all.lid})`);
  ok(r.side.wall > 1.5, `sides only: the wall is still covered (energy ${r.side.wall.toFixed(1)})`);
  ok(pinky(r.side.lid), `sides only: and the lid is BARE (${r.side.lid})`);
  ok(r.top.wall  < 1.2, `top only: the wall is BARE (energy ${r.top.wall.toFixed(1)})`);
  ok(creamy(r.top.lid), `top only: and the lid is covered (${r.top.lid})`);
}

/* And it comes off again — the reason Remove exists at all. */
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Remove')?.click();
});
await page.waitForTimeout(2000);
ok(await page.evaluate(() => !window.__design?.().tiers?.[0]?.coat), 'Remove takes the coat off again');
await page.screenshot({ path: `${OUT}/coat-scope-removed.png` });

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await b.close();
process.exit(fails.length ? 1 : 0);
