// ── The cake being put together ─────────────────────────────────────────────────────────────────
// One object, four facets, no flow.
//
// A cake has a LOOK, a TASTE, a SIZE and a DATE. A customer arrives caring about exactly one of
// them, so this is not a wizard with a first step — it is a single object every facet writes into,
// entered wherever they came in, filled in any order, and submittable incomplete.
//
// An earlier design had two paths (design-first, flavour-first) converging at weight. It broke the
// moment anyone asked "they picked a photo, can they still get a flavour suggestion?" — every
// crossing between paths is branch state to keep in sync. There are no branches here. "Suggest a
// flavour next" is just: the taste facet is still empty.
//
// ── NEVER ASK TWICE ─────────────────────────────────────────────────────────────────────────────
// Any facet may fill a field that nominally belongs to another. The flavour suggester asks the
// occasion because IT needs it to recommend — and the answer belongs to the CAKE, not to the
// suggester. So facets mutate this object rather than returning values a shell stitches together;
// otherwise "the suggester learned the occasion" has nowhere to go, and the details facet asks for
// it a second time. The form shrinks as you go, which is the clearest signal a customer gets that
// the thing is paying attention.
//
// ── THIS IS ALSO THE PAYLOAD ────────────────────────────────────────────────────────────────────
// `toOrderPayload` below produces exactly the shape OrderModal already submits. It is deliberately
// close to a pass-through so that any drift between the two editors is VISIBLE here rather than
// discovered by a baker receiving half an order. lib/flavourList.js exists on the API side for the
// same reason: two copies of "what does this baker offer" had already diverged before anyone
// looked, and that was one function, not an order.
//
// ── WHY THE DRAFT LIVES IN THE BROWSER ──────────────────────────────────────────────────────────
// No server-side draft. A draft needs an owner, an owner needs a phone number, and cake-browsing is
// suddenly behind an OTP — which is precisely the friction that empties the funnel. A row per
// curious visitor is also junk somebody has to clean up later. localStorage covers the case that
// actually matters: accidental refresh, backgrounded phone, tab restore. Losing a draft because a
// tab closed three days ago does not matter; they were not coming back.

const STORAGE_VERSION = 1;
// Per BAKER. A customer comparing two bakeries must not carry chocolate from one into the other's
// storefront — the draft is about a cake for this baker, not a shopping basket that follows them.
const storageKey = (bakerSlug) => `spattoo.cakeDraft.${bakerSlug}`;
// Long enough to survive a phone being put down and picked up over a weekend; short enough that a
// draft never outlives the occasion it was for.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The four facets, in the order they are offered. `date` owns the details that have no other home. */
export const FACETS = ['design', 'flavour', 'size', 'date'];

export function emptyDraft(bakerSlug, tierCount = 1) {
  return {
    v: STORAGE_VERSION,
    bakerSlug,
    savedAt: null,

    // LOOK. `kind` says which door produced it, because the three are not interchangeable
    // downstream: a template and the designer both yield a real design, a photo yields a reference
    // the baker still has to read, and none yields an enquiry with no picture at all.
    design: { kind: null, templateId: null, templateName: null, thumbnailUrl: null,
              photoKeys: [], snapshot: null },

    // TASTE. Per TIER, matching OrderModal exactly — a tiered cake can be a different flavour on
    // each layer, and flattening that to one field would quietly lose an order's worth of detail.
    // `flavourId` is null for a name the customer typed that is not in the baker's list; `source`
    // distinguishes a global flavour from one of the baker's own.
    flavours: Array.from({ length: tierCount }, (_, i) => ({ tier: i, name: '', flavourId: null, source: null })),

    // SIZE. Servings is what the customer knows; weight is what the baker works in. Both are kept
    // because the conversion is a convention rather than a fact, and throwing away what they
    // actually said would make it unrecoverable.
    size: { servings: null, weightKg: null },

    // DATE and everything with no other home. Dietary is ORDER-level, not per tier — an eggless
    // requirement is about the person eating, not the layer.
    details: { deliveryDate: '', deliveryTime: '', deliveryMode: 'pickup', deliveryAddress: '',
               occasion: '', forWhom: '', dietaryKeys: [], message: '', specialInstructions: '' },

    contact: { name: '', phone: '', email: '' },
  };
}

