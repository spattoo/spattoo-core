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

console.log('\nthe clumps "I\'ll arrange" puts down');
/* ⚠️ THE PILL MUST SEED ONE CLUMP, NOT FLOOD THE TOP. "I'll arrange" shipped first as whole-top
   coverage, which is "I'll cover it" — the opposite of what the pill says. */
ok(await click("I'll arrange"), "tapped \"I'll arrange\" again");
await page.waitForTimeout(2000);
const p1 = await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.patches ?? null);
ok(p1?.length === 1, `it starts as one clump (${p1 ? p1.length : 'none'})`);
ok(await click('+ Add clump'), 'the card offers "+ Add clump"');
await page.waitForTimeout(1500);
const p2 = await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.patches ?? []);
ok(p2.length === 2, `a second clump arrives (${p2.length})`);
/* ⚠️ AND IT LANDS SOMEWHERE ELSE. The grass version put every clump at the same (u, v), so the
   second sat inside the first and "+ Add clump" looked broken — the list grew, the cake did not. */
ok(p2.length === 2 && Math.abs((p2[0].u ?? 0) - (p2[1].u ?? 0)) > 0.05,
   'the second one lands clear of the first');
/* The drag dots: a clump is a thing you pick up, a band is not. */
const handles = await page.evaluate(() => window.__gypTapTargets?.() ?? null);
ok(handles !== null, `the canvas exposes the clump handles (${handles})`);
await page.screenshot({ path: `${process.env.HOME}/Downloads/gyp-clumps.png` });

console.log('\nback to the rim drops the clumps');
/* ⚠️ `grassSeats` READS `patches` WHATEVER ELSE IT WAS GIVEN, so a leftover clump would seat a
   second cloud in the middle of the ring and the rim pill would look broken. */
ok(await click('On the rim'), 'tapped "On the rim"');
await page.waitForTimeout(1500);
ok(!(await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.patches?.length)),
   'the band carries no clumps');

console.log('\nundo');
/* ⚠️ LIT ONLY WHEN IT CAN DO SOMETHING — read off the rendered attribute, not off the value I
   expect, because that is how the piped card's version was found broken: the button kept whatever
   it was painted with. */
const undoDisabled = () => page.evaluate(() => {
  const n = [...document.querySelectorAll('button')].find(x => /Undo/.test(x.textContent));
  return n ? n.disabled : null;
});
const beforeBloom = await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.bloom);
await page.evaluate(() => window.__design && 0);
ok(typeof beforeBloom === 'string', `the cloud has a bloom colour (${beforeBloom})`);
/* Shuffle is the one control that changes the design in a single tap with no picker to drive. */
ok(await page.evaluate(() => { const n=[...document.querySelectorAll('button')].find(x=>x.title==='Another hand\'s pass'); if(!n) return false; n.click(); return true; }),
   'the card offers Shuffle');
await page.waitForTimeout(1200);
ok(await undoDisabled() === false, 'Undo lights up once something has changed');
ok(await click('\u21B6 Undo') || await click('Undo'), 'tapped Undo');
await page.waitForTimeout(1500);
const back = await page.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp);
ok(back?.where === 'rim' && !back?.patches?.length,
   'it puts the cloud back the way the card found it');

console.log('\ntaking it off');
ok(await click('Remove from cake'), 'the card offers "Remove from cake"');
await page.waitForTimeout(2000);
ok(await page.evaluate(() => !window.__design().tiers.slice(-1)[0].gyp && !window.__design().boardGyp),
   'both placements come off together');
/* ── Duplicate, which needs somewhere to duplicate TO ──────────────────────────────────────────
 * ⚠️ A SECOND TIER, AND `?rainbow2` IS THE FIXTURE THAT HAS ONE. The designer has no "add tier"
 * button — a cake's tier count comes from the order — so a one-tier page cannot reach this control
 * at all, which is also the reason the button is absent there rather than present and inert.
 * Reusing an existing two-tier fixture rather than adding a third: a harness fixture that disagrees
 * with the app proves the wrong thing. */
