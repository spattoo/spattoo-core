// ── What a template must say about itself before it can be saved ────────────────────────────────
//
// One named list, in one place, used by every surface that creates a template — the baker's save
// modal in the designer and the create form in admin. The alternative is `=== 'gender'` scattered
// through two repos, which is the coupling that was removed from `TMPL_CATS`, `CAT_LABEL` and
// admin's `CATEGORIES` and should not come back through a validation rule.
//
// ── WHY ANYTHING IS REQUIRED AT ALL ─────────────────────────────────────────────────────────────
// Unset does not mean "suits nobody" — it means UNFILTERED. A template with no age range answers to
// every age query; one with no gender answers to every gender. That is noise that grows with the
// catalogue and is invisible while it does, because nothing distinguishes "suits everyone" from
// "nobody filled this in". Requiring the field makes those two different answers.
//
// ⚠️ THIS IS AN ATTRIBUTE OF THE DESIGN, NOT OF A PERSON. A template tagged `girls` says "this
// design suits a girl", exactly as min_age/max_age says "this design suits a four-year-old". No
// data principal exists to have rights over it. The line this must not cross is asking the CUSTOMER
// the recipient's gender — personal data about a third party, usually a child, and squarely what
// DPDP s.9 governs. `RECIPIENTS` in the storefront stays ungendered on purpose. Tag the template;
// never the customer's answer.
//
// ⚠️ AND IT IS ENFORCED CLIENT-SIDE, DELIBERATELY. Core ships as a vendored tarball separately from
// the API, so a server rule rejecting a template without these would start failing saves from any
// browser running an older released bundle — the reason the tiered-weight rule lives in the client
// too, stated three lines from its own check.

/* Categories a template must be filed under. Deliberately short: every entry is a thing an author
   has to answer on every save, and a required field whose honest answer is the same most of the
   time teaches people to click past it. */
export const REQUIRED_TAG_CATEGORIES = ['gender'];

/* The wording, once. Both forms show the same sentence, because two copies drift into two different
   promises about the same rule. */
const ASK = {
  gender: 'who this cake suits — Girls, Boys or Anyone',
};

/**
 * Which required categories have tags to choose from but nothing chosen.
 *
 * ⚠️ A CATEGORY WITH NO TAGS IS NOT REQUIRED, and that guard is load-bearing rather than defensive.
 * A host whose vocabulary has no `gender` rows — a fresh environment, a failed fetch, an older API —
 * would otherwise be unable to save a template at all, with a message naming chips that are not on
 * screen. The same shape as the `length > 0 &&` guard the chip sections already carry.
 *
 * `chosenIds` may be a Set or any iterable of tag ids.
 */
export function missingRequiredCategories(allTags, chosenIds) {
  const chosen = chosenIds instanceof Set ? chosenIds : new Set(chosenIds ?? []);
  const missing = [];
  for (const category of REQUIRED_TAG_CATEGORIES) {
    const inCategory = (allTags ?? []).filter(t => t?.category === category);
    if (!inCategory.length) continue;
    if (!inCategory.some(t => chosen.has(t.id))) missing.push(category);
  }
  return missing;
}

/** The sentence to show for what `missingRequiredCategories` returned, or null when nothing is. */
export function requiredTagMessage(missing) {
  if (!missing?.length) return null;
  const parts = missing.map(c => ASK[c] ?? c.replace(/_/g, ' '));
  return `Choose ${parts.join(', and ')}.`;
}

/**
 * Is this a usable age range? Returns a message to show, or null when it is fine.
 *
 * ⚠️ BLANK IS NOT ALLOWED AND THERE IS NO DEFAULT. Sandeep: "if it matches 1-100, then the author
 * say that." A pre-filled 1–100 would mean "everyone" without anybody deciding it, which turns a
 * field that carries signal into one that carries a default — the same as having no field.
 */
export function ageRangeProblem(minAge, maxAge) {
  if (minAge === '' || minAge == null || maxAge === '' || maxAge == null) {
    return 'Say which ages this design suits. If it suits everybody, say that — 1 to 100.';
  }
  const lo = parseInt(minAge, 10);
  const hi = parseInt(maxAge, 10);
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return 'Ages have to be whole numbers.';
  if (lo > hi) return 'The youngest age has to be below the oldest.';
  return null;
}
