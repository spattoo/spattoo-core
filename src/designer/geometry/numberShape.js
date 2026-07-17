// ── Number-cake footprint: a cake shaped like the typed digits ───────────────────────────────
// A "number cake" is the outline of a font glyph, extruded to a tier. We DON'T pre-make a shape per
// number — a digit is a RECIPE, not an asset: the customer types it and we pull the glyph outline
// (WITH its counters/holes) from the font the app already renders numbers with — `helvetiker_bold`, the
// same face the age toppers and on-cake text use (canvas/AgeNumber.jsx, canvas/CakeCanvas.jsx). So this
// introduces no new font asset, and number cakes read consistently with every other number in the app.
//
// `Font.generateShapes()` hands back THREE.Shape[] with `.holes` populated, which ExtrudeGeometry honours
// natively — so 0/4/6/8/9 get their counters for free — and it lays a multi-digit string out by advance
// width, so "21" merges into one footprint for free too.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';

const FONT = new FontLoader().parse(helvetikerBold);
const cache = new Map();

const MAX_DIGITS = 4;                 // V1 guard; the font layout already merges more than this
const CURVE_SEG = 10;                 // curve subdivisions — enough for a smooth 0/3/8 at cake scale

// Digits only; empty falls back to "1" so a fresh number cake always renders something.
export const cleanDigits = d => (String(d ?? '').replace(/[^0-9]/g, '').slice(0, MAX_DIGITS) || '1');

// ── Per-digit-count sizing ───────────────────────────────────────────────────────────────────────
// A number cake is authored PER DIGIT COUNT (1/2/3/4), because a single big "5" and a four-digit "2027"
// want different proportions — one config stretched to fit every number is exactly what made the height
// vary by number. So the size (`height` = how tall the digits stand) and `thickness` (the extrusion depth)
// are chosen by the customer's digit count. Within a count every number renders identically (numberGeometry
// sizes by height); across counts the admin authors each independently in the Cake Shape Studio.
export const NUMBER_COUNTS = [1, 2, 3, 4];
export const numberDigitCount = (digits) => cleanDigits(digits).length;   // 1..4

// Fallback sizing when a starter hasn't authored `byCount` yet (or a single count is missing) — so a
// legacy number tier still renders. Wider counts default a touch shorter so a "2027" fits a sane board.
export const NUMBER_SIZE_DEFAULTS = {
  1: { height: 2.4, thickness: 0.7 },
  2: { height: 2.2, thickness: 0.7 },
  3: { height: 1.9, thickness: 0.7 },
  4: { height: 1.6, thickness: 0.7 },
};

// The ONE seam the whole model hangs on: the { height, thickness } a number renders at, for a digit count.
// `config` is the tier's shapeConfig (carries `byCount`); falls back to the defaults per count.
export function numberSizeForCount(config, n) {
  const count = Math.max(1, Math.min(4, n || 1));
  const c = config?.byCount?.[count];
  const d = NUMBER_SIZE_DEFAULTS[count];
  return { height: +c?.height || d.height, thickness: +c?.thickness || d.thickness };
}

// The number tier's EFFECTIVE world box, for framing (camera + board) — NOT for the mesh, which the
// extrude builds from the shapes directly. A number lies flat and is extruded UP, so its footprint is the
// glyph's width×height (world X×Z) and its vertical extent is the extrusion `thickness` (world Y). Derived,
// never stored: it always follows `byCount` + the typed digits, so it can't go stale. Cheap — numberGeometry
// is cached — so callers (shapeView) can call per render.
export function numberTierDims(config) {
  const { height: targetH, thickness } = numberSizeForCount(config, numberDigitCount(config?.digits));
  const g = numberGeometry(config?.digits, targetH, config?.weight, config?.cornerR);
  return { width: g.halfW * 2, depth: g.halfD * 2, height: thickness };
}

