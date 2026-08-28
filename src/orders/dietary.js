// ── How a dietary requirement is PRESENTED ────────────────────────────────────
// Four surfaces show these — the order list, the order detail, the X-Ray screen and
// the printed X-Ray sheet — so the rule lives here once rather than as four drifting
// copies of a colour and a caption. The order carries `[{ key, label, kind }]`; this
// module decides only how that reads.
//
// ── Why there is no veg "green dot" here ──────────────────────────────────────
// India's statutory mark (a green filled circle in a green square, FSSAI packaging &
// labelling rules) certifies that a FINISHED PACKAGED PRODUCT is vegetarian — and
// since eggs count as non-vegetarian here, an eggless cake would indeed carry it.
// It is still the wrong mark for this screen, for a reason that runs through the whole
// feature: what we hold is a CUSTOMER'S REQUEST, not a verified property of a baked
// cake. Stamping a regulatory certification onto a request asserts something nobody
// has checked — the exact move the schema, the `source` column and the ToS role split
// all exist to avoid. The production sheet is therefore IMPERATIVE ("EGGLESS —
// REQUIRED"), never declarative. The green dot belongs to whoever certifies the
// finished cake, which is the baker, on packaging, and not to us.
//
// (For completeness: FSSAI notified a distinct vegan logo in its 2022 vegan-foods
// regulations, again a certification of a finished product. Jain has no official mark
// or colour anywhere — inventing one would be worse than printing the word.)
//
// ── Why colour is never the only signal ───────────────────────────────────────
// Production sheets get printed on whatever mono laser is in the kitchen, and red/green
// is the most common colour-vision deficiency — which is precisely the veg/non-veg
// pair. So every surface here is TEXT-first and survives greyscale; colour only speeds
// up scanning for people who can see it. An allergen must never be a coloured dot.

export const DIET_TONE = {
  // Diet: the ordinary product attribute. Green because that is the colour Indian
  // customers and bakers already read as "veg", even though we do not use the mark.
  diet:     { fg: '#1F6B3A', bg: '#E9F4ED', border: '#A8CDB6' },
  // Allergen: deliberately NOT red-vs-green. Amber reads as "pay attention" without
  // relying on the one hue pair colour-blind readers confuse, and the caption carries
  // the meaning regardless.
  allergen: { fg: '#8A4B00', bg: '#FDF2E3', border: '#E3B778' },
};

export function dietTone(kind) {
  return DIET_TONE[kind] ?? DIET_TONE.diet;
}

/* ── A CHOICE, NOT A RESTRICTION ───────────────────────────────────────────────
 *
 * `egg` is the one row in the vocabulary that does not restrict anything. Every other
 * requirement narrows what may go in the bowl; this one says the ordinary cake is
 * wanted. It lives in `dietary_requirements` anyway, and deliberately, for two reasons
 * that are worth more than the tidiness of a table where every row means the same:
 *
 *   1. `baker_dietary_exclusions` then expresses "we are a pure-veg bakery" — a row
 *      against `egg`. Without an egg row that fact is UNSAYABLE: the table could
 *      already carry "we don't do eggless" and had no way to carry its mirror, so a
 *      fully-eggless kitchen (very common here) was invisible to us and had to show
 *      customers a choice it would then refuse.
 *   2. It is what makes "with egg" DISTINGUISHABLE FROM UNASKED. The whole reason the
 *      "no requirements" chip exists (2026-08-27) is that silence meant two things at
 *      once. An egg/eggless answer stored as the absence of `eggless` would reintroduce
 *      exactly that, one question later.
 *
 * ⚠️ SO IT MUST NOT REACH THE IMPERATIVE SURFACES. "EGG — REQUIRED" on a bench sheet is
 * true of nearly every cake, and a band that fires on nearly every sheet stops being
 * read — taking the eggless and nut-free ones down with it. The rule is one line:
 * surfaces that EXIST TO FLAG A DEVIATION take `restrictions()`; the order detail, which
 * is the record of what the customer actually said, shows the lot.
 */
export const EGG_KEY     = 'egg';
export const EGGLESS_KEY = 'eggless';

// The requirements that genuinely constrain the bake. Everything except the egg choice.
export function restrictions(reqs) {
  return (reqs ?? []).filter(r => r?.key !== EGG_KEY);
}

/* Which side of the egg question this set answers, or null if it does not.
 * Both at once is incoherent and treated as unanswered rather than guessed — the API
 * refuses that combination outright (validateDietaryCoherence). */
export function eggChoiceOf(keys) {
  const ks = keys ?? [];
  const egg = ks.includes(EGG_KEY), eggless = ks.includes(EGGLESS_KEY);
  if (egg === eggless) return null;
  return egg ? EGG_KEY : EGGLESS_KEY;
}

