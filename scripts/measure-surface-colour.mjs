/* Does a chosen colour render as itself on ANY cake surface?
 *
 * ⚠️ ONE SCRIPT, BECAUSE THE QUESTION IS THE SAME EVERY TIME and writing a fourth bespoke sampler is
 * how the third one ended up reading the wrong pixels. `measure-tier-colour` and
 * `measure-cream-colour` came first and each hand-picked a rectangle; the cream one silently sampled
 * the white wall above its band and returned the same wrong answer for all eight colours.
 *
 * ⚠️ THE SURFACE IS FOUND BY DIFFING, NOT BY COORDINATES. The scene is rendered twice — the surface
 * in the asked colour and in black — and the pixels that DIFFER are the surface. Nothing about
 * position or hue enters into finding it, so it cannot drift onto a neighbour.
 *
 *   SURFACE=blocks node scripts/measure-surface-colour.mjs
 *   SURFACE=grass  COLOURS='#808080' node scripts/measure-surface-colour.mjs
 */
import { chromium } from 'playwright';

/* Each entry says how to put the surface on the cake and which URL key carries its colour. */
const SURFACES = {
  blocks: { on: 'blocks=1', key: 'blockcolor' },
  grass:  { on: 'grass=1',  key: 'grasscolor' },
  cloud:  { on: 'cloud=1',  key: 'cloudcolor' },
  rainbow:{ on: 'rainbow=1', key: 'rainbowcolor' },
  drip:   { on: 'drip=1',   key: 'dripcolor' },
  rope:   { on: 'rope=1&bare=1', key: 'ropecolor' },
};

const name = process.env.SURFACE || 'blocks';
const S = SURFACES[name];
if (!S) { console.error(`unknown SURFACE '${name}' — try: ${Object.keys(SURFACES).join(', ')}`); process.exit(1); }

const COLOURS = process.env.COLOURS
  ? process.env.COLOURS.split(',')
  : ['#F6DCE2', '#4EC5B0', '#C4626B', '#7FC241', '#4A2C1B', '#EFE3CE', '#808080'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 640 } });
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

const grab = async (colour) => {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?still=1&${S.on}`
    + `&${S.key}=${encodeURIComponent(colour)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    return Array.from(t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
  });
};

const dark = await grab('#000000');

console.log(`${name.padEnd(8)}  asked            on the cake      drift`);
for (const c of COLOURS) {
  const px = await grab(c);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 250) continue;
    const d = Math.abs(px[i] - dark[i]) + Math.abs(px[i + 1] - dark[i + 1]) + Math.abs(px[i + 2] - dark[i + 2]);
    if (d < 60) continue;
    r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
  }
  if (n < 120) { console.log(`${c}  surface not found (${n}px)`); continue; }
  const shown = [r / n, g / n, b / n].map(Math.round);
  const a = hex(c);
  console.log(`${c}  ${String(a.join(',')).padEnd(16)} ${String(shown.join(',')).padEnd(16)} ${
    shown.map((v, i) => (v - a[i] > 0 ? '+' : '') + (v - a[i])).join(',').padEnd(16)} ${n}px`);
}
await browser.close();
