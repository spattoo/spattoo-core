// ── Glyph-cake footprint: a cake shaped like the typed characters ─────────────────────────────
// A "glyph cake" is the outline of one or more font glyphs, extruded to a tier. We DON'T pre-make a shape
// per number/word — a character is a RECIPE, not an asset: the customer types it and we pull the glyph
// outline (WITH its counters/holes) from the font the app already renders with — `helvetiker_bold`, the
// same face the age toppers and on-cake text use. So this introduces no new font asset, and glyph cakes
// read consistently with every other number/letter in the app.
//
// This ONE engine backs BOTH the `number` family (digits, max 4) and the `letter` family (A–Z, max 3):
// `Font.generateShapes()` is charset-agnostic — it hands back THREE.Shape[] with `.holes` populated for
// any string (so 0/4/6/8/9 AND A/B/D/O/P/Q/R get their counters for free) and lays a multi-glyph string
// out by advance width, so "21" or "MOM" merges into one footprint for free too. The two families differ
// ONLY in their charset, max length, per-count size defaults and label — see GLYPH_FAMILIES below.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';

const FONT = new FontLoader().parse(helvetikerBold);
const cache = new Map();

const CURVE_SEG = 10;                 // curve subdivisions — enough for a smooth 0/3/8/S at cake scale

// A charset sanitiser factory: strip anything outside `keep`, optionally uppercase, cap at `max`, and
// fall back to `fallback` when empty (so a fresh glyph cake always renders something). Used to build both
// `cleanDigits` (0-9, max 4, '1') and `cleanLetters` (A-Z uppercased, max 3, 'A'). The UI input does its
// OWN charset strip WITHOUT the fallback (an empty box must stay empty while typing) — the fallback only
// applies at resolve/render time here.
export function makeCleaner(keep, max, fallback, upper = false) {
  return (v) => {
    let s = String(v ?? '').replace(keep, '');
    if (upper) s = s.toUpperCase();
    return s.slice(0, max) || fallback;
  };
}

// ── Per-character-count sizing ─────────────────────────────────────────────────────────────────────
// A glyph cake is authored PER CHARACTER COUNT, because a single big "A" and a three-letter "MOM" (or a
// "5" vs a "2027") want different proportions — one config stretched to fit every string is exactly what
// made the height vary by string. So the size (`height` = how tall the glyphs stand) and `thickness` (the
// extrusion depth) are chosen by the customer's character count. Within a count every string renders
// identically (glyphGeometry sizes by height); across counts the admin authors each independently in the
// Cake Shape Studio. `config` is the tier's shapeConfig (carries `byCount`); falls back to `defaults`.
export function glyphSizeForCount(config, n, counts, defaults) {
  const lo = counts[0], hi = counts[counts.length - 1];
  const count = Math.max(lo, Math.min(hi, n || lo));
  const c = config?.byCount?.[count];
  const d = defaults[count];
  // `pipingScale` is PER COUNT too: a wide multi-glyph string wants smaller rosettes than a lone glyph, so
  // it rides alongside height/thickness in byCount (default 1). It scales the piping-shell reference in
  // the descriptor (shellRadius = glyph half-height × pipingScale).
  return { height: +c?.height || d.height, thickness: +c?.thickness || d.thickness, pipingScale: +c?.pipingScale || 1 };
}

// ── Stroke reshaping: weight (thicker glyph) + corner rounding ──────────────────────────────────
// Both act on the glyph's CONTOURS, independent of the tier's size (which scales the whole footprint).
const signedArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; };
const toCCW = p => (signedArea(p) < 0 ? p.slice().reverse() : p);
// Same, for world {x,z} points — CCW so polygonPerimeter's edge normals point OUTWARD.
const ccwXZ = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.z - q.x * p[i].z; } return a >= 0 ? p : p.slice().reverse(); };

// Offset a closed CCW contour: d>0 moves INWARD (shrinks), d<0 OUTWARD (grows). At each vertex the two
// adjacent offset edges either DIVERGE (leaving a gap) or CONVERGE (crossing). The right join differs:
//  • DIVERGE → BEVEL (emit the offset end of each edge, chamfering the corner). A miter here shoots a thin
//    triangle off a stroke terminal (the end of a "2"'s top curve, a "3"'s arms) as the offset grows —
//    those were the spikes, which is why terminals are beveled.
//  • CONVERGE → MITER (the single intersection of the two offset edges). Here the bevel's two points cross
//    PAST each other into an inward spike — that was the flag-notch artifact on a "1". The miter is the
//    clean fill.
// They converge exactly when `turn·d > 0`, where `turn` is the signed corner (>0 convex, <0 reflex for a
// CCW contour): a convex terminal only spikes when SHRINKING, a reflex notch only when GROWING.
function offsetContour(pts, d) {
  const n = pts.length;
  if (n < 3) return pts;
  const nrm = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    nrm.push({ x: dy / len, y: -dx / len });            // outward normal (CCW)
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], prev = nrm[(i - 1 + n) % n], next = nrm[i];
    const turn = prev.x * next.y - prev.y * next.x;      // >0 convex, <0 reflex
    const c = prev.x * next.x + prev.y * next.y;         // cos of the turn angle
    if (turn * d > 1e-9 && 1 + c > 0.2) {                // converging (and not a near-cusp) → miter
      const k = d / (1 + c);
      out.push({ x: p.x - k * (prev.x + next.x), y: p.y - k * (prev.y + next.y) });
    } else {                                             // diverging (or a cusp) → bevel, one point per edge
      out.push({ x: p.x - prev.x * d, y: p.y - prev.y * d });
      out.push({ x: p.x - next.x * d, y: p.y - next.y * d });
    }
  }
  return out;
}

