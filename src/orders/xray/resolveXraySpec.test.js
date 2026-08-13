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

// ── The { design, decorations } wrapper ─────────────────────────────────────────────────────────
// xray_spec carries two things in one column: the design the model read, and the decoration steps
// generated on demand afterwards. Rows written before steps existed are a BARE design_snapshot, and
// both shapes must resolve — there is no backfill, and the backend only promotes a row on the first
// steps write, so bare rows survive indefinitely.
describe('resolveXraySpec — spec shapes', () => {
  const DESIGN = { tiers: [{ id: 't1' }], stickers: [] };
  const STEPS  = { 'est-0-0': { guide: { steps: [{ n: 1 }] }, label: 'bow on the top surface' } };

  it('reads a bare (pre-wrapper) spec as the design itself', () => {
    const r = resolveXraySpec({ xray_spec: DESIGN });
    expect(r.design).toEqual(DESIGN);
    expect(r.decorations).toBeNull();
    expect(r.fromPhoto).toBe(true);
  });

  it('unwraps a { design, decorations } spec', () => {
    const r = resolveXraySpec({ xray_spec: { design: DESIGN, decorations: STEPS } });
    expect(r.design).toEqual(DESIGN);
    expect(r.decorations).toEqual(STEPS);
  });

  it('keeps steps when the baker corrects the reading', () => {
    // Corrections are written bare (PATCH design-estimate stores the edited snapshot as-is), so a
    // naive "edited wins" would drop the steps the baker already paid for.
    const r = resolveXraySpec({
      xray_spec:        { design: DESIGN, decorations: STEPS },
      xray_spec_edited: { tiers: [{ id: 't1', fixed: true }], stickers: [] },
    });
    expect(r.design.tiers[0].fixed).toBe(true);
    expect(r.decorations).toEqual(STEPS);
    expect(r.edited).toBe(true);
  });

  it('a designed order has no decoration steps', () => {
    const r = resolveXraySpec({ design_snapshot: DESIGN, xray_spec: { design: DESIGN, decorations: STEPS } });
    expect(r.fromPhoto).toBe(false);
    expect(r.decorations).toBeNull();
  });
});
