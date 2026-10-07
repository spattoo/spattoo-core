/* A rainbow can be moved to another tier.
 *
 * Sandeep: "for a 2 tier cake, i cant place the rainbow on the below tier sidewise."
 *
 * ⚠️ IT ASSERTS THE DESIGN, NOT THE PICKER. A highlighted "1" proves a button took a click; only
 * reading which tier's `rainbows` list holds it proves the decoration moved — those are the two
 * halves, and the tier is not a field on the rainbow, it IS which list holds it.
 *
 * Assumes `npm run dev` on 5190.   node scripts/shoot-rainbow-tier.mjs
 */
import { chromium } from 'playwright';
const fails = []; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?rainbow2=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
const skip = page.locator('text=Skip').first(); if (await skip.count()) { await skip.click(); await page.waitForTimeout(800); }

/* Which tier's list holds it — the only fact that matters. */
const whereIsIt = () => page.evaluate(() => {
  const d = window.__design?.();
  if (!d) return 'no hook';
  const at = (d.tiers ?? []).findIndex(t => (t.rainbows ?? []).some(r => r.id === 'rb1'));
  return at;
});

/* ⚠️ THE ELEMENT STACK STARTS COLLAPSED HERE and the card is inside it, so without this the run
   times out looking for a card that exists and is behind a handle. */
const handle = page.locator('text=◀').first();
if (await handle.count()) { await handle.click(); await page.waitForTimeout(1200); }
await page.locator('text=Rainbow').first().click();
await page.waitForTimeout(1800);
console.log('\nthe card offers a tier, and moving it moves the decoration');
ok(await whereIsIt() === 1, `starts on the upper tier — ${await whereIsIt()}`);
const tierBtns = page.locator('text=Tier').first();
ok(await tierBtns.count() === 1, 'the card shows a Tier picker on a 2-tier cake');
await page.locator('button:text-is("1")').first().click();
await page.waitForTimeout(1500);
ok(await whereIsIt() === 0, `moved to the lower tier — now on ${await whereIsIt()}`);
await page.screenshot({ path: `${process.env.HOME}/Downloads/rainbow-lower-tier.png` });
await page.locator('button:text-is("2")').first().click();
await page.waitForTimeout(1500);
ok(await whereIsIt() === 1, `and back up — now on ${await whereIsIt()}`);

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} FAILED` : '\n✓ all checks passed');
process.exit(fails.length ? 1 : 0);
