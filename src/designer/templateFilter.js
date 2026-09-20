// ── Deciding which templates a baker is looking at ───────────────────────────────────────────────
//
// Pure, and in its own file so it can be TESTED. It lived inside CakeDesigner.jsx, which imports
// three.js and the whole designer — so the one part of the templates panel worth asserting on was
// the one part no test could reach, and the semantics below (OR inside a category, AND across
// them; what the top of the age track means) were only ever checked by reading them.
//
// Nothing here touches React or the DOM. The panel supplies the state; this answers the question.

/* Where the "Suits age" slider stops, and therefore where its readout turns into "18+".
   ⚠️ READ OFF THE CATALOGUE, not chosen. Counted on dev: the number of matching templates is flat at
   11 from age 16 through 60, so past 18 a longer track moves a thumb and changes nothing. If the
   catalogue ever grows designs that discriminate above this, raise it — the constant is here so that
   is one edit and the label, the track and the predicate cannot disagree about it. */
export const AGE_FILTER_MAX = 18;

/* ── What a search box on a catalogue is actually for ────────────────────────────────────────────
 *
 * ⚠️ IT SEARCHED THE NAME AND NOTHING ELSE, so typing "Birthday" returned nothing while 65 templates
 * carried the `birthday` tag. Sandeep, 2026-09-20: "i searched with the work Birthday - nothing
 * returned. i think search is working only on the template name."
 *
 * Nobody types a template's name — a baker does not know it. They type the OCCASION, the COLOUR, the
 * STYLE: the same words the chips below are made of. So the haystack is the name plus every tag,
 * which also means a word that is BOTH a name fragment and a tag finds both.
 *
 * Matched against the tag's display name AND its slug, because they diverge exactly where somebody
 * is most likely to type: "Valentine's" is `valentines`, "Multi-color" is `multi-color`, and a
 * hyphen-or-apostrophe mismatch is not a miss anybody could explain.
 */
export function matchesTemplateSearch(t, q, nameBySlug) {
  if (!q) return true;
  if (t.name?.toLowerCase().includes(q)) return true;
  return (t.tag_slugs ?? []).some((slug) => {
    if (String(slug).toLowerCase().includes(q)) return true;
    /* ⚠️ THE DISPLAY NAME TOO, and it has to come from the client's tag list — the template payload
       carries `tag_slugs` and no names (lib/templateList.js). Slug and name diverge exactly where
       somebody is most likely to type: "Valentine's" is `valentines`, "Baby Shower" is `baby-shower`.
       A miss on an apostrophe or a hyphen is not one anybody could explain. */
    const name = nameBySlug?.get?.(slug);
    return !!name && name.toLowerCase().includes(q);
  });
}

/* ── OR inside a category, AND across them ───────────────────────────────────────────────────────
 *
 * `active[cat]` is a LIST now, so Birthday **or** Anniversary can be asked for at once while style
 * and colour still narrow on top. One slug per category could only ever express one idea.
 *
 * The two directions are not a choice: picking two occasions means "either of these", because no
 * cake is a birthday AND an anniversary; picking an occasion and a colour means "both", because a
 * cake is readily both. A filter that ANDed within a category would return nothing every time.
 *
 * Tolerates the old single-slug shape so a stored or half-migrated value cannot throw.
 */
export function matchesFilters(item, filters) {
  return Object.values(filters).every((picked) => {
    const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
    if (!list.length) return true;
    return list.some(slug => item.tag_slugs?.includes(slug));
  });
}

/* ── ONE predicate, asked twice ──────────────────────────────────────────────────────────────────
 * The grid asks it of the APPLIED filters and the Apply button asks it of the DRAFT, so a baker can
 * see what a selection will give before committing to it. Two copies of this would be two answers
 * to "how many will I get", and the wrong one would be on the button.
 */
export function templateMatches(t, { q, tags, weight, age }, nameBySlug) {
  if (!matchesTemplateSearch(t, q, nameBySlug)) return false;
  if (!matchesFilters(t, tags)) return false;
  if (weight) {
    const w = parseFloat(weight);
    if (!isNaN(w) && t.attrs?.min_weight_kg != null && t.attrs.min_weight_kg > w) return false;
  }
  if (age !== '' && age != null) {
    const n = parseInt(age, 10);
    if (!isNaN(n)) {
      /* ⚠️ THE TOP OF THE TRACK MEANS "18 OR OLDER", NOT "EXACTLY 18", because that is what the
         readout says. Testing 18 exactly drops every template whose `min_age` is 20 — Couple (20–99)
         is one — so the label would have promised adults and quietly excluded some. At the ceiling
         the only question is whether a design reaches adulthood at all. */
      if (n >= AGE_FILTER_MAX) {
        if (t.attrs?.max_age != null && t.attrs.max_age < AGE_FILTER_MAX) return false;
      } else {
        if (t.attrs?.min_age != null && t.attrs.min_age > n) return false;
        if (t.attrs?.max_age != null && t.attrs.max_age < n) return false;
      }
    }
  }
  return true;
}
