import * as THREE from 'three';

/* ── A fondant balloon ───────────────────────────────────────────────────────────────────────────
 *
 * The reference: three fondant balloons on picks above a baby-shower cake — a pale egg, a mint one
 * and a pink one, each tapering to a little knot where the stick goes in.
 *
 * ⚠️ A SURFACE OF REVOLUTION, WHICH IS WHY THIS IS PROCEDURAL AT ALL. A balloon is the easiest
 * shape in the catalogue to generate: one profile curve, spun. It needs no asset to host, scales to
 * any size without a second model, and takes whatever colour a customer picks — none of which is
 * true of the GLB route. `THREE.LatheGeometry` does the spinning; everything here is the profile.
 *
 * ⚠️ AND IT DOES NOT BUILD A STICK. One already exists and is authored per element on the Manage
 * Elements row (`elementStick.js`, `topperStick`), with a bury depth, precisely so it would not
 * live inside individual studios — Sandeep, when that was built: *"we did that for few elements.
 * but its part of that individual studio. not as a manage element screen property."* A balloon with
 * its own private stick would be that mistake made again. This models the balloon from its apex
 * down to the bottom of the knot and stops; the pick is the row's business.
 *
 * ── THE PROFILE, AND WHY EACH NUMBER IS THERE ───────────────────────────────────────────────────
 * Read bottom to top, which is how it is built: knot, neck, shoulder, crown.
 *
 *   `belly`   where the widest point sits, 0 at the neck and 1 at the crown. A balloon is NOT an
 *             ellipsoid — it is widest ABOVE its middle, which is what makes it read as inflated
 *             rather than as an egg lying on its end. 0.5 is the egg; the references are nearer 0.6.
 *   `neck`    how far it pinches in before the knot, as a fraction of the widest radius.
 *   `knot`    the little ball of fondant below the neck, where the pick goes.
 *   `crown`   how blunt the top is. Low is a teardrop, high is a dome.
 *
 * Everything is a fraction of `height`, so one authored balloon suits a 2cm one and a 6cm one
 * (INVARIANTS #8) — the caller scales, this never carries a world dimension.
 */

export const BALLOON_DEFAULTS = Object.freeze({
  height: 1,       // apex to the bottom of the knot
  width:  0.74,    // widest diameter, × height — fondant balloons are rounder than real latex ones
  belly:  0.58,    // 0 … 1 up the body: where the widest point sits
  neck:   0.17,    // waist radius before the knot, × the widest radius
  knot:   0.085,   // the nub's radius, × height
  crown:  0.86,    // 0 … 1: how blunt the top is
  segments: 14,    // profile samples per section — the silhouette is a curve, so this is what shows
  radial:  48,
});

/* The profile, as (radius, y) from the bottom of the knot upward. Exported on its own because a
 * silhouette is far easier to judge as a line than as a render, and a test can read it directly. */
export function balloonProfile({
  height = BALLOON_DEFAULTS.height, width = BALLOON_DEFAULTS.width,
  belly = BALLOON_DEFAULTS.belly, neck = BALLOON_DEFAULTS.neck,
  knot = BALLOON_DEFAULTS.knot, crown = BALLOON_DEFAULTS.crown,
  segments = BALLOON_DEFAULTS.segments,
} = {}) {
  const maxR  = (width * height) / 2;
  const knotR = Math.max(1e-4, knot * height);
  const bellyY = Math.max(0.02, Math.min(0.98, belly)) * height;
  const pts = [];

  // ── The knot: a small ball under the neck, closed at the bottom so the solid has no hole.
  const knotTop = knotR * 1.25;
  for (let i = 0; i <= segments / 2; i++) {
    const t = i / (segments / 2);                 // 0 at the very bottom, 1 where it meets the neck
    pts.push(new THREE.Vector2(knotR * Math.sin(t * Math.PI * 0.5), knotTop * (1 - Math.cos(t * Math.PI * 0.5))));
  }

  // ── Neck into belly: the inflated part swells away from the waist.
  const waistR = Math.max(knotR * 1.05, neck * maxR);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const y = knotTop + (bellyY - knotTop) * t;
    // Eased so the waist stays tight for a moment and then opens — a linear ramp here reads as a
    // cone, which is the single thing that stops it looking like a balloon.
    const r = waistR + (maxR - waistR) * Math.sin(t * Math.PI * 0.5) ** 1.35;
    pts.push(new THREE.Vector2(r, y));
  }

  // ── Belly to crown: back in to the apex, blunt or pointed by `crown`.
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const y = bellyY + (height - bellyY) * t;
    const r = maxR * Math.cos(t * Math.PI * 0.5) ** (1 - crown * 0.55);
    pts.push(new THREE.Vector2(Math.max(0, r), y));
  }
  // The apex itself, exactly on the axis, so the lathe closes instead of leaving a pinhole.
  pts.push(new THREE.Vector2(0, height));
  return pts;
}

/** The balloon, standing on its knot with y = 0 at the bottom — where a pick would go in. */
export function buildBalloon(opts = {}) {
  const o = { ...BALLOON_DEFAULTS, ...opts };
  const g = new THREE.LatheGeometry(balloonProfile(o), o.radial);
  g.computeVertexNormals();
  return g;
}
