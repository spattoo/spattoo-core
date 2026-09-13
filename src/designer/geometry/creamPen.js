import * as THREE from 'three';

// ── Cream Pen (freehand piping) geometry ─────────────────────────────────────
// Ported from the admin prototype (FreehandPenStudio). LINE style only — the shell
// and rosette styles were dropped (they didn't read well). A stroke is the nozzle's
// cross-section profile swept along a centerline: a round tip gives a smooth rope, an
// open star gives a ribbed rope with grooves down its length, French gives fine ribs.
//
// IMPORTANT: the points handed to buildPipingStroke are the SEATED centerline already —
// the draw layer offsets each pointer hit along the surface normal (by the rope radius)
// at capture time, so the cream rests on the cake. This module is pure geometry: it just
// sweeps the profile through the stored points. That keeps design.piping a plain list of
// [x,y,z] points that fully determines the mesh on reload.

// A piping tip is a CROSS-SECTION at unit radius (max reach = 1); thickness scales it.
//
// Real cream ribs are PUFFY ROUNDED LOBES, not sharp spikes — a star nozzle squeezes the
// cream into smooth ridges with rounded tops and rounded valleys. We build the cross-section
// from a cosine so the radius eases between ridge (r = 1) and valley (r = 1 - depth) instead
// of the old straight-line star (which swept into a hard-edged gear). `lobes` = rib count,
// `depth` = groove depth (0 = round … higher = deeper grooves). Sampled densely so the
// rounded ribs read smoothly once normals are computed.
/* ⚠️ ROUNDED CRESTS, SHARP VALLEYS — and it used to be rounded at both ends. The note above is
 * half right: a rib IS a puffy rounded ridge, so the old straight-line star (a hard-edged gear) was
 * wrong to replace. But the line BETWEEN two ribs is not a rounded trough, it is a CREASE, where two
 * faces of cream fold into each other — that is what draws the crisp dark line down a piped stroke,
 * and a bare cosine has no crease in it at all. The exponent sharpens the valley and broadens the
 * crest without touching either extreme: below 1 the profile leaves the valley faster than a cosine
 * and dwells longer at the ridge. Judged against a photograph of one vertical line of star piping.
 */
/* ── WHAT COMES OUT OF A STAR TIP ────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE V IS NARROW AND THE POINTS ARE BROAD, and those are two different numbers. A plain star
 * polygon ties them together: its cut starts the moment the last one ended, so the "points" are
 * wedges and the valleys between them are as wide as the points themselves. A piped line is the
 * opposite — fat round lobes sitting shoulder to shoulder with a NARROW SLOT between each pair.
 *
 * ⚠️ AND DEEPENING A STAR DOES NOT NARROW ITS V. It narrows the angle at the bottom, but it does so
 * by pulling the inner radius in, which thins the whole stroke: the silhouette comes in with it and
 * you get a thin spiky thing rather than a fat ribbed one. Rendered 0.55 / 0.72 / 0.84 to be sure.
 * The V's width is ANGULAR and belongs to its own parameter.
 *
 * So each point is an ARC AT FULL RADIUS over most of its share of the circle, and the V is a wedge
 * cut into the gap between two of them. `notch` is that wedge's angular width as a fraction of one
 * point's span: small = a narrow slot between fat lobes, 1 = the plain star polygon again.
 *
 * ⚠️ SIX SHAPES WERE TRIED BEFORE THIS and each is recorded because each is wrong in its own way: a
 * COSINE (smooth at both ends — no fold anywhere, sweeps as soft flutes); `|sin|^0.7` (a cusp in the
 * crease but a domed point — a flower tip); a TRIANGLE WAVE in r(θ) (corners, but bowed sides); a
 * STAR POLYGON (right aperture, swept as though cream were sheet metal); a star polygon with
 * smoothed corners (rounder, but the middle of every cut still dead straight); and a ROSETTE OF
 * CIRCLES (round at last, but two round things meeting make a WIDE V, which is the one thing this
 * needed not to be).
 */
/* ⚠️ ONE, i.e. a plain star polygon — the cut begins where the last one ended. Narrowing it was
 * tried and is wrong: it fattens each lobe into a broad round column, and the photograph's sides are
 * NARROWER than that, not wider. Narrow sides come from MORE POINTS, not from a narrower notch. The
 * knob stays because a wider lobe is a real tip (a drop-flower), but the piping star is 1. */
const LOBE_NOTCH = 1;            // the V's angular width, as a fraction of one point's span

function lobedProfile(lobes, depth, notch = LOBE_NOTCH, perArc = 14, perV = 4) {
  const span = (Math.PI * 2) / lobes, half = span / 2, nw = notch * half;
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const out = [];
  /* ⚠️ EVERY CORNER IS EMITTED TWICE, and without that the star has no edges at all.
   *
   * `computeVertexNormals` averages the faces meeting at a vertex. A point and a V floor are each
   * shared by the two faces either side of them, so a single vertex there gets the MEAN of the two
   * — and the ridge it was supposed to be rolls over into a smooth shoulder. On screen, neighbouring
   * faces come out at almost the same brightness and read as ONE merged face; the wall looks like a
   * wide flat panel with a couple of faint lines on it rather than a row of ribs.
   *
   * Duplicating the corner gives each face its own vertex and therefore its own normal, which is
   * what makes a crease a crease. The zero-area quad between the pair costs nothing: it contributes
   * no face normal and draws no pixels.
   */
  const corner = (p) => { out.push(p); out.push(p); };
  for (let k = 0; k < lobes; k++) {
    const c = k * span;
    // The lobe: an arc at full radius — or a single sharp point when the notch takes the whole span.
    const arc = 2 * (half - nw);
    if (arc < 1e-4) corner(at(c, 1));
    else {
      for (let j = 0; j <= perArc; j++) {
        const p = at(c - half + nw + arc * (j / perArc), 1);
        if (j === 0 || j === perArc) corner(p); else out.push(p);   // the arc's own two shoulders
      }
    }
    // The slot's sides, with its floor doubled for the same reason.
    for (let j = 1; j < perV; j++) out.push(at(c + half - nw * (1 - j / perV), 1 - depth * (j / perV)));
    corner(at(c + half, 1 - depth));
    for (let j = perV - 1; j >= 1; j--) out.push(at(c + half + nw * (1 - j / perV), 1 - depth * (j / perV)));
  }
  return out;
}

function roundProfile(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([Math.cos(a), Math.sin(a)]); }
  return out;
}

/* ── A PETAL APERTURE, which is not a radius ─────────────────────────────────────────────────────
 *
 * ⚠️ EVERY PROFILE ABOVE IS r(theta) — a radius swept round a centre. That covers every ROPE tip
 * (round, star, French) and it cannot express a petal tip at all. A #104 is a SLIT: a teardrop,
 * thick and rounded at one end, tapering to almost nothing at the other. There is no centre and no
 * radius; it is just a closed shape.
 *
 * That difference is the whole reason buttercream flowers exist. A rope tip makes the same rope
 * whichever way you hold it, so nobody has ever had to care which way up it was. A petal tip makes a
 * RIBBON, and which way up you hold it — and how you turn your wrist through the stroke — is the
 * entire technique. See the `up` frame in pushSweep.
 *
 * Local axes, and they matter:
 *   y  -1 = the WIDE end (rests on the surface / points at the flower's centre)
 *      +1 = the THIN end (stands away, and is what gives a petal its feathered edge)
 *   x  across the slit — the sheet's thickness, fat at the base and vanishing at the tip
 */
function petalProfile(n = 36) {
  const side = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;                                   // 0 at the wide end, 1 at the thin one
    // Fat and rounded at the base, easing away to a hair at the tip. The floor keeps it a solid
    // rather than a zero-thickness sheet, which would shade like paper and z-fight against itself.
    const w = 0.40 * Math.pow(1 - t, 0.65) + 0.022;
    side.push([w, -1 + 2 * t]);
  }
  return [...side, ...side.map(([x, y]) => [-x, y]).reverse()];
}

/* ── THE SECTION A REAL PIPED STROKE ACTUALLY HAS ───────────────────────────────────────────────
 *
 * ⚠️ IT IS A COSINE, AND EVERY SHARP STAR ABOVE IS TOO DEEP AND TOO FACETED. This is not another
 * guess. A generated mesh of one vertical stroke was sliced at nineteen heights and the resulting
 * r(θ) loop was run through a DFT. What came back, at every single height:
 *
 *     eight lobes, amplitude 17% of the mean radius, and NOTHING above the rib frequency
 *     (the 16th harmonic 2.5%, the 24th indistinguishable from noise)
 *
 * A shape with corners cannot do that — a triangle wave puts 1/9 of its energy in the third
 * harmonic, and a star polygon more. Zero harmonics means a pure cosine. So the section is
 *
 *     r(θ) = 1 + a·cos(lobes·θ),   a ≈ 0.18
 *
 * which is a CUT OF 29% between crest and valley, against the 50% our star8 was cutting. Ours was
 * both twice as deep and made of flat panels.
 *
 * ⚠️ AND THE CREASE IS NOT GEOMETRY — IT IS THE VALLEY BEING DARK. The note above rejected a cosine
 * because it has "no fold anywhere". That was the right observation about the shape and the wrong
 * conclusion about the cause. The crisp dark line down a photographed stroke is light failing to
 * reach the bottom of a groove; it is shading, not a crease. A cosine was tried and dismissed at a
 * point when bakeCreaseAO was measuring over the wrong range and could only reach about a third of
 * its darkness — so of course it swept as soft flutes. Fix the occlusion, not the silhouette.
 *
 * ⚠️ FLAT PANELS ALSO CANNOT SHOW A RIB UNDER THIS LIGHT. Our dome is near-uniform (measured earlier
 * in the same sitting: roughness, sheen and clearcoat each changed the render by nothing). One flat
 * facet has ONE brightness, so eight facets come out at eight nearly-equal brightnesses and merge
 * into a panel — which is exactly what was reported, over and over, for a whole day. A rounded rib
 * sweeps its normal through the full angle across its own width, so it carries a bright band on the
 * crest and a dark line in the crease no matter how flat the lighting is.
 *
 * The profile is normalised to a MAX radius of 1 so `thickness` keeps meaning crest-to-crest.
 */
