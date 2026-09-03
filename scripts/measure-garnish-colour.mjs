/* Renders a garnish on the REAL cake scene in several colours and reports what comes back.
 *
 * ⚠️ THE POINT IS THAT NOBODY HAS TO SEND A SCREENSHOT. The colour bug survived four rounds because
 * it was judged by eye, in messages, one picture at a time — and because the one measurement taken
 * used dark chocolate, the single colour on which an environment wash is invisible. This measures
 * saturated mid-tones, where it shows.
 *
 *   node scripts/measure-garnish-colour.mjs            (needs the dev server on 5190)
 */
import { chromium } from 'playwright';

const COLOURS = ['#4EC5B0', '#C4626B', '#E8963C', '#7FC241', '#4A2C1B', '#EFE3CE'];
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });

console.log('colour     asked            on the cake      drift');
for (const c of COLOURS) {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?color=${encodeURIComponent(c)}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  /* ⚠️ SAMPLE THE PIECE, NOT "WHATEVER IS CLOSEST TO THE ANSWER". The first version picked the
     sampled pixel nearest the asked colour, which can land on the cake itself and made a reading move
     the wrong way — it reported teal getting worse when the base had unambiguously been darkened.
     A measurement that chooses its own subject is not a measurement. The standing panel is at a known
     place in this fixture, so read a small window there and take the modal colour. */
  const best = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const m = new Map();
    /* ⚠️ THIS WINDOW IS WRONG AND MUST BE FIXED BEFORE THE NUMBERS MEAN ANYTHING. It reads all
       zeros — the panel is not where these fractions point, or the pixels there are transparent.
       Find the piece first (screenshot the harness, or scan for the pixels that differ most from the
       cake's pale pink OUTSIDE the top-left swatch) and pin the window to it. A sampler that returns
       0,0,0 for every colour is not measuring the render; it is measuring nothing, confidently. */
    const x0 = Math.round(cv.width * 0.46), x1 = Math.round(cv.width * 0.52);
    const y0 = Math.round(cv.height * 0.30), y1 = Math.round(cv.height * 0.40);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] < 200) continue;
      const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0].split(',').map(Number) : [0, 0, 0];
  });
  const want = hex(c);
  console.log(`${c}  ${String(want).padEnd(16)} ${String(best).padEnd(16)} ${
    best.map((v, i) => (v - want[i] > 0 ? '+' : '') + (v - want[i])).join(',')}`);
}
await browser.close();
