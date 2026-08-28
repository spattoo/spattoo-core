import { describe, it, expect } from 'vitest';
import { colourGuidance, hexToHsl, clampPercent } from './fondantColour.js';

const name = (hex) => colourGuidance(hex)?.name;

describe('naming the colour', () => {
  /* ⚠️ THE ONE THAT MATTERS. Brown is a dark, dull orange — it has no hue of its own, so a
   * hue-only match calls it orange. That would put "colour your fondant orange" on step 1 of a
   * teddy bear, which is the commonest figure there is and the first thing anyone reads. */
  it('calls a bear brown, not orange', () => {
    expect(name('#C79A6B')).toBe('brown');
    expect(name('#8B5A2B')).toBe('brown');
    expect(name('#5C4033')).toBe('deep brown');
  });

  /* ⚠️ AND THE MIRROR OF IT. The first brown test was the hue band plus `l < 0.62`, which swallowed
   * a bright pumpkin orange and called it brown. Brown is orange that has lost its light or its
   * saturation; a vivid mid-tone orange is still orange. */
  it('still calls a bright orange orange', () => {
    expect(name('#FF8C1A')).toBe('orange');
    expect(name('#B08D57')).toBe('brown');        // same hue, duller — this one IS brown
  });

  it('reads the obvious families', () => {
    expect(name('#E33')).toBe(undefined);          // 3-digit hex is not accepted — see below
    expect(name('#EE3333')).toBe('red');
    expect(name('#2E7D32')).toBe('green');
    expect(name('#1E62D0')).toBe('blue');
    expect(name('#F7B6D2')).toBe('pale pink');
    expect(name('#111111')).toBe('black');        // never "deep black" — it says nothing
    expect(name('#FFFFFF')).toBe('white');
  });

  // An unreadable colour gets NO guidance rather than a guessed one: colour is the single step a
  // baker cannot undo once it is kneaded in.
  it('says nothing rather than guessing', () => {
    for (const bad of [null, undefined, '', 'brown', '#12345', 'rgb(1,2,3)']) {
      expect(colourGuidance(bad)).toBe(null);
    }
  });
});

describe('what it tells a baker', () => {
  const brown = colourGuidance('#8B5A2B');

  it('names gel, never liquid — enough liquid for a deep shade makes fondant unworkable', () => {
    expect(brown.how).toMatch(/gel/i);
    expect(brown.instruction).toMatch(/knead/i);
  });

  // "Colour your fondant a brown" is not English. The article belongs to the qualifier.
  it('gets the article right', () => {
    expect(brown.instruction).toMatch(/^Colour your fondant brown\./);
    expect(colourGuidance('#5C4033').instruction).toMatch(/^Colour your fondant a deep brown\./);
  });

  // Over-colouring is the commonest fondant mistake and is invisible when it happens, so this is
  // said for EVERY colour rather than only the awkward ones.
  it('warns about deepening on every colour', () => {
    for (const hex of ['#8B5A2B', '#FFFFFF', '#1E62D0', '#EE3333']) {
      expect(colourGuidance(hex).rest).toMatch(/deepens as the fondant rests/);
    }
  });

  it('carries the shade-specific warning only where there is one', () => {
    expect(colourGuidance('#8B5A2B').warn).toMatch(/grey/);      // brown goes grey
    expect(colourGuidance('#EE3333').warn).toMatch(/bitter/);    // red tastes bitter
    expect(colourGuidance('#FFFFFF').warn).toBe(null);           // plain white needs none
  });
});

describe('sizes a bench can act on', () => {
  it('rounds to 5% — nobody eyeballs finer', () => {
    expect(clampPercent(62)).toBe(60);
    expect(clampPercent(63)).toBe(65);
  });

  it('never claims 0% or more than the whole', () => {
    expect(clampPercent(0)).toBe(5);
    expect(clampPercent(400)).toBe(100);
  });
});

describe('hsl', () => {
  it('reads a hex with or without the hash', () => {
    expect(hexToHsl('#FFFFFF').l).toBe(1);
    expect(hexToHsl('000000').l).toBe(0);
    expect(Math.round(hexToHsl('#FF0000').h)).toBe(0);
    expect(Math.round(hexToHsl('#00FF00').h)).toBe(120);
  });
});