/* ⚠️ A PIPED STROKE IS A BUNDLE OF LOBES, NOT A CYLINDER WITH GROOVES IN IT — and that is a
 * difference in construction, not in any parameter. Everything above builds the section as a
 * surface of revolution whose radius waves: `1 + amp·cos(Lθ)`, shaped and sharpened and beaten
 * against sidebands. However far that is pushed, every crest is still a bump ON a cylinder, the
 * silhouette stays a nearly straight line with small notches in it, and the thing reads as a fluted
 * column. A photograph of one piped line is the other way round: each rib is very nearly its own
 * round TUBE, the tubes bulge out and overlap their neighbours, and the silhouette is scalloped by
 * whole lobes rather than nicked by grooves.
 *
 * So the section is the UNION of `lobes` circles whose centres sit on a ring. For a circle of
 * radius `rl` centred one unit out, the union's radius at φ from that centre is
 * `cos φ + √(rl² − sin²φ)`, and the section takes the largest over all the lobes. Where two circles
 * cross, the surface folds — a real cusp, not a smoothed minimum — and how deep that fold goes is
 * set by one number: at `rl` just above `sin(π/lobes)` the circles barely reach each other and the
 * cut is deep, and it shallows as they are fattened. Measured on a ten-lobe tip: 0.45 cuts 12%,
 * 0.34 cuts 18%, 0.31 cuts 26%.
 *
 * ⚠️ This was tried once before and written off as "two round things meeting make a WIDE V, which
 * is the one thing this needed not to be". That was judged against a star tip's narrow slot. The
 * photograph's V is wide and soft, so the objection was to the wrong target.
 */
/* ⚠️ `boost` STANDS THE LOBES UP, and without it a union of circles can only ever bulge. The crest's
 * curvature is locked to `rl` — a circle is as round at the top as it is at the side — so the ribs
 * come out as broad arcs and read as swells rather than as projections. Stretching every point's
 * deviation from the ring it sits on makes each lobe taller against its own width without moving
 * where the lobes or the seams are: measured on twelve lobes at rl 0.27, a rib stands 0.42 of its
 * own width at boost 1 and 0.73 at 1.8, and the cut deepens 18% → 28% with it. That ratio is what
 * "the projections are not sharp" is about — not the crest's radius and not the groove's depth on
 * its own. */
function lobeProfile(lobes, rl, n = 20, squash = 1, boost = 1) {
  const out = [], shade = [], N = lobes * n, span = (Math.PI * 2) / lobes;
  const one = (phi) => {
    const t = rl * rl - Math.sin(phi) * Math.sin(phi);
    return t > 0 ? Math.cos(phi) + Math.sqrt(t) : -Infinity;
  };
  const radius = (a) => {
    let best = -Infinity;
    for (let k = 0; k < lobes; k++) {
      let d = a - k * span;
      d = Math.atan2(Math.sin(d), Math.cos(d));            // wrap to ±π
      const v = one(d);
      if (v > best) best = v;
    }
    return best;
  };
  const k = 1 / (1 + (rl) * boost);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = (1 + (radius(a) - 1) * boost) * k;
    /* The lobes cross at the half-way angle, and that crossing is a genuine corner — emit it twice
     * so each lobe's flank keeps its own normal instead of the mean of the two. */
    const onSeam = (i % n) === (n >> 1);
    out.push([Math.cos(a) * r * squash, Math.sin(a) * r]);
    if (onSeam) out.push([Math.cos(a) * r * squash, Math.sin(a) * r]);
    const t = Math.abs((((a) * lobes / Math.PI) % 2 + 2) % 2 - 1);
    shade.push(t); if (onSeam) shade.push(t);
  }
  out.shade = shade;
  return out;
}

/* ⚠️ `squash` IS WHAT A ROPE PIPED ONTO A WALL DOES, and without it a wall of ropes cannot be right
 * at any spacing. Round tubes standing on a cylinder pose an unsolvable choice, and both halves of
 * it were rendered and rejected: butted loosely they leave a V-channel between every pair that the
 * eye follows all the way to the body a third of the radius behind, and the channels read as slots
 * cut in the tier; overlapped enough to close those, each rope only shows a strip around its own
 * crest and its neighbours hide the crease flanks — which is "only one elevation is showing per
 * vertical", the note this finish collected for two days.
 *
 * Cream is not a tube. Pressed against a surface it SPREADS: wide across the wall, shallow out of
 * it. A squashed section has both properties at once — neighbours meet flank to flank at their full
 * sideways width, so there is nothing to see between them, and the face they present to the viewer
 * is wide and carries several ribs.
 *
 * It scales the profile's LOCAL X, because `pushSweep` rotates the profile by `roll` in the (N, B)
 * plane and the wall rolls each rope by its own theta — which lands local +X, where this profile's
 * first crest sits, on the outward radial. ⚠️ Squashing the other axis instead makes the ropes full
 * depth and too thin to reach each other, and the wall renders as tall planks standing proud with
 * daylight between them: a plausible-looking wrong picture that a screenshot cannot distinguish
 * from a right one. Slicing the built wall says it in one line — the ropes stood 0.15 off the body
 * where a spread one stands 0.08, and a third of the circumference had no surface at all.
 * ⚠️ Not a press: the rope still sits entirely on the surface, it is
 * simply the shape cream takes when it lands on one. The free-standing stroke this section was
 * measured from is near-round (0.456 by 0.440) because it was piped onto nothing.
 */
/* ⚠️ THE SIDEBANDS ARE NOT NOISE, and leaving them out is why our ribs are all the same width and
 * the photograph's are not. The mesh's DFT gave 8 lobes at 17% — and next to it, 6 at 4.8% and 10
 * at 3.6%, which were written off as irregularity. They are the whole difference between a cosine
 * and cream: a neighbouring harmonic BEATS against the main one, so going round the section each
 * rib is a little wider or narrower than the last and the pattern never repeats. Same total depth,
 * no extra vertices, and it is closed (every term is a whole number of cycles), so the section
 * still joins itself. `uneven` scales both, 0 for the plain rosette.
 *
 * ⚠️ NOT AT FULL STRENGTH, and what it costs is not what it looks like it costs. The beat barely
 * touches rib WIDTH — measured, every rib stays within 2% of 36° on a ten-lobe tip at any setting.
 * What it changes is how far each rib PROJECTS, and at full strength the shallowest rib keeps only
 * 0.65 of the deepest one's relief: that rib flattens out and the groove beside it goes missing,
 * which reads as a blank patch down the stroke with no slot in it. At 0.4 the ratio is 0.83 —
 * plainly irregular still, with no rib collapsing. ⚠️ Measure the RELIEF, not the spacing. */
/* ⚠️ `crease` — BROAD ROUND RIBS WITH A NARROW SLOT BETWEEN THEM, which a cosine cannot do. A
 * cosine spends most of its travel in the middle, so every rib is a gentle swell and the face reads
 * FLAT: the photograph's ribs are standing fins that project, separated by a thin dark slot you
 * could put a knife into. Raising the amplitude alone does not fix it — it makes the whole section
 * lumpier without ever giving the ribs an edge.
 *
 * The shaping pushes the mid-range towards the crest and leaves only the last part of the travel to
 * dive: with `crease` below 1, a point half way round a lobe sits at 41% of the way out instead of
 * 0%, so the rib is broad and round to well past its own shoulder and the valley is a narrow cusp.
 * 1 is the plain cosine the mesh measured. ⚠️ The mesh IS a plain cosine, and it is the smoothed
 * average of a generated model; the photograph is one real tip and its ribs are sharper than that.
 * Where the two disagree the photograph wins — it is the thing being matched.
 */
