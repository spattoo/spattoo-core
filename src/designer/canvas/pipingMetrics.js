// ── Piping shell metrics ──────────────────────────────────────────────────────
// Single source of truth for how tall a cream-piping shell renders, shared by the
// renderer (CakeTier) and the editor's vertical clamp (CakeDesigner) so the two can
// never drift.
//
// SHELL_HEIGHT_FRAC is the height-normalisation the renderer bakes into every shell:
// a shell is scaled so its *upright bounding box* is this fraction of the tier radius
// tall. But the renderer then TILTS each shell (placement_config rotation), which
// foreshortens its real vertical reach — so the upright fraction is only a fallback.
//
// The exact rendered extents (how far the shell reaches ABOVE and BELOW its anchor,
// as a fraction of the tier radius — radius-independent, since a shell's scale is
// proportional to the radius) are measured by the canvas as each shell is built and
// published here, keyed by (glbUrl, flip, size). The clamp reads them back for an
// exact "does the top edge touch the rim / does the bottom touch the board" test that
// holds for any cake size or template without hardcoded guesses.

export const SHELL_HEIGHT_FRAC = 0.24;

const measured = new Map();
const keyFor = (glbUrl, flip, size) => `${glbUrl}|${flip ? 1 : 0}|${(size ?? 1).toFixed(2)}`;

// Publish a measured shell's vertical extents (fractions of the tier radius).
export function setShellExtents(glbUrl, flip, size, extents) {
  if (glbUrl) measured.set(keyFor(glbUrl, flip, size), extents);
}

// Read back measured extents, or fall back to the upright normalisation (no tilt,
// base-anchored) scaled by size when this shell hasn't rendered/been measured yet. All values
// are fractions of the tier radius:
//   topFrac / botFrac       — vertical reach above / below the anchor (Height clamp)
//   radialOutFrac / radialInFrac — radial reach of the outer / inner edge, measured from the
//                             rim edge (so outerEdge = radius + offset + radius·radialOutFrac).
export function getShellExtents(glbUrl, flip, size) {
  return measured.get(keyFor(glbUrl, flip, size))
    ?? { topFrac: SHELL_HEIGHT_FRAC * (size ?? 1), botFrac: 0, radialOutFrac: 0, radialInFrac: -SHELL_HEIGHT_FRAC * (size ?? 1), outerFrac: 0 };
}

// ── Wrap-band extents ───────────────────────────────────────────────────────────
// A wrap band is a single pre-formed ring re-routed onto the wall. Like shells it publishes its
// measured vertical reach (top/botFrac, relative to its anchor) and outward reach (radialOutFrac),
// all as fractions of the tier radius, so the side-clearance resolver treats every band uniformly.
const measuredWrap = new Map();
const wrapKey = (glbUrl, size) => `${glbUrl}|${(size ?? 1).toFixed(2)}`;
export function setWrapExtents(glbUrl, size, extents) {
  if (glbUrl) measuredWrap.set(wrapKey(glbUrl, size), extents);
}
export function getWrapExtents(glbUrl, size) {
  return measuredWrap.get(wrapKey(glbUrl, size))
    ?? { topFrac: PIPING_WRAP_HEIGHT_FRAC_FALLBACK * (size ?? 1), botFrac: 0, outerFrac: 0 };
}
const PIPING_WRAP_HEIGHT_FRAC_FALLBACK = 0.4;

// ── Festoon (swag) extents ────────────────────────────────────────────────────
// A U-shaped festoon is a thick draped rope, so its real lowest point hangs well below the
// belly *centreline* (anchor − depth) by the rope's own half-thickness, and its ends sit a
// little proud above the anchor. The renderer measures the bent geometry's true bounding box
// and publishes how far it reaches BELOW and ABOVE the anchor (as fractions of the tier radius,
// which is radius-independent since the whole swag scales with the radius). The editor reads
// this so a swag is lifted to rest its ACTUAL cream — not the centreline — on the border below
// it, and so other layers stack around its real band. Keyed by (glbUrl, shape signature).
const measuredFestoon = new Map();
const festoonKey = (glbUrl, sig) => `${glbUrl}|${sig}`;

