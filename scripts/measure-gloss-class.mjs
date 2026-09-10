/* Is "every glossy element looks dull" ONE fault or many?
 *
 * Every surface in the designer is lit at `scene.environmentIntensity` (1.25) no matter what its
 * own material asks for, because three.js substitutes the scene's value whenever a material's
 * `envMap` is null — and none of ours sets one. There are ~10 authored `envMapIntensity` values in
 * the codebase and not one of them has ever reached a render. This asks what happens when they do.
 *
 *   A  lebombo, as it ships          the baseline
 *   B  lebombo + the lever           each surface finally gets its OWN authored value
 *   C  studio map, no lever          what was tried in Aug and reverted for killing the faux balls
 *   D  studio map + the lever        the proposal: metals get the map they need AND can compensate
 *
 * ⚠️ THE BALL IS THE CASE THAT MUST NOT BREAK. Curved polished metal is what the studio map cost
 * last time. If D dims it the way C does, the lever does not buy back what the map takes and the
 * systemic route is dead — that is the result this run exists to get, and a negative is a result.
 *
 * ⚠️ CONTRAST, NOT BRIGHTNESS. A mean cannot tell matte paint from mirror gold; the swing between a
 * surface's brightest and darkest pixel is the reflection. Reported as (p95−p5)/mean within a fixed
 * box, verified visually — see the boxes drawn over a render before any of these numbers were read.
 *
 * ── WHAT THIS RUN FOUND, 2026-09-10 ────────────────────────────────────────────────────────────
 *
 * The lever works, and it is NEUTRAL when a material's value already equals the scene's: setting
 * 1.25 by hand reproduces today's pixels exactly, on both the ball and the garnish. That is the
 * check that says the mechanism is sound rather than just different.
 *
 *   curved metal (ball)      studio + lever + intensity 3 → mean 178 (today 184) at contrast 0.542
 *                            (today 0.317). It comes back BRIGHTER-EQUAL with 71% more banding. The
 *                            August "no single map serves both a flat letter and a sphere" was
 *                            measured when nothing could compensate. It can now.
 *   chocolate garnish        at 1.8 → mean 46 / chroma 52, against today's 37 / 42. ⚠️ And its
 *                            AUTHORED value is 0, which would render it nearly black (mean 14,
 *                            chroma 8). It looks acceptable today only because that 0 has never
 *                            applied. Values must be re-CHOSEN, not honoured.
 *   gold leaf shards         0.036 → 0.079 at best, and only by dimming the cake with it, because a
 *                            shard is stamped into the tier's own material and cannot be lit apart
 *                            from it. Not a lighting fix. Structural.
 *   acrylic topper           out of scope — it is a matcap and reads no environment at all.
 *
 * ⚠️ CONTRAST IS MEANINGLESS ON THE DARK PIECES. Dividing a swing by a mean of 19 gives 8.0 and
 * means nothing; the garnish and the drip are read on MEAN and CHROMA. A metric needs a range it is
 * valid over, and this one is not valid below roughly mean 60.
 *
 * ⚠️ AND THE PROBE BOXES ARE THE MEASUREMENT. The first run of this reported a board contrast of
 * 0.000 and a garnish contrast of 3.5 — one box sat on a flat patch, the other straddled a
 * silhouette. Both looked like findings. Draw the boxes over a render and LOOK at them before
 * reading a single number out of this file.
 *
 *   node scripts/measure-gloss-class.mjs        (needs the dev harness on 5190)
 */
import { chromium } from 'playwright';

const PROBES = {
  ball:    [474, 340, 30, 28],   // curved polished metal — the faux balls' geometry class
  board:   [250, 572, 260, 26],  // the gold board: metal that reads correctly today
  garnish: [352, 342, 14, 24],   // set chocolate, clearcoat — where this all started
  drip:    [354, 402, 10, 28],   // chocolate drip, clearcoat
  wall:    [262, 466, 26, 40],   // cream — a DIELECTRIC that must not move
};

/* ⚠️ THE SHARD GETS ITS OWN SCENE, and so does the wall beside it. A tier carrying foil runs its
 * WHOLE material at the foil's envMapIntensity of 4.5 — base included — so the moment the lever
 * connects, a foiled cake is lit nine times harder than a plain one. Measuring the wall in the same
 * frame as the shards reads that, not the wall. The first run of this script did exactly that and
 * reported the cream wall jumping 157 → 222. */
const FOIL_PROBES = {
  shard:   [370, 483, 30, 22],   // FLAT metal on the wall — reported dull
  wall:    [258, 470, 24, 34],   // the same cream, on a tier that carries foil
};

const STUDIO = 'code/env/studio_256.hdr';
const BASE = 'tier=%23E8A0B8&ball=1&drip=1';
const CONDITIONS = [
  ['A ships      ', ''],
  ['B +lever     ', '&lever=1'],
  ['C studio     ', `&env=${STUDIO}`],
  ['D studio+lev ', `&env=${STUDIO}&lever=1`],
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 680 } });

function sample(PR) {
  const cv = document.querySelector('canvas');
  const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
  t.getContext('2d').drawImage(cv, 0, 0);
  const g = t.getContext('2d');
  const out = {};
  for (const [k, [x, y, w, h]] of Object.entries(PR)) {
    const d = g.getImageData(x, y, w, h).data;
    const L = [], C = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250) continue;
      L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      C.push(Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
    }
    L.sort((a, b) => a - b);
    const q = f => L[Math.round(f * (L.length - 1))];
    const mean = L.reduce((s, v) => s + v, 0) / L.length;
    out[k] = { mean, contrast: (q(0.95) - q(0.05)) / (mean || 1),
               chroma: C.reduce((s, v) => s + v, 0) / C.length };
  }
  return out;
}

const table = async (probes, base, title) => {
  const rows = [];
  for (const [label, extra] of CONDITIONS) {
    await page.goto(`http://localhost:5190/garnish-on-cake.html?still=1&${base}${extra}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    rows.push([label, await page.evaluate(sample, probes)]);
  }
  const keys = Object.keys(probes);
  console.log(`\n══ ${title} ══`);
  for (const metric of ['contrast', 'mean', 'chroma']) {
    console.log(`\n${{ contrast: 'CONTRAST — the swing that reads as reflection',
                        mean: 'MEAN luminance', chroma: 'CHROMA — how much colour survives' }[metric]}`);
    console.log('condition      ' + keys.map(k => k.padEnd(10)).join(''));
    for (const [label, r] of rows) {
      console.log(label + ' ' + keys.map(k =>
        (metric === 'contrast' ? r[k][metric].toFixed(3) : r[k][metric].toFixed(0)).padEnd(10)).join(''));
    }
  }
  console.log('\ncontrast vs A');
  console.log('condition      ' + keys.map(k => k.padEnd(10)).join(''));
  for (const [label, r] of rows.slice(1)) {
    console.log(label + ' ' + keys.map(k => {
      const a = rows[0][1][k].contrast;
      return (a < 0.01 ? 'n/a' : `${r[k].contrast > a ? '+' : ''}${((r[k].contrast - a) / a * 100).toFixed(0)}%`).padEnd(10);
    }).join(''));
  }
};

await table(PROBES, BASE, 'A CAKE WITH NO FOIL ON IT');
await table(FOIL_PROBES, `${BASE}&foilring=1`, 'THE SAME CAKE CARRYING GOLD LEAF');

await browser.close();