// Split every edge into pieces no longer than `maxSeg`. Chaikin rounds a corner by a fraction of its
// ADJACENT EDGE lengths, so at a corner bounded by a LONG edge (a "1"'s stem where it meets the flag) it
// chops a huge chamfer that slants the whole stem into a diagonal. Pre-splitting caps every edge, so the
// cut is bounded to ~maxSeg everywhere instead of scaling with the stem's length. A straight run stays
// straight (Chaikin preserves collinear points); only real corners round, and by a bounded amount.
function densify(pts, maxSeg) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const k = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / maxSeg);
    for (let j = 1; j <= k; j++) out.push({ x: a.x + (b.x - a.x) * j / (k + 1), y: a.y + (b.y - a.y) * j / (k + 1) });
  }
  return out;
}

// Chaikin corner-cutting: each pass replaces every vertex with the 1/4 and 3/4 points of its two edges,
// rounding EVERY corner a little. `passes` is the roundness (0 = the font's sharp corners).
function chaikin(pts, passes) {
  let out = pts;
  for (let k = 0; k < passes; k++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out = next;
  }
  return out;
}

// `Font.getPoints()` closes a contour by REPEATING its first point. That duplicate is a zero-length edge,
// and offsetContour reads a 0/0 normal off it — which emits a spurious stair-step at that corner (the
// bottom-right of a "1", the "small piece removed"). Drop any point coincident with the next so every
// edge has a real direction. Also guards against font atlases that emit occasional duplicate knots.
const dropDuplicates = (p) => p.filter((q, i) => { const r = p[(i + 1) % p.length]; return Math.hypot(q.x - r.x, q.y - r.y) > 1e-6; });

// Weight thickens the STROKE (outer grows, counters shrink) so the glyph stays the same overall width but
// reads bolder; cornerR rounds the corners. All in em space so the look is consistent at any cake size.
function reshape(outer, holes, weight, cornerR) {
  // Clamped low on purpose: past ~0.05 em a glyph's strokes merge and close its gaps (a "2" or a "B" turns
  // to a blob). The studio slider tops out lower still; this is the safety rail.
  const w = Math.max(0, Math.min(0.06, +weight || 0));
  const passes = Math.round(Math.max(0, Math.min(1, +cornerR || 0)) * 2);   // 0..2 Chaikin passes
  let o = toCCW(dropDuplicates(outer)), hs = holes.map(h => toCCW(dropDuplicates(h)));
  if (w > 1e-4) { o = offsetContour(o, -w); hs = hs.map(h => offsetContour(h, w)); }   // grow outer, shrink counters
  // Round by a BOUNDED radius (∝ cornerR), not by edge length — so a long stem edge isn't halved.
  if (passes > 0) { const seg = 0.03 + (Math.min(1, +cornerR || 0)) * 0.05; o = chaikin(densify(o, seg), passes); hs = hs.map(h => chaikin(densify(h, seg), passes)); }
  return { outer: o, holes: hs };
}