function rosetteProfile(lobes, amp, n = 24, squash = 1, uneven = 0, crease = 1) {
  const out = [], shade = [];
  const a6 = amp * 0.28 * uneven, a10 = amp * 0.21 * uneven;   // the measured ratios, 4.8/17, 3.6/17
  const k = 1 / (1 + amp + a6 + a10);
  const N = lobes * n;
  const shaped = (c) => 2 * Math.pow((c + 1) / 2, crease) - 1;      // 1 on a crest, -1 in a crease
  const radius = (a) => (1 + amp * shaped(Math.cos(lobes * a))
                           + a6 * Math.cos((lobes - 2) * a + 1.7)
                           + a10 * Math.cos((lobes + 2) * a + 0.6)) * k;
  /* ⚠️ THE TALLEST RIB IS PUT AT LOCAL ANGLE ZERO, because every caller's roll assumes it is there.
   * `roll` is how a tip is turned to face somebody — a quarter turn towards the camera in the
   * harness, minus theta to face outward on a wall — and all of that is written as though a crest
   * sits at the profile's start. A plain rosette does put one there. Add the sidebands and it does
   * not: they shift where the true maximum lands, and on a ten-lobe tip it came out half a lobe
   * over, so the front of every stroke was a GROOVE where the photograph has a raised rib. The
   * fix cannot be a constant added to the roll — it differs per tip — so the section aligns itself
   * and no caller has to know. */
  let a0 = 0, best = -Infinity;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = radius(a); if (r > best) { best = r; a0 = a; } }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = radius(a + a0);
    /* ⚠️ THE CREASE VERTEX IS EMITTED TWICE, and without it a shaped slot cannot read as sharp.
     * `crease` puts a real cusp in the section — the two flanks meet at an angle — but
     * `computeVertexNormals` averages every face that shares a vertex, so the fold gets the MEAN of
     * the two flanks and rolls over into a shoulder. On screen the slot comes back as a soft grey
     * band however deep the geometry actually is. Duplicating the sample gives each flank its own
     * normal, which is the entire difference between a crease and a dent; the zero-area quad
     * between the pair contributes no normal and draws no pixels. Only where the section HAS a
     * cusp — a plain cosine (crease 1) is smooth there and must stay smooth, or the ribs come out
     * as facets. `n` is even so a sample lands exactly on the floor. */
    const onCrease = crease !== 1 && (i % n) === (n >> 1);
    out.push([Math.cos(a) * r * squash, Math.sin(a) * r]);
    if (onCrease) out.push([Math.cos(a) * r * squash, Math.sin(a) * r]);
    /* ⚠️ THE CREASE PATTERN IS CARRIED, NOT INFERRED FROM THE POINT. Reading a point's depth back
     * out of its radius works only while the section is a plain rosette: squash it and the radius
     * stops saying which points are creases — the outward crest and a side crease can land at the
     * same distance from the axis — so the ribs shade almost flat and the wall reads as smooth
     * columns. `cos(lobes·a)` is the rib pattern itself, +1 on a crest and −1 in a crease, known
     * here for free and true at any squash. Linear in the ANGLE round the lobe, which is what stops
     * a cosine's flat peak painting the middle half of every rib the same value. */
    /* ⚠️ BOTH TERMS, because each alone is wrong in its own direction and both were rendered.
     *
     *   linear in the ANGLE round the lobe   a clean roll of tone across the rib — but it spreads
     *                                        the darkness over the whole flank, so there is no
     *                                        local contrast anywhere and the slot reads as a broad
     *                                        grey band however sharp the geometry under it is
     *   the section's own DEPTH              concentrated exactly where the slot is — but `crease`
     *                                        deliberately flattens most of a rib, so this paints
     *                                        nearly the whole surface at the crest value and the
     *                                        stroke goes back to a flat white thing with one line
     *
     * Blending the two was tried and is worse than either: the depth term is near zero across most
     * of a rib, so the blend takes the mid-tones out and the whole stroke washes out.
     *
     * ⚠️ AND RAISING IT TO A POWER IS ALSO WRONG, which is worth keeping because it LOOKS right in
     * isolation: it holds the rib bright and dives in the last fifth, which does put a thin dark
     * line beside a broad bright band. But a thin painted line is not a groove. The section already
     * has a real slot cut into it, and squeezing the shade into a hairline throws away the tone
     * that was describing that slot's walls — the grooves stop reading as something cut and become
     * pen strokes on a smooth surface. Linear is what lets a groove look like a groove. */
    const t = Math.abs((((a + a0) * lobes / Math.PI) % 2 + 2) % 2 - 1);      // 0 crest, 1 crease
    shade.push(t);
    if (onCrease) shade.push(t);
  }
  out.shade = shade;
  return out;
}

// Per-nozzle character:
//   twist/ruffle (0..1) scale the global spiral + squeeze rhythm below — a round writing tip
//     wants neither (clean rope); star tips want both for a hand-piped look.
//   thickness (optional) — the tip's natural rope radius, applied when you pick it; lets a
//     fat bead tip read differently from a fine French even though both are "just" a profile.
// lobes/depth tuned to the real tips: 1M open star, deep 8-point closed star (the classic
// ruffled rope), fine French flutes, plus the Phase-1 additions (bead, drop, jumbo, fine).
export const NOZZLES = [
  { key: 'round',  label: 'Round',       hint: 'Writing / smooth rope',     profile: roundProfile(20),      twist: 0,   ruffle: 0 },
  { key: 'bead',   label: 'Bead',        hint: 'Fat smooth bead / outline', profile: roundProfile(24),      twist: 0,   ruffle: 0,   thickness: 0.05 },
  { key: 'star5',  label: 'Open Star',   hint: '1M — the classic',          profile: lobedProfile(5,  0.50), twist: 1,   ruffle: 1 },
  { key: 'star6',  label: '6-Star',      hint: 'Tighter ribs',              profile: lobedProfile(6,  0.52), twist: 1,   ruffle: 1 },
  { key: 'star8',  label: '8-Star',      hint: 'Eight points, open cut',    profile: lobedProfile(8,  0.50), twist: 1,   ruffle: 1 },
  /* Measured off a sliced mesh of one real vertical stroke — see the note on rosetteProfile. The
   * two extra rows are the same shape shallower and deeper, because 0.18 is what ONE stroke measured
   * and a baker's pressure is the other half of how deep a groove lands. */
  { key: 'rose8',  label: 'Piped Rope',  hint: 'Measured: 8 rounded ribs',   profile: rosetteProfile(8, 0.18, 24, 1, 1), twist: 1, lobes: 8,   ruffle: 1 },
  { key: 'rose8d', label: 'Piped Deep',  hint: 'Same ribs, firmer pressure', profile: rosetteProfile(8, 0.26), twist: 1, lobes: 8,   ruffle: 1 },
  /* ⚠️ TEN, and the mesh said eight — they are measuring two different strokes and the PHOTOGRAPH
   * is the one being matched. Scanning it across the middle puts creases at 37%, 64%, 88% and 92%
   * of the width; a crease at a fraction f of a tube's projected width sits at asin(2f − 1) from
   * the centre, which gives ±15° and ±53°, so the ribs are about 35° apart. That is ten, not the
   * mesh's eight — a generated model is a smoothed average, a photograph is one real tip. */
  { key: 'rose10', label: 'Piped Fine',  hint: 'Ten rounded ribs',           profile: rosetteProfile(10, 0.30, 20, 1, 0.4, 0.5), twist: 1, lobes: 10,  ruffle: 1 },
  /* The bundle-of-lobes section (see lobeProfile). ⚠️ TWELVE, from the photograph rather than from
   * the mesh: its creases sit at 37%, 64% and 88% of the stroke's width, and a crease at fraction f
   * of a tube's projected width is at asin(2f − 1) from the centre — so −15.1°, 16.3°, 49.5°, which
   * is ribs about 32° apart. That is 11.3 lobes, and ten made them visibly too thick. `rl` 0.27
   * holds the cut at 18% at this count, which is where a rib still reads as its own tube. */
  /* ⚠️ THE RIBS ARE THE POINT — DO NOT SHALLOW THEM TO SEPARATE THE STROKES. This cut was taken
   * down to 14% once, to stop a wall of them reading as one field of strands rather than as
   * distinct strokes. It worked and it was the wrong trade: shallow ribs are a ROPE, and the thing
   * being built is STAR piping, where the ribs are the whole character and the stroke boundary is
   * secondary. ⚠️ The two knobs are independent and were changed together, which hid it — the
   * overlap coming down (0.6 → 0.05) is what lets a stroke show ~5 of its ribs instead of 2.6, and
   * that alone is the fix for "no rope structure". The depth stays at 28%. */
  { key: 'lobe12', label: 'Piped Lobes', hint: 'Twelve lobes, each its own tube', profile: lobeProfile(12, 0.27, 20, 1, 1.8), twist: 1, lobes: 12, ruffle: 1 },
  /* The same section spread against a wall. ⚠️ `squash` is not a press — the rope still sits
   * entirely on the cake's side; it is the shape cream takes when it lands on something. Round
   * tubes on a cylinder cannot win: spaced to show their ribs they leave channels you can see the
   * body through, and overlapped enough to close those they hide each other's ribs. */
  { key: 'lobe12w', label: 'Wall Lobes', hint: 'Twelve lobes, spread on the side',
    profile: lobeProfile(12, 0.27, 20, 0.55, 1.8), twist: 1, lobes: 12, ruffle: 1, squash: 0.55 },
  /* The wall tips. `squash` is carried on the row so `ropeSection` can read it — the depth a rope
   * stands off the cake is the same number that shapes its section, and they must not drift. */
  { key: 'rose8w', label: 'Wall Rope',  hint: 'Spread against the side',    profile: rosetteProfile(8, 0.18, 24, 0.55), twist: 1, lobes: 8, ruffle: 1, squash: 0.55 },
  { key: 'rose12w', label: 'Wall Fine', hint: 'Twelve ribs, spread',        profile: rosetteProfile(12, 0.16, 20, 0.55), twist: 1, lobes: 12, ruffle: 1, squash: 0.55 },
  /* ⚠️ TWELVE IS WHAT PUTS FOUR RIBS ON THE FACE. A stroke is a tube, so a viewer sees a little over
   * half of it and only the middle ±60° reads as ribs — the rest is silhouette, and on a wall the
   * silhouette is where the neighbour meets it. That is `lobes/3` ribs on the face: five points give
   * under two, eight give under three, and twelve give four. Counting the ribs in a photograph of one
   * vertical line and dividing by three is how you pick a tip. */
  { key: 'star12', label: '12-Star',     hint: 'Four ribs across the face',  profile: lobedProfile(12, 0.45), twist: 1,   ruffle: 1 },
  { key: 'drop',   label: 'Drop-Star',   hint: 'Dense drop-flower rope',    profile: lobedProfile(12, 0.42), twist: 1,   ruffle: 1,   thickness: 0.038 },
  { key: 'closed', label: 'Closed Star', hint: 'Deep ruffled rope',         profile: lobedProfile(8,  0.62), twist: 1,   ruffle: 1 },
  { key: 'jumbo',  label: 'Jumbo Star',  hint: 'Bold chunky grooves',       profile: lobedProfile(6,  0.72), twist: 1,   ruffle: 1,   thickness: 0.055 },
  { key: 'french', label: 'French',      hint: 'Fine fluted ribs',          profile: lobedProfile(16, 0.26), twist: 0.6, ruffle: 0.6 },
  { key: 'fine',   label: 'Fine French', hint: 'Silky many-rib flutes',     profile: lobedProfile(26, 0.18), twist: 0.5, ruffle: 0.5, thickness: 0.024 },
  /* ⚠️ `flat` is the flag that changes the FRAME, not the profile. A petal tip only means anything
   * if it is held at a known attitude — wide end down, slit square to the direction of travel — so
   * this nozzle asks pushSweep for a fixed-up frame instead of the rotation-minimising one every
   * rope uses. Twist and ruffle are off: corrugating a ribbon reads as crimped foil, not cream.
   * Thicker by default because a petal is a decoration in its own right, not a line. */
  { key: 'petal',  label: 'Petal 104',  hint: 'Roses, ruffles — a slit, wide end down',
    profile: petalProfile(), twist: 0, ruffle: 0, thickness: 0.10, flat: true },
];
export const NOZZLE_BY_KEY = Object.fromEntries(NOZZLES.map(n => [n.key, n]));
export const DEFAULT_NOZZLE = 'star5';

