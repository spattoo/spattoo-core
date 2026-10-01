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
 *   3. The controls are ON the cake window — Undo and Clear as ICONS top-right, the colour as a
 *      34px RING, the piece picker as a trigger — asserted by position inside the canvas wrapper,
 *      because a control that merely exists somewhere on the panel is what was wrong before. And
 *      nothing is permanently open: no picker renders until asked.
 *   4. Tapping the trigger opens the piece card OVER the cake, holding element thumbnails (not
 *      drawn nozzle polygons), gated on `hand_piping` — e16 is the only ticked one, so one tile.
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

/* ── 3. THE CONTROLS ARE ON THE CAKE, NOT UNDER IT ──────────────────────────────────────────────
   Sandeep, at the phone view: *"undo/clear are icons on the cake window, not below it. pls see
   garnish studio"*, *"color picker is taking too much space. just a picker ring"*, and *"its not
   good to scroll down always to pick the piping style."*

   Asserted by POSITION, not by presence: a button that exists somewhere on the panel is exactly
   what was wrong before. So each control is looked for INSIDE the canvas's own wrapper. */
/* ⚠️ MEASURED AGAINST THE CANVAS RECT, NOT WALKED UP THE DOM — and the first version of this check
   failed eight claims on a screen that was completely correct. It reached the wrapper with
   `canvas.parentElement.parentElement`, but R3F renders its OWN div around the <canvas>, so that
   landed on the aspect box and every control sat one level above it. "On the cake window" is a
   question about WHERE A THING IS, so it is answered with geometry: a button whose box lies inside
   the canvas's box is on the cake, whatever divs either of them happens to be wrapped in. */
const rail = await page.evaluate(() => {
  /* ⚠️ THE STUDIO'S CANVAS, NOT THE DOCUMENT'S FIRST — and getting this wrong made every verdict
     below noise. The DESIGNER's own cake canvas is mounted behind the panel, so
     `querySelector('canvas')` returns a 796×940 rect covering the viewport: Undo fell inside it and
     "passed" for the wrong reason, the colour ring fell outside it on the left and "failed" for the
     wrong reason. The studio's canvas is the last one in the document, and it is square. */
  const all = [...document.querySelectorAll('canvas')];
  const canvas = all[all.length - 1];
  if (!canvas) return null;
  const cr = canvas.getBoundingClientRect();
  const inside = (el) => {
    if (!el) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.left >= cr.left - 2 && b.right <= cr.right + 2
        && b.top >= cr.top - 2 && b.bottom <= cr.bottom + 2;
  };
  const byLabel = l => document.querySelector(`button[aria-label="${l}"]`);
  const undo = byLabel('Undo the last action');
  /* ⚠️ BY ITS OWN LABEL, NOT BY "the first round button" — the designer is still mounted behind the
     panel and owns round buttons of its own, so that selector returned one of THOSE (measured at
     l:54, t:854, nowhere near the rail) and the ring was judged out of bounds for being a different
     button entirely. Third time in this script that a loose selector reached past the studio. */
  const round = document.querySelector('button[aria-label="Cream colour"]');
  const piece = [...document.querySelectorAll('button')].find(b => {
    const l = b.getAttribute('aria-label') ?? '';
    return l.startsWith('Piece:') || l === 'Choose a piece';
  });
  return {
    undo: inside(undo),
    clear: inside(byLabel('Clear the cake')),
    // Icons, not words: the button carries an svg and no text of its own.
    undoIsIcon: !!undo?.querySelector('svg') && (undo.textContent ?? '').trim() === '',
    colourRing: inside(round),
    ringPx: round ? round.getBoundingClientRect().width : 0,
    pieceTrigger: inside(piece),
  };
});
ok(!!rail, 'the canvas is found');
ok(rail?.undo && rail?.clear, 'Undo and Clear are ON the cake window');
ok(rail?.undoIsIcon, 'and they are icons, not words');
ok(rail?.colourRing && rail.ringPx <= 40, `the colour control is a ring — ${Math.round(rail?.ringPx ?? 0)}px`);
ok(rail?.pieceTrigger, 'the piece picker is a trigger on the cake, not a column to scroll to');

/* ⚠️ AND NOTHING IS PERMANENTLY OPEN. The wheel used to sit below the canvas at every width, which
   is the space complaint. A closed card renders no HexColorPicker at all. */
const closed = await page.evaluate(() => document.querySelectorAll('.react-colorful').length);
ok(closed === 0, `no colour picker is open until asked — ${closed} on screen`);

/* ── 4. the card opens over the cake, holds the thumbnails, gated on hand_piping ───────────────── */
const card = await page.evaluate(() => {
  const trigger = [...document.querySelectorAll('button')].find(b => {
    const l = b.getAttribute('aria-label') ?? '';
    return l.startsWith('Piece:') || l === 'Choose a piece';
  });
  if (!trigger) return false;
  trigger.click();
  return true;
});
await page.waitForTimeout(500);
/* The card is the absolutely-positioned box holding thumbnails, and it must OVERLAP the cake —
   that is the whole point of it floating rather than sitting in a column below the fold. */
const grid = await page.evaluate(() => {
  const all = [...document.querySelectorAll('canvas')];
  const cr = all[all.length - 1].getBoundingClientRect();
  /* ⚠️ THE CARD IS THE BOX HOLDING TILES, not merely "an absolute div with an img". That looser
     selector matched an unrelated 240×64 element with ZERO buttons, which is how this reported
     `1 img` and `0 tiles` in the same breath — two contradictory numbers read off two different
     elements. A tile is a button carrying a title, so the card is the box that holds one. */
  /* ⚠️ THE INNERMOST MATCH. The RAIL is absolutely positioned too, holds the trigger (a
     button[title]) and an img, and is the card's ANCESTOR — so it matched first and reported the
     rail's three buttons as three tiles. The card is the candidate that contains no other
     candidate. */
  const cands = [...document.querySelectorAll('div')]
    .filter(d => d.style.position === 'absolute'
              && d.querySelector('button[title]')
              && d.querySelector('img'));
  const open = cands.find(d => !cands.some(o => o !== d && d.contains(o)));
  if (!open) return null;
  const b = open.getBoundingClientRect();
  const overlaps = b.left < cr.right && b.right > cr.left && b.top < cr.bottom && b.bottom > cr.top;
  if (!overlaps) return null;
  const tiles = [...open.querySelectorAll('button')];
  return {
    tiles: tiles.length,
    imgs: open.querySelectorAll('img').length,
    polys: open.querySelectorAll('svg polygon').length,
    names: tiles.map(x => x.getAttribute('title')),
  };
});
ok(!!card && !!grid, 'tapping the trigger opens the piece card over the cake');
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
