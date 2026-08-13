import { describe, it, expect } from 'vitest';
import {
  findFlavourConflicts, conflictSentence, conflictCallToAction, conflictBenchLine,
  visibleRequirements, unguaranteedRequirements, unguaranteedSentence,
} from './dietary.js';

// The rule these tests protect is not "does it find a match" — it is that the two
// LAYERS keep their separate voices. Flattening them is the failure mode that would
// either put a claim in a baker's mouth or water down an answer they already gave, and
// neither shows up as a crash.

const EGGLESS  = { key: 'eggless',  label: 'Eggless',  kind: 'diet' };
const NUT_FREE = { key: 'nut_free', label: 'Nut-free', kind: 'allergen' };

// The asymmetry below is a SAFETY rule, not a UI preference, and it is the kind of thing
// a later "let's make this consistent" refactor would quietly delete. These tests exist
// to make that deletion fail loudly.
describe('what a bakery deals in', () => {
  const opts = [
    { ...EGGLESS,  offered: true  },
    { key: 'vegan',    label: 'Vegan',    kind: 'diet',     offered: false },
    { ...NUT_FREE, offered: false },
  ];

  it('hides a diet option the bakery does not offer', () => {
    expect(visibleRequirements(opts).map(o => o.key)).not.toContain('vegan');
  });

  // The one that matters. An allergy does not go away because the baker stopped
  // offering it — hide the chip and it goes back into free text, or goes unsaid.
  it('NEVER hides an allergen, even when not offered', () => {
    expect(visibleRequirements(opts).map(o => o.key)).toContain('nut_free');
  });

  it('treats a missing `offered` as offered, so an older API keeps working', () => {
    expect(visibleRequirements([EGGLESS])).toHaveLength(1);
  });

  it('flags a ticked allergen the bakery cannot guarantee', () => {
    const out = unguaranteedRequirements(opts, ['nut_free']);
    expect(out.map(o => o.key)).toEqual(['nut_free']);
    expect(unguaranteedSentence(out[0], { bakerName: 'Sweet Crumb' }))
      .toBe("Sweet Crumb can't guarantee nut-free.");
  });

  it('says nothing about a requirement the customer did not tick', () => {
    expect(unguaranteedRequirements(opts, ['eggless'])).toEqual([]);
  });

  // "can't guarantee" is the honest verb: stronger than "doesn't offer" (a menu choice,
  // when this is safety) and weaker than "contains", which we have no basis to say.
  it('claims nothing about what is in the cake', () => {
    expect(unguaranteedSentence({ label: 'Nut-free' })).not.toMatch(/contains|ingredient/i);
  });
});

describe('findFlavourConflicts', () => {
  it('matches a tier flavour against a stated requirement', () => {
    const out = findFlavourConflicts({
      flavours:     [{ tier: 0, name: 'Hazelnut Praline', flavourId: 'f1' }],
      requirements: [NUT_FREE],
      declarations: { f1: [{ key: 'nut_free', declared_by: 'spattoo' }] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].flavourName).toBe('Hazelnut Praline');
    expect(out[0].declaredBy).toBe('spattoo');
  });

  it('says nothing when the requirement was not asked for', () => {
    expect(findFlavourConflicts({
      flavours:     [{ tier: 0, name: 'Hazelnut Praline', flavourId: 'f1' }],
      requirements: [EGGLESS],
      declarations: { f1: [{ key: 'nut_free', declared_by: 'spattoo' }] },
    })).toEqual([]);
  });

  // A hand-typed flavour has no id, so nothing can be declared about it. Warning anyway
  // would mean inventing an opinion we do not hold.
  it('cannot warn about a free-text flavour', () => {
    expect(findFlavourConflicts({
      flavours:     [{ tier: 0, name: 'Hazelnut Praline', flavourId: null }],
      requirements: [NUT_FREE],
      declarations: { f1: [{ key: 'nut_free', declared_by: 'spattoo' }] },
    })).toEqual([]);
  });

  it('reports every clashing tier, not just the first', () => {
    const out = findFlavourConflicts({
      flavours: [
        { tier: 0, name: 'Vanilla',  flavourId: 'f1' },
        { tier: 1, name: 'Tiramisu', flavourId: 'f2' },
      ],
      requirements: [EGGLESS],
      declarations: { f2: [{ key: 'eggless', declared_by: 'baker' }] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].tier).toBe(1);
  });
});

describe('the two voices', () => {
  const bakerSaid   = { flavourName: 'Tiramisu',         requirement: EGGLESS,  declaredBy: 'baker'   };
  const spattooSaid = { flavourName: 'Hazelnut Praline', requirement: NUT_FREE, declaredBy: 'spattoo' };

  it("quotes the baker when the baker is the one who said it", () => {
    expect(conflictSentence(bakerSaid, { bakerName: 'Sweet Crumb' }))
      .toBe("Sweet Crumb doesn't make Tiramisu eggless.");
  });

  // The important one: our global default must NEVER be attributed to a baker. They
  // never said it, and clearing it is precisely their right of reply.
  it('never attributes the global baseline to the baker', () => {
    const s = conflictSentence(spattooSaid, { bakerName: 'Sweet Crumb' });
    expect(s).toBe('Hazelnut Praline usually isn\'t nut-free.');
    expect(s).not.toContain('Sweet Crumb');
  });

  it('degrades without a baker name rather than printing an empty one', () => {
    expect(conflictSentence(bakerSaid)).toBe("Tiramisu isn't offered eggless.");
    expect(conflictCallToAction({})).toContain('the bakery');
  });

  // No sentence anywhere may claim what is or is not IN the cake — ToS §3.4.
  it('states nothing about ingredients', () => {
    for (const s of [conflictSentence(bakerSaid, { bakerName: 'X' }), conflictSentence(spattooSaid)]) {
      expect(s).not.toMatch(/contains|ingredient|made with/i);
    }
  });
});

describe('call to action', () => {
  it('tells the customer they are not being stopped', () => {
    expect(conflictCallToAction({ audience: 'customer', bakerName: 'Sweet Crumb' }))
      .toContain('you can still place this order');
  });

  // The baker IS the bakery — "check with Sweet Crumb" would be nonsense on their own
  // order form.
  it('does not tell a baker to check with themselves', () => {
    const s = conflictCallToAction({ audience: 'baker', bakerName: 'Sweet Crumb' });
    expect(s).not.toContain('Sweet Crumb');
  });
});

describe('bench line', () => {
  const c = { tier: 1, flavourName: 'Hazelnut Praline', requirement: NUT_FREE };

  it('leads with the requirement and names the tier on a multi-tier cake', () => {
    expect(conflictBenchLine(c, { tierCount: 3 }))
      .toBe('NUT-FREE REQUIRED — Tier 2 is Hazelnut Praline. Confirm with the customer before baking.');
  });

  // "Tier 1" on a single-tier cake is noise on a sheet whose job is to be skimmed.
  it('omits the tier when there is only one', () => {
    expect(conflictBenchLine({ ...c, tier: 0 }, { tierCount: 1 }))
      .toBe('NUT-FREE REQUIRED — The flavour is Hazelnut Praline. Confirm with the customer before baking.');
  });
});
