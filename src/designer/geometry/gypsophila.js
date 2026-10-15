import * as THREE from 'three';
import { pushStrand, STRAND_SIDES, STRAND_SEGS , finishGeometry } from './strand.js';
import { mulberry32 } from '../utils/random.js';

// ── Gypsophila (baby's breath) ──────────────────────────────────────────────────────────────────
//
// The filler every florist-style cake uses: a cloud of tiny white blooms tucked between roses, run
// as a band round the rim, cascaded down one side, or scattered over the board. Never the subject —
// always the thing that makes the subject look arranged.
//
// ── WHY PROCEDURAL AND NOT A MODELLED SPRIG ─────────────────────────────────────────────────────
// The same two reasons grass.js gives, and they decide it again:
//   * It has to fit ANY tier and ANY density. A modelled sprig is authored at one size, and a cake
//     wants a few stems beside a rose and a hundred round a rim.
//   * Procedural work in this codebase succeeds where the subject has no precise familiar signature
//     the eye can check, and fails where it does (isomalt's refraction, the palette knife's marks).
//     A gypsophila floret is two or three millimetres of white puff. Nobody can tell a wrong one.
// And the third, which is about the GLB option specifically: one asset repeated is a repeat, and
// the eye finds a repeat faster than it finds a wrong petal. Every `jitter` in this repo is there
// because of that.
//
// ── ONE SPRIG, INSTANCED — AND NO PLACEMENT CODE HERE ───────────────────────────────────────────
// Same split as grass: this file builds ONE sprig at the origin growing up +Y, and the renderer
// instances it. ⚠️ It deliberately exports no seat function. `grassSeats` already answers "cover
// this top", "ring the rim" (`bandInner`), "put a clump here" (`patches`) and "keep out of that"
// (`hole`) against any tier outline, and a second distribution system would be a second answer to
// the same question (root CLAUDE.md rule 1, INVARIANTS #1).

/* ⚠️ THE LENGTH JITTER ONLY EVER SHORTENS, and the solve below has to know its mean or `height`
   stops meaning what its name says (INVARIANTS #8). It was two-sided (mean 1) when the first stem
   was half the sprig and unjittered; once `baseFrac` handed 84% of the reach to the branches, the
   luckiest of ~25 paths ran 18% past the setting. One-sided fixes that, at the cost of a
   systematic shortfall — which is why the mean is a named constant and not a number written twice. */
const JIT_LO = 0.75;
const JIT_RANGE = 1 - JIT_LO;
const JIT_MEAN = JIT_LO + JIT_RANGE / 2;

