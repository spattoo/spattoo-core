/* How dark do the gaps have to be before white paper reads on a white cake?
 *
 * ⚠️ THE REFERENCE IS IN THE SAME CAPTURE, and that is the whole method. The harness draws the
 * reference photograph beside the render, so one screenshot carries both — one exposure, one
 * compression, one display. The first calibration compared the render against a photograph in a
 * SEPARATE file and matched its MEAN, but a photograph's mean is its exposure, which is arbitrary,
 * and the two files were exposed differently. Sandeep: *"both reference and your work are on the
 * same screenshot. why dont you compare."*
 *
 * ⚠️ AND IT IS KEPT AS A SCRIPT THIS TIME. The earlier calibration was done by hand and its numbers
 * were written into a comment in WAFER_DEFAULTS. They then went stale silently: that sweep ran in a
 * harness whose material said `transmission: 0.35` and left sheen, thickness, grain and specular
 * undefined — three.js defaults, not the cake's. So `ao: 0.86` was fitted against a material no
 * cake has ever had. A number that cannot be re-derived is a number nobody can check.
 *
 * Contrast, not brightness: p5–p95 luminance is exposure-independent, and it is what decides
 * whether a white skirt is legible against a white wall.
 *
 *   npm run dev                                    # core, 5190
 *   node scripts/calibrate-wafer-ao.mjs            # the default sweep
 *   AO=0.4,0.6,0.8 CAKE=%23fbf7f2 node scripts/calibrate-wafer-ao.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190/wafer-paper.html';
/* ⚠️ SWEEPS ANY ONE KNOB, because `ao` turned out not to be the one that matters most. The first
   run of this script said the shipping skirt has 32% of the reference's contrast and that even
   ao 1.4 only reaches 59% — so the question stopped being "how dark are the gaps" and became
   "what is washing the whole thing out". Transmission and sheen both add light that no amount of
   occlusion takes back. One knob per run; everything else stays where it ships. */
const KNOB = process.env.KNOB ?? 'ao';
const DEFAULTS = { ao: '0,0.45,0.6,0.86,1.1,1.4',
                   transmission: '0,0.2,0.4,0.6,0.82',
                   sheen: '0,0.3,0.6,0.9',
                   thickness: '0.02,0.1,0.3',
                   specular: '0,0.18,0.5' };
const AOS = (process.env.VALUES ?? DEFAULTS[KNOB] ?? '0,1').split(',').map(Number);
/* White paper on a WHITE tier: the hard case, the studio's default, and the one Sandeep keeps
   reporting. On a coloured tier the paper is legible by hue alone and `ao` barely matters. */
const CAKE = process.env.CAKE ?? '#fbf7f2';
/* Other knobs held somewhere other than where they ship, for a pair sweep: EXTRA='sheen=0.3'.
   ⚠️ Say so in anything this produces — a render made with a parameter off its shipping value is a
   diagnostic, and unlabelled it gets read as the feature. */
const EXTRA = process.env.EXTRA ? `&${process.env.EXTRA}` : '';

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });

/* p5–p95 over a region of the PAGE, so the reference <img> and the WebGL canvas are read the same
   way, off the same pixels, in the same pass. */
const measure = (sel, inset) => page.evaluate(([s, ins]) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const src = el.tagName === 'CANVAS' ? el : null;
  const t = document.createElement('canvas');
  t.width = Math.round(r.width); t.height = Math.round(r.height);
  const ctx = t.getContext('2d');
  if (src) ctx.drawImage(src, 0, 0, t.width, t.height);
  else ctx.drawImage(el, 0, 0, t.width, t.height);
  const x0 = Math.round(t.width * ins), w = Math.round(t.width * (1 - 2 * ins));
  const y0 = Math.round(t.height * ins), h = Math.round(t.height * (1 - 2 * ins));
  const d = ctx.getImageData(x0, y0, w, h).data;
  const tone = [];
  for (let i = 0; i < d.length; i += 4) tone.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  tone.sort((a, c) => a - c);
  const at = (q) => tone[Math.floor(tone.length * q)];
  /* ⚠️ THE WHOLE DISTRIBUTION, NOT JUST ITS WIDTH. Matching p5–p95 alone is how a render ends up
     matching the reference's RANGE by pushing its dark end into the floor, while the reference got
     the same range by pushing its BRIGHT end up — a specular line along each sheet's edge. Same
     number, opposite picture: Sandeep, on a render that scored 87%, *"shadows are so dark. wafer
     looks like a paper with smoke."* So p5 and p95 are reported separately and p50 with them. */
  return { range: at(0.95) - at(0.05), p5: at(0.05), p50: at(0.50), p95: at(0.95),
           mean: tone.reduce((a, c) => a + c, 0) / tone.length };
}, [sel, inset]);

await page.goto(`${B}?preset=white%20waves&cake=${encodeURIComponent(CAKE)}${EXTRA}`,
                { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5500);
/* The reference photograph, measured once: it does not change with `ao`, and reading it every pass
   would only add the noise of re-decoding the same JPEG. The middle 60% avoids its own margins. */
const ref = await measure('img[alt]', 0.20);
if (!ref) { console.error('No reference image in the harness panel — nothing to calibrate against.'); process.exit(1); }

console.log(`\nreference photograph, in frame:  p5 ${ref.p5.toFixed(0)}  p50 ${ref.p50.toFixed(0)}  p95 ${ref.p95.toFixed(0)}`
          + `   (range ${ref.range.toFixed(1)}, mean ${ref.mean.toFixed(1)})`);
console.log(`paper #fbf7f2 on a ${CAKE} tier${EXTRA ? `, held at ${process.env.EXTRA}` : ''}\n`);
console.log(`${KNOB.padStart(6)}      p5     p50     p95    range   of ref`);
console.log('-'.repeat(56));
let best = null;
for (const ao of AOS) {
  await page.goto(`${B}?preset=white%20waves&cake=${encodeURIComponent(CAKE)}&${KNOB}=${ao}${EXTRA}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);          // the HDRI lands after the first paint — discard it
  const m = await measure('canvas', 0.22);
  const pct = (m.range / ref.range) * 100;
  if (!best || Math.abs(pct - 100) < Math.abs(best.pct - 100)) best = { ao, pct };
  console.log(`${ao.toFixed(2).padStart(6)}  ${m.p5.toFixed(0).padStart(6)}  ${m.p50.toFixed(0).padStart(6)}`
            + `  ${m.p95.toFixed(0).padStart(6)}  ${m.range.toFixed(1).padStart(7)}  ${pct.toFixed(0).padStart(5)}%`);
}
await b.close();
console.log(`\nclosest on contrast: ${KNOB} ${best.ao} (${best.pct.toFixed(0)}% of the reference)\n`);
