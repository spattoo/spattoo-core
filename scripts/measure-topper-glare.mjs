/* Why does a gold topper glare head-on? Measures it IN THE REAL SCENE.
 *
 * ⚠️ GLARE IS LOW CONTRAST, which is what makes this measurable rather than a matter of taste. A metal
 * has no diffuse colour — what you see IS the reflected environment — so a bright uniform field gives
 * every pixel the same value and the lettering vanishes into a sheet of white. A legible gold shows
 * BANDS: bright where it catches a source, dark where it does not. The metric is the spread of
 * luminance across the topper's own pixels; higher is more legible.
 *
 *   node scripts/measure-topper-glare.mjs        (needs the dev server on 5190)
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];
console.log('rotation   mean   contrast   verdict');
for (const deg of DEGREES) {
await page.goto(`http://localhost:5190/garnish-on-cake.html?topper=1&envrot=${deg}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);

/* ⚠️ REFUSE TO MEASURE WITH NO ENVIRONMENT, because the failure is SILENT and it invalidates
 * everything downstream. `SafeEnvironment` deliberately degrades to the scene's own lights when the
 * HDRI cannot be fetched — drei's `apartment` preset pulls from a CDN that 503s — and that is right
 * for a customer, who gets a dimmer cake instead of a white screen. It is fatal for a measurement:
 * the scene environment is nearly ALL the light on these surfaces, so without it every reading is of
 * a different scene, and a run that happens to load it and a run that does not disagree completely.
 *
 * The gold board is the canary: it is bright yellow with the HDRI and dark brown without. */
const envLoaded = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 180 && d[i + 1] > 140 && d[i + 2] < 120) bright++;   // gold board, lit
  }
  return bright > 500;
});
if (!envLoaded) {
  console.log(`${String(deg).padStart(4)}°      REFUSED — the HDRI did not load, so this is not the real scene.`);
  continue;
}
const r = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  /* Gold is warm and bright. The topper stands ABOVE the cake, so read the upper half only — the gold
     board would otherwise dominate and hide the topper's own spread. */
  const lum = [];
  for (let y = 0; y < cv.height * 0.5; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] < 200) continue;
      const [r2, g2, b2] = [d[i], d[i + 1], d[i + 2]];
      if (!(r2 > b2 + 20 && r2 > 110)) continue;
      lum.push(0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2);
    }
  }
  if (lum.length < 40) return null;
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return { sd: +sd.toFixed(1), mean: Math.round(mean), n: lum.length,
           min: Math.round(Math.min(...lum)), max: Math.round(Math.max(...lum)) };
});
/* ⚠️ LOWER MEAN AND HIGHER CONTRAST IS BETTER. Glare is a bright, flat sheet; legible gold is
   darker overall with real bands in it. Judging on either number alone picks the wrong winner —
   dimming everything raises nothing, and contrast alone can come from noise. */
console.log(`${String(deg).padStart(4)}°   ${String(r ? r.mean : '—').padStart(5)}   ${
  String(r ? r.sd : '—').padStart(7)}   ${r ? (r.mean < 190 && r.sd > 30 ? 'legible' : '') : 'no gold'}`);
if (deg === 0) await page.screenshot({ path: '/tmp/topper.png' });
}
await browser.close();
