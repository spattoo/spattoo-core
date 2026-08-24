import * as THREE from 'three';

// ── A fondant cloud ───────────────────────────────────────────────────────────
// Generated, not modelled, for the reason grass.js sets out: procedural work succeeds on subjects
// with no "precise familiar signature the eye can check", and a cloud is the clearest case there is.
// It is a handful of lumps. There is no proportion to get wrong and no material trick to miss.
//
// The stronger reason is the WALL. A cloud pressed onto the side of a cake has to bend round it — a
// modelled plaque laid flat against a round tier touches in the middle and floats at its ends, which
// is what festoon.js bends imported strips to avoid. That is not a scale factor, so no authored
// asset fixes it.
//
// TWO VARIANTS, from two references, and they are different objects rather than one at two sizes:
//
//   'puff' — a bunch of balls, fully three-dimensional. It SITS ON things: the cake top beside a
//            sun, the board at the front. It reads from any angle.
//   'flat' — one plaque with a bumpy top and a straight bottom, PRESSED ON a wall, standing on the
//            board. A silhouette, not a solid.
//
// What they share is the description underneath: a cloud is a row of overlapping circles. The puff
// makes them spheres; the flat one makes them discs in a plane and adds a base to sit on. That is
// why one generator does both — the variant picks how the same lobes are built, not what they are.

export const CLOUD_DEFAULTS = {
  variant: 'puff',          // 'puff' | 'flat'
  // Every measurement below is × the TIER radius, never a world constant (INVARIANTS #8), so one
  // authored cloud suits a 6" and a 10" untouched — the same rule the rainbow follows.
  scale: 1,                 // overall size; multiplies width and height together, shape untouched
  width: 0.62,              // how wide the cloud is, corner to corner
  height: 0.30,             // how tall at its highest point, above the surface it sits on
  lobes: 5,                 // how many lumps
  variation: 0.35,          // how unequal they are; 0 is a row of identical balls, which is a caterpillar
  depth: 0.10,              // 'flat' only: how thick the plaque is
  surface: 'top',           // 'top' | 'board' | 'side'
  offsetX: 0,               // where it sits along the surface
  standoff: 0,              // 'top' only: how far off the centre line, toward the viewer
  theta: 0,                 // 'side' only: where round the wall, radians. 0 is the front
  color: '#FFFFFF',
  segments: 24,
};

/**
 * Deterministic wobble for lobe `i`, in 0…1.
 *
 * NOT Math.random. A design is saved as numbers and rendered again later — on the customer's phone,
 * in the baker's order, in the template thumbnail. A cloud that reshuffles its lumps on every render
 * is a different cloud each time it is looked at, and the thumbnail stops matching the cake.
 */
