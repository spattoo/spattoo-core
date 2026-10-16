/* Cream strokes on BOTH tiers of a two-tier cake, driven the way a baker drives it.
 *
 * ⚠️ THE MODEL ALWAYS ALLOWED IT — a band is stored per tier and the designer already built one
 * CARD per tier that carries one. What there was no door to was putting the second one on: the
 * catalogue row landed on `rainbowTierIndex()` unconditionally, so a second tap silently OVERWROTE
 * the band on the top tier. Sandeep: *"right now i want to add strokes to both the tiers and i am
 * not able to do."*
 *
 * ⚠️ `?rainbow2` IS THE TWO-TIER FIXTURE. A one-tier cake cannot reach this at all, which is also
 * why the Duplicate button is absent there rather than present and inert.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-brush-tiers.mjs
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });
const click = (t) => page.evaluate((x) => {
  const n = [...document.querySelectorAll('button')].find(y => y.textContent.trim() === x || y.textContent.trim().startsWith(x));
  if (!n) return false; n.click(); return true;
}, t);
const bands = () => page.evaluate(() => window.__design().tiers.map(t => !!t.brushBand));

await page.goto('http://localhost:5190/designer-mobile.html?catalog=1&rainbow2=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);
ok(await page.evaluate(() => window.__design().tiers.length) === 2, 'the cake has two tiers');

console.log('\nthe first band');
await page.evaluate(() => window.__tapElementById?.('e33'));
await page.waitForTimeout(2500);
ok(JSON.stringify(await bands()) === '[false,true]', `it lands on the top tier (${JSON.stringify(await bands())})`);
ok(await click('Strokes round the cake'), 'chose "Strokes round the cake"');
await page.waitForTimeout(2000);

console.log('\ntapping the row again');
/* ⚠️ THIS IS THE BUG. It used to overwrite the band already on the top tier — the list did not
   grow and the cake did not change, which is exactly "i am not able to do". */
await page.evaluate(() => window.__tapElementById?.('e33'));
await page.waitForTimeout(2500);
ok(JSON.stringify(await bands()) === '[true,true]', `a second tap lands on the BARE tier (${JSON.stringify(await bands())})`);

console.log('\nboth are reachable');
/* ⚠️ ASSERTED ON THE DESIGN, NOT BY COUNTING "Cream strokes" IN THE DOM — which is what I tried
   first, and it reported ONE while the cake plainly wore two. The decoration strip is COVERED by
   whichever card is open, so the count was measuring what was on screen rather than what the cake
   had. Each band carries its own tier and `isCardSelected` tells them apart by it; selecting one by
   tier is the thing a baker's tap on the strokes does. */
for (const t of [0, 1]) {
  await page.evaluate((k) => window.__selectBrushBand?.(k), t);
  await page.waitForTimeout(1200);
  const sel = await page.evaluate(() => window.__selectedEl?.());
  ok(sel?.type === 'brushBand' && sel.tierIndex === t,
     `tier ${t + 1}'s band opens its own card (${JSON.stringify(sel)})`);
}

console.log('\na third tap destroys nothing');
const before = await page.evaluate(() => JSON.stringify(window.__design().tiers.map(t => t.brushBand?.seed)));
await page.evaluate(() => window.__tapElementById?.('e33'));
await page.waitForTimeout(2000);
const after = await page.evaluate(() => JSON.stringify(window.__design().tiers.map(t => t.brushBand?.seed)));
ok(before === after, 'with every tier banded, re-tapping overwrites nothing');

console.log('\nDuplicate, from the card');
/* ⚠️ TAKE OFF THE ONE STILL ASKING, AND KEEP THE CONFIGURED ONE. The second tap's band opens in
   `mode: 'ask'` — two offers and nothing on the wall yet — and that branch returns early, before
   Duplicate. Rightly so: there is nothing chosen to duplicate. My first run removed the configured
   band instead and then reported Duplicate missing from a card that correctly does not show it. */
await page.evaluate(() => window.__selectBrushBand?.(0));
await page.waitForTimeout(1200);
ok(await click('Remove from cake'), 'took the unconfigured one off to make room');
await page.waitForTimeout(2000);
const left = await bands();
ok(left.filter(Boolean).length === 1, `one band left (${JSON.stringify(left)})`);
/* ⚠️ Remove CALLS `clearAllSelections`, so no card is open afterwards — the first run looked for
   Duplicate in an empty sheet and reported it missing on a card that offers it. Re-open the band
   that is left before asking what its card shows. */
await page.evaluate((k) => window.__selectBrushBand?.(k), left.findIndex(Boolean));
await page.waitForTimeout(1500);
const txt = await page.evaluate(() => document.body.innerText);
ok(/Duplicate/.test(txt), 'the card offers Duplicate');
/* ⚠️ AND LOOK AT IT, not just at whether the click lands. Duplicate and Remove share a row that has
   to wrap at 390px — the same fault this card's sibling hit twice, where a button that works
   perfectly sits half off the sheet (rule 5). Shot HERE, while Duplicate is on screen: a footer
   photographed after it has been pressed no longer shows it, because by then there is nowhere left
   to duplicate to. */
await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('*')].find(n => n.scrollHeight > n.clientHeight + 40 && n.clientHeight > 200);
  if (sheet) sheet.scrollTop = sheet.scrollHeight;
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${process.env.HOME}/Downloads/brush-card-footer.png` });
ok(await click('Duplicate'), 'tapped Duplicate');
await page.waitForTimeout(2500);
ok(JSON.stringify(await bands()) === '[true,true]', `both tiers carry one again (${JSON.stringify(await bands())})`);
/* ⚠️ A FRESH SEED. Copying it puts the strokes at the same angles on both tiers, which on a stack
   reads as a printed repeat rather than a second pass of the same knife. */
const seeds = await page.evaluate(() => window.__design().tiers.map(t => t.brushBand?.seed));
ok(seeds[0] !== seeds[1], `the copy gets its own hand (${seeds.join(' vs ')})`);
const cols = await page.evaluate(() => window.__design().tiers.map(t => JSON.stringify(t.brushBand?.colors)));
ok(cols[0] === cols[1], 'and keeps the colours it was tuned with');

await page.screenshot({ path: `${process.env.HOME}/Downloads/brush-both-tiers.png` });

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
