import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  emptyDraft, isFilled, emptyFacets, canSubmit, toOrderPayload,
  saveDraft, loadDraft, clearDraft, today, FACETS, withTierCount, splitName, STORAGE_VERSION,
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
  it('refuses when nothing has been said about the cake', () => {
    const d = emptyDraft('bakery');
    d.contact.name = 'Ananya';
    d.contact.phone = '9876543210';
    expect(canSubmit(d)).toBe(false);
  });

  // Neither a name NOR a contact gates this button. Both are asked on the verification screen
  // between it and the send — together, because "who are you and how do we reach you" is one
  // question. Gating here made Send dead for a reason two screens away: somebody who had picked a
  // flavour saw a disabled button and nothing on screen that could fix it.
  it('accepts one facet with no name and no contact — the next screen asks for both', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    expect(d.contact.name).toBe('');
    expect(d.contact.phone).toBe('');
    expect(canSubmit(d)).toBe(true);
  });

  // The whole point: filling more gets a better quote, it is never the price of being heard.
  it('accepts a single facet — completeness is not required', () => {
    const d = emptyDraft('bakery');
    d.flavours[0].name = 'Chocolate';
    expect(canSubmit(d)).toBe(true);
    expect(emptyFacets(d)).toEqual(['design', 'size', 'date']);
  });

  it('accepts any ONE of the four, not just the flavour', () => {
    for (const fill of [
      d => { d.design.photos = [{ id: 'p', name: 'a.jpg' }]; },
      d => { d.size.weightKg = 2; },
      d => { d.details.deliveryDate = '2026-09-01'; },
    ]) {
      const d = emptyDraft('bakery');
      fill(d);
      expect(canSubmit(d)).toBe(true);
    }
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
    d.details.recipient = 'Ananya';
    d.details.message = 'Happy Birthday Ananya';
    d.size.servings = 20;
    const text = toOrderPayload(d).specialInstructions;
    expect(text).toContain('Occasion: First birthday');
    expect(text).toContain('For: Ananya');
    expect(text).toContain('Message on the cake: Happy Birthday Ananya');
    // The stored figure is the TOP of the band the customer picked, so the baker reads a number
    // that guarantees enough cake rather than a midpoint nobody chose.
    expect(text).toContain('Feeds up to 20');
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

describe('reference photos', () => {
  it('counts the design facet as filled on a photo alone, with no kind', () => {
    // Somebody who attached three pictures and nothing else has said something real about the cake.
    const d = emptyDraft('bakery');
    d.design.photos = [{ id: 'p1', name: 'cake.jpg' }];
    expect(isFilled(d, 'design')).toBe(true);
  });

  it('is not filled by an empty photo list', () => {
    expect(isFilled(emptyDraft('bakery'), 'design')).toBe(false);
  });

  it('takes referenceKeys from the CALLER, not the draft — they do not exist until upload', () => {
    const d = emptyDraft('bakery');
    d.contact.name = 'Ananya';
    d.design.photos = [{ id: 'p1', name: 'a.jpg' }];   // ids, never keys
    const out = toOrderPayload(d, 'bakery', { referenceKeys: ['orders/reference/abc.webp'] });
    expect(out.referenceKeys).toEqual(['orders/reference/abc.webp']);
  });

  it('never leaks a local photo id into the order', () => {
    const d = emptyDraft('bakery');
    d.design.photos = [{ id: 'local-uuid', name: 'a.jpg' }];
    const out = toOrderPayload(d, 'bakery', { referenceKeys: [] });
    expect(JSON.stringify(out)).not.toContain('local-uuid');
  });

  it('omits referenceKeys entirely when nothing uploaded', () => {
    const out = toOrderPayload(emptyDraft('bakery'), 'bakery', { referenceKeys: [] });
    expect('referenceKeys' in out).toBe(false);
  });

  it('survives a draft round-trip — photos are ids, so localStorage can hold them', () => {
    const d = emptyDraft('bakery');
    d.design.photos = [{ id: 'p1', name: 'a.jpg' }, { id: 'p2', name: 'b.jpg' }];
    saveDraft(d);
    expect(loadDraft('bakery').design.photos).toEqual(d.design.photos);
  });
});

// ── The signals (migration 043) ─────────────────────────────────────────────────────────────────
// The rule these pin: STRUCTURE what we aggregate, PROSE what the baker reads — and for occasion,
// recipient and the cake number, BOTH. Prose alone is what made these unrecoverable before; prose
// removed would take the baker's one place to read.
describe('order signals', () => {
  const filled = () => {
    const d = emptyDraft('bakery');
    Object.assign(d.details, {
      occasion: 'birthday', recipient: 'child', celebration: 'first_birthday',
      cakeNumber: '1', message: 'Happy Birthday Aarav',
    });
    return d;
  };

  it('sends them as fields, not only as a sentence', () => {
    const out = toOrderPayload(filled(), 'bakery');
    expect(out.occasion).toBe('birthday');
    expect(out.recipient).toBe('child');
    expect(out.celebration).toBe('first_birthday');
    expect(out.cakeNumber).toBe(1);
  });

  it('STILL renders them in the instructions — the baker reads one place', () => {
    const out = toOrderPayload(filled(), 'bakery');
    expect(out.specialInstructions).toContain('Occasion: Birthday');
    expect(out.specialInstructions).toContain('For: a child');
    expect(out.specialInstructions).toContain('Number on the cake: 1');
  });

  it('sends cakeNumber as a NUMBER, never a string or NaN', () => {
    const d = filled(); d.details.cakeNumber = '50';
    expect(toOrderPayload(d, 'bakery').cakeNumber).toBe(50);

    const junk = filled(); junk.details.cakeNumber = 'abc';
    // undefined, not NaN — NaN would fail the API validator with a message about a field the
    // customer never saw, and JSON.stringify turns it into null anyway.
    expect(toOrderPayload(junk, 'bakery').cakeNumber).toBeUndefined();
  });

  it('omits every signal that was not answered rather than sending empty strings', () => {
    const out = toOrderPayload(emptyDraft('bakery'), 'bakery');
    for (const k of ['occasion', 'recipient', 'celebration', 'cakeNumber']) {
      expect(out[k]).toBeUndefined();
    }
  });

  it('keeps the cake number out of the age band — they are different questions', () => {
    // 25 on an anniversary cake is years married. The payload must not conflate them.
    const d = emptyDraft('bakery');
    Object.assign(d.details, { occasion: 'anniversary', cakeNumber: '25' });
    const out = toOrderPayload(d, 'bakery');
    expect(out.cakeNumber).toBe(25);
    expect(out.celebration).toBeUndefined();
  });
});

// ── A stale draft must never crash the storefront ───────────────────────────────────────────────
// This shipped: `forWhom` became `recipient` without a STORAGE_VERSION bump, so a draft saved the
// day before passed the version check, the shallow merge replaced `details` wholesale, and
// `d.recipient.trim()` threw on SUBMIT — after the customer had filled everything in and pressed
// the one button that mattered.
describe('a draft from an older version of the app', () => {
  const writeStale = (slug, details) => localStorage.setItem(
    `spattoo.cakeDraft.${slug}`,
    JSON.stringify({ v: 1, savedAt: Date.now(), bakerSlug: slug,
                     details, flavours: [], size: {}, contact: {}, design: {} }),
  );

  it('is discarded, not half-restored', () => {
    // The exact shape that broke: the OLD field name, and none of the new ones.
    writeStale('bakery', { occasion: 'birthday', forWhom: 'child', message: 'Hi' });
    const d = loadDraft('bakery');
    expect(d.details.recipient).toBe('');       // present and safe, not undefined
    expect(d.details.occasion).toBe('');        // v1 discarded wholesale
  });

  it('survives submit even if a shape change is ever missed again', () => {
    // Same-version draft missing a field added later — what forgetting the bump looks like. The
    // per-key merge must fill it from `fresh` rather than leaving it undefined.
    localStorage.setItem('spattoo.cakeDraft.bakery', JSON.stringify({
      // The CURRENT version, read rather than hardcoded — this test asserts what happens when a
      // shape change is missed, and pinning a number here means it silently stops testing that the
      // first time somebody bumps it properly.
      v: STORAGE_VERSION, savedAt: Date.now(), bakerSlug: 'bakery',
      details: { occasion: 'birthday' },        // no recipient, no celebration, no message
      flavours: [{ tier: 0, name: 'Chocolate', flavourId: 'f1', source: 'global' }],
      size: {}, contact: { name: 'Ananya' }, design: {},
    }));
    const d = loadDraft('bakery');
    expect(d.details.recipient).toBe('');
    expect(d.details.message).toBe('');
    expect(d.details.occasion).toBe('birthday');   // what WAS saved still survives
    // The actual failure was here, not in the load.
    expect(() => toOrderPayload(d, 'bakery')).not.toThrow();
  });
});
