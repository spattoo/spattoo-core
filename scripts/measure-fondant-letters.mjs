/* Does a fondant message render the colour that was picked?
 *
 * ⚠️ A NEW SURFACE NEEDS ITS OWN MEASUREMENT (INVARIANTS #16). `buildSolidWallMaterial` is shared
 * with relief cut-out walls and takes the colour RAW, so a fondant letter inherits whatever that
 * path does. The reference light is a property of the SURFACE, and a letter standing in the open on
 * a cake wall is not a cut-out's side wall.
 *
 * The letters are found by DIFFING — the same scene with the word in the asked colour and in black —
 * so nothing about where they sit enters into finding them.
 *
 *   node scripts/measure-fondant-letters.mjs        (needs `npm run dev` on 5190)
 */
import { chromium } from 'playwright';

const COLOURS = process.env.COLOURS
  ? process.env.COLOURS.split(',')
  : ['#808080', '#C2567A', '#4EC5B0', '#F6DCE2', '#4A2C1B', '#7FC241', '#FFFFFF'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

const grab = async (colour) => {
  await page.goto(`http://localhost:5190/acrylic-text.html?text=Baby&surface=side&color=${encodeURIComponent(colour)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4200);
  const f = page.locator('text="Fondant"').first();
  if (await f.count()) { await f.click(); await page.waitForTimeout(2600); }
  /* The canvas itself, which the harness keeps readable (`preserveDrawingBuffer`) precisely so this
     can work. A page screenshot would drag the control panel into the average. */
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    return Array.from(t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
  });
};

const dark = await grab('#000000');
console.log('fondant  asked            on the cake      drift');
for (const c of COLOURS) {
  const img = await grab(c);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) {
    const d = Math.abs(img[i] - dark[i]) + Math.abs(img[i + 1] - dark[i + 1]) + Math.abs(img[i + 2] - dark[i + 2]);
    if (d < 60) continue;
    r += img[i]; g += img[i + 1]; b += img[i + 2]; n++;
  }
  if (n < 120) { console.log(`${c}  letters not found (${n}px)`); continue; }
  const shown = [r / n, g / n, b / n].map(Math.round);
  const a = hex(c);
  console.log(`${c}  ${String(a.join(',')).padEnd(16)} ${String(shown.join(',')).padEnd(16)} ${
    shown.map((v, i) => (v - a[i] > 0 ? '+' : '') + (v - a[i])).join(',').padEnd(16)} ${n}px`);
}
await browser.close();