console.log('\nduplicate, on a two-tier cake');
const page2 = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page2.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });
await page2.goto('http://localhost:5190/designer-mobile.html?catalog=1&rainbow2=1', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(6000);
await page2.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page2.waitForTimeout(3000);
await page2.evaluate(async () => { await window.__loadElements?.(); });
await page2.waitForTimeout(2500);
ok(await page2.evaluate(() => window.__design?.().tiers?.length) === 2, 'the cake has two tiers');
await page2.evaluate(() => window.__tapElementById?.('e-gyp'));
await page2.waitForTimeout(3000);
const click2 = (t) => page2.evaluate((x) => { const n=[...document.querySelectorAll('button')].find(y=>y.textContent.trim()===x||y.textContent.trim().startsWith(x)); if(!n) return false; n.click(); return true; }, t);
ok(await page2.evaluate(() => !!window.__design?.().tiers?.[1]?.gyp), 'it lands on the top tier');
ok(await click2('Duplicate'), 'the card offers Duplicate');
await page2.waitForTimeout(2000);
const both = await page2.evaluate(() => window.__design?.().tiers?.map(t => !!t.gyp));
ok(JSON.stringify(both) === '[true,true]', `both tiers carry one (${JSON.stringify(both)})`);
/* The tier row is what makes the copy reachable — without it the card edits one cloud and the
   other is stranded. */
const t2 = await page2.evaluate(() => document.body.innerText);
ok(/\bTIER\b|\bTier\b/.test(t2), 'a Tier row appears once there are two');
/* ⚠️ AND UNDO MUST TAKE THE COPY BACK OFF. The snapshot is of every surface for this reason: an
   Undo that cannot reach the tier Duplicate wrote to is an Undo that lies about what it undoes. */
ok(await click2('\u21B6 Undo') || await click2('Undo'), 'tapped Undo');
await page2.waitForTimeout(1500);
const after = await page2.evaluate(() => window.__design?.().tiers?.map(t => !!t.gyp));
ok(JSON.stringify(after) === '[false,true]', `the copy comes back off (${JSON.stringify(after)})`);
await page2.screenshot({ path: `${process.env.HOME}/Downloads/gyp-duplicate-card.png` });

/* ── On the side, with something already on the wall ───────────────────────────────────────────
 * ⚠️ `?sidesticker` SEEDS A DECORATION ON THE WALL, which is the state the clearance rule is about
 * and the one that cannot be reached by script: it needs a catalogue, the Decorations drawer and a
 * tap on a 3D wall. The maths is proved in geometry/wallSeats.test.js; what this proves is that the
 * placement reaches the cake and that the occupant is found at all — `surfaceOccupants` returns
 * NOTHING against a wall (it filters on x/z, which a side sticker does not use for its place), and
 * that silence reads exactly like "the cake is empty". */
console.log('\non the side, past a decoration already on the wall');
const page3 = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page3.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });
await page3.goto('http://localhost:5190/designer-mobile.html?catalog=1&sidesticker=1', { waitUntil: 'domcontentloaded' });
await page3.waitForTimeout(6000);
await page3.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page3.waitForTimeout(3000);
await page3.evaluate(async () => { await window.__loadElements?.(); });
await page3.waitForTimeout(2500);
const onWall = await page3.evaluate(() => (window.__getStickers?.() ?? []).filter(x => x.zone === 'side'));
ok(onWall.length === 1, `something is on the wall already (${onWall.length})`);
await page3.evaluate(() => window.__tapElementById?.('e-gyp'));
await page3.waitForTimeout(3000);
const click3 = (t) => page3.evaluate((x) => { const n=[...document.querySelectorAll('button')].find(y=>y.textContent.trim()===x||y.textContent.trim().startsWith(x)); if(!n) return false; n.click(); return true; }, t);
ok(await click3('On the side'), 'the card offers "On the side"');
await page3.waitForTimeout(3000);
const side = await page3.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp);
ok(side?.where === 'side', `it stores where=side (${side?.where})`);
ok((side?.sideLo ?? 0) < (side?.sideHi ?? 0), `the band has a bottom and a top (${side?.sideLo}–${side?.sideHi})`);
/* ⚠️ ONE CLUMP, NOT A SASH ROUND THE CAKE. *"flowers on side is mostly hand drawn. usually people
   wont cover the entire side with these flowers. on sides, its usually along with other flowers."*
   A full band was the first version and it is the wrong default. */
ok(side?.patches?.length === 1, `it starts as one clump on the wall (${side?.patches?.length})`);
const t3 = await page3.evaluate(() => document.body.innerText);
ok(/CLUMPS/i.test(t3), 'the card offers the clump row on the side');
/* ⚠️ THE FLOWER'S OWN SIZE, which is what "a cluster of white dots/sprinkles" turned out to need —
   together with laying the sprigs along the wall instead of pointing them at the viewer. */
ok(/Flower size/.test(t3), 'the card offers a flower size');
ok(side?.size > 1, `a wall posy starts bigger than the default sprig (${side?.size})`);
ok(side?.lay < 60, `and lies along the wall rather than end-on (lay=${side?.lay})`);
ok(!/Band bottom/.test(t3), 'and hides the band edges, which a placed clump ignores');
ok(await click3('+ Add clump'), 'a second wall clump can be added');
await page3.waitForTimeout(2000);
const sideP = await page3.evaluate(() => window.__design?.().tiers?.slice(-1)[0]?.gyp?.patches ?? []);
ok(sideP.length === 2, `a second clump arrives (${sideP.length})`);
ok(sideP.every(q => q.v > 0.1 && q.v < 0.9), `both sit on the wall, not at its edges (${sideP.map(q => q.v).join(', ')})`);
/* ⚠️ THE HANDLE AND THE FLOWERS MUST AGREE. `u` is measured from the cake's FRONT here and from +X
   in `circlePerimeter` — a quarter turn apart on a round cake, which reads as "dragging that clump
   does nothing". Pinned by a unit test too; this one proves the dots exist on the wall at all. */
const wallHandles = await page3.evaluate(() => window.__gypTapTargets?.() ?? null);
ok(Array.isArray(wallHandles) && wallHandles.length === 2,
   `both clumps carry a drag handle (${wallHandles?.length})`);
await page3.screenshot({ path: `${process.env.HOME}/Downloads/gyp-on-side.png` });

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
