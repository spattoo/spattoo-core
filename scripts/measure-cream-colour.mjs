/* Does PIPED CREAM render as the colour that was chosen?
 *
 * ⚠️ A SEPARATE MEASUREMENT FROM THE TIER'S, and it has to be. Cream runs at roughness 0.85 with a
 * sheen layer where the wall runs 0.68 with none, so the two receive different amounts of light from
 * the same scene. A reference light is a property of the SURFACE — reusing the wall's number here
 * would be a guess wearing a measurement's clothes.
 *
 * The patch is the second-cream BAND at the foot of the wall (`?cream=1`), which is
 * `creamMaterialProps` — the one function every cream surface goes through.
 *
 *   node scripts/measure-cream-colour.mjs        (needs the dev harness on 5190)
 *
 * ⚠️ THE BAND IS FOUND BY DIFFING, NOT BY COORDINATES. A hand-picked rectangle looked right and
 * silently sampled the white WALL above the band instead: every colour came back 236,234,233, the
 * same wrong answer eight times, which is the shape of a metric that is not measuring its subject at
 * all. So the scene is rendered twice — band in the asked colour, band in white — and the pixels that
 * DIFFER are the band. Nothing about position or hue enters into finding it. Same lesson the topper
 * glare metric had to learn.
 */
import { chromium } from 'playwright';

const COLOURS = process.env.COLOURS
  ? process.env.COLOURS.split(',')
  : ['#F6DCE2', '#4EC5B0', '#C4626B', '#7FC241', '#4A2C1B', '#EFE3CE', '#808080'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 640 } });
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

const grab = async (cream) => {
  await page.goto('http://localhost:5190/garnish-on-cake.html?still=1&cream=1&tier=%23FFFFFF'
    + `&color=%23FFFFFF&creamcolor=${encodeURIComponent(cream)}`
    + (process.env.SOFT ? `&soft=${process.env.SOFT}` : ''), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    return Array.from(t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
  });
};

/* Black reference: the band at #000 differs from the band at any colour across its whole area, so it
 * is the cheapest possible locator and it costs one extra render for the whole run. */
const dark = await grab('#000000');

console.log('cream     asked            on the cake      drift');
for (const c of COLOURS) {
  const px = await grab(c);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 250) continue;
    const d = Math.abs(px[i] - dark[i]) + Math.abs(px[i + 1] - dark[i + 1]) + Math.abs(px[i + 2] - dark[i + 2]);
    if (d < 60) continue;                       // unchanged against a black band: not the band
    r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
  }
  if (n < 200) { console.log(`${c}  band not found (${n}px)`); continue; }
  const shown = [r / n, g / n, b / n].map(Math.round);
  const a = hex(c);
  console.log(`${c}  ${String(a.join(',')).padEnd(16)} ${String(shown.join(',')).padEnd(16)} ${
    shown.map((v, i) => (v - a[i] > 0 ? '+' : '') + (v - a[i])).join(',').padEnd(16)} ${n}px`);
}
await browser.close();
