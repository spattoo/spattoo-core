import { useMemo } from 'react';
import Chip from '../../shared/Chip.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { INK, INK_MUTED, LINE, SURFACE } from '../../shared/tokens.js';
import { generationSteps, stepAnswered, blankSteps, canAdvance } from './generationSteps.js';

// ── One question at a time, because the credits are real ─────────────────────────────────────────
//
// Sandeep: *"lets make it like a wizard pls. want user to focus at each on how exactly it should
// shape up. if all at one place, easy to skip details. basically i want to save baker's credits as
// much as possible and get their desired outout in single or fewer attempts."*
//
// ⚠️ IT LIVES IN CORE, NOT IN ADMIN, AND THAT IS THE WHOLE REASON FOR THE PROP LIST. The baker's
// studio is the destination and imports only flow core → admin, so a wizard built in admin would be
// built twice — the failure the root CLAUDE.md rule 1 is about. What it deliberately does NOT do is
// own the prompt: `buildDecorationPrompt` stays in admin where `check:prompt-vocab` guards it
// against growing a local vocabulary, and the finished sentence arrives here as a string. This
// component knows about steps and nothing about fondant.
//
// ⚠️ THE SENTENCE IS VISIBLE ON EVERY STEP, not just at the end (INVARIANTS #11 — a control and
// what it changes are seen together, and narrating text goes BESIDE or BEFORE, never below). A
// wizard that hides its own output until the last screen is three screens of guessing, and the
// baker cannot learn to prompt from it.
//
// Controlled: every answer lives in the caller, because the caller is the thing that has to send
// them. Nothing here is stored.

const PANEL = { background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 };

/** The step's own heading. A question carries its label; the fixed steps do not. */
function headingFor(step) {
  if (step.kind === 'subject') return 'What are you making?';
  if (step.kind === 'parts')   return 'Name its parts';
  if (step.kind === 'review')  return 'Ready to generate';
  return step.question.label;
}

