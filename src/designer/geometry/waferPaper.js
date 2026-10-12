import * as THREE from 'three';
import { mulberry32 } from '../utils/random.js';
import { perimeter } from './surface.js';
import { mergePenGeometries } from './creamPen.js';

/* ── Wafer paper, cut into panels and stood around the cake ───────────────────────────────────────
 *
 * The reference cakes: a fence of thin translucent sheets wrapped round the wall, each one cut from
 * a sheet of wafer paper, waved by hand, and pressed onto the buttercream along its top edge so the
 * bottom hangs free and splays outward. Four photographs, four dialects of the same technique —
 * crisp pink rectangles with a notched hem; tall white S-curves; dense rippled ribbons; broad
 * near-flat panels standing almost straight.
 *
 * ── HOW IT IS ACTUALLY MADE, WHICH IS WHAT THE PARAMETERS HAVE TO BE ─────────────────────────────
 * Wafer paper is about 0.3mm of dried starch. A baker cuts a sheet into strips with scissors or a
 * wheel, waves each strip over a finger or a dowel, and sticks it on at the TOP ONLY. It dries
 * holding that curve. So:
 *
 *   · the top edge is pinned to the wall and the bottom is free — every bend grows downward from a
 *     fixed line, which is why `splay` is quadratic in v and zero at the top;
 *   · the curve is in the PAPER, not in the placement — a piece bows across its own width (`curl`)
 *     and waves along its length (`wave`), and those are different gestures that a single "bend"
 *     control would weld together;
 *   · the hem is a CUT, so it is straight, angled, or notched — never rounded. Image 1's zigzag is
 *     scissors; images 2 and 3 are a wavy wheel; image 4 is a plain cut at varying heights.
 *
 * ⚠️ THIS IS NOT THE BRUSHSTROKE AND IT IS NOT A FINISH, and both were checked first.
 *   · `brushStrokeOnCake.js` seats a gesture ON the wall with relief — the paint IS the wall there.
 *     Wafer paper stands OFF it: the gap, and the light coming through it, is the whole look.
 *   · `PaletteKnifeStudio` wraps the wall in a tile. A tile cannot give one panel its own height,
 *     its own wave and its own hem, and the variation between panels is most of what reads as
 *     handmade here.
 *   · `festoon.js` already wraps a strip around the wall and is the right shape of idea — but it
 *     bends an authored GLB, and these panels are cut, not modelled. What is borrowed from it is
 *     the lesson in its header: THE WALL IS A PERIMETER, NOT A CIRCLE. Everything below walks
 *     `perimeter(shape)`, so a sheet cake and a heart get a skirt that follows their outline
 *     instead of a circle of panels hanging in mid-air.
 *
 * ⚠️ EVERYTHING IS × THE TIER, NEVER A WORLD CONSTANT (INVARIANTS #8). Widths and waves scale with
 * the radius, heights with the tier's own height, so one authored look suits a 6" and a 10".
 */

