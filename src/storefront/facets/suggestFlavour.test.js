import { describe, it, expect } from 'vitest';
import { suggestFlavours, fallback, RULES } from './suggestFlavour.js';

// The suggester makes a claim to a customer about to spend money on an occasion that matters. These
// pin the parts where being wrong is worse than being silent.

const f = (id, name, tasteFamily, crowdPleaser, extra = {}) =>
  ({ id, name, tasteFamily, crowdPleaser, conflicts_with: [], ...extra });

const CATALOGUE = [
  f('choc',   'Chocolate',    'chocolate', true),
  f('dark',   'Belgian Dark', 'chocolate', false),
  f('van',    'Vanilla',      'classic',   true),
  f('straw',  'Strawberry',   'fruit',     true),
  f('matcha', 'Matcha',       'tea',       false),
  f('rasm',   'Rasmalai',     'indian',    false, { conflicts_with: ['eggless'] }),
];

describe('suggesting', () => {
  it('sends a child to chocolate, and says why', () => {
    const [top] = suggestFlavours(CATALOGUE, { recipient: 'child', mood: 'safe' });
    expect(top.flavour.tasteFamily).toBe('chocolate');
    expect(top.because).toMatch(/children/i);
  });

  it('prefers the crowd-pleasing chocolate over the one that divides a room', () => {
    const ranked = suggestFlavours(CATALOGUE, { recipient: 'child', mood: 'safe' });
    const order = ranked.map(r => r.flavour.id);
    expect(order.indexOf('choc')).toBeLessThan(order.indexOf('dark'));
  });

  it('turns the other way when asked for something different', () => {
    const [top] = suggestFlavours(CATALOGUE, { mood: 'different' });
    expect(['tea', 'indian', 'nut', 'coffee']).toContain(top.flavour.tasteFamily);
  });

  it('gives the reason of the rule that actually won, not a plausible one', () => {
    const [top] = suggestFlavours(CATALOGUE, { mood: 'different' });
    const rule = RULES.find(r => r.id === 'adventurous');
    expect(top.because).toBe(rule.because);
  });

  it('never surfaces a flavour nobody has described', () => {
    // No tasteFamily means nobody has said what it is. Ranking it would be inventing an answer.
    const mystery = f('new', 'Something New', null, null);
    const ranked = suggestFlavours([...CATALOGUE, mystery], { recipient: 'child', mood: 'safe' });
    expect(ranked.map(r => r.flavour.id)).not.toContain('new');
  });

  it('returns nothing rather than a bad answer when no rule applies', () => {
    const onlyTea = [f('matcha', 'Matcha', 'tea', false)];
    expect(suggestFlavours(onlyTea, { recipient: 'colleagues', mood: 'safe' })).toEqual([]);
  });
});

describe('dietary is a filter, not a score', () => {
  it('removes a flavour the baker cannot make that way — it does not rank it lower', () => {
    const ranked = suggestFlavours(CATALOGUE, { mood: 'different' }, { dietaryKeys: ['eggless'] });
    expect(ranked.map(r => r.flavour.id)).not.toContain('rasm');
  });

  it('keeps it when the requirement was not asked for', () => {
    const ranked = suggestFlavours(CATALOGUE, { mood: 'different' });
    expect(ranked.map(r => r.flavour.id)).toContain('rasm');
  });

  it('accepts conflicts as objects as well as keys, since the API sends both shapes', () => {
    const asObjects = [f('x', 'X', 'tea', false, { conflicts_with: [{ key: 'eggless', label: 'Eggless' }] })];
    expect(suggestFlavours(asObjects, { mood: 'different' }, { dietaryKeys: ['eggless'] })).toEqual([]);
  });
});

describe('the baker gets a thumb on the scale, not an argument', () => {
  it('breaks a tie toward their signature', () => {
    const a = f('a', 'A', 'chocolate', true);
    const b = f('b', 'B', 'chocolate', true, { isSignature: true });
    const [top] = suggestFlavours([a, b], { recipient: 'child', mood: 'safe' });
    expect(top.flavour.id).toBe('b');
  });

  it('cannot overturn a rule that argues the other way', () => {
    // A signature tea should still lose to a chocolate on a child's birthday: the baker's
    // preference is a tiebreak, and letting it win here would recommend badly on purpose.
    const tea  = f('t', 'Tea',  'tea',       false, { isSignature: true });
    const choc = f('c', 'Choc', 'chocolate', true);
    const [top] = suggestFlavours([tea, choc], { recipient: 'child', mood: 'safe' });
    expect(top.flavour.id).toBe('c');
  });
});

describe('the reason is the whole reason', () => {
  it('reports when the baker signature applied, since it is often the deciding margin', () => {
    const sig = f('s', 'S', 'classic', true, { isSignature: true });
    const [top] = suggestFlavours([sig], { mood: 'safe' });
    expect(top.signature).toBe(true);
  });

  it('does not claim a signature that is not one', () => {
    const [top] = suggestFlavours([f('p', 'P', 'classic', true)], { mood: 'safe' });
    expect(top.signature).toBe(false);
  });
});

describe('fallback', () => {
  it('prefers the signature, and says that is what it is', () => {
    const list = [f('a', 'A', null, null), f('b', 'B', null, null, { isSignature: true })];
    expect(fallback(list).flavour.id).toBe('b');
    expect(fallback(list).because).toMatch(/known for/i);
  });

  it('falls to a crowd-pleaser next', () => {
    const list = [f('a', 'A', null, null), f('b', 'B', 'classic', true)];
    expect(fallback(list).flavour.id).toBe('b');
  });

  it('is null when the dietary filter leaves nothing — never an invented suggestion', () => {
    const list = [f('a', 'A', 'indian', false, { conflicts_with: ['eggless'] })];
    expect(fallback(list, ['eggless'])).toBeNull();
  });
});
