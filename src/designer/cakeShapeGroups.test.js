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

  /* Order within a group is NOT invented — cake_shapes has no sort column, so catalog order is the
     only honest answer and this pins that we did not quietly add one. */
  it('preserves catalog order inside a group', () => {
    const groups = cakeShapeGroups([
      shape('full-sheet', 'rounded_rect'),
      shape('quarter-sheet', 'rounded_rect'),
      shape('half-sheet', 'rounded_rect'),
    ]);
    expect(groups[0].shapes.map(s => s.key)).toEqual(['full-sheet', 'quarter-sheet', 'half-sheet']);
  });

  /* The seed must group correctly with no DB at all — round and rect are what existing designs
     already store, so the picker has to work before a single row is authored. */
  it('groups the bare seed catalog', () => {
    const groups = cakeShapeGroups(cakeShapeList());
    expect(groups.map(g => g.key)).toEqual(['round', 'rect']);
    expect(flatten(groups).sort()).toEqual(['rect', 'round']);
  });
});
