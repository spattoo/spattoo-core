import { describe, it, expect } from 'vitest';
import { hasShapeControls } from './TierShapeControls.jsx';

// WHY THIS EXISTS. The mobile edit sheet offers a "Shape" tab only when the tier has shape config to
// show, because a round cake has none and every ordinary cake was getting a tab you could tap to find
// empty. The risk of that conditional is the opposite failure, and it is the worse one: a number cake
// has no OTHER route back to its digits — the shape picker only runs at "New" — so getting this wrong
// strands a design with no way to change what it says.
//
// tierGeometry resolves the family from `shapeFamily` when present, otherwise from the `shape` key,
// so both shapes of tier are exercised here.

describe('hasShapeControls', () => {
  it('is false for a round cake — nothing to configure', () => {
    expect(hasShapeControls({ shape: 'round' })).toBe(false);
  });

  it('is false for a tier with no shape at all (falls back to round)', () => {
    expect(hasShapeControls({})).toBe(false);
    expect(hasShapeControls(undefined)).toBe(false);
  });

  it('is false for an unknown shape key — it resolves to round rather than throwing', () => {
    expect(hasShapeControls({ shape: 'not-a-shape' })).toBe(false);
  });

  it('is TRUE for a number cake — the digits field is the only way back to them', () => {
    expect(hasShapeControls({ shapeFamily: 'number', shapeConfig: { digits: '21' } })).toBe(true);
  });

  it('is TRUE for a letter cake', () => {
    expect(hasShapeControls({ shapeFamily: 'letter', shapeConfig: { letters: 'AB' } })).toBe(true);
  });

  it('is TRUE for a rounded rectangle — it carries a corner radius', () => {
    expect(hasShapeControls({ shapeFamily: 'rounded_rect' })).toBe(true);
  });
});
