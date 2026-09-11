import * as THREE from 'three';
/* The cake's own outline families. A backing PLATE is the same closed 2D outline a cake footprint
 * is, at a different scale — so a heart on a topper and a heart cake are the SAME curve, tuned once,
 * and a family authored into `cake_shapes` later arrives here for free.
 *
 * ⚠️ shapes.js ONLY. `surface.js` also has samplers (circlePerimeter, roundedRectPerimeter) and they
 * are deliberately not used: it imports the letter-cake engine and its font, so taking two trivial
 * curves from there would drag helvetiker and glyphShape into everything that renders a topper. A
 * circle and a rounded box are sampled below instead — sin/cos and four arcs are not a shared domain
 * decision the way a heart's plump/cleft/tip are, and shapes.js says outright that those two stay
 * analytic in surface.js so no existing cake regresses. */
import { outlineOf, pointInPolygon } from './shapes.js';
import { offsetByDistance } from './offsetField.js';

/* ── An acrylic cake topper, as one cut-out ──────────────────────────────────────────────────────
 *
 * A word, a bar under it if it needs one, and the prongs that push into the cake — all as
 * THREE.Shape[] in the font's XY plane, ready to extrude thin and stand upright.
 *
 * ── WHY THIS IS NOT glyphShape.js ───────────────────────────────────────────────────────────────
 * That module makes a CAKE shaped like letters: one hardcoded block font (helvetikerBold), extruded
 * a hundred millimetres, and it does not care whether the letters touch — a "1" and a "0" are two
 * separate cakes on one board, which is correct there.
 *
 * A topper is the opposite on both counts. It is cut from ONE sheet of acrylic, so a letter that
 * touches nothing is a letter that arrives loose in a bag; and the fonts that work are scripts,
 * where the letters run into each other on purpose. Hence an injectable font and a connectivity
 * check, neither of which the cake path wants.
 *
 * ── THE CONNECTIVITY CHECK IS THE POINT ─────────────────────────────────────────────────────────
 * Everything else here is arithmetic. `pieceCount` is the thing that decides whether the object can
 * exist, and it is the one question a picture cannot answer: on screen a floating "i" dot looks
 * exactly like an attached one, and the difference only shows up when somebody cuts it.
 *
 * Pure geometry — no React, no material, no renderer. The studio previews it and the designer
 * renders it from the same numbers.
 */

// Outline sampling. Enough to keep a script's curves smooth where two letters meet, since that
// junction is exactly what the connectivity test reads.
const CURVE_SEG = 24;

/* Build the topper's outline.
 *
 * `font` is a parsed three.js Font — injected, never module-level, because the whole feature turns
 * on being able to use a connecting script rather than the block face the cake path is fixed to.
 *
 * `weight` thickens every stroke, and it earns its place here beyond looking bolder: on a script it
 * is often what closes a hairline gap between two letters, turning three pieces into one. It is the
 * first thing to reach for when the count comes back above 1.
 */
