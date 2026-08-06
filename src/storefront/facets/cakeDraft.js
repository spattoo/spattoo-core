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

// Bump whenever emptyDraft's SHAPE changes — a renamed or added field, not a changed value. Old
// drafts are then discarded rather than migrated (see loadDraft).
//
// 3 — `ageBand` became `celebration`, a party type rather than a person's age (2026-08-05).
// 2 — `forWhom` became `recipient`, and `ageBand`/`cakeNumber` arrived (2026-08-04). Not bumping it
//     shipped a crash: a draft saved the day before passed the version check, the shallow merge
//     replaced `details` wholesale, and `d.recipient.trim()` threw on submit — after the customer
//     had filled everything in.
export const STORAGE_VERSION = 3;
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
    design: { kind: null, templateId: null, templateName: null, thumbnailUrl: null, shape: null,
              // Reference photos the customer picked. Only { id, name } — the BYTES live in
              // IndexedDB (see photoStore.js) because localStorage is strings and a few megabytes
              // of image would blow the shared quota and take the rest of the draft with it.
              // `photoKeys` stays empty until submit, when the blobs are uploaded on the verified
              // session and the R2 keys come back.
              photos: [], photoKeys: [], snapshot: null,
              // A CONSTRAINT the design carries, not an answer. A wedding template cannot be made
              // at half a kilo, so the size facet stops offering sizes below this — it does not
              // fill one in. Learning a floor is not the same as the customer having chosen.
              minWeightKg: null },

    // TASTE. Per TIER, matching OrderModal exactly — a tiered cake can be a different flavour on
    // each layer, and flattening that to one field would quietly lose an order's worth of detail.
    // `flavourId` is null for a name the customer typed that is not in the baker's list; `source`
    // distinguishes a global flavour from one of the baker's own.
    flavours: Array.from({ length: tierCount }, (_, i) => ({ tier: i, name: '', flavourId: null, source: null })),

    // SIZE. Servings is what the customer knows; weight is what the baker works in. Both are kept
    // because the conversion is a convention rather than a fact, and throwing away what they
    // actually said would make it unrecoverable.
    // tierCount is the cake's STRUCTURE, and it belongs to size rather than design because it is
    // what makes a weight possible or impossible — a two-tier cake has a minimum whatever the guest
    // count. Set by the size facet's second step, or by a template that already answered it.
    size: { servings: null, weightKg: null, tierCount: null },

    // DATE and everything with no other home. Dietary is ORDER-level, not per tier — an eggless
    // requirement is about the person eating, not the layer.
    details: { deliveryDate: '', deliveryTime: '', deliveryMode: 'pickup', deliveryAddress: '',
               // `recipient` replaces the old `forWhom`, which mixed two axes: child/adult is WHO
               // the cake is for, crowd is HOW MANY — and size is already the size facet. A
               // conflated axis is harder to reason about than either question alone.
               occasion: '', recipient: '', celebration: '', cakeNumber: '',
               dietaryKeys: [], message: '', specialInstructions: '' },

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

/**
 * One flavour, on every tier.
 *
 * ── WHY "I KNOW MY FLAVOUR" NO LONGER ASKS PER TIER ───────────────────────────────────────────
 * It did, with a Bottom / Top selector above the list. Two bare words, no explanation, and no way
 * to tell whether tapping "Bottom" had done anything — met by a customer who had not been thinking
 * about layers at all. The screen asked a question most people have not reached yet in order to
 * answer the simpler one they had.
 *
 * It only appeared on a cake already known to have tiers, so it was never wrong — the tier count
 * comes from the size facet's shape step and PERSISTS in the saved draft, which is how it turns up
 * on a later visit that never mentioned layers.
 *
 * The DRAFT still carries a flavour per tier, because the order payload has since long before this
 * screen existed and a baker's build sheet genuinely is per tier. Only the QUESTION is gone here:
 * every tier gets the same answer. When per-tier choosing returns it is a UI on top of a shape that
 * never changed, rather than a migration.
 *
 * ⚠️ SCOPED TO THAT ONE SCREEN, deliberately. The suggester still writes tier 0 only; that is left
 * alone until there is a reason to change it.
 */
