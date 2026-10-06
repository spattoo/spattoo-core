import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  eggQuestion, withEggChoice, eggChoiceOf, egglessOnlySentence, eggOnlySentence,
  EGG_KEY, EGGLESS_KEY,
} from './dietary.js';

/* ── Egg or eggless, asked ONCE ──────────────────────────────────────────────────────────────────
 *
 * Sandeep: "a customer who does not go through the design flow would not have an option to select
 * egg vs eggless… we will ask that in the storefront flow, but when the user comes to designer by
 * logging in, we should default to the selected option. any point of time, we should not ask the
 * same question twice. thats the whole point."
 *
 * Two surfaces now ask it — the storefront's flavour step (for the customer who sends an enquiry
 * and never opens the designer) and the order form (for the one who designs). The derivation lives
 * in dietary.js so they cannot drift into offering different choices, and the ANSWER travels on the
 * storefront draft, which OrderModal already seeds from.
 */

const rows = (offered) => [
  { key: EGG_KEY,     label: 'With egg', kind: 'diet',     offered: offered.includes(EGG_KEY) },
  { key: EGGLESS_KEY, label: 'Eggless',  kind: 'diet',     offered: offered.includes(EGGLESS_KEY) },
  { key: 'vegan',     label: 'Vegan',    kind: 'diet',     offered: true },
  { key: 'nut_free',  label: 'Nut-free', kind: 'allergen', offered: false },
];

describe('ask, or tell', () => {
  it('a kitchen doing both is asked, with the DB labels', () => {
    const q = eggQuestion(rows([EGG_KEY, EGGLESS_KEY]), { bakerName: 'Sweet Crumb' });
    expect(q.isAQuestion).toBe(true);
    expect(q.choices.map(c => c.label)).toEqual(['With egg', 'Eggless']);
    expect(q.statement).toBe('');
  });

  /* A question with one answer is not a question, and answering it on the customer's behalf would
     file an assertion they never made. The bakery's own row is stamped server-side instead. */
  it('an eggless-only kitchen is told, not asked', () => {
    const q = eggQuestion(rows([EGGLESS_KEY]), { bakerName: 'Sweet Crumb' });
    expect(q.isAQuestion).toBe(false);
    expect(q.statement).toBe('Sweet Crumb is fully eggless — every cake is made without egg.');
  });

  it('and so is an egg-only one', () => {
    expect(eggQuestion(rows([EGG_KEY]), { bakerName: 'Sweet Crumb' }).statement)
      .toBe('Sweet Crumb bakes with egg.');
  });

  it('a baker who switched both off is neither asked nor told', () => {
    const q = eggQuestion(rows([]));
    expect(q.choices).toEqual([]);
    expect(q.isAQuestion).toBe(false);
    expect(q.statement).toBe('');
  });

  /* The baker entering their own order is told "this bakery" — naming them their own name reads as
     a message about somebody else's shop. Same split as unguaranteedSentence. */
  it('names the bakery for a customer and not for the baker', () => {
    expect(egglessOnlySentence()).toMatch(/^This bakery /);
    expect(eggOnlySentence()).toBe('This bakery bakes with egg.');
  });

  /* ⚠️ It REPORTS a declaration, it does not certify a cake — the same ground as dietary.js's note
     on why there is no veg green dot here. */
  it('states rather than promises', () => {
    expect(egglessOnlySentence({ bakerName: 'Sweet Crumb' })).not.toMatch(/guarantee|certified|100%/i);
  });

  it('ignores an un-offered allergen, which is never hidden but is not an egg choice', () => {
    expect(eggQuestion(rows([EGG_KEY, EGGLESS_KEY])).choices.map(c => c.key))
      .toEqual([EGG_KEY, EGGLESS_KEY]);
  });

  it('survives no vocabulary at all — the fail-soft both surfaces rely on', () => {
    for (const bad of [null, undefined, []]) {
      expect(eggQuestion(bad).isAQuestion).toBe(false);
      expect(eggQuestion(bad).statement).toBe('');
    }
  });
});