export function topperShapes(font, text, {
  height = 1,
  weight = 0,
  baseline = null,          // { thickness, overhang } — a bar under the word, or null for none
  legs = null,              // { count, width, length, inset } — prongs below, or null for none
  lines = 'auto',           // rows to stack over, or 'auto'; '\n' in the text always wins
  lineGap = 1,              // baseline to baseline, in ems — the LOOSEST setting, not the final one
  nest = true,              // pull stacked rows together until their letterforms actually meet
  minGap = 0.45,            // how far they may be pulled before the rows read as one another
  stroke = 0.1,             // centreline faces only: the monoline's width, in ems
  tracking = 0,             // letter fit, in ems — NEGATIVE tightens until the strokes meet
  fitAspect = 28,           // 'auto' stacks until width : narrowest-acrylic is no worse than this
  maxLines = 3,
} = {}) {
  const clean = String(text ?? '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  const EMPTY = { shapes: [], parts: [], glyphs: [], width: 0, height: 0, baselineY: 0, legs: [],
                  rows: [], rowHeight: 0, capHeight: 0 };
  if (!font || !clean) return EMPTY;

  /* ── STACKING, and why it is not a nicety ────────────────────────────────────────────────────
   *
   * A topper is sized by how much of the CAKE it crosses, so at a fixed span the letters shrink as
   * the phrase gets longer: on a 6-inch cake "Amelia" sets at 20mm, "Happy Birthday" at 11mm, and
   * "Happy 1st Birthday" at 8.8mm — thinner than the 3mm sheet it is cut from, which is a comb, not
   * a topper. Two rows roughly double the letter for the same span, which is why every real
   * "Happy Birthday" topper is stacked.
   *
   * Rows are laid out at size 1 with each row centred on its own outline, then the whole block is
   * scaled together — so `height` keeps meaning the height of the finished object and every caller
   * that sized a single line still gets what it asked for. */
  const rows = lines === 'auto' ? autoRows(font, clean, fitAspect, maxLines, stroke, weight, tracking)
                                : buildRows(font, splitRows(font, clean, lines), stroke, weight, tracking);
  if (!rows.length) return EMPTY;

  /* ── ROWS THAT MEET EACH OTHER, rather than rows that get stapled together ─────────────────────
   *
   * ⚠️ Stacking at a fixed gap leaves the rows apart, and `bridgeLoose` then drops a stem from every
   * floating letter of the upper row down through the lower one. On a block font those stems are
   * the only thing holding it together. On a script they are vandalism: six hairlines ruled straight
   * through the middle of the word.
   *
   * Look at any real two-line script topper and no such stems exist — the rows are set close enough
   * that the descenders of the top line run into the ascenders of the bottom one, and the letterforms
   * do the joining themselves. So `lineGap` becomes the loosest acceptable setting rather than the
   * answer, and the rows are pulled together until they genuinely touch.
   *
   * The LARGEST gap that connects, not the smallest: overlap beyond the point of contact only makes
   * the two lines harder to read, and there is nothing to gain past the first touch. `minGap` stops
   * it before the rows start reading as one another for a phrase whose letters will never meet.
   */
  const gap = nest && rows.length > 1 ? nestedGap(rows, lineGap, minGap) : lineGap;

  // Centre each row on itself and drop it a line — ragged rows read as centred, which is how these
  // are set, and it costs nothing to do it here rather than making every caller do it.
  const glyphOutlines = [];
  for (let i = 0; i < rows.length; i++) {
    const { dx } = rows[i], dy = -i * gap;
    const shift = p => ({ x: p.x + dx, y: p.y + dy });
    rows[i].baselineEm = dy;
    for (const g of rows[i].glyphs) {
      glyphOutlines.push({ outer: g.outer.map(shift), holes: g.holes.map(h => h.map(shift)) });
    }
  }

  // Size by HEIGHT with the aspect kept, the same bargain glyphShape makes: every topper of a given
  // setting stands the same tall and simply grows wider with more letters, so a baker's "Emma" and
  // "Charlotte" are the same object at two lengths rather than two different sizes.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphOutlines) for (const p of g.outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
  const scale = height / gh;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tx = p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale });

  const glyphs = glyphOutlines.map(g => ({
    outer: g.outer.map(tx),
    holes: g.holes.map(h => h.map(tx)),
  }));

  const width = gw * scale;
  const capHeight = Math.max(...rows.map(r => r.capEm)) * scale;
  const parts = glyphs.map(g => ({ outer: g.outer, holes: g.holes, kind: 'glyph' }));

  /* The bar, and WHERE IT SITS IS THE WHOLE THING.
   *
   * ⚠️ At the TYPOGRAPHIC baseline, not the bottom of the bounding box. Those are the same line only
   * for a word with no descender. Put a bar at the bbox bottom of "Amy" and it lands at the tail of
   * the y, several millimetres BELOW where the A and the m end — so it joins the descender and
   * nothing else, and the topper is still three pieces while looking perfectly attached on screen.
   * The connectivity test caught exactly that, which is the argument for having it.
   *
   * The font hands the real line over for nothing: generateShapes puts y = 0 at the baseline, so it
   * is just that point carried through the same centre-and-scale as everything else.
   *
   * It then bites UP into the letters rather than meeting them edge to edge. A bar that merely
   * touches is a butt joint at the one place the whole object hangs from. */
  // ⚠️ The LAST row's baseline. The bar goes under the bottom line; put it at y = 0 and a stacked
  // topper gets a bar through its middle, joined to the top row and to nothing that stands on it.
  const typographicBaseline = (rows[rows.length - 1].baselineEm - cy) * scale;
  let baselineY = typographicBaseline;
  if (baseline) {
    const t = Math.max(1e-4, baseline.thickness ?? height * 0.08);
    const over = baseline.overhang ?? height * 0.06;
    const top = typographicBaseline + t * 0.35;       // bite up into the letters
    baselineY = top - t;
    parts.push({ kind: 'baseline', outer: rect(-width / 2 - over, baselineY, width + over * 2, t), holes: [] });
  }

  /* The prongs. Rectangles hanging from the lowest solid edge, and they overlap it for the same
   * reason the bar does.
   *
   * ⚠️ Placed where there IS material above them, not at tidy fractions of the width. A leg at 25%
   * of "Amelia" can easily land in the gap between two letters, and a prong joined to nothing is
   * the part that snaps off first — silently, because on screen it looks attached. */
  const legShapes = [];
  if (legs && legs.count > 0) {
    const w = legs.width ?? height * 0.06;
    const len = legs.length ?? height * 0.5;
    const anchors = legAnchors(parts, legs.count, width, legs.inset ?? 0.18);
    for (const ax of anchors) {
      const bottom = lowestSolidAt(parts, ax, w) ?? baselineY;
      legShapes.push({ kind: 'leg', outer: rect(ax - w / 2, bottom - len, w, len + w * 0.5), holes: [] });
    }
    parts.push(...legShapes);
  }

  const shapes = parts.map(p => {
    const s = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q.x, q.y)));
    s.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
    return s;
  });

  return {
    shapes, parts, glyphs, width, height, baselineY, legs: legShapes,
    rows: rows.map(r => r.text), rowHeight: gap * scale, lineGap: gap, capHeight,
    feature: featureEm(rows, font, stroke) * scale,
  };
}

/* The loosest gap at which every neighbouring pair of rows is in contact.
 *
 * Walks down from the requested gap and stops at the first that connects, so the rows are never
 * pulled tighter than they need to be. Falls back to the requested gap when they never meet — a
 * phrase whose lines genuinely cannot touch is better left readable and bridged than crushed
 * together and still bridged.
 */
function nestedGap(rows, start, floor) {
  const shifted = rows.map(r => r.glyphs.map(g => g.outer.map(p => ({ x: p.x + r.dx, y: p.y }))));
  for (let g = start; g >= floor - 1e-9; g -= 0.025) {
    let all = true;
    for (let i = 0; i < shifted.length - 1 && all; i++) all = rowsMeet(shifted[i], shifted[i + 1], g);
    if (all) return g;
  }
  return start;
}

// Do any two contours of these rows touch, with the lower row dropped by `gap`?
function rowsMeet(upper, lower, gap) {
  for (const a of upper) {
    const ba = bbox(a);
    for (const b of lower) {
      const bb = bbox(b);
      const shifted = { x0: bb.x0, x1: bb.x1, y0: bb.y0 - gap, y1: bb.y1 - gap };
      if (!boxOverlap(ba, shifted)) continue;
      if (ringsTouch(a, b.map(p => ({ x: p.x, y: p.y - gap })))) return true;
    }
  }
  return false;
}

