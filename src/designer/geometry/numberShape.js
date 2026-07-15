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

// ── Stroke reshaping: weight (thicker digit) + corner rounding ──────────────────────────────────
// Both act on the glyph's CONTOURS, independent of the tier's Width (which scales the whole footprint).
const signedArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; };
const toCCW = p => (signedArea(p) < 0 ? p.slice().reverse() : p);
// Same, for world {x,z} points — CCW so polygonPerimeter's edge normals point OUTWARD.
const ccwXZ = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.z - q.x * p[i].z; } return a >= 0 ? p : p.slice().reverse(); };

// Offset a closed CCW contour by a BEVEL join: d>0 moves INWARD (shrinks), d<0 OUTWARD (grows). Each
// vertex emits TWO points — the offset ends of its two adjacent edges — so a sharp corner is chamfered,
// NEVER mitered. A miter join (moving the single vertex along its bisector) shoots a thin triangle out of
// every stroke terminal (the end of a "2"'s top curve, a "3"'s arms) as the offset grows — those were the
// spikes. Beveling the corner cannot spike, and the tiny chamfer it leaves is smoothed by cornerR anyway.
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
    out.push({ x: p.x - prev.x * d, y: p.y - prev.y * d });   // end of the previous edge, offset
    out.push({ x: p.x - next.x * d, y: p.y - next.y * d });   // start of the next edge, offset
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

// Weight thickens the STROKE (outer grows, counters shrink) so the digit stays the same overall width but
// reads bolder; cornerR rounds the corners. All in em space so the look is consistent at any cake size.
function reshape(outer, holes, weight, cornerR) {
  // Clamped low on purpose: past ~0.05 em a digit's strokes merge and close its gaps (a "2" turns to a
  // blob). The studio slider tops out lower still; this is the safety rail.
  const w = Math.max(0, Math.min(0.06, +weight || 0));
  const passes = Math.round(Math.max(0, Math.min(1, +cornerR || 0)) * 2);   // 0..2 Chaikin passes
  let o = toCCW(outer), hs = holes.map(toCCW);
  if (w > 1e-4) { o = offsetContour(o, -w); hs = hs.map(h => offsetContour(h, w)); }   // grow outer, shrink counters
  if (passes > 0) { o = chaikin(o, passes); hs = hs.map(h => chaikin(h, passes)); }
  return { outer: o, holes: hs };
}

// digits + a target world WIDTH → the glyph as THREE.Shape[] (holes attached), centred at the origin in
// the font's XY plane and scaled so the whole string is `worldW` wide with its ASPECT PRESERVED (a "1"
// stays narrow — never stretched to fill a square the way heart/polygon fill [-1,1]²). Also returns the
// resulting worldH and the outer contour in world {x,z} (font y → world −z, matching the render's
// rotateX(−90°)) for board sizing / hit-testing. Cached per (digits, worldW) — generateShapes is the
// only real cost and it never changes for the same inputs.
export function numberGeometry(digits, worldW = 2, weight = 0, cornerR = 0) {
  const text = cleanDigits(digits);
  const key = `${text}@${(+worldW).toFixed(3)}:${(+weight).toFixed(3)}:${(+cornerR).toFixed(3)}`;
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
  const scale = worldW / gw;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tx = p => new THREE.Vector2((p.x - cx) * scale, (p.y - cy) * scale);

  const shapes = glyphs.map(g => {
    const s = new THREE.Shape(g.outer.map(tx));
    s.holes = g.holes.map(h => new THREE.Path(h.map(tx)));
    return s;
  });

  const worldH = gh * scale;
  // Outer contour(s) in world XZ for board sizing + rim/top decor. The `z = -y` flip reverses the glyph's
  // CCW winding, but `polygonPerimeter` only yields OUTWARD normals for a CCW-in-XZ polygon (what the rim
  // shells ride) — so re-wind each glyph CCW. Single digit ⇒ one clean polygon; multi-digit ⇒ concatenated
  // per-glyph contours (fine for bounding-radius; a single perimeter walk is a Phase-2 concern).
  const outline = shapes.flatMap(s => ccwXZ(s.getPoints(CURVE_SEG).map(p => ({ x: p.x, z: -p.y }))));
  const out = { shapes, worldW, worldH, halfW: worldW / 2, halfD: worldH / 2, outline };
  cache.set(key, out);
  return out;
}