/* ── How alive the rope looks ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE OLD NUMBERS MADE IT LOOK LIKE TWISTED CORD, and the reason is worth stating because it is
 * the whole difference between piped cream and extruded plastic:
 *
 *   ALL THE VARIATION WAS HIGH-FREQUENCY AND PERFECTLY PERIODIC, AND THERE WAS NONE OF THE OTHER
 *   KIND. Hand-piped cream is the opposite. It varies SLOWLY and UNEVENLY along a stroke, and its
 *   surface texture is comparatively calm. Regular periodic detail is the visual signature of a
 *   machine, which is exactly what a baker reported seeing.
 *
 * Measured on a stroke twenty diameters long, which is an ordinary one:
 *   twist 0.16/dia  -> 3.2 full turns of the ribs. A barber pole.
 *   ruffle 0.85/dia -> ~17 identical ripples at ±6%. A regular knurl.
 *   radius constant -> dead uniform width, end to end, which no hand can produce.
 *
 * A real star tip's ribs run essentially STRAIGHT unless the wrist turns, so the twist is now a
 * hint rather than a spiral; the swell is slow and irregular; and the width comes from the drag.
 *
 * Every number here is a FEEL, not a fact, so they live in one object an admin studio can drive —
 * see FreehandPenStudio. `speedWidth: 0` restores the old dead-constant rope exactly.
 */
export const PEN_FEEL = Object.freeze({
  /* How much the drag's own speed shapes the rope. See widthAlong: this is the single biggest cue,
   * and it costs nothing — the signal is already in the stored points. */
  speedWidth: 1,
  widthMin:   0.72,   // clamps, because a stalled pointer would otherwise balloon
  widthMax:   1.55,
  /* ⚠️ A ROPE WANDERS, IT DOES NOT CORKSCREW — and 0.03 of a turn per diameter is a corkscrew the
   * moment a stroke is long. On a vertical up a cake side, eight diameters, it comes to 86°: the
   * ribs sweep two and a half lobes sideways over the length, wrap round the silhouette, and read
   * as piping lines CROSSING each other. Nothing in a photograph does that.
   *
   * The mesh says so too, and it was measured and then not acted on: sliced at nineteen heights,
   * the rib phase sits between −40° and −53° the whole way up. That is a ±6° WANDER with no
   * monotonic drift at all — the tip is not rotating, the hand is not perfectly steady. A constant
   * rate is a spiral; noise is a hand, and `wanderDeg` carries what was measured.
   *
   * ⚠️ ZERO, and a trace was not small enough. 0.008 per diameter leans a long stroke by 23° and
   * 0.003 by nine, and because EVERY rib leans the same way the eye reads a tilt at either setting —
   * "the immediate right rib to the centre is still leaning towards right", twice. There is nothing
   * to trade off: the mesh measured no monotonic drift at all, only a wander. A corkscrew is not a
   * thing piped cream does, and the wander is what carries the life. */
  twistTurnsPerDia: 0,
  /* ⚠️ THE SNAKE IS A ROLL, NOT A SHEAR — and the shear is worth recording because it works and is
   * still wrong. Rib edges are not straight lines, and the obvious way to bend them is to let each
   * rib drift sideways by its own amount: turn every point about the axis by `sin(its own angle +
   * a phase that drifts with height)`, which crowds the ribs on one flank and opens them on the
   * other. It bends the edges, and it DEFORMS THE SECTION doing it — some ribs come out squeezed
   * narrow and their neighbours stretched wide, the slots between them lose their shape, and the
   * sharpness that `crease` exists to give goes with it. "Snake them without changing them."
   *
   * A roll cannot do that. It turns the section rigidly, so every rib keeps the exact profile it
   * was cut with and only its ORIENTATION drifts up the stroke — which is also what a real hand
   * does, since the bag turns a little and the tip does not deform. The edges snake together
   * rather than independently, and against a photograph that is the smaller error by far.
   *
   * ⚠️ THE NOMINAL DEGREES NEVER ARRIVE, and that is why two goes at this were invisible. `noise1`
   * smooth-steps between random values two octaves deep, so in practice it reaches about ±0.35 of
   * its notional ±1 — and over a stroke only a couple of noise units long you sample a fraction of
   * even that. Measured on the real path: at 0.32 per diameter the noise traverses 1.4 units and
   * swings 0.44 of its range, so a nominal 15° moved the ribs by SIX AND A HALF degrees, a fifth of
   * a rib on a ten-lobe tip. Part of what is left is a constant offset, which is a fixed roll and
   * not a wander at all.
   *
   * ⚠️ AND THE AMPLITUDE IS MEASURED OFF THE PHOTOGRAPH, not reasoned about. Reasoning gave "about
   * a whole rib width" and produced something like a wrung cloth. Tracking the darkest column down
   * a crease and reporting how far it moves sideways, as a fraction of the stroke's own width:
   *
   *     reference   8.2% total span      (rms 0.8% about its own trend, peak 2.2%)
   *     ours at 45° 50.4%                — six times too much
   *
   * A piped line barely wanders. It is enough that the edges are not RULED; past that it stops
   * looking like cream and starts looking wrung. `dev/refsrv` has the tracker.
   *
   * The rate still carries three or four humps into the length, so the wander varies along the
   * stroke instead of being one lazy bend. ⚠️ If either is retuned, measure the swing along the
   * real arc — the number in this field is not the number the ribs move by. */
  wanderDeg: 7.5,
  wanderPerDia: 0.8,
  /* One lazy swell every ~8 diameters instead of one ripple per diameter, and irregular: two
   * incommensurate waves, so the rhythm never repeats. Deterministic — no random, because a stroke
   * must rebuild identically on reload. */
  swellAmp:    0.085,
  swellPerDia: 0.13,
  /* The lift-off. Release pressure and draw away and the bead thins to a point; both ends used to
   * be the same rounded nub, which is a strong tell. */
  tailDias: 1.3,
  tailEnd:  0.32,
  /* ⚠️ THE FOOT IS FATTER THAN THE ROPE, and it is not a rounded nub either. Sliced off a real
   * stroke at nineteen heights, the mean radius runs: narrow at the very bottom (the tip's own
   * round-off), then 1.25× the body radius about ONE DIAMETER up, back to the body radius by two,
   * and dead constant from there to the lift-off. That is cream piling against the surface while
   * the hand is still getting going — the tell that a rope was PIPED rather than extruded, and we
   * had nothing of it. In diameters, so it reads the same on a cupcake and a tier. */
  footDias:  1.4,     // how far up the flare reaches (0 disables it)
  footPeak:  1.15,    // widest multiple of the body radius
  footAt:    0.55,    // where in that zone the peak lands
  /* ⚠️ SLIT TIPS ONLY — the angle the bag is held at. A rope tip's roll is invisible, so this does
   * nothing to one. For a petal it is the technique: held upright the ribbon stands on its edge and
   * reads as a loop of tape, and leaning it away from the flower's centre is what lays the sheet
   * over so it cups. Every reference photo of a piped rose is a bag held at an angle. */
  leanDeg: 40,
});

