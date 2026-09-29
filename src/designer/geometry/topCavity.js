import * as THREE from 'three';
import { perimeter } from './surface.js';
import { ringNoise } from '../utils/random.js';

/* ── A dished top with a raised cream lip ───────────────────────────────────────────────────────
 *
 * The look in both reference photographs: the cake's top is not flat. The cream is scraped up into
 * a rounded lip all the way round the rim, and the middle sits a little lower — so the top reads as
 * a shallow dish rather than a lid. Sandeep: *"top edge of the cake has a cavity. there is cream
 * elevation at the edges... for a existing cake shape, baker would choose that top cavity, then it
 * should build that cavity with same cream color."*
 *
 * ⚠️ NOT A CHANGE TO THE TIER'S OWN GEOMETRY, AND THAT IS THE WHOLE DESIGN DECISION. The obvious
 * move is to dish the body: the round tier is a LatheGeometry and its profile runs straight from
 * the rim to the centre, so a dip is two more points. It would also mean touching all FIVE builders
 * — round-lathe, plain cylinder, rounded prism, outline prism, glyph prism — and every one of them
 * differently, which is exactly the per-shape branching INVARIANTS #1 exists to stop.
 *
 * ⚠️ AND IT WOULD MOVE THE SURFACE EVERY DECORATION SITS ON. Placement seats pieces on the tier's
 * top at a known height; dishing the body drops that height in the middle and leaves it at the rim,
 * so a decoration's seat would depend on where across the top it happens to be. That is a large
 * change to placement wearing the costume of a cosmetic one.
 *
 * So the cavity is a SEPARATE piece that sits on the top, built from `perimeter(shape)` — the same
 * abstraction festoon.js reached for when it had the same problem, and its comment says why: *"the
 * curve now walks a PERIMETER... One path, every shape."* Round, rectangle, heart, number: the ring
 * is the shape's own contour, not an approximation of it.
 *
 * ⚠️ IT IS COSMETIC RELIEF, NOT A HOLE. Nothing about placement changes — a decoration dropped in
 * the middle still seats on the nominal top. That is right for the look (the dish in both photos is
 * a couple of millimetres) and it is a limit worth knowing rather than discovering: ask for a deep
 * bowl and pieces will float over it.
 */

export const CAVITY_DEFAULTS = Object.freeze({
  /* How far the lip stands proud of the top, as a fraction of the tier's HEIGHT — never a world
     number (INVARIANTS #8), or it is right on one cake and wrong on the next. */
  /* ⚠️ THESE WERE CHOSEN AGAINST THE PHOTOGRAPH, IN THE SHEET, AND IT TOOK THREE PASSES. The first
     set — 0.045 over a 0.20 band, 13 slow swells — was a broad gentle dune. Sandeep, with it beside
     the reference: *"not really impressive, its not even close."* The second overcorrected into a
     jagged crown: narrow, tall, 36 ruffles, reading as torn rather than scraped.
 
     ⚠️ AND NEITHER MISS WAS VISIBLE UNTIL THE REFERENCE WAS IN THE SAME PICTURE. Two rounds of
     "closer now" went by while the photograph sat in another window at another scale. The project
     memory says exactly this — wire the reference into the harness — and `REF=` in
     scripts/shoot-cavity.mjs is that, finally.
 
     What the references actually show: a soft rounded lip, gently uneven, standing a little proud
     of a top that dips inside it. Not a dune, not a crown. */
  lip: 0.06,
  /* How wide the lip is, as a fraction of the tier's smallest half-span. The scraped ridge in both
     photographs is a fat band, not a piped line. */
  width: 0.08,
  /* How far the middle sinks, again against the height. Deliberately smaller than the lip: the look
     is mostly a raised edge, and a deep well would swallow the decorations that go in it. */
  dish: 0.018,
  /* Where the crest sits across the lip, 0 at the rim and 1 at the inner edge. Under a third,
     because a scraper drags the cream UP at the very edge and it falls away inward. */
  crest: 0.45,
  /* ── How uneven the ridge is ───────────────────────────────────────────────────────────────
   *
   * ⚠️ A UNIFORM LIP IS THE ONE THING THIS CANNOT BE. The first version swept one profile round the
   * contour and produced a machined torus — Sandeep: *"it looks like a regular uniform elevation.
   * thats not the case in reality. look at the reference images. since its cream and this cavity is
   * done manually, it wont be unform."* A scraper is dragged round by hand: it rides up, it drops,
   * the ridge fattens where it hesitated. Neither photograph has two matching inches of rim.
   *
   * `wobble` is how far the ridge strays from its nominal height and width, as a fraction of each.
   * It moves BOTH — a ridge that varied only in height reads as a wave rather than as cream, since
   * the part a scraper pushes about is how much of it there is. */
  wobble: 0.4,
  /* How many slow swells around the cake. The torn cream band uses 48, which is right for tearing;
     a scraped rim is a dozen unhurried passes of a hand, not fifty nicks. */
  /* ⚠️ 26 — and both 13 and 36 were wrong, in opposite directions. A dozen slow passes reads as a
     moulded wave; three dozen reads as torn. The count is what decides whether the eye sees a
     surface that was worked or a surface that was cast, and neither extreme looks like cream. */
  swells: 26,
  /* So one cake is not every cake. Two tiers with the same settings should not be stamped from the
     same die, which is the failure this whole block exists to avoid. */
  seed: 7,
});

