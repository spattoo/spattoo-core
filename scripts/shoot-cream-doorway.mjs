/* The Cream layer row: does it appear where a baker looks, and vanish where it cannot work?
 *
 * ⚠️ NONE OF THIS IS PROVABLE FROM SOURCE. A grep shows the JSX exists; it cannot show that the row
 * renders under the Style sliders, that `isRoundWall` actually hides it on a square tier, or that
 * pressing it twice does not quietly add a second band. The suite never mounts CakeDesigner at all.
 *
 * Four claims:
 *   1. Round tier → the row is in the Frosting section, BELOW the Style chips and sliders.
 *   2. Rect tier  → the row is ABSENT (SecondCreamLayers renders on round walls only). This is the
 *      case that cannot be checked any other way, and `?shape=` is the only thing that reaches it.
 *   3. First press seeds ONE band and opens the cream card.
 *   4. Second press reopens the card and still has ONE band — the tap/drag paths seed every time,
 *      and a panel row that did the same would add a fourth band to a tier that has three.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-cream-doorway.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads/cream-layer-doorway.png`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
const shots = [];

async function openDesigner(shape) {
  // A phone viewport: a baker's screen is a phone, and the designer switches layout at <=640.
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  /* ⚠️ `cream=1` IS NOT OPTIONAL. Without it `fetchElements` returns [] , `creamElement` is null and
     the row is correctly hidden — so BOTH the round and the square case "pass" for the same wrong
     reason. The first run of this script did exactly that and the rect result proved nothing. */
  await page.goto(`${B}/designer-mobile.html?cream=1&style=smooth&shape=${shape}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);   // the scene mounts and the env map lands a frame or two later
  return page;
}

/* Reach the Frosting section, on whichever layout is up.
 *
 * ⚠️ THE TAB IS STILL A TAB; ITS LABEL GREW A VALUE. On a phone the panel is a tablist and only the
 * active section is mounted, so Frosting has to be chosen before anything in it exists. This matched
 * `textContent.trim() === 'Frosting'` — and a tab now reads `FrostingButtercream`, label plus its
 * current setting, so the match silently failed, the click never happened, and five assertions about
 * a feature that works came back FAIL. Worse than no script, because the next person reads a broken
 * feature. Found 2026-10-06 while checking an unrelated change and confirmed stale by running it
 * against an unmodified file: identical failures.
 *
 * ⚠️ AND MY FIRST REPAIR WAS WRONG IN THE OTHER DIRECTION — I read the desktop card, concluded the
 * tablist was gone and deleted the click. It is gone on DESKTOP only, where the same panel renders
 * every section in one scrolling card. Both layouts are real; this handles both rather than picking
 * the one that happened to be open. */
async function openFrosting(page) {
  return page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')]
      .find(t => t.textContent.trim().startsWith('Frosting'));
    if (tab) { tab.click(); return true; }
    // Desktop: no tabs, every section is mounted — confirm the heading is there.
    return [...document.querySelectorAll('label, div, span')]
      .some(e => e.children.length === 0 && e.textContent.trim().toUpperCase() === 'FROSTING');
  });
}

/* Open tier 0's panel through the harness's own hook rather than hunting for the cake in 3D.
 *
 * ⚠️ NO `__loadElements()` HERE, DELIBERATELY. The first version of this script could only be made
 * to pass by calling it, and that is exactly what exposed the bug: the catalogue is lazy, so the
 * Cream layer row was absent on a fresh cake and appeared only after the baker had opened
 * Decorations. handleTierClick now loads it, so selecting a tier is genuinely enough — and if this
 * script ever needs the manual load put back, that is the regression, not a test problem. */
async function selectTier(page) {
  const okSel = await page.evaluate(() => window.__selectTier?.(0) ?? false);
  await page.waitForTimeout(1600);   // the catalogue fetch resolves and the row mounts
  return okSel;
}

/* ⚠️ NOT `button.spattoo-navrow` ANY MORE, AND THAT WAS A DELIBERATE CHANGE. Sandeep: "'cream layer'
   option looks like a note. not like an actionable thing." NavRow is a settings-list row — white on a
   white sheet — so the row became the card's own `neutralBtn`. The class went with it and this
   selector matched nothing, which reads exactly like a missing feature. Matched by what it SAYS
   instead: the label is the thing the baker is looking for, and it survives a restyle. */
const rowSel = 'button:has-text("Cream layer")';

/* ── 1 — round tier ────────────────────────────────────────────────────────────────────────── */
console.log('\ndesigner ?shape=round — the row is there, under Style');
let roundPage;
{
  const page = await openDesigner('round');
  roundPage = page;
  ok(await selectTier(page), 'tier 0 selected (harness hook)');
  ok(await openFrosting(page), 'the Frosting section is reachable and open');
  await page.waitForTimeout(800);

  const row = await page.$(rowSel);
  ok(!!row, 'a NavRow is rendered in the tier panel');
  const label = row ? (await row.innerText()).replace(/\s+/g, ' ').trim() : '';
  ok(/Cream layer/i.test(label), `it is the Cream layer row — got "${label}"`);

  /* ⚠️ ORDER MATTERS, not just presence. The whole point is that it sits with the cream decisions,
     so assert it is BELOW the Style controls rather than floating anywhere in the panel. */
  /* ⚠️ FIND BOTH BY WHAT THEY SAY. This read `button.spattoo-navrow` (gone — see `rowSel`) and a
     `<label>` reading STYLE (the heading is not a label element here). Two stale selectors, and
     because a missing node returns null the pair failed as "not on screen together" — which reads as
     a layout regression rather than a selector that no longer matches anything. */
  const order = await page.evaluate(() => {
    const row = [...document.querySelectorAll('button')]
      .find(e => e.textContent.trim().startsWith('Cream layer'));
    const styleLabel = [...document.querySelectorAll('label, div, span')]
      .find(e => e.children.length === 0 && e.textContent.trim().toUpperCase() === 'STYLE');
    if (!row || !styleLabel) return null;
    return { rowTop: Math.round(row.getBoundingClientRect().top), styleTop: Math.round(styleLabel.getBoundingClientRect().top) };
  });
  ok(order !== null, 'both the Style label and the row are on screen together');
  ok(order && order.rowTop > order.styleTop, `the row sits BELOW Style — style ${order?.styleTop}px, row ${order?.rowTop}px`);

  shots.push({ label: 'round tier — row under Style', png: (await page.screenshot()).toString('base64') });
}

/* ── 2 — rect tier: the case only this harness can reach ───────────────────────────────────── */
console.log('\ndesigner ?shape=rect — the row is absent');
{
  const page = await openDesigner('rect');
  ok(await selectTier(page), 'tier 0 selected (harness hook)');
  ok(await openFrosting(page), 'the Frosting section is open (so absence means absence)');
  await page.waitForTimeout(800);
  const text = await page.evaluate(() => document.body.innerText);
  ok(!(await page.$(rowSel)), 'no NavRow on a square tier');
  ok(!/Cream layer/i.test(text), 'and no "Cream layer" text anywhere in the panel');
  shots.push({ label: 'rect tier — absent', png: (await page.screenshot()).toString('base64') });
  await page.close();
}

/* ── 3 + 4 — pressing it, twice ────────────────────────────────────────────────────────────── */
console.log('\npressing the row — seeds once, then only reopens');
{
  const page = roundPage;
  await page.click(rowSel);
  await page.waitForTimeout(1200);

  const afterFirst = await page.evaluate(() => ({ sel: window.__getSelectedEl?.() ?? null }));
  ok(afterFirst.sel?.type === 'cream', `the cream card is open — selection is ${JSON.stringify(afterFirst.sel?.type)}`);

  const text1 = await page.evaluate(() => document.body.innerText);
  ok(/Band 1/.test(text1), 'one band exists after the first press');
  ok(!/Band 2/.test(text1), 'and only one');
  shots.push({ label: 'after 1st press — card + Band 1', png: (await page.screenshot()).toString('base64') });

  // Back to the tier panel, then press again.
  const reselected = await page.evaluate(() => window.__selectTier?.(0) ?? false);
  await page.waitForTimeout(900);
  ok(reselected, 'back on the tier panel');
  await openFrosting(page);
  await page.waitForTimeout(800);
  const rowAgain = await page.$(rowSel);
  ok(!!rowAgain, 'the row is still there with a band on the tier');
  const badge = rowAgain ? (await rowAgain.innerText()).replace(/\s+/g, ' ').trim() : '';
  ok(/1/.test(badge), `it now shows the band count — "${badge}"`);

  await page.click(rowSel);
  await page.waitForTimeout(1200);
  const text2 = await page.evaluate(() => document.body.innerText);
  ok(/Band 1/.test(text2), 'the card reopened');
  ok(!/Band 2/.test(text2), '⚠️ and did NOT seed a second band');
  shots.push({ label: 'after 2nd press — still one band', png: (await page.screenshot()).toString('base64') });
  await page.close();
}

const W = 390;
const sheet = await b.newPage({ viewport: { width: W * shots.length, height: 900 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 13px system-ui;background:#fff;align-items:flex-start">
${shots.map(s => `<figure style="margin:0;text-align:center;width:${W}px">
  <img src="data:image/png;base64,${s.png}" style="width:${W}px;display:block">
  <figcaption style="padding:8px 4px;color:#2C4433">${s.label}</figcaption>
</figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT, fullPage: true });
await b.close();

console.log(`\n→ ${OUT}`);
console.log(fails.length ? `\n✗ ${fails.length} FAILED:\n  - ${fails.join('\n  - ')}` : '\n✓ all checks passed');
process.exit(fails.length ? 1 : 0);
