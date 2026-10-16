/* Is the scene lit like a photograph, or like a softbox?
 *
 * Sandeep: *"overall looks over exposed. dont know why are we not able to get the reference image
 * kind of environmental look."* He is right, and it is arithmetic rather than taste. The shipped rig
 * is ambient 0.45, key 1.1, fill 0.4 — key-to-fill of about 1.3 : 1, where daylight runs 3:1 to 5:1.
 * Nothing on the cake has a dark side, so nothing has falloff.
 *
 * ⚠️ THIS SCRIPT EXISTS BECAUSE THE CHANGE MUST BE MADE ONCE. Every reference light in this repo —
 * CARD_REFERENCE_LIGHT, cream's, the wall's, the drip's, the foil's — was measured under those exact
 * numbers, each with its own harness and a recorded sweep. Moving ambient or the key invalidates all
 * of them simultaneously, and `dev/card-colour.jsx` records in the same breath that this repo has
 * already shipped AND REVERTED one scene-wide lighting change in a day. So a candidate rig is not
 * "looks better" — it is a row in this table, measured on every surface in one pass.
 *
 * ⚠️ AND IT MEASURES THE RENDER ONLY. Comparing a render against a photograph in a SEPARATE file
 * matches that file's EXPOSURE, which is arbitrary — that mistake cost a whole calibration earlier
 * today (a "mean landed exactly on the photograph" that was a coincidence of two unrelated
 * captures). Contrast is the exposure-independent measure; put the reference in the page and read
 * both halves of one screenshot when you want an absolute target.
 *
 *   npm run dev                                   (harness on 5190)
 *   node scripts/measure-scene-light.mjs
 *   RIGS="0.45,1.1,0.4 0.25,1.6,0.25" node scripts/measure-scene-light.mjs
 */
import { chromium } from 'playwright';

const SUBJECTS = (process.env.SUBJECTS || 'white,colour,full').split(',');
/* Candidate rigs as `ambient,key,fill`. The first is production, so every table has its baseline. */
const RIGS = (process.env.RIGS ||
  '0.45,1.1,0.4  0.35,1.3,0.3  0.25,1.6,0.25  0.18,1.9,0.18').trim().split(/\s+/);
/* ⚠️ SWEEP THE ENVIRONMENT, NOT JUST THE LAMPS — measured, and it reversed the obvious guess. The
   first run varied ambient/key/fill from 1.29:1 to 5.28:1 and the white cake's contrast moved from
   73.8 to 71.3, its mean from 222.3 to 222.4. The lamps are not what lights this scene: the HDRI at
   environmentIntensity 1.25 is, and an environment is omnidirectional by construction — which is
   exactly why nothing has a dark side however the key is pushed. */
const ENVS = (process.env.ENVS || process.env.ENV || '1.25').split(',');
const TM  = process.env.TM  || '';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });

async function read(subject, amb, key, fill, env) {
  const url = `http://localhost:5190/scene-light.html?still=1&subject=${subject}`
    + `&amb=${amb}&key=${key}&fill=${fill}&env=${env}${TM ? `&tm=${TM}` : ''}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  /* ⚠️ The HDRI arrives late and the first frames are a different picture of the same cake. */
  await page.waitForTimeout(6000);
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    const w = c.width, h = c.height;
    const px = new Uint8Array(4 * w * h);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    /* The CAKE, not the backdrop: the ground is a flat field and would drag every number toward
       its own single value, which is how a flat rig could score as "high contrast". */
    const vals = [];
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a < 250) continue;
      const L = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      vals.push(L);
    }
    vals.sort((p, q) => p - q);
    if (!vals.length) return null;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    /* ⚠️ CONTRAST IS NOT WETNESS, and reading one for the other reverses the answer. A glaze looks
       wet because a SMALL, VERY BRIGHT highlight sits over a DARKER body — so the number is the gap
       between the specular peak and the median, not the spread of the whole cake. Measured on the
       glaze, global contrast RISES as the environment falls (137 → 174), which would read as "the
       glaze got better" when what is being asked is whether its shine survived. */
    const pick = (q) => vals[Math.min(vals.length - 1, (q * vals.length) | 0)];
    return { mean, sd, p5: pick(0.05), p95: pick(0.95), p50: pick(0.5), p99: pick(0.99), n: vals.length };
  });
}

console.log(`${TM ? `tone ${TM}\n` : ''}`);
console.log('env    rig (amb,key,fill)   key:fill   subject   mean     sd    p5-p95    p50    p99   shine');
console.log('-'.repeat(98));
for (const env of ENVS) {
for (const rig of RIGS) {
  const [amb, key, fill] = rig.split(',').map(Number);
  const ratio = (key / (amb + fill)).toFixed(2);
  for (const subject of SUBJECTS) {
    const r = await read(subject, amb, key, fill, env);
    if (!r) { console.log(`${String(env).padEnd(6)} ${rig.padEnd(20)} ${ratio.padStart(8)}   ${subject.padEnd(8)} no cake pixels`); continue; }
    console.log(`${String(env).padEnd(6)} ${rig.padEnd(20)} ${ratio.padStart(8)}   ${subject.padEnd(8)} ${r.mean.toFixed(1).padStart(6)} ${r.sd.toFixed(1).padStart(6)} ${(r.p95 - r.p5).toFixed(1).padStart(9)} ${r.p50.toFixed(1).padStart(6)} ${r.p99.toFixed(1).padStart(6)} ${(r.p99 - r.p50).toFixed(1).padStart(7)}`);
  }
}
}
console.log('\nA photograph of a white cake sits near mean 169 with p5-p95 about 103.');
console.log('Contrast is the number to trust; mean follows exposure.\n');
await browser.close();
