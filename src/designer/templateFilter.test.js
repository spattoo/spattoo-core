import { describe, it, expect } from 'vitest';
import { matchesTemplateSearch, matchesFilters, templateMatches, AGE_FILTER_MAX } from './templateFilter.js';

/* ── The templates panel's predicate ─────────────────────────────────────────────────────────────
 *
 * Every number below was read off the real dev catalogue (28 templates) before it was written here,
 * so these are recorded behaviour rather than a description of the code.
 */

// A slice of the real thing: names and tags as `lib/templateList.js` shapes them.
const T = [
  { name: 'Dino',         tag_slugs: ['birthday', 'tropical', 'white', 'green'], attrs: { min_age: 2,  max_age: 12 } },
  { name: 'Vintage cake', tag_slugs: ['birthday', 'wedding', 'anniversary'],     attrs: { min_age: 1,  max_age: 80 } },
  { name: 'Butterfly',    tag_slugs: ['birthday', 'wedding', 'valentines'],      attrs: { min_age: 1,  max_age: 80 } },
  { name: 'Couple',       tag_slugs: ['anniversary', 'valentines'],              attrs: { min_age: 20, max_age: 99 } },
  { name: 'Football',     tag_slugs: ['birthday', 'graduation'],                 attrs: { min_age: 2,  max_age: 15 } },
];
const count = (f) => T.filter(t => templateMatches(t, { q: '', tags: {}, weight: '', age: '', ...f }, NAMES)).length;
const NAMES = new Map([['valentines', "Valentine's"], ['baby-shower', 'Baby Shower'], ['birthday', 'Birthday']]);

describe('search is not just the name', () => {
  /* It was `t.name.includes(q)` and nothing else, so "Birthday" returned 0 of 28 while 27 templates
     carried the tag. Nobody types a template's name — they type the occasion. */
  it('finds a template by a tag it carries', () => {
    expect(matchesTemplateSearch(T[0], 'birthday', NAMES)).toBe(true);
    expect(T.filter(t => matchesTemplateSearch(t, 'birthday', NAMES))).toHaveLength(4);
  });

  it('still finds it by name', () => {
    expect(T.filter(t => matchesTemplateSearch(t, 'dino', NAMES))).toHaveLength(1);
  });

  /* ⚠️ Slug and display name diverge exactly where somebody is most likely to type. Measured on the
     real catalogue: "valentine" found 0 by slug-insensitive name matching alone and 3 with it. */
  it('matches the display name, not only the slug', () => {
    expect(matchesTemplateSearch({ name: 'x', tag_slugs: ['valentines'] }, "valentine's", NAMES)).toBe(true);
    expect(matchesTemplateSearch({ name: 'x', tag_slugs: ['baby-shower'] }, 'baby shower', NAMES)).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(T.every(t => matchesTemplateSearch(t, '', NAMES))).toBe(true);
  });
});

describe('every word must match something, and any word may match any field', () => {
  /* The ceiling this replaced: the whole query was tested against one field at a time, so a search
     spanning two of them found nothing. "birthday green" asked for a single field containing that
     phrase; Dino carries `birthday` and `green` as separate tags and matched neither. */
  it('finds a template whose words come from different tags', () => {
    expect(count({ q: 'birthday green' })).toBe(1);          // Dino
    expect(count({ q: 'birthday wedding' })).toBe(2);        // Vintage cake, Butterfly
  });

  it('spans the NAME and a tag', () => {
    expect(count({ q: 'dino green' })).toBe(1);
    expect(count({ q: 'dino birthday' })).toBe(1);
  });

  it('does not care about order or extra spaces', () => {
    expect(count({ q: 'green dino' })).toBe(1);
    expect(count({ q: '  dino   green  ' })).toBe(1);
  });

  /* AND across the words: typing more narrows. A word that matches nothing fails the whole query,
     rather than the query degrading into "any of these". */
  it('fails the whole query on one unmatched word', () => {
    expect(count({ q: 'dino unicorn' })).toBe(0);
    expect(count({ q: 'birthday unicorn' })).toBe(0);
  });

  /* ⚠️ A PREFIX STILL MATCHES. Tokenising narrows what a query MEANS, never what a word MATCHES —
     "choc" has to keep finding "chocolate". */
  it('keeps matching on a substring within each word', () => {
    /* ⚠️ THREE, NOT ONE, AND THE REASON IS WORTH KEEPING: "din" is inside "wedDINg". Dino matches by
       name; Vintage cake and Butterfly match on their `wedding` tag. A prefix search over a tag
       vocabulary is forgiving to a fault, and this was equally true of the old whole-query match —
       nothing regressed, the first assertion here was simply wrong about the fixture.
       Whole-word matching would tidy it and would break "choc" → "chocolate". That is the trade,
       made deliberately, and this test records which side of it we are on. */
    expect(count({ q: 'din' })).toBe(3);
    expect(count({ q: 'trop white' })).toBe(1);              // both prefixes, both Dino's tags
  });

  /* Nothing regresses: a two-word phrase that used to match one field still does, because each of
     its words is a substring of that same field — and now the SLUG answers it too, not only the
     display name. */
  it('still finds a two-word display name, and its hyphenated slug', () => {
    expect(matchesTemplateSearch({ name: 'x', tag_slugs: ['baby-shower'] }, 'baby shower', NAMES)).toBe(true);
    expect(matchesTemplateSearch({ name: 'x', tag_slugs: ['baby-shower'] }, 'baby-shower', NAMES)).toBe(true);
    expect(matchesTemplateSearch({ name: 'x', tag_slugs: ['baby-shower'] }, 'shower baby', NAMES)).toBe(true);
  });

  /* The case the emotion and relationship vocabularies exist for, and the reason this had to land
     first: two dimensions, one query. See plans/catalogue-findability.md. */
  it('matches a query spanning two dimensions', () => {
    const t = { name: 'Vintage-2', tag_slugs: ['i-love-you', 'mother'] };
    const names = new Map([['i-love-you', 'I love you'], ['mother', 'Mom']]);
    expect(matchesTemplateSearch(t, 'love you mom', names)).toBe(true);
    expect(matchesTemplateSearch(t, 'mom', names)).toBe(true);
    expect(matchesTemplateSearch(t, 'love dad', names)).toBe(false);
  });

  it('a whitespace-only query is not a filter', () => {
    expect(count({ q: '   ' })).toBe(T.length);
  });
});

