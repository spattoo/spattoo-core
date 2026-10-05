import * as THREE from 'three';
import { brushStroke } from './brushStroke.js';

// ── A brushstroke PAINTED ON the cake ────────────────────────────────────────────────────────────
//
// The reference cakes: a handful of broad buttercream strokes swept across the side, each its own
// colour, some standing proud with a ridge you could catch a fingernail on and some barely there.
//
// ⚠️ THIS IS NOT THE CHOCOLATE BRUSHSTROKE, AND IT IS NOT THE PALETTE-KNIFE FINISH. Both already
// exist and neither answers this:
//   · `brushStroke.js` makes the same GESTURE, but as a flat piece set on acetate, peeled off and
//     STOOD on the cake. Its outline is exactly right and is reused here — the shape of a smear does
//     not change because of what it is lying on.
//   · `PaletteKnifeStudio` paints strokes into a seamless TILE and wraps the whole wall in it as a
//     finish. That is the right answer for an all-over impasto and the wrong one here, because a
//     tile cannot give one stroke its own colour or its own weight — which is most of the ask.
//
// So: the gesture comes from `brushStroke`, and this file seats it on a surface and gives it RELIEF.
//
// ⚠️ WEIGHT IS THE WHOLE CONTROL. Sandeep: *"if its a thick stroke edges have elevation, if its a
// lighter stroke, it just merges with the cake surface without elevation."* That is one number, not
// two looks: a loaded knife leaves a ridge at each edge and a scraped hollow between them, and the
// same knife wiped nearly dry leaves a stain. `weight` moves continuously between them, and at 0 the
// stroke lies a hair off the wall — present, coloured, and with nothing to catch the light.
//
// ⚠️ RAISED EDGES, SCRAPED MIDDLE — not a dome. A spatula pushes cream out to its two edges and
// leaves the middle thinnest; a rounded hump is what a piping bag makes, and reading one for the
// other is what made our first palette-knife petals look piped.
//
// Everything is × the tier radius, never a world constant (INVARIANTS #8), so one authored stroke
// suits a 6" and a 10" untouched.

export const BRUSH_ON_CAKE_DEFAULTS = {
  width:  0.30,   // × R: how broad the stroke is at its widest
  weight: 0.6,    // 0 … 1: dry stain → loaded impasto
  /* ⚠️ SET BY LOOKING, AND THE FIRST NUMBER WAS HALF WHAT IT NEEDED TO BE. At 0.055 a full-weight
     stroke rendered as a flat coloured decal with a soft edge — the relief was there in the mesh and
     invisible on the cake, which is the worst of both. At this value the ridge catches a highlight,
     the scraped middle reads as a groove, and the base casts a shadow onto the wall. The slider
     still has to cover "merges with the surface", and `weight` is what does that — this is only
     where the top of its range lands. */
  lift:   0.095,  // × R: how proud a FULL-weight stroke's ridges stand
  skim:   0.004,  // × R: how far even a weightless stroke sits off the wall, so it is not z-fighting
  ridge:  0.6,    // 0 … 1: how much of the height sits in the edge ridges vs the scraped middle
  across: 15,     // samples across the band — the ridge/hollow needs a few to read
  seed:   1,
};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The cross-section of a loaded stroke, across the band. 0 at both edges so the cream meets the
 * cake, a ridge just inside each, and a scraped hollow between them.
 *
 * ⚠️ IT MUST REACH ZERO AT THE EDGES or the stroke ends in a vertical cliff, which reads as a sticker
 * cut out and laid on rather than cream pushed across.
 */
export function brushRelief(u, ridge = BRUSH_ON_CAKE_DEFAULTS.ridge) {
  const t = clamp01(u);
  const skirt = smoothstep(0, 0.13, t) * smoothstep(0, 0.13, 1 - t);   // down to the wall at both edges
  const d = Math.min(t, 1 - t) * 2;                                     // 0 at an edge, 1 in the middle
  const crest = 1 - smoothstep(0.1, 0.75, d);                           // 1 on the ridges, 0 mid-band
  return skirt * lerp(1 - ridge, 1, crest);
}

/**
 * How much cream is still on the knife, along the stroke. Blunt and full where it lands, thinning
 * towards the lift — the layer runs out, which is why the end tears rather than stopping.
 */
export function brushLoad(t) {
  const start = smoothstep(0, 0.06, t);          // the knife lands, it does not fade in
  const run   = 1 - smoothstep(0.55, 1, t);      // and runs dry towards the lift
  return start * run;
}


/* The rows of the mesh, each `m` points wide, in the stroke's own flat space.
 *
 * ⚠️ THE TORN TIP IS A ROW OF ITS OWN, SAMPLED ACROSS — and collapsing it to its two end points is
 * exactly the bug Sandeep spotted off a render: *"all the edges where the stroke is released look
 * same. there should be randomness."* `brushStroke` returns the tip as SEVEN fingers of different
 * lengths, which is the randomness; taking only `tip[0]` and `tip[last]` and lerping between them
 * throws every one of them away and leaves a ruled line. Each stroke then ended identically however
 * different its seed was — the variation existed and was being discarded one line before it was
 * used.
 */
