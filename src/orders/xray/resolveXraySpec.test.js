import { describe, it, expect } from 'vitest';
import { resolveXraySpec, hasXraySpec } from './resolveXraySpec.js';

const SNAP = { tiers: [{ shape: 'round' }] };
const EST  = { tiers: [{ shape: 'round' }], source: 'photo' };
const EDIT = { tiers: [{ shape: 'square' }], source: 'photo' };

describe('resolveXraySpec', () => {
  it('prefers a real snapshot over any estimate', () => {
    // A designed order needs nothing inferred; an estimate must never shadow authored data.
    const r = resolveXraySpec({ design_snapshot: SNAP, xray_spec: EST, xray_spec_edited: EDIT });
    expect(r.design).toBe(SNAP);
    expect(r.fromPhoto).toBe(false);
  });

  it('prefers the baker’s corrections over the raw estimate', () => {
    const r = resolveXraySpec({ xray_spec: EST, xray_spec_edited: EDIT });
    expect(r.design).toBe(EDIT);
    expect(r.edited).toBe(true);
    expect(r.fromPhoto).toBe(true);
  });

  it('falls back to the raw estimate when nothing was corrected', () => {
    const r = resolveXraySpec({ xray_spec: EST });
    expect(r.design).toBe(EST);
    expect(r.edited).toBe(false);
    expect(r.fromPhoto).toBe(true);
  });

  it('marks an estimate-derived design as fromPhoto, so the sheet can say so', () => {
    // The flag is load-bearing: a report built from a photo reading must never be presented as a
    // measurement, on screen or on paper.
    expect(resolveXraySpec({ xray_spec: EST }).fromPhoto).toBe(true);
    expect(resolveXraySpec({ design_snapshot: SNAP }).fromPhoto).toBe(false);
  });

  it('carries the coverage gaps along with the design', () => {
    const coverage = { decorationsSeen: 3, decorationsIdentified: 2, unidentified: [{ what: 'rosette' }] };
    const r = resolveXraySpec({ xray_spec: EST, xray_spec_meta: { coverage } });
    expect(r.coverage).toEqual(coverage);
  });

  it('returns nothing for an order with neither a design nor an estimate', () => {
    const r = resolveXraySpec({ id: 'x' });
    expect(r.design).toBeNull();
    expect(r.fromPhoto).toBe(false);
    expect(hasXraySpec({ id: 'x' })).toBe(false);
  });

  it('survives a null/undefined order', () => {
    expect(resolveXraySpec(null).design).toBeNull();
    expect(resolveXraySpec(undefined).design).toBeNull();
    expect(hasXraySpec(null)).toBe(false);
  });

  it('hasXraySpec agrees with resolveXraySpec', () => {
    // The launcher and the report must never disagree about whether there is anything to show.
    for (const order of [{ design_snapshot: SNAP }, { xray_spec: EST }, { xray_spec_edited: EDIT }, {}]) {
      expect(hasXraySpec(order)).toBe(!!resolveXraySpec(order).design);
    }
  });
});