export const GYP_DEFAULTS = Object.freeze({
  /* ⚠️ HOW BIG THE FLOWER IS DRAWN, as a multiple of the sprig every number below describes — and
     deliberately NOT one of them. Reported on a wall posy: *"its looking like a cluster of white
     dots/sprinkles. not like gypsophila flowers."* Measured over a 3×3 sweep of size against lay:
     at 1 the branching does not resolve and the eye gets pale specks; from about 1.6 the green
     stems and separate florets read as baby's breath.
     Growing `height` alone gives a longer sprig carrying the same tiny blooms, and growing
     `floretSize` alone gives beads on a twig. Scaling the whole piece keeps its proportions — and
     it rides the instance matrix, so it costs no geometry rebuild and the per-seat 0.8–1.2
     variation still sits on top of it.

     ⚠️ 2, AND THE NUMBER COMES OFF A REFERENCE PHOTOGRAPH. Judged beside roses rather than alone:
     *"in the ref image pls see the size ration between rose and the gypsophila. ours look like
     sprinkles (too small for roses)."* Measured on that photograph a floret is about 13% of a
     rose's diameter — 24px against 190px. At size 1 ours was 3.6% (a 0.032 bloom against a 0.896
     rose), which is where "sprinkles" comes from. Rendered at 1x, 2x and 3x against the photograph
     (scripts/shoot-gyp-vs-rose.mjs): 1 is specks beside the roses, 3 buries them, 2 matches.

     ⚠️ AND IT IS THE DEFAULT RATHER THAN A PER-PLACEMENT NUMBER, because it is one flower. A rim
     ring, a posy on the wall and a clump on the top are the same baby's breath put in three places;
     giving each its own size was how the side ended up at 1.6 and the rim at 1, which is two
     answers to "how big is this flower". What legitimately differs per placement is `height` — the
     sprig's REACH — and those stay. */
  size:       2,
  /* The sprig's own scale, in cake units — one stem from cut end to the furthest bloom. */
  height:     0.30,
  /* How many times the stem divides. 2 is a twig, 3 is a sprig, 4 is a branch and costs 3× the
     triangles for something nobody can see at cake scale. */
  levels:     4,
  /* Branches at each division. Real gypsophila forks in twos and threes; always two reads as a
     fishbone, so the builder takes this as a MAXIMUM and rolls 2 or 3 per node. */
  forks:      3,
  /* How far a branch leans off its parent, in radians at the first division. Later divisions open
     wider — a sprig is tight at the base and loose at the tips. */
  spread:     0.55,
  /* Each level's length as a fraction of its parent's. Below ~0.5 the sprig becomes a stick with
     specks on it. */
  shrink:     0.58,
  /* How much a branch bows over along its length. The bloom clusters are heavy for a stem that
     thin, so the tips always fall away from the axis. */
  droop:      0.35,
  /* ⚠️ MEASURED, NOT RATIOED. The botanical one-to-twenty got the floret size wrong once already —
     it describes a sprig in a vase, and what matters here is the thing against a CAKE. This is the
     thickness at which the green reads at 0.9% of the ring, which is the level that was approved;
     it works out nearer one to ten, and it does not look like wire because the blooms it carries
     are big enough to justify it. */
  thickness:  0.0050,  // stem radius at the cut end
  /* Blooms per tip. A gypsophila tip is not one flower, it is a tight corymb of them. */
  /* ⚠️ FEWER, BECAUSE THEY ARE BIGGER — and this is the knob that decides how much green survives,
     which is the thing that has been judged three times. Nine at the new bloom size packed each tip
     into a solid ball that buried every twig and the ring went pure white; three left it *"over
     thick with flowers"*. Measured as the share of the ring that reads green rather than white:

         9 per tip    0.0%      a solid white band
         3 per tip    0.9%      the level that was approved before the blooms grew
         2 per tip    2.1%   <- here
         1 per tip    4.5%      matches the reference's 5%, and reads stemmy

     ⚠️ The reference's own 5% is mostly FOLIAGE, which this sprig does not have — so 1 per tip
     reaches that number by showing bare twig, which is not the same picture. 2 is where the blooms
     still read as clusters and the green threads through them. */
  florets:    2,
  /* ⚠️ HOW FAR DOWN THE SPRIG THE BLOOMS RIDE, counted in levels from the tip — and this is what
     decides whether the thing reads as a flower bunch or as a plant. At 2 the blooms sat on the
     last two divisions only, which measured **60% of the sprig's height as bare stem**: a band of
     white on top of a band of green, which is a picket fence. Sandeep, on the render: *"the below
     stem part is more. it looks like plant not a flower bunch."*
     ⚠️ AND IT IS WHY `size` MADE IT WORSE. `size` scales the whole sprig, so growing the flowers
     through it grew the bare run in the same proportion — the answer to "bigger flowers" was never
     a bigger sprig. Every reference photograph shows the stems threading THROUGH the cloud, never a
     bare run beneath it. */
  bloomLevels: 3,
  /* ⚠️ HOW FAR BACK ALONG EACH FLOWERING BRANCH THE CLUSTERS GO — 0 is tip-only, 0.55 starts them
     at 45% of the way up. Tip-only is what made the bare run: a cluster is a POINT at the end of a
     strand, so putting blooms on more levels only moved that point down one fork, and measured
     barely 6% off the bare stem. A gypsophila branch carries clusters ALL ALONG its fine ends —
     that is where the cloud comes from, and it is what puts green inside the white instead of
     under it. */
  bloomSpan:  0.55,
  /* ⚠️ THE BARE STUB AT THE BOTTOM, as a fraction of the sprig's reach — and it has to be its own
     knob because the geometric chain will not give it up. Each level is `shrink` of its parent, so
     the FIRST stem is always the longest single run: at shrink 0.58 over 4 levels it is 47% of the
     chain by construction, and measured 60% of the height carried no bloom at all. That is a plant.
     Sandeep: *"the below stem part is more. it looks like plant not a flower bunch."*
     A florist cuts gypsophila to a stub and lets the head do the work, so the base is solved for
     directly and the branches are given the rest of the reach. */
  baseFrac:   0.16,
  /* ⚠️ A RADIUS, AND IT IS MEASURED OFF THE REFERENCE RATHER THAN REASONED ABOUT — twice now in
     opposite directions, which is why the measurement is written down.
     It started at 0.016, a bloom 11% as wide as the whole sprig, and rendered as a handful of flat
     white diamonds on a bare twig. Reasoning from botany (a floret is 2–3mm against a 60mm stem)
     took it to 0.009 — and that was too small, because the botany is about a sprig in a vase and
     what matters here is the bloom against the CAKE. Measured on Sandeep's reference by the length
     of bright runs across the flower band, a floret is **1.45% of the cake's width** (p75 ≈ 3%).
     Ours at 0.009 measured 0.60%, which agrees exactly with the arithmetic — diameter 0.018 on a
     3.0-wide cake — so the measure is sound and the size was simply wrong.
     ⚠️ AND 1.45% WAS THE CLUSTER, NOT THE BLOOM. A bright run crosses a tightly-packed cluster
     without meeting a dark gap, so what the reference measurement caught was the whole corymb.
     Scaling an individual floret to it made each tip a solid ball that buried every twig and the
     ring went pure white. 0.016 with three per tip is where the blooms are visibly bigger AND the
     green survives — the balance measure puts it at 0.9% stem, which is the level that was
     approved before any of this.
     ⚠️ The run measure also SATURATES: once blooms overlap, the band becomes one run longer than a
     third of the frame and gets discarded, dragging the median down. Trust it while the blooms are
     separate and trust the arithmetic after. */
  /* ⚠️ 0.028, AND IT IS A DIFFERENT KNOB FROM `size`. Asked twice: *"flowers still dont look like
     flowers. size should be little more bigger."* The first time I answered with overall `size`,
     which scales the whole sprig — a bigger HAZE, not more legible blooms. What decides whether the
     eye reads petals or fog is the bloom against its own branch. Swept at a fixed overall size
     (scripts/sweep-gyp-floret.mjs): at 0.016 — 11% of the sprig — it is a haze; from 0.022
     individual flowers start to read; at 0.028 (19%) they are plainly flowers with visible petals;
     0.034 is chunky and loses the fineness baby's breath is for. */
  /* ⚠️ 0.014, HALVED — AND THE SIZE IT WAS HALVED FROM WAS CHOSEN BY THE SAME MEASURE, POINTED AT
     THE WRONG PICTURE. 0.028 was set to answer *"ours look like sprinkles (too small for roses)"*
     by making one bloom bigger. It does make a bloom bigger, and at the density a posy sits at the
     blooms then MERGE: every stem is hidden behind the one in front and the bunch renders as an
     opaque white mass. Reported on the wall: *"it looks like a all white and hardly any green. it
     no where looks like a flower bunch at all."*
     What makes the eye read gypsophila is that you can SEE THROUGH it — small separate florets
     with fine green between them. Measured on a wall posy against a frame of the same cake with no
     flowers on it (see-through = the share of the posy's own bounding box the flowers do NOT
     cover):

         floretSize 0.028    73% see-through     0.2% green   <- an opaque lump
         floretSize 0.020    76%                 1.1%
         floretSize 0.014    77%                 4.3%   <- here
         floretSize 0.010    79%                10.0%         airy, but stringy next to a rose

     ⚠️ IT IS NOT A RETURN TO SPRINKLES, because `size` is what answers "too small for roses" and
     it is 2 by default: a 0.014 bloom on a sprig scaled ×2 is the same absolute bloom 0.028 was at
     size 1. Checked against the rim fixture's roses, which is where "too small" was judged. The
     two complaints only looked opposed because one knob was being asked to do both jobs — the
     bloom against its own branch, and the sprig against the cake. */
  floretSize: 0.014,
  /* How much the blooms differ in size within a cluster: buds and open flowers sit together, and a
     cluster of identical balls is the other classic way this reads as plastic. */
  floretVary: 0.55,
  seed:       7,
  /* ⚠️ HOW HARD A BLOOM DEEP IN THE CLOUD IS DARKENED, and this is the same fault the wafer skirt
     took a week to settle. The scene is a near-uniform dome, so a mass of white blooms against a
     white cake carries almost no shading of its own and renders as one flat field — Sandeep has
     now reported it on every white decoration in the app, this one included: *"the white color
     over exposed issue. we have fixed it for wafer paper studio."*
     The fix is the wafer's, and it transfers exactly: a bloom buried among its neighbours sees
     less sky than one on the outside, so occlusion is baked per bloom as a vertex colour. One
     draw call still — the colour attribute is already there carrying the stem/bloom split.
     ⚠️ It decays toward a FLOOR and never reaches it. The wafer shipped `Math.max(0, …)` for a day
     and painted its deepest creases pure black, which is not what white petals do at any exposure
     because light bounces in from the ones around them. */
  ao:         0.55,
  aoFloor:    0.45,
});