function strokeGrid(stroke, m) {
  const grid = stroke.band.map(([l, r]) => {
    const row = [];
    for (let j = 0; j < m; j++) { const u = j / (m - 1); row.push([lerp(l[0], r[0], u), lerp(l[1], r[1], u)]); }
    return row;
  });
  if (stroke.tip?.length) {
    // The fingers, with the last cross-section's own corners at either end so the row closes.
    const [l, r] = stroke.band[stroke.band.length - 1];
    const pts = [l, ...stroke.tip, r];
    const row = [];
    for (let j = 0; j < m; j++) {
      const x = (j / (m - 1)) * (pts.length - 1);
      const i0 = Math.floor(x), i1 = Math.min(pts.length - 1, i0 + 1), f = x - i0;
      row.push([lerp(pts[i0][0], pts[i1][0], f), lerp(pts[i0][1], pts[i1][1], f)]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * A brushstroke seated on a cylindrical wall.
 *
 * `path` is in NORMALISED wall coordinates — [[u, v], …] with u in turns around the cake and v in
 * 0…1 up the wall — so a stroke authored once sits the same way on any tier.
 *
 * Returns a BufferGeometry in world space, or null if the gesture was too short to be one.
 */
export function buildBrushStrokeOnWall({ R = 1, baseY = 0, wallH = 1, path = [], ...opts } = {}) {
  const p = { ...BRUSH_ON_CAKE_DEFAULTS, ...opts };
  if (!(R > 0) || !(wallH > 0) || (path?.length ?? 0) < 2) return null;

  /* The gesture is solved FLAT, in the wall's own unrolled surface — arc length across, height up —
     and only then wrapped. Solving it in 3D would mean re-deriving every tear and jag against a
     curve, for a shape that is by definition the same smear wherever it is laid. */
  const flat = path.map(([u, v]) => [u * Math.PI * 2 * R, v * wallH]);
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed });
  if (!stroke || !stroke.band?.length) return null;

  const m = Math.max(3, p.across | 0);
  const grid = strokeGrid(stroke, m);
  const n = grid.length;
  const pos = [], idx = [];
  const maxLift = p.lift * R, skim = p.skim * R;
  for (let i = 0; i < n; i++) {
    const along = n > 1 ? i / (n - 1) : 0;
    const load = brushLoad(along) * clamp01(p.weight);
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [sx, y] = grid[i][j];                  // arc length round the cake, height up the wall
      const h = skim + maxLift * load * brushRelief(u, p.ridge);
      const th = sx / R;
      const rad = R + h;
      pos.push(Math.sin(th) * rad, baseY + y, Math.cos(th) * rad);
    }
  }
  /* ⚠️ WOUND OUTWARD, AND GETTING IT BACKWARDS MAKES THE STROKE INVISIBLE RATHER THAN WRONG. The
     rows run UP the wall and the columns run round it, so (row × column) points INTO the cake: back
     faces are culled, and a full-weight stroke dead in front of the camera rendered as nothing at
     all. Nothing errors, the geometry measures correctly, and the tests pass — `strokeFacesOutward`
     below is the one that would have caught it. */
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Does this stroke face the viewer? True when its normals point AWAY from the cake's axis.
 *
 * Exported because winding is the one property of a surface that is invisible in every other way:
 * the vertices are right, the measurements are right, and the mesh simply is not drawn.
 */
export function strokeFacesOutward(geo) {
  const pos = geo?.attributes?.position, nor = geo?.attributes?.normal;
  if (!pos || !nor) return false;
  let out = 0, inward = 0;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const len = Math.hypot(x, z) || 1;
    (nor.getX(v) * (x / len) + nor.getZ(v) * (z / len) >= 0) ? out++ : inward++;
  }
  return out > inward;
}

/**
 * The same stroke, laid on a flat surface — the cake top or the board. `path` is in units of R from
 * the axis, so [-1, 1] spans the tier.
 */
export function buildBrushStrokeOnFlat({ R = 1, y = 0, path = [], ...opts } = {}) {
  const p = { ...BRUSH_ON_CAKE_DEFAULTS, ...opts };
  if (!(R > 0) || (path?.length ?? 0) < 2) return null;
  const flat = path.map(([x, z]) => [x * R, z * R]);
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed });
  if (!stroke || !stroke.band?.length) return null;

  const m = Math.max(3, p.across | 0);
  const grid = strokeGrid(stroke, m);
  const n = grid.length;
  const pos = [], idx = [];
  const maxLift = p.lift * R, skim = p.skim * R;
  for (let i = 0; i < n; i++) {
    const load = brushLoad(n > 1 ? i / (n - 1) : 0) * clamp01(p.weight);
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [gx, gz] = grid[i][j];
      pos.push(gx, y + skim + maxLift * load * brushRelief(u, p.ridge), gz);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
