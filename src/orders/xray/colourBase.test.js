import { describe, it, expect } from 'vitest';
import { baseFor, colourAdvice } from './colourBase.js';
import { gelRecipeFor } from './gelLibrary.js';

/* The reported case, with the real strings dev holds: guide.medium is free text a model wrote. */
const GOLD = gelRecipeFor('#FFA500');
const PINK = gelRecipeFor('#f4b0c3');

describe('baseFor — reading a free-text material', () => {
  it('reads the phrasings actually stored on dev', () => {
    expect(baseFor('Isomalt / sugar glass').key).toBe('isomalt');
    expect(baseFor('fondant / sugar paste').key).toBe('fondant');
    expect(baseFor('fondant').key).toBe('fondant');
  });

  it('puts chocolate before anything that would swallow it', () => {
    expect(baseFor('modelling chocolate').key).toBe('chocolate');
    expect(baseFor('tempered chocolate').key).toBe('chocolate');
    expect(baseFor('white chocolate ganache').key).toBe('chocolate');
  });

  it('answers null for a material it does not know, rather than guessing', () => {
    expect(baseFor('spun candyfloss')).toBe(null);
    expect(baseFor('')).toBe(null);
    expect(baseFor(null)).toBe(null);
  });
});

describe('colourAdvice', () => {
  it('no longer mixes an isomalt splash into buttercream', () => {
    const { text } = colourAdvice(GOLD, 'Isomalt / sugar glass');
    expect(text).not.toMatch(/buttercream/i);
    expect(text).toMatch(/syrup/i);
    expect(text).toMatch(/Americolor Gold/);     // the pigment is still named
  });

  it('kneads fondant instead of stirring a bowl', () => {
    const { text } = colourAdvice(PINK, 'fondant / sugar paste');
    expect(text).toMatch(/knead/i);
    expect(text).not.toMatch(/buttercream/i);
  });

  it('leaves buttercream exactly as it was', () => {
    const { text, showGel } = colourAdvice(PINK, 'buttercream');
    expect(text).toMatch(/^White buttercream \+ /);
    expect(showGel).toBe(true);
  });

  /* ⚠️ THE ONE THAT MATTERS. Naming a water-based gel beside chocolate is not clumsy wording, it is
     an instruction that ruins the batch. */
  it('never names a water-based gel for chocolate, and says why', () => {
    const { text, showGel } = colourAdvice(GOLD, 'tempered chocolate');
    expect(text).toMatch(/oil-based/i);
    expect(text).toMatch(/seize/i);
    expect(text).not.toMatch(/Americolor|Sugarflair/);
    expect(showGel).toBe(false);                 // and no white-plus-gel picture to contradict it
  });

  it('does not claim a base for a material it does not know', () => {
    const { text, showGel } = colourAdvice(GOLD, 'spun candyfloss');
    expect(text).toBe('Colour to match: Americolor Gold.');
    expect(showGel).toBe(false);
  });

  it('says nothing about mixing when no gel is needed at all', () => {
    const white = gelRecipeFor('#ffffff');
    expect(colourAdvice(white, 'fondant').text).toMatch(/no gel needed/i);
  });

  it('survives a guide with no material recorded — the older stored ones', () => {
    const { text } = colourAdvice(GOLD, null);
    expect(text).toMatch(/Colour to match/);
    expect(text).not.toMatch(/buttercream/i);
  });
});
