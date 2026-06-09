import * as THREE from 'three';
import creamFonts from './creamFonts.json';

// ── Cream-pen writing geometry ────────────────────────────────────────────────
// Single-line (centerline) vector fonts — vendored public-domain EMS/Hershey faces,
// pre-flattened to polyline strokes per glyph: { name, em, space, glyphs:{ ch:{ a, s } } }
// in y-up font units. Sweeping a constant-radius tube along a centerline reads as a real
// piped cream rope (not a hollow outline). See spattoo-admin Cream Pen Studio for the source.

// Faces offered in the UI (label comes from the font data; order curated).
export const CREAM_FONTS = Object.keys(creamFonts).map(key => ({
  key, label: creamFonts[key].name, group: creamFonts[key].group,
}));
export const DEFAULT_CREAM_FONT = 'ems_allure';

// Lay a string out in a single-line font → centerline polylines (Vector3, z=0) in the
// font's own units (y-up). Missing lowercase falls back to uppercase so every name renders.
function strokesFromFont(fontKey, text) {
  const font = creamFonts[fontKey] || creamFonts[DEFAULT_CREAM_FONT];
  if (!font || !text) return [];
  const out = [];
  let penX = 0;
  for (const ch of text) {
    if (ch === ' ') { penX += font.space; continue; }
    const g = font.glyphs[ch] || font.glyphs[ch.toUpperCase()] || font.glyphs[ch.toLowerCase()];
    if (!g) { penX += font.space; continue; }
    for (const s of g.s) out.push(s.map(([x, y]) => new THREE.Vector3(x + penX, y, 0)));
    penX += g.a;
  }
  return out;
}

// Scale strokes (in place, about origin) so the writing fits within maxW × maxH world
// units — done on the CENTERLINES, before the sweep, so the bead thickness stays an
// absolute nozzle width independent of how big the name is.
function fitStrokes(strokes, maxW, maxH) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 0) && !(h > 0)) return strokes;
  const f = Math.min(w > 0 ? maxW / w : Infinity, h > 0 ? maxH / h : Infinity);
  if (Number.isFinite(f)) for (const s of strokes) for (const p of s) p.multiplyScalar(f);
  return strokes;
}

// Minimal merge of BufferGeometries (position/normal/uv) — avoids a hard dependency on
// three's BufferGeometryUtils so the lib build stays self-contained. Inputs are Tube/Sphere
// geometries (all have normal + uv); they're expanded to non-indexed and concatenated.
function mergeGeometries(geos) {
  const flat = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of flat) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let po = 0, uo = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array, po);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, po);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, uo);
    po += g.attributes.position.count * 3;
    uo += g.attributes.position.count * 2;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

// Sweep a constant-radius cream tube along each centerline stroke (the "pen bead").
// Round caps at both ends (and a bead for single-point dots) so strokes start/stop like
// real piping. `thickness` is the bead radius. Returns one merged geometry, or null.
function buildPipedFromStrokes(strokes, thickness) {
  if (!strokes.length) return null;
  const geos = [];
  const cap = pt => { const s = new THREE.SphereGeometry(thickness, 8, 6); s.translate(pt.x, pt.y, pt.z); geos.push(s); };
  for (const raw of strokes) {
    // Drop consecutive duplicate points — zero-length segments give TubeGeometry NaN frames.
    const pts = raw.filter((p, i) => i === 0 || p.distanceTo(raw[i - 1]) > 1e-4);
    if (pts.length === 1) { cap(pts[0]); continue; }
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    geos.push(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 4), thickness, 8, false));
    cap(pts[0]); cap(pts[pts.length - 1]);
  }
  return geos.length ? mergeGeometries(geos) : null;
}

// Build a centered cream-writing geometry for `text` in `font`, sized to fit within a
// maxW × maxH footprint (the cake-top extents), with bead `thickness`. The geometry is
// laid in the XY plane (centered on X/Y, sitting on z = 0) ready to be rotated flat onto
// the cake top by the caller. Returns null for empty text / no renderable glyphs.
export function buildCreamWriting({ text, font, thickness, maxW, maxH }) {
  const strokes = fitStrokes(strokesFromFont(font, text), maxW, maxH);
  const geo = buildPipedFromStrokes(strokes, thickness);
  if (!geo) return null;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -b.min.z);
  geo.computeBoundingBox();
  return geo;
}