/**
 * Resize the per-tier flavour list, keeping what has already been answered.
 *
 * Called when the DESIGN facet learns the tier count — a template says how many tiers it has, so
 * the flavour facet never has to ask. That is `never ask twice` working across facets: one of them
 * knows a fact, and it belongs to the cake rather than to whoever found it.
 *
 * Growing preserves existing tiers and adds blanks. Shrinking drops from the end, which is the only
 * honest choice — a three-tier cake becoming two has lost a layer, and the flavour that was on it
 * is not evidence about either survivor.
 */
export function withTierCount(draft, tierCount) {
  const n = Math.max(1, tierCount | 0);
  if (draft.flavours.length === n) return draft;
  const next = Array.from({ length: n }, (_, i) =>
    draft.flavours[i] ?? { tier: i, name: '', flavourId: null, source: null });
  return { ...draft, flavours: next };
}

/** Has this facet been given anything? Drives what is still worth asking for. */
export function isFilled(draft, facet) {
  switch (facet) {
    case 'design':  return !!draft.design.kind;
    case 'flavour': return draft.flavours.some(f => f.name.trim());
    case 'size':    return draft.size.servings != null || draft.size.weightKg != null;
    case 'date':    return !!draft.details.deliveryDate;
    default:        return false;
  }
}

export const emptyFacets = (draft) => FACETS.filter(f => !isFilled(draft, f));

/**
 * Enough to send?
 *
 * A way to reach them, plus ONE thing about the cake. Deliberately not completeness — requiring
 * every facet rebuilds the corridor this design exists to remove, and a baker would far rather have
 * "chocolate, 2kg, the 14th" than nothing at all. Filling more gets a faster, better quote; it is
 * never the price of being heard.
 */
export function canSubmit(draft) {
  const reachable = !!(draft.contact.phone.trim() || draft.contact.email.trim());
  return reachable && FACETS.some(f => isFilled(draft, f));
}

// ── The order payload ───────────────────────────────────────────────────────────────────────────

/**
 * The draft, as the shape OrderModal submits. Both editors must produce the same object or a baker
 * gets different orders depending on which screen the customer happened to use.
 *
 * Customer identity is NOT sent: on the storefront the session establishes who they are
 * server-side, and OrderModal only sends `customer` in baker mode for exactly that reason.
 */
export function toOrderPayload(draft) {
  const d = draft.details;
  return {
    // A photo enquiry has no design, so its reference keys stand in for one — the manual-order
    // shape, which the API and the Orders list already understand.
    ...(draft.design.photoKeys.length ? { referenceKeys: draft.design.photoKeys } : {}),
    ...(draft.design.snapshot ? { designSnapshot: draft.design.snapshot } : {}),

    weightKg: draft.size.weightKg ?? undefined,

    // PICKED field by field, not passed through. A facet holds whatever it finds useful — the
    // flavour list carries sponge and filling colours so it can draw a slice — and spreading that
    // straight into an order puts render data in front of a baker forever. This module owns the
    // payload shape, so it states it rather than trusting five doors to remember.
    flavours: draft.flavours
      .filter(f => f.name.trim())
      .map(({ tier, name, flavourId, source }) => ({ tier, name, flavourId, source })),

    // Everything the customer said that has no field of its own, gathered into the one place the
    // baker already reads. Occasion and who it is for are worth a quote being right first time.
    specialInstructions: buildInstructions(draft) || undefined,

    // OMITTED ENTIRELY when nothing was chosen. "None stated" is not the same as the customer
    // confirming the cake may contain anything, and an empty array reads as the latter. Same rule
    // OrderModal keeps.
    //
    // A conditional SPREAD, not `: undefined` — assigning undefined still creates the key, so
    // `'dietaryRequirementKeys' in payload` would be true and only JSON.stringify would save us.
    // This is the one field here with a safety story attached, so it is omitted for real rather
    // than by the good luck of how it happens to be serialised.
    ...(d.dietaryKeys.length ? { dietaryRequirementKeys: d.dietaryKeys } : {}),

    deliveryDate: d.deliveryDate || undefined,
    deliveryTime: d.deliveryTime || undefined,
    deliveryMode: d.deliveryMode,
    deliveryAddress: d.deliveryMode === 'home_delivery' ? d.deliveryAddress : undefined,
  };
}

