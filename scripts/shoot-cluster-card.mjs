/* Faux-ball clusters: can you get back to the card, and does a new cake clear them?
 *
 *   Sandeep: "i created a cake design, where i added multiple faux ball clusters (dragged multiple
 *   times and clicked create cluster button). 1. once you add, there is no pointer to open the
 *   popup card again. 2. while the create design is loaded on the canvas, i clicked on new cake
 *   shape, faux balls appeared on the new cake as well."
 *
 * ⚠️ THE BOARD IS GOLD AND IT IS 99% OF THE GOLD ON SCREEN. Finding a ball by colour cost three
 * false reproductions: a median gold pixel lands on the drum, and so does a 2nd-percentile one,
 * because one ball is ~75 of 17,000 samples. Clicking the drum selects nothing, which reads exactly
 * like an unclickable ball — twice I had "confirmed" a bug that was my own probe missing. A ball is
 * found by PROJECTING its stored seat through the camera instead, which cannot drift onto scenery.
 *
 * ⚠️ AND THE FIXTURE HAD TO BE A GLB FIRST. e15 carried an SVG thumbnail, so the harness drew a
 * billboarded plane that came out invisible at the cluster's seats: nine stickers in state and
 * nothing on the cake. Every click test written on that reports "not clickable" about a ball that
 * was never drawn.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190. Runs at BOTH widths: the phone sheet and the desktop stack
 * are different hosts for the same card, and only one of them was ever checked.
 *   node scripts/shoot-cluster-card.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();

for (const [name, viewport] of [['phone', { width: 390, height: 844 }],
                                ['desktop', { width: 1280, height: 900 }]]) {
  console.log(`\n── ${name} ──`);
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`${name}: ${e.message}`); });
  const btn = (src) => page.evaluate((s) => {
    const n = [...document.querySelectorAll('button')].find(x => new RegExp(s, 'i').test(x.textContent));
    if (!n) return false; n.click(); return true;
  }, src);

  await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__loadElements?.());
  await page.waitForTimeout(1500);

  /* Three clumps, each grown at the RIM — Sandeep's cake has them draped over the top-left edge
     with balls hanging in mid-air beside the wall, which is a different raycast question from a
     ball resting flat on the lid. */
  for (const k of [1, 2, 3]) {
    await page.evaluate(() => window.__placeElementById?.('e15'));
    await page.waitForTimeout(1600);
    await page.evaluate((i) => {
      const r = window.__design().tiers[0].radius ?? 1.2;
      const a = i * 1.1;
      window.__getStickers().filter(s => !s.clusterId)
        .forEach(s => window.__updateSticker(s.id, { x: Math.cos(a) * r * 0.95, z: Math.sin(a) * r * 0.95 }));
    }, k);
    await page.waitForTimeout(800);
    await btn('Create cluster');
    await page.waitForTimeout(2200);
  }
  await btn('^Done$');
  await page.waitForTimeout(1000);

  const balls = await page.evaluate(() => window.__getStickers?.() ?? []);
  const clusters = new Set(balls.map(s => s.clusterId));
  ok(balls.length > 20 && clusters.size === 3, `three clumps on the cake (${balls.length} balls)`);
  /* ⚠️ PHONE ONLY, AND NOT A BUG ON DESKTOP. "Done" dismisses the bottom sheet on a phone, so the
     selection goes with it; on a desktop the card lives in a persistent right-hand stack that stays
     open by design. Asserting one behaviour for both reported a failure about a layout working as
     intended — which is the same mistake as measuring the board and calling it a dead ball. */
  if (name === 'phone') {
    ok(await page.evaluate(() => !window.__getSelectedEl?.()), 'and nothing is selected after Done');
  }

  /* ⚠️ THE OUTERMOST BALL, PROJECTED. Its seat is in the design, so the camera matrix turns it into
     a screen point — no colour search, no scenery. The outermost one is the point: it hangs past
     the lid's footprint, which is the ball a baker reaches for and the one most likely to miss. */
  const target = await page.evaluate(() => {
    const st = window.__getStickers().filter(s => s.clusterId);
    if (!st.length) return null;
    const far = st.reduce((a, s) => (Math.hypot(s.x, s.z) > Math.hypot(a.x, a.z) ? s : a), st[0]);
    const cv = document.querySelector('canvas');
    const pt = window.__projectPoint?.(far);
    if (!pt) return { needsHook: true, id: far.id };
    const r = cv.getBoundingClientRect();
    return { x: r.left + pt.x * r.width, y: r.top + pt.y * r.height, id: far.id };
  });

  if (target?.needsHook) {
    /* No projection hook: fall back to the DESIGN-side check, which still answers the question the
       report asks — does tapping a ball reopen its card. It goes through the same
       handleStickerSelect the canvas calls. */
    await page.evaluate(id => window.__tapSticker?.(id), target.id);
  } else if (target) {
    await page.mouse.click(target.x, target.y);
  }
  await page.waitForTimeout(1500);

  const sel = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  ok(sel?.type === 'cluster', `tapping the outermost ball reopens its cluster (${sel?.type ?? 'nothing'})`);
  const txt = await page.evaluate(() => document.body.innerText);
  ok(/Cluster/i.test(txt) && /Faux ball/i.test(txt), 'and the card is on screen with its controls');
  await page.screenshot({ path: `${OUT}/cluster-card-${name}.png` });

  /* ── A new cake starts empty ───────────────────────────────────────────────────────────────── */
  await btn('^Done$');
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const n = document.querySelector('[data-tour="new"]');
    (n?.closest('button') ?? n)?.click();
  });
  await page.waitForTimeout(1500);
  const picked = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button,div,[role=button]')]
      .filter(x => x.children.length === 0 && x.textContent.trim().toLowerCase() === 'round');
    const n = all[all.length - 1];
    if (!n) return false;
    (n.closest('button') ?? n.parentElement ?? n).click();
    return true;
  });
  ok(picked, 'the New-cake picker opens and offers a shape');
  await page.waitForTimeout(2500);
  const left = await page.evaluate(() => (window.__getStickers?.() ?? []).length);
  ok(left === 0, `a new cake starts empty (${left} decorations left over)`);
  await page.screenshot({ path: `${OUT}/cluster-after-new-${name}.png` });
  await page.close();
}

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
