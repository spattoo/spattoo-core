import { ringNoise } from '../utils/random.js';

const TAU = Math.PI * 2;

/* ── The turntable spiral on a cake's top ────────────────────────────────────────────────────────
 *
 * A palette knife is set down in the middle of a smoothed top and the turntable is spun; the knife
 * is drawn outward as it goes, so it leaves one continuous groove coiling from the centre to the
 * rim. Sandeep, pointing at it in the reference photograph: *"spiral is a separate thing"* — and
 * then, as its own feature: *"so spiral is an option user can select separately. so both edge
 * elevation, spiral can individually be selected."*
 *
 * ⚠️ THE FIELD IS NOT NEW, AND WRITING A SECOND ONE WOULD HAVE BEEN THE MISTAKE. `makeSwirlField`
 * has been in creamWall.js since the piped styles landed, and the comment above it describes this
 * reference photograph almost word for word: *"THE REFERENCE CAKE'S TOP IS NEARLY FLAT. It carries a
 * few soft concentric rings, the marks a palette knife leaves when it is set in the middle of a
 * smoothed top and the turntable is spun."* What was missing was never the maths — five lines of
 * Archimedean coordinate — it was that the field could only be reached through `top: 'spiral'` on a
 * piped style, so a smooth or waved cake could not have the top its own photograph shows.
 *
 * So this module is the field plus the two things it needs to stop being a machine part: a taper at
 * the outer edge, and a wander so the rings are not perfect circles.
 *
 * ⚠️ IT DOES NOT BUILD A MESH, AND THAT IS DELIBERATE. The spiral and the raised rim are the same
 * surface — one sheet of cream worked with one tool — so they share topCavity.js's grid. A disc of
 * its own would z-fight the cavity's floor wherever both were on, and could not meet the cavity's
 * inner edge without gaps, because that edge wobbles and a polar disc does not. See `buildTopSurface`.
 */

/**
 * One Archimedean coordinate turned into a ripple: `turns` revolutions between the rim and the
 * middle, one wave per revolution. Returns 0 in the groove and 1 on the land between two of them.
 *
 * ⚠️ MOVED HERE FROM creamWall.js, WHERE THE PIPED LID HAD IT TO ITSELF. Identical maths, no longer
 * reachable only through `top: 'spiral'`. creamWall re-exports it, so its own callers and tests are
 * untouched.
 */
export function swirlPhase({ turns, rOut }) {
  return (r, theta) => turns * (1 - Math.min(1, r / rOut)) + theta / TAU;
}

export function makeSwirlField({ turns, rOut }) {
  const phase = swirlPhase({ turns, rOut });
  return (r, theta) => 0.5 - 0.5 * Math.cos(TAU * phase(r, theta));
}

/* How much of ONE TURN'S spacing the groove itself takes up: 1 in the cut, 0 on the flat between.
 *
 * ⚠️ A COSINE IS THE WRONG SECTION FOR A KNIFE, and this is what came back from the first render.
 * `0.5 - 0.5cos` spends half of every turn going down and half coming back up, so each ring is a fat
 * wave and the whole top rolls like water. Sandeep, with the pink cake beside it: *"spirals should
 * not this much thick. see the reference image."* Both references show the same thing — a flat top
 * with a THIN line incised in it, land far wider than cut. That is what a knife tip does; the cosine
 * is what a whole spatula face would do.
 *
 * ⚠️ AND THE COSINE STAYS WHERE IT IS. The piped lid's soft ripple was chosen and approved on its
 * own cake, where a rope-piped wall meets a gently rippled top. Only the phase is shared.
 */
export function grooveProfile(phase, width) {
  /* Distance from the nearest groove centre, as a fraction of half the spacing: 0 in a cut, 1 midway
     between two. */
  const d = Math.abs(((phase % 1) + 1.5) % 1 - 0.5) * 2;
  const t = Math.min(1, d / Math.max(1e-4, width));
  return 1 - t * t * (3 - 2 * t);
}