describe('what the cake CONTAINS and what it SAYS', () => {
  /* The reported gap, verbatim: "if a cake has ranbow in it, and the template is names 'kids
     birthday cake', when user searches the template with rainbow, it does not show up."
     `search_slugs` is derived server-side from the design — element names, element tags, and the
     words piped on the cake — because the design itself is no longer in the list payload. */
  const kids = {
    name: 'Kids birthday cake',
    tag_slugs: ['birthday'],
    search_slugs: ['rainbow', 'cloud', 'grass clump'],
  };

  it('finds a template by a decoration that is ON it, not named in it', () => {
    expect(matchesTemplateSearch(kids, 'rainbow', NAMES)).toBe(true);
    expect(matchesTemplateSearch(kids, 'cloud', NAMES)).toBe(true);
  });

  it('finds it by what is WRITTEN on the cake', () => {
    const mum = { name: 'Vintage-2', tag_slugs: [], search_slugs: ['best mom ever'] };
    expect(matchesTemplateSearch(mum, 'mom', NAMES)).toBe(true);
    expect(matchesTemplateSearch(mum, 'best mom', NAMES)).toBe(true);
  });

  /* Tokenising and this land together for a reason: one word from the NAME and one from the
     DESIGN is the query somebody actually types. Neither half works without the other. */
  it('spans the name and the design in one query', () => {
    expect(matchesTemplateSearch(kids, 'birthday rainbow', NAMES)).toBe(true);
    expect(matchesTemplateSearch(kids, 'kids cloud', NAMES)).toBe(true);
  });

  it('still fails on a word nothing carries', () => {
    expect(matchesTemplateSearch(kids, 'rainbow unicorn', NAMES)).toBe(false);
  });

  /* ⚠️ A ROW WITHOUT THE FIELD MUST NOT THROW. Every template in the wild predates this column,
     and a client can be newer than the API that answers it — `search_slugs` is absent, not empty. */
  it('tolerates a row that has no search_slugs at all', () => {
    expect(matchesTemplateSearch({ name: 'Plain', tag_slugs: [] }, 'plain', NAMES)).toBe(true);
    expect(matchesTemplateSearch({ name: 'Plain' }, 'rainbow', NAMES)).toBe(false);
  });
});

describe('OR inside a category, AND across them', () => {
  /* Two occasions means "either": no cake is a birthday AND an anniversary, so ANDing within a
     category would return nothing every time. Two categories means "both": a cake is readily a
     birthday and pink. */
  it('widens within a category', () => {
    expect(count({ tags: { occasion: ['birthday'] } })).toBe(4);
    expect(count({ tags: { occasion: ['anniversary'] } })).toBe(2);
    expect(count({ tags: { occasion: ['birthday', 'anniversary'] } })).toBe(5);
  });

  it('narrows across categories', () => {
    expect(count({ tags: { occasion: ['birthday'], color: ['green'] } })).toBe(1);
  });

  it('the case that was asked for — an occasion and an age together', () => {
    expect(count({ tags: { occasion: ['birthday'] } })).toBe(4);
    expect(count({ age: '4' })).toBe(4);       // all but Couple, which starts at 20
    expect(count({ tags: { occasion: ['birthday'] }, age: '4' })).toBe(4);
    // And the age genuinely narrows: at 16 only the two that run to 80 survive.
    expect(count({ tags: { occasion: ['birthday'] }, age: '16' })).toBe(2);
  });

  it('an empty selection is not a filter', () => {
    expect(count({ tags: { occasion: [], style: null } })).toBe(T.length);
    expect(matchesFilters(T[0], {})).toBe(true);
  });

  it('tolerates the old single-slug shape', () => {
    expect(matchesFilters(T[0], { occasion: 'birthday' })).toBe(true);
    expect(matchesFilters(T[0], { occasion: 'wedding' })).toBe(false);
  });
});

describe('the age filter', () => {
  it('is an overlap, not an equality', () => {
    expect(count({ age: '2' })).toBe(4);     // everything but Couple
    expect(count({ age: '0' })).toBe(0);     // nothing in the catalogue starts at 0
  });

  /* ⚠️ THE CEILING SAYS "18+" AND HAS TO MEAN IT. Testing 18 exactly drops Couple (20–99), so the
     readout would promise adults and quietly exclude some. Measured on the real catalogue: 12 at the
     ceiling, 11 with an exact test. */
  it('includes a design that only starts above the ceiling', () => {
    expect(count({ age: String(AGE_FILTER_MAX) })).toBe(3);   // Vintage, Butterfly, Couple
    const exact = T.filter(t => t.attrs.min_age <= 18 && t.attrs.max_age >= 18).length;
    expect(exact).toBe(2);                                    // what an equality test would have given
  });

  it('is off when unset', () => {
    expect(count({ age: '' })).toBe(T.length);
  });
});
