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

// True when any requirement is an allergen — the case that earns extra prominence on
// the bench sheet. A diet requirement being missed is a refused cake; an allergen being
// missed is a hospital visit, and the sheet should not weigh them the same.
export function hasAllergen(reqs) {
  return (reqs ?? []).some(r => r?.kind === 'allergen');
}

// One line for the printed sheet and any single-line context (a list row subtitle).
// Imperative, and it says REQUIRED so nobody reads it as a claim about the finished
// cake. Returns '' when there is nothing to say, so callers can render conditionally.
export function dietaryLine(reqs) {
  const labels = (reqs ?? []).map(r => r?.label).filter(Boolean);
  if (!labels.length) return '';
  return `${labels.join(' · ').toUpperCase()} — REQUIRED`;
}