// The suggester and the details facet both speak in KEYS — one small vocabulary, so a rule can
// match on it and a later facet can tell it has already been answered. The baker reads English, so
// the keys become words exactly once, here at the boundary. Anything unrecognised falls through as
// whatever was typed, because a customer may write their own.
export const FOR_WHOM_LABEL = {
  child:  'a child', adult: 'a grown-up', couple: 'a couple', crowd: 'a crowd',
};
export const OCCASION_LABEL = {
  birthday: 'Birthday', anniversary: 'Anniversary', wedding: 'Wedding', other: 'No special occasion',
};

// Occasion, who it is for and the message have no column on an order, and inventing three would be
// a schema change to carry three sentences. They are worth keeping because they are exactly what
// makes a quote right first time — so they ride in the instructions the baker already reads.
function buildInstructions(draft) {
  const d = draft.details;
  const parts = [];
  if (d.occasion.trim())            parts.push(`Occasion: ${OCCASION_LABEL[d.occasion] ?? d.occasion.trim()}`);
  if (d.forWhom.trim())             parts.push(`For: ${FOR_WHOM_LABEL[d.forWhom] ?? d.forWhom.trim()}`);
  if (d.message.trim())             parts.push(`Message on the cake: ${d.message.trim()}`);
  if (draft.size.servings != null)  parts.push(`Serves about ${draft.size.servings}`);
  if (d.specialInstructions.trim()) parts.push(d.specialInstructions.trim());
  return parts.join('\n');
}

// ── Persistence ─────────────────────────────────────────────────────────────────────────────────

export function saveDraft(draft) {
  try {
    localStorage.setItem(storageKey(draft.bakerSlug),
      JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Private browsing, a full quota, a browser with storage disabled. A draft that cannot be
    // saved is not a reason to stop someone ordering a cake — they simply lose it on refresh,
    // which is where they were before this existed.
  }
}

export function loadDraft(bakerSlug, tierCount = 1) {
  const fresh = emptyDraft(bakerSlug, tierCount);
  try {
    const raw = localStorage.getItem(storageKey(bakerSlug));
    if (!raw) return fresh;
    const saved = JSON.parse(raw);

    // A shape change must never crash someone's storefront. An old draft is discarded, not
    // migrated: nobody's half-filled cake is worth a migration path that has to be maintained
    // forever.
    if (saved?.v !== STORAGE_VERSION) return fresh;
    if (!saved.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS) return fresh;

    // A date that has since passed is worse than no date — it is a wrong answer the customer has
    // to notice and correct, and they will not, because they already answered it. Everything else
    // in the draft survives.
    const restored = { ...fresh, ...saved, bakerSlug };
    if (restored.details?.deliveryDate && restored.details.deliveryDate < today()) {
      restored.details = { ...restored.details, deliveryDate: '' };
    }
    return restored;
  } catch {
    return fresh;
  }
}

export function clearDraft(bakerSlug) {
  try { localStorage.removeItem(storageKey(bakerSlug)); } catch { /* see saveDraft */ }
}

/** Local date as yyyy-mm-dd — NOT toISOString, which is UTC and rolls the date over in IST. */
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
