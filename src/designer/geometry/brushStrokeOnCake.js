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
     where the top of its range lands.
     ⚠️ AND 0.095 WAS STILL TOO TIMID, WHICH ONLY A CAKE-SIZED VIEW SHOWED. It read in a close-up and
     washed out at the size a stroke actually appears on a cake: put beside a flat chocolate panel,
     Sandeep could not tell them apart — *"they still look mostly same."* Judging relief on a zoomed
     render is judging it at a distance nobody looks from. At this value the ridge carries a
     highlight and a shadow in a whole-cake frame, which is where it has to work. */
  lift:   0.17,   // × R: how proud a FULL-weight stroke's ridges stand
  skim:   0.004,  // × R: the clearance under even the thinnest film
  /* ⚠️ STROKES OVERLAP, AND THE LATER ONE GOES ON TOP. Sandeep: *"when i keep brush strokes side by
     side, we should allow overlaps. this is an important thing to make the final output look real."*
     He is right about why: a brushed cake is strokes laid ACROSS each other — a baker does not leave
     a white gap between them — and the overlaps are most of what stops a row of them reading as
     stripes on wallpaper.
     Nothing ever prevented the overlap; what was missing is an ORDER. Two layers at the same radius
     interpenetrate and z-fight, which is not "on top of", it is "fighting with". Each stroke is
     lifted by its own place in the order, so the one painted later draws over the one before it —
     silhouette, ridge and all — exactly as wet cream laid over set cream does.
     ⚠️ SMALL ENOUGH TO BE INVISIBLE ALONE. A stroke with nothing under it must still look painted ON
     the cake, not hovering above it, so the step is a fraction of the thinnest film. Ten strokes
     deep is 0.03R, which is under a third of one stroke's own relief. */
  layer:     0,       // where this stroke comes in the order — later paints over earlier
  layerStep: 0.003,   // × R: how far each one rides above the one before it
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
  /* ⚠️ THE EDGE HAS TO WAVER, AND IT CANNOT WAVER FINER THAN THE ROWS IT IS MADE OF. A gesture is
     authored with a dozen points, so the band had a dozen cross-sections and its edges ran as near
     straight lines whatever noise was applied to them. Densified here rather than asked of the
     caller: how finely a shape must be sampled is the shape's business, not the hand's. */
  rows:   40,     // cross-sections down the stroke, resampled from however few the gesture carried
  /* ⚠️ AND THE STROKE BREATHES. A knife does not hold one width for the length of a pull — it loads
     and gives out, so the band swells and pinches as it travels. Without this the two edges stay
     exactly parallel, which is the "straight and smooth" Sandeep saw; the per-point jitter inside
     brushStroke is too fine and too small to read as anything but a slightly fuzzy ruler. */
  breathe: 0.22,  // 0 … 1: how much the width swells and pinches along the stroke
  /* ⚠️ THE TEAR IS COHERENT, NOT PER-ROW. brushStroke jitters each point independently, which is
     right at a dozen hand-placed points and becomes WHITE NOISE at forty: adjacent rows alternate
     and the edge comes out as pinking shears — the "row of identical notches… a decorative zigzag,
     which reads as machined rather than broken" that file's own note warns about. So the per-point
     fraying is turned off and the edges are wandered here instead, in runs: chocolate and cream tear
     in lengths, not at every sample. */
  tear:   0.3,    // 0 … 1: how deeply the trailing edge bites, in runs along the stroke
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
/* A smooth, non-repeating wave in −1 … 1 along the stroke. Two incommensurate terms, the same
   reasoning the rope's swell and the drip's seam use: one frequency repeats and reads as machined. */
function alongWave(along, seed, salt) {
  const ph = seedFrac(seed, salt) * Math.PI * 2;
  return Math.sin(along * 5.3 + ph) * 0.68 + Math.sin(along * 9.7 + ph * 1.9) * 0.32;
}

/**
 * ⚠️ THE LIP WANDERS, AND A LIP THAT DOES NOT IS THE TELL. This took only `u` — the position ACROSS
 * the band — so the crest sat at exactly the same fraction across on every row down the stroke. The
 * result is a ridge tracing a perfectly smooth line parallel to the edge, equally proud from end to
 * end. Sandeep, off the render: *"if you see the edge elevations, those are straight and smooth. pls
 * fix and make it look natural."* No amount of grain on the surface hides it, because the fault is
 * in the SILHOUETTE of the lip, not in its texture.
 *
 * So each edge gets its own drift and its own height, both functions of distance travelled: a hand
 * rocks the knife as it pulls, so one edge bites deeper here and lifts there, and the two edges do
 * not do it together.
 *
 * `along` defaults to 0, so a caller that does not care gets exactly the old profile.
 */
