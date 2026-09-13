/* Does putting a FINISH on a tier change the colour of the tier?
 *
 * It should not. Gold leaf adds shards; it is not a repaint. But `TierBody` swaps the whole material
 * the moment finish maps are bound — `color` goes to white and a baked map drives the albedo, and
 * `envMapIntensity` goes from 0.5 to the foil's 4.5 across the WHOLE surface, base included. Neither
 * is scoped to the shards. So the wall a baker chose is rendered by a different path than the one
 * `TIER_REFERENCE_LIGHT` was measured on, and nothing checks that the two agree.
 *
 * ⚠️ `?foilonly=1` IS THE MEASUREMENT THAT MATTERS — the foil object with NO flakes. It isolates the
 * material switch from anything stamped, so a drift here cannot be explained away as "you sampled a
 * shard". The `?foil=1` pass then reads the shards themselves, well clear of that patch.
 *
 *   node scripts/measure-finish-wall.mjs        (needs the dev harness on 5190)
 */
import { chromium } from 'playwright';

const COLOURS = process.env.COLOURS
  ? process.env.COLOURS.split(',')
  : ['#808080', '#F6DCE2', '#E8A0B8', '#B892D8', '#C4626B', '#4EC5B0', '#4A2C1B', '#FFFFFF'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 680 } });
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const chroma = (v) => Math.max(...v) - Math.min(...v);

// The flat front face, the patch measure-tier-colour.mjs already uses — clear of the rim's falloff.
const patch = async () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const g = t.getContext('2d');
  const d = g.getImageData(Math.round(cv.width * 0.40), Math.round(cv.height * 0.62),
                           Math.round(cv.width * 0.16), Math.round(cv.height * 0.12)).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 250) continue; r += d[i]; gg += d[i+1]; b += d[i+2]; n++; }
  return n ? [r / n, gg / n, b / n].map(Math.round) : null;
});

const load = async (qs) => {
  await page.goto(`http://localhost:5190/garnish-on-cake.html?still=1&bare=1&${qs}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
};

console.log('THE WALL, with and without a finish on it (no flakes — the material switch alone)\n');
console.log('colour     asked          plain wall     + foil         shift          chroma');
const rows = [];
for (const c of COLOURS) {
  await load(`tier=${encodeURIComponent(c)}`);                   const plain = await patch();
  await load(`tier=${encodeURIComponent(c)}&foilonly=1`);        const foil  = await patch();
  if (!plain || !foil) { console.log(`${c}  no sample`); continue; }
  const a = hex(c);
  const d = foil.map((v, i) => v - plain[i]);
  rows.push({ c, a, plain, foil, d });
  console.log(`${c}  ${String(a.join(',')).padEnd(14)} ${String(plain.join(',')).padEnd(14)} ${
    String(foil.join(',')).padEnd(14)} ${String(d.map(v => (v > 0 ? '+' : '') + v).join(',')).padEnd(14)} ${
    chroma(plain)}→${chroma(foil)}`);
}

const worst = rows.reduce((m, r) => Math.max(m, ...r.d.map(Math.abs)), 0);
const meanShift = rows.reduce((s, r) => s + r.d.reduce((t, v) => t + Math.abs(v), 0) / 3, 0) / (rows.length || 1);
const dchroma = rows.reduce((s, r) => s + (chroma(r.foil) - chroma(r.plain)), 0) / (rows.length || 1);
console.log(`\nmean |shift| ${meanShift.toFixed(1)} per channel, worst channel ${worst}, mean chroma change ${dchroma.toFixed(1)}`);
console.log(worst <= 3
  ? '→ the finish leaves the wall alone.'
  : '→ THE FINISH REPAINTS THE WALL. A baker adding one flake changes the colour of their cake.');
await browser.close();
