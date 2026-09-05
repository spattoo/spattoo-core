/* Does a BAKER-CHOSEN TIER COLOUR render as the colour that was chosen?
 *
 * ⚠️ THE SAME QUESTION `measure-garnish-colour.mjs` ASKS, ABOUT A DIFFERENT SURFACE — and it has to
 * be asked separately, because the garnish fix was scoped to the garnish material. A tier is lit by
 * the same environment and has no such correction, so if the environment washes a colour it washes
 * this one too. Nothing here should be inferred from the garnish table.
 *
 * The patch is the tier's FRONT FACE: flat, unshadowed, and clear of the board, the topper and any
 * garnish. Sampling anywhere near the rim picks up the curve's falloff and reads as drift that is
 * really just shading.
 *
 *   node scripts/measure-tier-colour.mjs        (needs the dev harness on 5190)
 */
import { chromium } from 'playwright';

const COLOURS = process.env.COLOURS
  ? process.env.COLOURS.split(',')
  : ['#F6DCE2', '#4EC5B0', '#C4626B', '#7FC241', '#4A2C1B', '#EFE3CE', '#808080', '#FFFFFF'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 680 } });

const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

console.log('tier      asked            on the cake      drift');
for (const c of COLOURS) {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?tier=${encodeURIComponent(c)}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const shown = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const g = t.getContext('2d');
    const sx = Math.round(cv.width * 0.40), sy = Math.round(cv.height * 0.62);
    const d = g.getImageData(sx, sy, Math.round(cv.width * 0.16), Math.round(cv.height * 0.12)).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 250) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n, gg / n, b / n].map(Math.round) : null;
  });
  if (!shown) { console.log(`${c}  no sample`); continue; }
  const a = hex(c);
  const chroma = (v) => Math.max(...v) - Math.min(...v);
  console.log(`${c}  ${String(a.join(',')).padEnd(16)} ${String(shown.join(',')).padEnd(16)} ${
    shown.map((v, i) => (v - a[i] > 0 ? '+' : '') + (v - a[i])).join(',').padEnd(16)}  chroma ${chroma(a)}→${chroma(shown)}`);
}
await browser.close();