/* ── Choosing the number of rows, so nobody has to ─────────────────────────────────────────────────
 *
 * ⚠️ THIS IS THE DEFAULT BECAUSE THE FEATURE IS INVISIBLE OTHERWISE.
 *
 * Stacking was there behind a `lines` option and a phrase still came out as one unreadable line,
 * because the caller has to know to ask. Somebody typing "Happy Birthday" should not have to learn
 * what a row is — the shape of the phrase decides this, not the person.
 *
 * ── THE RULE IS THE NARROWEST BIT OF ACRYLIC ───────────────────────────────────────────────────
 * The first version of this measured LETTER HEIGHT and stacked below 12mm, which was a number I
 * made up. It reads well on a block face and is wrong on a monoline script, where the letters can
 * be tall and the stroke still a hairline — a script's bounding box is mostly ascender and
 * descender loops, so the box says the letters are big while the thing that gets cut is not.
 *
 * What actually breaks in the post is any piece of acrylic NARROWER THAN THE SHEET IS THICK, so
 * that is what gets measured: `featureEm`, the thinnest stroke in the design. On a centreline face
 * that is the monoline width exactly; on an outline face it is estimated from the cap, since
 * measuring a stem properly means walking the outline and a fifth of the cap is what a bold sans
 * actually runs.
 *
 * Expressed as width : feature so it survives not knowing the cake's size — the caller divides its
 * span in millimetres by the sheet thickness and passes one number.
 *
 * Fewest rows that clear the bar, and it stops early when there are no more words to break on, so a
 * long single word stays on one line rather than being chopped.
 */
function autoRows(font, clean, fitAspect, maxLines, stroke, weight, tracking) {
  const cap = Math.max(1, Math.round(maxLines) || 1);
  let best = [];
  for (let n = 1; n <= cap; n++) {
    const rows = buildRows(font, splitRows(font, clean, n), stroke, weight, tracking);
    if (!rows.length) break;
    if (rows.length < n) return best.length ? best : rows;   // out of words to break on
    best = rows;
    if (!(fitAspect > 0)) break;
    const w = Math.max(...rows.map(r => r.wEm));
    const f = featureEm(rows, font, stroke);
    if (f > 0 && w / f <= fitAspect) break;
  }
  return best;
}

// One row's outlines in ems with the baseline at y = 0, plus what the balancer and the fit rule
// need to measure it. Rows of nothing but spaces produce no glyphs and are dropped.
/* The narrowest piece of acrylic in the design, in ems.
 *
 * Exact for a monoline — the stroke IS the width between the two cuts.
 *
 * ⚠️ For an outline face this was a fifth of the cap height, which I asserted was "what a bold sans
 * stem measures". Measured, it is wrong for every font tried, including the bold sans: helvetiker
 * comes out at 0.073, Great Vibes at 0.031, Pinyon Script at 0.021. Guessing it 3 to 10 times too
 * fat means a hairline script sails past the check that exists to catch hairlines.
 *
 * So it is measured from the outline that was already built. A ribbon of width w and length L has
 * area ~ wL and perimeter ~ 2L, so 2A/P is its width — exact for a ring (an 'o' gives its wall
 * thickness), conservative for a blob, and it costs one pass over points already in memory. The
 * thinnest GLYPH decides, because the topper breaks wherever it is thinnest and not on average.
 */
function featureEm(rows, font, stroke) {
  if (isCentreline(font)) return Math.max(1e-4, stroke || 0.1);
  let min = Infinity;
  for (const r of rows) for (const g of r.glyphs) {
    const w = strokeWidth(g);
    if (w > 0 && w < min) min = w;
  }
  return Number.isFinite(min) ? min : Math.max(...rows.map(r => r.capEm)) * 0.1;
}

// 2 x area / perimeter, counting holes on both sides so a counter thins the letter rather than
// fattening it.
function strokeWidth(part) {
  let a = ringArea(part.outer), p = ringPerimeter(part.outer);
  for (const h of part.holes ?? []) { a -= ringArea(h); p += ringPerimeter(h); }
  return p > 0 ? (2 * a) / p : 0;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

function ringPerimeter(r) {
  let l = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; l += Math.hypot(q.x - p.x, q.y - p.y); }
  return l;
}

function buildRows(font, rowText, stroke, weight = 0, tracking = 0) {
  const rows = [];
  for (const text of rowText) {
    let o = isCentreline(font) ? strokeOutlines(font, text, stroke, tracking)
                               : outlineRow(font, text, tracking);
    if (!o.length) continue;
    // Applied HERE, in ems, so `featureEm` and the row-count rule both see the letters as they will
    // actually be cut. Applied after the fact — as it was — they measure a design that never ships.
    if (weight) o = o.map(g => ({ outer: offsetRing(g.outer, weight), holes: g.holes.map(h => offsetRing(h, -weight)) }));
    const b = boundsOf(o);
    rows.push({ text, glyphs: o, capEm: b.y1 - b.y0, wEm: b.x1 - b.x0, dx: -(b.x0 + b.x1) / 2 });
  }
  return rows;
}

/* ── Setting a row of outlines, one glyph at a time, so the FIT is a control ─────────────────────
 *
 * ⚠️ THE JOIN BETWEEN TWO LETTERS IS NOT A BRIDGE PROBLEM.
 *
 * A script whose "h" and "d" do not quite meet got a straight 3mm rectangle bolted across the gap,
 * and it read exactly like what it was: a bar laid over a curve. The bridge was doing its job — the
 * mistake was needing one. These faces are drawn for print, where letters merely have to LOOK
 * joined; cut in acrylic they have to actually touch, and the fix a type designer would reach for is
 * to tighten the fit until they do.
 *
 * `generateShapes` lays out a whole string and gives no way in, so the row is set glyph by glyph
 * instead. That costs nothing and loses nothing: three.js applies NO kerning — `createPaths` advances
 * by `glyph.ha * scale` and nothing else — so this is byte-identical to the whole-string call at
 * tracking 0, and every negative step from there closes the gaps evenly.
 */
