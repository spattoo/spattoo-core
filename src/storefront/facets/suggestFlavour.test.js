import { describe, it, expect } from 'vitest';
import { suggestFlavours, fallback, seasonFor, RULES } from './suggestFlavour.js';

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
  it('prefers the signature, and says what it actually is — the baker\'s own pick', () => {
    const list = [f('a', 'A', null, null), f('b', 'B', null, null, { isSignature: true })];
    expect(fallback(list).flavour.id).toBe('b');
    // NOT "known for" — that claims something about reality only order history could support.
    expect(fallback(list).because).toMatch(/picks out itself/i);
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

describe('the signals added in phase 2', () => {
  const CAT = [
    f('choc',   'Chocolate',   'chocolate', true),
    f('van',    'Vanilla',     'classic',   true),
    f('straw',  'Strawberry',  'fruit',     true),
    f('mocha',  'Mocha',       'coffee',    false),
    f('pist',   'Pistachio',   'nut',       false),
    f('butter', 'Butterscotch','caramel',   true),
    f('rasm',   'Rasmalai',    'indian',    false),
  ];

  it('keeps a first birthday mild, and away from coffee and nuts', () => {
    const [top] = suggestFlavours(CAT, { ageBand: 'first_birthday', mood: 'safe' });
    expect(['classic', 'fruit']).toContain(top.flavour.tasteFamily);
    const order = suggestFlavours(CAT, { ageBand: 'first_birthday', mood: 'safe' }).map(r => r.flavour.id);
    // Ranked BELOW the mild ones rather than removed — an avoid is a score, only dietary removes.
    for (const id of ['mocha', 'pist']) {
      if (order.includes(id)) expect(order.indexOf(id)).toBeGreaterThan(order.indexOf(top.flavour.id));
    }
  });

  it('reads the reason from the rule that won, for a first birthday', () => {
    const [top] = suggestFlavours(CAT, { ageBand: 'first_birthday', mood: 'safe' });
    expect(top.because).toMatch(/first cake they have ever tasted/i);
  });

  it('sends an office cake somewhere safe', () => {
    const [top] = suggestFlavours(CAT, { occasion: 'corporate', mood: 'safe' });
    expect(['classic', 'chocolate']).toContain(top.flavour.tasteFamily);
  });

  it('leans fruity in summer and rich in winter, from the same answers', () => {
    const summer = suggestFlavours(CAT, { season: 'summer' }).map(r => r.flavour.id);
    const winter = suggestFlavours(CAT, { season: 'winter' }).map(r => r.flavour.id);
    expect(summer[0]).toBe('straw');
    expect(['choc', 'butter', 'pist']).toContain(winter[0]);
  });

  it('season is a NUDGE — it cannot overturn a rule that argues the other way', () => {
    // A child in summer still gets chocolate: kids-chocolate is weight 3, summer-fresh is 1.
    const [top] = suggestFlavours(CAT, { recipient: 'child', season: 'summer', mood: 'safe' });
    expect(top.flavour.tasteFamily).toBe('chocolate');
  });

  it('scores nothing on a monsoon delivery rather than inventing a preference', () => {
    // No rule keys on monsoon, deliberately — nothing about rain changes a flavour.
    const withSeason = suggestFlavours(CAT, { recipient: 'child', season: 'monsoon', mood: 'safe' });
    const without    = suggestFlavours(CAT, { recipient: 'child', mood: 'safe' });
    expect(withSeason.map(r => r.flavour.id)).toEqual(without.map(r => r.flavour.id));
  });
});

describe('seasonFor', () => {
  it('maps the Indian calendar as documented', () => {
    expect([3, 4, 5, 6].map(seasonFor)).toEqual(['summer', 'summer', 'summer', 'summer']);
    expect([7, 8, 9].map(seasonFor)).toEqual(['monsoon', 'monsoon', 'monsoon']);
    expect([10, 11, 12, 1, 2].map(seasonFor)).toEqual(['winter', 'winter', 'winter', 'winter', 'winter']);
  });
});
