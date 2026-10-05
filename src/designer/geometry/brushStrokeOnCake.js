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
  skim:   0.004,  // × R: the clearance under even the thinnest film
  /* ⚠️ THE THINNEST STROKE IS STILL A LAYER OF CREAM, NOT A DECAL. At thickness 0 the stroke was
     perfectly flat and Sandeep said so: *"when thickness is 0- it feels very smooth and does not
     look like cream."* He is right twice over — a knife wiped nearly dry still leaves the marks of
     its edge, and a dead-flat film also Z-FIGHTS: over a long grazing sweep the wall punches through
     it in stripes, which is the "breaking at extreme sweep" in the same screenshot. A film with its
     own small relief is both the texture and the clearance. */
  film:   0.12,   // 0 … 1: how much of the full relief a zero-thickness stroke still carries
  ridge:  0.6,    // 0 … 1: how much of the height sits in the edge ridges vs the scraped middle
  /* ⚠️ HOW WIDE THE STROKE STILL IS WHERE IT IS LIFTED, AS A RANGE RATHER THAN A NUMBER. Sandeep,
     off a render of five: *"the width of the stroke release does not need to be same. there should
     be randomness. some can be looking as close rectangle, and thats real."* `brushStroke` ended
     every stroke at a hardcoded 0.42 of its width, which is invisible on one piece and obvious on a
     row of them. The top of this range is nearly square — a knife that still had plenty of cream on
     it when the hand lifted — and the bottom runs out to a point. */
  tipMin: 0.30,
  tipMax: 0.95,
  /* ⚠️ THE STRIATIONS SET THIS, NOT THE RIDGE. A ridge and a hollow read at a handful of samples;
     the knife marks are four or five lanes across the same band, and three samples per lane turns
     them into a stepped zigzag. 31 is two per lane plus headroom and costs ~600 verts a stroke. */
  across: 31,     // samples across the band
  /* ⚠️ THE KNIFE'S OWN EDGE, AND IT IS NOT DECORATION. brushStroke.js says it outright — *"the
     striations left by the edge of the knife are most of what says chocolate smear rather than
     coloured shape; without them the piece reads as plastic"* — and a perfectly smooth stroke is
     exactly what we had: Sandeep, *"the cream texture is not looking close to real cream."* Cream
     dragged under a blade keeps every nick in that blade as a line running the length of the pull. */
  lanes:  4.5,    // how many drag lines across the width — fractional so they do not land evenly
  grain:  0.3,    // 0 … 1: how deep the lines cut, × the local relief
  seed:   1,
};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/* A number in 0…1 from a seed. Its own hash rather than a draw from `brushStroke`'s rng, because
   that file states its draw ORDER as a contract — the tubes and the web both walk it and reordering
   makes the two meshes drift apart. Asking a question OUTSIDE it cannot disturb that. */
