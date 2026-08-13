/* ⛔ PARKED 2026-08-10 — exploration, not a feature. Nothing imports this.
 *
 * Four approaches to per-element help were built and looked at side by side; none was convincing
 * enough to ship. Kept rather than deleted because the DERIVATION is the reusable part: help
 * generated from an element's own allowed_zones / placement_config / allowed_actions, needing no
 * per-element authoring. The verdict, what each option failed at, and what a next attempt should do
 * differently are in spattoo-docs/plans/element-help.md — read that before reviving any of this.
 */
// ── "Show me what this does" — an element's own capabilities, performed ──────────────────────────
//
// Every element already carries a complete description of how it behaves: `allowed_zones` says where
// it may sit, `placement_config` says what POSE it takes in each of those zones (stand / hug / perch
// / verge), `scale` says how small and how large it goes, and `allowed_actions` says which verbs it
// answers to. None of that has ever been shown to the person choosing it.
//
// So the help is not written, it is DERIVED. This module turns an element row into a short timeline
// of poses, which the designer then performs with a ghost copy on the customer's own cake. Three
// things follow from deriving rather than authoring, and they are the reason for this approach:
//
//   · every element in the library has help the day this ships — nothing to write, 94 and counting
//   · a new element has help the moment admin saves it, with no second step anybody can forget
//   · the help cannot go stale, because it is generated from the very config that drives the
//     behaviour. If the two ever disagree, the element is broken, not the help.
//
// ⚠️ NOT from `cake_elements.description`. That column reads like a description and is not one — it
// is a keyword bag for search and embeddings ("butterfly, gold outline, royal icing, lavender,
// cookie decoration, piping, sugar craft, birthday, garden party, …"), present on all 94 rows. Put
// it in front of a customer and every element explains itself in comma salad.
//
// Pure and React-free on purpose: the timeline is the part worth testing, and it can be tested
// without a canvas, a GPU or a mounted designer.

import { ZONE_LABELS, PLACEMENT_MODES, ZONES } from './constants.js';
import { zoneMode, zoneInsert, scaleRangeOf } from './placement.js';

// Coarse-to-fine: the biggest, most obvious placement first, so the first thing the eye catches is
// the one most people want. Zones an element does not allow simply drop out.
const ZONE_ORDER = [ZONES.TOP_SURFACE, ZONES.RIM, ZONES.SIDE, ZONES.MIDDLE_TIER, ZONES.BOARD];

// What a pose looks like, said as a verb. The vocabulary is deliberately about the CAKE ("leans out
// over the edge"), never about the config ("verge mode") — the person reading has no idea what a
// verge is and does not need one.
const MODE_VERB = Object.freeze({
  [PLACEMENT_MODES.STAND]: 'stands on',
  [PLACEMENT_MODES.HUG]:   'lies flat on',
  [PLACEMENT_MODES.PERCH]: 'sits over the edge of',
  [PLACEMENT_MODES.VERGE]: 'leans out over',
});

// ZONE_LABELS is the vocabulary the placement chooser and the upload studio already use, so a
// customer reads the same word for the same place everywhere. Lower-cased here because it lands
// mid-sentence ("stands on the top surface"), and `rim` is absent from that map — it is a placement
// EDGE rather than one of the authored upload zones.
const zoneWords = (zone) => (zone === ZONES.RIM ? 'the rim' : `the ${(ZONE_LABELS[zone] ?? zone).toLowerCase()}`);

/**
 * The poses this element can strike, in the order they should be shown.
 *
 * One step per allowed zone, carrying everything the ghost needs to be built through the designer's
 * real placement path — never a position this module invented, or the demo would be showing a
 * placement the element cannot actually take.
 */
export function demoPoses(element) {
  const zones = element?.allowed_zones ?? [];
  return ZONE_ORDER.filter(z => zones.includes(z)).map(zone => {
    const mode = zoneMode(element.placement_config, zone, PLACEMENT_MODES.STAND);
    const buried = !!zoneInsert(element.placement_config, zone);
    return {
      zone,
      mode,
      // An insert element is pushed INTO the surface — worth saying, because it is the one pose whose
      // point is invisible from the outside once it is placed.
      caption: buried
        ? `pushes into ${zoneWords(zone)}`
        : `${MODE_VERB[mode] ?? 'sits on'} ${zoneWords(zone)}`,
    };
  });
}

/**
 * The full timeline: every pose, then the size range if this element can be resized.
 *
 * The size step is last and deliberate. "How big can it get" is the question people ask AFTER they
 * have decided where it goes, and showing it earlier reads as the element misbehaving.
 */
// Pacing. A pose has to be held long enough to be LOOKED at — the eye finds the element, then reads
// the caption, and 1.1s was over before the second half of that. The size step gets longer still
// because it is the only step where the thing to watch is the change rather than the state.
export const DEMO_POSE_MS = 1900;
export const DEMO_SIZE_MS = 2600;

export function demoTimeline(element, { poseMs = DEMO_POSE_MS, sizeMs = DEMO_SIZE_MS } = {}) {
  if (!element) return [];
  const steps = demoPoses(element).map(p => ({ kind: 'pose', ...p, ms: poseMs }));
  if (!steps.length) return [];

  // Deliberately called WITHOUT fallbacks, so `min`/`max` come back undefined unless the element
  // authors its own bounds — and the comparison below is then false. Passing STICKER_SCALE_RANGE
  // here would demo the global 0.25→8 on an element nobody has sized, promising a range it was
  // never tuned for. No authored bounds → no size step; the poses still play.
  const range = scaleRangeOf(element);
  const canResize = element.allowed_actions?.resize !== false && range.max > range.min;
  if (canResize) {
    // Sized on the LAST pose shown rather than the first, so the element does not jump back across
    // the cake for the finale.
    const last = steps[steps.length - 1];
    steps.push({
      kind: 'size', zone: last.zone, mode: last.mode, ms: sizeMs,
      from: range.min, to: range.max,
      caption: 'and any size in between',
    });
  }
  return steps;
}

/**
 * The verbs this element answers to, for the chips beside the demo.
 *
 * `allowed_actions` is per-element and really does differ — the Lavender butterfly tilts and
 * recolours but has `gradient: false`. Anything absent is simply not offered, which is why this
 * filters on `=== true` rather than on truthiness: an element that has never been given the key
 * should not silently advertise the capability.
 */
const ACTION_WORDS = Object.freeze({
  move:      'Move it',
  resize:    'Resize it',
  tilt:      'Tilt it',
  color:     'Recolour it',
  gradient:  'Blend two colours',
  duplicate: 'Duplicate it',
});
export function demoActions(element) {
  const a = element?.allowed_actions ?? {};
  // `delete` is deliberately not here. It is true on every element, it is not a capability anybody
  // needs taught, and it would be the loudest word in the row.
  return Object.keys(ACTION_WORDS).filter(k => a[k] === true).map(k => ({ key: k, label: ACTION_WORDS[k] }));
}

/** Does this element have anything worth demonstrating? */
export const canDemo = (element) => demoTimeline(element).length > 0;