function wobble(i) {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The lumps a cloud is made of, in the cloud's own flat space: x across, y up from the surface.
 *
 * The middle is the tallest and the ends are the smallest, which is what makes a bunch of circles
 * read as a cloud rather than a row of bubbles. Every lobe RESTS on the base line — centre one
 * radius up, nothing below it — so a cloud set on a board sits on the board rather than in it.
 */
export function cloudLobes(params = {}, cake = {}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  const size = p.scale ?? 1;
  const width = p.width * R * size;
  const height = p.height * R * size;
  const n = Math.max(1, Math.round(p.lobes));

  // Every lump RESTS on the base line — centre one radius up, nothing below it. Sinking them into
  // the line would overlap their sides more prettily and put the bottom of each ball underneath the
  // surface it is supposed to be sitting on, which on the board means half a cloud inside the board.
  // The scalloped underside that leaves is correct for a puff: it is what a bunch of balls set down
  // on a surface actually looks like. The flat variant gets its straight bottom from a base slab
  // instead, which is how the cut-out is made.
  const rMax = height / 2;

  const half = width / 2;
  const lobes = [];
  for (let i = 0; i < n; i++) {
    // -1 … +1 across the cloud. A single lobe sits in the middle.
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    // Falls away toward the ends, then nudged unequal. Without the nudge a cloud is symmetrical,
    // and a symmetrical cloud looks like a diagram of a cloud.
    const taper = 1 - 0.45 * t * t;
    const nudge = 1 + (p.variation ?? 0) * (wobble(i) - 0.5);
    const r = Math.max(rMax * 0.15, rMax * taper * nudge);
    lobes.push({
      // The outermost lobes' EDGES reach ±half, so `width` is the cloud's real width and not the
      // distance between the middles of its end lumps.
      x: t * Math.max(0, half - r),
      y: r,
      r,
    });
  }
  return {
    lobes, width, height, thickness: p.depth * R * size,
    // The flat cut-out's straight bottom. A row of circles has a scalloped underside, and the
    // reference plaque plainly does not — it is a shape cut with a knife, resting flat on the board.
    // The slab fills the scallops and leaves the bumpy top, which is the silhouette.
    baseHeight: height * 0.30,
  };
}

/**
 * Where the cloud's base line sits in the world, and what it is standing on.
 *
 * 'board' and 'side' both rest on the board — a flat cloud pressed on the wall still stands on
 * something, it does not hover at an arbitrary height up the tier.
 */
export function cloudBaseY(surface, { topY = 0, boardY = 0 } = {}) {
  return surface === 'top' ? topY : boardY;
}

/**
 * A cloud never hangs off the edge of what it sits on.
 *
 * The same rule the rainbow's standing arch follows, and for the same reason: half a cloud over the
 * rim rests on nothing. It shrinks rather than moving, because where it sits is the author's
 * decision and its size is not.
 *
 * Returns the factor to multiply width and height by; 1 when it already fits.
 */
export function cloudFitScale({ centerX, standoff, width, cakeRadius }) {
  if (!(width > 0)) return 1;
  // The footprint is a circle, so standing a cloud back leaves it LESS width, not the same width
  // further away — the same correction fitOnTopScale makes for the rainbow.
  const across = Math.sqrt(Math.max(0, cakeRadius * cakeRadius - standoff * standoff));
  const room = across - Math.abs(centerX);
  if (room <= 0) return 0.05;
  return Math.min(1, room / (width / 2));
}

/**
 * The cloud placed in the world: one entry per lump, ready to render.
 *
 * `surface` decides the whole placement, not just a height:
 *   'top'   — sits on the cake top, facing the viewer, kept inside the rim.
 *   'board' — sits on the board, in front of the cake, so nothing has to fit anywhere.
 *   'side'  — pressed onto the wall. Each lump goes to its OWN angle round the tier, which is what
 *             hugging means: `x` is a distance ALONG the wall and becomes an angle by dividing by
 *             the radius, the same conversion wrapToWall makes for a rope. Laying the lumps in a
 *             flat plane instead would touch in the middle and float at the ends.
 */
export function cloudPlacement(params = {}, cake = {}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  const baseY = cloudBaseY(p.surface, cake);
  const onWall = p.surface === 'side';
  const onTop = p.surface === 'top';

  let { lobes, width, height, thickness, baseHeight } = cloudLobes(p, cake);
  const centerX = (p.offsetX ?? 0) * R;
  const standoff = (p.standoff ?? 0) * R;

  // Only a cloud ON the cake has an edge to fall off. One on the board or the wall has the whole
  // board under it, and shrinking it there would be answering a question nobody asked.
  let fit = 1;
  if (onTop) {
    fit = cloudFitScale({ centerX, standoff, width, cakeRadius: R });
    if (fit < 1) {
      lobes = lobes.map(l => ({ x: l.x * fit, y: l.y * fit, r: l.r * fit }));
      width *= fit; height *= fit; baseHeight *= fit;
    }
  }

  const placed = lobes.map(l => {
    if (onWall) {
      // Divided by the radius the lump's own middle sits at, so the cloud keeps the width it was
      // drawn as. A plaque bent round a cake must not become a different amount of fondant to roll.
      const rw = R + thickness / 2;
      const th = (p.theta ?? 0) + (centerX + l.x) / rw;
      return {
        r: l.r,
        position: new THREE.Vector3(Math.sin(th) * rw, baseY + l.y, Math.cos(th) * rw),
        // Facing out of the wall, so a disc lies ON it rather than edge-on to it.
        rotationY: th,
      };
    }
    // On the top or the board it is a flat object facing the viewer, so every lump shares one plane.
    const z = onTop ? standoff : R + width * 0.35;
    return { r: l.r, position: new THREE.Vector3(centerX + l.x, baseY + l.y, z), rotationY: 0 };
  });

  // The slab, in the same world space as the lumps. Only the flat variant has one: a puff standing
  // on a plinth would be a cloud on a shelf.
  const base = p.variant === 'flat'
    ? (() => {
        if (onWall) {
          const rw = R + thickness / 2;
          const th = (p.theta ?? 0) + centerX / rw;
          return { width, height: baseHeight, thickness,
                   position: new THREE.Vector3(Math.sin(th) * rw, baseY + baseHeight / 2, Math.cos(th) * rw),
                   rotationY: th };
        }
        const z = onTop ? standoff : R + width * 0.35;
        return { width, height: baseHeight, thickness,
                 position: new THREE.Vector3(centerX, baseY + baseHeight / 2, z), rotationY: 0 };
      })()
    : null;

  return { lobes: placed, base, width, height, thickness, baseY, fit, variant: p.variant };
}

/**
 * What the baker rolls, as proportions of the cake — never millimetres.
 *
 * The same rule the rainbow's guide follows: a millimetre is a promise about a cake nobody has seen,
 * and the baker bakes the cake they bake. "A ball two-fifths as wide as the cake" survives any size
 * and is how the work is actually done: roll, offer up, trim.
 */
export function cloudGuide(params = {}, cake = {}) {
  const { lobes, width } = cloudPlacement(params, cake);
  const cakeWidth = (cake.radius ?? 1) * 2;
  return {
    balls: lobes.length,
    widthOfCakeWidth: +(width / cakeWidth).toFixed(2),
    // Biggest first: it is the one a baker rolls to size and matches the rest against.
    ballsOfCakeWidth: lobes
      .map(l => +((l.r * 2) / cakeWidth).toFixed(2))
      .sort((a, b) => b - a),
  };
}
