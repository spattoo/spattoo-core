// ── The steps of the generation wizard ───────────────────────────────────────────────────────────
//
// Sandeep: *"lets make it like a wizard pls. want user to focus at each on how exactly it should
// shape up. if all at one place, easy to skip details. basically i want to save baker's credits as
// much as possible and get their desired outout in single or fewer attempts."*
//
// So this is not a layout preference. One screen let a baker answer the first box, see a Generate
// button, and press it — which is how 20 credits bought a bear when the subject box still held
// somebody else's example text. A step at a time costs the attentive baker a few taps and saves the
// hurried one a run.
//
// ── THE STEPS ARE DERIVED, NEVER LISTED ─────────────────────────────────────────────────────────
// The questions come from the API (`/decoration-prompt-questions`, authored in Admin → Elements →
// Generation Questions), so this file must not know how many there are or what they ask. Add a
// question in admin and a step appears; retire one and a step goes. A hardcoded `['subject',
// 'material', 'look', 'review']` would put the step count in code and the questions in the
// database, which is the drift `check:prompt-vocab` already exists to prevent one file down.
//
// Pure data in, pure data out — no React, no fetch — because the step order is the part worth
// testing and a component is the part worth looking at.

/** A step the wizard can show. `kind` decides which editor renders; `key` is stable for state. */
const SUBJECT = { key: '__subject', kind: 'subject' };
const PARTS   = { key: '__parts',   kind: 'parts'   };
const REVIEW  = { key: '__review',  kind: 'review'  };

/**
 * Build the ordered step list.
 *
 * @param {object}  o
 * @param {Array}   o.questions  rows from the API, in the order it gave them (`sort_order`)
 * @param {string}  o.output     'recolourable' | 'ready' — decides whether naming parts is asked
 * @returns {Array<{key: string, kind: string, question?: object}>}
 */
export function generationSteps({ questions = [], output = 'ready' } = {}) {
  const asked = (Array.isArray(questions) ? questions : [])
    // A question with no key cannot hold an answer, and a question with no label cannot be read.
    // Both mean a half-authored row in admin; skipping it beats rendering a blank step.
    .filter(q => q?.key && q?.label)
    .map(q => ({ key: q.key, kind: 'question', question: q }));

  return [
    SUBJECT,
    ...asked,
    // ⚠️ ONLY WHEN THE PARTS COME BACK SEPARATE. Naming "bow, ears, feet" exists to get those
    // meshes back individually nameable; on the ready-to-use path the model arrives fused with its
    // colour baked in, so the answer changes nothing and the step is a question we cannot act on.
    // A wizard that asks something it will ignore teaches the baker to click through it.
    ...(output === 'recolourable' ? [PARTS] : []),
    REVIEW,
  ];
}

/** Has this step been given an answer? `parts` and `review` are never required. */
export function stepAnswered(step, { subject = '', answers = {}, partWords = '' } = {}) {
  if (!step) return false;
  if (step.kind === 'subject')  return String(subject ?? '').trim().length > 0;
  if (step.kind === 'question') return String(answers?.[step.key] ?? '').trim().length > 0;
  if (step.kind === 'parts')    return String(partWords ?? '').trim().length > 0;
  return true;
}

/**
 * The steps that were left blank — named on the review step, out loud.
 *
 * ⚠️ NAMED, NOT BLOCKED. A preset is allowed and never forced, and the same goes for a question: a
 * baker who genuinely does not care how the lion sits must be able to say nothing and go. What must
 * not happen is them arriving at Generate without noticing a question existed — which is precisely
 * what one long screen did. So the review step says "you have not said how it should look" and
 * leaves the decision where it belongs.
 */
export function blankSteps(steps = [], state = {}) {
  return steps.filter(s => (s.kind === 'subject' || s.kind === 'question' || s.kind === 'parts')
                        && !stepAnswered(s, state));
}

/**
 * Can the wizard move past this step?
 *
 * Only the subject blocks, because it is the only answer the prompt cannot be built without — an
 * empty subject builds an empty prompt (`buildDecorationPrompt` returns '' and the request would
 * spend nothing but would also do nothing). Everything else narrows a prompt that already works.
 */
export function canAdvance(step, state = {}) {
  return step?.kind === 'subject' ? stepAnswered(step, state) : true;
}

/** Index of the first step that still needs an answer, or the review step if none do. */
export function firstUnanswered(steps = [], state = {}) {
  const i = steps.findIndex(s => s.kind !== 'review' && !stepAnswered(s, state));
  return i === -1 ? Math.max(0, steps.length - 1) : i;
}