/* Rope radius along the stroke, from how fast the hand was moving.
 *
 * ⚠️ PHYSICS, NOT A TUNING. At a steady squeeze the flow Q is constant, so the cross-section area
 * A = Q/v and the radius goes as v^-1/2. That exponent is derived, not picked, which is why this
 * reads as cream rather than as a wobble effect.
 *
 * ⚠️ AND THE SPEED IS ALREADY IN THE FILE. Capture uses getCoalescedEvents(), which samples at a
 * roughly fixed RATE, so the SPACING between stored points is the speed: points close together mean
 * a slow hand, which means more cream. Nothing new is stored, `design.piping` stays a plain list of
 * points that fully determines the mesh (the contract at the top of this file), and every stroke
 * already drawn gets better the next time it is loaded.
 *
 * Normalised against this stroke's OWN median gap, so it is immune to device sampling rate, cake
 * scale and how fast this particular person draws — it reads the variation within a stroke, which
 * is what a hand actually is, rather than an absolute speed nobody agrees on.
 *
 * Smoothed over several points, which fixes mouse jitter AND is physically right: cream has inertia
 * and a bead cannot change width instantly.
 */
function widthAlong(pts, feel) {
  const n = pts.length;
  if (n < 4 || !(feel.speedWidth > 0)) return null;

  const gap = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1);
    gap[i] = span > 0 ? a.distanceTo(b) / span : 0;
  }
  const sorted = gap.filter(g => g > 1e-9).sort((x, y) => x - y);
  const med = sorted.length ? sorted[sorted.length >> 1] : 0;
  if (!(med > 0)) return null;

  // v^-1/2, with the slow end floored so a stationary pointer cannot balloon the rope.
  let w = gap.map(g => Math.sqrt(med / Math.max(g, med * 0.25)));

  // Box blur, twice — a bead's width changes over roughly its own length, not per sample.
  for (let pass = 0; pass < 2; pass++) {
    const src = w;
    w = src.map((_, i) => {
      let sum = 0, k = 0;
      for (let d = -2; d <= 2; d++) { const j = i + d; if (j >= 0 && j < n) { sum += src[j]; k++; } }
      return sum / k;
    });
  }
  const lo = feel.widthMin, hi = feel.widthMax;
  return w.map(f => Math.min(hi, Math.max(lo, 1 + (f - 1) * feel.speedWidth)));
}

// Star "heap" (pipe-and-lift): tap instead of drag and the tip is held PERPENDICULAR to the
// surface — cream extrudes up the surface normal and tapers to a peak, so the ribs radiate
// from a centre (the rosette/star-flower look) instead of running down a flat rope. Height
// is keyed to the rope diameter; the rib twist gives a gentle pinwheel swirl as it rises.
export const HEAP_HEIGHT_PER_DIAMETER = 0.9;   // default mound height; calibratable per stroke
const HEAP_TWIST_TURNS = 0.18;   // total turns over the whole height — a slight pinwheel
const HEAP_TAPER_EXP = 0.62;     // <1 = stays fat then tapers near the tip (kiss/star shape)

/* Deterministic 1-D value noise in −1…1, two octaves. Deterministic because a stroke has to rebuild
 * identically on reload and on every device — `Math.random()` here would render the same design
 * differently twice. Smoothstep between lattice points, so the rope's width changes the way cream
 * does: continuously, and at no fixed interval.
 */
const hash1 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
function noise1(t) {
  const oct = (u) => {
    const i = Math.floor(u), f = u - i, k = f * f * (3 - 2 * f);
    return hash1(i) * (1 - k) + hash1(i + 1) * k;
  };
  return oct(t) * 0.7 + oct(t * 2.37 + 11.3) * 0.3;
}

// Rotation-minimizing frames (double-reflection method, Wang et al.) along a sampled curve.
// THREE's computeFrenetFrames flips the normal at inflection points, which twists the
// cross-section and pinches the tube to near-zero width — the "sometimes it gets thin"
// artifact. RMF carries the frame forward with the least possible rotation, so the profile
// stays stable through bends; our intentional rib twist is then layered on top in pushSweep.
function rmFrames(samples) {
  const n = samples.length;
  const T = new Array(n), N = new Array(n), B = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
    T[i] = b.clone().sub(a);
    if (T[i].lengthSq() < 1e-12) T[i] = (T[i - 1] || new THREE.Vector3(0, 0, 1)).clone();
    T[i].normalize();
  }
  const up = Math.abs(T[0].y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N[0] = up.sub(T[0].clone().multiplyScalar(up.dot(T[0]))).normalize();
  B[0] = new THREE.Vector3().crossVectors(T[0], N[0]).normalize();
  for (let i = 0; i < n - 1; i++) {
    const v1 = samples[i + 1].clone().sub(samples[i]);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) { N[i + 1] = N[i].clone(); B[i + 1] = B[i].clone(); continue; }
    const nL = N[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(N[i])));
    const tL = T[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(T[i])));
    const v2 = T[i + 1].clone().sub(tL);
    const c2 = v2.dot(v2);
    const nN = c2 < 1e-12 ? nL : nL.clone().sub(v2.clone().multiplyScalar((2 / c2) * v2.dot(nL)));
    N[i + 1] = nN.normalize();
    B[i + 1] = new THREE.Vector3().crossVectors(T[i + 1], N[i + 1]).normalize();
  }
  return { tangents: T, normals: N, binormals: B };
}

/* Frames from a fixed reference direction — the bag held at a constant attitude. See the note in
 * pushSweep for why a petal needs this and a rope does not. */
function fixedUpFrames(samples, up) {
  const n = samples.length;
  const U = up.clone().normalize();
  const T = new Array(n), N = new Array(n), B = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
    T[i] = b.clone().sub(a);
    if (T[i].lengthSq() < 1e-12) T[i] = (T[i - 1] || new THREE.Vector3(0, 0, 1)).clone();
    T[i].normalize();
    let nrm = new THREE.Vector3().crossVectors(U, T[i]);
    // Travel parallel to `up` leaves the cross product undefined — carry the last frame rather than
    // let it flip, which would twist the ribbon through 180 degrees in one sample.
    if (nrm.lengthSq() < 1e-8) nrm = (N[i - 1] || new THREE.Vector3(1, 0, 0)).clone();
    N[i] = nrm.normalize();
    B[i] = new THREE.Vector3().crossVectors(T[i], N[i]).normalize();
  }
  return { tangents: T, normals: N, binormals: B };
}

// Sweep a profile along a centerline: sample a CENTRIPETAL CatmullRom through the control
// points (centripetal provably avoids the cusps/self-intersections that pinch the tube at
// sharp corners), build rotation-minimizing frames (a stable normal/binormal plane per
// sample), drop the profile ring — twisted and swelled by arc-length — at radius
// radiusAt(i, segs), stitch the rings, and fan-cap both ends (rounded tips). Appends into
// shared pos/idx arrays so a geometry can hold several strokes if needed.
//   opts.twistPerLen  — radians of rib rotation per unit arc length
//   opts.ruffleAmp    — fractional radius swell (0 = off)
//   opts.ruffleFreq   — radians of squeeze phase per unit arc length
/* ⚠️ THE CREASE SHADE IS BAKED HERE, FROM THE PROFILE, and every previous attempt measured it from
 * the finished vertex's distance to the stroke's axis instead — which is a guess, and it was wrong
 * in a new way each time the stroke stopped being a constant-radius tube:
 *
 *   the end caps          their apex sits ON the axis, so the "crease" range started at zero
 *   the lift-off taper    the last diameter thins to a third, so its whole surface reads as deeper
 *                         than a crease and comes out BLACK
 *   `swell`               3% of breathing puts a rope's crease just behind the nominal one, which
 *                         painted a dark smear down the middle of every other rope
 *   `vary`                each rope on a wall is a different thickness, so one range cannot fit them
 *   the foot flare        same again, at the other end
 *
 * None of that is a depth cue; it is the stroke changing size. What actually says how deep a point
 * sits is WHERE IT IS ROUND THE SECTION, and the sweep knows that exactly — the profile is
 * normalised to a maximum radius of 1, so a profile point's own radius IS the answer, at every
 * radius the stroke is ever scaled to. No world positions, no ranges to get wrong.
 */
