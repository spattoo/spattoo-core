import { describe, it, expect } from 'vitest';
import { cakeShapeGroups, SHAPE_GROUPS, cakeShapeList } from './cakeShapes.js';

/* The picker used to render the catalog flat, in whatever order the API returned rows — which is
 * the order an admin created them in. Sandeep: "it would be nice if all round are at one place and
 * all rectangular are at one place. i think we already have root shape."
 *
 * ⚠️ THE TEST THAT MATTERS IS THE CATCH-ALL. Grouping is cosmetic; a shape DISAPPEARING from the
 * picker because no group claimed its family is a published row an admin can no longer reach, and
 * nothing would error or log. Everything else here is secondary to that. */

const shape = (key, family) => ({ key, family, label: key });
const flatten = groups => groups.flatMap(g => g.shapes.map(s => s.key));

describe('cakeShapeGroups', () => {
  it('puts every round footprint in one group and every rectangular one in another', () => {
    const groups = cakeShapeGroups([
      shape('round', 'circle'),
      shape('rect', 'rounded_rect'),
      shape('two-tier', 'circle'),
      shape('half-sheet', 'rounded_rect'),
      shape('tall-round', 'circle'),
    ]);
    expect(groups.map(g => g.key)).toEqual(['round', 'rect']);
    /* All five are single-tier here (the helper sets no stack), so this is also the stability
       check: nothing moves when there is nothing to separate. Tier-count ordering has its own
       tests below. */
    expect(groups[0].shapes.map(s => s.key)).toEqual(['round', 'two-tier', 'tall-round']);
    expect(groups[1].shapes.map(s => s.key)).toEqual(['rect', 'half-sheet']);
  });

  /* ⚠️ The whole reason the last entry has `families: null`. A new curve added to OUTLINE_FAMILIES,
     or a row whose family nobody mapped, must still reach a customer. */
  it('never loses a shape whose family no group claims', () => {
    const groups = cakeShapeGroups([
      shape('round', 'circle'),
      shape('mystery', 'dodecahedron'),
      shape('also-new', undefined),
    ]);
    expect(flatten(groups)).toEqual(['round', 'mystery', 'also-new']);
    const more = groups.find(g => g.key === 'more');
    expect(more.shapes.map(s => s.key)).toEqual(['mystery', 'also-new']);
  });

  it('keeps the catch-all last, so unknown shapes never push authored ones down', () => {
    expect(SHAPE_GROUPS.at(-1).families).toBeNull();
    expect(SHAPE_GROUPS.slice(0, -1).every(g => Array.isArray(g.families))).toBe(true);
    const groups = cakeShapeGroups([shape('mystery', 'nope'), shape('round', 'circle')]);
    expect(groups.map(g => g.key)).toEqual(['round', 'more']);
  });

  /* Every shape appears once. A family listed in two groups would duplicate a tile, which reads as
     two different cakes that happen to share a name. */
  it('puts each shape in exactly one group', () => {
    const seen = new Set();
    for (const g of SHAPE_GROUPS) {
      for (const f of g.families ?? []) {
        expect(seen.has(f)).toBe(false);
        seen.add(f);
      }
    }
  });

  it('drops empty groups rather than printing a heading over nothing', () => {
    const groups = cakeShapeGroups([shape('round', 'circle')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('round');
  });

  it('survives an empty or absent catalog', () => {
    expect(cakeShapeGroups([])).toEqual([]);
    expect(cakeShapeGroups(null)).toEqual([]);
    expect(cakeShapeGroups(undefined)).toEqual([]);
  });

  /* ── Order inside a group ──────────────────────────────────────────────────────────────────
   *
   * Sandeep: "let the most ordered round single tier one should be the first one." A plain round
   * single tier is the commonest cake there is, and it was landing wherever the API happened to
   * put it. */
  const stacked = (key, family, tiers) =>
    ({ key, family, label: key, tiers: Array.from({ length: tiers }, () => ({})) });

  it('puts the simplest cake first — a single tier leads its group', () => {
    const groups = cakeShapeGroups([
      stacked('four-tier', 'circle', 4),
      stacked('two-tier', 'circle', 2),
      shape('round', 'circle'),
      stacked('three-tier', 'circle', 3),
    ]);
    expect(groups[0].shapes.map(s => s.key)).toEqual(['round', 'two-tier', 'three-tier', 'four-tier']);
  });

  /* ⚠️ An empty or absent stack is ONE tier, not zero — applyCakeShapeConfig says so, and the seed
     round/rect carry no stack at all. Reading it as zero would sort them first on a technicality. */
  it('treats an empty or absent stack as a single tier', () => {
    const groups = cakeShapeGroups([
      stacked('two-tier', 'circle', 2),
      { key: 'no-stack', family: 'circle', label: 'no-stack' },
      { key: 'empty-stack', family: 'circle', label: 'empty-stack', tiers: [] },
    ]);
    expect(groups[0].shapes.map(s => s.key)).toEqual(['no-stack', 'empty-stack', 'two-tier']);
  });

  /* The sort only ever separates DIFFERENT tier counts. Equal counts keep catalog order, because
     cake_shapes has no sort column yet and that is an admin's judgement to make later — this must
     not quietly invent one in the meantime. */
  it('leaves same-height shapes in catalog order', () => {
    const groups = cakeShapeGroups([
      shape('full-sheet', 'rounded_rect'),
      shape('quarter-sheet', 'rounded_rect'),
      shape('half-sheet', 'rounded_rect'),
    ]);
    expect(groups[0].shapes.map(s => s.key)).toEqual(['full-sheet', 'quarter-sheet', 'half-sheet']);
  });

  /* Sorting must not mutate what the caller handed over — the picker reads this same list. */
  it('does not reorder the caller\'s array', () => {
    const input = [stacked('two-tier', 'circle', 2), shape('round', 'circle')];
    cakeShapeGroups(input);
    expect(input.map(s => s.key)).toEqual(['two-tier', 'round']);
  });

  /* The seed must group correctly with no DB at all — round and rect are what existing designs
     already store, so the picker has to work before a single row is authored. */
  it('groups the bare seed catalog', () => {
    const groups = cakeShapeGroups(cakeShapeList());
    expect(groups.map(g => g.key)).toEqual(['round', 'rect']);
    expect(flatten(groups).sort()).toEqual(['rect', 'round']);
  });
});
