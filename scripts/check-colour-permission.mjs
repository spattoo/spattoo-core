/* A colour control appears only when the element's row grants it.
 *
 * Sandeep: *"in admin i did not select color changeable. how come there is a color picker without
 * explicitly selecting color changeable."*
 *
 * ⚠️ THE RISK IN THIS CHANGE IS THE OTHER DIRECTION. Four procedural cards drew a ColorWheel and
 * none of them asked the row. Gypsophila's row genuinely did not grant colour; the other three were
 * correct only by luck. Gating them is a no-op WHILE their rows say yes — and silently removes a
 * baker's control the moment a row says no or an id goes missing. So this drives each card and
 * checks BOTH directions: granted → the picker is there, not granted → it is not.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/check-colour-permission.mjs
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

/* `e-gyp` grants no colour; the other three do. A ColorWheel renders react-colorful, whose
   saturation panel carries a stable class — the honest thing to look for, since the wheel has no
   text of its own. */
const CASES = [
  { id: 'e-gyp', name: 'gypsophila' },
  { id: 'e20',   name: 'piped grass' },
  { id: 'e33',   name: 'cream strokes' },
  { id: 'e23',   name: 'letter blocks' },
];

for (const c of CASES) {
  const row = await page.evaluate((id) => window.__dumpElement?.(id) ?? null, c.id);
  const grants = row?.allowed_actions?.color === true;
  await page.evaluate((id) => window.__tapElementById?.(id), c.id);
  await page.waitForTimeout(3200);
  /* Cream strokes opens on its fork — pick the band so the palette is on screen. */
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => /Strokes round the cake/.test(x.textContent))?.click());
  await page.waitForTimeout(1800);
  const hasWheel = await page.evaluate(() =>
    !!document.querySelector('.react-colorful, [class*="react-colorful"]'));
  ok(hasWheel === grants,
     `${c.name}: row grants colour = ${grants}, card shows a picker = ${hasWheel}`);
  /* Clear it off the cake so the next case starts clean. */
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => /^Remove from cake$|^Remove grass$|^Remove$/.test(x.textContent.trim()))?.click());
  await page.waitForTimeout(1500);
}

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
