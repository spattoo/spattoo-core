/* Gypsophila on the tier card, driven the way a baker drives it.
 *
 * ⚠️ A JSX CLOSURE IS ONLY EVALUATED ON RENDER, which is why this exists rather than a unit test.
 * The whole card — three placements, two dials, two colour wheels, the remove — compiles and passes
 * check:bindings whether or not a single name in it resolves at runtime. It caught `ZONES is not
 * defined` in the canvas, which every gate had just waved through.
 *
 * ⚠️ AND IT ASSERTS THE DESIGN, NOT THE DOM. A card full of working buttons that writes nothing is
 * the failure this feature is most exposed to: `toCanvasConfig` rebuilds each tier from an
 * allow-list, and the rim ring drew nothing at all for exactly that reason while the board ring —
 * a design-level field that bypasses the list — rendered perfectly. The asymmetry was the clue.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-gyp-card.mjs
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });
await page.goto('http://localhost:5190/designer-mobile.html?catalog=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
const click = (t) => page.evaluate((s) => { const n=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===s||x.textContent.trim().startsWith(s)); if(!n) return false; n.click(); return true; }, t);

/* ⚠️ DRIVEN THROUGH `__tapElementById`, which is what this harness's own note says every procedural
   row needs: PROCEDURAL_TOOLS is keyed by placement_config.procedural and only tapPlaceElement
   consults it. Clicking the grid tile tests the fixture's categories, not the integration. */
/* ⚠️ `__loadElements()` FIRST. The catalogue loads on demand, so `__listElements` is empty until it
   is asked — which reads exactly like "my row is missing" and cost three wrong theories before I
   read the hook's own comment: "call first, wait a beat, then place". */
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

console.log('\nthe catalogue row');
/* ⚠️ `__listElements` returns a REDUCED shape — id, name, mode, glb, top — and no placement_config.
   Filtering on `placement_config.procedural` therefore finds nothing and reads as "my row is
   missing", which is a fourth wrong theory this one test produced. `__dumpElement` is the hook that
   answers what a row actually carries. */
const row = await page.evaluate(() => window.__dumpElement?.('e-gyp') ?? null);
ok(row?.placement_config?.procedural === 'gypsophila',
   `the row is in the catalogue (${row ? row.name : 'missing'})`);
ok(await page.evaluate(() => window.__tapElementById?.('e-gyp') ?? false) !== false, 'tapped it');
await page.waitForTimeout(3000);

console.log('\nit lands on the cake');
const g = await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp ?? null);
ok(!!g, `the tier carries it (${g ? `where=${g.where}` : 'nothing'})`);

console.log('\nthe card');
const txt = await page.evaluate(() => document.body.innerText);
ok(/ON THE RIM|On the rim/i.test(txt), 'offers "On the rim"');
ok(/arrange/i.test(txt), "offers \"I'll arrange\"");
ok(/ON THE BOARD|On the board/i.test(txt), 'offers "On the board"');

console.log('\nswitching placement');
ok(await click("I'll arrange"), "tapped \"I'll arrange\"");
await page.waitForTimeout(2000);
ok(await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.where) === 'free', 'it stores where=free');
ok(await click('On the board'), 'tapped "On the board"');
await page.waitForTimeout(2000);
ok(!!(await page.evaluate(() => window.__design?.().boardGyp)), 'the board carries one too');
/* Back to the rim, which is what a baker sees first, and shoot the card at phone width. */
await click('On the rim'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${process.env.HOME}/Downloads/gyp-designer.png` });

console.log('\ntaking it off');
ok(await click('Remove from cake'), 'the card offers "Remove from cake"');
await page.waitForTimeout(2000);
ok(await page.evaluate(() => !window.__design().tiers.slice(-1)[0].gyp && !window.__design().boardGyp),
   'both placements come off together');
await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
