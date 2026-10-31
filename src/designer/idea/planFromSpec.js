/* ── A spec becomes placements — the half that knows where things actually go ────────────────────
 *
 * ⚠️ IT PLANS, IT DOES NOT BUILD, and that distinction is the whole design. A placed sticker is not
 * a small object: `addSticker` reads nine fields off `placement_config`, de-overlaps the seat
 * against coincident siblings, and resolves a sheet's size against the tier it lands on — state
 * this function does not have and must not pretend to. So the output is instructions, and the
 * applier feeds them to `addSticker` itself. One place still knows how a sticker is made.
 *
 * ⚠️ AND IT ASKS THE SAME THREE FUNCTIONS THE CARD ASKS. `placementSlots` for which seats exist,
 * `seatOnSlot` for where one is, `scaleRangeOf` for how big a piece may be. A composed cake and a
 * tapped one therefore land identically — and when the baker drags the piece afterwards, the drag
 * honours the seat this planned, because it is the same seat (INVARIANTS #10 law 1). A planner that
 * computed its own positions would be a cake that jumps the first time it is touched.
 *
 * ⚠️ EVERY REFUSAL IS REPORTED, NEVER SWALLOWED. A spec naming an element the baker does not have,
 * or a zone that element does not allow, is the normal case — a composer works from a shortlist and
 * a shortlist goes stale. Each one lands in `dropped` with a reason. Combined with the spec's own
 * `wanted`, that is the commissioning queue: what was asked for and could not be placed.
 */

import { placementSlots, seatOnSlot, scaleRangeOf, zonePoses, flatPose } from '../placement.js';
import { ZONES, STICKER_SIZE } from '../constants.js';
import { normaliseSpec } from './cakeSpec.js';

/* Where in an element's own legal range each prominence sits. Fractions, not sizes: a 3D model's
   range and a flat decal's are different numbers for the same word, and the element row is the one
   that knows. `hero` stops short of the maximum on purpose — the top of a range is usually the
   point at which a piece overhangs, and an idea should look composed rather than maximal. */
const PROMINENCE_AT = Object.freeze({ hero: 0.8, feature: 0.5, accent: 0.25 });

/** Snap a value to a step, so a planned size is one the dial can also express. */
function onStep(value, { min, max, step }) {
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  return Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step));
}

/**
 * Turn a spec into placements.
 *
 *   spec      a validated spec (see cakeSpec.js)
 *   elements  the rows the ids refer to — `Map(id → element)` or an array
 *   seatCtxFor(tierIndex) → the `seatOnSlot` context for this cake. The caller builds it, for the
 *             reason seatOnSlot takes its world as data: the board lives in the canvas.
 *
 * Returns { tiers, message, age, placements, dropped, wanted, why }.
 */
export function planFromSpec(spec, { elements, seatCtxFor } = {}) {
  const s = normaliseSpec(spec ?? {});
  const byId = elements instanceof Map
    ? elements
    : new Map((elements ?? []).map(e => [e.id, e]));

  const tierCount = Math.max(1, s.cake.tiers.length);
  const placements = [];
  const dropped = [];

  for (const want of s.elements) {
    const el = byId.get(want.elementId);
    if (!el) {
      /* ⚠️ NOT AN ERROR. A composer works from a shortlist, and a shortlist is a snapshot — an
         element retired between the call and the build is ordinary. Say so and carry on; a cake
         missing one piece beats no cake. */
      dropped.push({ elementId: want.elementId, why: 'not in this baker\'s library' });
      continue;
    }

    const slots = placementSlots(el, tierCount);
    const slot = slots.find(sl => sl.zone === want.zone);
    if (!slot) {
      /* ⚠️ THE ELEMENT'S OWN `allowed_zones` DECIDES, NOT THE SPEC. A model asked for a side-only
         piece on the board is making a claim about geometry it cannot see; the row already knows.
         This is the "model proposes, placement disposes" line, and it is enforced here rather than
         trusted in a prompt. */
      dropped.push({
        elementId: want.elementId, name: el.name, why: `does not allow ${want.zone}`,
        allows: slots.map(sl => sl.zone),
      });
      continue;
    }

    /* The poses the SEAT will honour, not the ones the config names — `zonePoses`, for the reason
       the placement chooser uses it: a board hug collapses to standing, and planning the pose the
       config lists would plan one the seat coerces away. */
    const poses = zonePoses(el.placement_config, slot.zone, 'hug');
    const mode = flatPose(slot.zone, poses[0] ?? 'hug');

    const range = scaleRangeOf(el, 0.3, 2.5, 0.05);
    const at = PROMINENCE_AT[want.prominence] ?? PROMINENCE_AT.feature;
    const scale = onStep(range.min + (range.max - range.min) * at, range);

    const ctx = seatCtxFor ? seatCtxFor(slot.tierIndex, el) : null;
    const seat = ctx ? seatOnSlot({ ...slot, mode }, ctx) : { mode, pos: {} };

    /* ⚠️ `count` IS REPEATED PLACEMENTS, NOT ONE BIGGER PIECE, and they all get the SAME seat. The
       applier passes them to `addSticker` one at a time, which de-overlaps each against the
       siblings already down — the same rule a baker tapping twice gets. Spreading them here would
       be this module deciding positions, which is the thing it does not do. */
    for (let i = 0; i < Math.max(1, want.count); i++) {
      placements.push({
        elementId: el.id,
        name: el.name,
        zone: slot.zone,
        tierIndex: slot.tierIndex,
        placementMode: seat.mode,
        position: seat.pos,
        scale,
        prominence: want.prominence,
      });
    }
  }

  return {
    tiers: s.cake.tiers.map((t, i) => ({
      index: i,
      color: t.color ?? null,
      frostingStyle: t.frostingStyle ?? null,
      coat: t.coat ?? null,
    })),
    message: s.message,
    age: s.age,
    placements,
    /* Two different absences, kept apart. `wanted` is what the composer could not find in the
       catalogue at all; `dropped` is what it named and the cake refused. The first commissions a
       new element, the second fixes a prompt or a row — merging them would lose which. */
    wanted: s.wanted,
    dropped,
    why: s.why,
  };
}

/* The unit a scale multiplies, re-exported so a caller sizing a preview does not reach into
   constants for a number this module already depends on. */
export { STICKER_SIZE, ZONES };
