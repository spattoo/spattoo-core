import { describe, it, expect } from 'vitest';
import { topperMode } from './topperPiece.js';

/* Sandeep: "i selected 'on stick' in card topper studio. then selected 'lying flat' option. it
 * sleeps like this on cake. 'lying flat' should not be possible when on stick."
 *
 * ⚠️ THE RENDERER HAS TO REFUSE IT, NOT JUST THE CARD. Hiding the chip fixes the cakes nobody has
 * made yet; a cake already SAVED lying flat on a stick would keep rendering that way, with the one
 * control that could have changed it now gone. So the rule is asked here, where both ask it. */
describe('topperMode', () => {
  it('a card on a stick stands, whatever is stored', () => {
    expect(topperMode({ mode: 'lie', payload: { stick: { on: true } } })).toBe('stand');
    expect(topperMode({ mode: 'stand', payload: { stick: { on: true } } })).toBe('stand');
  });

  it('without a stick it sits however the baker asked', () => {
    expect(topperMode({ mode: 'lie', payload: { stick: { on: false } } })).toBe('lie');
    expect(topperMode({ mode: 'lie', payload: {} })).toBe('lie');
    expect(topperMode({ mode: 'lie' })).toBe('lie');
  });

  it('standing is the default, and nothing throws on a half-built topper', () => {
    expect(topperMode({})).toBe('stand');
    expect(topperMode(null)).toBe('stand');
    expect(topperMode(undefined)).toBe('stand');
  });
});