function pushSweep(pos, idx, controlPts, profile, radiusAt, opts = {}, col = null) {
  const { twistPerLen = 0, ruffleAmp = 0, ruffleFreq = 0, rufflePhase = 0, up = null, roll = 0, ao = 0,
          wanderAmp = 0, wanderFreq = 0 } = opts;
  const curve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal');
  const segs = Math.min(900, Math.max(24, controlPts.length * 5));
  const samples = curve.getPoints(segs);                 // segs + 1

  /* ⚠️ TWO KINDS OF FRAME, and which one you want depends on whether the tip is symmetric.
   *
   * A ROPE tip is a radius, so its roll is invisible and the right frame is the one that TWISTS
   * LEAST — that is rmFrames, and every nozzle above uses it.
   *
   * A PETAL tip is a slit, and its roll is the entire technique. You hold the wide end down and the
   * slit square to where you are going, and you turn your wrist through the stroke; that is what
   * makes a petal a petal rather than a smear. So `up` replaces the frame with one built from a
   * fixed reference direction — the surface normal, or the flower nail's axis — exactly the way a
   * hand holds a bag at a constant attitude:
   *
   *   N = up x T   the slit's width, horizontal and square to travel
   *   B = T x N    the slit's length, standing along `up`
   *
   * Degenerate where the path runs parallel to `up` (a petal piped straight upward); the previous
   * frame is carried forward there rather than flipping, which is the same reason rmFrames exists. */
  const frames = up ? fixedUpFrames(samples, up) : rmFrames(samples);
  const P = profile.length;
  const base = pos.length / 3;

  /* One shade per profile point, reused for every ring. ⚠️ The ramp is linear in the ANGLE round
   * the lobe, not in the radius: a rosette's radius is flat at its peak, so a radius-linear ramp
   * paints the middle half of every rib the same value and the rib reads as a plateau with a cliff
   * at each side. The normalised radius IS (cos φ + 1)/2, so acos recovers the angle. */
  let shade = null;
  if (col && ao > 0) {
    if (profile.shade) {
      shade = profile.shade.map(t => 1 - ao * t);          // the tip carried its own crease pattern
    } else {
      let rMin = Infinity, rMax = 0;
      for (const [px, py] of profile) { const r = Math.hypot(px, py); if (r < rMin) rMin = r; if (r > rMax) rMax = r; }
      const span = Math.max(1e-6, rMax - rMin);
      shade = profile.map(([px, py]) => {
        const u = Math.min(1, Math.max(0, (Math.hypot(px, py) - rMin) / span));
        return 1 - ao * (Math.acos(2 * u - 1) / Math.PI);
      });
    }
  }

  // Cumulative arc length per sample, so twist/ruffle advance in real space (CatmullRom
  // samples are even in parameter, not distance).
  const arc = new Array(segs + 1); arc[0] = 0;
  for (let i = 1; i <= segs; i++) arc[i] = arc[i - 1] + samples[i].distanceTo(samples[i - 1]);

  for (let i = 0; i <= segs; i++) {
    const C = samples[i], N = frames.normals[i], B = frames.binormals[i];
    const s = arc[i];
    /* Two incommensurate waves, not one — a single sine is a knurl, and the ear (or eye) finds a
     * repeating rhythm immediately. The 0.61 ratio is irrational enough that the pattern never
     * closes over any stroke a person will draw, and it is a CONSTANT, so a reloaded stroke is
     * identical to the one that was piped. */
    /* ⚠️ NOISE, NOT SINES, and that is the difference between "varying" and "alive". Two summed
     * sine waves vary — the amplitude moves, the numbers change — but the eye reads a beat, and a
     * beat is a machine. Put a photograph of one piped line beside a sine-swelled rope and the
     * photograph is lumpy in a way no periodic function is: swells that are not the same size, and
     * not the same distance apart.
     *
     * ⚠️ `rufflePhase` matters the moment there is more than one stroke. The field is deterministic,
     * which is right — a stroke must rebuild identically on reload — but with no offset every rope
     * swells in exactly the same places and a wall of them grows horizontal BANDS. */
    const swell = ruffleAmp ? 1 + ruffleAmp * noise1(ruffleFreq * s / 6.283 + rufflePhase) : 1;
    const r = radiusAt(i, segs, s, arc[segs]) * swell;
    /* `roll` is the WRIST, and for a slit tip it is the whole difference between a petal and a
     * standing loop of ribbon. Nobody pipes a petal with the bag upright — it is held leaning away
     * from the flower's centre, which is what makes the sheet lie over and cup instead of standing
     * on its edge. Constant along the stroke, added to the rib spiral, which is zero for a slit. */
    const phi = roll + twistPerLen * s
      + (wanderAmp ? wanderAmp * noise1(wanderFreq * s / 6.283 + rufflePhase + 11.3) : 0);
    const cs = Math.cos(phi), sn = Math.sin(phi);
    for (let j = 0; j < P; j++) {
      const ax = profile[j][0] * r, ay = profile[j][1] * r;
      const px = ax * cs - ay * sn, py = ax * sn + ay * cs;  // rotate in the N/B plane
      pos.push(C.x + N.x * px + B.x * py, C.y + N.y * px + B.y * py, C.z + N.z * px + B.z * py);
      if (col) { const k = shade ? shade[j] : 1; col.push(k, k, k); }
    }
  }
  /* ⚠️ THE WINDING, AND IT WAS INSIDE OUT. For a right-handed (T, N, B) frame and a profile wound
   * anticlockwise, `T × dProfile` points INWARD — so the old order gave every swept stroke normals
   * that faced into its own tube. Back-face culling hid the fault: you were seeing the inside of the
   * far wall, shaded by an inverted normal, which on a matte cream reads as plausible-but-flat and
   * had never been questioned. It is unmissable the moment a stroke's section is not symmetric —
   * a wall of strokes with a ribbed front and a flat back rendered as a smooth cylinder. */
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < P; j++) {
      const a = base + i * P + j, b = base + i * P + (j + 1) % P;
      const c = base + (i + 1) * P + j, d = base + (i + 1) * P + (j + 1) % P;
      idx.push(a, b, c, b, d, c);
    }
  }
  /* ⚠️ THE ENDS WERE CONES, and a cone is the one thing cream never does. A single apex vertex
   * fanned to the last ring gives flat triangular facets meeting at a point — put it beside a
   * photograph of a piped line and it is the first thing that looks manufactured, at BOTH ends: a
   * stroke starts as a rounded splay where the tip was pressed to the surface, and finishes as a
   * soft dome where the bag lifted. Same apex, but the profile is carried to it around a quarter
   * circle, so the surface rolls over instead of creasing. Four rings is enough to read round and
   * costs four rings. */
  const CAP = 4;
  const capAt = (ringBase, ringR, C, T, sign) => {
    let prev = ringBase;
    for (let k = 1; k <= CAP; k++) {
      const t = (k / CAP) * (Math.PI / 2);
      const scale = Math.cos(t), lift = Math.sin(t) * ringR * 0.75;
      const ringStart = pos.length / 3;
      const N = frames.normals[sign > 0 ? segs : 0], B = frames.binormals[sign > 0 ? segs : 0];
      const phiC = roll + twistPerLen * (sign > 0 ? arc[segs] : 0);
      const cs = Math.cos(phiC), sn = Math.sin(phiC);
      for (let j = 0; j < P; j++) {
        const ax = profile[j][0] * ringR * scale, ay = profile[j][1] * ringR * scale;
        const px = ax * cs - ay * sn, py = ax * sn + ay * cs;
        const cx = C.x + T.x * lift * sign, cy = C.y + T.y * lift * sign, cz = C.z + T.z * lift * sign;
        pos.push(cx + N.x * px + B.x * py, cy + N.y * px + B.y * py, cz + N.z * px + B.z * py);
        if (col) { const kk = shade ? shade[j] : 1; col.push(kk, kk, kk); }
      }
      for (let j = 0; j < P; j++) {
        const a = prev + j, b = prev + (j + 1) % P;
        const c = ringStart + j, d = ringStart + (j + 1) % P;
        if (sign > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
      prev = ringStart;
    }
    return prev;
  };
  const r0 = radiusAt(0, segs, 0, arc[segs]), rn = radiusAt(segs, segs, arc[segs], arc[segs]);
  const sLast = capAt(base, r0, samples[0], frames.tangents[0], -1);
  const eLast = capAt(base + segs * P, rn, samples[segs], frames.tangents[segs], 1);
  const sC = samples[0].clone().addScaledVector(frames.tangents[0], -r0 * 0.75);
  const eC = samples[segs].clone().addScaledVector(frames.tangents[segs], rn * 0.75);
  /* The two apex vertices sit on the axis and belong to no lobe; they take the crest value, which
   * is what the very tip of a rounded end actually catches. */
  const sI = pos.length / 3; pos.push(sC.x, sC.y, sC.z); if (col) col.push(1, 1, 1);
  const eI = pos.length / 3; pos.push(eC.x, eC.y, eC.z); if (col) col.push(1, 1, 1);
  for (let j = 0; j < P; j++) {
    idx.push(sI, sLast + j, sLast + (j + 1) % P);
    idx.push(eI, eLast + (j + 1) % P, eLast + j);
  }
}

function finishGeo(pos, idx, col = null) {
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col && col.length === pos.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* Merge swept strokes into ONE mesh, by hand rather than pulling in three's BufferGeometryUtils for
 * thirty lines. Lives here because everything that merges pen strokes has to know this:
 *
 * ⚠️ THE SWEEP IS INDEXED (`pushSweep` calls `setIndex`), and an early version of this ignored that
 * and copied only the position buffer — so the triangles were addressed by an index that no longer
 * existed and a garnish rendered as a scatter of stray fragments. It had a comment claiming the
 * sweep returned non-indexed geometry, which nobody had checked.
 *
 * ⚠️ THE INDEX IS CARRIED, NOT EXPANDED. `toNonIndexed()` is the two-line way to be safe, and it
 * costs SIX TIMES the vertices — a tube shares every vertex between six triangles. On one garnish
 * nobody notices; a piped tier is forty-six ropes, and expanding took it from 75k vertices to 454k.
 * Offsetting each part's index is barely more code and is what makes the wall affordable.
 *
 * Positions and normals only: a swept rope carries no uv, and a caller that needs one knows the
 * surface it is wrapping far better than this does.
 */
export function mergePenGeometries(input) {
  const list = input.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let posCount = 0, idxCount = 0;
  for (const g of list) {
    posCount += g.getAttribute('position').count;
    idxCount += g.getIndex() ? g.getIndex().count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(posCount * 3);
  const nor = new Float32Array(posCount * 3);
  /* ⚠️ COLOUR HAS TO COME THROUGH, and it silently did not. This merge copied position and normal
   * and nothing else, which was invisible for as long as the crease shading was baked onto the
   * FINISHED wall — the attribute was written after the merge, so there was nothing to lose. The
   * moment each rope started carrying its own shade (see pushSweep, which is the only place that
   * can know it once a stroke tapers or breathes), every piped wall went out with no shading at
   * all, and three separate corrections to the ramp in a row changed the render by nothing. Carried
   * only when EVERY part has one: a half-filled colour buffer would tint the rest black. */
  const withCol = list.every(g => g.getAttribute('color'));
  const col = withCol ? new Float32Array(posCount * 3) : null;
  const idx = posCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
  let at = 0, ai = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.getIndex();
    pos.set(p.array.subarray(0, p.count * 3), at * 3);
    if (n) nor.set(n.array.subarray(0, n.count * 3), at * 3);
    if (col) { const c = g.getAttribute('color'); col.set(c.array.subarray(0, c.count * 3), at * 3); }
    if (ix) for (let k = 0; k < ix.count; k++) idx[ai++] = ix.getX(k) + at;
    else    for (let k = 0; k < p.count; k++)  idx[ai++] = k + at;
    at += p.count;
    g.dispose();                       // each part is consumed here and never referenced again
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const toVec = p => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));

// Build one freehand stroke: sweep the chosen nozzle profile (constant radius) through the
// seated centerline points. `points` is [[x,y,z]…] or Vector3[]. Returns a BufferGeometry,
// or null if there's nothing to draw.
/* `roll` turns the tip about its own axis, in radians.
 *
 * ⚠️ A ROPE TIP'S ROLL IS INVISIBLE ON A FREEHAND STROKE, WHICH IS WHY THIS DEFAULTED TO NOTHING —
 * you cannot tell which of a 1M's five points is facing you on a single squiggle. Lay thirty-six of
 * them side by side up a cake wall and you can tell instantly: `rmFrames` starts every vertical
 * stroke from the same WORLD direction, so which lobe faces the viewer depends on where the rope sits
 * round the cake, and the wall comes out patchy — some ropes a wide flat panel, their neighbours a
 * thin line. Rolling each rope by its own angle makes every one present the same face. */
export function buildPipingStroke(points, nozzleKey, thickness, feelOverride = null, upVec = null, roll = 0, ao = 0) {
  const noz = NOZZLE_BY_KEY[nozzleKey] || NOZZLE_BY_KEY[DEFAULT_NOZZLE];
  const feel = feelOverride ? { ...PEN_FEEL, ...feelOverride } : PEN_FEEL;
  let pts = points.map(toVec).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-4);
  if (pts.length === 0) return null;
  // A lone tap can't sweep — stub it upward so a dot still reads as piped cream.
  if (pts.length === 1) pts = [pts[0], pts[0].clone().add(new THREE.Vector3(0, Math.max(0.02, thickness), 0))];
  const pos = [], idx = [];
  // Spiral + squeeze rhythm scale with the rope diameter so they read the same at any size.
  const dia = 2 * thickness;
  const opts = {
    twistPerLen: (noz.twist  ?? 0) * feel.twistTurnsPerDia * 2 * Math.PI / dia,
    ruffleAmp:   (noz.ruffle ?? 0) * feel.swellAmp,
    ruffleFreq:  feel.swellPerDia * 2 * Math.PI / dia,
    // The roll's own slow wander (see wanderDeg). Rope tips only — a slit tip's attitude is the technique itself.
    wanderAmp:   (noz.twist ?? 0) * ((feel.wanderDeg ?? 0) * Math.PI) / 180,
    wanderFreq:  (feel.wanderPerDia ?? 0) * 2 * Math.PI / dia,
    rufflePhase: feel.rufflePhase ?? 0,
    /* A slit tip needs a known attitude; a rope tip does not care and is better off with the
     * least-twisting frame. Defaults to world up, which is the flat surface a flower is piped on —
     * a caller with the real surface normal (or a nail's axis) should pass it. */
    up: noz.flat ? (upVec ? toVec(upVec) : new THREE.Vector3(0, 1, 0)) : null,
    // A slit's own lean, plus whatever the caller asked for (see the note on `roll` above).
    roll: roll + (noz.flat ? (feel.leanDeg * Math.PI) / 180 : 0),
    // How dark this tip's creases go. 0 leaves the stroke unshaded and writes no colour attribute.
    ao,
  };

  /* The hand's own speed, mapped onto the swept samples. pushSweep resamples the control points
   * onto a centripetal CatmullRom, so a sample's index is not a control index — but the curve spans
   * the controls evenly in parameter, so i/segs scaled by (n-1) lands between the two it came from
   * and lerping between their widths is faithful enough for something this smooth. */
  const w = widthAlong(pts, feel);
  const tail = feel.tailDias * dia;
  const foot = (feel.footDias ?? 0) * dia;

  const radiusAt = (i, segs2, arcS, arcTotal) => {
    let f = 1;
    if (w) {
      const u = (i / segs2) * (w.length - 1);
      const k = Math.min(w.length - 2, Math.floor(u));
      f = w[k] + (w[k + 1] - w[k]) * (u - k);
    }
    /* ⚠️ The LIFT-OFF, and only at the end. A stroke starts where the tip was already pressed to the
     * surface with cream under it, so it begins at full width; it ENDS by releasing and drawing
     * away, which thins the bead to a point. Both ends used to be the same rounded nub, and the
     * ends are where the eye goes first. */
    /* The foot flare (see footDias). One hump: up to footPeak at footAt through the zone, back to
     * 1 at its end. Skipped on a stroke too short to hold both a foot and a tail. */
    if (foot > 0 && arcS < foot && arcTotal > foot * 1.5) {
      const t = arcS / foot;
      const u = t < feel.footAt ? t / feel.footAt : (1 - t) / (1 - feel.footAt);
      f *= 1 + (feel.footPeak - 1) * (u * u * (3 - 2 * u));                  // smoothstep both sides
    }
    if (tail > 0 && arcTotal > tail * 1.5) {
      const left = arcTotal - arcS;
      if (left < tail) {
        const t = left / tail;                       // 1 at the start of the tail, 0 at the tip
        f *= feel.tailEnd + (1 - feel.tailEnd) * (t * t * (3 - 2 * t));   // smoothstep
      }
    }
    return thickness * f;
  };

  const col = ao > 0 ? [] : null;
  pushSweep(pos, idx, pts, noz.profile, radiusAt, opts, col);
  return finishGeo(pos, idx, col);
}

// Build one star heap: sweep the nozzle profile UP the surface normal from `point`, tapering
// the radius to a peak so it reads as a piped-and-lifted star/rosette rather than a rope.
// `point` is the seated base, `normal` the surface normal there (defaults to up). The rib
// twist corkscrews gently over the height for the pinwheel swirl; round tips give a smooth
// dome (a "kiss"). Returns a BufferGeometry, or null if there's nothing to draw.
export function buildPipingHeap(point, normal, nozzleKey, thickness, heightPerDia = HEAP_HEIGHT_PER_DIAMETER) {
  const noz = NOZZLE_BY_KEY[nozzleKey] || NOZZLE_BY_KEY[DEFAULT_NOZZLE];
  const baseP = toVec(point);
  const up = normal ? toVec(normal) : new THREE.Vector3(0, 1, 0);
  if (up.lengthSq() < 1e-9) up.set(0, 1, 0);
  up.normalize();
  const h = heightPerDia * 2 * thickness;
  const n = 8;
  const pts = Array.from({ length: n + 1 }, (_, i) => baseP.clone().addScaledVector(up, (h * i) / n));
  const radiusAt = (i, segs) => Math.max(thickness * 0.05, thickness * Math.pow(1 - i / segs, HEAP_TAPER_EXP));
  const opts = {
    twistPerLen: (noz.twist ?? 0) * HEAP_TWIST_TURNS * 2 * Math.PI / h,
    ruffleAmp: 0,
    ruffleFreq: 0,
  };
  const pos = [], idx = [];
  pushSweep(pos, idx, pts, noz.profile, radiusAt, opts);
  return finishGeo(pos, idx);
}

// ── GLB stamp placement ──────────────────────────────────────────────────────
// Instead of swept geometry, the pen can stamp a real modelled piece (rosette/shell/star)
// from the element library: a tap drops one, a drag tiles a row along the path (a shell/rope
// border). This turns a committed stamp stroke + the loaded GLB's footprint into a list of
// world transforms; the renderer clones the GLB mesh at each. Deterministic per-stamp jitter
// (size + spin) from the stored seed keeps repeats from looking cloned, and survives reload.

// Tiny deterministic PRNG (mulberry32) so jitter is stable across reloads from the seed.
function rng(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// stroke: { kind:'stamp', point, normal, thickness, seed }
//      or { kind:'stamprope', points, normal, thickness, spacing, seed, regular }
// footprint: the GLB's max(x,z) extent after it's centred with its base at y=0.
// Returns [{ pos:[x,y,z], quat:[x,y,z,w], scale }]. Each stamp sits with its base ON the
// surface (the stored points are the SEATED centerline, lifted one radius along the normal,
// so we drop back by the radius) and its up axis along the surface normal.
//
// ── `regular`: the difference between scattering and PIPING ──────────────────────────────────────
// Every copy is normally given a small random spin and a few percent of random scale. That is what
// makes a dragged row of blossoms look strewn by hand instead of printed, and it is right for what
// this was built for.
//
// It is wrong for piping. A piped border is one shell pressed out over and over by the same nozzle
// at the same angle — its whole character is that the repeats AGREE. Jittered, the same GLB reads as
// a row of shells somebody knocked askew. So `regular` turns both randomisations off and locks each
// copy's forward to the path tangent, which is the shape a baker's hand actually makes.
//
// A flag rather than a second function: the walk, the seating and the orientation are identical, and
// the one thing that differs is whether the hand wobbles.
export function stampTransforms(stroke, metrics) {
  const up0 = new THREE.Vector3().fromArray(stroke.normal || [0, 1, 0]);
  if (up0.lengthSq() < 1e-9) up0.set(0, 1, 0);
  up0.normalize();
  const th = stroke.thickness ?? 0.03;
  const target = 2 * th;                         // stamp footprint ≈ rope diameter
  const regular = !!stroke.regular;
  // ── Sized by HEIGHT for piping, by footprint for scattering ──────────────────────────────────
  // A ring sizes a shell by how TALL it stands: `sc = radius × SHELL_HEIGHT_FRAC / size.y`. The
  // stamp sized by widest horizontal extent, which for a shell authored lying down is its LENGTH —
  // so one slider produced two different sizes depending on how the model happened to be exported,
  // and neither matched the ring.
  //
  // `metrics` is the bare footprint number for every caller that predates this, or
  // {footprint, height}. Scattering keeps the footprint it was built on, so nothing already stamped
  // on a cake changes size.
  const mm = (typeof metrics === 'number') ? { footprint: metrics, height: metrics } : (metrics ?? {});
  const footprint = mm.footprint ?? 1;
  const height = mm.height ?? footprint;
  const baseScale = target / Math.max(regular ? height : footprint, 1e-4);
  const rand = rng(((stroke.seed ?? 1) * 100003 + 7) | 0);
  const out = [];

  // ── The element's own rotation, the way a RING applies it ────────────────────────────────────
  // Aligning up to the surface normal and forward to the tangent says where a copy sits and which
  // way it faces. It says nothing about how the GLB is authored — a shell modelled lying on its side
  // stays lying on its side, which is why hand-piped shells came out fallen while the same element
  // ringed round a rim stood up.
  //
  // A ring reads `placement_config.*_rotation` and splits it (CakeTier: `ryA`/`meshA`): Y yaws the
  // piece about the surface normal, X and Z tilt it upright. Nested there as group(yaw) →
  // mesh(tilt), so the same composition is qYaw · qTilt applied AFTER the basis. Degrees, because
  // that is what an admin types and what the column stores.
  // ── Which part of the calibration to keep ────────────────────────────────────────────────────
  // A calibrated ring rotation is not a small adjustment. The shipped Classic Shell Border is
  // [-68, -1, 175]: a 175° ROLL that fixes how the GLB was authored, and a -68° TILT that leans the
  // piece out over the rim's edge.
  //
  // In the ring's own frame those axes have meanings. Local X runs TANGENTIALLY, along the border,
  // so a rotation about X tips the piece forward or back — that IS the outward lean. Z is the radial
  // axis (CakeTier: "local z = the radial axis the renderer places along"), so a rotation about it
  // rolls the piece upright. Y spins it in place.
  //
  // Reproduced verbatim on a flat cake top, the -68° pivots the shell about its base and lays it
  // down — which is exactly what it should do on a rim edge and exactly wrong in the middle. So the
  // roll and the spin are kept (they fix the model), and the lean is dropped: a hand-piped shell
  // stands on whatever surface it is drawn on.
  //
  // `lean` puts it back by degrees, because this decomposition is READ off the renderer rather than
  // proven, and a number the customer can turn beats another round of me guessing at it.
  // The calibration is applied VERBATIM, and that only became the right answer once the geometry was
  // prepared the way a ring prepares it. extractGeo bakes a +90° X turn into the mesh, so the -68°
  // is not the huge lean it reads as on paper — against that baked turn it nets to a modest upright
  // tilt, which is what a rim shell actually looks like. Decomposing it (an earlier attempt here)
  // was compensating for the missing +90° in the wrong place.
  //
  // `lean` stays, as an adjustment ON TOP rather than a replacement: 0 is the ring's own angle, and
  // it is there because this is the fourth attempt at this orientation and a number the customer can
  // turn is worth more than my confidence.
  const rot = stroke.rotation;
  const lean = stroke.lean ?? 0;
  let extra = null;
  if (rot || lean) {
    const DEG = Math.PI / 180;
    const rx = (rot?.[0] ?? 0) + lean;
    const ry = rot?.[1] ?? 0;
    const rz = rot?.[2] ?? 0;
    if (rx || ry || rz) {
      extra = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, ry * DEG, 0))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, 0, rz * DEG)));
    }
  }

  // ── Sitting ON the surface after the piece has been turned ───────────────────────────────────
  // StampStroke translates the merged geometry so its base is at y=0 IN THE AUTHORED FRAME. That
  // only seats the piece if it is authored standing. Roll it 175° to stand it up and the old base is
  // now its top, so it hangs under the cake — and any lean pivots it about a point that is no longer
  // its lowest.
  //
  // So: rotate the bounding box the same way the piece is rotated, and read how far its lowest
  // corner has ended up below the origin. That drop is added back along the surface normal. Needs
  // the box, so it only applies where StampStroke supplies one — without it this is a no-op and the
  // behaviour is exactly what it was.
  let seatDrop = 0;
  if (mm.bbox && extra) {
    const b = new THREE.Box3(
      new THREE.Vector3().fromArray(mm.bbox.min),
      new THREE.Vector3().fromArray(mm.bbox.max),
    ).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(extra));
    seatDrop = -b.min.y * baseScale;         // >0 when the turn pushed the piece below its origin
  }

  const place = (seatedP, forward) => {
    const up = up0.clone();
    // -th puts the base back on the surface (the stored centerline is lifted one radius); +seatDrop
    // lifts it by however far the rotation dropped its lowest point.
    const surface = seatedP.clone().addScaledVector(up, -th + seatDrop);
    const fwd = forward ? forward.clone() : new THREE.Vector3(1, 0, 0);
    // A lone regular stamp still has to face somewhere, and `rand()` would be a different somewhere
    // every render. Zero keeps it put.
    if (!regular) fwd.applyAxisAngle(up, forward ? (rand() - 0.5) * 0.5 : rand() * Math.PI * 2);
    // ── Which way the piece FACES: along the run, or across it ──────────────────────────────────
    // Scattering faces along the drag — a row of blossoms follows the hand, and that is what this
    // was built for.
    //
    // A ring does the opposite, and working it out from the renderer is the only way to see it.
    // Shell nests group(yaw = -rotY + π/2 + ry) → mesh(tilt), with an identity outer quaternion on a
    // plain ring. At shell angle `a` that yaw is (π/2 − a), which sends the GLB's +Z to
    // (cos a, 0, sin a) — the OUTWARD RADIAL. A piped shell points away from the cake, square across
    // the border's direction of travel, not along it.
    //
    // Piped by hand with +Z along the tangent, every shell was turned a quarter turn, and the X-tilt
    // that should lean it forward leaned it SIDEWAYS instead. That is what "it's falling" was — not
    // a missing rotation (the previous fix, which was real but not this) but a rotation applied to a
    // frame that was already ninety degrees out.
    //
    // Tied to `regular` because that flag already means "behave like a ring". Scattering keeps the
    // convention it was written with, so no cream-pen stroke anybody has already drawn moves.
    let z;
    if (regular) {
      z = new THREE.Vector3().crossVectors(fwd, up);              // across the run
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), up);
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), up);
    } else {
      z = fwd.sub(up.clone().multiplyScalar(fwd.dot(up)));        // along the run
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3(0, 0, 1).sub(up.clone().multiplyScalar(up.z));
    }
    z.normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, z);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    // AFTER the basis, so the tilt is applied in the copy's own frame — the piece leans relative to
    // the surface it sits on, which is what a ring does and what a hand does. Multiplied the other
    // way round it would lean relative to the world and every copy on a curved wall would lean a
    // different way.
    if (extra) q.multiply(extra);
    out.push({ pos: surface.toArray(), quat: q.toArray(), scale: regular ? baseScale : baseScale * (1 + (rand() - 0.5) * 0.16) });
  };

  if (stroke.kind === 'stamp') { place(new THREE.Vector3().fromArray(stroke.point)); return out; }

  const pts = (stroke.points || []).map(p => new THREE.Vector3().fromArray(p));
  if (pts.length === 0) return out;
  if (pts.length === 1) { place(pts[0]); return out; }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const step = Math.max((stroke.spacing ?? 0.85) * target, 1e-3);
  for (let d = 0; d <= total + 1e-6; d += step) {
    let s = 1; while (s < cum.length && cum[s] < d) s++;
    s = Math.min(s, cum.length - 1);
    const segLen = (cum[s] - cum[s - 1]) || 1e-6;
    const t = (d - cum[s - 1]) / segLen;
    place(pts[s - 1].clone().lerp(pts[s], t), pts[s].clone().sub(pts[s - 1]).normalize());
  }
  return out;
}
