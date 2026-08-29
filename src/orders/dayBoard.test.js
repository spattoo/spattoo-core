import { describe, it, expect } from 'vitest';
import { eggState, tierShares, flavourWeights, batchTotals, stickyFor, formatKg } from './dayBoard.js';

// ── What a day adds up to ────────────────────────────────────────────────────────────────────────
// The numbers here are from real dev orders, because the one that matters — how a single weight is
// split across a tiered cake's flavours — is wrong by a third if you guess it.

const order = (o = {}) => ({
  id: o.id ?? 'o1',
  weight_kg: o.weight_kg ?? null,
  flavours: o.flavours ?? [],
  dietary_requirements: o.diet ? o.diet.map(key => ({ key })) : [],
  design_snapshot: o.tiers ? { tiers: o.tiers } : null,
  customers: o.customers ?? { first_name: 'Asha', last_name: 'R' },
});

// The real two-tier order from dev: r=1.0 and r=0.72, both 0.7 high, 2 kg, two flavours.
const TWO_TIER = {
  weight_kg: 2,
  flavours: [{ name: 'Litchi', tier: 0 }, { name: 'Blueberry', tier: 1 }],
  tiers: [{ shape: 'round', radius: 1, width: 2, depth: 2, height: 0.7 },
          { shape: 'round', radius: 0.72, width: 1.44, depth: 1.44, height: 0.7 }],
};

describe('eggState — three answers, and the third is real', () => {
  it('reads the two explicit answers', () => {
    expect(eggState(order({ diet: ['egg'] }))).toBe('egg');
    expect(eggState(order({ diet: ['eggless'] }))).toBe('eggless');
  });

  it('says NOT KNOWN when nobody was asked', () => {
    // Migration 078 deliberately did not backfill. Folding this into either answer is the worse bug
    // both ways: call it egg and an eggless customer gets the wrong cake; call it eggless and the
    // baker never learns there was a question.
    expect(eggState(order())).toBe('unknown');
    expect(eggState(order({ diet: ['nut_free'] }))).toBe('unknown');
  });

  it('counts vegan and Jain as eggless', () => {
    // The order form already enforces that a vegan cake cannot have egg. Disagreeing here would
    // park a vegan order in "not known" forever and have somebody chase an answer it already gave.
    expect(eggState(order({ diet: ['vegan'] }))).toBe('eggless');
    expect(eggState(order({ diet: ['jain'] }))).toBe('eggless');
    expect(eggState(order({ diet: ['vegan', 'nut_free'] }))).toBe('eggless');
  });

  it('takes dietary keys as bare strings too', () => {
    expect(eggState({ dietary_requirements: ['eggless'] })).toBe('eggless');
  });

  it('never throws on a half-formed order', () => {
    for (const bad of [null, undefined, {}, { dietary_requirements: null }]) {
      expect(EGG_STATES).toContain(eggState(bad));
    }
  });
});
const EGG_STATES = ['egg', 'eggless', 'unknown'];