export function everyTier(draft, f) {
  return draft.flavours.map((_, i) => ({
    tier: i,
    name: f.name,
    flavourId: f.id,
    source: f.source ?? 'global',
    // Carried for the STAGE, which draws the slice. toOrderPayload picks the four fields an order
    // has, so these never reach the baker.
    spongeColor: f.spongeColor ?? null,
    fillingColor: f.fillingColor ?? null,
  }));
}

/** Has this facet been given anything? Drives what is still worth asking for. */
export function isFilled(draft, facet) {
  switch (facet) {
    // A photo IS an answer to the design facet, even with no `kind` — somebody who attached three
    // pictures and nothing else has said something real about the cake.
    case 'design':  return !!draft.design.kind || (draft.design.photos?.length ?? 0) > 0;
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
 * ONE thing about the cake. Deliberately not completeness — requiring every facet
 * rebuilds the corridor this design exists to remove, and a baker would far rather have "chocolate,
 * 2kg, the 14th" than nothing at all. Filling more gets a faster, better quote; it is never the
 * price of being heard.
 *
 * ── WHY NOT A NAME OR A PHONE ───────────────────────────────────────────────────────────────────
 * Neither is checked here, and that is not an omission. Both are asked for on the VERIFICATION
 * screen between this button and the send — together, because "who are you and how do we reach you"
 * is one question. Gating this button on them made it dead for a reason two screens away: somebody
 * who had picked a flavour saw a disabled Send and nothing on screen that could fix it.
 *
 * POST /api/orders still requires customer.firstName. It arrives from that screen, and the enquiry
 * cannot be sent without passing through it.
 */
export function canSubmit(draft) {
  return FACETS.some(f => isFilled(draft, f));
}

/**
 * A typed name, as the API's firstName/lastName.
 *
 * Everything after the first word is the surname, and a single word is a first name with no
 * surname — which is correct for the many people who have one. Never rejected for "not looking
 * like a name": whatever somebody types is what they are called.
 */
export function splitName(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || undefined };
}

// ── The order payload ───────────────────────────────────────────────────────────────────────────

/**
 * The draft, as POST /api/orders takes it. Deliberately close to what OrderModal submits, so drift
 * between the two editors is visible here rather than discovered by a baker receiving half an order.
 *
 * The CUSTOMER is sent, and that is the one place this differs from OrderModal's customer mode.
 * There the session establishes who they are server-side; here the visitor is anonymous and has no
 * session at all, which is precisely why POST /api/orders is public and takes `customer`. An
 * earlier version of this comment said identity is never sent — true of the other editor, wrong
 * about this one.
 */
/**
 * `referenceKeys` is passed IN rather than read from the draft, because the keys do not exist until
 * the moment of sending: the photos are uploaded on the verified session immediately before this is
 * called. Falls back to the draft's own list so a caller that has nothing to upload — every path
 * except the photo door — is unchanged.
 */
export function toOrderPayload(draft, bakerSlug, { referenceKeys } = {}) {
  const d = draft.details;
  const keys = referenceKeys ?? draft.design.photoKeys;
  return {
    bakerSlug: bakerSlug ?? draft.bakerSlug,
    customer: {
      ...splitName(draft.contact.name),
      phone: draft.contact.phone.trim() || undefined,
      email: draft.contact.email.trim() || undefined,
    },
    // A photo enquiry has no design, so its reference keys stand in for one — the manual-order
    // shape, which the API and the Orders list already understand.
    ...(keys?.length ? { referenceKeys: keys } : {}),
    ...(draft.design.snapshot ? { designSnapshot: draft.design.snapshot } : {}),

    weightKg: draft.size.weightKg ?? undefined,
    // The cake's form (migration 045). tierCount is asked or comes from a template; shape is only
    // ever known from one, so it is absent on a flavour-only enquiry rather than guessed.
    tierCount: draft.size.tierCount ?? undefined,
    shape: draft.design.shape || undefined,

    // ── The signals (migration 043) ──────────────────────────────────────────────────────────────
    // Sent as FIELDS as well as appearing in specialInstructions. The prose is what the baker reads;
    // these are what a question like "what do first birthdays order here?" can be asked of. Prose
    // alone could only be answered by parsing English the baker is free to edit.
    occasion:   d.occasion   || undefined,
    recipient:  d.recipient  || undefined,
    celebration: d.celebration || undefined,
    // A whole number or nothing — never NaN, which would fail the API's validator with a message
    // about a field the customer never saw.
    cakeNumber: Number.isInteger(parseInt(d.cakeNumber, 10)) ? parseInt(d.cakeNumber, 10) : undefined,

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
export const RECIPIENT_LABEL = {
  child: 'a child', adult: 'a grown-up', couple: 'a couple',
  family: 'the family', friends: 'friends', colleagues: 'colleagues',
};
export const AGE_BAND_LABEL = {
  first_birthday: 'a first birthday', toddler: 'a toddler', child: 'a child',
  // 'an elder', not 'someone older' — this is a cake for somebody's parent or grandparent, and
  // the word should carry that. The stored value stays `senior`; only what a person reads changes.
  teen: 'a teenager', adult: 'a grown-up', senior: 'an elder',
};
/**
 * Every occasion, in the order a customer should meet them — commonest first, `other` last.
 *
 * ONE list, because it was four: the date facet's chips, the suggester's question, the baker's
 * OrderModal and this label map had each grown their own. Three of them knew only four values, so a
 * customer with a baby shower had to answer "Just because" — which filed the order under `other`
 * and made three suggester rules unreachable from the storefront, since nothing a customer could do
 * would ever set `festival` or `corporate`. Matches migration 043's CHECK constraint exactly.
 */
export const OCCASIONS = [
  ['birthday',    'Birthday'],
  ['anniversary', 'Anniversary'],
  ['wedding',     'Wedding'],
  ['engagement',  'Engagement'],
  ['baby_shower', 'Baby shower'],
  ['festival',    'Festival'],
  ['farewell',    'Farewell'],
  ['corporate',   'Office do'],
  ['other',       'Just because'],
];

export const OCCASION_LABEL = {
  birthday: 'Birthday', anniversary: 'Anniversary', wedding: 'Wedding',
  engagement: 'Engagement', baby_shower: 'Baby shower', festival: 'Festival',
  farewell: 'Farewell', corporate: 'Office do', other: 'No special occasion',
};

// Occasion, who it is for and the message have no column on an order, and inventing three would be
// a schema change to carry three sentences. They are worth keeping because they are exactly what
// makes a quote right first time — so they ride in the instructions the baker already reads.
function buildInstructions(draft) {
  const d = draft.details;
  const parts = [];
  if (d.occasion.trim())            parts.push(`Occasion: ${OCCASION_LABEL[d.occasion] ?? d.occasion.trim()}`);
  if (d.recipient.trim())           parts.push(`For: ${RECIPIENT_LABEL[d.recipient] ?? d.recipient.trim()}`);
  // Prose AND column, not either/or — the baker reads one place, we aggregate the other.
  if (d.cakeNumber !== '')          parts.push(`Number on the cake: ${d.cakeNumber}`);
  if (d.message.trim())             parts.push(`Message on the cake: ${d.message.trim()}`);
  // "Up to", not "about": the stored figure is the TOP of the band the customer picked, so it is
  // the number that guarantees enough cake rather than a midpoint nobody chose.
  if (draft.size.servings != null)  parts.push(`Feeds up to ${draft.size.servings}`);
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

    // Merged PER TOP-LEVEL KEY, not shallowly. `{ ...fresh, ...saved }` replaces `details` with the
    // saved object entirely, so a field added since — or renamed — is simply absent, and the first
    // `.trim()` on it throws. The version bump above is the real guard; this is what makes
    // forgetting to bump it a missing answer rather than a crash on the submit button.
    const restored = { ...fresh, ...saved, bakerSlug };
    for (const [k, v] of Object.entries(fresh)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        restored[k] = { ...v, ...(saved[k] ?? {}) };
      }
    }
    // A date that has since passed is worse than no date — it is a wrong answer the customer has
    // to notice and correct, and they will not, because they already answered it. Everything else
    // in the draft survives.
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
