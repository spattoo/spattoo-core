import { describe, it, expect } from 'vitest';
import { resolveXrayDesign, hasXrayDesign } from './resolveDesign.js';

const SNAP = { tiers: [{ shape: 'round' }] };
const EST  = { tiers: [{ shape: 'round' }], source: 'ai_estimate' };
const EDIT = { tiers: [{ shape: 'square' }], source: 'ai_estimate' };

describe('resolveXrayDesign', () => {
  it('prefers a real snapshot over any estimate', () => {
    // A designed order needs nothing inferred; an estimate must never shadow authored data.
    const r = resolveXrayDesign({ design_snapshot: SNAP, design_estimate: EST, design_estimate_edited: EDIT });
    expect(r.design).toBe(SNAP);
    expect(r.estimated).toBe(false);
  });

  it('prefers the baker’s corrections over the raw estimate', () => {
    const r = resolveXrayDesign({ design_estimate: EST, design_estimate_edited: EDIT });
    expect(r.design).toBe(EDIT);
    expect(r.edited).toBe(true);
    expect(r.estimated).toBe(true);
  });

  it('falls back to the raw estimate when nothing was corrected', () => {
    const r = resolveXrayDesign({ design_estimate: EST });
    expect(r.design).toBe(EST);
    expect(r.edited).toBe(false);
    expect(r.estimated).toBe(true);
  });

  it('marks an estimate-derived design as estimated, so the sheet can say so', () => {
    // The flag is load-bearing: a report built from a photo reading must never be presented as a
    // measurement, on screen or on paper.
    expect(resolveXrayDesign({ design_estimate: EST }).estimated).toBe(true);
    expect(resolveXrayDesign({ design_snapshot: SNAP }).estimated).toBe(false);
  });

  it('carries the coverage gaps along with the design', () => {
    const coverage = { decorationsSeen: 3, decorationsIdentified: 2, unidentified: [{ what: 'rosette' }] };
    const r = resolveXrayDesign({ design_estimate: EST, design_estimate_meta: { coverage } });
    expect(r.coverage).toEqual(coverage);
  });

  it('returns nothing for an order with neither a design nor an estimate', () => {
    const r = resolveXrayDesign({ id: 'x' });
    expect(r.design).toBeNull();
    expect(r.estimated).toBe(false);
    expect(hasXrayDesign({ id: 'x' })).toBe(false);
  });

  it('survives a null/undefined order', () => {
    expect(resolveXrayDesign(null).design).toBeNull();
    expect(resolveXrayDesign(undefined).design).toBeNull();
    expect(hasXrayDesign(null)).toBe(false);
  });

  it('hasXrayDesign agrees with resolveXrayDesign', () => {
    // The launcher and the report must never disagree about whether there is anything to show.
    for (const order of [{ design_snapshot: SNAP }, { design_estimate: EST }, { design_estimate_edited: EDIT }, {}]) {
      expect(hasXrayDesign(order)).toBe(!!resolveXrayDesign(order).design);
    }
  });
});