/* ⚠️ Diets that CONTAIN the eggless rule, so it cannot be answered against them.
 *
 * Vegan excludes every animal product; Jainism excludes eggs outright. A form that let
 * "vegan" sit beside "with egg" would take an order that contradicts itself, and the
 * contradiction would only surface at the bench.
 *
 * Hardcoded keys in a module whose whole point is that the vocabulary is DATA — which is
 * a real tension, and the honest answer is that this is a fact about those diets rather
 * than about our table. Retiring a row leaves this harmlessly naming a key that no
 * longer resolves; ADDING a diet that implies eggless (halal does not, kosher does not)
 * needs a line here. The principled fix is an `implies` column, deferred until there is
 * a third case to justify the migration. */
export const IMPLIES_EGGLESS = ['vegan', 'jain'];

export function impliesEggless(keys) {
  return (keys ?? []).some(k => IMPLIES_EGGLESS.includes(k));
}

// True when any requirement is an allergen — the case that earns extra prominence on
// the bench sheet. A diet requirement being missed is a refused cake; an allergen being
// missed is a hospital visit, and the sheet should not weigh them the same.
export function hasAllergen(reqs) {
  return (reqs ?? []).some(r => r?.kind === 'allergen');
}

// One line for the printed sheet and any single-line context (a list row subtitle).
// Imperative, and it says REQUIRED so nobody reads it as a claim about the finished
// cake. Returns '' when there is nothing to say, so callers can render conditionally.
//
// Filters the egg choice out itself as well as at the call sites. Belt and braces on
// purpose: a caller that forgets loses the band's meaning on every sheet at once, and
// the failure is invisible in review because the band still looks correct.
export function dietaryLine(reqs) {
  const labels = restrictions(reqs).map(r => r?.label).filter(Boolean);
  if (!labels.length) return '';
  return `${labels.join(' · ').toUpperCase()} — REQUIRED`;
}

// ── What this bakery deals in at all ──────────────────────────────────────────
// Not every bakery does vegan. Each requirement arrives with `offered` (see
// GET /api/dietary-requirements?bakerSlug=), and what that means depends on `kind` —
// which is what `kind` is FOR, and the one place the difference is decided.
//
//   diet     (eggless / vegan / Jain) — a MENU. Not offered → not shown. Offering a
//            vegan cake nobody makes just collects orders that get refused.
//
//   allergen (nut / gluten / dairy)   — NEVER hidden, whatever the baker set. A
//            customer's nut allergy does not go away because this bakery doesn't cater
//            to it. Hide the chip and the allergy goes back into the free-text box —
//            the exact transmission loss this feature exists to fix — or goes unsaid,
//            because a form that doesn't ask implies it doesn't matter. So it stays,
//            it is still RECORDED on the order, and it carries a warning instead.
//
// The asymmetry is deliberate and must not be "tidied up" into one uniform rule.
export function visibleRequirements(options) {
  return (options ?? []).filter(o => o?.kind === 'allergen' || o?.offered !== false);
}

// The requirements this bakery has said it does not deal in, out of those the customer
// actually ticked. Only allergens can end up here — a diet option they don't offer was
// never on screen to tick.
export function unguaranteedRequirements(options, selectedKeys) {
  return (options ?? []).filter(o => o?.offered === false && (selectedKeys ?? []).includes(o.key));
}

// Same register as a flavour conflict, and for the same reason: it says what the BAKERY
// can't promise, never what the cake contains. "Can't guarantee" is the honest verb —
// stronger than "doesn't offer" (which sounds like a menu choice when it is a safety
// matter) and weaker than "contains", which we have no basis to say.
export function unguaranteedSentence(requirement, { bakerName } = {}) {
  const label = (requirement?.label || '').toLowerCase();
  if (!label) return '';
  return bakerName
    ? `${bakerName} can't guarantee ${label}.`
    : `This bakery can't guarantee ${label}.`;
}

// ── Flavour ↔ requirement conflicts ───────────────────────────────────────────
// "You asked for nut-free, but Tier 2 is Hazelnut Praline." Same module as the rest of
// the dietary presentation because it is the same feature on the same four surfaces —
// a second module would only mean a second import and a second place to drift.
//
// ── DERIVED, NEVER STORED ─────────────────────────────────────────────────────
// A conflict is a function of (the order's requirements × each tier's flavour × the
// declarations in force right now). Declarations change: a baker adds an eggless
// tiramisu on Tuesday. A flag written at order time would still be shouting on
// Saturday's bench sheet, and being wrong there is worse than being silent — a warning
// that cries wolf gets ignored, including the time it is right. So every surface
// recomputes from the same function instead.
//
// ── IT WARNS, IT NEVER BLOCKS ─────────────────────────────────────────────────
// Nothing built on this may disable a flavour or refuse an order. A disabled option
// asserts that the platform knows what is compatible, which is exactly what ToS §3.4
// says we do not do (B5.9 puts the decision with the baker; C2.3 tells the customer to
// confirm regardless). And the data is hand-authored, so it will drift — a baker who
// hasn't updated their declarations, or who would happily make an exception, must not
// silently lose the order.

