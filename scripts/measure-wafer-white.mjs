/* Does the paper READ as white? Sandeep, on a render whose shape he accepted: *"structurally this
 * looks much better, apart from it does not look like white."*
 *
 * Measured off his screenshot, the skirt's band was mean [185,164,156], chroma 28.4 — as coloured
 * as the pink tier beside it (25.0), and warm rather than pink. The paper's own colour is #fbf7f2,
 * chroma 9. So something is putting colour INTO white paper, and brightness is a separate question
 * from hue: a multiply-darken (which is all `ao` can do) keeps chroma in proportion and cannot
 * explain 9 → 28.
 *
 * ⚠️ SO THIS SWEEPS ONE CAUSE AT A TIME rather than tuning. Four candidates, each isolated:
 *   ao            vertex-colour darkening       — brightness only, hue-neutral by construction
 *   transmission  what the sheet lets through   — the pink TIER is directly behind it
 *   cake          the wall it stands on         — white tier removes that source entirely
 *   env           the HDRI's own colour         — a warm studio map tints every reflection
 *
 * Reported per run: the band's mean, and the LIT 10% — the faces turned to the key light, which is
 * what the eye calls "the colour of the paper". A dark gap is supposed to be dark; it is the lit
 * face that has to read white.
 *
 *   npm run dev            # core, 5190
 *   node scripts/measure-wafer-white.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190/wafer-paper.html';
const PAPER = '#fbf7f2';          // what the sheet is TOLD to be
const PINK  = '#f5b8c8';          // the designer fixture's tier, read off `__design()`, not guessed
const WHITE = '#fbf7f2';

/* Each run says what it is isolating, so a reader does not have to diff the query strings. */
const RUNS = [
  { name: 'as it ships',      q: { cake: PINK } },
  { name: 'no shading',       q: { cake: PINK, ao: 0 } },
  { name: 'no transmission',  q: { cake: PINK, transmission: 0 } },
  { name: 'white tier',       q: { cake: WHITE } },
  { name: 'white tier, no tr', q: { cake: WHITE, transmission: 0 } },
  { name: 'half transmission', q: { cake: PINK, transmission: 0.3 } },
];

const chroma = (c) => Math.max(...c) - Math.min(...c);
const fmt = (c) => `[${c.map(v => String(Math.round(v)).padStart(3)).join(',')}]`;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 1 });

/* The skirt band, found off the canvas rather than assumed: the harness re-frames with the preset,
   and a hard-coded rectangle is how a probe ends up measuring the backdrop (it has happened here). */
const band = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(cv.width * 0.40), w = Math.round(cv.width * 0.20);
  const d = t.getContext('2d').getImageData(x0, 0, w, cv.height).data;
  const px = (x, y) => { const i = ((y * w) + x) << 2; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = (x, y) => { const c = px(x, y); return (c[0] + c[1] + c[2]) / 3; };
  const bg = lum(0, 2);
  let top = -1, bot = -1;
  const isCake = y => { for (let x = 0; x < w; x += 2) if (Math.abs(lum(x, y) - bg) > 12) return true; return false; };
  for (let y = 0; y < cv.height; y++) if (isCake(y)) { top = y; break; }
  for (let y = cv.height - 1; y >= 0; y--) if (isCake(y)) { bot = y; break; }
  if (top < 0 || bot - top < 60) return null;
  const all = [];
  for (let y = Math.round(top + (bot - top) * 0.45); y < Math.round(top + (bot - top) * 0.80); y++)
    for (let x = 0; x < w; x++) all.push(px(x, y));
  const avg = (rows) => [0, 1, 2].map(i => rows.reduce((s, p) => s + p[i], 0) / rows.length);
  const sorted = [...all].sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]));
  return { mean: avg(all), lit: avg(sorted.slice(Math.floor(all.length * 0.9))) };
});

console.log(`\npaper is told to be ${PAPER} — chroma ${chroma([251, 247, 242])}`);
console.log('\n                      band mean          lit 10%');
console.log('-'.repeat(64));
for (const r of RUNS) {
  /* ⚠️ THE SKIRT THE SCREENSHOT SHOWS, read off `__design()` — a flat 34-sheet "White, waved",
     not the on-edge preset. The first run of this script swept the on-edge numbers against a
     screenshot of the flat ones and reported "the paper reads white", which was true of a skirt
     nobody was looking at. Dense fins hide the wall; 34 flat sheets lie ON it. */
  const q = new URLSearchParams({ preset: 'white waves', colour: PAPER,
                                  count: '34', width: '2.3', height: '0.95', rise: '0.04',
                                  taper: '0.18', ripple: '0.3', ripples: '6', curl: '0.22',
                                  splay: '0.08', lean: '0.05', jitter: '0.45', ...r.q }).toString();
  await page.goto(`${B}?${q}`, { waitUntil: 'domcontentloaded' });
  /* ⚠️ DISCARD THE FIRST FRAME. The HDRI arrives after the first paint, and a capture taken before
     it is a different picture of the same geometry — every reflective reading would be wrong. */
  await page.waitForTimeout(5500);
  const m = await band();
  if (!m) { console.log(`${r.name.padEnd(20)} (no cake found)`); continue; }
  console.log(`${r.name.padEnd(20)} ${fmt(m.mean)} c${String(Math.round(chroma(m.mean))).padStart(3)}`
            + `   ${fmt(m.lit)} c${String(Math.round(chroma(m.lit))).padStart(3)}`);
}
await b.close();
console.log(`
⚠️ READ THE LIT COLUMN FOR HUE AND THE MEAN FOR BRIGHTNESS. A gap is meant to be dark, so the mean
   folds shading and colour together; the faces turned to the key are what the eye calls the paper's
   colour. Chroma near the paper's own 9 is white; near the tier's is the tier showing through.
`);