// Shape signature for a festoon — the params that change its bent geometry (and thus its
// vertical reach). Shared by renderer and editor so they key the same measurement.
export const festoonSig = (p) =>
  `${(p.size ?? 1).toFixed(2)}|${(p.bendDepth ?? 0.4).toFixed(2)}|${Math.round(p.festoons ?? 6)}|${p.bendRing ? 1 : 0}|${(p.bendTilt ?? 0).toFixed(1)}`;

export function setFestoonExtents(glbUrl, sig, extents) {
  if (glbUrl) measuredFestoon.set(festoonKey(glbUrl, sig), extents);
}

// Read back measured festoon extents, or the supplied fallback when this swag hasn't rendered
// yet (first add). Values are fractions of the tier radius:
//   bellyFrac — how far the lowest cream reaches BELOW the anchor
//   topFrac   — how far the highest cream reaches ABOVE the anchor
export function getFestoonExtents(glbUrl, sig, fallback) {
  return measuredFestoon.get(festoonKey(glbUrl, sig)) ?? fallback;
}

// ── Side-piping clearance ─────────────────────────────────────────────────────────
// A proud side decoration (a bow, a topper) seats its BACK on the tier wall and pokes outward.
// A cream band on the SAME wall (shell ring, festoon, wrap) also projects outward — measured as
// `radialOutFrac` above. Where the two share height, their volumes overlap and the meshes
// interpenetrate. `resolveSidePipingBands` turns a tier's stacked piping layers into absolute
// bands — each a vertical span `[loY, hiY]` on the wall plus how far its outer face stands proud
// of the wall (`out`, world units) — and `sidePipingClearance` returns the extra radial offset a
// decoration needs so its back rests on the DEEPEST overlapping band's outer face, not through it.
// Pure geometry off the ALREADY-measured extents (no re-measuring, no element-type branch); the
// mirror of the existing rule where a swag rests its real cream on the border below it.

const BEND_ANCHOR_FRAC = 0.55;   // festoon wall anchor (mirrors constants.js — kept local so this stays pure)

// A wall-hug SHELL (rose ring, dollop border) has a DEPTH bounding box far larger than the cream that
// fills it — measured ~2.6× the visible radial reach on a rosette. Clearing a proud decoration to that
// padded outer face flings it off the cake, so a shell band's clearance is capped at this fraction of
// the radius (the decoration nestles at the band instead of chasing the bbox tip). Solid FESTOON/WRAP
// bands measure tight (their ring bbox ≈ their cream), so they are never near this cap and aren't capped.
const SHELL_CLEARANCE_CAP_FRAC = 0.2;

// One layer → its absolute band, reading the same anchor/flip/extent keys the renderer publishes.
// `out` = the band's outer face proud of the wall (world units); `outerFrac` already folds in the
// band's radial positioning, so it's the one uniform reach across shell / festoon / wrap.
function bandForLayer(p, anchorY, flip, radius) {
  const size = p.size ?? 1;
  if (p.bend) {
    const ext = getFestoonExtents(p.glbUrl, festoonSig({
      size, bendDepth: p.bendDepth ?? 0.4, festoons: p.festoons ?? 6, bendRing: !!p.bendRing, bendTilt: p.bendTilt ?? 0,
    }), { bellyFrac: SHELL_HEIGHT_FRAC * size, topFrac: SHELL_HEIGHT_FRAC * size, outerFrac: 0 });
    return { loY: anchorY - ext.bellyFrac * radius, hiY: anchorY + ext.topFrac * radius, out: radius * (ext.outerFrac ?? 0) };
  }
  const ext = p.wrap ? getWrapExtents(p.glbUrl, size) : getShellExtents(p.glbUrl, flip, size);
  const reach = radius * (ext.outerFrac ?? 0);
  const out = p.wrap ? reach : Math.min(reach, radius * SHELL_CLEARANCE_CAP_FRAC);   // cap padded shells only
  return { loY: anchorY + ext.botFrac * radius, hiY: anchorY + ext.topFrac * radius, out };
}