function outlineRow(font, text, tracking) {
  const out = [];
  const res = font.data?.resolution || 1000;
  let pen = 0;
  for (const ch of String(text)) {
    const g = font.data?.glyphs?.[ch] ?? font.data?.glyphs?.['?'];
    const adv = (g?.ha ?? 0) / res;
    if (ch !== ' ' && g?.o) {
      for (const sh of font.generateShapes(ch, 1)) {
        out.push({
          outer: sh.getPoints(CURVE_SEG).map(p => ({ x: p.x + pen, y: p.y })),
          holes: (sh.holes ?? []).map(h => h.getPoints(CURVE_SEG).map(p => ({ x: p.x + pen, y: p.y }))),
        });
      }
    }
    // A space keeps its full advance: tightening the FIT of a word should not weld two words together.
    pen += adv + (ch === ' ' ? 0 : tracking);
  }
  return out;
}

/* ── Monoline scripts, from the faces the cream pen already uses ─────────────────────────────────
 *
 * ⚠️ Not a new font library. `creamFonts.json` already vendors four public-domain SCRIPT faces —
 * Allure, Felix, Elfin, Cursive — and they are the right raw material for a topper twice over:
 *
 *   - They are CENTRELINES, not outlines. Sweeping a constant width along a centreline is exactly a
 *     monoline script, which is what the flat acrylic toppers in the market are set in. An outline
 *     font gives you a typeface with thicks and thins; this gives you the ribbon.
 *   - A joined script's strokes OVERLAP, so the word is one piece by construction. The block font
 *     needs a bar and a stem under every floating dot to survive being cut; a script does not.
 *
 * The stroke width becomes a real control rather than a styling flourish: it is the acrylic between
 * two cuts, and it is the difference between a topper and a comb.
 *
 * One ring per stroke, so `components` sees strokes touching and the piece count stays honest.
 */
const isCentreline = (font) => !!font && !font.generateShapes && !!font.glyphs;

// Missing lowercase falls back to uppercase and back again, so every name renders rather than
// silently dropping letters — the same bargain creamText.js makes.
const glyphOf = (face, ch) =>
  face.glyphs[ch] || face.glyphs[ch.toUpperCase?.()] || face.glyphs[ch.toLowerCase?.()] || null;

function strokeOutlines(face, text, width, tracking = 0) {
  const em = face.em || 1000;
  const r = Math.max(1e-4, (width || 0.1) / 2) * em;    // half-width, in the face's own units
  const out = [];
  let penX = 0;
  for (const ch of String(text)) {
    if (ch === ' ') { penX += face.space ?? em * 0.3; continue; }
    const g = glyphOf(face, ch);
    if (!g) { penX += face.space ?? em * 0.3; continue; }
    for (const stroke of g.s) {
      const ring = ribbon(stroke.map(([x, y]) => ({ x: x + penX, y })), r);
      if (ring.length > 2) out.push({ outer: ring.map(p => ({ x: p.x / em, y: p.y / em })), holes: [] });
    }
    penX += g.a + tracking * em;
  }
  return out;
}

/* A polyline swept to a closed ring of constant width, with round ends.
 *
 * Joins use the AVERAGED normal rather than one per segment: per-segment offsets leave a notch on
 * the outside of every bend, and these faces are sampled densely enough that a script's curve would
 * come out visibly faceted. The mitre is capped at 3r so a hairpin cannot fire a spike off into the
 * next letter — the cost is a clipped corner, which is what a cutter would make of it anyway.
 */
function ribbon(points, r) {
  const P = [];
  for (const p of points) {
    const last = P[P.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) P.push(p);
  }
  if (P.length === 0) return [];
  if (P.length === 1) return arcPoints(P[0], r, 0, Math.PI * 2, 12);

  const seg = [];
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y;
    const l = Math.hypot(dx, dy) || 1;
    seg.push({ x: -dy / l, y: dx / l });               // left-hand unit normal
  }

  const nAt = (i) => {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
    const mx = a.x + b.x, my = a.y + b.y;
    const l = Math.hypot(mx, my);
    if (l < 1e-6) return { x: b.x, y: b.y };           // a full reversal; take one side
    const scale = Math.min(3, 2 / l);                  // 2/|m| is the exact mitre; 3 caps the spike
    return { x: (mx / l) * (l / 2) * scale, y: (my / l) * (l / 2) * scale };
  };

  const left = [], right = [];
  for (let i = 0; i < P.length; i++) {
    const n = nAt(i);
    left.push({ x: P[i].x + n.x * r, y: P[i].y + n.y * r });
    right.push({ x: P[i].x - n.x * r, y: P[i].y - n.y * r });
  }

  // Round both ends, so a stroke terminates in a pen shape and not a chisel.
  const end = P[P.length - 1], endN = seg[seg.length - 1];
  const start = P[0], startN = seg[0];
  const capEnd = arcPoints(end, r, Math.atan2(endN.y, endN.x), Math.atan2(endN.y, endN.x) - Math.PI, 6);
  const capStart = arcPoints(start, r, Math.atan2(-startN.y, -startN.x), Math.atan2(-startN.y, -startN.x) - Math.PI, 6);
  return [...left, ...capEnd, ...right.reverse(), ...capStart];
}

