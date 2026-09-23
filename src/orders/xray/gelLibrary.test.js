import { describe, it, expect } from 'vitest';
import { gelRecipeFor, normalizeHex } from './gelLibrary.js';

/* ── The bug these exist for ─────────────────────────────────────────────────────────────────────
 * An olive `#8f9b0f` was answered with "white buttercream + Americolor Lemon Yellow". The hues are
 * ten degrees apart, so hue-matching scored it well — and adding yellow to white cannot make olive.
 * Every tint of one gel lies on the line from white to that gel, and olive is nowhere near the
 * yellow line. Found by DRAWING the mix beside the sentence, not by reading the code. */

const say = (hex) => gelRecipeFor(hex).recipe.toLowerCase();

describe('gelRecipeFor — reachability', () => {
  it('does not send a baker to yellow for an olive', () => {
    const r = gelRecipeFor('#8f9b0f');
    expect(r.gel.name.toLowerCase()).toContain('green');
    expect(say('#8f9b0f')).not.toContain('lemon yellow');
  });

  it('still gives a plain yellow the yellow gel', () => {
    expect(say('#ffcc33')).toContain('egg yellow');
  });

  it('answers a colour that IS a gel with that gel, neat, and nothing else', () => {
    // #C8102E is Sugarflair Christmas Red at full strength: t = 1, on the line, nothing to add.
    const r = gelRecipeFor('#C8102E');
    expect(r.gel.name).toBe('Christmas Red');
    expect(r.second).toBe(null);
    expect(r.approx).toBe(false);
    expect(r.amount).toContain('generous');
  });

  /* ⚠️ AMOUNT IS VOLUME, NOT DISTANCE ALONG THE LINE — and the first cut of this got it wrong.
     Reading the amount off `t` made a pale pink "a moderate amount", because Baby Pink is itself a
     pale gel and reaching a pale pink means travelling a long way along a short line. Meanwhile a
     dab of Super Black takes you most of the way to black. Depth of the TARGET predicts volume;
     distance along the line does not. */
  it('asks for a dab for a wash and a lot for a deep colour, whatever gel it picks', () => {
    expect(gelRecipeFor('#fdeff3').amount).toMatch(/tiny dab|small amount/);   // pale gel, pale target
    expect(gelRecipeFor('#e8dff0').amount).toMatch(/tiny dab/);                // a wash of violet
    expect(gelRecipeFor('#6E1A2B').amount).toMatch(/generous/);                // deep claret
  });

  it('offers a second gel only when one cannot get there', () => {
    expect(gelRecipeFor('#8f9b0f').second).not.toBe(null);   // off every single line
    expect(gelRecipeFor('#ffcc33').second).toBe(null);       // on the yellow line
  });

  it('names the second gel in the sentence, in the order it goes in', () => {
    const r = gelRecipeFor('#8f9b0f');
    const first  = r.recipe.indexOf(r.gel.name);
    const secondAt = r.recipe.indexOf(r.second.name);
    expect(first).toBeGreaterThan(-1);
    expect(secondAt).toBeGreaterThan(first);
  });

  it('reports where the recipe LANDS, so a picture cannot claim a match it does not make', () => {
    const r = gelRecipeFor('#8f9b0f');
    expect(normalizeHex(r.reachedHex)).toBe(r.reachedHex);
    // It lands near the target, not on the gel it started from.
    expect(r.reachedHex).not.toBe('#f6e04b');
  });
});

describe('gelRecipeFor — the ends of the range', () => {
  it('near-white needs no gel at all', () => {
    const r = gelRecipeFor('#ffffff');
    expect(r.gel).toBe(null);
    expect(r.recipe).toMatch(/no gel/i);
  });

  it('near-black goes to black', () => {
    expect(say('#0d0d0d')).toContain('black');
  });

  it('refuses a colour it cannot read', () => {
    expect(gelRecipeFor('not a colour')).toBe(null);
    expect(gelRecipeFor(null)).toBe(null);
  });
});
