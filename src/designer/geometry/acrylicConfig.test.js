import { describe, it, expect } from 'vitest';
import {
  ACRYLIC_DEFAULTS, acrylicCfg, acrylicFitAspect, writingFromAcrylicRow, acrylicFinishes,
  NOMINAL_MM_PER_UNIT,
} from './acrylicConfig.js';
import { faceFit } from './topperFaces.js';

/* ── The studio has to actually reach the cake ───────────────────────────────────────────────────
 *
 * ⚠️ It did not, for as long as it existed. The Acrylic Topper Studio wrote
 * `placement_config.acrylic` and nothing read it, while the renderer carried its own bar ratio, leg
 * length, bury depth, bridge flag and line gap. Everything below is checkable and none of it was.
 */
describe('an authored row reaches the renderer', () => {
  // What the studio actually writes, nesting and all.
  const ROW = {
    face: 'parisienne', stroke: 0.14, weight: 0.006, tracking: -0.09,
    thickness: 0.07, minDetail: 1.6, lineGap: 1.35, maxLines: 2,
    bar: { ratio: 0.2 }, legs: { count: 3, length: 0.5, bury: 0.3 },
    bridge: false, finishes: ['black', 'silver'], defaultFinish: 'black',
    text: { default: 'Happy Birthday', maxLen: 24 },
  };

  it('carries every authored value through to the cfg the renderer uses', () => {
    const cfg = acrylicCfg(writingFromAcrylicRow(ROW), { standing: true });
    expect(cfg.tracking).toBe(-0.09);
    expect(cfg.stroke).toBe(0.14);
    expect(cfg.weight).toBe(0.006);
    expect(cfg.lineGap).toBe(1.35);
    expect(cfg.maxLines).toBe(2);
    expect(cfg.bridge).toBe(false);
    expect(cfg.barRatio).toBe(0.2);      // was hardcoded 0.13
    expect(cfg.legs).toBe(3);            // was hardcoded 2
    expect(cfg.legLen).toBe(0.5);        // was hardcoded 0.42
    expect(cfg.bury).toBe(0.3);          // was hardcoded 0.21
    expect(cfg.thickness).toBe(0.07);
  });

  it('offers only the finishes the row authored, and starts on its default', () => {
    const w = writingFromAcrylicRow(ROW);
    expect(acrylicFinishes(w)).toEqual(['black', 'silver']);
    expect(w.acrylicFinish).toBe('black');
  });

  it('never starts on a finish it does not offer', () => {
    // An admin can withdraw the default without remembering to move it. Landing on a finish that is
    // not on the list would put a colour on a cake that nobody can then choose again.
    const w = writingFromAcrylicRow({ ...ROW, defaultFinish: 'rose' });
    expect(acrylicFinishes(w)).toEqual(['black', 'silver']);
    expect(acrylicFinishes(w)).toContain(w.acrylicFinish);
  });

  it('drops a finish key the renderer does not understand', () => {
    const w = writingFromAcrylicRow({ ...ROW, finishes: ['black', 'hologram'] });
    expect(acrylicFinishes(w)).toEqual(['black']);
  });

  it('reads a null bar and null legs as "none", not as "unset"', () => {
    // The studio writes null for both when they are switched off. Treating that as absent would put
    // legs back on a design that deliberately has none.
    const cfg = acrylicCfg(writingFromAcrylicRow({ ...ROW, bar: null, legs: null }), { standing: true });
    expect(cfg.bar).toBe(false);
    expect(cfg.legs).toBe(0);
  });

  it('keeps a fit of exactly 0, which means "set as drawn"', () => {
    // `||` here would silently replace a deliberate choice with the face's own fit.
    expect(writingFromAcrylicRow({ ...ROW, tracking: 0 }).tracking).toBe(0);
  });

  it('falls back to the face\'s fit when the row does not say', () => {
    const { tracking } = writingFromAcrylicRow({ face: 'pinyon_script' });
    expect(tracking).toBe(faceFit('pinyon_script'));
  });
});

describe('what happens when nobody authored anything', () => {
  it('uses the seed, and the seed is the only place a number lives', () => {
    const cfg = acrylicCfg({ font: 'great_vibes' }, { standing: true });
    expect(cfg.barRatio).toBe(ACRYLIC_DEFAULTS.barRatio);
    expect(cfg.legs).toBe(ACRYLIC_DEFAULTS.legs);
    expect(cfg.thickness).toBe(ACRYLIC_DEFAULTS.sheetStand);
  });

  it('gives a flat plaque a thinner sheet than a standing topper', () => {
    // Structural, not taste: standing, the sheet holds the word up; lying, it carries nothing and a
    // 3mm edge is as wide as the strokes are.
    const stand = acrylicCfg({}, { standing: true });
    const flat  = acrylicCfg({}, { standing: false });
    expect(flat.thickness).toBeLessThan(stand.thickness);
    expect(flat.legs).toBe(0);
    expect(flat.bar).toBe(false);
  });

  it('turns a span into the ratio topperShapes wants, in real millimetres', () => {
    // Given a real scale, the sum is just span x mm-per-unit over the smallest detail.
    expect(acrylicFitAspect({ minDetail: 2 }, 1, 84)).toBe(42);
    expect(acrylicFitAspect({}, 0)).toBeGreaterThan(0);      // no span yet: still usable
  });

  it('falls back to a nominal scale, because the designer has no real one', () => {
    /* ⚠️ SHEET_INCH_TO_WORLD is the only inches-to-units constant in the codebase and it does NOT
     * mean what it looks like — at 0.12 a unit is ~212mm, making the default bottom tier a twenty
     * inch cake. It was chosen so a sheet reads beside a round tier. So the nominal is declared, and
     * this pins that an absent scale still produces the same answer as passing it explicitly. */
    expect(NOMINAL_MM_PER_UNIT).toBeCloseTo((8 * 25.4) / 2.4, 6);
    expect(acrylicFitAspect({}, 1)).toBeCloseTo(acrylicFitAspect({}, 1, NOMINAL_MM_PER_UNIT), 9);
    expect(acrylicFitAspect({}, 1, 0)).toBeCloseTo(acrylicFitAspect({}, 1), 9);   // 0 is not a scale
  });
});