export const WAFER_DEFAULTS = {
  /* How hard the gaps between sheets are darkened. The scene is a near-uniform dome, so without
     this a white skirt on a white cake renders as one flat field — see bakeWaferAO.
     ⚠️ CALIBRATED AGAINST THE REFERENCE PHOTOGRAPH SITTING IN THE SAME SCREENSHOT, which is not a
     detail. The first calibration measured the render against a photograph in a separate file and
     matched its MEAN — but a photograph's mean is its exposure, which is arbitrary, and the two
     files were exposed differently. Sandeep: *"both reference and your work are on the same
     screenshot. why dont you compare."* Right: the harness draws its reference beside the render,
     so one capture, one compression, one display. Measured that way, p5–p95 luminance:

         reference (in frame)   103.3
         ao 0.55                 36.4   35%
         ao 0.73                 60.2   58%   <- what matching the other photo's mean produced
         ao 0.86                 90.4   87%
         ao 1.00                150.6  146%

     ⚠️ ALL OF THE ABOVE IS SUPERSEDED, AND IT WENT STALE WITHOUT ANYONE NOTICING — which is the
     part worth keeping. That sweep ran in the harness, and the harness's material said
     `transmission: 0.35` and left sheen, thickness, grain and specular undefined, so three.js's
     own defaults applied. `ao: 0.86` was therefore fitted against a material no cake has ever had.
     Re-derived with scripts/calibrate-wafer-ao.mjs once all three surfaces mounted ONE material,
     white paper on a white tier, as a percentage of the in-frame reference's p5–p95:

         ao 0.00    7%        ao 0.86   56%
         ao 0.45    8%        ao 1.20   97%
         ao 0.60   15%        ao 1.60  111%

     (at sheen 0.3; at the old sheen 0.9 nothing in the range reached even 60%, which is how the
     sheen turned out to be the bigger lever — see WAFER_PAPER_MATERIAL.sheen.)

     ⚠️ AND MATCHING THAT RANGE WAS STILL THE WRONG TARGET, which is the lesson worth more than the
     number. `ao: 1.2` scored 97% of the reference's p5–p95 and looked like this: *"shadows are so
     dark. wafer looks like a paper with smoke."* A range can be matched from either end. The
     reference reaches its width by having a BRIGHT edge along every sheet; the old ramp reached
     the same width by dragging the midtone down, because it shaded the whole DEPTH of a sheet
     rather than its root. Comparing percentiles instead of the range says it in one line:

                      p5    p50    p95
         reference    72    161    218
         ao 1.2      105    185    232      ← midtone dragged down: the smoke
         ao 2.0, aoFocus 3
                      81    211    232      ← gaps as dark as the reference, faces still paper

     So the dark end is matched and the faces are left alone. See `aoFocus` and bakeWaferAO.
     ⚠️ The render is still brighter overall (mean 193 against 169) and that gap is NOT occlusion —
     it is the bright specular line along each sheet's edge in the photograph, which a near-overhead
     key light cannot put there. A lighting question, written down rather than guessed at.
     Not a per-cake choice: it is what paper in a crowd DOES, like the material. */
  ao: 10.0,
  /* How tightly the gap shading is held to the root — see bakeWaferAO. 1 is the old ramp across
     the whole sheet, which reads as soot; higher keeps the faces clean.
     ⚠️ 10 BECAUSE THE CURVE SATURATES THERE, not because it looked nicest. Rendered on a pink
     tier and measured over the skirt (p5 / p50, where p5 is how dark the deepest crevices get and
     p50 is whether the FACES stayed paper):

         no bake at all        225 / 231     "total white and i can hardly see the paper"
         focus 3,  ao 2.0      127 / 206     "that smoke kind of look"
         focus 6,  ao 3.0      162 / 217
         focus 10, ao 4.0      174 / 220  <- here
         focus 16, ao 6.0      176 / 221     indistinguishable from focus 10

     Past 10 the numbers stop moving: the dark is already a line in the crease rather than a wash
     over the face, and more exponent has nothing left to tighten. */
  aoFocus: 10,
  /* The darkest a crease may go, as a fraction of the paper's own colour. Not a taste setting: it
     is the bounce between two sheets a millimetre apart, and without it `ao` over 1 clips to pure
     black. See bakeWaferAO. */
  aoFloor: 0.12,
  /* How far down the drop the gaps count as roofed over, as a fraction. Above this the channel
     between two sheets is open to the sky and takes no shading at all — see bakeWaferAO. */
  aoOpenTop: 0.40,

  /* ⚠️ AND THE SAME RAMP ON A FIN IS SCORCH. Everything above was measured with the sheets lying
     FLAT, where the occluder is a neighbour overlapping you by two whole widths. Stood on edge the
     occluder is the thin gap at the strip's root — far less of the sky is hidden — so 0.86 darkens
     paper that nothing is shading. Sandeep, on the flat ramp applied to fins: *"the shadows are so
     bad that it looks like burnt paper."* So this is per MOUNTING, which is why it is not in the
     presets: a look is how the paper is cut and pleated, not how deep its own shadow is. An
     explicit `ao` still wins over both. */
  finAo: 0.45,

  /* How many panels go round. Not a spacing, because the spacing that reads right depends on the
     perimeter and a baker thinks in "how many pieces", not in millimetres of gap. */
  /* ⚠️ SWEPT, NOT GUESSED. The first numbers (56 panels, width 1.3, splay 0.26) rendered a hula
     skirt: narrow straps with daylight between them and a flare at the hem. Four renders varying
     one thing at a time said the look wants FEWER, WIDER, more overlapped panels that hug the wall
     — which is also what the photographs show once you stop counting ribbons and start counting
     SHEETS. The ribbons in the references are fold lines, not pieces. */
  count: 30,
  width:  2.20,   // × the mean gap: >1 overlaps its neighbour, which is how every reference looks
  height: 1.00,   // × tier height, measured down from the top edge
  rise:   0.10,   // × tier height, how far the panel stands ABOVE the rim
  taper:  0.08,   // 0 … 1, narrowing toward the hem
  /* ⚠️ THE FOLDS ARE THE LOOK, AND THEY RUN TOP TO BOTTOM. See the note below — this was a
     sideways sway first, and it was the wrong gesture. */
  ripple:  0.26,  // depth of the concertina, × panel width
  ripples: 11,    // how many CREASES across the panel — the reference is fine and dense
  sway:   0.05,   // the secondary lateral drift down the panel, × width
  sways:  1.0,    // how many times it drifts
  curl:   0.14,   // bow ACROSS the width, × width — the cupping that catches light
  splay:  0.03,   // hem pushed away from the wall, × panel height — paper hugs, it does not flare
  lean:   0.04,   // whole panel tilted out from vertical, radians
  /* ── Sheets STACK; they never pass through one another ────────────────────────────────────────
   * Sandeep: *"at few places it looks like the wafer papers are intersecting. that does not happen
   * in real."* Two separate causes, and both needed fixing:
   *
   *   `shingle` — every panel sits a little further out than the one before, like roof tiles, so
   *   there is a definite front-to-back ORDER. Without it every panel sits on the same radius and
   *   only luck keeps two from occupying the same space. It wraps every few panels rather than
   *   ramping all the way round, which would bulge the skirt by the time it got back to the start.
   *
   *   `nest` — the real one. Adjacent pleated sheets lie INTO each other: the ridge of one sits in
   *   the valley of its neighbour, because each is pressed against the one already there. Random
   *   per-panel phases guarantee the opposite — one sheet creasing outward exactly where the next
   *   creases inward, which is an intersection no shingle step can be deep enough to prevent, since
   *   the folds are deeper than the gap between panels. At 1 the crease rhythm is continuous around
   *   the whole cake and sheets cannot cross; at 0 every panel is independent, which is what was
   *   rendering. */
  /* ── The crease lines WANDER ──────────────────────────────────────────────────────────────────
   * Two more references, and both show what a straight pleat cannot: the fold lines snake from side
   * to side as they fall, like water or wood grain. A straight crease reads as a folded fan; a
   * wandering one reads as paper that was waved by hand, which is what these are.
   *
   * ⚠️ NOT `sway`. That moves the whole PANEL and leaves its creases parallel; this moves each
   * CREASE within the panel, so the ribbons flow independently and the sheet still hangs straight.
   *
   * `skew` is what stops them moving as one body: adjacent creases are deliberately slightly out of
   * phase, so the ribbons drift apart and together down the drop. Keep it small — at large values
   * neighbouring creases cross, and a crease that overtakes its neighbour is a sheet folded through
   * itself. */
  /* ⚠️ STILL DEFAULTS TO OFF, AND THE APPROACH IS NOW SUSPECT RATHER THAN MERELY UNFINISHED.
   *
   * The conflict with `nest` was real and is fixed below — the wander has its own phase, continuous
   * around the perimeter, and the crease stagger counts globally instead of restarting at every
   * sheet. That was worth doing and it did not rescue the look. Three attempts, three bad renders:
   * staggered creases shredded, globally-phased creases shredded, whole-sheet wander with no
   * stagger came out as a sheared diagonal comb.
   *
   * ⚠️ SO THE PREMISE IS PROBABLY WRONG, not the tuning. Displacing X by a function of height
   * SHEARS the panel: its top stays put, its lower parts slide sideways, and a sheared rectangle
   * leans. That is what every render has shown. Real wavy ribbons are not sheared sheets — the
   * strip keeps its width and its CENTRELINE curves, which means sweeping the pleat profile along
   * a wavy spine in a frame that rotates to follow it, not offsetting vertices in world X.
   *
   * That is a different panel builder, not another coefficient, so it is not being attempted as a
   * fourth patch. Left in place because the mechanism, the safety cap and the phase separation are
   * all correct and tested — and because switching it on is how the next person reproduces the
   * failure in one click. */
  meander:  0.0,  // × width: how far a crease wanders sideways. 0 = the straight pleat
  meanders: 1.6,  // how many times it wanders down the drop
  meanderLaps: 3, // how many times the wander cycles around the WHOLE cake — low is a slow swell
  skew:     0.35, // radians of phase between neighbouring creases
  shingle: 0.012, // × tier radius, per panel, wrapping
  nest:    0.85,  // 0 … 1: independent phases → one continuous crease rhythm
  jitter: 0.35,   // 0 … 1, how much the panels differ from one another
  hem:    'straight',  // 'straight' | 'notch' | 'torn' | 'round' | 'petal' — see hemProfile
  notch:  0.10,   // × panel height, the depth of the zigzag when hem === 'notch'
  seed:   7,
  /* ── WHICH WAY THE SHEET FACES ────────────────────────────────────────────────────────────────
   * `fin` is wallpaper versus wafer paper, and it is the difference between a render Sandeep
   * rejected four times and one he recognised. Flat lays each sheet ON the wall, so it reads as a
   * pattern printed on the cake; `fin` stands it on EDGE, which is how the paper is actually stuck
   * on: *"wafer paper strips are perpendicularly added to the cake surface."*
   * `finAngle` is how far it is turned from flat — 90° is square to the wall, less is raked. */
  fin:      false,
  finAngle: 90,
  /* Rows down the panel. There is no column count any more: the creases ARE the columns, so
     `ripples` decides the across-width density and `segH` only has to resolve the drop. */
  segH:   14,
};

