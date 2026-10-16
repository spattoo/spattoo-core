/* A card on a stick stands, whatever the design says.
 *
 *   Sandeep: "i selected 'on stick' in card topper studio. then selected 'lying flat' option. it
 *   sleeps like this on cake. 'lying flat' should not be possible when on stick."
 *
 * ⚠️ THE UNIT TEST CANNOT SEE THIS HALF. `topperMode` is three lines and is tested directly; what
 * it cannot show is that the RENDERER asks it — the placement happens inside Toppers.jsx, and a
 * change that resolved the mode and then passed the raw object anyway would keep every assertion
 * green and keep the card lying down. So this measures the cake.
 *
 * ⚠️ AND IT NEEDS THE NO-STICK CASE AS A CONTROL. "Both stick renders are identical" is also what
 * you would get from a renderer that had stopped reading `mode` at all; the third case is what says
 * the choice still works where it means something.
 *
 * ⚠️ NOT `networkidle` — the harness runs a live scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-topper-stick.mjs
 */
import { chromium } from 'playwright';

const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

/* How high the piece reaches: the topmost row that is not backdrop, across the middle of the frame.
   A card on a stick stands well above the lid; one laid flat hugs it. */
const reach = async (q, name) => {
  await page.goto(`http://localhost:5190/topper-on-cake.html?still=1&${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/topper-${name}.png` });
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const lum = (x, y) => { const i = ((y * cv.width) + x) << 2; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    const bg = lum(2, 2);
    for (let y = 0; y < cv.height; y++)
      for (let x = Math.round(cv.width * 0.2); x < cv.width * 0.8; x += 2)
        if (Math.abs(lum(x, y) - bg) > 14) return y;
    return -1;
  });
};

console.log('\na card on a stick');
const lie = await reach('stick=1&mode=lie', 'stick-lie');
const stand = await reach('stick=1&mode=stand', 'stick-stand');
ok(lie > 0 && stand > 0, `both render (${lie}, ${stand})`);
ok(Math.abs(lie - stand) <= 2, `"lying flat" on a stick renders as STANDING (${lie} vs ${stand})`);

console.log('\nand the control: no stick');
const flat = await reach('mode=lie', 'nostick-lie');
ok(flat > stand + 40, `without a stick it really does lie down (${flat} vs ${stand} standing)`);

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