/* ⚠️ THE STEMS ARE GREEN, AND THAT IS NOT DECORATION — it is most of what makes a sprig legible.
 * Every reference photograph shows fine green stems carrying white blooms, and the contrast between
 * them is what gives the cloud its structure. Rendered all-white the mass has nothing to separate
 * it from a white cake under a bright key, which is the same complaint that has followed the wafer
 * skirt all week: *"we have the same white color over exposure issue."* Two colours in one buffer
 * means a vertex attribute rather than two materials — one draw call still, for hundreds of sprigs.
 */
/* ── How the filler sits on each surface it is allowed on ────────────────────────────────────────
 *
 * ⚠️ SEEDED HERE, OVERLAID FROM THE ROW — root CLAUDE.md rule 3. These four sets were written out
 * inside the tier card: four `where:` branches each carrying its own spacing, jitter, lay, bury,
 * height and droop. Sandeep: *"placement is not driven by config. so many violations on driving
 * the rendering from config. we already have invariant to honor the config but surprisingly many
 * times its missing."*
 *
 * A card holding numbers is the violation in two ways at once. An admin cannot change how a filler
 * sits without a deploy, which is rule 3 exactly; and "White, fine" and "Dense pompom" cannot
 * differ in how they ARRIVE on a rim, only in the sprig, so two rows over one generator are less
 * different than the product claims.
 *
 * `placement_config.gyp.zones[key]` overlays each set. The studio authors them; absent keys fall
 * through to these, so a row saved before zones existed behaves exactly as it did.
 *
 * ⚠️ THE SPRIG IS NOT IN HERE. These are about PLACEMENT — where the sprigs sit and which way they
 * point. What a sprig IS (reach, divisions, bloom size) is GYP_DEFAULTS above, one answer for the
 * whole element, because it is one flower wherever it is put.
 */
