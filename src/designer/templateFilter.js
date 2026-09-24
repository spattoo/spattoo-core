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
/* Everything a template can be found BY, lowercased: its name, every tag slug, and every tag's
 * display name.
 *
 * ⚠️ THE DISPLAY NAME TOO, and it has to come from the client's tag list — the template payload
 * carries `tag_slugs` and no names (lib/templateList.js). Slug and name diverge exactly where
 * somebody is most likely to type: "Valentine's" is `valentines`, "Baby Shower" is `baby-shower`.
 * A miss on an apostrophe or a hyphen is not one anybody could explain.
 *
 * Built once per template rather than walked once per query word, which is also why tokenising
 * below costs nothing: the tag loop used to run for every search, and now runs for every template.
 */
function searchableFields(t, nameBySlug) {
  const fields = [t.name ?? ''];
  for (const slug of t.tag_slugs ?? []) {
    fields.push(String(slug));
    const name = nameBySlug?.get?.(slug);
    if (name) fields.push(name);
  }
  /* ⚠️ WHAT THE CAKE CONTAINS AND WHAT IT SAYS — the gap this search was reported for. Sandeep:
     "if a cake has ranbow in it, and the template is names 'kids birthday cake', when user searches
     the template with rainbow, it does not show up. thats a big gap in fact."
     `search_slugs` is derived on the server from the design (spattoo-api lib/templateElements.js):
     the names of the decorations on the cake, their tags, and the words piped on it. It arrives on
     the list row — the DESIGN does not, and cannot, since Layer 1 took it out of the payload, which
     is why this is derived server-side rather than read here.
     ⚠️ Searched, never drawn. The filter's chips come from `tag_slugs`, which a person curated;
     these would put every element's name into the funnel as a chip. */
  for (const term of t.search_slugs ?? []) fields.push(String(term));
  return fields.map(f => f.toLowerCase());
}

/* ── ONE WORD PER FIELD WAS THE REAL CEILING ─────────────────────────────────────────────────────
 *
 * ⚠️ IT MATCHED THE WHOLE QUERY AGAINST ONE FIELD AT A TIME, so a query spanning two of them found
 * nothing. `field.includes(q)` with `q` the entire string means "birthday pink" asks for a single
 * field containing that exact phrase — and no template has one, even when it carries the `birthday`
 * tag and the `pink` tag. Each half matched something; nothing matched all of it.
 *
 * That ceiling is invisible while every template is filed under one word and becomes the whole
 * problem the moment there are several dimensions to file under. It is what would have made
 * emotion and relationship tags useless: a cake tagged `i-love-you` + `mother` returns nothing for
 * "love you mom", which is exactly how somebody would search for it.
 *
 * So: EVERY word must match SOMETHING, and any word may match any field. AND across the words,
 * because typing more should narrow; OR across the fields, because a word does not know which
 * dimension it belongs to. The same shape `matchesFilters` already uses for chips.
 *
 * ⚠️ STILL A SUBSTRING PER WORD, NOT A WHOLE-WORD MATCH. "choc" has to keep finding "chocolate" and
 * "din" "Dino" — the old behaviour was forgiving and people type prefixes. Tokenising narrows what
 * a query MEANS; it must not narrow what a word MATCHES.
 *
 * Nothing is lost against the old behaviour: a two-word phrase that used to match one field still
 * does, because each of its words is a substring of that same field. "baby shower" finds
 * `baby-shower` — now by the slug as well as the display name.
 */
export function matchesTemplateSearch(t, q, nameBySlug) {
  const words = String(q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const fields = searchableFields(t, nameBySlug);
  return words.every(word => fields.some(field => field.includes(word)));
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