describe('tierShares — weight follows volume, not tier count', () => {
  it('splits the real two-tier cake 66/34, not 50/50', () => {
    const [a, b] = tierShares(TWO_TIER.tiers);
    expect(a).toBeCloseTo(0.659, 2);
    expect(b).toBeCloseTo(0.341, 2);
    // The whole reason this is not an even split: it would be out by a third of the smaller tier.
    expect(Math.abs(a - 0.5)).toBeGreaterThan(0.15);
  });

  it('always sums to one', () => {
    for (const tiers of [TWO_TIER.tiers,
                         [{ shape: 'round', radius: 1, height: 1 }],
                         [{ shape: 'rect', width: 2.16, depth: 1.56, height: 0.7 },
                          { shape: 'rect', width: 1.4, depth: 1.0, height: 0.7 }]]) {
      expect(tierShares(tiers).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('falls back to an even split when there is no usable geometry', () => {
    expect(tierShares([{}, {}])).toEqual([0.5, 0.5]);
    expect(tierShares([])).toEqual([]);
  });

  it('measures a sheet by its footprint, not by a radius it does not have', () => {
    const [a, b] = tierShares([{ shape: 'rect', width: 4, depth: 2, height: 1 },
                               { shape: 'rect', width: 2, depth: 1, height: 1 }]);
    expect(a).toBeCloseTo(8 / 10, 10);
    expect(b).toBeCloseTo(2 / 10, 10);
  });
});

describe('flavourWeights', () => {
  it('gives a single-flavour cake its whole weight, exactly', () => {
    const w = flavourWeights(order({ weight_kg: 1.5, flavours: [{ name: 'Vanilla', tier: 0 }] }));
    expect(w).toEqual([{ flavour: 'Vanilla', kg: 1.5, estimated: false }]);
  });

  it('divides a tiered cake by volume', () => {
    const w = flavourWeights(order(TWO_TIER));
    expect(w[0]).toMatchObject({ flavour: 'Litchi', estimated: false });
    expect(w[0].kg).toBeCloseTo(1.32, 2);
    expect(w[1].kg).toBeCloseTo(0.68, 2);
    expect(w[0].kg + w[1].kg).toBeCloseTo(2, 10);   // nothing invented, nothing lost
  });

  it('marks a split it had to GUESS', () => {
    // A photo order has no design. An even split is the only thing available and it is not a
    // measurement — a batch figure is something somebody weighs flour against.
    const w = flavourWeights(order({ weight_kg: 2, flavours: [{ name: 'A', tier: 0 }, { name: 'B', tier: 1 }] }));
    expect(w.every(r => r.estimated)).toBe(true);
    expect(w[0].kg).toBeCloseTo(1, 10);
  });

  it('does not call a single flavour estimated, whatever the design says', () => {
    const w = flavourWeights(order({ weight_kg: 2, flavours: [{ name: 'Vanilla', tier: 0 }] }));
    expect(w[0].estimated).toBe(false);
  });

  it('carries a null weight through rather than inventing one', () => {
    const w = flavourWeights(order({ flavours: [{ name: 'Vanilla', tier: 0 }] }));
    expect(w[0].kg).toBeNull();
  });

  it('ignores blank flavour rows', () => {
    expect(flavourWeights(order({ weight_kg: 1, flavours: [{ name: '  ', tier: 0 }] }))).toEqual([]);
  });
});

describe('batchTotals — one row per thing that can share a bowl', () => {
  const day = [
    order({ id: 'a', weight_kg: 2, flavours: [{ name: 'Vanilla', tier: 0 }], diet: ['eggless'] }),
    order({ id: 'b', weight_kg: 1.5, flavours: [{ name: 'Vanilla', tier: 0 }], diet: ['eggless'] }),
    order({ id: 'c', weight_kg: 1, flavours: [{ name: 'Vanilla', tier: 0 }], diet: ['egg'] }),
    order({ id: 'd', weight_kg: 1, flavours: [{ name: 'Chocolate', tier: 0 }] }),
  ];

  it('adds the same flavour up ONLY within the same egg answer', () => {
    const rows = batchTotals(day);
    const vEggless = rows.find(r => r.flavour === 'Vanilla' && r.egg === 'eggless');
    const vEgg     = rows.find(r => r.flavour === 'Vanilla' && r.egg === 'egg');
    expect(vEggless).toMatchObject({ kg: 3.5, cakes: 2 });
    expect(vEgg).toMatchObject({ kg: 1, cakes: 1 });
    // The point of the whole feature: these two cannot share a bowl, so they are never one number.
    expect(rows.filter(r => r.flavour === 'Vanilla')).toHaveLength(2);
  });

  it('puts every "not known" after every answered row, however heavy', () => {
    // A question sorts by what it needs from a person, not by size — so a 99 kg unknown still goes
    // below a 1 kg answered row. Asserted as a partition rather than "the last row is X": the day
    // fixture already carries an unknown, and within that group the heaviest still leads.
    const rows = batchTotals([...day,
      order({ id: 'e', weight_kg: 99, flavours: [{ name: 'Zebra', tier: 0 }] })]);
    const firstUnknown = rows.findIndex(r => r.egg === 'unknown');
    expect(firstUnknown).toBeGreaterThan(0);
    expect(rows.slice(firstUnknown).every(r => r.egg === 'unknown')).toBe(true);
    expect(rows[firstUnknown]).toMatchObject({ flavour: 'Zebra' });   // heaviest of the unknowns
  });

  it('keeps all the eggless together, and leads with it', () => {
    // The stated reason for the whole grouping: "so they can bake all eggless together". In a
    // kitchen doing both, eggless goes first — once egg has been through the bowls, an eggless
    // order is not safely eggless without a clean-down. Interleaving these by weight would make
    // somebody pick five rows out of a list to find their morning's work.
    const rows = batchTotals([...day,
      order({ id: 'f', weight_kg: 0.4, flavours: [{ name: 'Coffee', tier: 0 }], diet: ['eggless'] })]);
    const seq = rows.map(r => r.egg);
    expect(seq).toEqual([...seq].sort((a, b) =>
      ({ eggless: 0, egg: 1, unknown: 2 })[a] - ({ eggless: 0, egg: 1, unknown: 2 })[b]));
    expect(seq[0]).toBe('eggless');
  });

  it('sorts heaviest first WITHIN a block', () => {
    const rows = batchTotals(day);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].egg === rows[i].egg) expect(rows[i - 1].kg ?? 0).toBeGreaterThanOrEqual(rows[i].kg ?? 0);
    }
  });

  it('keeps a weightless cake in the list rather than dropping it', () => {
    // Dropping it would make the board quietly disagree with the count on the calendar cell.
    const rows = batchTotals([order({ flavours: [{ name: 'Vanilla', tier: 0 }], diet: ['egg'] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cakes: 1, kg: null });
  });

  it('splits a tiered order across two batch rows', () => {
    const rows = batchTotals([order({ ...TWO_TIER, diet: ['eggless'] })]);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((a, r) => a + r.kg, 0)).toBeCloseTo(2, 10);
    expect(rows.every(r => r.cakes === 1)).toBe(true);
  });

  it('is empty for an empty day, and survives rubbish', () => {
    expect(batchTotals([])).toEqual([]);
    expect(batchTotals(null)).toEqual([]);
    expect(batchTotals([{}, null])).toEqual([]);
  });
});

describe('stickyFor — the four things worth a glance', () => {
  it('reads the customer name', () => {
    expect(stickyFor(order()).name).toBe('Asha R');
  });

  it('falls back rather than showing a blank card', () => {
    expect(stickyFor(order({ customers: { email: 'a@b.c' } })).name).toBe('a@b.c');
    expect(stickyFor(order({ customers: {} })).name).toBe('No name yet');
  });

  it('says a repeated flavour once', () => {
    const s = stickyFor(order({ flavours: [{ name: 'Vanilla', tier: 0 }, { name: 'Vanilla', tier: 1 }] }));
    expect(s.flavours).toEqual(['Vanilla']);
  });

  it('carries the egg answer, including not-known', () => {
    expect(stickyFor(order({ diet: ['egg'] })).egg).toBe('egg');
    expect(stickyFor(order()).egg).toBe('unknown');
  });
});

describe('formatKg', () => {
  it('drops a trailing zero', () => {
    expect(formatKg(3)).toBe('3 kg');
    expect(formatKg(3.5)).toBe('3.5 kg');
    expect(formatKg(2.75)).toBe('2.8 kg');
  });

  it('is null for no weight, so a caller cannot print "null kg"', () => {
    expect(formatKg(null)).toBeNull();
  });

  it('rounds once, at the end', () => {
    // Six 0.45 kg cakes are 2.7, not 3.0. Rounding each on the way in is how that goes wrong, so
    // the total is built from raw numbers and formatted only here.
    const rows = batchTotals(Array.from({ length: 6 }, (_, i) =>
      order({ id: `x${i}`, weight_kg: 0.45, flavours: [{ name: 'V', tier: 0 }], diet: ['egg'] })));
    expect(formatKg(rows[0].kg)).toBe('2.7 kg');
  });
});