/* How finely the ring is sampled around the cake. The lip is a silhouette seen edge-on against the
   sky in most views, so it shows faceting sooner than a wall does. */
/* Exported so a test can pull one ring out of the buffer. Circumferential wander and the profile's
   own rise across the lip both change `y`, so a test that filters by height alone measures the two
   together — which is how a uniform-lip assertion came to fail on a uniform lip. */
export const AROUND = 160;
/* How many rings across the lip's width. The profile is a curve, and four segments read as a
   chamfer rather than a scrape. */
export const ACROSS = 10;

const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * The cavity's profile: how high the cream sits at a given distance in from the rim.
 *
 * `u` is 0 at the outer edge and 1 at the inner edge of the lip. Returns a height relative to the
 * tier's flat top — positive on the ridge, negative in the dish.
 *
 * ⚠️ TWO SMOOTHSTEPS, NOT ONE ARC. A single curve from rim to floor gives a chamfer; the scrape has
 * a crest with a fall on BOTH sides of it, which is what makes the ridge read as cream pushed up
 * rather than an edge cut away.
 */
export function cavityProfile(u, { lip, dish, crest }) {
  const t = clamp01(u);
  const smooth = x => x * x * (3 - 2 * x);
  const c = Math.max(0.05, Math.min(0.95, crest));
  return t <= c
    /* Rim to crest: rises from flush to the full lip. */
    ? lip * smooth(t / c)
    /* Crest to floor: falls past flush and settles at the dish. */
    : lip + (-dish - lip) * smooth((t - c) / (1 - c));
}

/**
 * The cavity for a tier, as one geometry sitting at the tier's top.
 *
 * @param shape  the tier's footprint — anything `perimeter()` understands
 * @param height the tier's height, which every fraction above is measured against
 * @param cfg    overrides on CAVITY_DEFAULTS
 * @returns THREE.BufferGeometry in the tier's own frame, with y = 0 at the flat top
 */
export function buildTopCavity(shape, height, cfg = {}) {
  const c = { ...CAVITY_DEFAULTS, ...cfg };
  const perim = perimeter(shape);
  if (!perim?.length || !(height > 0)) return null;

  const lip = c.lip * height;
  const dish = c.dish * height;
  /* The band's width against the shape's own smallest half-span, so a wide sheet cake and a small
     round get a lip in the same proportion to themselves. */
  const span = shape.kind === 'rect'
    ? Math.min(shape.halfW, shape.halfD)
    : (shape.radius ?? Math.max(1e-3, perim.length / (2 * Math.PI)));
  const width = c.width * span;

  /* ⚠️ TWO NOISE RINGS, NOT ONE, AND OFFSET SEEDS. Driving height and width from the same wander
     makes the ridge tallest exactly where it is widest, every time — a regularity of its own, and a
     more obvious one than the uniform lip it replaced. Independent rings let it be tall and thin in
     one place and low and fat in another, which is what a hand does. */
  const hN = ringNoise(AROUND, c.swells, c.seed);
  const wN = ringNoise(AROUND, c.swells, c.seed + 101);

  const pos = [];
  const idx = [];
  const ringOf = [];

  for (let j = 0; j <= ACROSS; j++) {
    const u = j / ACROSS;
    const start = pos.length / 3;
    for (let i = 0; i < AROUND; i++) {
      const p = perim.at((i / AROUND) * perim.length);
      /* ⚠️ THE WANDER IS PER-SAMPLE, SO THE PROFILE IS RESOLVED INSIDE THIS LOOP rather than once
         per ring. That is the whole difference between a swept solid of revolution and a scraped
         edge: the cross-section is no longer the same all the way round. */
      const lipHere = lip * (1 + c.wobble * hN[i]);
      const wHere = width * (1 + c.wobble * 0.6 * wN[i]);
      const y = cavityProfile(u, { lip: lipHere, dish, crest: c.crest });
      /* Inward along the contour's own outward normal — the one thing every perimeter reports,
         which is what makes a heart inset like a heart rather than like the circle round it. */
      pos.push(p.x - p.nx * wHere * u, y, p.z - p.nz * wHere * u);
    }
    ringOf.push(start);
  }

  /* The band: one quad per sample per step, closed around. */
  for (let j = 0; j < ACROSS; j++) {
    const a = ringOf[j], b = ringOf[j + 1];
    for (let i = 0; i < AROUND; i++) {
      const n = (i + 1) % AROUND;
      idx.push(a + i, b + i, a + n);
      idx.push(a + n, b + i, b + n);
    }
  }

  /* The floor inside the lip: a fan to the middle, at the dish's depth. Flat, because the dish in
     both photographs is flat with the ripple of the scraper across it — the ripple is a surface
     finish, not geometry, and belongs to whatever texture the tier already wears. */
  const centre = pos.length / 3;
  pos.push(0, -dish, 0);
  const inner = ringOf[ACROSS];
  for (let i = 0; i < AROUND; i++) {
    const n = (i + 1) % AROUND;
    idx.push(centre, inner + n, inner + i);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
