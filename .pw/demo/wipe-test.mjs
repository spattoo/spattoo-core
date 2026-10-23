/* Does the spatula wipe read as a spatula? Catches it mid-sweep, at both widths.
 *   node .pw/demo/wipe-test.mjs --out ~/Downloads/wipe
 * Assumes `npm run dev` is up on 5190.
 */
import { chromium } from 'playwright';
import { openDemo, SHAPES } from './driver.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('out', `${process.env.HOME}/Downloads/wipe`);

const browser = await chromium.launch();
for (const [shape, viewport] of Object.entries(SHAPES)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2,
    recordVideo: { dir: `${OUT}/${shape}`, size: viewport } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5190/designer-mobile.html?catalog=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
  await page.waitForTimeout(2500);
  const d = await openDemo(page, { touch: shape === 'phone' });

  // Catch the blade mid-frame: cover, shoot, change the scene, uncover.
  await d.hold(600);
  await d.scene(async () => {
    await page.screenshot({ path: `${OUT}/${shape}-covered.png` });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Decor/i.test(x.textContent))?.click());
    await page.waitForTimeout(900);
  });
  await d.hold(700);
  await page.screenshot({ path: `${OUT}/${shape}-after.png` });
  // …and a full sweep-through, shot a third of the way across.
  const sweep = page.evaluate(o => window.__spattooDemo.wipe(o), { ...(await import('./driver.mjs')).spatula(), ms: 1600 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${shape}-sweeping.png` });
  await sweep;
  await ctx.close();
  console.log(`✓ ${shape}`);
}
await browser.close();
console.log(`\nframes under ${OUT}\n`);
