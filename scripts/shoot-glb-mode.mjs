/* The same GLB on a board as `hug` and as `stand`.
 *
 * Sandeep: *"when this makeup palette is created as element - it looked fine in manage elements
 * screen. but when its actualy rendered, it shows broken. why?"*
 *
 * ⚠️ ADMIN'S EDITOR PREVIEWS A MODEL ON ITS OWN. The designer puts it through fit-scaling, seating,
 * material overrides from placement_config AND a placement MODE — and `hug` means "conform this to
 * the surface", which is right for a flat decal and flattens a rigid box. `?glb=` renders the real
 * asset so the comparison is about this model rather than a stand-in.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-glb-mode.mjs
 */
/* ⚠️ IT BORROWS `e9`, WHICH IS RECOLOURABLE, so the pans come out tinted rather than in the
 * model's own vertex colours — an artefact of the debug row, not of the asset. Judge the SHAPE in
 * these renders, never the colour. (`?glb=` could be given its own non-recolourable row the day
 * that matters.)
 *
 * ⚠️ AND IT NEEDS A FILE THE DEV SERVER CAN SERVE. A customer's asset is not committed here; fetch
 * it from R2 into dev/ for the run and delete it after:
 *     curl -s -o dev/_debug.glb "$R2_PUBLIC_URL/<image_url from the row>"
 */
import { chromium } from 'playwright';

const BASE = { r: 2, scale: { max: 4, min: 1, step: 0.25 },
               metalness: 0.002445262491864701, roughness: 0.3453386420920417 };
const b = await chromium.launch();

for (const mode of ['hug', 'stand']) {
  const pc = encodeURIComponent(JSON.stringify({ ...BASE, board: mode, top_surface: mode }));
  const page = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/designer-mobile.html?catalog=1&glb=/_debug.glb&pc=${pc}&zones=top_surface,board`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
  await page.waitForTimeout(3000);
  await page.evaluate(async () => { await window.__loadElements?.(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__dropElementAt?.('e9', { zone: 'board', tierIndex: 0, x: 1.6, z: 0.9 }));
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => (window.__getStickers() || [])[0] ?? null);
  console.log(`  ${mode.padEnd(5)} → placementMode=${st?.placementMode}  scale=${st?.scale}`);
  await page.screenshot({ path: `/tmp/glbmode-${mode}.png` });
  await page.close();
}
await b.close();
console.log('\n  wrote /tmp/glbmode-hug.png and /tmp/glbmode-stand.png');