/* ── The four looks, and the controls that reach them ────────────────────────────────────────────
 *
 * ⚠️ IN CORE, NOT IN THE STUDIO, because they are now offered in two places. These started as
 * `PRESETS` inside WaferPaperStudio — four claims about four reference cakes, each saying how many
 * sheets, how deeply pleated, how far the hem swings. The moment a baker can choose wafer paper on
 * the tier card, a copy in admin is a second answer to "what does Pink, notched hem mean", and the
 * studio's whole point is that what you tune is what the cake gets (root CLAUDE.md rule 1,
 * INVARIANTS #15). The studio imports these.
 *
 * ⚠️ AND THE RANGES TOO. A slider's ends are a claim about what the look can stand — `ripples` past
 * 12 stops reading as folds and `width` under 0.6 opens daylight between the sheets. Two copies of
 * that claim drift, and the one that drifts is whichever screen is edited second. */
export const WAFER_PRESETS = Object.freeze({
  'Pink, notched hem': { count: 30, width: 2.0, height: 0.80, rise: 0.22, taper: 0.02, ripple: 0.16,
    ripples: 2.4, sway: 0.05, curl: 0.12, splay: 0.06, lean: 0.03, jitter: 0.30,
    hem: 'notch', notch: 0.18, colour: '#f2766d', fin: false },
  'White, waved':      { count: 34, width: 2.3, height: 0.95, rise: 0.04, taper: 0.18, ripple: 0.30,
    ripples: 6.0, sway: 0.10, curl: 0.22, splay: 0.08, lean: 0.05, jitter: 0.45,
    hem: 'straight', notch: 0.10, colour: '#fbf7f2', fin: false },
  'White, rippled':    { count: 44, width: 2.0, height: 0.92, rise: 0.02, taper: 0.22, ripple: 0.26,
    ripples: 8.0, sway: 0.12, curl: 0.18, splay: 0.08, lean: 0.03, jitter: 0.50,
    hem: 'torn', notch: 0.12, colour: '#fdfbf7', fin: false },
  /* ⚠️ THE ONLY PRESET MEASURED RATHER THAN EYED, and the only one that stands the sheets on edge.
   * Every number here came out of slicing Sandeep's 3D conversion of the reference cake, not out of
   * looking at a render: median radius 0.70 and a 0.13 ripple over a wall at 0.59, repeating about
   * 110 times — see scripts/measure-wafer-shape.mjs, and `PRESET=` there measures these very values
   * rather than a triple typed into the script.
   *
   * ⚠️ EVERY PRESET NAMES ITS MOUNTING, including the four that are flat. `setTierWafer` MERGES, so
   * a preset that leaves `fin` unsaid inherits whatever the last one set — tap this, then tap
   * "White, waved", and you get a look tuned for flat sheets rendered standing on edge. The tier
   * card's own comment already warns that half-applying a preset gives a cake no reference shows.
   * Shading is NOT here: it belongs to the mounting (see `finAo`). */
  'White, on edge':    { count: 110, width: 3.9, height: 1.18, rise: 0.16, taper: 0.18, ripple: 0.30,
    ripples: 6.0, sway: 0.10, curl: 0.22, splay: 0.08, lean: 0.05, jitter: 0.45,
    hem: 'straight', notch: 0.10, colour: '#fbf7f2', fin: true, finAngle: 90 },
  'White, broad':      { count: 20, width: 2.4, height: 0.98, rise: 0.06, taper: 0.06, ripple: 0.24,
    ripples: 3.0, sway: 0.06, curl: 0.30, splay: 0.06, lean: 0.02, jitter: 0.35,
    hem: 'straight', notch: 0.10, colour: '#ffffff', fin: false },
});

