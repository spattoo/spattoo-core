import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGION_KINDS } from '../geometry/region.js';
import { AREA_LABEL, areaLabel, hasAreaGlyph } from './AreaShapeIcon.jsx';

/* ── A mark for every area a baker can pick ──────────────────────────────────────────────────────
 *
 * The Area row shows marks rather than words. That trades a word for a glyph, and the trade only
 * holds while there IS a glyph: add a kind to `REGION_KINDS` and forget the mark, and the button
 * renders a blank the size of its neighbours — unpickable, and indistinguishable from the other
 * two. The fallback to the word is what stops that being silent; this is what stops it happening.
 */
describe('every region kind can be picked by sight', () => {
  it('has a mark for each kind the geometry offers', () => {
    const missing = Object.keys(REGION_KINDS).filter(k => !hasAreaGlyph(k));
    expect(missing).toEqual([]);
  });

  it('has a word for each kind, for the screen reader and the fallback', () => {
    const missing = Object.keys(REGION_KINDS).filter(k => !AREA_LABEL[k]);
    expect(missing).toEqual([]);
  });

  /* A kind with no mark must still be pickable — `areaLabel` falls back to the key rather than
     returning undefined, which would render nothing at all. */
  it('never returns an empty name, even for a kind it has never heard of', () => {
    expect(areaLabel('pentagon')).toBe('pentagon');
    expect(hasAreaGlyph('pentagon')).toBe(false);
  });

  /* ⚠️ NO EMOJI ANYWHERE IN A UI (CLAUDE.md rule 4). An area mark is the kind of control somebody
     reaches for a ▲ or a ⬤ to make, and those are exactly what the rule forbids. */
  it('draws SVG, not pictographs', () => {
    const src = readFileSync(new URL('./AreaShapeIcon.jsx', import.meta.url), 'utf8');
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(body).toMatch(/<svg/);
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u);
  });

  /* The mark and the geometry must agree about which way a triangle points: `REGION_KINDS.triangle`
     puts its apex at -z, and -z is UP on a top-down view, so the glyph's apex is at the top of its
     box (smallest y in SVG coordinates, where y grows downward). */
  it('points the triangle the way the sand actually points', () => {
    const apex = REGION_KINDS.triangle.reduce((a, b) => (b.z < a.z ? b : a));
    expect(apex.z).toBeLessThan(0);
    const src = readFileSync(new URL('./AreaShapeIcon.jsx', import.meta.url), 'utf8');
    const d = src.match(/triangle:\s*<path d="M([\d.]+) ([\d.]+)/);
    expect(d, 'the triangle glyph should start at its apex').not.toBeNull();
    const [, , apexY] = d;
    expect(Number(apexY)).toBeLessThan(12);   // above the middle of the 24-unit box
  });
});
