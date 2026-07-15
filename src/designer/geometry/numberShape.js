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

// digits + a target world WIDTH → the glyph as THREE.Shape[] (holes attached), centred at the origin in
// the font's XY plane and scaled so the whole string is `worldW` wide with its ASPECT PRESERVED (a "1"
// stays narrow — never stretched to fill a square the way heart/polygon fill [-1,1]²). Also returns the
// resulting worldH and the outer contour in world {x,z} (font y → world −z, matching the render's
// rotateX(−90°)) for board sizing / hit-testing. Cached per (digits, worldW) — generateShapes is the
// only real cost and it never changes for the same inputs.
export function numberGeometry(digits, worldW = 2) {
  const text = cleanDigits(digits);
  const key = text + '@' + (+worldW).toFixed(3);
  const hit = cache.get(key);
  if (hit) return hit;

  const raw = FONT.generateShapes(text, 1);        // unit em
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const sh of raw) for (const p of sh.getPoints(CURVE_SEG)) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
  const scale = worldW / gw;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tx = p => new THREE.Vector2((p.x - cx) * scale, (p.y - cy) * scale);

  const shapes = raw.map(sh => {
    const s = new THREE.Shape(sh.getPoints(CURVE_SEG).map(tx));
    s.holes = (sh.holes ?? []).map(h => new THREE.Path(h.getPoints(CURVE_SEG).map(tx)));
    return s;
  });

  const worldH = gh * scale;
  // Outer contour(s) in world XZ for board sizing + top-decor. Single digit ⇒ one clean polygon;
  // multi-digit ⇒ concatenated per-glyph contours (fine for bounding-radius; precise per-glyph
  // point-in-polygon is a Phase-2 concern).
  const outline = shapes.flatMap(s => s.getPoints(CURVE_SEG).map(p => ({ x: p.x, z: -p.y })));
  const out = { shapes, worldW, worldH, halfW: worldW / 2, halfD: worldH / 2, outline };
  cache.set(key, out);
  return out;
}