// ── Stroke reshaping: weight (thicker digit) + corner rounding ──────────────────────────────────
// Both act on the glyph's CONTOURS, independent of the tier's Width (which scales the whole footprint).
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

// Weight thickens the STROKE (outer grows, counters shrink) so the digit stays the same overall width but
// reads bolder; cornerR rounds the corners. All in em space so the look is consistent at any cake size.
function reshape(outer, holes, weight, cornerR) {
  // Clamped low on purpose: past ~0.05 em a digit's strokes merge and close its gaps (a "2" turns to a
  // blob). The studio slider tops out lower still; this is the safety rail.
  const w = Math.max(0, Math.min(0.06, +weight || 0));
  const passes = Math.round(Math.max(0, Math.min(1, +cornerR || 0)) * 2);   // 0..2 Chaikin passes
  let o = toCCW(dropDuplicates(outer)), hs = holes.map(h => toCCW(dropDuplicates(h)));
  if (w > 1e-4) { o = offsetContour(o, -w); hs = hs.map(h => offsetContour(h, w)); }   // grow outer, shrink counters
  // Round by a BOUNDED radius (∝ cornerR), not by edge length — so a long stem edge isn't halved.
  if (passes > 0) { const seg = 0.03 + (Math.min(1, +cornerR || 0)) * 0.05; o = chaikin(densify(o, seg), passes); hs = hs.map(h => chaikin(densify(h, seg), passes)); }
  return { outer: o, holes: hs };
}

// digits + a target world WIDTH → the glyph as THREE.Shape[] (holes attached), centred at the origin in
// the font's XY plane and scaled so the whole string is `worldW` wide with its ASPECT PRESERVED (a "1"
// stays narrow — never stretched to fill a square the way heart/polygon fill [-1,1]²). Also returns the
// resulting worldH and the outer contour in world {x,z} (font y → world −z, matching the render's
// rotateX(−90°)) for board sizing / hit-testing. Cached per (digits, worldW) — generateShapes is the
// only real cost and it never changes for the same inputs.
// Sized by the digit's HEIGHT, not its total width. Every glyph is cap-height, so scaling the whole
// string so its Y extent = `targetH` makes EVERY number come out the same tall — a "1", a "21" and a
// "2027" all stand `targetH` high, and the footprint just grows WIDER as digits are added. (Scaling by
// total width did the opposite: a narrow "1" ballooned and a wide "2027" shrank, so what admin authored
// for one number wasn't what a customer got for another — the calibration bug this fixes.)
export function numberGeometry(digits, targetH = 2, weight = 0, cornerR = 0) {
  const text = cleanDigits(digits);
  const key = `${text}@h${(+targetH).toFixed(3)}:${(+weight).toFixed(3)}:${(+cornerR).toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const raw = FONT.generateShapes(text, 1);        // unit em
  // Reshape each glyph's contours (weight + rounding) in em space FIRST, then measure/scale — so a
  // thicker stroke doesn't change the digit's overall width, only how bold it reads.
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
  const scale = targetH / gh;          // size by HEIGHT; the width follows from the digit count
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
  // NOT one flat array. A multi-digit number is several disjoint footprints ("10" = a "1" and a "0"); the
  // generic polygon ops (asRings) walk each ring on its own, so piping traces each digit and never bridges
  // a shell across the gap between them. Single digit ⇒ a one-element list (identical to the old single
  // polygon). The `z = -y` flip reverses the glyph's CCW winding, but `polygonPerimeter` only yields
  // OUTWARD normals for a CCW-in-XZ polygon (what the rim shells ride) — so re-wind each glyph CCW.
  const outline = shapes.map(s => ccwXZ(s.getPoints(CURVE_SEG).map(p => ({ x: p.x, z: -p.y }))));
  const out = { shapes, worldW, worldH, halfW: worldW / 2, halfD: worldH / 2, outline };
  cache.set(key, out);
  return out;
}
