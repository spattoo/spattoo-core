import * as THREE from 'three';
import { brushStroke } from './brushStroke.js';
// THE cream albedo — the one every piped stroke already uses. See paintBrushColors.
import { creamAlbedo } from './creamMaterial.js';
// The band merges into ONE mesh — same function, and the same reasons, as a piped wall.
import { mergePenGeometries } from './creamPen.js';

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
     highlight and a shadow in a whole-cake frame, which is where it has to work.
     ⚠️ AND 0.17 CAME BACK DOWN, BECAUSE THE REASON FOR IT WAS FIXED ELSEWHERE. It was raised to
     carry relief at cake distance against a stroke that was washing out — and that stroke was
     washing out for two reasons that have both since been found: it was painted at its RAW hex under
     a 3.25× light, and it was translucent enough to give up most of its colour. With a solid,
     correctly-lit stroke the ridge reads at a far lower lift, so the number that compensated for
     those is now simply too much cream. Sandeep, at thickness 0.16: *"we can still reduce the
     thickness."* Measured against the real thing rather than against the slider: at 0.17 a
     full-weight stroke stands 0.158R proud, which on a 15cm cake is 12mm of buttercream. A heavy
     palette-knife stroke is 3-5mm. Swept 0.17 · 0.12 · 0.08 at cake distance at both ends of the
     slider: the ridge still carries its highlight and shadow at 0.11. */
  lift:   0.11,   // × R: how proud a FULL-weight stroke's ridges stand
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
  /* ⚠️ `bed` IS THE HONEST ANSWER AND `layer` IS THE CHEAP ONE. Given a bed, a stroke rides on the
     cream already laid, exactly where that cream is — so a neighbour's ridge is covered rather than
     punched through, and a stroke with nothing under it still lies flat on the wall. Without one it
     falls back to a flat lift by its place in the order, which is better than nothing and is what
     made the emerging part of a covered stroke look elevated. */
  bed:       null,
  layer:     0,       // where this stroke comes in the order — later paints over earlier
  layerStep: 0.003,   // × R: how far each one rides above the one before it
  /* ⚠️ HOW THICK THE NEW LAYER IS WHERE IT CROSSES AN OLD ONE, and it is the entire difference
     between an overlap and a join. Laid exactly ON the cream below, the two surfaces meet
     tangentially at the feathered edge and the seam is a colour cut with no step and no shadow.
     This is doing double duty as the scale of "is there cream here at all", which is right: a
     clearance smaller than the thing it is clearing is not one. Applies ONLY over cream — a lone
     stroke is bit-identical with and without a bed, and there is a test holding that. */
  /* ⚠️ A FRACTION OF THE CREAM BENEATH, NOT A FIXED HEIGHT — and it was fixed, which is most of why
     a thickness-0 band still looked like a stack of slabs. This clearance is not physics: the
     stroke's own relief already adds its own layer on top. It exists ONLY to cover the bed's
     under-read, which is proportional to the height it is reading (measured at about a tenth), so a
     clearance that does not scale is far too big under a thin film — 0.012R of gap under 0.019R of
     cream. `seamMin` is the floor: the bed's grid quantisation, which does not scale with anything. */
  seam:      0.18,    // 0 … 1 of the cream under it: how far a stroke stands off what it is laid on
  seamMin:   0.0015,  // × R: and never less than this, which is the bed's own resolution
  ride:      0.35,    // 0 … 1: how much of its own surface a stroke keeps on top of what it levelled
  /* How far in from each edge the cream runs out. The first number is onto bare cake, the second
     onto cream already laid — see brushRelief, and note that a stroke uses BOTH at once when one of
     its edges is on a neighbour and the other is on the wall. */
  skirt:     0.13,    // 0 … 1 of the width: the feathered edge on bare cake
  /* ⚠️ `lip`, `cling` and `skirtOn` WERE HERE AND ARE GONE, which is worth a line because they were
     real work. They made an impasto overlap: a stroke ENDING on the cream it crosses at a fraction
     of its own height, over a short wall, holding its colour instead of washing out. Shown it beside
     the soft version Sandeep picked the soft one twice, and then the levelling fix (`max(own, over)`
     rather than a sum) absorbed most of what the lip could still do — measured at 1.1x the step
     against the 2.5x it managed when the overlap was a sum. Three knobs that are off and no longer
     move anything are three things for the next person to misread. git has them. */
  /* ⚠️ THE THINNEST STROKE IS STILL A LAYER OF CREAM, NOT A DECAL. At thickness 0 the stroke was
     perfectly flat and Sandeep said so: *"when thickness is 0- it feels very smooth and does not
     look like cream."* He is right twice over — a knife wiped nearly dry still leaves the marks of
     its edge, and a dead-flat film also Z-FIGHTS: over a long grazing sweep the wall punches through
     it in stripes, which is the "breaking at extreme sweep" in the same screenshot. A film with its
     own small relief is both the texture and the clearance. */
  /* ⚠️ AND 0.12 OF THE FULL RELIEF WAS NOT A FILM, IT WAS A LAYER. Sandeep, with the slider at the
     bottom: *"even at thickness 0 it looks very thick."* His own spec for this control is the test —
     *"if its a thick stroke edges have elevation, if its a lighter stroke, it just merges with the
     cake surface without elevation"* — and 0.12 × the 0.17R lift is 0.019R per stroke, which doubles
     wherever two overlap. A cake band came out 0.0497R proud at ZERO. The z-fighting this guards
     against is already handled by polygonOffset; what the film has to do is catch light, and 0.05
     still does. */
  film:   0.05,   // 0 … 1: how much of the full relief a zero-thickness stroke still carries
  /* How much pigment the stroke still carries at its SIDES, as against at its release. See the note
     in buildStrokeMesh: a knife leaves a clean full-strength edge sideways and runs dry lengthways,
     and one number for both is why solid sides meant a solid, paper-cut tip. */
  sideFloor: 0.9,
  /* ⚠️ AND THE REFERENCE HAS NO BEAD ON ANY EDGE. 0.6 put most of the height into the two lips, which
     at cake scale reads as a rolled rope down the side of every stroke — Sandeep, ringing one:
     *"when you compare it with the scale of the cake, dont you think that is bulky edge? see the same
     reference, anything looking that thick?"* On a real brushstroke cake the pulls are close to flat,
     with the relief spread across the whole width rather than piled at its rim. */
  ridge:  0.3,    // 0 … 1: how much of the height sits in the edge ridges vs the scraped middle
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
     them into a stepped zigzag. Six per lane is where they go round, and there is a test holding
     that ratio — raising `lanes` alone errors nowhere, measures right, and comes out faceted. */
  across: 45,     // samples across the band
  /* ⚠️ THE RELEASE IS MANY FINE STREAKS, NOT TWO OR THREE PEAKS. brushStroke's default tip is seven
     fingers under a strong middle-longest envelope — right for one chocolate shard seen close up,
     and at cake scale it resolves as a couple of big triangles that Sandeep ringed beside the
     photograph: *"some pieces stroke release are too artificial."* A bristled release leaves streaks
     of uneven length with no overall shape. The envelope goes from 1.6 to 0.3 so it is a hint rather
     than a silhouette, and `across` rises with the count or the streaks cannot be sampled. */
  tipFingers: 15,
  tipTaper:   0.3,
  /* ⚠️ SHORT EXCURSIONS, OR THE RELEASE IS A COMB. At 0.5 of the width the longest finger runs
     further than the dissolve is deep, so each one stays solid for most of its length and reads as a
     needle — Sandeep, ringing the band of them: *"these spikes look too harsh."* A release is a
     ragged LINE, not a row of spikes: the excursions have to be short enough that the dissolve
     reaches most of the way down them. */
  tipReach:   0.2,
  tipJitter:  0.8,    // 0 … 1: how unevenly the streaks are spaced — equal pitch reads as a saw
  tipRows:    5,      // cross-sections through the release, so the dissolve has room to happen
  merge:      0.075,  // × R: how deep the dissolve reaches back from each finger's own end
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
  /* ⚠️ DEEPER MARKS WERE TRIED AND THEY LOOK WORSE, which is the whole note. "this is not good
     either" about a whole-cake render was about the OVERLAPS; I read it as the texture, swept
     4.5/0.3 · 7/0.55 · 8.5/0.7 · 10/0.8, picked 7/0.55 off a close-up and shipped it — Sandeep:
     *"knife marks to too heavy and it started looking bad… we were working on the overlap. not on
     knife marks."* At 5.5 the strokes start to rib and by 7 they are corduroy, which is the machined
     look this file's own note already warns about. Back where it was, and it stays there unless
     someone asks for it. */
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
 *
 * ⚠️ `skirt` IS HOW FAR THE CREAM IS DRAGGED OUT BEFORE IT RUNS TO NOTHING, and it is NOT a constant
 * of the knife — it is a fact about what the knife was dragged onto. Pulled across bare cake the
 * cream thins out over a good fraction of the width, which is the soft edge every stroke here has
 * had. Pulled across cream that is already there, it does not thin at all: the blade lifts off a
 * surface at its own height and leaves a WALL. Feathered onto its neighbour instead, a stroke meets
 * it tangentially and the overlap comes out as a colour boundary with no step, no shadow and nothing
 * to say which one is on top — Sandeep: *"it looked like a separate piece than an overlap."*
 */