// A CLEANED, non-empty glyph string + a target world HEIGHT → the glyphs as THREE.Shape[] (holes attached),
// centred at the origin in the font's XY plane and scaled so the whole string stands `targetH` tall with
// its ASPECT PRESERVED (a "1"/"I" stays narrow — never stretched to fill a square the way heart/polygon
// fill [-1,1]²). Also returns the resulting worldW and the outer contour in world {x,z} (font y → world
// −z, matching the render's rotateX(−90°)) for board sizing / hit-testing. Cached per (text, height,
// weight, cornerR) — generateShapes is the only real cost and it never changes for the same inputs.
// Sized by HEIGHT, not total width: every glyph is cap-height, so scaling the string so its Y extent =
// `targetH` makes EVERY string come out the same tall — a "1", a "21" and a "2027" (or "A"/"AB"/"ABC") all
// stand `targetH` high, and the footprint just grows WIDER as characters are added. `text` is expected
// already cleaned (via a makeCleaner) and non-empty; the family shims (numberGeometry/letterGeometry) do that.
export function glyphGeometry(text, targetH = 2, weight = 0, cornerR = 0) {
  const key = `${text}@h${(+targetH).toFixed(3)}:${(+weight).toFixed(3)}:${(+cornerR).toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const raw = FONT.generateShapes(text, 1);        // unit em
  // Reshape each glyph's contours (weight + rounding) in em space FIRST, then measure/scale — so a
  // thicker stroke doesn't change the glyph's overall width, only how bold it reads.
  const glyphs = raw.map(sh => reshape(
    sh.getPoints(CURVE_SEG).map(p => ({ x: p.x, y: p.y })),
    (sh.holes ?? []).map(h => h.getPoints(CURVE_SEG).map(p => ({ x: p.x, y: p.y }))),
    weight, cornerR,
  ));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphs) for (const p of g.outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
  const scale = targetH / gh;          // size by HEIGHT; the width follows from the character count
  const worldW = gw * scale;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tx = p => new THREE.Vector2((p.x - cx) * scale, (p.y - cy) * scale);

  const shapes = glyphs.map(g => {
    const s = new THREE.Shape(g.outer.map(tx));
    s.holes = g.holes.map(h => new THREE.Path(h.map(tx)));
    return s;
  });

  const worldH = targetH;              // by construction (scale = targetH / gh)
  // Outer contour(s) in world XZ for board sizing + rim/top decor, as a LIST OF RINGS (one per glyph) —
  // NOT one flat array. A multi-glyph string is several disjoint footprints ("10" = a "1" and a "0"; "AB"
  // = an "A" and a "B"); the generic polygon ops (asRings) walk each ring on its own, so piping traces
  // each glyph and never bridges a shell across the gap between them. Single glyph ⇒ a one-element list.
  // The `z = -y` flip reverses the glyph's CCW winding, but `polygonPerimeter` only yields OUTWARD normals
  // for a CCW-in-XZ polygon (what the rim shells ride) — so re-wind each glyph CCW.
  const outline = shapes.map(s => ccwXZ(s.getPoints(CURVE_SEG).map(p => ({ x: p.x, z: -p.y }))));
  // The COUNTERS (the holes of 8/0/A/…), same world XZ + CCW winding as the outline, so the piping
  // ring can border the inner edges too — a real number cake pipes every edge, not just the silhouette.
  const holes = shapes.flatMap(s => (s.holes ?? []).map(h => ccwXZ(h.getPoints(CURVE_SEG).map(p => ({ x: p.x, z: -p.y })))));

  // STROKE WIDTH — the honest local feature size (the pen thickness of the glyph), measured from the
  // geometry, not the whole-glyph height. For a stroke-like shape area ≈ width × (perimeter/2), so
  // width ≈ 2·area / perimeter; with counters, area is net (outer − holes) and perimeter is every edge.
  // This is what the piping shell scales to, so beads run ALONG a stroke instead of swamping it and
  // collapsing to its centreline (which rings the counters). Radius-independent (both terms scale with
  // the glyph), so it stays correct at any authored size — INVARIANTS #8.
  const areaXZ  = r => { let a = 0; for (let i = 0; i < r.length; i++) { const q = r[(i + 1) % r.length]; a += r[i].x * q.z - q.x * r[i].z; } return Math.abs(a) / 2; };
  const perimXZ = r => { let L = 0; for (let i = 0; i < r.length; i++) { const q = r[(i + 1) % r.length]; L += Math.hypot(q.x - r[i].x, q.z - r[i].z); } return L; };
  const netArea  = outline.reduce((s, r) => s + areaXZ(r), 0) - holes.reduce((s, r) => s + areaXZ(r), 0);
  const totPerim = [...outline, ...holes].reduce((s, r) => s + perimXZ(r), 0);
  const strokeW  = totPerim > 0 ? (2 * netArea) / totPerim : worldH;

  const out = { shapes, worldW, worldH, halfW: worldW / 2, halfD: worldH / 2, outline, holes, strokeW };
  cache.set(key, out);
  return out;
}

// ── The two glyph families ─────────────────────────────────────────────────────────────────────────
// number = digits (0-9), up to 4; letter = A–Z (uppercased), up to 3. The ONLY differences between the
// two are gathered here — charset, max, fallback, count set and per-count size defaults — so a new glyph
// family (or a wider limit) is a config entry, never another copy of the engine above.
export const cleanDigits  = makeCleaner(/[^0-9]/g, 4, '1');
export const cleanLetters = makeCleaner(/[^A-Za-z]/g, 3, 'A', true);

export const NUMBER_COUNTS = [1, 2, 3, 4];
export const LETTER_COUNTS = [1, 2, 3];

// Fallback sizing when a starter hasn't authored `byCount` yet (or a single count is missing) — so a
// legacy/unauthored glyph tier still renders. Wider counts default a touch shorter so a long string fits
// a sane board. Admin overwrites these per count in the Cake Shape Studio.
export const NUMBER_SIZE_DEFAULTS = {
  1: { height: 2.4, thickness: 0.7 },
  2: { height: 2.2, thickness: 0.7 },
  3: { height: 1.9, thickness: 0.7 },
  4: { height: 1.6, thickness: 0.7 },
};
export const LETTER_SIZE_DEFAULTS = {
  1: { height: 2.4, thickness: 0.7 },
  2: { height: 2.2, thickness: 0.7 },
  3: { height: 1.9, thickness: 0.7 },
};

export const GLYPH_FAMILIES = {
  number: { textKey: 'digits',  clean: cleanDigits,  counts: NUMBER_COUNTS, defaults: NUMBER_SIZE_DEFAULTS },
  letter: { textKey: 'letters', clean: cleanLetters, counts: LETTER_COUNTS, defaults: LETTER_SIZE_DEFAULTS },
};
export const isGlyphFamily = f => f === 'number' || f === 'letter';

const cleanedTextOf = (fam, config) => fam.clean(config?.[fam.textKey]);

// The tierShape descriptor for a glyph tier (number or letter). ONE render-`kind: 'glyph'` for both, so
// every consumer (CakeTier extrude, CakeCanvas board, previewCake) needs a single branch, not one per
// family. `shellRadius` = the glyph half-height × per-count pipingScale (the piping ring's shell size
// reference — a number/letter's tier `radius` is its bounding radius = half the footprint WIDTH, huge for
// a long string, so shells would swamp thin strokes; the short-axis half-height is the honest reference).
export function glyphDescriptor(family, config) {
  const fam = GLYPH_FAMILIES[family];
  const text = cleanedTextOf(fam, config);
  const { height, thickness, pipingScale } = glyphSizeForCount(config, text.length, fam.counts, fam.defaults);
  const g = glyphGeometry(text, height, config?.weight, config?.cornerR);
  // The piping ring's shell scales to the STROKE WIDTH, not the glyph half-height. Sizing to the
  // half-height (~half a round cake) made a bead as deep as the stroke, so its seat-inset reached the
  // stroke centreline and the border ringed the counters instead of hugging the outline. A bead ~the
  // stroke width sits ALONG the edge. PIPING_STROKE_MUL is the one dimensionless dial (INVARIANTS #8).
  return {
    kind: 'glyph', shapes: g.shapes, outline: g.outline, holes: g.holes,
    halfW: g.halfW, halfD: g.halfD, thickness, strokeW: g.strokeW,
    shellRadius: g.strokeW * PIPING_STROKE_MUL * pipingScale,
  };
}

// Bead size ≈ this × the glyph stroke width (fed as the ring's `radius`, off which the shell scale +
// seat-inset derive). Tuned so a shell border hugs the stroke edges without collapsing to the centre.
export const PIPING_STROKE_MUL = 1.4;

// The glyph tier's EFFECTIVE world box, for framing (camera + board) — NOT for the mesh, which the extrude
// builds from the shapes directly. A glyph lies flat and is extruded UP, so its footprint is the string's
// width×height (world X×Z) and its vertical extent is the extrusion `thickness` (world Y). Derived, never
// stored: it always follows `byCount` + the typed characters, so it can't go stale.
export function glyphTierDims(family, config) {
  const d = glyphDescriptor(family, config);
  return { width: d.halfW * 2, depth: d.halfD * 2, height: d.thickness };
}

// ── Back-compat, per-family named helpers ─────────────────────────────────────────────────────────
// The number-cake feature shipped with these exact names; keeping them (as thin wrappers over the generic
// engine) means index.js, the admin studio and existing call sites don't churn — numbers stay byte-for-byte.
export const numberDigitCount  = d => cleanDigits(d).length;
export const letterCount       = l => cleanLetters(l).length;
export const numberSizeForCount = (config, n) => glyphSizeForCount(config, n, NUMBER_COUNTS, NUMBER_SIZE_DEFAULTS);
export const letterSizeForCount = (config, n) => glyphSizeForCount(config, n, LETTER_COUNTS, LETTER_SIZE_DEFAULTS);
export const numberGeometry = (digits,  h, w, c) => glyphGeometry(cleanDigits(digits),   h, w, c);
export const letterGeometry = (letters, h, w, c) => glyphGeometry(cleanLetters(letters), h, w, c);
export const numberTierDims = config => glyphTierDims('number', config);
export const letterTierDims = config => glyphTierDims('letter', config);
