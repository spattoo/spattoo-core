/* Do gold-leaf shards read as METAL?
 *
 * A shard is stamped into the tier-wall maps at metalness 0.6 / roughness 0.16 / envMapIntensity 4.5
 * — the numbers in GOLD_LEAF_DEFAULTS, which describe a glossy foil. Reported dull from the app on
 * 2026-09-09: flat pale patches on a cake whose gold BOARD, in the same frame, is plainly metallic.
 *
 * ⚠️ WHAT MAKES METAL READ AS METAL IS RANGE, NOT BRIGHTNESS. A flat mean says nothing — matte paint
 * and mirror gold can share one. What separates them is the spread between a shard's brightest and
 * darkest pixel, because that spread IS the reflection. So this reports contrast, and treats mean as
 * context. The board is measured in the same frame as a reference that is known to read correctly.
 *
 * The shard pixels are found by DIFFERENCING against the same cake with no foil on it, so nothing
 * depends on hardcoded screen coordinates that a camera change would silently invalidate.
 *
 *   node scripts/measure-foil-shine.mjs        (needs the dev harness on 5190)
 */
import { chromium } from 'playwright';

const ENVS = process.env.ENVS ? process.env.ENVS.split(',') : [null];
const GLOWS = process.env.GLOWS ? process.env.GLOWS.split(',') : [null];
const CRINKLES = process.env.CRINKLES ? process.env.CRINKLES.split(',') : [null];
const PERMAT = process.env.PERMAT ? `&permat=${process.env.PERMAT}` : '';
/* ⚠️ EMPTY MEANS "WHATEVER SHIPS", not a repeat of today's default. A sweep list that restates the
 * defaults pins the harness to them, so the reading taken straight after editing GOLD_LEAF_DEFAULTS
 * comes back with the OLD numbers and looks like the change did nothing. Happened here, twice. */
const METALS = process.env.METALS ? process.env.METALS.split(',') : [null];
const ROUGHS = process.env.ROUGHS ? process.env.ROUGHS.split(',') : [null];
const TIER = process.env.TIER ?? '#E8A0B8';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 680 } });

const pixels = async (qs) => {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?still=1&bare=1&${qs}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    return { w: d.width, h: d.height, data: Array.from(d.data) };
  });
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const q = (k, v) => (v === null ? '' : `&${k}=${v}`);
const show = v => (v === null ? 'ship' : String(v));

/** Everything the shards did to the frame, found by difference — no screen coordinates. */
function shardStats(base, foil) {
  const vals = []; const cols = [];
  for (let i = 0; i < foil.data.length; i += 4) {
    const dr = foil.data[i] - base.data[i], dg = foil.data[i+1] - base.data[i+1], db = foil.data[i+2] - base.data[i+2];
    if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 30) continue;    // unchanged → not a shard
    vals.push(lum(foil.data[i], foil.data[i+1], foil.data[i+2]));
    cols.push([foil.data[i], foil.data[i+1], foil.data[i+2]]);
  }
  if (vals.length < 50) return null;
  vals.sort((a, b) => a - b);
  const q = (f) => vals[Math.min(vals.length - 1, Math.round(f * (vals.length - 1)))];
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  // p95−p5 over the mean: how much of its own brightness the surface swings across. Robust to the
  // handful of antialiased edge pixels that a plain max−min would report instead of the material.
  // How much COLOUR is left in the shard. A washed-out sheet of sky has none; gold has plenty.
  const chroma = cols.reduce((s, c) => s + (Math.max(...c) - Math.min(...c)), 0) / cols.length;
  return { n: vals.length, mean, lo: q(0.05), hi: q(0.95), contrast: (q(0.95) - q(0.05)) / (mean || 1), chroma };
}

/** The gold BOARD — a metal in the same frame that nobody has complained about. */
const boardStats = async () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const d = t.getContext('2d').getImageData(Math.round(cv.width * 0.26), Math.round(cv.height * 0.80),
                                            Math.round(cv.width * 0.48), Math.round(cv.height * 0.06)).data;
  const v = [];
  for (let i = 0; i < d.length; i += 4) { if (d[i+3] < 250) continue; v.push(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]); }
  v.sort((a, b) => a - b);
  const q = f => v[Math.round(f * (v.length - 1))];
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return { mean, lo: q(0.05), hi: q(0.95), contrast: (q(0.95) - q(0.05)) / mean };
});

/* ⚠️ THE BASE IS THE SAME CAKE WITH ONE FLAKE ON ITS BACK, not a cake with no foil on it. Both
 * renders then run the identical material path — finish maps bound, same env, same everything — so
 * the pixels that differ are the front shards and nothing else. Differencing against a NO-FOIL cake
 * looked equivalent and was not: any change to the wall's own material (baking the grain into the
 * finish normal, or handing the material its own envMap) alters every wall pixel, those pixels enter
 * the mask, and the reading becomes a reading of the cake. That inflated one measurement here from
 * 10.8k pixels to 70.6k and turned a shard contrast of 0.14 into a wall contrast of 0.37. */
const base = await pixels(`tier=${encodeURIComponent(TIER)}&foilonly=1${PERMAT}`);
const board = await boardStats();
console.log(`the gold BOARD, same frame, reads correctly today:`);
console.log(`   mean ${board.mean.toFixed(0)}   ${board.lo.toFixed(0)}–${board.hi.toFixed(0)}   contrast ${board.contrast.toFixed(3)}\n`);
console.log('metal  rough  glow   shards  mean   range        contrast   chroma');
for (const e of ENVS) for (const mt of METALS) for (const rg of ROUGHS) for (const gl of GLOWS) for (const cr of CRINKLES) {
  const foil = await pixels(`tier=${encodeURIComponent(TIER)}&foilring=1${q('foilenv', e)}${q('foilglow', gl)}${q('foilcrinkle', cr)}${q('foilmetal', mt)}${q('foilrough', rg)}${PERMAT}`);
  const st = shardStats(base, foil);
  if (!st) { console.log(`${show(mt).padEnd(6)} ${show(rg).padEnd(6)} ${show(gl).padEnd(6)} no shard pixels found`); continue; }
  console.log(`${show(mt).padEnd(6)} ${show(rg).padEnd(6)} ${show(gl).padEnd(6)} ${String(st.n).padEnd(7)} ${st.mean.toFixed(0).padEnd(6)} ${
    (st.lo.toFixed(0) + '–' + st.hi.toFixed(0)).padEnd(12)} ${st.contrast.toFixed(3)}      ${st.chroma.toFixed(0)}`);
}
console.log('\n(contrast is p95−p5 over mean — the swing that reads as reflection)');
await browser.close();