/* Which preset a skirt should ARRIVE in, given the cake it is going onto.
 *
 * ⚠️ THE DEFAULT WAS WHITE WHATEVER THE CAKE WAS, AND ON A WHITE CAKE THAT IS A CONTROL THAT LOOKS
 * BROKEN. The chip applied "White, waved" (#fbf7f2) unconditionally, so turning wafer paper on over
 * white buttercream produced #fbf7f2 sheets against a #ffffff wall — geometrically all there,
 * visually nothing. Sandeep: *"i can hardly see the wafer paper. totally white and hard to
 * differentiate."* A thing that does something has to look like it did something (CLAUDE.md rule 7).
 *
 * ⚠️ IT STILL PREFERS WHITE, and only steps aside when white cannot be seen. White is the right
 * default for a wafer skirt — most reference cakes are exactly that — so this is not "pick a colour
 * for the baker", it is "do not open on an invisible one". A coloured cake keeps the white preset
 * untouched; only a near-white one gets the contrasting preset instead.
 *
 * ⚠️ AND IT CHOOSES A WHOLE PRESET, not a colour of its own invention. The four presets are what the
 * chips below offer, so whatever arrives is one the baker can see selected and step away from in one
 * tap. A computed in-between colour would show no chip as active and could not be returned to.
 */
