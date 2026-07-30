import { describe, it, expect } from 'vitest';
import { lapsedGateState, LAPSED_GATE_COPY } from './lapsedGate.js';

// Regression guard for a real bug: every lapsed baker used to be told "Your trial has ended",
// so someone who had paid us and whose renewal failed was told their trial was over and pushed
// at the free plan. These assert the three stories stay distinct — and, most importantly, that
// nobody who has PAID is ever shown trial copy again.

describe('lapsedGateState', () => {
  it('never paid → trial', () => {
    expect(lapsedGateState({ has_paid_before: false, subscription_cancellation_reason: null })).toBe('trial');
  });

  it('paid, no cancellation reason → failed renewal', () => {
    expect(lapsedGateState({ has_paid_before: true, subscription_cancellation_reason: null })).toBe('failed');
  });

  it('paid, cancellation reason present → deliberately ended', () => {
    expect(lapsedGateState({ has_paid_before: true, subscription_cancellation_reason: 'admin_external' })).toBe('ended');
  });

  it('a cancel reason WITHOUT a payment is still trial — never claim a payment we have no record of', () => {
    expect(lapsedGateState({ has_paid_before: false, subscription_cancellation_reason: 'baker' })).toBe('trial');
  });

  it('defaults to trial when the profile is missing or empty (safe: claims nothing about payment)', () => {
    expect(lapsedGateState(null)).toBe('trial');
    expect(lapsedGateState(undefined)).toBe('trial');
    expect(lapsedGateState({})).toBe('trial');
  });

  // THE regression: a paying baker must never see trial wording, whatever else is set.
  it('a baker who has paid is NEVER shown trial copy', () => {
    for (const reason of [null, undefined, 'baker', 'admin_external', 'completed']) {
      const state = lapsedGateState({ has_paid_before: true, subscription_cancellation_reason: reason });
      expect(state).not.toBe('trial');
      expect(LAPSED_GATE_COPY[state].title).not.toMatch(/trial/i);
    }
  });
});

describe('LAPSED_GATE_COPY', () => {
  it('covers every state lapsedGateState can return', () => {
    const states = [
      lapsedGateState({}),
      lapsedGateState({ has_paid_before: true }),
      lapsedGateState({ has_paid_before: true, subscription_cancellation_reason: 'baker' }),
    ];
    for (const s of new Set(states)) {
      expect(LAPSED_GATE_COPY[s]).toBeDefined();
      expect(typeof LAPSED_GATE_COPY[s].title).toBe('string');
      expect(typeof LAPSED_GATE_COPY[s].body).toBe('function');
    }
  });

  it('interpolates the plan name into the paid-lapse copy', () => {
    expect(LAPSED_GATE_COPY.ended.body('Blaze')).toContain('Blaze');
    expect(LAPSED_GATE_COPY.failed.body('Blaze')).toContain('Blaze');
  });

  // No amounts anywhere: Checkout is the only surface that knows the real figure.
  it('states no monetary amount', () => {
    for (const [, copy] of Object.entries(LAPSED_GATE_COPY)) {
      const text = `${copy.title} ${copy.body('Blaze')}`;
      expect(text).not.toMatch(/₹|\brs\.?\b|\d+\s*(\/|per )?(mo|month|year)/i);
    }
  });

  // Pictographic emoji are banned in UI text (INVARIANTS #7) — copy included.
  it('contains no pictographic emoji', () => {
    for (const [, copy] of Object.entries(LAPSED_GATE_COPY)) {
      const text = `${copy.title} ${copy.body('Blaze')}`;
      expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
    }
  });
});
