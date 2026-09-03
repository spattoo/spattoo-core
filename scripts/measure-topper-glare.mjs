/* How legible is a gold topper, and which way should the environment face?
 *
 * ⚠️ GLARE IS LOW CONTRAST, which is what makes this measurable rather than a matter of taste. A metal
 * has no diffuse colour — what you see IS the reflected environment — so a bright uniform field gives
 * every pixel nearly the same value and the lettering vanishes into a sheet of white. Legible gold
 * shows BANDS: bright where it catches a source, dark where it does not.
 *
 * ⚠️ THE TOPPER IS FOUND BY DIFFING, NOT BY COLOUR, and that is the whole reason this reading can be
 * trusted. An earlier version selected "gold-ish" pixels — warm and bright — and it reversed its own
 * conclusion when the scene's intensity changed, because once the cake and board were lit enough they
 * matched that description too. A metric that moves when an unrelated variable moves is not a
 * measurement. So the scene is rendered twice, with the topper and without, and the pixels that
 * DIFFER are the topper. Nothing about brightness or hue enters into finding it.
 *
 *   node scripts/measure-topper-glare.mjs        (needs the dev server on 5190)
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:5190/garnish-on-cake.html';
const DEGREES = (process.env.DEG || "0,45,90,135,225,270,315").split(",").map(Number);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const grab = async (url) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    /* ⚠️ THE GOLD BOARD IS THE CANARY. `SafeEnvironment` degrades silently to the lamps alone when
       drei's CDN 503s — right for a customer, fatal here, because this environment is nearly ALL the
       light on a metal. A run that loaded it and one that did not disagree completely. */
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 180 && d[i + 1] > 140 && d[i + 2] < 120) lit++;
    }
    return { px: Array.from(d), w: cv.width, h: cv.height, lit };
  });
};

console.log('rotation   pixels   mean   contrast');
for (const deg of DEGREES) {
  const bare = await grab(`${URL}?envrot=${deg}`);
  const with_ = await grab(`${URL}?topper=1&envrot=${deg}`);
  if (bare.lit < 500 || with_.lit < 500) {
    console.log(`${String(deg).padStart(4)}°     REFUSED — the HDRI did not load, so this is not the real scene.`);
    continue;
  }

  const lum = [];
  for (let i = 0; i < with_.px.length; i += 4) {
    const dr = Math.abs(with_.px[i] - bare.px[i]);
    const dg = Math.abs(with_.px[i + 1] - bare.px[i + 1]);
    const db = Math.abs(with_.px[i + 2] - bare.px[i + 2]);
    if (dr + dg + db < 40) continue;                       // unchanged: not the topper
    lum.push(0.2126 * with_.px[i] + 0.7152 * with_.px[i + 1] + 0.0722 * with_.px[i + 2]);
  }
  if (lum.length < 100) { console.log(`${String(deg).padStart(4)}°     topper not found`); continue; }

  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  console.log(`${String(deg).padStart(4)}°   ${String(lum.length).padStart(6)}   ${
    String(Math.round(mean)).padStart(4)}   ${sd.toFixed(1).padStart(7)}`);
}
await browser.close();
