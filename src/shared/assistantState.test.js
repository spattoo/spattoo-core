import { describe, it, expect } from 'vitest';
import { assistantState, ASSISTANT, ASSISTANT_STATES, THINKING_LONG_MS } from './assistantState.js';

/* ⚠️ A CHARACTER IS THE REASON THIS IS TESTED. Appu will bind an expression to each of these, and
 * a state that is unreachable or wrongly chosen is a character frozen on the wrong face — which
 * nobody would debug by reading a panel's JSX. */

describe('what the assistant is doing', () => {
  it('is idle when nothing has happened', () => {
    expect(assistantState()).toBe(ASSISTANT.IDLE);
    expect(assistantState({ phase: 'idle' })).toBe(ASSISTANT.IDLE);
  });

  it('listens while typing, but only before anything is asked', () => {
    expect(assistantState({ phase: 'idle', typing: true })).toBe(ASSISTANT.LISTENING);
    /* Mid-conversation the previous answer is still the subject. */
    expect(assistantState({ phase: 'answered', typing: true, sections: [{}] })).toBe(ASSISTANT.ANSWERED);
  });

  it('thinks, and then thinks visibly', () => {
    expect(assistantState({ phase: 'asking' })).toBe(ASSISTANT.THINKING);
    expect(assistantState({ phase: 'asking', longWait: true })).toBe(ASSISTANT.THINKING_LONG);
  });

  it('tells an empty answer apart from a failure', () => {
    /* Different news and different faces: "we have nothing written" is not "it broke". */
    expect(assistantState({ phase: 'answered', sections: [] })).toBe(ASSISTANT.EMPTY);
    expect(assistantState({ phase: 'error' })).toBe(ASSISTANT.FAILED);
  });

  it('answers when there are sections', () => {
    expect(assistantState({ phase: 'answered', sections: [{}, {}] })).toBe(ASSISTANT.ANSWERED);
  });

  it('escalation outranks both answered and empty', () => {
    expect(assistantState({ phase: 'answered', sections: [], escalated: true })).toBe(ASSISTANT.ESCALATED);
    expect(assistantState({ phase: 'answered', sections: [{}], escalated: true })).toBe(ASSISTANT.ESCALATED);
  });

  it('every named state is reachable', () => {
    /* An expression set is built from ASSISTANT_STATES; one that can never be reached is dead art,
       and one that is reachable but missing from the set is a frozen character. */
    const reached = new Set([
      assistantState(),
      assistantState({ typing: true }),
      assistantState({ phase: 'asking' }),
      assistantState({ phase: 'asking', longWait: true }),
      assistantState({ phase: 'answered', sections: [{}] }),
      assistantState({ phase: 'answered', sections: [] }),
      assistantState({ phase: 'error' }),
      assistantState({ phase: 'answered', escalated: true }),
    ]);
    expect([...reached].sort()).toEqual([...ASSISTANT_STATES].sort());
  });

  it('the long-wait threshold is under the measured median search', () => {
    /* 2.3s median, measured 2026-10-27. A threshold above it would never fire. */
    expect(THINKING_LONG_MS).toBeLessThan(2300);
    expect(THINKING_LONG_MS).toBeGreaterThan(400);   // not so eager it fires on every fast answer
  });
});
