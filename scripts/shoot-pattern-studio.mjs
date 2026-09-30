/* The cream pattern studio, after two changes asked for together:
 *
 *   Sandeep, at a studio showing a bare dish: "1. its showing only board. it should show cake as
 *   well. 2. you are showing the nozzles here. it should be the glb elements thumbnails pls."
 *
 * ⚠️ NEITHER IS PROVABLE FROM SOURCE, AND THE NEAR-MISS IN THIS VERY CHANGE IS WHY THIS EXISTS.
 * I passed `canvasConfig.board` and `t.baseY` to the studio without checking they existed. They do
 * not — `toCanvasConfig` emits neither; CakeCanvas's own `cakeScene` stacks `baseY` and derives the
 * board with `boardOf()`. That would have drawn NO board and put every tier at `undefined + height`
 * = NaN, i.e. an empty studio. `npm run build`, `check:bindings` (233 files), `check:movable`,
 * `check:procedural-studios` and 2440 tests were ALL GREEN with it in place. Root CLAUDE.md rule 6,
 * demonstrated on my own change for the fourth time in this feature — so this asserts on a MOUNTED
 * studio, not on the file.
 *
 * Six claims:
 *   1. The studio opens from Decorations (the `cream_pattern` row, e30).
 *   2. A CAKE is in it, not only a board — asserted on the real tier's own geometry reaching the
 *      scene, since a canvas cannot be read from the DOM.
 *   3. The piece grid shows ELEMENT THUMBNAILS (img tags from the catalogue), not drawn nozzle
 *      polygons. Before: 19 <svg><polygon>. After: <img> per eligible element.
 *   4. Only `hand_piping` pieces are offered — e16 is ticked and is the only one, so exactly one
 *      tile, and it is the Shell border.
 *   5. There is no Height dial. A stamp's height comes from its model, so a Height control would
 *      move and change nothing; Size / Spacing / Softness remain.
 *   6. Piping lands a piece: pieces go 0 → ≥1 and the count line says so.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-pattern-studio.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads/pattern-studio-cake-and-thumbs.png`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
// A baker's screen is a phone, and the designer switches layout at <=640. Shot wider too, below.
const page = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`page error: ${e.message}`); });

/* ⚠️ `catalog=1` IS NOT OPTIONAL — without it fetchElements returns the football stub and neither
   e30 (the studio row) nor e16 (the only hand_piping piece) exists, so every assertion below would
   "pass" by finding nothing. */
await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);   // the scene mounts and the env map lands a frame or two later

// The design tour owns the screen on a first visit and sits over the thing being photographed.
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click();
});
await page.waitForTimeout(600);

/* ── 1. open the studio ─────────────────────────────────────────────────────────────────────── */
console.log('\nopening the cream pattern studio');
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(900);
await page.evaluate(() => window.__tapElementById?.('e30'));
await page.waitForTimeout(3500);   // a tier and a GLB stamp both load

const title = await page.evaluate(() =>
  [...document.querySelectorAll('*')].some(n => n.children.length === 0
    && n.textContent.trim() === 'Cream pattern studio'));
ok(title, 'the studio is open (its title is on screen)');

/* ── 2. a cake, not only a board ────────────────────────────────────────────────────────────────
   A canvas has no DOM to read, so this asks the DESIGN what the studio was handed and checks the
   studio put a tier in the scene: the tier count and the first tier's radius/height/baseY, with
   baseY explicitly not-NaN — the exact fault that would have shipped. */
const cake = await page.evaluate(() => window.__patternStudioScene?.() ?? null);
ok(!!cake, 'the studio reports its scene');
ok((cake?.tiers ?? 0) >= 1, `a cake is in the studio — ${cake?.tiers ?? 0} tier(s)`);
ok(Number.isFinite(cake?.firstBaseY), `the first tier has a real baseY (${cake?.firstBaseY}) — not NaN`);
ok(!!cake?.board, 'a board is in the studio too');

/* ── 3 + 4. element thumbnails, gated on hand_piping ───────────────────────────────────────────
   The grid is found by its heading, then its own tiles are counted — img (catalogue thumbnails)
   against svg polygon (the drawn nozzle openings this replaced). */
const grid = await page.evaluate(() => {
  const head = [...document.querySelectorAll('div')]
    .find(d => d.textContent.trim() === 'On the nozzle' && d.children.length === 0);
  const box = head?.nextElementSibling;
  if (!box) return null;
  return {
    tiles: box.querySelectorAll('button').length,
    imgs: box.querySelectorAll('img').length,
    polys: box.querySelectorAll('svg polygon').length,
    names: [...box.querySelectorAll('button')].map(x => x.getAttribute('title')),
  };
});
ok(!!grid, 'the piece grid is on screen');
ok((grid?.imgs ?? 0) >= 1, `the tiles are element thumbnails — ${grid?.imgs ?? 0} img`);
ok((grid?.polys ?? 0) === 0, `no drawn nozzle openings remain — ${grid?.polys ?? 0} svg polygon`);
ok(grid?.tiles === 1, `only hand_piping pieces are offered — ${grid?.tiles} tile(s)`);
ok((grid?.names ?? []).includes('Shell border'), `and it is the ticked one — ${JSON.stringify(grid?.names)}`);

/* ── 5. no Height dial ──────────────────────────────────────────────────────────────────────── */
const dials = await page.evaluate(() => [...document.querySelectorAll('div')]
  .filter(d => d.children.length === 0 && ['Size', 'Height', 'Spacing', 'Softness'].includes(d.textContent.trim()))
  .map(d => d.textContent.trim()));
ok(!dials.includes('Height'), `no Height dial — a stamp's height is its model's (dials: ${dials.join(', ')})`);
ok(dials.includes('Size') && dials.includes('Spacing') && dials.includes('Softness'),
   'Size, Spacing and Softness remain');

/* ── 6. piping lands a piece ────────────────────────────────────────────────────────────────────
   Driven through the studio's own hook rather than synthesised pointer events: a raycast into a
   live 3D scene from a script is a test of my aim, not of the studio. */
const before = await page.evaluate(() => window.__patternStudioScene?.()?.pieces ?? 0);
/* A ROW, not a single dab. One piece at the centre of the top is a nub the eye cannot find, so the
   screenshot could not answer "did it pipe" — which is the only question worth asking here. */
await page.evaluate(() => { for (const dx of [-0.6, -0.3, 0, 0.3, 0.6]) window.__patternPipe?.(dx, 0); });
await page.waitForTimeout(2200);
const after = await page.evaluate(() => window.__patternStudioScene?.()?.pieces ?? 0);
ok(after >= before + 5, `piping lays a run — ${before} → ${after}`);

await page.screenshot({ path: OUT });
console.log(`\nshot → ${OUT}`);

// A baker's screen is a phone: the same studio at 390 wide.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
const PHONE = `${process.env.HOME}/Downloads/pattern-studio-phone.png`;
await page.screenshot({ path: PHONE });
console.log(`shot → ${PHONE}`);

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed:\n  - ${fails.join('\n  - ')}` : '\n✓ all claims hold');
process.exit(fails.length ? 1 : 0);
