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