describe('one side replaces the other', () => {
  it('never leaves both standing — the API refuses that pair outright', () => {
    expect(withEggChoice([], EGGLESS_KEY)).toEqual([EGGLESS_KEY]);
    expect(withEggChoice([EGGLESS_KEY], EGG_KEY)).toEqual([EGG_KEY]);
    expect(eggChoiceOf(withEggChoice([EGG_KEY], EGGLESS_KEY))).toBe(EGGLESS_KEY);
  });

  it('leaves every other requirement alone', () => {
    expect(withEggChoice(['nut_free', 'vegan', EGG_KEY], EGGLESS_KEY))
      .toEqual(['nut_free', 'vegan', EGGLESS_KEY]);
  });

  it('takes a missing set without throwing', () => {
    expect(withEggChoice(undefined, EGG_KEY)).toEqual([EGG_KEY]);
  });
});

/* ⚠️ COMMENTS STRIPPED BEFORE ANY `not.toMatch`. Several checks in this project have passed while
   the thing they forbade sat in the file, because the explanatory comment above the assertion
   contained the phrase being searched for. */
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('neither surface keeps its own copy of the rule', () => {
  it('the order form derives it rather than filtering the vocabulary itself', () => {
    const modal = code('./OrderModal.jsx');
    expect(modal).toMatch(/eggQuestion\(dietaryOptions\)/);
    expect(modal).toMatch(/withEggChoice\(ks, key\)/);
    expect(modal).not.toMatch(/'This bakery is fully eggless/);
    expect(modal).not.toMatch(/'This bakery bakes with egg/);
  });

  it('the storefront flavour step derives it too, with the baker named', () => {
    const facet = code('../storefront/facets/FlavourFacet.jsx');
    expect(facet).toMatch(/eggQuestion\(dietOptions, \{ bakerName \}\)/);
    expect(facet).toMatch(/withEggChoice\(draft\.details\.dietaryKeys, key\)/);
    expect(facet).not.toMatch(/fully eggless/);
  });
});

describe('asked once, then carried', () => {
  /* The storefront asks it from the SAME public endpoint the order form uses, so the two can never
     offer different choices — and a flag on the storefront payload would have been a second,
     narrower copy of what that endpoint already says. */
  it('the storefront fetches the annotated vocabulary', () => {
    expect(code('../storefront/CustomerStorefront.jsx'))
      .toMatch(/fetchDietaryRequirements:\s*\(\)\s*=>[\s\S]{0,160}dietary-requirements\?bakerSlug=/);
  });

  /* ⚠️ THE CARRY. The answer goes on the shared draft; OrderModal seeds `dietaryKeys` from that
     same draft at mount, in customer mode only. Break either end and the customer is asked twice —
     which is the one thing this feature exists to prevent, and it would look like nothing at all. */
  it('the answer is written to the draft the order form seeds from', () => {
    expect(code('../storefront/facets/FlavourFacet.jsx'))
      .toMatch(/patch\(\{ details: \{ dietaryKeys:/);
    const modal = code('./OrderModal.jsx');
    expect(modal).toMatch(/mode === 'customer' && bakerSlug \? loadDraft\(bakerSlug, tierCount\)/);
    expect(modal).toMatch(/useState\(sd\.dietaryKeys \?\? \[\]\)/);
  });

  /* ⚠️ ABOVE THE DOORS, not inside one of them. A customer who takes "I know my flavour" and one
     who takes "help me pick" must both have been asked — and it belongs before the flavour it
     constrains, which is why the order form puts it above flavour too. */
  it('is asked before either door is chosen', () => {
    const facet = read('../storefront/facets/FlavourFacet.jsx');
    const door  = facet.indexOf("if (door !== 'browse')");
    const row   = facet.indexOf('{eggRow}');
    expect(door).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(door);
    expect(row).toBeLessThan(facet.indexOf('I know my flavour'));
  });
});
