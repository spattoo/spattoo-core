/* Clicking the BAND on the cake opens the cream card.
 *
 * Sandeep: "when a cake is loaded from templates which has cream layer- and if user clicks on the
 * cream layer area, pointer should be available for cream layer." The band is drawn inside the
 * tier's group, so without a handler of its own the click bubbles and selects the TIER — the one
 * thing on the cake you could see and not reach.
 *
 * ⚠️ THE CASE THAT MATTERS IS THE COLD ONE. On a cake restored from a template the bands are drawn
 * from the saved design and the element catalogue has never been fetched, so `creamElement` is null
 * at the moment of the click. A run that seeds the band by hand first has already loaded the
 * catalogue and proves nothing about the reported case — `?creamband=1` starts with the band
 * already on the cake and nothing loaded, which is what a template does.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-cream-band-click.mjs
 */
import { chromium } from 'playwright';
const B = 'http://localhost:5190';
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();

async function open(extra = '') {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  await page.goto(`${B}/designer-mobile.html?cream=1&style=smooth&shape=round${extra}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  return page;
}
/* ⚠️ 0.74, AND THE NUMBER IS THE TEST. A band with `fillSide: 'below'` fills the LOWER part of the
   wall, so the obvious "middle of the cake" point (0.62) is bare wall above it and selects the tier
   — which is the pre-fix answer, so a careless aim fails in exactly the way a broken fix would.
   Swept 0.45 → 0.78 to find it: tier at 0.58 and 0.66, cream at 0.74. Click the band, assert the
   selection, rather than hunting a mesh by name through the R3F tree. */
async function clickBand(page) {
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.74);
  await page.waitForTimeout(1500);
}
const sel = (page) => page.evaluate(() => window.__getSelectedEl?.() ?? null);

console.log('\na band seeded from the tier card, then clicked on the cake');
{
  const page = await open();
  await page.evaluate(() => window.__selectTier?.(0));
  await page.waitForTimeout(1600);
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(e => e.textContent.trim().startsWith('Cream layer'))?.click());
  await page.waitForTimeout(1500);
  ok((await sel(page))?.type === 'cream', 'the row still opens the card');
  // Deselect, then click the band itself.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await clickBand(page);
  const s = await sel(page);
  ok(s?.type === 'cream', `clicking the band selects the cream — got ${JSON.stringify(s?.type)}`);
  await page.screenshot({ path: `${process.env.HOME}/Downloads/cream-band-click.png` });
  await page.close();
}

console.log('\nthe template case — a band already on the cake, catalogue never fetched');
{
  const page = await open('&creamband=1');
  /* ⚠️ ASSERTED, NOT ASSUMED. This read a hook that did not exist and accepted 'unknown', so the one
     condition this case exists to establish was never checked — and if the catalogue were warm the
     test would have passed for the wrong reason. */
  const before = await page.evaluate(() => window.__creamElementLoaded?.() ?? 'no hook');
  ok(before === false, `creamElement is NOT loaded before the click — ${before}`);
  await clickBand(page);
  let s = await sel(page);
  // One fetch has to resolve; the parked click replays itself.
  if (s?.type !== 'cream') { await page.waitForTimeout(2500); s = await sel(page); }
  ok(s?.type === 'cream', `ONE click opens the cream card — got ${JSON.stringify(s?.type)}`);
  await page.screenshot({ path: `${process.env.HOME}/Downloads/cream-band-click-cold.png` });
  await page.close();
}

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} FAILED:\n  - ${fails.join('\n  - ')}` : '\n✓ all checks passed');
process.exit(fails.length ? 1 : 0);
