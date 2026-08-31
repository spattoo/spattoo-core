import { describe, it, expect } from 'vitest';
import { canTemplate } from './garnishTemplate.js';

const square = [[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]];
const cut = { kind: 'cut', paths: [square], rings: [square], plate: 420, scale: 1, cakeDiameterMm: 180 };

describe('who gets a cutting template', () => {
  it('a cut panel with a known cake size', () => {
    expect(canTemplate(cut)).toBe(true);
  });

  /* ⚠️ A filigree is piped ALONG a line, not cut TO one. Handing a baker a cutting template for one
     would invite the wrong technique — the guide they need is the order, which the diagram gives. */
  it('never a piped piece', () => {
    expect(canTemplate({ ...cut, kind: 'piped' })).toBe(false);
  });

  /* ⚠️ The baker CUTS to this. A confidently wrong size is worse than no template at all. */
  it('not until the cake size is known', () => {
    expect(canTemplate({ ...cut, cakeDiameterMm: null })).toBe(false);
  });

  it('not for a piece with nothing closed to cut', () => {
    expect(canTemplate({ ...cut, rings: [] })).toBe(false);
  });
});
