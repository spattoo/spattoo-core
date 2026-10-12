/* "cream strokes look so dull, so matte, not like a cream. can we improve it?"
 *
 * ⚠️ TWO NUMBERS, NOT ONE, BECAUSE THE DULLNESS WAS BOUGHT ON PURPOSE. `CREAM_SPECULAR` is 0.3
 * rather than three.js's 1 because a clean dielectric's Fresnel runs to 1 at grazing angles, and on
 * a surface that RAMPS DOWN to the cake — the skirt of a brushstroke — that is a wide desaturated
 * band that reads as a white shadow drawn round the shape. Sandeep reported it three times
 * ("not fixed yet"), and the fix was this term. So a sweep that only chases gloss will walk
 * straight back into a settled bug.
 *
 *   GLOSS   (p95−p5)/mean inside the stroke — the swing between its brightest and darkest pixel,
 *           which is what separates buttercream from felt. The same reading measure-gloss-class.mjs
 *           uses, for the same reason: a mean cannot tell matte from wet.
 *   HALO    how many pale pixels sit on the WALL just outside the stroke's edge. That is the
 *           artefact, measured where it actually appears rather than inside the stroke.
 *
 * A setting is only better if gloss goes UP and halo does NOT.
 *
 * ⚠️ NOT `networkidle` — the harness runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/measure-brush-gloss.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190/brush-stroke.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));

/* One stroke, straight on, pale pink on a white cake — the case in Sandeep's screenshot. */
const read = async (q) => {
  await page.goto(`${B}?${q}`, { waitUntil: 'domcontentloaded' });
  /* ⚠️ WAIT FOR THE CANVAS, don't assume a fixed delay is enough. Vite's first cold transform of
     this page can outrun 3.5s, and then `document.querySelector('canvas')` is null and the run dies
     with "Cannot read properties of null" — a measurement that failed for a reason that has nothing
     to do with what is being measured. */
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(3500);          // the scene mounts and the env map lands after it
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const lum = (x, y) => { const i = ((y * cv.width) + x) << 2; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    const sat = (x, y) => {
      const i = ((y * cv.width) + x) << 2;
      const c = [d[i], d[i + 1], d[i + 2]];
      return Math.max(...c) - Math.min(...c);
    };
    /* The stroke is the saturated region — the cake is white and the ground is grey, so chroma
       finds the cream without any guess about where the camera parked it. */
    const px = [];
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (sat(x, y) > 18) px.push([x, y]);
    }
    if (px.length < 500) return null;
    /* ⚠️ A LOOP, NOT Math.min(...xs). The stroke is tens of thousands of pixels and spreading that
       into an argument list overflows the stack — "Maximum call stack size exceeded" from inside a
       one-line bounding box. */
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const [x, y] of px) {
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    }

    /* ⚠️ ONE STROKE, AND THE BRIGHT TAIL — not p95−p5 over everything, which is what this measured
       first and why the first sweep reported that a near-MIRROR and CHALK look identical. The page
       carries five strokes in five colours, so a spread taken across all of them is dominated by
       how dark purple is against yellow, and a specular highlight — a small, bright tail inside ONE
       stroke — disappears into it. (A frame diff settled that the override was reaching the shader:
       7.35% of pixels differ by more than 15 between those two extremes. The knob worked; the
       ruler did not.) Bucket by hue, take the biggest bucket, and read p99 against the median. */
    const hueOf = (x, y) => {
      const i = ((y * cv.width) + x) << 2;
      const r = d[i] / 255, g = d[i + 1] / 255, bl = d[i + 2] / 255;
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), c = mx - mn;
      if (c < 1e-6) return -1;
      const h = mx === r ? ((g - bl) / c + 6) % 6 : mx === g ? (bl - r) / c + 2 : (r - g) / c + 4;
      return Math.round(h * 60 / 20);                       // 20° buckets
    };
    const buckets = new Map();
    for (const [x, y] of px) {
      const h = hueOf(x, y);
      if (h < 0) continue;
      (buckets.get(h) ?? buckets.set(h, []).get(h)).push(lum(x, y));
    }
    let one = [];
    for (const v of buckets.values()) if (v.length > one.length) one = v;
    one.sort((a, b) => a - b);
    const q = f => one[Math.min(one.length - 1, Math.floor(f * one.length))];
    const mean = q(0.5);
    const gloss = mean ? (q(0.99) - mean) / mean : 0;

    /* The halo: pixels on the WALL within 14px of the stroke's silhouette that are brighter than
       the wall's own level further out. Counted per 1000 silhouette pixels so it does not simply
       track how big the stroke came out. */
    const isCream = new Set(px.map(([x, y]) => y * cv.width + x));
    const far = [];
    for (let y = box.y0; y <= box.y1; y += 2) {
      for (const x of [box.x0 - 60, box.x1 + 60]) if (x > 0 && x < cv.width) far.push(lum(x, y));
    }
    const wall = far.length ? far.reduce((a, c) => a + c, 0) / far.length : 255;
    let halo = 0, edge = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = Math.max(1, box.x0 - 16); x <= Math.min(cv.width - 2, box.x1 + 16); x++) {
        if (isCream.has(y * cv.width + x)) continue;
        let near = false;
        for (let k = 1; k <= 14 && !near; k++) {
          if (isCream.has(y * cv.width + x - k) || isCream.has(y * cv.width + x + k)) near = true;
        }
        if (!near) continue;
        edge++;
        if (lum(x, y) > wall + 6) halo++;
      }
    }
    return { gloss: +gloss.toFixed(3), mean: Math.round(mean), halo: edge ? +(1000 * halo / edge).toFixed(0) : 0,
             n: px.length, one: one.length };
  });
};

const BASE = 'at=0.5&color=%23e58fb0';
console.log('rough  spec  sheen │ gloss   mean   halo/1000edge');
const rows = [];
for (const [rough, spec, sheen] of [
  [null, null, null],          // as it ships: 0.85 / 0.30 / 0.40
  [0.85, 0.60, 0.40],
  [0.85, 1.00, 0.40],
  [0.70, 0.30, 0.40],
  [0.60, 0.30, 0.40],
  [0.50, 0.30, 0.40],
  [0.60, 0.50, 0.40],
  [0.60, 0.30, 0.20],
  [0.45, 0.40, 0.25],
]) {
  const q = BASE + (rough != null ? `&rough=${rough}&spec=${spec}&sheen=${sheen}` : '');
  const r = await read(q);
  if (!r) { console.log('  (no stroke found)'); continue; }
  rows.push({ rough, spec, sheen, ...r });
  console.log(`${String(rough ?? 'ship').padEnd(6)} ${String(spec ?? '').padEnd(5)} ${String(sheen ?? '').padEnd(5)} │ `
    + `${String(r.gloss).padEnd(7)} ${String(r.mean).padEnd(6)} ${r.halo}`);
}
const base = rows[0];
console.log('\nagainst what ships:');
for (const r of rows.slice(1)) {
  const dg = ((r.gloss / base.gloss - 1) * 100).toFixed(0);
  console.log(`  ${r.rough}/${r.spec}/${r.sheen}  gloss ${dg > 0 ? '+' : ''}${dg}%  halo ${r.halo - base.halo >= 0 ? '+' : ''}${r.halo - base.halo}`);
}
await browser.close();