export default function GenerationWizard({
  // what to ask
  questions = [],
  output = 'ready',                 // 'ready' | 'recolourable' — decides if the parts step appears
  // the answers, held by the caller
  subject = '', onSubject,
  answers = {}, onAnswer,
  partWords = '', onPartWords,
  // where the wizard is
  index = 0, onIndex,
  // what the answers add up to
  prompt = '',
  warnings = [],
  // finishing
  onGenerate, generateLabel = 'Generate', busy = false, costNote = null,
  // admin-only extras injected per question (the "+ add an option" box saves for EVERY baker, so it
  // is passed in rather than shown to one)
  renderQuestionExtra = null,
  /* ⚠️ HAVE THE QUESTIONS ARRIVED? Until they have, the step list is subject + review and the rail
     says "Step 1 of 3" — then the fetch lands and it becomes 5. Caught by opening the screen, not
     by any test: a total that changes under the baker is a small lie told at the exact moment they
     are deciding how much effort this is going to take. While false, the count is simply not
     claimed. It must still default TRUE, because a caller with no questions at all (a failed fetch)
     has a complete wizard, not a loading one. */
  questionsReady = true,
}) {
  const isMobile = useNarrow();
  const steps = useMemo(() => generationSteps({ questions, output }), [questions, output]);

  // Clamped rather than trusted: `output` can change under us (switching to ready-to-use removes
  // the parts step), and an index left pointing past the end would render nothing at all.
  const at   = Math.min(Math.max(0, index), steps.length - 1);
  const step = steps[at];
  const state = { subject, answers, partWords };
  const blanks = blankSteps(steps, state);
  const go = (i) => onIndex?.(Math.min(Math.max(0, i), steps.length - 1));

  const field = {
    width: '100%', padding: isMobile ? 12 : 10, borderRadius: 10, fontFamily: 'inherit',
    fontSize: isMobile ? 15 : 13, border: `1.5px solid ${LINE}`, color: INK,
    background: SURFACE, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* ── Where am I, and what have I already said ──────────────────────────────────────────────
          Every step is reachable by tapping it, so this is navigation and not only a progress bar:
          a baker who remembers they typed the wrong thing two steps ago must be able to go straight
          back. Buttons, not divs, so they take focus and announce themselves (rule 7). */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {steps.map((s, i) => {
          const done = stepAnswered(s, state);
          const here = i === at;
          return (
            <button key={s.key} type="button" onClick={() => go(i)}
              aria-current={here ? 'step' : undefined}
              title={headingFor(s)}
              style={{
                width: here ? 30 : 12, height: 12, borderRadius: 7, cursor: 'pointer', padding: 0,
                border: `1.5px solid ${done || s.kind === 'review' ? INK : '#999999'}`,
                background: here ? INK : (done ? 'rgba(26,26,26,0.35)' : 'transparent'),
              }} />
          );
        })}
        <span style={{ fontSize: 11, color: INK_MUTED, marginLeft: 4 }}>
          {questionsReady ? `Step ${at + 1} of ${steps.length}` : `Step ${at + 1}`}
        </span>
      </div>

      <div style={PANEL}>
        <h3 style={{ margin: '0 0 2px', fontSize: isMobile ? 17 : 15, color: INK }}>{headingFor(step)}</h3>
        {/* BEFORE the control it narrates, never after it. */}
        {step.kind === 'question' && step.question.help && (
          <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5, color: INK_MUTED }}>
            {step.question.help}
          </p>
        )}

        {step.kind === 'subject' && (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5, color: INK_MUTED }}>
              Plain words are fine. Just the thing itself — not the cake it sits on.
            </p>
            <input value={subject} onChange={e => onSubject?.(e.target.value)}
                   placeholder="a bear with a bow" style={field} />
          </>
        )}

        {step.kind === 'question' && step.question.kind === 'text' && (
          /* A textarea, not an input: this is the answer that settles WHICH bear, and a single line
             that scrolls sideways hides what the baker already wrote. */
          <textarea value={answers[step.key] ?? ''} rows={isMobile ? 4 : 3}
                    placeholder={step.question.placeholder ?? ''}
                    onChange={e => onAnswer?.(step.key, e.target.value)}
                    style={{ ...field, resize: 'vertical' }} />
        )}

        {step.kind === 'question' && step.question.kind !== 'text' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(step.question.options ?? []).map(o => (
              <Chip key={o.key} label={o.label} isMobile={isMobile}
                    active={answers[step.key] === o.key}
                    title={o.phrase || 'adds nothing to the prompt'}
                    /* Tapping the chosen one again clears it — the only way to un-answer a choice,
                       and the thing a baker tries first when they change their mind. */
                    onClick={() => onAnswer?.(step.key, answers[step.key] === o.key ? '' : o.key)} />
            ))}
            {renderQuestionExtra?.(step.question)}
          </div>
        )}

        {step.kind === 'parts' && (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5, color: INK_MUTED }}>
              Naming them may get them back separately, so you can colour each one. Optional.
            </p>
            <input value={partWords} onChange={e => onPartWords?.(e.target.value)}
                   placeholder="bow, ears, feet" style={field} />
          </>
        )}

        {step.kind === 'review' && (
          <>
            {/* ⚠️ THE BLANKS ARE NAMED, NOT BLOCKED. A baker who does not care how the lion sits
                must be able to say nothing and go — a preset is allowed, never forced. What must
                not happen is reaching Generate without noticing the question existed, which is
                exactly what one long screen did. Each one is a button back to its own step. */}
            {blanks.length > 0 ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: INK }}>
                You have not said:
                {blanks.map(s => (
                  <button key={s.key} type="button" onClick={() => go(steps.indexOf(s))}
                    style={{ ...PANEL, padding: '4px 9px', marginLeft: 6, fontSize: 12,
                             fontWeight: 700, cursor: 'pointer', color: INK, fontFamily: 'inherit' }}>
                    {headingFor(s)}
                  </button>
                ))}
                <div style={{ color: INK_MUTED, marginTop: 6 }}>
                  You can generate anyway — the more you say, the fewer tries it takes.
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: INK_MUTED }}>
                Every question answered. This is what gets sent.
              </p>
            )}
            {costNote && (
              <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: INK }}>{costNote}</p>
            )}
          </>
        )}
      </div>

      {/* ── What gets sent, on every step ─────────────────────────────────────────────────────────
          Read-only here: this component composes nothing, it displays what the caller built. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: INK_MUTED, letterSpacing: 0.4,
                      textTransform: 'uppercase', marginBottom: 4 }}>What gets sent</div>
        <div style={{ ...PANEL, padding: 10, minHeight: 38, fontSize: 12.5, lineHeight: 1.55,
                      color: prompt ? INK : INK_MUTED, background: '#fafafa' }}>
          {prompt || 'Nothing yet — start with what you are making.'}
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ ...PANEL, marginTop: 10, padding: 10, fontSize: 12, lineHeight: 1.5,
                      background: '#FDF6EC', borderColor: '#EBD9BD', color: '#8A5A20' }}>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Back and Next are the same size and in the same place on every step, so the wizard does not
          move its own controls around under a thumb. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => go(at - 1)} disabled={at === 0}
          style={{ ...PANEL, padding: isMobile ? '12px 16px' : '9px 14px', fontSize: 13,
                   fontWeight: 700, fontFamily: 'inherit', color: INK,
                   cursor: at === 0 ? 'not-allowed' : 'pointer', opacity: at === 0 ? 0.45 : 1 }}>
          Back
        </button>
        {step.kind === 'review' ? (
          <button type="button" onClick={onGenerate} disabled={busy || !prompt.trim()}
            style={{ ...PANEL, padding: isMobile ? '12px 18px' : '9px 16px', fontSize: 13,
                     fontWeight: 800, fontFamily: 'inherit', background: INK, color: SURFACE,
                     borderColor: INK, cursor: busy || !prompt.trim() ? 'not-allowed' : 'pointer',
                     opacity: busy || !prompt.trim() ? 0.5 : 1 }}>
            {busy ? 'Working…' : generateLabel}
          </button>
        ) : (
          <button type="button" onClick={() => go(at + 1)} disabled={!canAdvance(step, state)}
            style={{ ...PANEL, padding: isMobile ? '12px 18px' : '9px 16px', fontSize: 13,
                     fontWeight: 800, fontFamily: 'inherit', background: INK, color: SURFACE,
                     borderColor: INK,
                     cursor: canAdvance(step, state) ? 'pointer' : 'not-allowed',
                     opacity: canAdvance(step, state) ? 1 : 0.5 }}>
            Next
          </button>
        )}
        {/* Only the subject blocks, and when it does the reason is said rather than left to a
            greyed-out button nobody can explain. */}
        {!canAdvance(step, state) && (
          <span style={{ fontSize: 11.5, color: INK_MUTED }}>Say what you are making first.</span>
        )}
      </div>
    </div>
  );
}
