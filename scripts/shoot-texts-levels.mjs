/* The Texts card on a phone: walk every level and prove no control was lost.
 *
 *   Sandeep, with a screenshot of a real Android browser, keyboard up: "this is texts element
 *   accessed in real mobile browser. it took almost all the space. need ot fix it. make it multi
 *   level popup pls." … then, about the dial he could not find: "i dont see the curve knob — so is
 *   it under size and shape. dont miss any control."
 *
 * The card was 669px of single scroll against roughly 400px of visible sheet. It is now a root (the
 * message) plus one level per NavRow, and THAT IS EXACTLY WHY THIS SCRIPT EXISTS: a restructure
 * that moves fourteen gated controls across six screens fails by DROPPING one, and a dropped
 * control is silent — the card still renders, the suite still passes, and the dial is simply not
 * there any more. So this opens every level on every Look and prints what is inside it.
 *
 * ⚠️ THE LOOKS DIFFER ON PURPOSE AND THE EXPECTATIONS ENCODE THAT. Acrylic has no Curve (one sheet
 * cut flat cannot bend) and no Colour (a finish is a material); fondant has both, plus Hug/Stand on
 * the top; only a cut Look carries Legs. Each list below is the card's own gate, read off the
 * source — not a wish.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190 (override with PORT=…).
 *   node scripts/shoot-texts-levels.mjs
 */
import { chromium } from 'playwright';

const B = `http://localhost:${process.env.PORT ?? 5190}`;
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

/* What each Look must offer. `rows` is the nav rows at the root; `dials` is what "Size & shape"
   holds, in order. Taken from the card's gates: Rotate is hidden on the side, Line gap needs a
   multi-line message (the fixture's is "Happy\nBirthday"), Legs are acrylic's alone. */
const LOOKS = {
  cream:   { rows: ['Where it goes', 'Look', 'Font', 'Colour', 'Size & shape'],
             dials: ['Size', 'Rotate', 'Thickness', 'Spacing', 'Curve', 'Line gap'] },
  fondant: { rows: ['Where it goes', 'Look', 'Font', 'Colour', 'Size & shape'],
             dials: ['Size', 'Rotate', 'Thickness', 'Spacing', 'Line gap', 'Curve'] },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

const rows  = () => page.locator('button.spattoo-navrow');
const names = async () => (await rows().allInnerTexts()).map(t => t.split('\n')[0]);
const open  = async (label) => { await rows().filter({ hasText: label }).first().click(); await page.waitForTimeout(900); };
const back  = async () => { await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(800); };
const sheet = async () => (await page.locator('textarea').first().evaluate(t => t.closest('div[style*="flex-direction"]').innerText)).replace(/\n+/g, ' · ');

await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Decor' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Sport/ }).click();
await page.waitForTimeout(1200);
/* The cream row, which is the one a customer typing their own message meets: no `lockLook`, so the
   Look level is offered and the other two materials are reachable from inside the card. */
for (let i = 0; i < 4; i++) {
  await page.getByText('Piped message', { exact: true }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await page.locator('textarea').count()) break;
}
ok(await page.locator('textarea').count() === 1, 'the Texts card opened on its root, with the message box');

/* The root is the MESSAGE plus a way to each level — it is what a baker sees over a keyboard, so
   its height is the number the report was about. */
const bodyH = await page.locator('textarea').first().evaluate(t => Math.round(t.parentElement.scrollHeight));
console.log(`  root body ${bodyH}px (single-scroll card before this was 669px)`);

for (const [look, want] of Object.entries(LOOKS)) {
  console.log(`\n── ${look} ─────────────────────────────`);
  if (look !== 'cream') {
    await open('Look');
    await page.getByRole('button', { name: look === 'fondant' ? 'Fondant' : 'Acrylic', exact: true }).click();
    await page.waitForTimeout(1600);
    await back();
  }
  const got = await names();
  ok(JSON.stringify(got) === JSON.stringify(want.rows), `rows ${JSON.stringify(got)}`);

  for (const label of got) {
    await open(label);
    const inside = await page.evaluate(() => {
      const bar = [...document.querySelectorAll('span')].find(s => /^(Where it goes|Look|Font|Finish|Colour|Size & shape)$/.test(s.innerText));
      return bar?.parentElement.parentElement.innerText.replace(/\n+/g, ' · ') ?? '';
    });
    console.log(`  ${label} → ${inside}`);
    if (label === 'Size & shape') {
      const missing = want.dials.filter(d => !inside.includes(d));
      ok(!missing.length, `every dial is on Size & shape (missing: ${missing.join(', ') || 'none'})`);
    }
    await page.screenshot({ path: `${OUT}/texts-${look}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}.png` });
    await back();
    ok((await rows().count()) === want.rows.length, `Back from ${label} returns the full root`);
  }
}

/* ── Acrylic, from its OWN row ───────────────────────────────────────────────────────────────────
 * Not by switching Look above, because that is a different card. An acrylic row carries `lockLook`
 * (`writingFromAcrylicRow`), so the material is the product an admin put on the shelf and the Look
 * level is not offered at all — which also means the Finish level is the ONLY way to its materials.
 * Legs, Leg length and Buried are acrylic's alone: they are what cutting a word from one sheet
 * costs, and a fondant word laid on by hand has none of them. */
console.log('\n── acrylic (its own row, lockLook) ─────────────────────────────');
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Decor' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Sport/ }).click();
await page.waitForTimeout(1200);
for (let i = 0; i < 4; i++) {
  await page.getByText('Acrylic topper', { exact: true }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await rows().count()) break;
}
const aWant = { rows: ['Where it goes', 'Font', 'Finish', 'Size & shape'],
                dials: ['Size', 'Rotate', 'Thickness', 'Spacing', 'Legs', 'Leg length', 'Buried'] };
const aGot = await names();
ok(JSON.stringify(aGot) === JSON.stringify(aWant.rows), `rows ${JSON.stringify(aGot)}`);
for (const label of aGot) {
  await open(label);
  const inside = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('span')].find(s => /^(Where it goes|Font|Finish|Size & shape)$/.test(s.innerText));
    return bar?.parentElement.parentElement.innerText.replace(/\n+/g, ' · ') ?? '';
  });
  console.log(`  ${label} → ${inside}`);
  if (label === 'Size & shape') {
    const missing = aWant.dials.filter(d => !inside.includes(d));
    ok(!missing.length, `every dial is on Size & shape (missing: ${missing.join(', ') || 'none'})`);
    /* A perspex word is cut flat from one sheet and cannot follow a bend: *"acrylic wont bend like
       arch."* Offering Curve here would be a dial showing a shape the cutter cannot make. */
    ok(!inside.includes('Curve'), 'and acrylic is NOT offered Curve');
  }
  await page.screenshot({ path: `${OUT}/texts-acrylic-${label.toLowerCase().replace(/[^a-z]+/g, '-')}.png` });
  await back();
  ok((await rows().count()) === aWant.rows.length, `Back from ${label} returns the full root`);
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
await browser.close();
process.exit(fails.length ? 1 : 0);
