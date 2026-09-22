import { describe, it, expect } from 'vitest';
import { showStartChoice, tourMayRun } from './CakeDesigner.jsx';

/* WHY THIS EXISTS. Two surfaces want a customer's first visit — the start chooser (template vs
 * scratch) and DesignTour — and they must not both fire. vitest runs environment:'node' here, with
 * no jsdom and no @testing-library, so a rule living inside React state is a rule nothing can check;
 * and the harness passes no Turnstile key or template list, so the designer's first minute cannot be
 * driven end to end either. These assertions are the only thing standing under the decision.
 *
 * ⚠️ The case that matters is the instruction itself — Sandeep: "they dont need to get tour if they
 * choose template." The tour opens with "Start with the cake", which is advice for somebody facing a
 * blank one. */

describe('showStartChoice', () => {
  it('greets a customer who has not chosen before', () => {
    expect(showStartChoice({ isCustomer: true, alreadyChosen: false })).toBe(true);
  });

  it('never greets a baker — they open this app every day', () => {
    expect(showStartChoice({ isCustomer: false, alreadyChosen: false })).toBe(false);
  });

  it('shows once: a returning customer is not asked again', () => {
    expect(showStartChoice({ isCustomer: true, alreadyChosen: true })).toBe(false);
  });

  it('treats an unreadable cookie jar as "already chosen" rather than asking twice', () => {
    // seenCookie() returns true when document.cookie throws — erring toward NOT interrupting.
    expect(showStartChoice({ isCustomer: true, alreadyChosen: true })).toBe(false);
  });
});

describe('tourMayRun', () => {
  /* ⚠️ THE INSTRUCTION, PINNED. A template means a cake already exists, so the tour's first step is
     wrong for them — and an uninvited tour on a later visit is what the chooser was added to trim. */
  it('does not run for a customer who took a template', () => {
    expect(tourMayRun({ isCustomer: true, tourSeen: null, choseScratch: false })).toBe(false);
  });

  it('runs for a customer who chose to start from scratch', () => {
    expect(tourMayRun({ isCustomer: true, tourSeen: null, choseScratch: true })).toBe(true);
  });

  it('does not run for a customer who has not chosen yet — the chooser is still on screen', () => {
    expect(tourMayRun({ isCustomer: true, tourSeen: false, choseScratch: false })).toBe(false);
  });

  /* A baker's memory is a column (baker_appusers.tour_seen_at), read from /me — never the cookie,
     so a browser cannot override a fact the server holds. The chooser never shows them. */
  it('runs uninvited for a baker who has never seen it', () => {
    expect(tourMayRun({ isCustomer: false, tourSeen: false, choseScratch: false })).toBe(true);
  });

  it('does not run again for a baker who has', () => {
    expect(tourMayRun({ isCustomer: false, tourSeen: true, choseScratch: false })).toBe(false);
  });

  it('stays quiet for a baker while /me is still in flight (tourSeen null)', () => {
    expect(tourMayRun({ isCustomer: false, tourSeen: null, choseScratch: false })).toBe(false);
  });
});