export const GYP_PLACEMENTS = Object.freeze({
  /* The ring every reference photograph shows, straddling the top edge. `lay: 45` tips the sprigs
     outward over the rim; `bury` is the hand pushing the cut end into buttercream. */
  rim:   Object.freeze({ spacing: 0.075, jitter: 0.65, lay: 45, bury: 0.06,
                         height: 0.20, droop: 0.6, rimIn: 0.14, rimOut: 0.10 }),
  /* Clumps the baker places. Looser and taller than a band — a posy stands up where a ring lies
     along an edge. */
  free:  Object.freeze({ spacing: 0.07, jitter: 0.8, lay: 20, bury: 0.08,
                         height: 0.26, droop: 0.4 }),
  /* ⚠️ `lay: 35`, NOT 90. At 90 every sprig points straight OUT of the wall and the camera sees it
     end-on — which is its bloom cluster and nothing else, reported as *"a cluster of white
     dots/sprinkles"*. At 30–35° the branching and the green stems come back and the posy fans UP
     the wall the way a real one does. */
  /* ⚠️ `spacing: 0.13`, AND IT ONLY WORKS BESIDE THE SMALLER `floretSize`. Neither knob fixed this
     alone, which is why both were tried and rejected before the pair was: at 0.13 with fat blooms
     the posy was a sparser blob, and fine blooms at 0.05 were still 146 sprigs deep so the ones in
     front hid everything behind them. Reported twice: *"it looks like a all white and hardly any
     green"*, then *"side still looks like a blob"*.
     ⚠️ THE NUMBER THAT MATTERS IS SPRIGS PER POSY, which nothing was counting. One patch at
     `GYP_PATCH_R` 0.34 held:

         spacing 0.05    146 sprigs   <- was here; ~2,900 blooms in a fist
         spacing 0.13     20
         spacing 0.18     10
         spacing 0.24      7

     A florist tucks five to fifteen stems into a cake side, not a hundred and fifty. 0.13 is the
     fullest that still reads as separate sprigs rather than a mass. */
  side:  Object.freeze({ spacing: 0.13, jitter: 0.7, lay: 35, layVary: 0.4, bury: 0.04,
                         height: 0.20, droop: 0.5, sideLo: 0.18, sideHi: 0.68 }),
  /* ⚠️ `lay: 78` — ALMOST FLAT. A board is card: you cannot push a stem into it, so the ring is
     LAID at the join, stems tucked in sideways against the cake's foot and blooms fanning out over
     the board. Seated upright it reads as a hedge round a building. */
  board: Object.freeze({ spacing: 0.075, jitter: 0.7, lay: 78,
                         height: 0.22, droop: 0.3, ringWidth: 0.18 }),
});

