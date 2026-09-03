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

const COLOURS = ['#4EC5B0', '#C4626B', '#E8963C', '#7FC241', '#4A2C1B', '#EFE3CE', '#808080'];
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });

console.log('colour     asked            on the cake      drift');
for (const c of COLOURS) {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?color=${encodeURIComponent(c)}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  /* ⚠️ FIND THE PIECE, DO NOT ASSUME WHERE IT IS. Two earlier samplers were wrong in opposite ways:
     one took "the pixel closest to the answer", which can land on the cake and flatters the result;
     the next read a fixed window that turned out to be empty and reported 0,0,0 for every colour with
     total confidence. Both produced tables that looked like measurements.
     The piece is whatever differs most from the cake's own pale pink, ignoring the swatch drawn in
     the top-left corner. Modal colour of those pixels, so a highlight or an edge cannot carry it. */
  const best = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const m = new Map();
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (x < 130 && y < 90) continue;                 // the asked-for swatch
        const i = (y * cv.width + x) * 4;
        if (d[i + 3] < 200) continue;
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        /* ⚠️ THIS REJECT LIST IS NOT GOOD ENOUGH FOR PALE OR ORANGE PIECES. Both #E8963C and
           #EFE3CE read back as 248,229,148 — identical, which is the giveaway: that is the GOLD
           BOARD, not the piece. Any colour close to the board or the cake defeats a colour-based
           filter. Trust the rows whose reading is clearly the piece's own hue; for the rest, pin the
           sample to the panel's screen position instead of hunting by colour. */
        // the cake is pale and pink; the board is yellow-gold; a piece is neither
        const pale = r > 200 && g > 190 && b > 190;
        const gold = r > 150 && g > 120 && b < 110;
        if (pale || gold) continue;
        const k = `${r},${g},${b}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0].split(',').map(Number) : [0, 0, 0];
  });
  const want = hex(c);
  console.log(`${c}  ${String(want).padEnd(16)} ${String(best).padEnd(16)} ${
    best.map((v, i) => (v - want[i] > 0 ? '+' : '') + (v - want[i])).join(',')}`);
}
await browser.close();
