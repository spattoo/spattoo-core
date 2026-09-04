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

/* Two sweeps, because there turned out to be two questions. DEG rotates the map; ENV swaps it.
 * ⚠️ THE SECOND ONE IS THE REAL ONE. Rotation, roughness and envIntensity were each swept to
 * exhaustion and each was already at its best value, which is what points at the map's own content:
 * an outdoor sphere is mostly open sky, and a metal reflecting a large featureless bright field IS
 * glare. `ENV=256,512,1k` compares them on the real cake.
 *   DEG=0,45 node scripts/measure-topper-glare.mjs
 *   ENV=256,512,1k node scripts/measure-topper-glare.mjs */
const ENVS = process.env.ENV ? process.env.ENV.split(',') : null;
const DEGREES = (process.env.DEG || "0").split(",").map(Number);
const RUNS = ENVS
  ? ENVS.map(e => ({ label: e, q: `&env=${encodeURIComponent(e)}` }))
  : DEGREES.map(d => ({ label: `${d}°`, q: `&envrot=${d}` }));

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

console.log('map/rot    pixels   mean   contrast   relative');
for (const run of RUNS) {
  const bare = await grab(`${URL}?x=1${run.q}`);
  const with_ = await grab(`${URL}?topper=1${run.q}`);
  if (bare.lit < 500 || with_.lit < 500) {
    console.log(`${run.label.padStart(6)}     REFUSED — the HDRI did not load, so this is not the real scene.`);
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
  if (lum.length < 100) { console.log(`${run.label.padStart(6)}     topper not found`); continue; }

  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  /* ⚠️ RELATIVE CONTRAST IS THE COMPARABLE NUMBER. A map that dims everything lowers the spread too,
     so raw sd rewards darkness; sd/mean asks how legible the lettering is at whatever brightness it
     ended up with. Rotation was picked on this and 0° won. */
  console.log(`${run.label.padStart(6)}   ${String(lum.length).padStart(6)}   ${
    String(Math.round(mean)).padStart(4)}   ${sd.toFixed(1).padStart(8)}   ${(sd / mean).toFixed(3).padStart(8)}`);
}
await browser.close();