/* One placement, with whatever the row authored laid over the seeded set. The single reader, so a
   card cannot quietly answer this question itself again. */
export function gypPlacement(key, placementConfig = null) {
  return { ...(GYP_PLACEMENTS[key] ?? {}), ...(placementConfig?.gyp?.zones?.[key] ?? {}) };
}

export const GYP_COLOURS = Object.freeze({
  stem:  '#8aa06a',   // a soft olive; gypsophila stems are grey-green, never a leaf green
  bloom: '#fdfdfb',
});

/* ⚠️ `mulberry32` IS THE ONE COPY (utils/random.js), and grass had a local look-alike that this
   file then copied a third time. Verified identical for seeds 1, 7, 42 and 99999 over 500 draws
   before both were switched, so no procedural output moved. A sprig must look random and be
   STABLE: unseeded, every bloom would re-roll on each render and the cloud would shimmer whenever
   an unrelated slider moved. */

/* ── One floret: a ruffled pompom ────────────────────────────────────────────────────────────────
 *
 * ⚠️ TWO WRONG SHAPES BEFORE THIS ONE, and they were wrong in opposite directions.
 *
 *   An OCTAHEDRON first — the cheapest convincing ball, on the reasoning that a floret is two or
 *   three millimetres and all you see is a white dot. True at arm's length; seen down an axis an
 *   octahedron is a SQUARE, and a cloud of them is a cloud of diamonds. *"the flowers are like
 *   small cubes."*
 *
 *   Then a five-petal ROSETTE, which is what a single gypsophila flower looks like in a diagram and
 *   not what is on a cake. *"i think ours is too thin now."* Right: florists use the DOUBLE variety,
 *   and Sandeep's close-up shows it — every bloom is a tight ruffled pompom of many small petals,
 *   nearly round, with a lobed edge. The ball had the right MASS and the wrong silhouette; the star
 *   had the right silhouette and no mass.
 *
 * So: two rings of wide, overlapping petals, the inner one smaller, raised and rotated half a step.
 * Overlapping is the whole point — petals that meet make a ruffled DISC where petals that do not
 * make a star, and the second layer is what turns a disc into a pompom.
 */
const PETALS = 5;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
function pushBloom(pos, nor, idx, centre, r, rand) {
  const base = idx.baseIndex;
  /* ⚠️ EVERY FLORET GETS ITS OWN ROTATION. Built to one orientation, every bloom presents the same
     outline at the same moment and the sprig reads as a repeated glyph — a fault that was visible
     with octahedra and would be more so with a shape this recognisable. A uniformly random
     quaternion, not three Euler angles, which clump toward the poles. */
  const u1 = rand(), u2 = rand(), u3 = rand();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  _q.set(s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2),
         s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3));

  const put = (x, y, z) => {
    _v.set(x, y, z).applyQuaternion(_q);
    pos.push(centre.x + _v.x, centre.y + _v.y, centre.z + _v.z);
    /* The dome's own normal, so the pompom shades as a cupped mass rather than as flat chips —
       flat facets cannot shade under this scene's near-uniform dome. */
    _v.set(x * 0.5, r, z * 0.5).normalize().applyQuaternion(_q);
    nor.push(_v.x, _v.y, _v.z);
  };

  /* ⚠️ THE NOTCH BETWEEN PETALS IS WHAT DECIDES POMPOM OR STAR, and it is one number. With the
     petal's shoulders pulled in to half its tip radius the outline is a ten-pointed spike; carried
     out to 0.86 it becomes a gentle scallop and the bloom reads round. A real double gypsophila has
     so many petals that the edge is barely lobed at all — this is as close as five get. */
  const SHOULDER = 0.86;
  const wide = (Math.PI / PETALS) * 1.35;
  /* Stacked high enough to be a BALL rather than two sheets of paper. The first attempt lifted the
     layers by a third and four fifths of the petal radius and they read as one flat star, because
     a floret is as deep as it is wide and these were nearly coplanar. */
  const LAYERS = [{ k: 1.00, lift: 0.55, turn: 0 },
                  { k: 0.70, lift: 1.30, turn: Math.PI / PETALS }];
  for (const L of LAYERS) {
    const ring = idx.baseIndex;
    put(0, r * L.lift * 1.12, 0);                       // the layer's own crown
    for (let i = 0; i < PETALS; i++) {
      const a = (i / PETALS) * Math.PI * 2 + L.turn + rand() * 0.10;
      const mid = r * SHOULDER * L.k, tip = r * L.k * (0.92 + 0.16 * rand());
      put(Math.cos(a - wide) * mid, r * L.lift * 0.62, Math.sin(a - wide) * mid);
      put(Math.cos(a) * tip,        r * L.lift * 0.78, Math.sin(a) * tip);
      put(Math.cos(a + wide) * mid, r * L.lift * 0.62, Math.sin(a + wide) * mid);
    }
    for (let i = 0; i < PETALS; i++) {
      const l = ring + 1 + i * 3;
      idx.list.push(ring, l, l + 1, ring, l + 1, l + 2);
    }
    idx.baseIndex += 1 + PETALS * 3;
  }
}