export const SPIRAL_DEFAULTS = Object.freeze({
  /* How many times the groove goes round between the middle and the outside.
     ⚠️ COUNTED OFF THE REFERENCE, not chosen. The blue cake has a tight coil at the centre and
     three clear rings outside it before the cream runs up into the rim — four turns. The existing
     piped lid defaults to 7, which is a different look on a different cake (a coiled rope, read from
     directly above) and is not evidence for this one. */
  turns: 4,
  /* How deep the groove cuts, as a fraction of the tier's HEIGHT — never a world number
     (INVARIANTS #8).
     ⚠️ SWEPT AGAINST THE PHOTOGRAPH, AND THE REASONED NUMBER WAS 2.5× TOO SHALLOW. The first value
     was argued from the cavity beside it — the dish is 0.018 of the height, the ripple looks like a
     third of that, so 0.006 — and on screen that is a groove you have to be told is there. Depth
     read off a render does not follow depth reasoned off a neighbouring parameter, because what the
     eye picks up is the shading across the groove's WALL, not how far down its floor is. 0.010 is
     still faint; 0.022 starts to read as carved. */
  depth: 0.015,
  /* How much of the floor's outer edge the groove fades out over, as a fraction of the radius.
     ⚠️ THE KNIFE LIFTS BEFORE THE EDGE. In the photograph the outermost ring stops with a clear
     band of smooth cream between it and the rim; run out to the boundary instead and the spiral
     notches the lip, which turns a scraped edge into a milled one. */
  fade: 0.15,
  /* How wide the cut is against the space between two cuts, 0..1 — a half would be the old cosine.
     ⚠️ MEASURED OFF BOTH PHOTOGRAPHS: the land between two grooves is three or four times the groove
     itself, so the top reads as flat cream with a line drawn in it rather than as ripples. Swept
     beside the pink cake at 0.16 / 0.20 / 0.24: by 0.24 the ring is broadening back towards a wave,
     and 0.5 IS the old cosine. */
  width: 0.18,
  /* ── How far the rings stray from being circles ───────────────────────────────────────────────
   *
   * ⚠️ THE UNIFORM VERSION IS THE ONE THING THIS CANNOT BE, and the cavity beside it already paid
   * for that lesson in full: a swept, perfectly regular ridge came back as *"it looks like a regular
   * uniform elevation. thats not the case in reality."* A turntable is spun by hand and the cake is
   * never quite centred on it, so the rings in the photograph are slightly oval and not concentric.
   * Applying the finding here up front rather than discovering it again is the whole point of having
   * written it down.
   *
   * `wander` is how far a ring's radius strays, as a fraction of itself. */
  wander: 0.07,
  /* How many slow lobes of that wander go round. Few, and large: an off-centre turntable is one slow
     swell per revolution, not a ripple — this is a different hand from the scraper's 26 passes. */
  swells: 5,
  seed: 3,
});

/* How finely the wander is sampled around. Matches topCavity's AROUND so the two rings of noise are
   read the same way; it is a lookup by angle, not a mesh resolution. */
const WANDER_N = 160;

/**
 * The spiral's height field for one tier top.
 *
 * @param cfg   overrides on SPIRAL_DEFAULTS
 * @param rOut  the radius the groove runs out to — the floor's own outer edge, so the spiral fills
 *              whatever room the rim leaves it rather than assuming the tier's full radius
 * @param height the tier's height, which `depth` is a fraction of
 * @returns (x, z) => y, a DROP below the floor (never positive: a knife removes cream, it does not
 *          add it — so the floor it is applied to stays the high-water mark)
 */
export function spiralField(cfg, rOut, height) {
  const c = { ...SPIRAL_DEFAULTS, ...cfg };
  if (!(rOut > 0) || !(height > 0) || !(c.depth > 0) || !(c.turns > 0)) return () => 0;

  const depth = c.depth * height;
  const phase = swirlPhase({ turns: c.turns, rOut });
  const wob = ringNoise(WANDER_N, c.swells, c.seed);

  return (x, z) => {
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    /* The wander goes on the RADIUS, not on the height. Moving the height would dent the rings in
       place; moving the radius moves the rings themselves, which is what an off-centre spin does —
       the groove arrives early on one side of the cake and late on the other. */
    const i = Math.floor(((theta / TAU + 1) % 1) * WANDER_N) % WANDER_N;
    const rEff = r * (1 + c.wander * wob[i]);
    /* 1 inside the cut, 0 on the flat between two cuts. */
    const cut = grooveProfile(phase(rEff, theta), c.width);
    /* The knife lifting near the edge. `fade` is measured from the outside in, so the taper lands on
       the last ring rather than being spread across all of them. */
    const t = Math.min(1, Math.max(0, (1 - r / rOut) / Math.max(1e-4, c.fade)));
    const lift = t * t * (3 - 2 * t);
    return -depth * cut * lift;
  };
}