export function brushRelief(u, ridge = BRUSH_ON_CAKE_DEFAULTS.ridge, { along = 0, seed = 1 } = {}) {
  const t = clamp01(u);
  const skirt = smoothstep(0, 0.13, t) * smoothstep(0, 0.13, 1 - t);   // down to the wall at both edges
  // Where each crest sits, and how proud it is — independently, because the knife is not symmetrical.
  const dl = alongWave(along, seed, 21) * 0.09;
  const dr = alongWave(along, seed, 37) * 0.09;
  const al = 0.70 + 0.30 * (0.5 + 0.5 * alongWave(along, seed, 53));
  const ar = 0.70 + 0.30 * (0.5 + 0.5 * alongWave(along, seed, 71));
  const cl = (1 - smoothstep(0.10 + dl, 0.75 + dl, t * 2)) * al;        // the left lip
  const cr = (1 - smoothstep(0.10 + dr, 0.75 + dr, (1 - t) * 2)) * ar;  // the right lip
  return skirt * lerp(1 - ridge, 1, Math.max(cl, cr));
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


/* More cross-sections than the gesture was drawn with. A dozen hand-placed points cannot carry an
   edge that wavers; resampled along its own length, the per-point tear inside brushStroke lands
   forty times instead of a dozen and the edge stops being a ruler. */
function densify(path, want) {
  if (!Array.isArray(path) || path.length < 2 || want <= path.length) return path;
  const seg = [0];
  for (let i = 1; i < path.length; i++) {
    seg.push(seg[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  const total = seg[seg.length - 1];
  if (!(total > 0)) return path;
  const out = [];
  for (let k = 0; k < want; k++) {
    const d = (k / (want - 1)) * total;
    let i = 1; while (i < seg.length - 1 && seg[i] < d) i++;
    const f = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
    out.push([lerp(path[i - 1][0], path[i][0], f), lerp(path[i - 1][1], path[i][1], f)]);
  }
  return out;
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
/* How far the trailing edge has bitten in at this point along the stroke. Mostly nothing, then a
   run of it — that is what a torn edge is, as against a sawtooth that bites at every sample. */
function tearBite(along, seed) {
  const w = alongWave(along, seed, 151);
  const v = alongWave(along * 2.7, seed, 173);
  const run = Math.max(0, w - 0.25);                 // only sometimes
  return -(run * 0.9 + Math.max(0, v - 0.55) * 0.7); // and a sharper nick inside the run
}

function strokeGrid(stroke, m, { seed = 1, breathe = 0, tear = 0 } = {}) {
  const n = stroke.band.length;
  const grid = stroke.band.map(([l, r], i) => {
    const along = n > 1 ? i / (n - 1) : 0;
    /* Swell and pinch about the row's own middle, so the CENTRELINE of the stroke never moves —
       breathing that shifted it would be a wobbly path, which is a different thing and reads as a
       shaky hand rather than as a loaded knife.
       ⚠️ AND THE TWO EDGES ARE NOT THE SAME EDGE. A spatula has a flat side that sweeps a smooth
       curve and a trailing side where the cream rips away from the blade — fraying both alike is
       what makes a stroke read as a symmetrical leaf. The clean side only breathes; the trailing
       side breathes AND bites. */
    const kL = 1 + breathe * alongWave(along, seed, 97) * 0.5;
    const kR = 1 + breathe * alongWave(along, seed, 131) * 0.5 + tear * tearBite(along, seed);
    const cx = (l[0] + r[0]) / 2, cy = (l[1] + r[1]) / 2;
    const lx = cx + (l[0] - cx) * kL, ly = cy + (l[1] - cy) * kL;
    const rx = cx + (r[0] - cx) * Math.max(0.15, kR), ry = cy + (r[1] - cy) * Math.max(0.15, kR);
    const row = [];
    for (let j = 0; j < m; j++) { const u = j / (m - 1); row.push([lerp(lx, rx, u), lerp(ly, ry, u)]); }
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


/* ── One mesh builder, two surfaces ──────────────────────────────────────────────────────────────
 *
 * ⚠️ THE WALL AND THE LID DIFFER IN EXACTLY ONE THING: where a point in the stroke's own flat space
 * ends up in the world. Everything else — the grid, the load along the pull, the ridge and hollow
 * across it, the knife marks, the layer offset, the coverage attribute, the winding — is the same
 * smear. Written twice they drifted immediately: an edit meant for both landed on one of them and
 * every test still passed, because the two halves were separately correct and no longer agreed.
 * `check:dup` caught the copy before it could happen a third time.
 *
 * `place(x, y, h)` is the whole difference: on a wall it wraps round the cylinder, on a lid it lies
 * flat and folds over the rim.
 */
function buildStrokeMesh(stroke, p, { R, place }) {
  const m = Math.max(3, p.across | 0);
  const grid = strokeGrid(stroke, m, { seed: p.seed, breathe: p.breathe, tear: p.tear });
  const n = grid.length;
  const pos = [], idx = [], thick = [];
  const maxLift = p.lift * R, skim = (p.skim + Math.max(0, p.layer) * p.layerStep) * R;
  for (let i = 0; i < n; i++) {
    const along = n > 1 ? i / (n - 1) : 0;
    // `film` is the floor: even at zero thickness there is a layer, and it keeps its knife marks.
    const load = brushLoad(along) * (p.film + (1 - p.film) * clamp01(p.weight));
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [gx, gy] = grid[i][j];
      const h = skim + maxLift * load * brushRelief(u, p.ridge, { along, seed: p.seed })
                * brushStriation(u, along, { seed: p.seed, lanes: p.lanes, grain: p.grain });
      pos.push(...place(gx, gy, h));
      /* ⚠️ COVERAGE IS NOT HEIGHT. Driven by the local relief, the stroke washed out in the middle —
         because the middle is deliberately SCRAPED, a hollow between two ridges — and a real stroke
         is at its most saturated exactly there. What thins the pigment is how much cream was on the
         knife and the feathered EDGES where it meets the cake. */
      thick.push(clamp01(load * smoothstep(0, 0.16, u) * smoothstep(0, 0.16, 1 - u)));
    }
  }
  /* ⚠️ WOUND OUTWARD. Getting it backwards makes the stroke INVISIBLE rather than wrong: the faces
     point into the cake, back faces are culled, and a full-weight stroke in front of the camera
     renders as nothing at all while measuring perfectly. See strokeFacesOutward. */
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aThickness', new THREE.Float32BufferAttribute(thick, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
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
  const flat = densify(path.map(([u, v]) => [u * Math.PI * 2 * R, v * wallH]), p.rows);
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed, tipWidth: tipFor(p), frayed: false });
  if (!stroke || !stroke.band?.length) return null;

  return buildStrokeMesh(stroke, p, {
    R,
    // Round the cake and up it: arc length becomes an angle, relief pushes outward.
    place: (sx, y, h) => { const th = sx / R, rad = R + h; return [Math.sin(th) * rad, baseY + y, Math.cos(th) * rad]; },
  });
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

/* ── Over the edge ───────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ A STROKE THAT REACHES THE RIM GOES OVER IT. Left alone, the flat builder kept laying cream on
 * the plane of the top, so a gesture that ran past the tier hung in the air beyond it — correct
 * arithmetic, impossible cake. Sandeep: *"lets make it drape over the edge."*
 *
 * The fold is SHARP because the rim is: a tier is a cylinder with a flat lid, so the edge really is
 * a right angle and cream taken over it bends there. What must not happen is STRETCHING — the length
 * of cream does not change because it met a corner — so the distance travelled past the rim becomes
 * exactly that distance DOWN the wall. Arc length in, arc length out.
 *
 * ⚠️ AND THE RELIEF TURNS WITH THE SURFACE. On the lid it stands up; on the wall it stands out. A
 * height added along +Y the whole way would bury the draped half inside the cake. The direction
 * rotates across a short band rather than flipping, so the lip rolls over the corner instead of
 * ending in a step. */
function drapePoint(x, z, h, R, topY) {
  const d = Math.hypot(x, z);
  if (d <= R) return [x, topY + h, z];                     // still on the lid: relief points up
  const th = Math.atan2(x, z);
  const over = d - R;                                       // how far past the rim it travelled
  // Over the corner the relief swings from up to outward across a band, so the lip rolls.
  const turn = smoothstep(0, 0.09 * R, over);
  const out = R + h * turn;
  return [Math.sin(th) * out, topY - over + h * (1 - turn), Math.cos(th) * out];
}

/**
 * The same stroke, laid on a flat surface — the cake top or the board. `path` is in units of R from
 * the axis, so [-1, 1] spans the tier. A gesture that reaches the rim drapes down the wall.
 */
export function buildBrushStrokeOnFlat({ R = 1, y = 0, path = [], ...opts } = {}) {
  const p = { ...BRUSH_ON_CAKE_DEFAULTS, ...opts };
  if (!(R > 0) || (path?.length ?? 0) < 2) return null;
  const flat = densify(path.map(([x, z]) => [x * R, z * R]), p.rows);
  const stroke = brushStroke(flat, { width: p.width * R, seed: p.seed, tipWidth: tipFor(p), frayed: false });
  if (!stroke || !stroke.band?.length) return null;

  return buildStrokeMesh(stroke, p, {
    R,
    /* Flat on the lid — and over the rim if the gesture reached it. `drape: false` is the BOARD,
       which has no rim to fall off. */
    place: (gx, gz, h) => (p.drape === false ? [gx, y + h, gz] : drapePoint(gx, gz, h, R, y)),
  });
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

/**
 * Turn a stroke's thickness into vertex colours: full strength where the cream piled up, washing
 * toward `under` — the colour of whatever it was painted on — where the knife ran thin.
 *
 * ⚠️ THIS IS MOST OF WHAT SAYS BUTTERCREAM, and it took a photograph of a real cake to see it. A
 * stroke is SEMI-OPAQUE: where it is thin the cake shows through and the colour washes out, where it
 * piled up the colour is full. Ours was one flat colour from end to end, which reads as vinyl
 * however good the relief is — and relief was the only thing I had been tuning. Sandeep, three
 * renders in: *"still concerned about the texture difference."*
 *
 * ⚠️ VERTEX COLOURS RATHER THAN TRANSPARENCY. A translucent material would need sorting against
 * every stroke it overlaps and the cake behind it, for a result nobody could tell from this — and
 * real buttercream is not transparent, it is THIN. You are seeing less pigment, not through it. The
 * drip reaches the same conclusion for the same reason; see paintDripColors.
 */
export function paintBrushColors(geo, color, under, { floor = 0.55, bite = 0.35 } = {}) {
  const t = geo?.attributes?.aThickness;
  if (!t) return geo;
  const a = new THREE.Color(color), b = new THREE.Color(under ?? '#ffffff');
  const mix = new THREE.Color();
  const out = new Float32Array(t.count * 3);
  for (let v = 0; v < t.count; v++) {
    /* Even the thinnest film carries some pigment — `floor` is how much, so a dry edge reads as a
       wash rather than as a hole in the stroke. `bite` below 1 because pigment stacks FAST: the
       first scrape of cream hides most of what is under it and the tenth adds almost nothing, so a
       stroke is saturated across nearly all of its length and washes out only at the very ends and
       edges. Against a photograph, a linear fade was far too pale over far too much of the stroke. */
    const k = floor + (1 - floor) * Math.pow(clamp01(t.getX(v)), bite);
    mix.copy(b).lerp(a, k);
    out[v * 3] = mix.r; out[v * 3 + 1] = mix.g; out[v * 3 + 2] = mix.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/* ── What a hand actually does ───────────────────────────────────────────────────────────────────
 *
 * ⚠️ STROKES DIFFER IN HEIGHT, AND THAT IS NOT A DETAIL. In the reference photograph the strokes are
 * pulled up from the base and run out at wildly different heights — a short stubby one beside one
 * reaching two thirds up the wall — and that unevenness is most of what stops a row of them reading
 * as a fence. Ours were all the same length, so five strokes looked like five of the same object.
 * Sandeep: *"they differ in height, can we try that?"*
 *
 * ⚠️ AND THEY START AT THE BOTTOM. A baker loads the knife at the base and pulls UP, so the bottom
 * is where the cream is thickest and the strokes merge into one another; the top is where each one
 * ran out. Starting them all at mid-wall, as ours did, puts the ragged end at both ends and the
 * merge nowhere.
 *
 * Here rather than in the studio because it is knowledge about the GESTURE, not about one screen —
 * the designer will want the same hand when this reaches a cake.
 */
export const BRUSH_GESTURE_DEFAULTS = {
  at:       0,      // turns round the cake
  rise:     0.02,   // where the pull starts, × wall height — at the base, where a knife lands
  climb:    0.52,   // how far up it travels before the cream runs out
  climbVar: 0.55,   // 0 … 1: how unequal those lengths are between strokes
  sweep:    0.015,  // turns: how much it wanders round the cake as it climbs
  bow:      0.012,  // turns: how much it bows out in the middle
  points:   14,
};

export function brushGesture(opts = {}) {
  const p = { ...BRUSH_GESTURE_DEFAULTS, ...opts };
  const seed = p.seed ?? 1;
  // Unequal lengths, deterministic: the same stroke comes back the same after a reload.
  const climb = p.climb * (1 - p.climbVar / 2 + p.climbVar * seedFrac(seed, 211));
  const rise  = p.rise * (0.4 + 1.2 * seedFrac(seed, 227));
  const out = [];
  for (let i = 0; i < Math.max(2, p.points); i++) {
    const t = i / (Math.max(2, p.points) - 1);
    out.push([p.at + p.sweep * t,
              Math.min(0.97, rise + climb * t + Math.sin(Math.PI * t) * p.bow)]);
  }
  return out;
}
