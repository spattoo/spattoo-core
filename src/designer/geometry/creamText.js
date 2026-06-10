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

// Lay a (possibly multi-line) string out in a single-line font → centerline polylines
// (Vector3, z=0) in the font's own units (y-up). Lines split on '\n'; each line is centred
// on x=0 and stacked top-to-bottom, `lineGap` em units apart. Missing lowercase falls back
// to uppercase so every name renders.
function strokesFromText(fontKey, text, lineGap = 1.4, letterSpacing = 0) {
  const font = creamFonts[fontKey] || creamFonts[DEFAULT_CREAM_FONT];
  if (!font || !text) return [];
  const lines = String(text).split('\n');
  const lineH = font.em * lineGap;
  // Extra gap inserted after every character (in font units, scaled to the em) so the
  // control reads the same across faces of different native sizes. 0 = native spacing.
  const track = (letterSpacing || 0) * font.em;
  const out = [];
  lines.forEach((line, li) => {
    const lineStrokes = [];
    let penX = 0;
    for (const ch of line) {
      if (ch === ' ') { penX += font.space + track; continue; }
      const g = font.glyphs[ch] || font.glyphs[ch.toUpperCase()] || font.glyphs[ch.toLowerCase()];
      if (!g) { penX += font.space + track; continue; }
      for (const s of g.s) lineStrokes.push(s.map(([x, y]) => new THREE.Vector3(x + penX, y, 0)));
      penX += g.a + track;
    }
    if (line.length) penX -= track;   // no trailing gap, so the line stays centred
    // Centre this line on x=0, drop it to its row (line 0 sits highest).
    const halfW = penX / 2, yOff = -li * lineH;
    for (const s of lineStrokes) for (const p of s) { p.x -= halfW; p.y += yOff; }
    out.push(...lineStrokes);
  });
  return out;
}

// Bend the (centred) writing along a circular arc, in place. `amount` ∈ [-1, 1]: 0 = straight,
// +ve curves the ends upward (rainbow), -ve downward. Each point's x maps to an angle and its
// y to a radial offset, so letters rotate tangentially and multi-line rows nest as concentric arcs.
function warpArc(strokes, amount) {
  const k = Math.max(-1, Math.min(1, amount || 0));
  if (Math.abs(k) < 1e-3) return strokes;
  let minX = Infinity, maxX = -Infinity;
  for (const s of strokes) for (const p of s) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
  const W = maxX - minX;
  if (!(W > 0)) return strokes;
  const theta = Math.abs(k) * 2.2;        // total sweep at |k|=1 ≈ 126°
  const R = W / theta;                     // radius so arc length ≈ text width
  const sgn = Math.sign(k);
  for (const s of strokes) for (const p of s) {
    const ang = p.x / R, rr = R - sgn * p.y;
    p.x = rr * Math.sin(ang);
    p.y = sgn * (R - rr * Math.cos(ang));
  }
  return strokes;
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
// Wrap a centred, flat (XY) cream geometry around a vertical cylinder of `radius`, facing
// +Z outward: x → arc angle (centred on +Z), z (bead thickness) → radial offset, y stays
// vertical. Used for writing on the rounded SIDE of a cake. Mutates and returns geo.
export function wrapOnCylinder(geo, radius) {
  if (!(radius > 0)) return geo;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const theta = v.x / radius, r = radius + v.z;
    pos.setXYZ(i, r * Math.sin(theta), v.y, r * Math.cos(theta));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

export function buildCreamWriting({ text, font, thickness, maxW, maxH, lineGap, letterSpacing, curve, wrapRadius }) {
  const strokes = strokesFromText(font, text, lineGap, letterSpacing);
  warpArc(strokes, curve);
  fitStrokes(strokes, maxW, maxH);
  const geo = buildPipedFromStrokes(strokes, thickness);
  if (!geo) return null;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -b.min.z);
  // Wrap onto the cake side AFTER centring, so z=0 (the bead back) sits on the surface.
  if (wrapRadius > 0) wrapOnCylinder(geo, wrapRadius);
  geo.computeBoundingBox();
  return geo;
}

// SVG centerline path for a short sample, for previewing a cream font in the picker.
// Returns { d, width, height } in a y-DOWN space (ready to drop into an <svg viewBox>).
export function creamFontPreview(fontKey, sample) {
  const font = creamFonts[fontKey] || creamFonts[DEFAULT_CREAM_FONT];
  const strokes = strokesFromText(fontKey, sample || 'Abc', 1.4);
  if (!strokes.length) return { d: '', width: 1, height: 1 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const width = (maxX - minX) || 1, height = (maxY - minY) || 1;
  let d = '';
  for (const s of strokes) s.forEach((p, i) => {
    const x = (p.x - minX).toFixed(1), y = (maxY - p.y).toFixed(1);  // flip to y-down
    d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  });
  return { d, width, height };
}
