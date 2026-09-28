/* "Our creations" is gone — did anything go with it that shouldn't have?
 *
 * ⚠️ A REMOVAL IS THE HARDEST THING TO TEST FROM SOURCE. Grep proves a block is absent; it cannot
 * prove the page still stands up without it, and this particular cut reached into three things it
 * did not own:
 *
 *   1. The testimonials carousel shares `arrow`/`arrowL`/`arrowR` and the `.sf-arrow` CSS with the
 *      deleted strip. Removing styles by name prefix would have taken the reviews arrows with it,
 *      silently, and no test in this repo renders that carousel.
 *   2. The customiser's `ready` gate was released by the gallery-photo fetch's `.finally()`. That
 *      fetch is gone; if the replacement gate is wrong the customiser sits on its spinner forever —
 *      and nothing in the suite mounts ThemePreview, so the suite would stay green.
 *   3. The Highlight section kept its own image upload but lost the "pick an existing photo" strip.
 *
 * So this drives both screens and asserts on what SURVIVED, not only on what left.
 *
 * ⚠️ NOT `networkidle` — the storefront mounts a live 3D hero and never goes idle.
 * Assumes `npm run dev` is already up on 5190; it does not start one.
 *   node scripts/shoot-storefront-clean.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads/storefront-without-creations.png`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
const shots = [];

async function open(url, viewport) {
  const page = await b.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3200);
  return page;
}

/* ── The customer's storefront, on a phone ─────────────────────────────────────────────────── */
console.log('\nstorefront.html @ 375 — the section is gone, the rest stands');
{
  const page = await open(`${B}/storefront.html?chrome=none`, { width: 375, height: 800 });
  const text = await page.evaluate(() => document.body.innerText);

  ok(!/our creations/i.test(text), 'no "Our creations" heading');
  ok(!/fresh photos coming soon/i.test(text), 'no empty-gallery panel');
  ok(!(await page.$('#gallery')), 'no #gallery section in the document');

  const drawerLabels = await (async () => {
    await page.click('button[aria-label="Menu"]');
    await page.waitForTimeout(600);
    const l = await page.evaluate(() => {
      const nav = document.querySelector('button[aria-label="Close"]')?.closest('nav');
      return nav ? [...nav.querySelectorAll('a,button')].map(e => e.textContent.trim()).filter(t => t && t !== '×') : null;
    });
    await page.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click());
    await page.waitForTimeout(400);
    return l;
  })();
  ok(drawerLabels && !drawerLabels.includes('Gallery'), `menu has no Gallery — got [${drawerLabels}]`);

  // ⚠️ THE SHARED-STYLE CHECK. Two testimonials means two carousel arrows; if the style purge went
  // too far these are gone or unstyled, and the reviews section quietly loses its controls.
  const arrows = await page.$$eval('.sf-arrow', els => els.map(e => ({
    w: Math.round(e.getBoundingClientRect().width), label: e.getAttribute('aria-label'),
  })));
  ok(arrows.length === 2, `the reviews carousel keeps its two arrows — got ${arrows.length}`);
  ok(arrows.every(a => a.w > 20), `and they are still styled (38px circles) — got ${JSON.stringify(arrows)}`);

  ok(/Pistachio & rose/i.test(text), 'the Highlight section still renders');
  ok(/Absolutely stunning/i.test(text), 'the reviews section still renders');
  ok(/You design, we bake it/i.test(text), 'the hero still renders');

  shots.push({ label: 'storefront — no Our creations', png: (await page.screenshot({ fullPage: false })).toString('base64') });
  await page.close();
}

/* ── The customiser ───────────────────────────────────────────────────────────────────────── */
console.log('\ncustomiser.html — the control is gone, the preview still paints');
{
  const page = await open(`${B}/customiser.html`, { width: 1280, height: 900 });
  const text = await page.evaluate(() => document.body.innerText);

  ok(!/my recent works/i.test(text), 'no "My recent works" control');
  ok(!/cake photos/i.test(text), 'no "Cake photos" control');
  ok(!/\+ Upload photos/i.test(text), 'no photo uploader');

  /* ⚠️ THE `ready` GATE. This is the whole reason this script exists: the spinner reads "Loading…",
     and if the replacement gate never flips that is ALL the customiser ever shows. Asserting on the
     previewed storefront's own hero proves the frame actually painted. */
  ok(!/Loading…/.test(text), 'the preview is not stuck on its spinner');
  ok(/You design, we bake it/i.test(text), 'the previewed storefront rendered inside the frame');

  // The sections list must still offer the three that remain, and not the retired one.
  ok(/Our story/.test(text) && /Reviews/.test(text), 'the sections list still lists Our story and Reviews');

  shots.push({ label: 'customiser — preview paints', png: (await page.screenshot()).toString('base64') });
  await page.close();
}

const W = 520;
const sheet = await b.newPage({ viewport: { width: W * shots.length, height: 900 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 14px system-ui;background:#fff;align-items:flex-start">
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