// Resolve a tier's stacked piping into absolute side bands. `topPipings` anchor at the top edge,
// `bottomPipings` at the base (a festoon rides up to BEND_ANCHOR_FRAC of the wall). Bands with no
// outward reach are dropped — they can't be penetrated.
export function resolveSidePipingBands({ topPipings = [], bottomPipings = [], topY, yBase, height, radius }) {
  const bands = [];
  for (const p of topPipings) {
    if (!p?.glbUrl) continue;
    const anchorY = topY + (p.yOffset ?? 0) + (p.userYOffset ?? 0);
    const flip = p.userFlipTop !== undefined ? p.userFlipTop : (p.flipTop ?? false);
    bands.push(bandForLayer(p, anchorY, flip, radius));
  }
  for (const p of bottomPipings) {
    if (!p?.glbUrl) continue;
    const anchorY = p.bend
      ? yBase + height * BEND_ANCHOR_FRAC + (p.userYOffset ?? 0)
      : yBase + (p.yOffset ?? 0) + (p.userYOffset ?? 0);
    const flip = p.userFlipBottom !== undefined ? p.userFlipBottom : (p.flipBottom ?? true);
    bands.push(bandForLayer(p, anchorY, flip, radius));
  }
  return bands.filter(b => b.out > 1e-4);   // drop flush bands — nothing to penetrate
}

// The radial offset a decoration spanning [yBottom, yTop] needs to clear every band it overlaps:
// the outward reach of the DEEPEST overlapping band (0 when it overlaps none). The caller adds this
// to the wall seat so the decoration's back rests on that band's outer face.
export function sidePipingClearance({ bands = [], yBottom, yTop }) {
  let out = 0;
  for (const b of bands) {
    if (b.hiY >= yBottom && b.loY <= yTop) out = Math.max(out, b.out);
  }
  return out;
}

/* ── What a rim ring does to the LID, not to the wall ────────────────────────────────────────────
 *
 * The bands above answer "how far does this layer stick OUT", which is what a side decoration needs
 * in order not to bury itself in a drip. A rim ring also does something to the TOP: it occupies an
 * annulus of the lid and raises the surface there by its own height.
 *
 * ⚠️ SPRINKLES WERE THE REPORT, AND THEY SCATTERED AT THE LID NO MATTER WHAT WAS ON IT. Sandeep:
 * *"when sprinkles are used, they always spread on cake only. if the cake has some cream piping,
 * that area has piping, it should add on the piping. so whatever is the top surface that should be
 * used."* On a cake with a rosette rim the sprinkles landed UNDER the roses — visible only in the
 * bare middle, with a few caught against the roses' lower edge. The side already behaved: the same
 * picture shows them sitting correctly on the chocolate drip, through `resolveSidePipingBands`.
 * This is that mechanism for the other surface.
 *
 * A band is an annulus `[innerR, outerR]` measured from the tier centre, carrying the Y its top
 * face sits at. Geometry comes from the same measured extents the renderer publishes, and the
 * radial maths is `rimRadialBand`'s (CakeDesigner), so the lift and the nesting dial agree about
 * where a ring is.
 *
 * ⚠️ THREE LAYERS ARE SKIPPED, EACH FOR A REASON THAT IS NOT TIDINESS:
 *   · no `glbUrl` — a chocolate drip is procedural and hangs OUTSIDE the wall. It occupies no part
 *     of the lid, which is the same fact `occupiesRimBand` encodes for nesting.
 *   · `wrap` — a wrap band is re-routed onto the WALL. Nothing rests on it from above.
 *   · `instances` — a SINGLE-arrangement layer is a few discrete shells at authored angles, not a
 *     ring. An annulus would lift a sprinkle sitting at that radius three-quarters of the way round
 *     the cake, where there is nothing under it. Under-applying leaves a sprinkle on the icing;
 *     over-applying leaves it floating in mid-air, and only one of those is recoverable by eye.
 */