// flavours     [{ tier, name, flavourId }]           — as stored on orders.flavours
// requirements [{ key, label, kind }]                — the order's dietary embed
// declarations { [flavourId]: [{ key, declared_by }] } — from GET /api/flavours
//
// Returns one entry per (tier, requirement) clash. A hand-typed flavour has no
// flavourId, so it can never match a declaration and never warns — an honest gap: we
// hold no opinion about a flavour nobody has told us about, and inventing one would be
// worse than saying nothing.
export function findFlavourConflicts({ flavours, requirements, declarations }) {
  // restrictions(): a flavour cannot "conflict with egg" — egg is the absence of a
  // constraint. Nothing can declare it (the declaration UIs don't offer it), so this
  // guards against data rather than against the UI, and keeps "Chocolate usually isn't
  // with egg" from ever being a sentence we can generate.
  const wanted = restrictions(requirements).filter(r => r?.key);
  if (!wanted.length) return [];

  const out = [];
  for (const f of flavours ?? []) {
    const declared = (declarations ?? {})[f?.flavourId];
    if (!declared?.length) continue;
    for (const req of wanted) {
      const hit = declared.find(d => d?.key === req.key);
      if (!hit) continue;
      out.push({
        tier: f.tier, flavourId: f.flavourId, flavourName: f.name,
        requirement: req,
        // 'baker' = their own statement, quotable. 'spattoo' = our global default,
        // which must stay hedged. See conflictSentence.
        declaredBy: hit.declared_by === 'baker' ? 'baker' : 'spattoo',
      });
    }
  }
  return out;
}

// ── the customer's voice ──────────────────────────────────────────────────────
// Two sources of truth, two registers, and using the wrong one is a real error rather
// than a style nit:
//
//   the baker said it   → quote them. "Sweet Crumb doesn't make Tiramisu eggless."
//                         Hedging their firm answer sends the customer to ask a
//                         question that has already been answered.
//   we said it          → hedge. "Hazelnut Praline usually isn't nut-free."
//                         Saying "Sweet Crumb doesn't…" would put a claim in a baker's
//                         mouth that they never made and may well dispute — clearing
//                         our default is exactly their right of reply.
//
// Neither form states what is IN the cake. We do not know that, and §3.4 says so.
export function conflictSentence(conflict, { bakerName } = {}) {
  const flavour = conflict?.flavourName || 'This flavour';
  const need    = (conflict?.requirement?.label || '').toLowerCase();
  if (!need) return '';
  if (conflict.declaredBy === 'baker') {
    return bakerName
      ? `${bakerName} doesn't make ${flavour} ${need}.`
      : `${flavour} isn't offered ${need}.`;
  }
  return `${flavour} usually isn't ${need}.`;
}

// The call to action, rendered ONCE under the list rather than repeated per line. It
// carries the two things that keep this honest: talk to the baker, and you are not
// being stopped. `audience` is 'customer' on a storefront order and 'baker' when the
// baker is entering the order themselves — where "check with Sweet Crumb" is nonsense,
// because they ARE Sweet Crumb.
export function conflictCallToAction({ audience = 'customer', bakerName } = {}) {
  if (audience === 'baker') return 'Check this before you confirm the order.';
  return bakerName
    ? `Please check with ${bakerName} before ordering — you can still place this order.`
    : 'Please check with the bakery before ordering — you can still place this order.';
}

// ── the bench's voice ─────────────────────────────────────────────────────────
// The reader here is the person about to bake, so it is imperative and leads with the
// requirement, which is the thing that changes what goes in the bowl. Tier is named
// only on a multi-tier cake — "Tier 1" on a single-tier cake is noise on a sheet whose
// whole job is to be skimmed.
export function conflictBenchLine(conflict, { tierCount = 1 } = {}) {
  const label   = (conflict?.requirement?.label || '').toUpperCase();
  const flavour = conflict?.flavourName || 'this flavour';
  const where   = tierCount > 1 && Number.isInteger(conflict?.tier)
    ? `Tier ${conflict.tier + 1} is ${flavour}`
    : `The flavour is ${flavour}`;
  return `${label} REQUIRED — ${where}. Confirm with the customer before baking.`;
}
