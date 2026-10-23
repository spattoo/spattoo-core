/* ── One beat of a product video, recorded at both widths ────────────────────────────────────────
 *
 *   node .pw/demo/beat.mjs --out ~/Desktop/demo/03-decorations
 *
 * Proves the layer end to end: pointer travels, click lands for real, view pushes in, and the same
 * script serves 1280×800 and a 405×720 phone where half the rail lives behind More.
 *
 * ⚠️ deviceScaleFactor 2, ON PURPOSE. The zoom is a CSS transform, so a page rastered at 1x goes
 * soft the moment it is pushed in. At 2x there are device pixels to spend and the zoom stays
 * readable — which is the whole point of zooming at a rail label 11px tall.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 */
import { chromium } from 'playwright';
import { openDemo, SHAPES } from './driver.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('out', `${process.env.HOME}/Downloads/demo-beat`);
const URL = arg('url', 'http://localhost:5190/designer-mobile.html?catalog=1');

const browser = await chromium.launch();
for (const [shape, viewport] of Object.entries(SHAPES)) {
  const touch = shape === 'phone';
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 2, hasTouch: touch,
    recordVideo: { dir: `${OUT}/${shape}`, size: viewport },
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  ${shape} PAGE ERROR:`, e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__loadElements?.());
  await page.waitForTimeout(2000);

  const d = await openDemo(page, { touch });
  console.log(`\n── ${shape} ${viewport.width}×${viewport.height} ──`);

  await d.hold(900);
  // The beat: point out Decorations, open it, push in on what it holds.
  await d.openNav('Decorations', { alt: 'Decor' });
  console.log('  ✓ opened Decorations');
  await d.hold(800);
  await d.zoomOn('Sport', 1.7);
  await d.hold(1400);
  await page.screenshot({ path: `${OUT}/${shape}-zoomed.png` });
  await d.zoomOut();
  await d.hold(600);
  // …and a second destination, which on a phone is behind More.
  await d.openNav('Customers');
  console.log('  ✓ opened Customers (via More on a phone)');
  await d.hold(1200);
  await page.screenshot({ path: `${OUT}/${shape}-customers.png` });

  await ctx.close();
}
await browser.close();
console.log(`\n✓ recorded both shapes under ${OUT}\n`);
