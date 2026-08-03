import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  emptyDraft, isFilled, emptyFacets, canSubmit, toOrderPayload,
  saveDraft, loadDraft, clearDraft, today, FACETS, withTierCount, splitName,
} from './cakeDraft.js';

// The draft is the contract every facet writes through and the shape the baker's order is built
// from. These pin the parts that are easy to break silently — an order that arrives missing a
// field looks like a customer who did not answer, not like a bug.

const store = new Map();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  });
});

describe('facet completeness', () => {
  it('a fresh draft has nothing filled', () => {
    const d = emptyDraft('bakery');
    expect(FACETS.every(f => !isFilled(d, f))).toBe(true);
    expect(emptyFacets(d)).toEqual(FACETS);
  });

  it('a flavour of whitespace is not a flavour', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = '   ';
    expect(isFilled(d, 'flavour')).toBe(false);
  });

  it('one tier named is enough, on a multi-tier cake', () => {
    const d = emptyDraft('bakery', 3);
    expect(d.flavours).toHaveLength(3);
    d.flavours[2].name = 'Red Velvet';
    expect(isFilled(d, 'flavour')).toBe(true);
  });

  // 0 servings is a real answer to "how many people" only in the sense that it is wrong, but
  // `null` is the absence we test for — a `0 ||` check would call it empty.
  it('distinguishes an unanswered size from a zero', () => {
    const d = emptyDraft('bakery');
    d.size.servings = 0;
    expect(isFilled(d, 'size')).toBe(true);
  });
});

describe('withTierCount', () => {
  it('keeps answered tiers when growing', () => {
    let d = emptyDraft('bakery', 1);
    d.flavours[0].name = 'Chocolate';
    d = withTierCount(d, 3);
    expect(d.flavours).toHaveLength(3);
    expect(d.flavours[0].name).toBe('Chocolate');
    expect(d.flavours[2]).toEqual({ tier: 2, name: '', flavourId: null, source: null });
  });

  it('drops from the end when shrinking — a lost layer takes its flavour with it', () => {
    let d = emptyDraft('bakery', 3);
    d.flavours[0].name = 'Chocolate';
    d.flavours[2].name = 'Vanilla';
    d = withTierCount(d, 2);
    expect(d.flavours.map(f => f.name)).toEqual(['Chocolate', '']);
  });

  it('is a no-op at the same count, so it cannot churn a render', () => {
    const d = emptyDraft('bakery', 2);
    expect(withTierCount(d, 2)).toBe(d);
  });

  it('never goes below one tier', () => {
    expect(withTierCount(emptyDraft('bakery', 2), 0).flavours).toHaveLength(1);
  });
});

describe('canSubmit', () => {
  it('refuses with no way to reach them', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    expect(canSubmit(d)).toBe(false);
  });

  it('refuses a contact with nothing about the cake', () => {
    const d = emptyDraft('bakery');
    d.contact.name = 'Ananya';
    d.contact.phone = '9876543210';
    expect(canSubmit(d)).toBe(false);
  });

  // The whole point: filling more gets a better quote, it is never the price of being heard.
  it('refuses without a name — an order the baker cannot address is not an order', () => {
    const d = emptyDraft('bakery');
    d.contact.phone = '9876543210';
    d.flavours[0].name = 'Chocolate';
    expect(canSubmit(d)).toBe(false);
  });

  it('accepts one facet plus a named contact — completeness is not required', () => {
    const d = emptyDraft('bakery');
    d.contact.name = 'Ananya';
    d.contact.phone = '9876543210';
    d.flavours[0].name = 'Chocolate';
    expect(canSubmit(d)).toBe(true);
    expect(emptyFacets(d)).toEqual(['design', 'size', 'date']);
  });
});

