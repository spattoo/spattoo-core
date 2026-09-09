/* Does a CARD TOPPER render as the colour that was chosen?
 *
 * ⚠️ ITS OWN MEASUREMENT, like cream's and the wall's. A reference light belongs to the SURFACE: this
 * runs at roughness 0.86 with no clearcoat and no sheen, which is not the wall (0.68) and not cream
 * (0.85 with a sheen layer). Borrowing one of their numbers would be a guess wearing a
 * measurement's clothes.
 *
 *   npm run dev            (harness on 5190)
 *   node scripts/measure-card-colour.mjs
 *
 * ⚠️ TWO READINGS, INTERPOLATED — one division overshoots. The pipeline is not a pure multiply end to
 * end, so tone mapping compresses differently at the higher albedo a smaller divisor produces. Every
 * surface measured so far has needed the second reading (INVARIANT #16).
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:5190/card-colour.html';   // vite root is dev/, so no /dev prefix
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lin = (rgb) => rgb.map(v => srgbToLinear(v / 255));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 520, height: 520 } });

async function read(colour) {
  await page.goto(`${URL}?c=${colour.replace('#', '')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);                 // the HDRI has to arrive and one frame has to land
  const shot = await page.screenshot({ clip: { x: 250, y: 250, width: 8, height: 8 } });
  // Average the little patch rather than trust one pixel.
  const { createCanvas, loadImage } = await import('canvas').catch(() => ({}));
  if (!createCanvas) {
    // No canvas module: read the pixel straight out of the page instead.
    return page.evaluate(() => {
      const c = document.querySelector('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      const px = new Uint8Array(4);
      g.readPixels(c.width / 2, c.height / 2, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    });
  }
  const img = await loadImage(shot);
  const cv = createCanvas(8, 8); const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [r / n, g / n, b / n];
}

const GREY = '#808080';
const asked = lin(hex(GREY));

const got1 = await read(GREY);
const light1 = lin(got1).map((v, i) => v / asked[i]);
console.log(`1st  asked ${GREY}  rendered ${got1.map(v => Math.round(v)).join(',')}  →  light ${light1.map(v => v.toFixed(3)).join(', ')}`);

// Put the first guess in and read again — the correction is applied to the albedo we ask for.
const corrected = toHex(lin(hex(GREY)).map((v, i) => {
  const a = Math.min(1, v / light1[i]);
  return 255 * (a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055);
}));
const got2 = await read(corrected);
console.log(`2nd  asked ${corrected}  rendered ${got2.map(v => Math.round(v)).join(',')}`);

// Interpolate: we want the albedo whose render lands on the grey we asked for.
const target = lin(hex(GREY));
const final = light1.map((L1, i) => {
  const a1 = asked[i],           r1 = lin(got1)[i];
  const a2 = Math.min(1, a1 / L1), r2 = lin(got2)[i];
  if (Math.abs(r2 - r1) < 1e-6) return L1;
  const aWanted = a1 + (a2 - a1) * ((target[i] - r1) / (r2 - r1));
  return aWanted > 1e-6 ? a1 / aWanted : L1;
});
console.log(`\nreference light  [${final.map(v => v.toFixed(3)).join(', ')}]`);
await browser.close();