export function brushRelief(u, ridge = BRUSH_ON_CAKE_DEFAULTS.ridge,
                            { along = 0, seed = 1, skirt: sk = BRUSH_ON_CAKE_DEFAULTS.skirt,
                              floor = 0 } = {}) {
  const t = clamp01(u);
  const e = Math.max(1e-4, sk);
  /* `floor` is where the cream ENDS rather than where it runs out: 0 is the feather onto bare cake,
     and anything above it is a stroke that stops at a height because what it was dragged over is
     already that high. */
  const skirt = lerp(floor, 1, smoothstep(0, e, t) * smoothstep(0, e, 1 - t));
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

function strokeGrid(stroke, m, { seed = 1, breathe = 0, tear = 0, tipRows = 5 } = {}) {
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
  /* ⚠️ THE RELEASE IS SEVERAL ROWS, NOT ONE, AND IT HAS TO BE — because what happens there is a
     DISSOLVE and a dissolve needs somewhere to happen. Sandeep: *"stroke releases actually merge
     with cake. thats not happening in our case"*, and *"even a short stroke will have a release, so
     it dissolves. its not like it needs to have some height."* A single tip row gives the renderer
     exactly one edge to work with, so any fade across it is stretched over the whole finger —
     twenty per cent of a stroke for a five per cent fade, which is how five attempts at a smaller
     number all failed. Split into rows, the fade is a fixed DEPTH measured back from each finger's
     own end, so a long streak dissolves over the same few millimetres as a short one. */
  const toTip = grid.map(row => row.map(() => Infinity));
  if (stroke.tip?.length) {
    // The fingers, with the last cross-section's own corners at either end so the row closes.
    const [l, r] = stroke.band[stroke.band.length - 1];
    const pts = [l, ...stroke.tip, r];
    const end = [];
    for (let j = 0; j < m; j++) {
      const x = (j / (m - 1)) * (pts.length - 1);
      const i0 = Math.floor(x), i1 = Math.min(pts.length - 1, i0 + 1), f = x - i0;
      end.push([lerp(pts[i0][0], pts[i1][0], f), lerp(pts[i0][1], pts[i1][1], f)]);
    }
    const base = grid[grid.length - 1];
    for (let k = 1; k <= tipRows; k++) {
      const f = k / tipRows;
      const row = [], dist = [];
      for (let j = 0; j < m; j++) {
        const x = lerp(base[j][0], end[j][0], f), y = lerp(base[j][1], end[j][1], f);
        row.push([x, y]);
        dist.push(Math.hypot(end[j][0] - x, end[j][1] - y));     // how far back from this finger's end
      }
      grid.push(row); toTip.push(dist);
    }
    /* The body's own distance to the end, so the dissolve can reach back past the fingers when a
       finger is shorter than the merge depth — which is the short-stroke case. */
    for (let i = 0; i < base.length; i++) { /* nothing: `base` is a row, handled below */ }
    const bodyRows = grid.length - tipRows;
    for (let i = 0; i < bodyRows; i++) {
      for (let j = 0; j < m; j++) {
        toTip[i][j] = Math.hypot(end[j][0] - grid[i][j][0], end[j][1] - grid[i][j][1]);
      }
    }
  }
  return { grid, toTip };
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
function buildStrokeMesh(stroke, p, { R, place, bedAt = null, bedPut = null }) {
  const m = Math.max(3, p.across | 0);
  const { grid, toTip } = strokeGrid(stroke, m, { seed: p.seed, breathe: p.breathe, tear: p.tear,
                                                 tipRows: p.tipRows });
  const n = grid.length;
  const merge = p.merge * R;        // how deep the dissolve reaches back from each finger's end
  const pos = [], idx = [], thick = [];
  /* What lies under each vertex, kept so the rim can be dropped onto it — see the skirt below. */
  const floor = [];
  const maxLift = p.lift * R, skim = (p.skim + Math.max(0, p.layer) * p.layerStep) * R;
  const seamMin = p.seamMin * R;
  let prev = null;                       // the previous row's stamps, for the half-steps between
  for (let i = 0; i < n; i++) {
    const along = n > 1 ? i / (n - 1) : 0;
    // `film` is the floor: even at zero thickness there is a layer, and it keeps its knife marks.
    const load = brushLoad(along) * (p.film + (1 - p.film) * clamp01(p.weight));
    const row = bedPut ? [] : null;
    for (let j = 0; j < m; j++) {
      const u = j / (m - 1);
      const [gx, gy] = grid[i][j];
      /* ⚠️ THE BASE IS WHAT IS ALREADY HERE, not a global lift. Where nothing has been painted the
         stroke lies on the wall; where it crosses another it rides over it, and only there. */
      const bedH = bedAt ? bedAt(gx, gy) : 0;
      /* How much cream is actually under this point — 0 on bare wall, 1 well inside a neighbour.
         Everything about an overlap is conditioned on this, and nothing about a lone stroke is. */
      const onCream = clamp01(bedH / (0.01 * R));
      /* ⚠️ RIDING EXACTLY ON THE CREAM BELOW IS NOT AN OVERLAP, IT IS A JOIN. The relief feathers to
         nothing at both edges, so a stroke laid on another meets it TANGENTIALLY: the two surfaces
         become coplanar along the seam, there is no step to cast a shadow, and the depth buffer has
         nothing to choose between either. It comes out as strips of coloured tape butted together —
         Sandeep: *"it looked like a separate piece than an overlap."* A knife riding over set cream
         does not blend into it, it lays a new layer ON it, and the thickness of that layer is the
         whole tell. So the stroke clears the cream it crosses by a little, and by nothing at all
         where there is no cream to clear. */
      /* The stroke's own profile, as if it had been laid on bare wall. */
      const own = skim + maxLift * load * brushRelief(u, p.ridge, { along, seed: p.seed, skirt: p.skirt })
                  * brushStriation(u, along, { seed: p.seed, lanes: p.lanes, grain: p.grain });
      /* Just clearing the cream already here, and nothing more. */
      const over = bedH + onCream * Math.max(seamMin, bedH * p.seam);
      /* ⚠️ A BLADE LEVELS, IT DOES NOT STACK — the HIGHER of the two, not their sum. Adding the
         stroke's own relief on top of whatever it was riding over is what a nozzle does, not a
         knife: the blade rides at a height and leaves cream up to that height, scraping down
         anything already standing proud of it. Summed, the one place two crests met came out at
         twice the cream, and it is always an EDGE — measured on a band, 100% of the tallest 1% of
         vertices sat at a stroke's edge, with the 99th percentile 3.7× the median. Sandeep ringed
         one: *"this pice is too thick… if i reduce the thickness because of this, other pieces are
         becming too thin. this is an outlier."* Exactly what an outlier does to a control — it makes
         the slider answer to the worst vertex on the cake instead of to the cake.
         ⚠️ BUT IT STILL CARRIES ITS OWN SURFACE. A pure max FLATTENS a stroke wherever its neighbour
         is taller: the surface there becomes the bed plus a clearance and nothing else, so the
         knife marks, the ridge and the hollow all vanish and what is left is a smooth plane. A
         smooth plane facing the sky reflects it evenly, which reads as a pale, plastic strip — and
         on a packed band that is a pale stroke beside every textured one, whatever colour is chosen.
         Sandeep, three times on the same artefact: *"not fixed yet."* The cream that is laid does
         not stop existing because there was cream under it; it is a LAYER, with its own surface, on
         top of whatever it levelled. `ride` is how much of that surface survives — a fraction, not
         all of it, because all of it is the crest-on-crest sum that made the outlier ridge.
         On bare wall `over` is 0 and this is the stroke's own profile, byte for byte. */
      const h = Math.max(own, over + (own - skim) * p.ride);
      pos.push(...place(gx, gy, h));
      floor.push(Math.max(0, bedH));
      /* ⚠️ AND THE GAPS BETWEEN THE ROWS ARE STAMPED TOO, not blurred over. A stroke samples densely
         ACROSS itself and sparsely ALONG — forty rows over its length against forty-five points over
         its width — while the bed's cells are the other way round, so a splat round enough to bridge
         one direction smears three cells too far in the other. Widened until it bridged, the bed read
         three times the true height around every stroke's rim and the next stroke rode high on
         nothing, which is the complaint this whole mechanism exists to answer. Half-steps between
         consecutive rows close the gap where the gap actually is. */
      if (bedPut) {
        if (prev) bedPut.push([(prev[j][0] + gx) / 2, (prev[j][1] + gy) / 2, Math.min(prev[j][2], h)]);
        row.push([gx, gy, h]);
        bedPut.push([gx, gy, h]);
      }
      /* ⚠️ COVERAGE IS NOT HEIGHT. Driven by the local relief, the stroke washed out in the middle —
         because the middle is deliberately SCRAPED, a hollow between two ridges — and a real stroke
         is at its most saturated exactly there. What thins the pigment is how much cream was on the
         knife and the feathered EDGES where it meets the cake.
         ⚠️ AND IT ONLY THINS TOWARDS THE CAKE WHERE THE CAKE IS WHAT IS UNDERNEATH. Thin cream is
         translucent, which is most of what says buttercream — but the thing it lets through is
         whatever it was laid on, and over another stroke that is CREAM, not the wall. Washed to the
         cake's colour regardless, the edge of a stroke crossing its neighbour came out pale against
         a saturated neighbour: a bright seam running the length of the overlap, which is exactly the
         look of one shape pasted over another rather than laid on it. */
      /* ⚠️ THE SIDES AND THE RELEASE ARE NOT THE SAME THING, and conflating them is what made the
         tops look like cut paper. One number here drove both, so raising the opacity to stop the
         BODY washing out — which it had to, a brushstroke is cream and not a glaze — also made the
         RELEASE solid, and a release that does not fade ends in a hard torn silhouette. Against a
         photograph of the real thing the tops dissolve: the cream runs out and the last of it
         streaks away to nothing.
         So: across the stroke the pigment barely drops at all (`sideFloor`), because a knife laying
         cream leaves a clean full-strength edge. ALONG it, where the knife runs dry, it fades the
         whole way. */
      const side = p.sideFloor + (1 - p.sideFloor) * smoothstep(0, 0.16, u) * smoothstep(0, 0.16, 1 - u);
      /* ⚠️ THE PIGMENT DOES NOT FOLLOW `load`, AND IT USED TO. `load` is the HEIGHT curve: it carries
         brushLoad's long run-dry AND the thickness slider, so colour tied to it meant a thin stroke
         came out pale — turn Thickness to 0 and the cream lost its colour, which is not what thin
         cream does. It also spread the fade over the top 45% of every stroke, where a photograph of
         the real thing shows a saturated pull that lets go only at the very end.
         ⚠️ AND IN THE END IT IS OFF (`floor` 1), WHICH THE REFERENCE SAYS AND FIVE CUTS OF THIS DID
         NOT. 0.55, 0.75, 0.58, 0.9, 0.95 — each one a smaller fade, each one still putting a pale
         cap on every stroke, and the reason was not the number. THE TIP IS SEVEN FINGERS OF
         DIFFERENT LENGTHS, so the last ROW of the mesh spans a tall triangle; a fade applied per row
         is then stretched across that whole triangle however narrow the row band is. A five per cent
         fade made a twenty per cent cap. Put the render beside the photograph and there is no
         gradient anywhere on it: solid colour to a hard, ragged edge, and the raggedness is the
         release. Sandeep, three times, the last one with both pictures open: *"brush wont carry
         white."*
         The dial stays because thin cream over a cake really is translucent and a future caller may
         want it — but it must be driven by distance from the tip in WORLD units, not by row index,
         or it will smear over the fingers again.
         ⚠️ THE RIM, FOR WHEN IT IS TURNED BACK ON. Every cut of this started the fade
         far too early — 0.55, then 0.75, then 0.58 — and each one put white up the middle of a pull
         that a brush is not carrying any white in. Sandeep: *"how can this be correct. half of the
         stroke is white. brush wont carry white. only at the stroke release, it mixes with cake
         color so fading somewhre at the edge makes sense."* That is the whole rule, and the
         photograph says the same: a solid block of colour, and a thin soft edge where the layer
         finally breaks. The last tenth. */
      /* ⚠️ MEASURED BACK FROM THE END IN WORLD UNITS, never as a fraction of the stroke. A release is
         a physical thing — the layer thins out over a few millimetres and the cake comes through —
         so a stubby pull dissolves over exactly the same depth as a long one. As a fraction it would
         be a huge wash on a long stroke and nothing on a short one, which is both wrong and the
         opposite of what a hand does. */
      /* ⚠️ A RELEASE ONLY DISSOLVES INTO WHAT IS ACTUALLY UNDER IT, and over a neighbour that is
         CREAM, not the cake. Washed to the wall's colour regardless, every stroke laid a pale ghost
         of its own release across the stroke behind it — which on a packed band is a white halo
         beside each one, exactly as Sandeep saw it with a dark colour: *"see the white color shadow
         for each stroke."* Measured on that band: 16.5% of the mesh's vertices were under 0.4
         saturation, so it was the pigment and not the lighting however much it looked like a shadow.
         Where there is cream beneath, the layer thins into the SAME cream and nothing shows. */
      const dissolve = smoothstep(0, merge, toTip[i][j]);
      const cover = side * (dissolve + (1 - dissolve) * onCream);
      thick.push(clamp01(cover));
    }
    if (bedPut) prev = row;
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
  /* ── The rim ─────────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ A STROKE WAS AN OPEN SHEET, AND ANYWHERE IT STOOD PROUD YOU COULD SEE UNDER IT. The grid
   * above is a top surface and nothing else: no sides, no underside. On bare wall that is almost
   * harmless, because the boundary feathers down to `skim` and the gap is 0.004R. Over a NEIGHBOUR
   * it is not: the boundary is lifted to the cream below plus a clearance, so the sheet's edge hangs
   * in the air and the material's DoubleSide draws its BACK face through the gap — lit from the
   * wrong side, which is why it comes out pale. Sandeep, with one dark colour and a low camera:
   * *"presently we are just adding relief on the backside i think… backside looks white."*
   *
   * So the boundary is walked once and dropped onto whatever is underneath it, closing the solid. A
   * stroke is a SLAB of cream lying on a surface, not a decal floating over one. Zero-area where the
   * edge was already touching, which is the whole of a lone stroke on bare wall — so this costs
   * nothing there and only appears where something was actually open.
   */
  const ring = [];
  for (let j = 0; j < m; j++) ring.push(j);                          // the first row
  for (let i = 1; i < n; i++) ring.push(i * m + m - 1);              // down the right edge
  for (let j = m - 2; j >= 0; j--) ring.push((n - 1) * m + j);       // back along the last row
  for (let i = n - 2; i >= 1; i--) ring.push(i * m);                 // up the left edge
  const skirtStart = pos.length / 3;
  for (const v of ring) {
    const gx = grid[Math.floor(v / m)][v % m];
    pos.push(...place(gx[0], gx[1], floor[v]));
    thick.push(thick[v]);
  }
  /* DoubleSide is already on the material, so the winding here is not load-bearing — which is worth
     saying rather than leaving someone to wonder why it is not checked like the top surface is. */
  for (let k = 0; k < ring.length; k++) {
    const k2 = (k + 1) % ring.length;
    const a = ring[k], b = ring[k2], c = skirtStart + k, d = skirtStart + k2;
    idx.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aThickness', new THREE.Float32BufferAttribute(thick, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* ⚠️ WHERE THE TOP SURFACE ENDS, said once here rather than re-derived by every caller. The mesh
     is the grid followed by the rim, so `across × rows` is no longer the whole of it — and eight
     tests had that arithmetic inlined and broke the moment the rim arrived. Anything measuring the
     SURFACE (its relief, its colour, its silhouette) wants this bound; the rim is a side wall and
     answers none of those questions. */
  geo.userData.topCount = n * m;
  return geo;
}


/* How long a gesture actually is, in world units, once it has been unrolled flat. */
function pathLength(flat) {
  let d = 0;
  for (let i = 1; i < flat.length; i++) d += Math.hypot(flat[i][0] - flat[i - 1][0], flat[i][1] - flat[i - 1][1]);
  return d;
}

/**
 * The widest a pull of this length can be and still look like a pull.
 *
 * ⚠️ A STROKE WIDER THAN IT IS LONG IS NOT A STROKE, AND IT DOES NOT DEGRADE GRACEFULLY — it comes
 * apart. `brushStroke` builds the band by offsetting the gesture by half its width, and once that
 * half-width approaches the length there is no gesture left to offset: the two edges meet, cross,
 * and the tip taper and the tear — both measured as fractions of the WIDTH — swallow the whole
 * piece. Sandeep, dragging Length down: *"it lost the shape."* What came out were sideways lumps
 * with holes in them, which is the same failure hand-piping.md already records for a chocolate
 * brushstroke taken round a tight curve: *"offsetting a curve by more than its radius of curvature
 * folds the inner edge through the centre."*
 *
 * ⚠️ AND IT IS CLAMPED HERE RATHER THAN ASKED OF THE CALLER, because every caller gets it wrong in
 * the same way: width is authored once and length is a slider, so the pair goes bad the moment
 * somebody drags the slider. A knife pressed and pulled a short distance leaves a SHORT, NARROWER
 * mark; it does not leave a wide one. 0.95 rather than 1 so the widest case still reads as a pull
 * rather than as a square.
 */
export const BRUSH_WIDTH_OF_LENGTH = 0.95;
export const brushMaxWidth = (len) => Math.max(1e-4, len * BRUSH_WIDTH_OF_LENGTH);

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
  const width = Math.min(p.width * R, brushMaxWidth(pathLength(flat)));
  const stroke = brushStroke(flat, { width, seed: p.seed, tipWidth: tipFor(p), frayed: false,
                                     tipFingers: p.tipFingers, tipTaper: p.tipTaper, tipReach: p.tipReach,
                                     tipJitter: p.tipJitter });
  if (!stroke || !stroke.band?.length) return null;

  const put = p.bed ? [] : null;
  const geo = buildStrokeMesh(stroke, p, {
    R,
    // Round the cake and up it: arc length becomes an angle, relief pushes outward.
    place: (sx, y, h) => { const th = sx / R, rad = R + h; return [Math.sin(th) * rad, baseY + y, Math.cos(th) * rad]; },
    bedAt: p.bed ? ((sx, y) => p.bed.heightAt(sx, y)) : null,
    bedPut: put,
  });
  if (p.bed && put) p.bed.commit(put);          // committed AFTER, so a stroke never climbs itself
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
  const width = Math.min(p.width * R, brushMaxWidth(pathLength(flat)));
  const stroke = brushStroke(flat, { width, seed: p.seed, tipWidth: tipFor(p), frayed: false,
                                     tipFingers: p.tipFingers, tipTaper: p.tipTaper, tipReach: p.tipReach,
                                     tipJitter: p.tipJitter });
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
export function paintBrushColors(geo, color, under, { floor = 0, bite = 0.6 } = {}) {
  const t = geo?.attributes?.aThickness;
  if (!t) return geo;
  /* ⚠️ ALBEDO, NOT THE HEX — INVARIANTS #16, and this module was breaking it in the one way the rule
     is hardest to see. `creamMaterialProps` returns `color: creamAlbedo(hex)` precisely because this
     scene's light is about 3.25×: a material handed the raw hex renders roughly three times too
     bright. A brushstroke mesh overrides that `color` to white and carries its colour PER VERTEX
     instead — it has to, because the wash at a thin edge varies vertex by vertex — and the override
     threw the correction away with it. Every stroke this module has ever drawn was rendered at its
     raw hex under a reference light built for the corrected one, which is exactly what it looked
     like: Sandeep, of a studio render, *"I see too much exposure of light on this screenshot."*
     Both ends of the mix are corrected, not just the cream: `under` is the WALL, and a wall is lit by
     the same light. Corrected on one end only, a thin stroke would wash toward a surface three times
     brighter than the one it is actually lying on. */
  const a = new THREE.Color(creamAlbedo(color)), b = new THREE.Color(creamAlbedo(under ?? '#ffffff'));
  const mix = new THREE.Color();
  const out = new Float32Array(t.count * 3);
  for (let v = 0; v < t.count; v++) {
    /* Even the thinnest film carries some pigment — `floor` is how much, so a dry edge reads as a
       wash rather than as a hole in the stroke. `bite` below 1 because pigment stacks FAST: the
       first scrape of cream hides most of what is under it and the tenth adds almost nothing, so a
       stroke is saturated across nearly all of its length and washes out only at the very ends and
       edges. Against a photograph, a linear fade was far too pale over far too much of the stroke.
       ⚠️ AND 0.55 WAS STILL FAR TOO PALE, which took a reference photo to settle rather than another
       opinion. Buttercream is not a glaze: on a real brushstroke cake each pull is a SOLID block of
       colour with a torn top, not a gradient running out to white. Measured down one stroke at 0.55,
       the tip rendered #DEDFE2 for a colour asked for as #2E5C8A — the stroke had given up almost
       all of its colour over its top third. At 0.9 the tip holds. Not 1: a knife really does run
       out, and the last film of cream really does let a little of the wall through. */
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

/* ── What is already on the wall ─────────────────────────────────────────────────────────────────
 *
 * ⚠️ A STROKE RIDES ON WHAT IS UNDER IT, AND ONLY WHERE SOMETHING IS. Lifting a whole stroke by its
 * place in the order — which is what `layer` does — is wrong in both directions at once: too little
 * to clear a neighbour's ridge, so the lower one punches through; and applied everywhere, so a
 * stroke with nothing beneath most of it still stands off the wall. Sandeep, at the render: *"the
 * part that coming out from the other strip is elevated high."* That is the global lift, seen.
 *
 * A bed is the height of the cream already laid, sampled where it matters. A stroke reads it for its
 * base and then stamps itself into it, so the next stroke rides on the two of them. That is what
 * cream does: the surface is the UNION of what has been put down, and nothing laid later can sink
 * below what is already there.
 *
 * ⚠️ A RASTER, NOT A LIST OF STROKES. Asking every previous stroke about every vertex is
 * strokes × verts × verts and grows with the cake; a grid in the wall's own flat space is one lookup
 * whatever has been painted. It is coarse on purpose — it carries where the cream IS, not its
 * texture, and the stroke's own relief is added on top of what it reads.
 */
export function makeBrushBed({ R = 1, wallH = 1, cols = 512, rows = 256 } = {}) {
  const w = Math.PI * 2 * R;
  const h = new Float32Array(cols * rows);
  const wrapC = c => ((c % cols) + cols) % cols;
  const clampR = r => (r < 0 ? 0 : r > rows - 1 ? rows - 1 : r);
  const at = (c, r) => h[clampR(r) * cols + wrapC(c)];

  /* ⚠️ READ SMOOTHLY OR THE STROKE COMES OUT AS A COMB. Nearest-cell sampling gives every vertex in
     a cell the same base, so a stroke climbing off a neighbour does it in steps — and at this grid's
     size a stroke spans only a few cells, so the steps are the size of the ridge. The first cut of
     this looked markedly worse than no bed at all, which is what a cheap read buys. */
  const sample = (sx, y) => {
    const fx = (((sx / w) % 1) + 1) % 1 * cols - 0.5;
    const fy = (y / wallH) * rows - 0.5;
    const c0 = Math.floor(fx), r0 = Math.floor(fy);
    const tx = fx - c0, ty = fy - r0;
    return (at(c0, r0) * (1 - tx) + at(c0 + 1, r0) * tx) * (1 - ty)
         + (at(c0, r0 + 1) * (1 - tx) + at(c0 + 1, r0 + 1) * tx) * ty;
  };

  /* ⚠️ AND STAMP AN AREA, NOT A POINT. A vertex writes one cell, so between vertices the bed keeps
     its holes and the next stroke reads full height and nothing in alternation — the comb again,
     from the other side. A small splat closes them; the bed carries WHERE the cream is, and a
     cell-wide blur of that is harmless because the stroke's own relief is added on top. */
  const splat = (sx, y, v) => {
    const fx = (((sx / w) % 1) + 1) % 1 * cols, fy = (y / wallH) * rows;
    const c0 = Math.round(fx), r0 = Math.round(fy);
    /* ⚠️ AND THE SPLAT FALLS OFF — BUT NOT FROM THE MIDDLE. A flat max over the neighbourhood writes
       square plateaus with a cliff at their rim, and a stroke climbing that cliff comes out
       serrated; a shoulder gives the next stroke something to climb rather than trip over. Started
       at d = 0, though, that shoulder eats the HEIGHT: a cell whose own vertex missed it keeps only
       the 0.66 its neighbour wrote, so the bed read 0.68–0.95 of the true surface right across a
       stroke's middle — measured, after the seam it is supposed to clear simply failed to appear.
       Under-reporting by a quarter of the relief is most of a seam's worth of error, and it is in
       the direction that lets the stroke underneath come back through. Full value inside the core,
       shoulder only outside it: the bed now says how high the cream is, and the clearance is the
       only thing deciding how far above it the next stroke sits. */
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const d = Math.hypot(dc, dr);
        if (d > 2.2) continue;
        const k = v * (1 - 0.34 * Math.max(0, d - 1));
        const i = clampR(r0 + dr) * cols + wrapC(c0 + dc);
        if (k > h[i]) h[i] = k;
      }
    }
  };

  return {
    heightAt: sample,
    /* ⚠️ A STROKE MUST NOT READ ITS OWN STAMPS. Reading and writing in one pass makes a stroke climb
       its own ridge — each vertex sees the one before it and rises, and the stroke walks off the
       cake. A build COLLECTS what it would stamp and commits it at the end. */
    commit(list) { for (const [sx, y, v] of list) splat(sx, y, v); },
    clear() { h.fill(0); },
  };
}

/* ── A band of them, all the way round ───────────────────────────────────────────────────────────
 *
 * One tier's worth of brushstrokes: a ring of pulls up the wall, overlapping their neighbours, in a
 * handful of colours that repeat. This is what the technique IS on a real cake — a single stroke is
 * a sample of it — and it is the thing a baker asks for.
 *
 * ⚠️ ONE MESH, NOT N MESHES, AND NOT INSTANCES. Instancing is the reflex answer to "there are
 * twenty of these" and it cannot work here: an InstancedMesh draws ONE geometry many times, and the
 * entire point of a band is that no two strokes are the same shape — different height, different
 * width, a different tear where each one was lifted. Making them instanceable would mean making them
 * identical, which is the fault being designed against. What an instance buys is one draw call, and
 * a merge buys the same one draw call while leaving every stroke its own shape, so the band costs a
 * tier of piping and is built the way `mergePenGeometries` already builds a piped wall.
 *
 * ⚠️ AND THE COUNT IS SNAPPED TO A MULTIPLE OF THE COLOURS. A band is a CLOSED loop: nineteen
 * strokes in three colours puts two of the same colour next to each other at the seam, in one place,
 * which reads as a mistake rather than as a pattern — and it is the kind of fault that only appears
 * on the far side of the cake, after the design is saved. Rounded to the nearest multiple, never
 * below one of each.
 */
export const BRUSH_BAND_DEFAULTS = {
  colors:   ['#F6DCE2', '#8EC5E8', '#F4C542'],
  /* ⚠️ THE DEFAULTS ARE THE ONES SANDEEP SETTLED ON IN THE STUDIO, not a guess — he drove the
     sliders until the band looked like the cake he is copying and sent the screenshot. That is the
     whole point of the studio existing, so they are copied here verbatim rather than rounded. */
  count:    30,      // strokes round the tier — snapped to a multiple of `colors.length`
  jitter:   0.35,    // 0 … 1: how far each one wanders off its even spacing, × the gap
  overlap:  0.35,    // 0 … 1: how much of its own width a stroke shares with its neighbour
  rise:     0.02,    // where the pulls start, × wall height
  climb:    0.42,    // and how far up they travel
  climbVar: 0.55,    // 0 … 1: how unequal those lengths are — the randomness in height
  sweep:    0,
  bow:      -0.2,
  width:    null,    // null = derived from `count` and `overlap`, so the band always closes
  weight:   0.18,
  /* How far a thin stroke washes toward the wall under it — passed through to paintBrushColors, so
     a band and a single stroke cannot disagree about it. */
  floor:    null,
  bite:     null,
  seed:     1,
};

/** How many strokes this band actually lays — the snapped count, so a caller can show it. */
export function brushBandCount({ count, colors } = {}) {
  const n = Math.max(1, (colors ?? BRUSH_BAND_DEFAULTS.colors).length);
  const want = Math.max(n, Math.round(count ?? BRUSH_BAND_DEFAULTS.count));
  return Math.max(n, Math.round(want / n) * n);
}

/**
 * A band of brushstrokes round one tier's wall: ONE PART PER COLOUR, each a merged geometry.
 *
 * `under` is the wall's own colour — what a thin stroke lets through. Returns `[{ color, geometry }]`,
 * or an empty array if there is nothing to build.
 *
 * ⚠️ ONE PART PER COLOUR, NOT ONE PART. The first cut merged the whole band into a single mesh and
 * it was wrong in a way that only a dark palette shows: `creamMaterialProps` returns a `sheenColor`
 * taken from the stroke's OWN colour, because cream's sheen is the colour of the cream. One mesh
 * takes one material, so every stroke wore the sheen of whatever colour was passed — and a white
 * sheen lobe over a near-black albedo is not black, it is mid-grey. Sandeep asked for a dark colour
 * in a render and what came back was the colour of wet concrete.
 *
 * ⚠️ AND IT COSTS ALMOST NOTHING, which is why there was never a trade to make here. A palette is
 * two to six colours, so this is two to six draw calls for a whole tier rather than one — still far
 * under a tier of piping, and still nothing like the one-mesh-per-stroke it is often confused with.
 * The strokes keep their vertex colours WITHIN a part, because the wash at a thin edge varies vertex
 * by vertex and no material can say that.
 *
 * The parts share ONE bed, so a stroke rides on its neighbour whatever colour that neighbour is. The
 * order they are laid in is the order round the cake, not the order of the parts.
 */
export function buildBrushBand({ R = 1, baseY = 0, wallH = 1, under = '#ffffff', ...opts } = {}) {
  const p = { ...BRUSH_BAND_DEFAULTS, ...opts };
  const colors = (p.colors?.length ? p.colors : BRUSH_BAND_DEFAULTS.colors);
  const n = brushBandCount({ count: p.count, colors });
  if (!(R > 0) || !(wallH > 0)) return null;

  const gap = 1 / n;                                   // turns between strokes
  /* ⚠️ THE WIDTH FOLLOWS THE COUNT, because the band has to CLOSE. Authored as a fixed number it is
     right at one count and wrong at every other: raise the count and the strokes bunch into a solid
     wall of cream, lower it and the cake shows through in stripes. `overlap` is the thing a baker
     actually means — how much each pull shares with the one before it — and the width is what that
     implies. An explicit `width` still wins, for a caller that wants gaps on purpose. */
  const width = p.width ?? (gap * Math.PI * 2 * (1 + p.overlap));

  /* ONE bed for the whole band, so a stroke rides on its neighbour, and the last one laid rides over
     the first — which is what happens when a hand goes round a cake and arrives back where it
     started. The bed wraps round the seam already; nothing here has to know where the seam is. */
  const bed = makeBrushBed({ R, wallH });
  const byColor = colors.map(() => []);
  for (let i = 0; i < n; i++) {
    /* Deterministic per stroke, and distinct: a design is re-rendered from saved numbers, so the
       same band must come back the same band. `* 97` rather than `+ i` because the gesture's own
       hashes are sampled at small salts and neighbouring seeds give neighbouring answers — the
       whole band drifted in one direction, every stroke a little taller than the last. */
    const seed = p.seed * 1000 + i * 97;
    const at = (i * gap) + (seedFrac(seed, 307) - 0.5) * gap * p.jitter;
    const geo = buildBrushStrokeOnWall({
      R, baseY, wallH, bed, width, weight: p.weight, seed,
      path: brushGesture({ at, seed, rise: p.rise, climb: p.climb, climbVar: p.climbVar,
                           sweep: p.sweep, bow: p.bow }),
    });
    const k = i % colors.length;
    const wash = {};
    if (p.floor != null) wash.floor = p.floor;
    if (p.bite != null) wash.bite = p.bite;
    if (geo) byColor[k].push(paintBrushColors(geo, colors[k], under, wash));
  }
  return byColor
    .map((list, k) => {
      const geometry = list.length ? mergePenGeometries(list) : null;
      /* ⚠️ HOW THE MERGED BUFFER IS LAID OUT, said here because after the merge nobody can work it
         out. Every stroke in a band has the same grid and the same rim, so the part is `strokes`
         blocks of `stride` vertices, each starting with `topCount` of top surface. Without this a
         caller cannot tell a surface vertex from a side wall, nor read a column index off a vertex
         number — which is exactly what a test tried to do and got NaN for. */
      if (geometry && list[0]) {
        geometry.userData.stride = list[0].attributes.position.count;
        geometry.userData.topCount = list[0].userData.topCount;
        geometry.userData.strokes = list.length;
      }
      return { color: colors[k], geometry };
    })
    .filter(part => part.geometry);
}
