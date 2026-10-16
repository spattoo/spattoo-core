/* "Can add a stick" must reach a HERO element's card, not only a per-instance sticker popup.
 *
 * Sandeep: *"for image toppers i selected 'can add stick', but the card popup in core designer does
 * not show stick option."*
 *
 * ⚠️ A `single_per_slot` ELEMENT OPENS ITS ELEMENT CARD, BY DESIGN — one card managing all its
 * placements — so tapping it selects a `decorEl`, and the stick row was written for `sticker`. The
 * capability was therefore unreachable for every hero: an admin could tick the box, save, place the
 * topper and never see a pick. Dead config of the kind that looks like a missing feature.
 *
 * Both directions, because the risk in the fix is the other one: a hero WITHOUT the flag must still
 * show no stick.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-hero-stick.mjs
 */
import { chromium } from 'playwright';

const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

await page.goto('http://localhost:5190/designer-mobile.html?catalog=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

for (const [id, name, wants] of [['e35', 'a hero that may go on a stick', true],
                                 ['e28', 'a hero that may not', false]]) {
  const row = await page.evaluate((x) => window.__dumpElement?.(x) ?? null, id);
  ok((row?.allowed_actions?.stick === true) === wants,
     `${name}: the row says stick = ${row?.allowed_actions?.stick === true}`);
  ok(row?.placement_config?.single_per_slot === true, `${name}: it IS a hero (single_per_slot)`);

  await page.evaluate((x) => window.__tapElementById?.(x), id);
  await page.waitForTimeout(3200);
  /* ⚠️ A HERO'S CARD OPENS WITH NOTHING PLACED — tapping it in the drawer offers the SLOTS, and the
     instance arrives when one is ticked. The stick row needs an instance to act on (there is
     nothing to put on a pick otherwise), so the first run reported the feature missing on a card
     that had no decoration on the cake at all. Tick TOP, the way the report's screenshot shows it. */
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('*')].find(n =>
      n.children.length === 0 && n.textContent.trim() === 'TOP');
    (tile?.closest('button') ?? tile?.parentElement?.closest('div'))?.click();
  });
  await page.waitForTimeout(2600);
  const placed = await page.evaluate((x) => (window.__getStickers() ?? []).filter(s => s.elementId === x).length, id);
  ok(placed > 0, `${name}: ticking TOP places one (${placed})`);
  const txt = await page.evaluate(() => document.body.innerText);
  /* The stick row is labelled "On a stick"; its dials are In / Long / Thick. */
  const shown = /On a stick|\bStick\b/i.test(txt);
  ok(shown === wants, `${name}: the card offers a stick = ${shown}`);
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(n => /^Remove from cake$/.test(n.textContent.trim()))?.click());
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: `${process.env.HOME}/Downloads/hero-stick-card.png` });
await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
