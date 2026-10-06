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
  /* Rows down the panel. There is no column count any more: the creases ARE the columns, so
     `ripples` decides the across-width density and `segH` only has to resolve the drop. */
  segH:   14,
};

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
  curl = WAFER_DEFAULTS.curl, splay = WAFER_DEFAULTS.splay,
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
  const creaseAt = (j, vv) => {
    const u01 = j / folds;
    const drop = hemProfile(hem, u01, notch, tear[j]);
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
export function buildWaferSkirt({ shape, tierHeight = 1, radius = 1, ...opts } = {}) {
  const o = { ...WAFER_DEFAULTS, ...opts };
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
      hem: o.hem, notch: o.notch, segW: o.segW, segH: o.segH, rng: rnd,
    });

    /* Stand it on the wall. The panel's +Z must become the perimeter's OUTWARD normal, so the
       rotation is the angle of that normal — taken from the normal itself rather than from the
       angle round a circle, which is the move that makes a sheet cake work (festoon.js's lesson:
       on a rect wall the normal is constant along a face and turns only at the corners). */
    const m = new THREE.Matrix4();
    const yaw = Math.atan2(at.nx, at.nz);
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