function arcPoints(c, r, a0, a1, n) {
  const pts = [];
  for (let i = 1; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

/* ── Where the line breaks go ────────────────────────────────────────────────────────────────────
 *
 * An explicit '\n' always wins: the author typed it, and no balancing rule beats somebody deciding
 * that "Happy" belongs above "Birthday". `lines` is the fallback for the common case where they just
 * asked for two rows and expect it to look right.
 *
 * Balanced by the WIDEST row, not by even word counts. A topper is sized to the cake by its widest
 * row, so minimising that maximum is the same thing as making the letters as big as they can be —
 * which is the entire reason for stacking. Splitting "Happy 1st Birthday" evenly by words gives
 * "Happy 1st" / "Birthday"; by width it gives "Happy" / "1st Birthday", and the second sets larger.
 *
 * Breaks only at spaces. A hyphenated word is one word; a topper that breaks a name in half is worse
 * than a topper with small letters.
 */
function splitRows(font, clean, lines) {
  if (clean.includes('\n')) return clean.split('\n').filter(Boolean);
  const words = clean.split(' ').filter(Boolean);
  const n = Math.max(1, Math.min(Math.round(lines) || 1, words.length));
  if (n === 1) return [words.join(' ')];

  const wordW = words.map(w => advanceOf(font, w));
  const spaceW = advanceOf(font, ' ');
  const m = words.length;
  const seg = (i, j) => {
    let w = 0;
    for (let k = i; k < j; k++) w += wordW[k] + (k > i ? spaceW : 0);
    return w;
  };

  // best(l, i): the narrowest possible WIDEST row, setting words[i..] in l rows.
  const memo = new Map();
  const best = (l, i) => {
    if (l === 1) return seg(i, m);
    const key = `${l}:${i}`;
    if (memo.has(key)) return memo.get(key);
    let v = Infinity;
    for (let j = i + 1; j <= m - (l - 1); j++) v = Math.min(v, Math.max(seg(i, j), best(l - 1, j)));
    memo.set(key, v);
    return v;
  };

  const out = [];
  let i = 0;
  for (let l = n; l > 1; l--) {
    const target = best(l, i);
    let j = i + 1;
    while (j < m - (l - 2) && Math.max(seg(i, j), best(l - 1, j)) > target + 1e-9) j++;
    out.push(words.slice(i, j).join(' '));
    i = j;
  }
  out.push(words.slice(i).join(' '));
  return out;
}

/* How wide a string sets, WITHOUT building its outlines.
 *
 * The balancer tries every break position, and generating shapes for each candidate would be dozens
 * of outline builds to answer a question the font already knows: `ha` is the advance width three.js
 * itself sums when it lays the text out. Same number, no geometry. */
function advanceOf(font, str) {
  if (isCentreline(font)) {
    const em = font.em || 1000;
    let w = 0;
    for (const ch of String(str)) w += (glyphOf(font, ch)?.a ?? font.space ?? em * 0.3) / em;
    return w;
  }
  const d = font?.data;
  if (!d?.glyphs) return String(str).length;          // a font we cannot measure: fall back to count
  const s = 1 / (d.resolution || 1000);
  let w = 0;
  for (const ch of String(str)) {
    const g = d.glyphs[ch] ?? d.glyphs['?'];
    if (g) w += (g.ha ?? 0) * s;
  }
  return w;
}

// The box around a set of outlines, in whatever units they are already in. Deferred to `bbox`
// rather than walking the points again — the second copy of that walk is what check:dup caught, and
// it was mine.
const boundsOf = (outlines) => bbox(outlines.flatMap(g => g.outer));

/* ── How many separate bits of acrylic is this? ──────────────────────────────────────────────────
 *
 * 1 is a topper. Anything more is that many objects in a bag, and the customer finds out after it
 * is cut. Two rings belong together when their outlines cross OR one sits inside the other, walked
 * as connected components.
 *
 * Cheap by construction: an axis-aligned box test rejects almost every pair before any segment
 * maths runs, because letters only ever touch their neighbours.
 */
export function pieceCount(parts) {
  return components(parts).length;
}

/* The same walk, but returning WHICH parts group together — because a count on its own does not
 * help anybody fix it.
 *
 * "2 pieces" on a finished-looking word sends an author hunting. "The dot on the i is loose" is the
 * whole answer, and it is the most common one: a tittle is its own contour and touches nothing, so
 * every i and j in a block font floats. The studio paints these red rather than printing a number.
 *
 * Returns arrays of indices into `parts`, largest group first, so [0] is the body of the topper and
 * anything after it is what would arrive loose in the bag.
 */
export function components(parts) {
  const n = parts.length;
  if (n === 0) return [];
  if (n === 1) return [[0]];
  const boxes = parts.map(p => bbox(p.outer));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!boxOverlap(boxes[i], boxes[j])) continue;
      if (ringsTouch(parts[i].outer, parts[j].outer)) join(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/* ── Joining up what floats ──────────────────────────────────────────────────────────────────────
 *
 * The dot on an i is its own contour and touches nothing, so every i and j comes back loose. That
 * is not a font to avoid — it is most fonts — and rejecting them would leave the feature usable
 * only with scripts nobody has sourced yet.
 *
 * ⚠️ ALONG THE SHORTEST PATH TO THE BODY, not straight down.
 *
 * Dropping a stem downward is right for a tittle and wrong for everything else, and the difference
 * is not subtle: in "Happy Birthday" set in Great Vibes, one stray letter's nearest neighbour is
 * 1.35mm to the SIDE of it. Falling vertically, the stem missed that neighbour entirely and ran on
 * down until it hit the row below — a bar ruled through the whole design to reach material that was
 * never the closest thing to it.
 *
 * So the join is the shortest segment between the stray and the rest, whichever way it points. A
 * tittle's nearest material is the stem directly beneath it, so that case is unchanged and still
 * looks like the sliver a cut topper has; a letter beside its neighbour gets a tab a millimetre
 * long that nobody will find.
 *
 * ⚠️ It changes the letterform, slightly and visibly, and that is the honest cost. `width` is the
 * lever: thin enough to read as a join, thick enough to survive being cut and handled. Anything
 * under about a millimetre of real acrylic snaps, which is why this is a fraction of the topper's
 * height rather than a fixed number — the object gets scaled on the way to the cake.
 *
 * Nothing is bridged when the parts are already one piece.
 */
export function bridgeLoose(parts, { width = 0.02 } = {}) {
  const groups = components(parts);
  if (groups.length <= 1) return [];

  const main = groups[0];
  const bridges = [];
  for (const g of groups.slice(1)) {
    const link = nearestLink(parts, g, main);
    if (!link) continue;
    bridges.push({ kind: 'bridge', outer: bar(link[0], link[1], width), holes: [] });
  }
  return bridges;
}

// The closest pair of points between one group and another, as [from, to].
function nearestLink(parts, from, to) {
  let best = Infinity, pair = null;
  for (const i of from) for (const j of to) {
    const bi = bbox(parts[i].outer), bj = bbox(parts[j].outer);
    // Boxes cannot be closer than their gap, so a box already further than the best pair is skipped
    // whole rather than point by point.
    const dx = Math.max(0, bi.x0 - bj.x1, bj.x0 - bi.x1);
    const dy = Math.max(0, bi.y0 - bj.y1, bj.y0 - bi.y1);
    if (Math.hypot(dx, dy) >= best) continue;
    for (const p of parts[i].outer) for (const q of parts[j].outer) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best) { best = d; pair = [p, q]; }
    }
  }
  return pair;
}

// A rectangle of `width` spanning p to q, run a little past both ends so it overlaps what it joins
// rather than meeting it edge to edge — the same reason the baseline bar bites up into the letters.
function bar(p, q, width) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy * (width / 2), ny = ux * (width / 2);
  const over = width * 0.6;
  const a = { x: p.x - ux * over, y: p.y - uy * over };
  const b = { x: q.x + ux * over, y: q.y + uy * over };
  return [
    { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
  ];
}


// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function bbox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
// A hair of slack, so two outlines that meet exactly on a shared tangent — which is what a joined
// script does — count as touching rather than falling to floating-point luck.
const EPS = 1e-6;
const boxOverlap = (a, b) => a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS;

function segCross(p, p2, q, q2) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(q, q2, p), d2 = d(q, q2, p2), d3 = d(p, p2, q), d4 = d(p, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function pointInRing(ring, pt) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function ringsTouch(a, b) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segCross(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  // No crossing still leaves containment — an 'i' dot fully inside a swash, or a leg swallowed by a
  // thick bar. One point each way settles it.
  return pointInRing(a, b[0]) || pointInRing(b, a[0]);
}

/* Fatten (or thin, for a hole) a closed ring by pushing each point along the average of its two
 * edge normals. Not a true offset — it will not survive a large weight on a tight curve — and
 * deliberately so: this exists to close hairline gaps between letters, which is a small nudge. The
 * connectivity count is what says whether the nudge was enough, so an approximation that is
 * MEASURED beats an exact one that is trusted. */
/* Push a ring outward by `d` — outward meaning AWAY FROM ITS OWN INTERIOR, whichever way it winds.
 *
 * ⚠️ The normal here is the right-hand one relative to the direction of travel, which points out of
 * a counter-clockwise ring and INTO a clockwise one. Helvetiker winds every contour the same way, so
 * the block-font tests never saw it; Great Vibes does not, and the result was letters that shrank
 * when asked to thicken. Weight then read as doing nothing while quietly making the piece count
 * worse — the one control offered as the remedy for a hairline, breaking the thing it was for.
 *
 * The signed area says which way the ring winds, so the sign is corrected rather than assumed. */
/* The same parts, grown outward by `d` — the BACKING of a layered card cutout.
 *
 * A paper topper is two cuts of the same word: the colour on top, and a second sheet cut slightly
 * larger behind it, so a band of the second colour follows the letterforms all the way round. The
 * "10" and the "Emily" on a printed cake topper are both this.
 *
 * ⚠️ Holes go the OTHER WAY. The outer contour grows so the backing shows around the outside; a
 * counter — the hole in a 0, an e, an a — has to SHRINK by the same amount, or the backing stops at
 * the face's own hole and the band vanishes exactly where the eye looks for it. Growing everything
 * uniformly is the mistake that makes a cutout look printed rather than layered.
 *
 * Derived from the face's own contours rather than by re-cutting the word at a heavier weight: a
 * second `topperShapes` call is re-fitted and re-scaled to the same height, so its strokes land
 * slightly differently and the band comes out uneven. Offsetting the parts we already have keeps
 * the two layers exactly concentric.
 */
/* ── A PLATE behind the word, rather than a band around it ───────────────────────────────────────
 *
 * The other kind of card topper: the word sits on a solid SHAPE — a disc, a rounded rectangle, a
 * heart — instead of on a second cut of itself. A "4" in yellow on an orange circle is this, and it
 * is a different object from an offset, not a bigger one.
 *
 * ⚠️ THE SHAPES ARE THE CAKE'S OWN. `outlineOf` and the perimeter samplers already answer "what
 * closed outline is this shape", and shapes.js exists precisely so a new one is DATA rather than a
 * branch. A topper drawing its own heart would be a second heart in the codebase, free to drift from
 * the heart cake, and a shape authored into `cake_shapes` later would never reach it.
 *
 * ⚠️ FITTED BY SEARCH, not by a formula, because a heart is not convex. A disc holds a word if its
 * radius clears the corner; a heart of the same bounding box does not — the word's top corners fall
 * outside the lobes and its bottom corners outside the point. So the plate is grown until all four
 * corners of the padded box are genuinely INSIDE the outline. A formula per family would be four
 * formulas, three of them wrong the first time a shape is added.
 *
 * `pad` is in the same units as the parts. Returns ONE part, so the plate composes with everything
 * that already takes a parts list.
 */
/* Does this family take the PROPORTION of what it is fitted around, or force itself square?
 *
 * ⚠️ ONE PLACE ANSWERS THIS. The rule lives inside `backingPlate` (see the note there — a stretched
 * circle is an ellipse and a stretched heart is a squashed cartoon), and a studio offering a "how
 * wide" control needs the same answer: on a circle that control would do nothing at all, and a
 * control that cannot act is one the reader has to rule out before finding the one that can
 * (INVARIANTS #12). Restating it in the UI is how the two would come to disagree. */

/* ── The shapes a topper can be cut in ───────────────────────────────────────────────────────────
 *
 * ⚠️ A TABLE, NOT A LADDER OF `if (family === …)`. It was a ladder, which was fine for three
 * families and is the thing rule 2 names: a second variant of an existing thing is a ROW, never
 * another branch. Adding the ring and the gem to a ladder would have meant touching the outline
 * branch, the `followsBox` rule and the heart's bias correction in three separate places, and
 * missing one of the three is silent — the shape simply comes out wrong in one of its uses.
 *
 * Each row is an outline in [-1,1]^2 and, optionally:
 *
 *   `followsBox`  take the PROPORTION of what it is fitted around rather than forcing itself square
 *   `biasY`       shift the plate relative to the word, as a fraction of its half-height
 *   `hole`        cut a concentric copy of the outline out of the middle, at this fraction of it
 */
const disc = (segments) => Array.from({ length: segments }, (_, i) => {
  const a = (i / segments) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
});

/* A box with rounded corners. The radius is a fraction of the half-extent so a wide plate and a tall
   one round by the same visual amount. */
const roundedBox = (segments) => {
  const r = 0.22, k = 1 - r;
  const arc = Math.max(4, Math.round(segments / 8));
  const out = [];
  /* Four quarter-arcs, each about its OWN corner centre and each starting where the last ended,
   * walked anticlockwise from the top-right. The first attempt mirrored the arc with a sign on
   * cos/sin as well as placing the centre, which reflected two of the corners back across their
   * own centres and tore a notch out of the left edge. */
  for (const [ccx, ccy, a0] of [[k, k, 0], [-k, k, Math.PI / 2], [-k, -k, Math.PI], [k, -k, 1.5 * Math.PI]]) {
    for (let i = 0; i <= arc; i++) {
      const a = a0 + (i / arc) * (Math.PI / 2);
      out.push({ x: ccx + r * Math.cos(a), y: ccy + r * Math.sin(a) });
    }
  }
  return out;
};

/* ⚠️ y = -z, NOT z. A cake's outline lives in (x, z) where +Z is the FRONT, and a heart cake's point
 * faces front — so mapping z straight onto y stands the heart on its head, lobes down and point in
 * the air. It renders perfectly and is obviously wrong the moment you look at it. */
const heartUnit = () => {
  const o = outlineOf('heart', {});
  return o ? o.map(q => ({ x: q.x, y: -q.z })) : null;
};

/* A brilliant cut seen face on: a flat table across the top, shoulders out to the girdle, and the
 * pavilion tapering to a point.
 *
 * ⚠️ NO FACET LINES. On a real acrylic topper the facets are CUT THROUGH — you see the cake through
 * them — and as card they would be slivers a blade cannot hold and a baker cannot lift off the mat.
 * The silhouette alone reads as a gem at the size this is met at; drawn facets would also be the one
 * thing on a topper that is a picture of a material rather than a piece of one.
 *
 * Anticlockwise from the table's right corner, matching the disc, so every family winds one way. */
const gemUnit = () => ([
  /* ⚠️ A NARROW TABLE AND A HIGH GIRDLE, or it is a hexagon. The first cut had the table at ±0.42
     and the girdle at 0.34, which gives a short crown slope and a long even taper — six sides of
     roughly equal length, which the eye reads as a hexagon rather than a stone. A brilliant's crown
     is about a third of its depth and its pavilion the rest, and the table is much narrower than the
     girdle; those two facts are what make the silhouette recognisable at 30px in the rail. */
  { x: 0.30, y: 1.00 }, { x: -0.30, y: 1.00 },
  { x: -1.00, y: 0.45 }, { x: 0.00, y: -1.00 }, { x: 1.00, y: 0.45 },
]);

const TOPPER_SHAPES = Object.freeze({
  circle: { outline: disc },
  /* A rounded rectangle is exactly the shape that is SUPPOSED to follow what is written on it —
     see the note in `backingPlate`. It is the only one. */
  rect:   { outline: roundedBox, followsBox: true },
  heart:  { outline: heartUnit, biasY: -0.20 },
  /* ⚠️ THE FIRST FAMILY WITH A HOLE, and the reason `backingPlate` returned `holes: []` for so long
   * is that nothing needed one. A ring is a band: 0.78 leaves a rim about an eighth of the diameter
   * on each side, which is what a wedding band looks like — measured off a real one rather than
   * guessed, since the first try at 0.72 came out visibly chunkier than the reference. Thin enough
   * to read as a band at thumbnail size, thick enough to cut from card and lift off the mat. */
  ring:   { outline: disc, hole: 0.78 },
  gem:    { outline: gemUnit },
});

/* Does this family take the PROPORTION of what it is fitted around, or force itself square?
 *
 * ⚠️ ONE PLACE ANSWERS THIS. The rule is the table's (see the note in `backingPlate` — a stretched
 * circle is an ellipse and a stretched heart is a squashed cartoon), and a studio offering a "how
 * wide" control needs the same answer: on a circle that control would do nothing at all, and a
 * control that cannot act is one the reader has to rule out before finding the one that can
 * (INVARIANTS #12). Restating it in the UI is how the two would come to disagree. */
export const followsBox = (family) => TOPPER_SHAPES[family]?.followsBox === true;

/** Every shape a topper can be cut in, by key — so a studio's rail is the table, never a second list. */
export const TOPPER_SHAPE_KEYS = Object.freeze(Object.keys(TOPPER_SHAPES));

export function backingPlate(parts, { family = 'circle', pad = 0, segments = 96, minHalf = null } = {}) {
  if (!Array.isArray(parts) || !parts.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of parts) for (const q of p.outer) {
    if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
  }
  if (!(maxX > minX)) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let hw = (maxX - minX) / 2 + pad, hh = (maxY - minY) / 2 + pad;

  /* ⚠️ A CIRCLE STAYS CIRCULAR; ONLY THE RECTANGLE FOLLOWS THE WORD. Scaling every family to the
   * text's own box turns the disc behind a short wide name into an ELLIPSE — measured, "Emily" gave
   * 2.00 x 0.92 — which is not what anyone means by "on a circle". A heart is the same: it has a
   * proportion of its own and stretching it to a wide box gives a squashed cartoon. So those two
   * take the LARGER half-extent on both axes and sit the word inside; a rounded rectangle is exactly
   * the shape that is supposed to follow what is written on it. */
  if (!followsBox(family)) hw = hh = Math.max(hw, hh);



  /* ⚠️ A heart's usable middle is NOT its middle, and the correction runs the opposite way to the
   * obvious guess. Its widest span sits BELOW the centre — above that the cleft between the lobes
   * eats the middle — so a word centred on the outline's centre is sitting too high and the fit
   * search inflates the whole heart to catch its top corners. Lifting the plate relative to the word
   * (a POSITIVE bias) drops the word into the wide part. Measured on a "4": at bias 0 the heart came
   * out 3.68 wide, at -0.16 it grew to 3.98, and at +0.25 it fell to 3.41. Guessing the sign here
   * cost a render, and the sign flipped again when the heart was turned the right way up. */
  const spec = TOPPER_SHAPES[family] ?? TOPPER_SHAPES.circle;
  const biasY = (spec.biasY ?? 0) * hh;

  // An outline in [-1,1]^2, in this file's (x, y) rather than the cake's (x, z).
  const unit = spec.outline(segments);
  if (!unit?.length) return null;

  const at = (m) => unit.map(q => ({ x: cx + q.x * hw * m, y: cy + biasY + q.y * hh * m }));
  const corners = (m) => {
    const ring = at(m).map(q => ({ x: q.x, z: q.y }));
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      .every(([dx, dy]) => pointInPolygon(ring, cx + dx, cy + dy));
  };

  /* Grow until it holds, then stop. Capped: a shape that cannot hold a very wide word at any
   * sensible size should give up rather than return a plate the size of the room — the caller shows
   * what it got and the baker picks a different shape or a shorter word. */
  let m = 1;
  for (let i = 0; i < 40 && !corners(m); i++) m *= 1.08;

  /* ⚠️ A FLOOR ON THE FINISHED SIZE, for a PAIR — applied to the SETTLED multiplier, not to the
   * starting half-extents. Two hearts on a couple's cake are the same size: "Jo" and "Alexandra" get
   * two matching hearts with a short name in one, not a small heart and a big one. So the caller
   * fits each plate, takes the larger `half`, and asks again with it as the floor.
   *
   * Applying it before the search instead fed a post-search size back into a pre-search input and
   * grew every plate by the fit factor a second time — two matched hearts, both twice the size they
   * should have been. */
  if (minHalf) m = Math.max(m, (minHalf.w ?? 0) / hw, (minHalf.h ?? 0) / hh);
  // The half-extents it actually settled on, so a caller sizing a PAIR can ask for both again with
  // the larger of the two as a floor.
  /* ⚠️ THE HOLE IS WOUND THE OTHER WAY. A hole that winds with its outer is not reliably a hole:
     `ExtrudeGeometry` triangulates by winding, and even-odd fills — which the print sheet and the
     cutting file both use — are the forgiving case rather than the rule. Reversing it here means
     every consumer gets a ring rather than each having to know. */
  const holes = spec.hole > 0 ? [at(m * spec.hole).slice().reverse()] : [];
  return { kind: 'plate', outer: at(m), holes, half: { w: hw * m, h: hh * m } };
}



export function offsetParts(parts, d) {
  if (!Array.isArray(parts) || !(d > 0)) return parts ?? [];
  /* ⚠️ REDRAWN AT A DISTANCE, NOT MOVED OUTWARD. See offsetField.js: pushing each vertex along its
   * normal is right on a straight run and wrong at every corner, and at a REFLEX corner it is
   * unfixable without a boolean union — the offset edges cross and the crossing has to be removed.
   * Three attempts at patching that (a correct mitre, a mitre limit, arcs on convex corners) each
   * improved it and none fixed it; the "1"'s flag-to-stem corner kept a wedge hanging off it.
   *
   * `despike` and `chaikin` went with the old method: they existed to clean up after it, and a
   * distance contour has nothing to clean up. */
  return offsetByDistance(parts, d);
}

function offsetRing(ring, d) {
  if (!d) return ring;
  const n = ring.length;
  let twice = 0;
  for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; twice += p.x * q.y - q.x * p.y; }
  const sign = twice < 0 ? -1 : 1;
  d *= sign;
  return ring.map((p, i) => {
    const prev = ring[(i - 1 + n) % n], next = ring[(i + 1) % n];
    const n1 = norm(p.x - prev.x, p.y - prev.y), n2 = norm(next.x - p.x, next.y - p.y);
    const nx = (n1.y + n2.y) / 2, ny = -(n1.x + n2.x) / 2;
    const len = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / len) * d, y: p.y + (ny / len) * d };
  });
}


