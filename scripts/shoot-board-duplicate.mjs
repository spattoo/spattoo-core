/* Duplicating a decoration that stands on the BOARD.
 *
 *   Sandeep: "some elements that are duplicatable, but not getting duplicated on cake. 'Twisted
 *   seaweed shot' [short], when i clic on duplicate, it adds a popupcard but does not add element
 *   on the cake. same case with fluted scallap shell" … "those are hiding inside the cake."
 *
 * The copy went through `deOverlapSeat` with the original's zone, and the board had no branch — so
 * it fell through to the cartesian one, which ends in `topClamp` against the CAKE's tier. A board
 * decoration lives outside that footprint by definition, so every copy was pulled in to 88% of the
 * tier radius and buried in opaque cake. The card appeared, the decoration did not.
 *
 * ⚠️ DRIVES THE CARD'S OWN PLACEMENT CHOOSER, not a hook. `__placeElementByIdZone` hands the drop a
 * literal (0,0), which seats a board piece in the middle of the cake — i.e. the probe would start
 * from the very state the bug produces and prove nothing. Ticking Board in the card is the path the
 * report came from, and it is the one that calls boardRingClamp for the seat.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-board-duplicate.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(2500);

for (const NAME of ['Twisted seaweed short', 'Fluted Scallop Shell']) {
  console.log(`\n── ${NAME} ──`);
  const id = await page.evaluate(n => window.__listElements().find(e => e.name === n)?.id ?? null, NAME);
  ok(!!id, `found "${NAME}" in the catalogue (id ${id})`);
  if (!id) continue;

  /* ⚠️ THE TAP PATH, AND NO TAP AFTERWARDS. `__tapElementById` places one piece AND leaves it
     selected, which is the card in the report (PLACEMENT | TOP | BOARD | SIDE + Duplicate). Tapping
     the sticker to "open" it then toggles that same selection straight back off — handleStickerSelect
     treats a tap on the only selected piece as a deselect — and the card the probe needs is gone. */
  await page.evaluate(i => window.__tapElementById(i), id);
  await page.waitForTimeout(3000);
  ok(await page.evaluate(() => /PLACEMENT/.test(document.body.innerText)), 'the card is open on PLACEMENT');

  // Tick BOARD on the card's own chooser — the gesture that moved these pieces to the drum.
  const tickBoard = () => page.evaluate(() => {
    const tile = [...document.querySelectorAll('div')]
      .filter(d => /^BOARD$/m.test(d.innerText ?? '') && d.querySelector('input[type=checkbox]'))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    const box = tile?.querySelector('input[type=checkbox]');
    if (!box) return false;
    box.click();
    return true;
  });
  ok(await tickBoard(), 'ticked BOARD in the card');
  await page.waitForTimeout(2500);

  const tierR = await page.evaluate(() => window.__design().tiers[0].radius ?? 1.2);
  const seats = () => page.evaluate(() => window.__getStickers()
    .filter(s => s.zone === 'board').map(s => ({ id: s.id, x: s.x, z: s.z })));

  const before = await seats();
  ok(before.length === 1, `one board seat to start (got ${before.length})`);
  const r0 = before[0] ? Math.hypot(before[0].x, before[0].z) : NaN;
  /* `>=`, not `>`: boardRingClamp seats a board piece at `shapeReach(cake, dir) + margin`, and the
     margin is 0 for a stand, so the original rests exactly ON the cake's edge. The bug being tested
     pulled copies to 0.88 of the radius, which this still catches by a mile. */
  ok(r0 >= tierR - 1e-9, `the original stands on the board, not in the cake — r ${r0.toFixed(3)} >= tier ${tierR}`);

  /* Two presses of the real Duplicate button. It calls `clearAllSelections()` after duplicating, so
     the card closes each time and the original has to be re-selected to press it again — which is
     exactly what a baker does, and why the report says "it adds a popupcard" each press. */
  for (const n of [1, 2]) {
    if (n > 1) {
      await page.evaluate(i => window.__tapSticker(i), before[0].id);
      await page.waitForTimeout(1200);
    }
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Duplicate');
      if (!b) return false; b.click(); return true;
    });
    ok(hit, `pressed Duplicate (${n})`);
    await page.waitForTimeout(2500);
  }

  const after = await seats();
  ok(after.length === 3, `three board seats after two duplicates (got ${after.length})`);
  for (const [i, st] of after.entries()) {
    const r = Math.hypot(st.x, st.z);
    ok(r >= tierR - 1e-9, `seat ${i + 1} is on the board, not in the cake — r ${r.toFixed(3)} vs tier ${tierR}`);
  }
  for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) {
    const d = Math.hypot(after[i].x - after[j].x, after[i].z - after[j].z);
    ok(d > 0.2, `seats ${i + 1} and ${j + 1} are apart — ${d.toFixed(3)}`);
  }

  // Close the card so the screenshot shows the cake, not the panel over it.
  await page.evaluate(() => { const s = window.__getSelectedEl?.(); if (s) window.__tapSticker?.(s.id); });
  await page.waitForTimeout(1500);
  const file = `${OUT}/board-duplicate-${NAME.toLowerCase().replace(/\s+/g, '-')}.png`;
  await page.screenshot({ path: file });
  console.log('  →', file);

  await page.evaluate(() => window.__loadDesign({ ...window.__design(), stickers: [] }));
  await page.waitForTimeout(1500);
}

await browser.close();
console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
process.exit(fails.length ? 1 : 0);
