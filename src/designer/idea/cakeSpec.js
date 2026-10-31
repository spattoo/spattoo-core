/* ── The cake spec: what a composed idea IS, before it is a design ───────────────────────────────
 *
 * A spec is the seam between the half that THINKS of a cake and the half that BUILDS one. The
 * composer (backend, with the catalogue and a model) emits one; the planner in this folder turns
 * it into placements the designer can apply. Neither side knows the other's internals, which is
 * the only reason the model can be swapped, the prompt rewritten, or the composer replaced by a
 * human typing JSON — and the one that matters today, because that is exactly how this is being
 * built: hand-written specs first, no model anywhere near it.
 *
 * ⚠️ IDS, NEVER NAMES. `{ elementId }`, not `"peacock feather"`. The obvious shape for a composer is
 * to ask a model what belongs on a Krishna cake and match the answer against the library — and that
 * invents a reconciliation problem out of nothing. Measured on our own assets: a model says "flute"
 * and "matki"; the catalogue says "Ornate Peacock Feather Bansuri" and "Terracotta Pot Overflowing
 * with Butter". Handing the model the shelf and taking ids back makes every answer buildable BY
 * CONSTRUCTION, and deletes the matching layer entirely.
 *
 * ⚠️ DECLARATIVE, NEVER POSITIONAL. A spec says a piece goes on the BOARD. It does not say where on
 * the board, how big, or at what angle — it cannot, because it does not know how wide this cake is,
 * and nothing that answers from a prompt should be deciding geometry. `seatOnSlot` and
 * `scaleRangeOf` already own those answers and the drag honours them; a spec that carried
 * coordinates would be a second opinion that loses the argument the moment a baker moves anything.
 * So: `zone`, `count` and `prominence` — never x, z or scale.
 *
 * ⚠️ `wanted` IS AN OUTPUT, NOT A FAILURE. When a composition needs a cow and the catalogue has
 * none, that is the single most valuable thing the feature produces in its first year: a
 * commissioning queue ranked by what bakers actually asked for, instead of a guess about what to
 * model next. It is in the schema so it cannot be dropped as an afterthought.
 */

export const SPEC_VERSION = 1;

/** Where a piece can be asked for. Mirrors ZONES — a spec may not invent a surface. */
export const SPEC_ZONES = Object.freeze(['top_surface', 'side', 'rim', 'board']);

/* How much of the cake a piece should take. NOT a scale: the legal range is the element's own
   (`placement_config.scale`), so these resolve against it per element rather than meaning a number.
   Three steps and no more — a model asked for a float returns noise, and a baker cannot see the
   difference between 0.62 and 0.67 of a range anyway. */
export const PROMINENCE = Object.freeze(['hero', 'feature', 'accent']);

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Is this a spec we can build from? Returns `{ ok, problems }` — never throws.
 *
 * ⚠️ IT REPORTS EVERY PROBLEM, NOT THE FIRST. A composer that gets one complaint per round trip
 * takes as many round trips as it made mistakes, and each one costs a model call. The same reason
 * the element-size gate lists every offender.
 *
 * ⚠️ AND IT IS STRICT ABOUT ZONES AND LOOSE ABOUT EVERYTHING ELSE. An unknown zone cannot be
 * recovered from — there is no surface to seat against — so it is rejected. An unknown prominence,
 * a missing colour, an absent message: all have sane answers, and refusing a whole cake because one
 * field is odd turns a usable idea into nothing.
 */
export function validateSpec(spec) {
  const problems = [];
  const p = (m) => problems.push(m);

  if (!spec || typeof spec !== 'object') return { ok: false, problems: ['spec is not an object'] };
  if (spec.version !== SPEC_VERSION) p(`version must be ${SPEC_VERSION}, got ${JSON.stringify(spec.version)}`);

  const cake = spec.cake;
  if (!cake || typeof cake !== 'object') p('cake is required');
  else {
    if (!Array.isArray(cake.tiers) || cake.tiers.length < 1) p('cake.tiers must hold at least one tier');
    else cake.tiers.forEach((t, i) => {
      if (t && t.color !== undefined && !isStr(t.color)) p(`cake.tiers[${i}].color must be a colour string`);
    });
    if (cake.weightKg !== undefined && !(isNum(cake.weightKg) && cake.weightKg > 0)) {
      p('cake.weightKg must be a positive number when given');
    }
  }

  const els = spec.elements ?? [];
  if (!Array.isArray(els)) p('elements must be an array');
  else els.forEach((e, i) => {
    if (!e || typeof e !== 'object') { p(`elements[${i}] is not an object`); return; }
    if (!isStr(e.elementId)) p(`elements[${i}].elementId is required — a spec names ids, never words`);
    if (!SPEC_ZONES.includes(e.zone)) p(`elements[${i}].zone ${JSON.stringify(e.zone)} is not one of ${SPEC_ZONES.join(', ')}`);
    if (e.count !== undefined && !(Number.isInteger(e.count) && e.count > 0)) {
      p(`elements[${i}].count must be a positive whole number when given`);
    }
  });

  if (spec.message !== undefined && spec.message !== null) {
    if (!isStr(spec.message.text)) p('message.text is required when a message is given');
  }
  if (spec.age !== undefined && spec.age !== null && !Number.isInteger(spec.age.number)) {
    p('age.number must be a whole number when an age is given');
  }
  if (spec.wanted !== undefined && !Array.isArray(spec.wanted)) p('wanted must be an array of strings');

  return { ok: problems.length === 0, problems };
}

/** Fill the optional half, so the planner reads one shape rather than branching on absence. */
export function normaliseSpec(spec) {
  return {
    version:  SPEC_VERSION,
    brief:    { subject: '', ages: [], gender: null, ...(spec.brief ?? {}) },
    cake:     { shape: 'round', tiers: [{}], weightKg: null, ...(spec.cake ?? {}) },
    message:  spec.message ?? null,
    age:      spec.age ?? null,
    elements: (spec.elements ?? []).map(e => ({ count: 1, prominence: 'feature', ...e })),
    palette:  spec.palette ?? [],
    wanted:   spec.wanted ?? [],
    why:      spec.why ?? '',
  };
}
