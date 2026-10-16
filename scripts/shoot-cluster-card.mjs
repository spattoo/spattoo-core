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

  /* ⚠️ FIND THE BALL BY RECOLOURING IT, and the two cheaper ideas that both pointed at scenery.
   *
   *   · hunt for GOLD — the board is gold and is 99% of the gold on screen, so a median pixel (and
   *     a 2nd-percentile one) lands on the drum. Clicking the drum selects nothing, which looks
   *     exactly like an unclickable ball. That "bug" was confirmed twice before a marker painted on
   *     the click point showed it sitting on the cake's shadow.
   *   · diff the frame after recolouring one ball — a faux ball is METALLIC, so repainting it
   *     repaints its reflection across the whole wall, and that region dwarfs the ball. The
   *     centroid landed on the wall and the click selected the tier.
   *
   * What works is keying on the NEW COLOUR itself: flip one ball to magenta and the only magenta
   * pixels on screen are that ball. Then put its colour back and click the centroid. */
  const grab = () => page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    return { w: cv.width, h: cv.height, d: [...t.getContext('2d').getImageData(0, 0, cv.width, cv.height).data] };
  });
  /* The OUTERMOST ball — furthest past the lid's footprint. On Sandeep's cake the clump drapes over
     the top-left edge, so that is the ball a baker reaches for and the one most likely to miss. */
  const victim = await page.evaluate(() => {
    const st = window.__getStickers();
    const far = st.reduce((a, s) => (Math.hypot(s.x, s.z) > Math.hypot(a.x, a.z) ? s : a), st[0]);
    return { id: far.id, color: far.color ?? null };
  });
  await page.evaluate(id => window.__updateSticker(id, { color: '#ff00ff' }), victim.id);
  await page.waitForTimeout(1200);
  const lit = await grab();
  await page.evaluate(([id, c]) => window.__updateSticker(id, { color: c }), [victim.id, victim.color]);
  await page.waitForTimeout(1200);

  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < lit.d.length; i += 4) {
    const [R, G, B] = [lit.d[i], lit.d[i + 1], lit.d[i + 2]];
    if (R > 120 && B > 120 && G < Math.min(R, B) - 50) {
      sx += (i >> 2) % lit.w; sy += Math.floor((i >> 2) / lit.w); n++;
    }
  }
  ok(n > 50, `the ball can be found on screen (${n} px)`);
  if (n > 50) {
    const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
    await page.mouse.click(r.l + (sx / n / lit.w) * r.w, r.t + (sy / n / lit.h) * r.h);
    await page.waitForTimeout(1500);
  }

  const sel = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  ok(sel?.type === 'cluster', `CLICKING the outermost ball reopens its cluster (${sel?.type ?? 'nothing'})`);
  const txt = await page.evaluate(() => document.body.innerText);
  ok(/Cluster/i.test(txt) && /Faux ball/i.test(txt), 'and the card is on screen with its controls');
  await page.screenshot({ path: `${OUT}/cluster-card-${name}.png` });

  /* ⚠️ AND IT RUNS BEFORE THE NEW-CAKE STEP, not after. Starting a new cake re-mounts enough of
   * the designer that the next `page.evaluate` landed mid-navigation and threw "Execution context
   * was destroyed" — on desktop only, which is how a teardown ordering bug reads as a browser
   * flake. The loose-ball case needs a cake with decorations on it; the new-cake case ends with an
   * empty one. Asking them in that order means neither has to clean up after the other. */
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

  /* ── The same ball placed several times, NOT clustered ────────────────────────────────────────
   * Sandeep: *"drag the same faux ball to multiple places. and then try to click on one of them.
   * do you see the popup card?"* Several instances of one element is its own path —
   * `isMultiSlotEl` can route a tap to a shared element card instead of the instance — so it is
   * asked separately from the clump. */
  /* ⚠️ ON THE EMPTY CAKE THE STEP ABOVE JUST MADE, and it has to settle first. Run before the
     reset it counted the 27 cluster balls still on the cake; run immediately after it, the next
     evaluate landed mid-remount and threw "Execution context was destroyed" on desktop only —
     which reads as a browser flake and is really a teardown ordering bug. */
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__loadElements?.());
  await page.waitForTimeout(1500);
  for (const k of [0, 1, 2, 3]) {
    await page.evaluate(() => window.__placeElementById?.('e15'));
    await page.waitForTimeout(1300);
    await page.evaluate((i) => {
      const r = window.__design().tiers[0].radius ?? 1.2;
      const fresh = window.__getStickers().filter(s => !s.__spread);
      const s = fresh[fresh.length - 1];
      window.__updateSticker(s.id, { x: Math.cos(i * 1.4) * r * 0.55, z: Math.sin(i * 1.4) * r * 0.55, __spread: true });
    }, k);
    await page.waitForTimeout(700);
  }
  await btn('^Done$');
  await page.waitForTimeout(1000);
  const loose = await page.evaluate(() => window.__getStickers?.() ?? []);
  ok(loose.length === 4 && !loose.some(s => s.clusterId), `four separate balls on the cake (${loose.length})`);

  const v2 = await page.evaluate(() => { const s = window.__getStickers()[1]; return { id: s.id, color: s.color ?? null }; });
  await page.evaluate(id => window.__updateSticker(id, { color: '#ff00ff' }), v2.id);
  await page.waitForTimeout(1200);
  const lit2 = await grab();
  await page.evaluate(([id, c]) => window.__updateSticker(id, { color: c }), [v2.id, v2.color]);
  await page.waitForTimeout(1200);
  let ax = 0, ay = 0, m = 0;
  for (let i = 0; i < lit2.d.length; i += 4) {
    const [R, G, B] = [lit2.d[i], lit2.d[i + 1], lit2.d[i + 2]];
    if (R > 120 && B > 120 && G < Math.min(R, B) - 50) { ax += (i >> 2) % lit2.w; ay += Math.floor((i >> 2) / lit2.w); m++; }
  }
  ok(m > 50, `one of the four can be found on screen (${m} px)`);
  if (m > 50) {
    const r2 = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
    await page.mouse.click(r2.l + (ax / m / lit2.w) * r2.w, r2.t + (ay / m / lit2.h) * r2.h);
    await page.waitForTimeout(1500);
  }
  const sel2 = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  ok(sel2?.type === 'sticker' && sel2.id === v2.id,
     `clicking one of several loose balls opens ITS card (${sel2?.type ?? 'nothing'})`);
  ok(/Create cluster/i.test(await page.evaluate(() => document.body.innerText)), 'and the card carries its controls');
  await page.screenshot({ path: `${OUT}/loose-balls-${name}.png` });

  await page.close();
}

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