export function resolveTopPipingBands({ topPipings = [], topY, radius }) {
  const bands = [];
  for (const p of topPipings) {
    if (!p?.glbUrl || p.wrap || p.instances?.length) continue;
    const size = p.size ?? 1;
    const flip = p.userFlipTop !== undefined ? p.userFlipTop : (p.flipTop ?? false);
    const ext = getShellExtents(p.glbUrl, flip, size);
    const anchorY = topY + (p.yOffset ?? 0) + (p.userYOffset ?? 0);
    /* The renderer's own clamp, so the band sits where the ring is drawn: a positive AUTHORED
       offset raises the ceiling, a user nudge may not push the ring off the rim. Mirrors CakeTier. */
    const E = Math.min((p.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0),
                       Math.max(0, p.extraRadialOffset ?? 0));
    const a = radius + E + radius * (ext.radialInFrac ?? 0);
    const b = radius + E + radius * (ext.radialOutFrac ?? 0);
    bands.push({
      innerR: Math.max(0, Math.min(a, b)),
      outerR: Math.max(a, b),
      /* Height across the band, inner → outer, in world units. Absent for a shell that has not
         rendered yet; `topSurfaceYAt` then falls back to the crest, which is the old behaviour. */
      profile: ext.radialProfile ? ext.radialProfile.map(f => anchorY + radius * f) : null,
      flipped: a > b,   // the fracs can run outward→inward; the profile is always inner→outer in z
      /* ⚠️ `topFrac` IS ALREADY MEASURED FROM THE ANCHOR — do not add `botFrac` back. The first cut
         wrote `topFrac - botFrac`, reasoning from `ringBaseY` (which seats the shell at
         `anchorY - worldBotY`) and so counting the shell's below-anchor reach twice. `botFrac` is
         negative for any shell that dips below its anchor, so the surface came out a whole shell
         depth too high and the sprinkles hovered in clear air above the cream. `bandForLayer` three
         functions up has always had this right: `hiY: anchorY + ext.topFrac * radius`. */
      surfaceY: anchorY + radius * (ext.topFrac ?? 0),
    });
  }
  return bands;
}

/* The height something resting on the lid should sit at, `r` from the tier centre.
 *
 * ⚠️ IT READS THE PROFILE, NOT THE CREST. A rim ring is a dome across its band — measured on the
 * catalogue Rosette, 100% in the middle falling to 42% and 33% at the edges — so a single height
 * floats everything except a thin circle at the crest radius. That is precisely what shipped and
 * what came back as *"why the sprinkles forming a circle on the cream layer. it should be random."*
 *
 * Linear between samples: the profile is 16 buckets of the real geometry, and a sprinkle is small
 * compared with one bucket, so interpolating is as true as the sampling and far cheaper than
 * carrying the mesh here.
 *
 * ⚠️ `max`, NOT "the last one wins". Rim rings nest, so two can cover the same radius and a piece
 * rests on whichever is highest. Returns `topY` untouched when nothing is underneath — every cake
 * with no rim ring, and so every design saved before this existed.
 */
export function topSurfaceYAt(bands, r, topY) {
  let y = topY;
  for (const b of bands) {
    if (r < b.innerR || r > b.outerR) continue;
    let h;
    if (b.profile && b.profile.length) {
      const span = b.outerR - b.innerR;
      let t = span > 1e-9 ? (r - b.innerR) / span : 0;
      if (b.flipped) t = 1 - t;
      const x = t * (b.profile.length - 1);
      const i = Math.min(b.profile.length - 1, Math.max(0, Math.floor(x)));
      const j = Math.min(b.profile.length - 1, i + 1);
      h = b.profile[i] + (b.profile[j] - b.profile[i]) * (x - i);
    } else {
      h = b.surfaceY;
    }
    if (h > y) y = h;
  }
  return y;
}