describe('toOrderPayload', () => {
  it('omits dietaryRequirementKeys entirely when none were chosen', () => {
    // "None stated" is not the customer confirming the cake may contain anything, and an empty
    // array reads as exactly that to whoever consumes it next.
    const p = toOrderPayload(emptyDraft('bakery'));
    expect('dietaryRequirementKeys' in p).toBe(false);
  });

  it('sends dietary keys when there are some', () => {
    const d = emptyDraft('bakery');
    d.details.dietaryKeys = ['eggless'];
    expect(toOrderPayload(d).dietaryRequirementKeys).toEqual(['eggless']);
  });

  it('drops unnamed tiers but keeps the ones that were answered', () => {
    const d = emptyDraft('bakery', 3);
    d.flavours[0].name = 'Chocolate';
    d.flavours[2].name = 'Vanilla';
    expect(toOrderPayload(d).flavours.map(f => f.tier)).toEqual([0, 2]);
  });

  it('does not leak a facet\'s display data into the order', () => {
    // The flavour list carries sponge/filling colours so it can draw a slice. A door that spreads
    // a flavour object must not put those in front of a baker — found by running the shell and
    // reading the payload it produced.
    const d = emptyDraft('bakery');
    d.flavours[0] = { tier: 0, name: 'Matcha', flavourId: 'f3', source: 'global',
                      spongeColor: '#A9BE7B', fillingColor: '#CFE0B0' };
    expect(toOrderPayload(d).flavours[0]).toEqual(
      { tier: 0, name: 'Matcha', flavourId: 'f3', source: 'global' });
  });

  it('SENDS the customer — a storefront visitor has no session to be identified by', () => {
    // The opposite of OrderModal's customer mode, and deliberately: there a session establishes
    // identity server-side; here the visitor is anonymous, which is why POST /api/orders is public
    // and takes `customer` at all.
    const d = emptyDraft('bakery');
    d.contact = { name: 'Ananya Sharma', phone: '9876543210', email: 'a@b.c' };
    const p = toOrderPayload(d, 'bakery');
    expect(p.bakerSlug).toBe('bakery');
    expect(p.customer).toEqual({ firstName: 'Ananya', lastName: 'Sharma',
                                 phone: '9876543210', email: 'a@b.c' });
  });

  it('treats a single word as a first name with no surname', () => {
    // Which is correct for the many people who have one, and never a reason to reject a name.
    expect(splitName('Ananya')).toEqual({ firstName: 'Ananya', lastName: undefined });
    expect(splitName('  Ravi  Kumar  Nair ')).toEqual({ firstName: 'Ravi', lastName: 'Kumar Nair' });
  });

  it('a photo enquiry rides the manual-order shape', () => {
    const d = emptyDraft('bakery');
    d.design = { ...d.design, kind: 'photo', photoKeys: ['k1', 'k2'] };
    const p = toOrderPayload(d);
    expect(p.referenceKeys).toEqual(['k1', 'k2']);
    expect('designSnapshot' in p).toBe(false);
  });

  it('withholds an address unless it is actually being delivered', () => {
    const d = emptyDraft('bakery');
    d.details.deliveryAddress = '12 Rose Lane';
    expect(toOrderPayload(d).deliveryAddress).toBeUndefined();
    d.details.deliveryMode = 'home_delivery';
    expect(toOrderPayload(d).deliveryAddress).toBe('12 Rose Lane');
  });

  it('carries occasion, who it is for and the message into the instructions', () => {
    // These have no column on an order, and inventing three would be a schema change to carry
    // three sentences — but they are what makes a quote right first time.
    const d = emptyDraft('bakery');
    d.details.occasion = 'First birthday';
    d.details.forWhom = 'Ananya';
    d.details.message = 'Happy Birthday Ananya';
    d.size.servings = 20;
    const text = toOrderPayload(d).specialInstructions;
    expect(text).toContain('Occasion: First birthday');
    expect(text).toContain('For: Ananya');
    expect(text).toContain('Message on the cake: Happy Birthday Ananya');
    expect(text).toContain('Serves about 20');
  });

  it('sends no instructions rather than an empty string', () => {
    expect(toOrderPayload(emptyDraft('bakery')).specialInstructions).toBeUndefined();
  });
});

describe('persistence', () => {
  it('round-trips a draft', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    saveDraft(d);
    expect(loadDraft('bakery').flavours[0].name).toBe('Chocolate');
  });

  it('keeps drafts apart per baker — a cake is not a shopping basket', () => {
    const d = emptyDraft('bakery-a');
    d.flavours[0].name = 'Chocolate';
    saveDraft(d);
    expect(loadDraft('bakery-b').flavours[0].name).toBe('');
  });

  it('discards a draft from an older shape rather than migrating it', () => {
    store.set('spattoo.cakeDraft.bakery',
      JSON.stringify({ v: 0, savedAt: Date.now(), flavours: [{ tier: 0, name: 'Chocolate' }] }));
    expect(loadDraft('bakery').flavours[0].name).toBe('');
  });

  it('discards a draft older than the window', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    saveDraft(d);
    const stale = JSON.parse(store.get('spattoo.cakeDraft.bakery'));
    stale.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    store.set('spattoo.cakeDraft.bakery', JSON.stringify(stale));
    expect(loadDraft('bakery').flavours[0].name).toBe('');
  });

  it('clears a date that has since passed, and keeps everything else', () => {
    // A stale date is worse than none: it is a wrong answer the customer will not re-check,
    // because as far as they remember they already answered it.
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    d.details.deliveryDate = '2020-01-01';
    saveDraft(d);
    const back = loadDraft('bakery');
    expect(back.details.deliveryDate).toBe('');
    expect(back.flavours[0].name).toBe('Chocolate');
  });

  it('survives corrupt storage', () => {
    store.set('spattoo.cakeDraft.bakery', '{not json');
    expect(loadDraft('bakery').flavours[0].name).toBe('');
  });

  it('clears', () => {
    saveDraft(emptyDraft('bakery'));
    clearDraft('bakery');
    expect(store.has('spattoo.cakeDraft.bakery')).toBe(false);
  });
});

describe('today()', () => {
  it('is local, not UTC — an IST evening must not already be tomorrow', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    expect(today()).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });
});