/* ── How buried is each bloom? ───────────────────────────────────────────────────────────────────
 *
 * Counted, not guessed: how many other blooms sit within a couple of bloom-widths. One out on the
 * edge of the cloud has few neighbours and keeps its colour; one in the middle of a cluster is
 * surrounded and loses light. That ordering is the whole effect — it is what turns a flat white
 * mass into something with depth, and it is exactly what `bakeWaferAO` does for the gaps between
 * sheets.
 *
 * ⚠️ IT DECAYS TOWARD A FLOOR AND NEVER REACHES IT. White petals a millimetre apart are grey in
 * shadow, never black, because light bounces in from the ones around them. The wafer skirt shipped
 * a hard clamp at zero for a day and painted its creases black.
 */
function shadeBlooms(col, blooms, o) {
  if (!(o.ao > 0) || blooms.length < 2) return;
  /* ⚠️ THREE ATTEMPTS, AND THE FIRST TWO MEASURED THE WRONG CLOUD. Counting a bloom's neighbours
     buries every one of them equally, because a cluster is a dozen packed into a ball. Widening the
     reach and normalising does not help: once it spans the sprig, every bloom sees every other.
     Depth from the sprig's own centre varies, but it concentrates the darkening in a tiny core —
     half the blooms came out above 0.93 and the render did not move at all.
     ⚠️ ALL THREE SHADE THE WRONG THING. A sprig is airy; it barely occludes ITSELF. The white-out
     happens in a packed RING, where what buries a bloom is the hundred sprigs around it — and an
     instanced mesh cannot know about its neighbours. What a single sprig CAN know is height, and
     in a crowd that is the same quantity: the top of the cloud sees sky, the bottom is roofed by
     everything standing around it. Exactly the wafer skirt's `aoOpenTop`, from the other side. */
  let lo = Infinity, hi = -Infinity;
  for (const b of blooms) { if (b.c.y < lo) lo = b.c.y; if (b.c.y > hi) hi = b.c.y; }
  const drop = Math.max(1e-6, hi - lo);
  blooms.forEach((b) => {
    const buried = 1 - (b.c.y - lo) / drop;          // 0 at the crown, 1 at the lowest bloom
    const shade = o.aoFloor + (1 - o.aoFloor) * Math.exp(-o.ao * buried * 3);
    for (let i = b.from; i < b.to; i++) {
      col[i * 3] *= shade; col[i * 3 + 1] *= shade; col[i * 3 + 2] *= shade;
    }
  });
}