function seedFrac(seed, salt) {
  const x = Math.sin((seed + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
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
 * The lines a blade's own edge drags along the stroke, as a multiplier on the relief.
 *
 * ⚠️ MULTIPLIED, NOT ADDED, so the marks vanish wherever the cream does — at the two edges, where
 * `brushRelief` is already zero, and at the lift, where there is nothing left to groove. Added, they
 * would leave ridges floating off the end of the stroke and a corrugated rim along the skirt.
 *
 * ⚠️ AND THE LANES ARE NOT EVENLY SPACED. Two waves at incommensurate frequencies, because a blade
 * is nicked irregularly — evenly spaced grooves read as corduroy, which is the machined look the
 * rope's own swell note warns about. Fades out along the stroke: the deepest marks are where the
 * cream was thickest.
 */
export function brushStriation(u, along, { seed = 1, lanes, grain } = {}) {
  const n = lanes ?? BRUSH_ON_CAKE_DEFAULTS.lanes;
  const g = grain ?? BRUSH_ON_CAKE_DEFAULTS.grain;
  if (!(g > 0)) return 1;
  const phase = seedFrac(seed, 11) * Math.PI * 2;
  /* ⚠️ THE LANES WAVER DOWN THE STROKE, they do not run as straight rails. Two fixed waves gave an
     even corduroy — regular, machine-like, and the first cut read as ribbed fondant rather than
     cream. A hand is not a jig: the blade drifts as it travels, so the phase moves with `along` and
     a third wave breaks what is left of the repeat. */
  const drift = Math.sin(along * 4.1 + phase) * 0.55;
  const a = Math.sin(u * Math.PI * 2 * n + phase + drift);
  const b = Math.sin(u * Math.PI * 2 * n * 1.73 + phase * 2.3 + drift * 1.6) * 0.45;
  const c = Math.sin(u * Math.PI * 2 * n * 3.1 + phase * 4.7) * 0.18;
  const cut = (a + b + c) / 1.63;                    // −1 … 1
  // Deepest where the cream is thickest, gone by the lift.
  return 1 - g * (0.5 - cut * 0.5) * (1 - clamp01(along) * 0.65);
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


/** How wide this particular stroke is where it was lifted — the same seed always gives the same
 *  answer, so a cake reopens as the cake that was made. */
export function tipFor({ seed = 1, tipMin, tipMax } = {}) {
  const lo = tipMin ?? BRUSH_ON_CAKE_DEFAULTS.tipMin;
  const hi = tipMax ?? BRUSH_ON_CAKE_DEFAULTS.tipMax;
  return lo + (hi - lo) * seedFrac(seed, 3);
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
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed, tipWidth: tipFor(p) });
  if (!stroke || !stroke.band?.length) return null;

  const m = Math.max(3, p.across | 0);
  const grid = strokeGrid(stroke, m);
  const n = grid.length;
  const pos = [], idx = [];
  const maxLift = p.lift * R, skim = p.skim * R;
  for (let i = 0; i < n; i++) {
    const along = n > 1 ? i / (n - 1) : 0;
    // `film` is the floor: even at zero thickness there is a layer, and it keeps its knife marks.
    const load = brushLoad(along) * (p.film + (1 - p.film) * clamp01(p.weight));
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [sx, y] = grid[i][j];                  // arc length round the cake, height up the wall
      const h = skim + maxLift * load * brushRelief(u, p.ridge)
                * brushStriation(u, along, { seed: p.seed, lanes: p.lanes, grain: p.grain });
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
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed, tipWidth: tipFor(p) });
  if (!stroke || !stroke.band?.length) return null;

  const m = Math.max(3, p.across | 0);
  const grid = strokeGrid(stroke, m);
  const n = grid.length;
  const pos = [], idx = [];
  const maxLift = p.lift * R, skim = p.skim * R;
  for (let i = 0; i < n; i++) {
    const load = brushLoad(n > 1 ? i / (n - 1) : 0) * (p.film + (1 - p.film) * clamp01(p.weight));
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [gx, gz] = grid[i][j];
      const along = n > 1 ? i / (n - 1) : 0;
      pos.push(gx, y + skim + maxLift * load * brushRelief(u, p.ridge)
                 * brushStriation(u, along, { seed: p.seed, lanes: p.lanes, grain: p.grain }), gz);
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

/* ── Placing a stroke by hand ─────────────────────────────────────────────────────────────────────
 *
 * Sandeep: *"round and height need to be done with dragging."* Where a stroke SITS is a thing you
 * point at; two sliders for one position is the control-and-effect split INVARIANTS #11 is about,
 * and you cannot aim with them.
 *
 * ⚠️ THE GRAB OFFSET IS THE WHOLE OF IT, AND LEAVING IT OUT IS LAW 5 BROKEN. Writing the pointer's
 * position straight in as the stroke's origin makes the stroke JUMP by however far the grabbed point
 * and the origin happened to be apart — the exact fault a piping border shipped with, recorded in
 * the designer's own notes. `grabOffset` is taken once at pointer-down and re-applied on every move,
 * so the point taken hold of stays under the pointer: `dragStrokeTo` and the grab are inverses.
 *
 * Pure, and in core, so the studio and anything after it share one answer rather than each deriving
 * their own — the maths is testable here without a scene, which a studio behind a login is not.
 */

/** Where a world-space point sits on the wall, in the two numbers a stroke is authored with. */
export function wallCoordsOf(point, { baseY = 0, wallH = 1 } = {}) {
  const x = point?.x ?? 0, y = point?.y ?? 0, z = point?.z ?? 0;
  return {
    at:   ((Math.atan2(x, z) / (Math.PI * 2)) % 1 + 1) % 1,
    rise: wallH > 0 ? (y - baseY) / wallH : 0,
  };
}

/** How far the stroke's origin is from the point just taken hold of. Recorded once, at pointer-down. */
export function grabOffset(stroke, point, opts) {
  const w = wallCoordsOf(point, opts);
  return { dAt: (stroke?.at ?? 0) - w.at, dRise: (stroke?.rise ?? 0) - w.rise };
}

/** The stroke's new origin for a pointer now at `point`. Clamped up the wall, wrapped round it. */
export function dragStrokeTo(grab, point, opts = {}) {
  const w = wallCoordsOf(point, opts);
  const { riseMin = 0.02, riseMax = 0.95 } = opts;
  return {
    at:   ((w.at + (grab?.dAt ?? 0)) % 1 + 1) % 1,
    rise: Math.min(riseMax, Math.max(riseMin, w.rise + (grab?.dRise ?? 0))),
  };
}