const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

/* Where the prongs go: spread across the word, but nudged to the nearest x that actually has
 * material at the bottom. A real topper's legs are under the letters, not under the gaps. */
function legAnchors(parts, count, width, inset) {
  const span = width * (1 - inset * 2);
  const x0 = -span / 2;
  const wanted = count === 1 ? [0] : Array.from({ length: count }, (_, i) => x0 + (span * i) / (count - 1));
  return wanted.map(x => nearestSolidX(parts, x, width));
}
function nearestSolidX(parts, x, width) {
  const step = width / 120;
  for (let k = 0; k < 60; k++) {
    for (const dx of (k === 0 ? [0] : [-k * step, k * step])) {
      if (lowestSolidAt(parts, x + dx, step) != null) return x + dx;
    }
  }
  return x;
}
// The lowest y at which this column has material, by testing the ring segments the column crosses.
function lowestSolidAt(parts, x, w) {
  let lowest = null;
  for (const p of parts) {
    const b = bbox(p.outer);
    if (x + w / 2 < b.x0 || x - w / 2 > b.x1) continue;
    for (let i = 0; i < p.outer.length; i++) {
      const a = p.outer[i], c = p.outer[(i + 1) % p.outer.length];
      if ((a.x <= x && c.x >= x) || (c.x <= x && a.x >= x)) {
        const t = (x - a.x) / ((c.x - a.x) || 1e-12);
        const y = a.y + (c.y - a.y) * t;
        if (lowest == null || y < lowest) lowest = y;
      }
    }
  }
  return lowest;
}