/* ONE sprig, seated at the origin and growing up +Y. Instance this; do not call it per seat. */
export function buildGypSprig(opts = {}) {
  const o = { ...GYP_DEFAULTS, ...GYP_COLOURS, ...opts };
  const rand = mulberry32(o.seed ?? 1);
  const pos = [], nor = [], idx = { list: [], baseIndex: 0 }, col = [];
  const stem = new THREE.Color(o.stem), bloom = new THREE.Color(o.bloom);
  /* Bloom centres are collected as they are made, then shaded in one pass at the end — a bloom's
     occlusion depends on how many OTHER blooms are around it, which is not known while it is being
     placed. */
  const blooms = [];
  /* Paint everything pushed since the last call. The builders push vertices and the colour follows
     them, so neither has to know how many the other made. */
  const paint = (from, c) => {
    for (let i = from; i < idx.baseIndex; i++) col.push(c.r, c.g, c.b);
  };
  const levels = Math.max(1, Math.round(o.levels));

  /* Grown depth-first from the cut end. Each call draws its own stem and then either forks or
     flowers; the strand hands back where it actually ENDED, so a branch starts on its parent's tip
     rather than on a recomputed guess at the curve (which drifts, and the joints come apart). */
  const grow = (origin, dir, len, r0, level, childLen = null) => {
    /* A stem that forks does not taper to a point — it hands its thickness on. Only the last
       level, which carries the blooms, closes off. */
    const r1 = level >= levels ? 0 : r0 * o.shrink;
    /* The bow is horizontal and follows the lean the branch already has, so it exaggerates the
       direction instead of fighting it. Deeper levels droop more: the cluster is heaviest at the
       end of the thinnest stem. */
    const lean = o.droop * (0.4 + rand()) * (level / levels);
    const az = Math.atan2(dir.z, dir.x) + (rand() - 0.5) * 1.4;
    const bend = new THREE.Vector3(Math.cos(az) * lean, -Math.abs(dir.y) * lean * 0.8, Math.sin(az) * lean);

    const before = idx.baseIndex;
    const end = pushStrand(pos, nor, idx, { origin, dir, bend, len, r0, r1 });
    paint(before, stem);

    /* ⚠️ BLOOMS RIDE THE LAST TWO LEVELS, NOT JUST THE TIPS. Flowering only at the ends gave a bare
       twig with a pom-pom on each arm — which is a dandelion clock, not gypsophila. A real stem
       carries clusters all along its finer branches, and that is where the cloud comes from. */
    const bloomFrom = levels - Math.max(1, Math.round(o.bloomLevels)) + 1;
    if (level >= bloomFrom) {
      /* The strand's own curve, so a cluster placed at `t` sits ON the branch rather than on a
         straight line between its ends — `pushStrand` bows quadratically and a chord would float
         the lower clusters off the stem they are supposed to be growing from. */
      const axis = dir.clone().normalize();
      const at = t => origin.clone().addScaledVector(axis, len * t).addScaledVector(bend, len * t * t);
      /* ⚠️ `florets` IS STILL BLOOMS PER STRAND — the nodes SPREAD that count along the branch,
         they do not multiply it. Multiplying was the first version and it tripled the sprig to
         2,358 triangles against a 1,600 budget: this thing is instanced in the hundreds round a
         rim, so a cloud bought with triangles is a cloud nobody on a phone gets to see. Spreading
         is free, and it is also the truer picture — a branch carries the same flowers, strung out
         along it rather than bunched on the end. */
      const perStrand = Math.max(1, Math.round(
        Math.max(1, Math.round(o.florets)) / Math.pow(2, levels - level)));
      const nodes = Math.max(1, Math.round(2 + o.bloomSpan * 2));
      for (let i = 0; i < perStrand; i++) {
        /* i = 0 is the tip, and it uses the strand's OWN reported end rather than the curve — the
           two agree, but the tip is what `height` is solved against and it must not drift. */
        const k = i % nodes;
        const tk = nodes === 1 ? 1 : 1 - (k / (nodes - 1)) * o.bloomSpan;
        const node = k === 0 ? end.tip.clone() : at(tk);
        const a = rand() * Math.PI * 2, b = Math.acos(2 * rand() - 1);
        const d = o.floretSize * 2.2 * Math.cbrt(rand());
        const c = node.clone().add(new THREE.Vector3(
          Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d, Math.sin(b) * Math.sin(a) * d));
        const b0 = idx.baseIndex;
        pushBloom(pos, nor, idx, c, o.floretSize * (1 - o.floretVary * rand()), rand);
        paint(b0, bloom);
        blooms.push({ from: b0, to: idx.baseIndex, c: c.clone() });
      }
    }

    if (level >= levels) return;

    /* Two or three, rolled per node. Always the maximum reads as a fishbone — the regularity shows
       up long before any individual branch does. */
    const n = 2 + (rand() < 0.5 ? 1 : 0) * Math.max(0, Math.round(o.forks) - 2);
    const openness = o.spread * (0.7 + 0.6 * (level / levels));
    for (let i = 0; i < n; i++) {
      const roll = (i / n) * Math.PI * 2 + rand() * 1.2;
      const tilt = openness * (0.5 + rand());
      const up = end.dir.clone();
      const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(up, ref).normalize();
      const v = new THREE.Vector3().crossVectors(up, u).normalize();
      const child = up.clone().multiplyScalar(Math.cos(tilt))
        .addScaledVector(u, Math.sin(tilt) * Math.cos(roll))
        .addScaledVector(v, Math.sin(tilt) * Math.sin(roll))
        .normalize();
      /* ⚠️ THE JITTER ONLY EVER SHORTENS. It used to be `0.8 + 0.4·rand`, mean 1 — fine when the
         first stem was half the sprig and unjittered, but once `baseFrac` handed 84% of the reach
         to the branches, the luckiest of ~25 paths ran well past the solved chain and `height`
         started overshooting by 18%. A control that lies about its units is INVARIANTS #8, so the
         variation is one-sided: every branch is somewhere at or under its share, no path exceeds
         it, and `height` is a ceiling the sprig reaches rather than a number it drifts past. */
      const next = (childLen ?? len * o.shrink) * (JIT_LO + JIT_RANGE * rand());
      grow(end.tip.clone(), child, next, r1, level + 1);
    }
  };

  /* ⚠️ `height` IS WHAT THE SPRIG REACHES, so the first stem is solved for rather than guessed.
     Each level is `shrink` of its parent, so the chain from cut end to furthest bloom sums a
     geometric series; dividing by it makes the knob mean what its name says. Written as
     `height * (1 - shrink)` first, which gave a 0.21 sprig for a 0.30 setting — a control that
     lies about its own units is the thing INVARIANTS #8 is about. The reach is still a little under
     `height` because droop trades length for lean, and that is the honest part of it. */
  /* The chain the BRANCHES sum to — levels 2..n, because level 1 is now solved separately.
     ⚠️ IT USES THE JITTER'S MEAN, NOT A BARE `shrink`. Every child is multiplied by a draw in
     [JIT_LO, 1], so a chain solved against `shrink` alone is systematically LONGER than the sprig
     it builds — by 0.875³, a seventh, which `height` then under-reaches by. It passed at first
     only because fat blooms padded the envelope; halving `floretSize` took the padding away and
     the test caught it. Folding the mean into the ratio makes the expectation land on `height`,
     and the luckiest of the paths lands just over it rather than a fifth over. */
  const sEff = o.shrink * JIT_MEAN;
  const chain = (1 - Math.pow(sEff, Math.max(1, levels - 1))) / (1 - sEff || 1);
  /* ⚠️ THE BLOOMS COUNT TOWARD THE REACH, because the control says "cut end to the furthest bloom"
     and a cluster stands proud of the stem that carries it. While the florets were tiny this was
     within the tolerance and nobody noticed; measuring them up to the reference's scale pushed the
     sprig past its own setting and the test caught it. The allowance is the cluster's own radius —
     blooms scatter within `floretSize * 2.2` of the tip, but that scatter is in every direction —
     only the outermost bloom's own radius actually extends the envelope, and droop has already
     taken its share of the reach. Subtracting the whole cluster undershot the setting by 20%. */
  const bloomReach = o.floretSize * 1.4;
  const reach = Math.max(o.height * 0.25, o.height - bloomReach);
  const baseLen = reach * Math.min(0.8, Math.max(0, o.baseFrac));
  /* What is left of the reach after the stub, shared down the branch chain. */
  const branchLen = Math.max(1e-4, reach - baseLen) / chain;
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0),
       baseLen, o.thickness, 1, branchLen);

  shadeBlooms(col, blooms, o);
  return finishGeometry(pos, nor, idx, col);
}

/* What a field costs, so a density control can be bounded by a number rather than by a guess. The
   branch count is a geometric series over the levels; blooms ride only on the last one. */
export function gypTriangleCount(seatCount, opts = {}) {
  const o = { ...GYP_DEFAULTS, ...opts };
  const levels = Math.max(1, Math.round(o.levels));
  const perNode = 2.5;                                    // 2 or 3, rolled evenly
  let stems = 0, tips = 1;
  for (let i = 1; i <= levels; i++) { stems += tips; tips *= perNode; }
  const stemTris = stems * STRAND_SIDES * STRAND_SEGS * 2;
  const bloomTris = (tips / perNode) * Math.max(1, Math.round(o.florets)) * PETALS * 4;
  return Math.round(seatCount * (stemTris + bloomTris));
}
