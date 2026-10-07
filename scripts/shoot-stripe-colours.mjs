/* Editing a stripe colour changes the CAKE — including a colour past the stripe count.
 *
 * Sandeep, on a 2-tier cake with the bottom tier striped: "when i change the colors from below
 * color pickers, its not changing."
 *
 * ⚠️ THE CAUSE WAS TRUNCATION, NOT A DEAD PICKER. `expandPalette` fills `count` stripes by CYCLING
 * the palette, so five colours at a count of three render the first three and drop the rest. The
 * write always worked — asserting that the palette array changed would have passed the entire time
 * the bug existed. The cake is the only witness, so this reads pixels.
 *
 * Assumes `npm run dev` on 5190.   node scripts/shoot-stripe-colours.mjs
 */
import { chromium } from 'playwright';
const fails = []; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?stripes2=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
const skip = page.locator('text=Skip').first(); if (await skip.count()) { await skip.click(); await page.waitForTimeout(800); }

const stripes = () => page.evaluate(() => window.__design?.().tiers?.[0]?.stripes ?? null);
/* The BOTTOM tier's wall. Sampled rather than screenshotted so the comparison is a number. */
const wallMean = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
  // a band across the lower cake, in device pixels
  const y0 = Math.floor(t.height * 0.55), y1 = Math.floor(t.height * 0.80);
  const x0 = Math.floor(t.width * 0.10), x1 = Math.floor(t.width * 0.42);
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * t.width + x) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++;
  }
  return [r / n, g / n, bl / n].map(Math.round);
});

await page.evaluate(() => window.__selectTier?.(0));
await page.waitForTimeout(2200);

console.log('\nthe bottom tier starts with more colours than stripes');
const before = await stripes();
ok(before?.palette?.length === 5 && before?.count === 3,
   `5 colours, ${before?.count} stripes — the last two cannot be drawn`);
const pixBefore = await wallMean();

/* Select the LAST stripe — the one the count truncates away — then pick a colour for it. */
await page.locator('[title="Stop 5"]').first().click();
await page.waitForTimeout(700);
/* A preset swatch from the wheel: the darkest one, so the change is unmistakable against pastels. */
const picked = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('div')].filter(d => {
    const s = getComputedStyle(d);
    return s.borderRadius === '50%' && parseFloat(s.width) >= 20 && parseFloat(s.width) <= 40
           && d.children.length === 0;
  });
  const lum = (c) => { const m = c.match(/\d+/g); return m ? +m[0] * 0.3 + +m[1] * 0.6 + +m[2] * 0.1 : 999; };
  const dark = dots.map(d => ({ d, l: lum(getComputedStyle(d).backgroundColor) }))
                   .sort((a, z) => a.l - z.l)[0];
  if (!dark) return null;
  (dark.d.parentElement ?? dark.d).click();
  return getComputedStyle(dark.d).backgroundColor;
});
ok(!!picked, `picked a colour for stripe 5 — ${picked}`);
await page.waitForTimeout(2000);

console.log('\nthe colour reaches the cake');
const after = await stripes();
/* ⚠️ RAISED, NOT REPLACED: the count follows the palette so every colour is reachable. */
ok(after?.count === 5, `the stripe count rose to fit the palette — ${after?.count}`);
ok(after?.palette?.[4] !== before?.palette?.[4], `stripe 5 is a new colour — ${after?.palette?.[4]}`);
const pixAfter = await wallMean();
const diff = pixBefore.reduce((s, v, i) => s + Math.abs(v - pixAfter[i]), 0);
ok(diff > 10, `and the WALL changed — ${pixBefore} → ${pixAfter} (Δ${diff})`);
await page.screenshot({ path: `${process.env.HOME}/Downloads/stripe-colours.png` });

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} FAILED` : '\n✓ all checks passed');
process.exit(fails.length ? 1 : 0);
