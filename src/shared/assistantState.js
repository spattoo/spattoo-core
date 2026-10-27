/* ── What the assistant is doing, as a named state ───────────────────────────────────────────────
 *
 * Sandeep: *"keep this flexible, becuase we ill introduce Appu. so appu will have proper
 * animations / expressions to deal the questions.. like scraching the head while search is taking
 * long."*
 *
 * ⚠️ THAT REQUIREMENT IS WHY THIS FILE EXISTS RATHER THAN A FEW BOOLEANS IN THE PANEL. A character
 * cannot animate `state === 'asking' && sections.length === 0 && !error`. It needs a small, closed
 * set of moments it can hold an expression for — and the set has to live outside the panel, or
 * every new expression means editing the panel that is already doing something else.
 *
 * The panel owns WHAT IT SHOWS. This owns WHAT IS HAPPENING. A character, a sound, a tooltip or
 * nothing at all can subscribe; none of them change the panel.
 *
 * ⚠️ THINKING_LONG IS A REAL STATE, NOT A FLOURISH. Measured 2026-10-27: a search takes 1.5–3
 * seconds, median 2.3 — of which 1.1–1.7s is the server downloading 6.5MB of vectors to score them
 * in JavaScript. That is long enough to need its own moment on screen, and it is also a bug worth
 * fixing; when the pgvector RPC lands, the threshold below stops being reached and the state
 * quietly stops firing rather than needing to be removed.
 */

export const ASSISTANT = Object.freeze({
  /** Open, nothing asked yet. */
  IDLE: 'idle',
  /** The baker is typing. */
  LISTENING: 'listening',
  /** A question is in flight. */
  THINKING: 'thinking',
  /** Still in flight past THINKING_LONG_MS — the head-scratch. */
  THINKING_LONG: 'thinking_long',
  /** Sections came back. */
  ANSWERED: 'answered',
  /** Nothing cleared the answer floor. Not an error: we looked and we have nothing. */
  EMPTY: 'empty',
  /** We did not look. The question is not one this assistant answers — see helpScope.js.
   *  ⚠️ A SEPARATE STATE FROM EMPTY, because they are opposite admissions and want opposite
   *  faces: empty is "I have nothing written about that" (apologetic, go on and rephrase), and
   *  this is "I do not answer that" (polite, settled, do not rephrase). */
  DECLINED: 'declined',
  /** The request itself failed. Ours, not theirs. */
  FAILED: 'failed',
  /** Handed to a person; a reply is coming by email. */
  ESCALATED: 'escalated',
});

/** How long before a wait becomes a visible one. */
export const THINKING_LONG_MS = 1200;

/**
 * Every state, in the order a conversation moves through them. Exported so a character can be
 * checked for complete coverage — an expression set that silently lacks one is a character that
 * freezes at the worst moment.
 */
export const ASSISTANT_STATES = Object.freeze(Object.values(ASSISTANT));

/**
 * What the assistant is doing, from what the panel knows.
 *
 * Pure, so a character's expressions can be exercised without a panel, a network or a baker — the
 * same reason helpRank.js is pure.
 */
export function assistantState({ phase = 'idle', typing = false, sections = [], longWait = false, escalated = false, declined = false } = {}) {
  if (phase === 'asking') return longWait ? ASSISTANT.THINKING_LONG : ASSISTANT.THINKING;
  if (phase === 'error')  return ASSISTANT.FAILED;
  if (phase === 'answered') {
    /* ⚠️ ESCALATED OUTRANKS BOTH ANSWERED AND EMPTY. Once a person has been asked, that is the
       thing the baker is waiting on — a character still shrugging at an empty result would be
       reacting to news that has been superseded. */
    if (escalated) return ASSISTANT.ESCALATED;
    if (declined) return ASSISTANT.DECLINED;
    return sections.length ? ASSISTANT.ANSWERED : ASSISTANT.EMPTY;
  }
  /* Typing only reads as LISTENING before anything has been asked. Mid-conversation the previous
     answer is still the subject, and a character that drops its expression the moment a key is
     pressed reads as having lost interest. */
  return typing ? ASSISTANT.LISTENING : ASSISTANT.IDLE;
}