const relLum = (hex) => {
  const h = String(hex ?? '').replace('#', '');
  if (h.length !== 6) return 1;
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/* Below this the sheets and the wall are the same tone to the eye. 0.12 of relative luminance is
   roughly where a soft-lit edge stops carrying an outline on its own — the four presets sit at
   0.25 (coral) and 0.94–1.00 (the whites), so nothing lands ambiguously near it. */
const WAFER_MIN_CONTRAST = 0.12;

export function waferPresetFor(tierColour, preferred = 'White, waved') {
  const entries = Object.entries(WAFER_PRESETS);
  const base = WAFER_PRESETS[preferred] ?? entries[0][1];
  const wall = relLum(tierColour);
  if (Math.abs(relLum(base.colour) - wall) >= WAFER_MIN_CONTRAST) return { ...base };
  let best = base, bestGap = -1;
  for (const [, preset] of entries) {
    const gap = Math.abs(relLum(preset.colour) - wall);
    if (gap > bestGap) { bestGap = gap; best = preset; }
  }
  return { ...best };
}

/* The customer-facing controls, in the two groups the technique actually has: what the SHEETS are,
 * and how each one is PLEATED. Schema-driven, so `StyleControls` renders them with no per-knob code
 * — the same component the frosting styles already use on this card.
 *
 * ⚠️ THE MATERIAL IS NOT HERE ON PURPOSE. Translucency, diffusion, roughness, sheen and grain are
 * what wafer paper IS, not a choice about this cake — they live in `WAFER_PAPER_MATERIAL` and a
 * baker who turns transmission down has not designed anything, they have made it stop being paper.
 * Same reasoning as the brushstroke band's own split, and the studio keeps those sliders because
 * deciding those numbers is what a studio is for. */
export const WAFER_CONTROLS = Object.freeze({
  sheets: Object.freeze([
    /* ⚠️ 120 AND 4.2 ARE MEASURED ENDS, not room to spare. They were 90 and 3.2, chosen by eye
       while every sheet still lay flat. Slicing Sandeep's 3D scan of the reference cake says it is
       about 110 strips reaching 0.13 off a wall at 0.59 — so the look he kept asking for sat
       OUTSIDE the sliders, and no amount of tuning inside them could arrive at it. A standing fin
       is also thin edge-on, so it needs a width a flat panel never would: width is the strip's
       RADIUS once it is on edge, not its share of the perimeter. See scripts/measure-wafer-shape.mjs. */
    { key: 'count',  label: 'Panels',         min: 8,    max: 120, step: 1 },
    { key: 'width',  label: 'Width',          min: 0.6,  max: 4.2, step: 0.05 },
    { key: 'height', label: 'Height',         min: 0.3,  max: 1.3, step: 0.02 },
    { key: 'rise',   label: 'Rise above rim', min: -0.1, max: 0.4, step: 0.01 },
    { key: 'taper',  label: 'Taper',          min: 0,    max: 0.7, step: 0.02 },
  ]),
  pleat: Object.freeze([
    { key: 'ripple',  label: 'Fold depth',   min: 0,    max: 0.8,  step: 0.02 },
    { key: 'ripples', label: 'Folds across', min: 0.5,  max: 12,   step: 0.1 },
    { key: 'curl',    label: 'Curl',         min: 0,    max: 1,    step: 0.02 },
    { key: 'sway',    label: 'Drift',        min: 0,    max: 0.5,  step: 0.02 },
    { key: 'splay',   label: 'Hem swing',    min: 0,    max: 0.5,  step: 0.02 },
    { key: 'lean',    label: 'Lean',         min: -0.2, max: 0.35, step: 0.01 },
    { key: 'jitter',  label: 'Variation',    min: 0,    max: 1,    step: 0.02 },
  ]),
  /* Its own group because it is not a property of the sheet or of the pleat — it is how the sheet
     is STUCK ON, and it only means anything while `fin` is on. */
  mount: Object.freeze([
    { key: 'finAngle', label: 'Edge angle', min: 30, max: 90, step: 2 },
  ]),
});

/* The cut, named for what a baker does rather than for the code's branch. Four of these trim a
 * strip and two change its SHAPE — see hemProfile, which is the one place that decides. */
export const WAFER_HEMS = Object.freeze([
  { key: 'straight', label: 'Straight' },
  { key: 'notch',    label: 'Zigzag' },
  { key: 'torn',     label: 'Torn' },
  { key: 'round',    label: 'Rounded' },
  { key: 'petal',    label: 'Petal' },
]);

/* ── The CUT: what shape the strip was cut into ──────────────────────────────────────────────────
 *
 * Returns, for a point across the width, what fraction of the full drop that part of the panel
 * reaches. 1 is the whole drop. So a rectangle is flat 1, and every other cut is a curve or a line
 * that takes some of it away.
 *
 * ⚠️ FOUR OF THESE ARE A HEM AND TWO ARE A SILHOUETTE, which is why the parameter is named for the
 * cut rather than for the bottom edge. `straight`, `notch` and `torn` trim the bottom of a strip;
 * `round` and `petal` make the piece a different SHAPE — a half-disc and a leaf — and those are the
 * pieces in the domed reference, where the paper is cut as petals and laid in overlapping rings
 * rather than hung as a fringe.
 *
 * All of them are evaluated per CREASE, so a curve resolves as finely as the pleat does: a petal
 * with four folds is a crude polygon, with twelve it is a petal.
 */
function hemProfile(kind, u01, notch, rnd) {
  if (kind === 'notch') {
    // A zigzag with two teeth across the panel — image 1's hem, which is cut, so it is linear.
    const t = Math.abs(((u01 * 2) % 1) * 2 - 1);
    return 1 - notch * t;
  }
  if (kind === 'torn') return 1 - notch * rnd;
  /* A half-disc: longest down the middle, falling to nothing at both edges. `notch` keeps a flat
     band at the top so the piece still has a straight glued edge — a true semicircle would come to
     a point at its two top corners and have almost nothing to stick on with. */
  if (kind === 'round') {
    const t = (u01 - 0.5) * 2;
    return notch + (1 - notch) * Math.sqrt(Math.max(0, 1 - t * t));
  }
  /* Fuller than a half-disc — a leaf rather than a fan blade. The exponent is the whole difference,
     and it goes the opposite way to intuition: a half-disc is `^0.5`, so anything SMALLER keeps the
     shoulders wide and anything larger pinches them. 0.62 was the first value here and made the
     petal thinner than the half-disc, which is the opposite of what it is for. */
  if (kind === 'petal') {
    const t = (u01 - 0.5) * 2;
    return notch + (1 - notch) * Math.pow(Math.max(0, 1 - t * t), 0.34);
  }
  return 1;
}

/**
 * ONE panel, in its own space: the top edge lies along X, the panel hangs down −Y, and +Z is
 * outward from the cake. The top edge sits at y = 0, so a caller positions by the pinned edge —
 * the only part of a real panel whose position is known.
 */
export function waferPanel({
  width = 1, height = 1, taper = WAFER_DEFAULTS.taper,
  ripple = WAFER_DEFAULTS.ripple, ripples = WAFER_DEFAULTS.ripples,
  sway = WAFER_DEFAULTS.sway, sways = WAFER_DEFAULTS.sways, phase = 0,
  meander = WAFER_DEFAULTS.meander, meanders = WAFER_DEFAULTS.meanders,
  skew = WAFER_DEFAULTS.skew, meanderPhase = 0, creaseOffset = 0,
  curl = WAFER_DEFAULTS.curl, splay = WAFER_DEFAULTS.splay, fin = false,
  hem = WAFER_DEFAULTS.hem, notch = WAFER_DEFAULTS.notch,
  segH = WAFER_DEFAULTS.segH, rng = Math.random,
} = {}) {
  /* ── A FOLD IS A CREASE, NOT A WAVE, and this is the whole texture ─────────────────────────────
   *
   * Sandeep, twice: *"it does not look like wafer paper"*, then *"ours is not looking like paper
   * still"*. The second time with the reference beside it, and the photograph says it plainly —
   * every sheet is a run of FLAT facets meeting at sharp lines, with a bright edge on one side of
   * each crease and a dark one on the other. That fine, high-contrast line structure is what the
   * eye reads as folded paper.
   *
   * ⚠️ WHAT I HAD WAS `Math.sin` ACROSS THE WIDTH, SMOOTH-SHADED. Two faults compounding:
   *   1. a sine has no crease — the surface curves continuously, which is a corrugation, not a
   *      pleat. Corrugated anything reads as fabric or plastic sheet.
   *   2. `computeVertexNormals()` then AVERAGES the normals right across it, so even the little
   *      curvature there was came out as a soft gradient. Satin.
   *
   * A fold in paper is C0: position continuous, normal DISCONTINUOUS. You cannot get that from a
   * smooth function and shared vertices — the crease has to be built. So each facet is emitted as
   * its own strip with its OWN vertices, sharing nothing with its neighbours, and the normal jumps
   * at every crease because there is nothing there to average with.
   *
   * The cost is vertices: `folds + 1` columns become `folds × 2`. At 6 folds that is 12 columns
   * instead of 7 for a panel nobody counts triangles on, and it buys the only thing that made the
   * material read wrong after the transmission was fixed.
   */
  const folds = Math.max(1, Math.round(ripples));
  const rows  = Math.max(2, segH | 0) + 1;

  /* ⚠️ THE WANDER IS BOUNDED BY THE CREASE SPACING, NOT BY THE PANEL WIDTH, and the first version
   * was not — which rendered a shredded mess. Creases sit `width / folds` apart; the stagger moves
   * neighbours relative to one another by about `meander × width × skew`. Let that exceed the
   * spacing and a crease OVERTAKES its neighbour, which is a sheet folded through itself. At 16
   * folds with meander 0.30 and skew 0.30 the relative movement was five times the gap.
   *
   * So the stagger is capped here rather than left to the caller to get right. The slider then
   * cannot produce the failure at all: past the cap the sheet simply meanders as one body, which is
   * a look (the broad snaking ribbons of the second reference) rather than a fault. */
  const spacing  = 1 / folds;
  const skewSafe = meander > 1e-6 ? Math.min(skew, (0.85 * spacing) / meander) : skew;

  // One depth per CREASE, drawn once. Varying it per crease is what stops a pleated sheet reading
  // as machine corrugation — a hand-folded strip is never evenly spaced.
  const creaseDepth = Array.from({ length: folds + 1 }, (_, j) =>
    (j % 2 ? 1 : -1) * (0.75 + 0.5 * rng()));
  // One hem per crease too, so a torn edge is a property of the fold rather than of a vertex.
  const tear = Array.from({ length: folds + 1 }, () => rng());

  const pos = [], uv = [], idx = [];
  let base = 0;

  // Where a crease sits across the panel, and how far it stands off the wall at height vv.
  /* A fin is ONE strip of paper: it has one length, varied between strips, not across itself.
     `hemProfile` by u01 is right lying flat (a torn edge running sideways) and wrong stood on edge,
     where that axis is the radius — it cuts each strip on a slope and the skirt hangs short. */
  const finDrop = fin ? hemProfile(hem, rng(), notch, rng()) : 1;
  const creaseAt = (j, vv) => {
    const u01 = j / folds;
    const drop = fin ? finDrop : hemProfile(hem, u01, notch, tear[j]);
    const vvj  = vv * drop;
    const w    = width * (1 - taper * vvj);
    const u    = (u01 - 0.5) * w;
    /* A pleat is pinched where it is glued, opens as it falls, and is PRESSED FLAT AGAIN where it
     * meets the board — the sheet is resting on something. So `open` is a bump, not a ramp.
     *
     * ⚠️ IT WAS A RAMP, AND THE TEST SAID THE HEM WAS LEVEL WHILE THE RENDER SHOWED A SAWTOOTH.
     * Both were right: the hem IS level in Y, and with the fold at its deepest exactly there, each
     * crease's hem sits at a different DEPTH — which a camera looking slightly down projects as a
     * zigzag. A test measuring Y cannot see that, and it is why the render still has to be looked
     * at after the test goes green. Closing the pleat into the board fixes the silhouette and is
     * also what the paper actually does. */
    const open  = 0.35 + 0.65 * Math.sin(Math.PI * Math.pow(vvj, 0.75));
    const fold  = ripple * width * open * creaseDepth[j];
    const drift = sway * width * Math.sin(phase * 0.7 + vvj * sways * Math.PI * 2);
    /* This crease's own wander.
     *
     * ⚠️ IT TAKES ITS OWN PHASE, NOT THE CREASE RHYTHM'S, and conflating the two is what made this
     * unusable when it first landed. `phase` is what `nest` turns into a large position-derived
     * number so the PLEAT runs continuously around the cake; feeding that to the wander as well
     * made neighbouring panels snake in opposite directions and cross each other — creases stayed
     * ordered within a panel and the sheets still passed through one another between panels.
     * `meanderPhase` advances slowly and continuously around the perimeter instead, so adjacent
     * panels wander very nearly in step.
     *
     * ⚠️ AND THE STAGGER COUNTS CREASES GLOBALLY, for the same reason. `j` restarts at 0 on every
     * panel, so a per-panel `j * skew` jumped by the whole accumulated stagger at each boundary —
     * continuous within a sheet, discontinuous exactly where two sheets meet, which is the one
     * place it shows. `creaseOffset` is how many creases have already gone by. */
    const snake = meander * width
                * Math.sin(meanderPhase + (creaseOffset + j) * skewSafe + vvj * meanders * Math.PI * 2);
    // The bow across the whole sheet, so a pleated panel still curves around the cake.
    const bow   = curl * width * (Math.pow((u01 - 0.5) * 2, 2) - 1 / 3);
    /* ⚠️ NOTHING GOES INSIDE THE WALL. +Z is outward, so a negative z is a sheet passing THROUGH the
     * cake — which is what was happening: `bow` and `fold` both swing either way, and where they
     * summed negative the panel sat inside the tier's radius. Above the rim that put paper over the
     * cake's top FACE, which is where Sandeep saw it: looking down, spikes inside the ring.
     *
     * Clamping at 0 is not a cheat, it is what the paper does. A pleated sheet pressed onto a wall
     * rests its VALLEYS against it and stands its ridges off; the valley cannot continue inward,
     * there is cake there. The flat spots the clamp creates are the contact patches. */
    /* ⚠️ A FIN IS NOT THE FLAT PANEL TURNED SIDEWAYS. Two things break when it is:
         1. `u = (u01 - 0.5) * w` CENTRES the strip on the wall, so half of every fin is inside the
            cake. A strip is stuck ON — it starts at the surface and reaches out.
         2. `fold` zig-zags across the WIDTH. Lying flat that is pleats running down the wall,
            correct. Stood on edge the width is the RADIUS, so it corrugates the fin front-to-back
            and every strip renders as a stiff comb tooth. A ribbon waves along its LENGTH, most at
            the free edge where nothing holds it. */
    if (fin) {
      const t    = u01;                                   // 0 at the wall, 1 at the free edge
      const wave = ripple * w * t * Math.sin(phase + vvj * ripples * Math.PI * 2);
      return { x: t * w + snake, y: -height * vvj, z: wave + bow * t + drift, u01 };
    }
    const z = bow + fold + splay * height * vvj * vvj;
    return { x: u + drift + snake, y: -height * vvj, z: Math.max(0, z), u01 };
  };

  for (let f = 0; f < folds; f++) {
    for (let j = f; j <= f + 1; j++) {          // the facet's own two creases, its own vertices
      for (let i = 0; i < rows; i++) {
        const p = creaseAt(j, i / (rows - 1));
        pos.push(p.x, p.y, p.z);
        uv.push(p.u01, 1 - i / (rows - 1));
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      const a = base + i, b = a + 1, c = base + rows + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    base += rows * 2;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  // Smooth DOWN each facet, hard ACROSS every crease — which is exactly what the split vertices
  // above buy. Nothing here needs `toNonIndexed`: the seam is in the topology, not in the shading.
  g.computeVertexNormals();
  return g;
}

/**
 * The whole skirt: panels walked round the tier's own perimeter.
 *
 * `shape` is tierShape()'s output, so round, rect, heart and glyph all work — see the note above
 * about why this walks a perimeter rather than a circle.
 *
 * Returns one merged geometry in CAKE space, with y = 0 at the tier's top edge, so the caller
 * positions it by the rim rather than by the floor.
 */
/* ── What darkens a white skirt on a white cake ──────────────────────────────────────────────────
 *
 * ⚠️ THE SCENE'S LIGHT IS VERY NEARLY A UNIFORM DOME, so geometry alone carries almost no shading
 * and a white sheet in front of a white wall renders as one flat field. MEASURED, not guessed:
 * against a reference photograph of a real wafer skirt the rendered wall had a p5–p95 luminance
 * range of 10.8 where the photograph has 80.1 — a seventh of the tonal range, and the reason for
 * *"i can hardly see the wafer paper. totally white"* and then, after the sheets were made four
 * times denser, *"still cant see anything. total white."* Density moved it to 12.1. It was never
 * the geometry.
 *
 * ⚠️ AND THIS REPO ALREADY KNEW. `bakeCreaseAO` (creamWall.js) exists for exactly this: the piped
 * wall is a row of ropes that read as flat pickets until occlusion was baked into vertex colours
 * and calibrated against a photograph. A wafer skirt is the same problem — a crowd of thin sheets
 * whose gaps the sky cannot reach — and it shipped without the same answer.
 *
 * The ramp is on the panel's LOCAL z, which `waferPanel` builds as 0 at the wall and positive
 * outward, so it works the same on a round tier and a sheet one without knowing which it is on. The
 * `acos` shape is borrowed from bakeCreaseAO rather than a linear fade: occlusion falls off fast as
 * a surface turns toward the sky and then flattens, which is what makes a crease read as a crease
 * instead of a gradient.
 */
export function bakeWaferAO(geo, ao = WAFER_DEFAULTS.ao, fin = false,
                            aoFocus = WAFER_DEFAULTS.aoFocus,
                            aoFloor = WAFER_DEFAULTS.aoFloor,
                            aoOpenTop = WAFER_DEFAULTS.aoOpenTop) {
  const pos = geo?.getAttribute?.('position');
  if (!pos || !(ao > 0)) return geo;
  /* ⚠️ WHICH AXIS IS "AWAY FROM THE WALL" DEPENDS ON HOW THE SHEET IS MOUNTED, and getting it wrong
     does not look like bad occlusion — it looks like scorching. Lying flat the depth is local Z, so
     the ramp darkens what is tucked toward the wall. Stood on edge local Z is the WAVE axis and
     local X is the radius, so the same ramp paints a gradient ACROSS each strip's face, light on
     one side of every wave and dark on the other. Sandeep: *"the shadows are so bad that it looks
     like burnt paper."* Right — and it is the fourth thing in this file whose meaning turns with
     the panel, after the fold, the hem and the mounting sign. */
  /* ⚠️ HOW FAST THE GAP OPENS, and it is the difference between occlusion and soot. The ramp was
     `acos(2u-1)/π`, a smooth S across the WHOLE depth: at the middle of a sheet it returns 0.5, so
     with the shading strong enough to read, the middle of every face was darkened to 40% and the
     skirt came out streaked with grey. Sandeep: *"shadows are so dark. wafer looks like a paper
     with smoke."* ⚠️ It survived turning the shadow map off, which is how it was pinned on the bake
     rather than on shadow acne.
     A real gap is not like that. Light reaches most of a sheet and falls away only near the ROOT,
     where its neighbours close in — so the falloff is a power, and the exponent says how tightly
     the dark is held there. At 3: free edge 0, middle 0.125, root 1. The faces stay paper and the
     contrast comes from the gaps, which is where the reference's contrast comes from too. */
  const focus = Math.max(1, aoFocus);
  const axis = fin ? 'getX' : 'getZ';
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) { const v = pos[axis](i); if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1e-6, hi - lo);
  /* ⚠️ A GAP IS OPEN AT THE TOP, and the bake had no idea how high a vertex was. Depth from the
     wall is only half of what decides whether light reaches a point: the other half is whether the
     sky can see it. The top of the channel between two sheets is wide open — the key light is near
     overhead and falls straight in — while the same channel a few centimetres down is roofed by
     the sheets on either side. Shading by depth ALONE darkens both equally, so the crown came out
     as a ring of near-black notches exactly where a real skirt is at its brightest, which is why
     it reads as wrong rather than merely dark. Sandeep: *"that black part is still there… thats
     not how it looks when you really add a wafer paper."*
     ⚠️ And it is the fifth quantity in this file that was written for one pose and breaks in
     another, after the fold, the hem, the mounting sign and the AO axis — this one simply left a
     whole dimension out. */
  let yTop = -Infinity, yBot = Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > yTop) yTop = y; if (y < yBot) yBot = y; }
  const drop = Math.max(1e-6, yTop - yBot);
  const lip = Math.max(1e-6, aoOpenTop);

  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, (pos[axis](i) - lo) / span));   // 1 at the free edge, 0 at the wall
    /* How far below the open top this vertex sits, as a fraction of the drop: 0 at the rim, 1 once
       it is `aoOpenTop` of the way down and properly roofed over. */
    const roofed = Math.min(1, ((yTop - pos.getY(i)) / drop) / lip);
    const phi = Math.pow(1 - u, focus) * roofed;                      // 0 in the open, 1 deep in a gap
    /* ⚠️ IT DECAYS TOWARD A FLOOR; IT DOES NOT RUN INTO ONE. Two separate mistakes were here.
       First the line was `Math.max(0, 1 - ao*phi)`: with `ao` above 1 that goes negative at the
       root and clips to PURE BLACK, which is not what a crease in white paper looks like at any
       exposure — light bounces into it from the sheets on either side. Sandeep, once the focus was
       tight enough to see it: *"black think is still there."* It shows worst at the rim, where you
       meet that band head-on instead of at a glance.
       ⚠️ Then `Math.max(aoFloor, …)` fixed the black and broke the paper: a linear ramp against a
       floor means every vertex past the crossing sits at EXACTLY the floor, so at ao 4 / focus 10
       the inner 17% of every panel became one flat grey — measured, contrast fell from 74% of the
       reference to 24%, back inside the "i can hardly see the paper" range it came from.
       An exponential has neither problem: it is steepest where the gap closes, never reaches the
       floor, and never passes it. */
    const shade = aoFloor + (1 - aoFloor) * Math.exp(-ao * phi);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildWaferSkirt({ shape, tierHeight = 1, radius = 1, ...opts } = {}) {
  const o = { ...WAFER_DEFAULTS, ...opts };
  /* ⚠️ `ao` FOLLOWS THE MOUNTING UNLESS THE CALLER SAYS OTHERWISE — see `finAo`. It has to read
     `opts`, not `o`: after the merge above every key is present, so there is no longer any way to
     tell "the caller chose 0.86" from "the caller said nothing". */
  if (opts.ao == null) o.ao = o.fin ? o.finAo : WAFER_DEFAULTS.ao;
  const perim = perimeter(shape ?? { kind: 'round', radius });
  if (!perim?.length) return null;

  const n = Math.max(1, o.count | 0);
  const gap = perim.length / n;                 // the arc each panel owns
  const w   = gap * o.width;                    // > gap means it overlaps its neighbours
  const h   = tierHeight * o.height;
  const rnd = mulberry32((o.seed | 0) >>> 0);
  const j   = Math.max(0, Math.min(1, o.jitter));

  // ± a fraction of the value, so jitter=0 is "every panel identical" and the knob is linear.
  const vary = (base, amount = 1) => base * (1 + (rnd() * 2 - 1) * j * amount);

  /* How many panels overlap one another tangentially, which is how many distinct shingle layers are
     needed before the pattern may repeat. A panel `width` gaps wide covers that many neighbours. */
  const layers = Math.max(2, Math.ceil(o.width) + 1);
  const rOuter = radius || 1;

  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (k + 0.5) * gap;
    const at = perim.at(s);
    const lift = (k % layers) * o.shingle * rOuter;
    /* ── THE HEM IS LEVEL; THE CROWN IS RAGGED ───────────────────────────────────────────────────
     * Straight off the reference, and it is a fact about gravity rather than about cutting. The
     * sheets are long enough to reach the board and they REST on it, so their bottoms line up
     * whatever else varies — while the tops stand above the rim by however much each strip had
     * left over. Ragged at the top, level at the bottom.
     *
     * ⚠️ I HAD IT UPSIDE DOWN. Jittering `height` varies the HEM, which gave a sawtooth of spikes
     * along the bottom and a flat line at the top — the photograph's silhouette inverted. So the
     * jitter goes on the rise, and each panel's drop is derived from it: top moves, hem does not. */
    const rise = vary(tierHeight * o.rise, 1);
    /* Occlusion baked per PANEL, in its own frame, before it is turned onto the wall. */
    const panel = waferPanel({
      width: vary(w, 0.35), height: h + rise, taper: o.taper,
      ripple: vary(o.ripple, 0.5), ripples: vary(o.ripples, 0.35),
      sway: vary(o.sway, 0.7), sways: vary(o.sways, 0.4),
      meander: vary(o.meander, 0.4), meanders: vary(o.meanders, 0.3), skew: o.skew,
      /* Continuous around the cake: `laps` full cycles over the whole perimeter, so the wander is a
         slow global wave rather than a per-panel accident. */
      meanderPhase: (s / perim.length) * o.meanderLaps * Math.PI * 2,
      /* How many creases lie between the start of the perimeter and this panel, so the stagger does
         not restart at every sheet. Creases sit `width × gap / folds` apart on the wall. */
      creaseOffset: (s * Math.round(o.ripples)) / (o.width * gap),
      /* The crease rhythm carried around the cake rather than redrawn per panel: a panel's phase is
         where it SITS on the perimeter, so its creases continue its neighbour's. `nest` blends
         between that and an independent draw. */
      phase: o.nest * (s / gap) * o.ripples * Math.PI * 2 * (1 - 1 / Math.max(1, o.width))
           + (1 - o.nest) * rnd() * Math.PI * 2,
      curl: vary(o.curl, 0.5), splay: vary(o.splay, 0.5),
      hem: o.hem, notch: o.notch, segW: o.segW, segH: o.segH, rng: rnd, fin: !!o.fin,
    });
    bakeWaferAO(panel, o.ao, !!o.fin, o.aoFocus, o.aoFloor, o.aoOpenTop);

    /* Stand it on the wall. The panel's +Z must become the perimeter's OUTWARD normal, so the
       rotation is the angle of that normal — taken from the normal itself rather than from the
       angle round a circle, which is the move that makes a sheet cake work (festoon.js's lesson:
       on a rect wall the normal is constant along a face and turns only at the corners). */
    const m = new THREE.Matrix4();
    /* ⚠️ `fin` IS WHICH WAY THE SHEET FACES, and it is wallpaper versus wafer paper. Flat puts the
       panel's FACE on the wall and the sheet lies on the cake. A real skirt is strips stood on
       EDGE: *"wafer paper strips are perpendicularly added to the cake surface."* `finAngle` is how
       far they are turned — a full 90 leaves no tangential width to cover the wall, and the
       reference's strips overlap like scales, so they are turned most of the way, not all. */
    /* ⚠️ MINUS, NOT PLUS, AND A RENDER CANNOT TELL YOU WHICH. `makeRotationY(t)` sends local +X to
       (cos t, −sin t); at `yaw` that is the tangential direction, which is what lying flat wants.
       Turning by +90° sends it to −(outward) — so every strip grew INWARD through the middle of
       the cake, and what showed outside was only its wave. On screen that reads as "too sparse",
       which is what I spent two renders chasing. The test that measures the minimum radius of the
       built skirt found it in one: 0.011 against a tier radius of 1. */
    const yaw = Math.atan2(at.nx, at.nz) - (o.fin ? (o.finAngle ?? 90) * Math.PI / 180 : 0);
    m.makeRotationY(yaw);
    // Lean the panel out from the wall, about its own pinned top edge.
    m.multiply(new THREE.Matrix4().makeRotationX(-vary(o.lean, 1)));
    // Shingled outward along the wall's own normal, so a rect wall tiles as correctly as a round one.
    m.setPosition(at.x + at.nx * lift, rise, at.z + at.nz * lift);
    panel.applyMatrix4(m);
    out.push(panel);
  }

  const merged = mergePenGeometries(out);
  if (merged) merged.computeVertexNormals();
  return merged;
}
