/* Piping ONTO piping, on the cake — the overlap a mane is made of.
 *
 *   Sandeep, with a unicorn cake: "the piping includes multiple nozzles and a lot of overlap.
 *   currently we dont have a mechanism to overlap like or create a pattern with multiple nozzle
 *   pipings." Then, on where that belongs: "would it be better to keep this studio logic in
 *   handpiping option on the element card itself? let the user directly apply on cake."
 *
 * Before this, `CreamPen` kept only raycast hits tagged `isPenCatcher` — the invisible tier meshes —
 * so a piece already standing on the cake was invisible to the ray and every stamp seated on the
 * CAKE however much cream was in the way. Cream piped on cream buried itself in the piece it was
 * aimed at.
 *
 * ⚠️ REAL POINTER EVENTS, THROUGH THE REAL CARD. The seat RULE is unit-tested with no scene at all
 * (geometry/penSeat.test.js, 8 claims). What those cannot see is the WIRING: whether the pen tags
 * placed stamps, maps its hits correctly, and feeds them to the rule in a live scene. So this drives
 * the path a baker drives — Decorations, the piping card, "I'll pipe it myself", then presses on the
 * cake — rather than a hook. A `__pipeAt` hook that committed strokes was written for this and
 * DELETED: it re-decided the seat in design space, so it would have proved my hook agreed with my
 * hook while never touching the code under test.
 *
 * The claim is one number. Two taps at the SAME screen point: on the old code both stamps seat on
 * the cake and their y is identical; stacking means the second sits ABOVE the first. Nothing about
 * that can pass by accident.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-pen-stacking.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads/pen-stacking.png`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`page error: ${e.message}`); });

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click();
});
await page.waitForTimeout(600);

/* ── into stamp mode, the way a baker gets there ───────────────────────────────────────────────── */
console.log('\nloading the catalogue and opening the Shell border');
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(1000);

/* ⚠️ `__openPiping`, NOT `__tapElementById`. A cream_piping row is filtered out of the decorations
   grid and reached only through the ring-picker tile; tapPlaceElement opened the BOTTOM TIER card
   instead, and three assertions failed for reasons that had nothing to do with the pen.
   e16 is the only cream_piping fixture with a real GLB and `hand_piping` ticked. */
await page.evaluate(() => window.__openPiping?.('e16'));
await page.waitForTimeout(1200);

const opened = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => /pipe it myself/i.test(x.textContent ?? ''));
  if (!btn) return false;
  btn.click();
  return true;
});
ok(opened, 'the piping card offers "I\'ll pipe it myself" and it was pressed');
await page.waitForTimeout(1500);

const style = await page.evaluate(() => window.__getPenStyle?.() ?? null);
ok(!!style?.stampId && !!style?.stampUrl, `the pen is loaded with a piece — ${style?.stampName ?? 'none'}`);

/* ── two taps at the same point on the cake top ────────────────────────────────────────────────── */
/* A tap is a short press: `isTap` is path length < thickness x 1.2, so down-and-up without moving.
   The point is searched rather than assumed — the cake's position on screen depends on the camera,
   and a press on empty space commits nothing. The first offset that lands a stroke is used for
   BOTH taps, so the two are genuinely at the same place. */
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
/* ── two surfaces, each named ──────────────────────────────────────────────────────────────────
   ⚠️ THE SURFACE IS PINNED, NOT INHERITED. The first version pressed wherever the search first
   landed and called the result "stacking". It landed on the WALL every time, so the top case was
   never covered and nobody could tell from the output which surface had been proved. */
const press = async (x, y) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(1400);
  return page.evaluate(() => window.__getStrokes?.() ?? []);
};

const clearAll = async () => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(x => /clear all/i.test((x.textContent ?? '').trim()));
    btn?.click();
  });
  await page.waitForTimeout(600);
};

/* ⚠️ MEASURED ALONG THE SEAT NORMAL, NOT UP THE Y AXIS — and the y version passed while testing the
   wrong thing. A press on the WALL has a radial normal, so a piece stacked on another moves OUTWARD;
   its y barely changes. The old check read 0.0686 of y and nearly failed a working stack, while the
   real displacement along the normal was 0.188. On the top the normal is up and the two agree, which
   is exactly why a y-only check looked fine for so long. Project onto the normal and one assertion
   covers every surface. */
const along = (a, b, n) => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / len;
};

/* The two surfaces, by where they are on screen: the wall is below the rim, the top well above it.
   Each is checked for the normal it ought to have, so a press that misses its surface FAILS rather
   than quietly proving the other one. */
const cases = [
  { name: 'the wall',        x: 0.50, y: 0.62, want: n => Math.abs(n[1]) < 0.35 },
  { name: 'the top surface', x: 0.50, y: 0.44, want: n => n[1] > 0.85 },
];

for (const c of cases) {
  await clearAll();
  const px = box.x + box.width * c.x;
  const py = box.y + box.height * c.y;

  const one = await press(px, py);
  ok(one.length === 1, `${c.name}: a press lands one piece — ${one.length} stroke(s)`);
  if (one.length !== 1) continue;

  const below = one[0];
  ok(c.want(below.normal ?? [0, 1, 0]),
     `${c.name}: and it seated there — normal ${JSON.stringify((below.normal ?? []).map(v => +v.toFixed(2)))}`);

  const two = await press(px, py);
  ok(two.length === 2, `${c.name}: a second press at the same point lands another — ${two.length}`);
  if (two.length !== 2) continue;

  const above = two[1];
  const step = along(below.point, above.point, below.normal ?? [0, 1, 0]);
  /* Seated on the cake both pieces share a point exactly, so the failure signature is step == 0.
     A fifth of a piece is far above any floating-point wobble and far below a real stack. */
  const floor = Math.max(1e-3, (below.thickness ?? 0.03) * 0.2);
  ok(step > floor,
     `${c.name}: the second sits ON the first — ${step.toFixed(4)} along the normal (floor ${floor.toFixed(4)})`);

  const sideways = Math.hypot(
    above.point[0] - below.point[0] - step * (below.normal?.[0] ?? 0),
    above.point[1] - below.point[1] - step * (below.normal?.[1] ?? 0),
    above.point[2] - below.point[2] - step * (below.normal?.[2] ?? 0),
  );
  ok(sideways < (below.thickness ?? 0.03) * 2,
     `${c.name}: and on it rather than beside it — ${sideways.toFixed(4)} across`);

  const CLOSE = `${process.env.HOME}/Downloads/pen-stacking-${c.name.split(' ').pop()}.png`;
  await page.screenshot({ path: CLOSE,
    clip: { x: Math.max(0, px - 170), y: Math.max(0, py - 170), width: 340, height: 340 } });
  console.log(`  close → ${CLOSE}`);
}

await page.screenshot({ path: OUT });
console.log(`\nshot → ${OUT}`);

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed:\n  - ${fails.join('\n  - ')}` : '\n✓ all claims hold');
process.exit(fails.length ? 1 : 0);
