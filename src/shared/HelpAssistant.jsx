/* ── The assistant ───────────────────────────────────────────────────────────────────────────────
 *
 * A button in the bottom-right corner of every baker screen, and behind it a question box. The
 * baker asks in their own words and gets the step-by-step passage from the help article that
 * answers it.
 *
 * Sandeep described the whole thing: *"the long vision on the cartoon character is a helper on
 * everything … baker can ask what else can you recommend on this cake? … and baker can ask how can
 * he do something in spattoo"*. Then the order: *"lets do help first. use a dummy icon for now."*
 * So this is one capability of three, and it is deliberately NOT a template loader or a design
 * generator — the two siblings are not built.
 *
 * ⚠️ IT ANSWERS WITH THE ARTICLE'S OWN WORDS. Nothing here, and nothing behind it, writes prose: the
 * only model call is an embedding of the QUESTION, and the reply is the help text verbatim with the
 * date it was last checked against the app. The reasoning is in spattoo-api services/helpSearch.js
 * — a model asked to explain a UI eventually invents "Settings → Advanced", and a confidently wrong
 * instruction is worse than no answer.
 *
 * ⚠️ AND IT SAYS "NOTHING IS WRITTEN ABOUT THAT" RATHER THAN SHOWING THE NEAREST ARTICLE. Every
 * corpus has a closest match to a question it cannot answer. The server returns an empty list below
 * its floor, and this surface has to be honest about it instead of filling the space.
 */
import { useEffect, useRef, useState } from 'react';
import { Panel, PANEL, Z } from './Panel.jsx';
import { AssistantIcon } from './icons.jsx';
import HelpMarkdown from './helpMarkdown.jsx';
import { ASSISTANT, THINKING_LONG_MS, assistantState } from './assistantState.js';

/* The articles' own dates are ISO. "Checked 26 Oct 2026" is what a baker can act on; a bare
   `2026-10-26` reads as a version string. */
function niceDate(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Not a search box's placeholder list — these are the shape of question that works, and they are
   there because "ask me anything" produces one-word queries. Each one is a real question that the
   measured eval answers correctly. */
const EXAMPLES = [
  'How do I change the cake colour?',
  'How do I add my own picture as a decoration?',
  'What do I do when someone asks for a quote?',
];

export default function HelpAssistant({
  apiClient,
  isMobile = false,
  /* ⚠️ THE SLOT APPU DROPS INTO. Rendered in the panel header and given the current state, so a
     character can hold an expression per moment — *"appu will have proper animations /
     expressions … like scraching the head while search is taking long"*. A component, not a
     config: an animated character owns its own rendering, and anything this file knew about it
     would be a thing to change twice. Nothing renders here when it is absent, which is how the
     dummy icon ships first without the panel needing to know a character is coming. */
  character: Character = null,
  /* How far up from the bottom edge to sit. The phone's nav strip is in the host's layout, not
     here, so the host passes its height — a shared component guessing at another surface's
     furniture is how the button ends up half behind it. */
  bottomInset = 0,
  /* Hidden while the host is in a full-screen moment of its own (filming a build video, framing a
     photo). A floating button over a shot is in the shot. */
  hidden = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [state, setState] = useState('idle');     // idle | asking | answered | error
  const [asked, setAsked] = useState('');
  const [sections, setSections] = useState([]);
  /* The id of the asked question, so a verdict can be reported against this one rather than
     against "the last thing" — a baker can ask again while the first answer is still on screen. */
  const [questionId, setQuestionId] = useState(null);
  const [toldUs, setToldUs] = useState(false);
  const [escalation, setEscalation] = useState(null);   // null | 'asking' | 'sent'
  const [declined, setDeclined] = useState(null);       // null | 'business' | 'others' | 'security'
  const [longWait, setLongWait] = useState(false);
  const [note, setNote] = useState('');
  const inputRef = useRef(null);

  /* ⚠️ A WAIT WORTH SHOWING. Measured: a search takes 1.5–3s, median 2.3, most of it the server
     reading 6.5MB of vectors. Past the threshold the state becomes THINKING_LONG, which is what a
     character reacts to — and when that read is fixed, this simply stops firing. */
  useEffect(() => {
    if (state !== 'asking') { setLongWait(false); return undefined; }
    const t = setTimeout(() => setLongWait(true), THINKING_LONG_MS);
    return () => clearTimeout(t);
  }, [state]);

  /* A host that has not wired the endpoint gets no button at all — the same rule NotificationBell
     follows. Better than a button that opens a panel which can only apologise. */
  if (!apiClient?.searchHelp) return null;

  /* ⚠️ COMPUTED BUT NOT YET SHOWN. Appu is pinned to IDLE everywhere until Sandeep has signed off
     the other eight poses — *"only the idle one for now. we will integrate others later"*. Swap
     ASSISTANT.IDLE for `mood` at the two <Character> sites to turn the whole set on. */
  const mood = assistantState({
    phase: state, typing: !!q.trim(), sections, longWait,
    escalated: escalation === 'sent', declined: !!declined,
  });

  /* Answered-with-nothing, answered-and-told-it-missed, or answered-at-all — but never after an
     error, and never before a question has been asked. `escalateHelp` absent (an older host) draws
     nothing, the same rule the button itself follows. */
  const canEscalate = !!apiClient?.escalateHelp && !!questionId && state === 'answered';

  async function ask(text) {
    const question = String(text ?? '').trim();
    if (!question || state === 'asking') return;
    setQ(question);
    setAsked(question);
    setState('asking');
    setToldUs(false);
    setQuestionId(null);
    setEscalation(null);
    setDeclined(null);
    try {
      const r = await apiClient.searchHelp(question);
      setSections(Array.isArray(r?.sections) ? r.sections : []);
      setQuestionId(r?.questionId ?? null);
      setDeclined(r?.outOfScope ?? null);
      setState('answered');
    } catch {
      setState('error');
    }
  }

  function reset() {
    setQ(''); setAsked(''); setSections([]); setState('idle');
    setQuestionId(null); setToldUs(false); setEscalation(null); setDeclined(null);
    inputRef.current?.focus();
  }

  /* ⚠️ OPTIMISTIC, AND IT NEVER REPORTS A FAILURE. The baker has said their piece; whether our row
     was found is our problem, and an error over a feedback tap teaches them not to tap it again. */
  function tellUs() {
    setToldUs(true);
    if (questionId) apiClient.sendHelpFeedback?.(questionId).catch(() => {});
  }

  /* ⚠️ NEVER AUTOMATIC. The baker presses this. Every question is already logged with whether it
     landed — that is us deciding what to write next. This is them asking a person and waiting for
     a reply, and firing it on a miss would mail somebody about questions the baker went on to
     answer themselves. */
  function escalate() {
    if (!questionId || escalation) return;
    setEscalation('asking');
    apiClient.escalateHelp(questionId, note.trim())
      .then(() => setEscalation('sent'))
      /* Optimistic on failure too: the server records the request even when the email does not
         leave, so telling the baker it failed would be both discouraging and wrong. */
      .catch(() => setEscalation('sent'));
  }

  return (
    <>
      {!hidden && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Help — ask how to do something"
          style={{ ...S.fab, bottom: `calc(${bottomInset + 14}px + env(safe-area-inset-bottom, 0px))`,
                   ...(isMobile ? S.fabMobile : null), ...(Character ? S.fabCharacter : null) }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.94)'; }}
          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
        >
          {Character
            ? <>
                {/* ⚠️ IDLE ONLY, DELIBERATELY. Sandeep approved this pose; the other eight are
                    drawn and reachable but not signed off — *"only the idle one for now. we will
                    integrate others later"*. The state machine stays wired, pinned here.
                    ⚠️ AND THAT IS WHY 80 IS ALLOWED. Appu's own ~96px floor is the size at which
                    NINE poses stay apart from one another; one pose needs only to be legible, and
                    measured against the sticker the face, blush and hands still read at 52. At
                    44 the mouth and hands close up and he is a smudge.
                    ⚠️ THE PILL SCALES WITH HIM. Left at its original weight he ends up narrower
                    than his own label and the pair reads as a mistake.
                    ⚠️ Re-raise this to ~96 on the day the other eight are turned on. */}
                <Character state={ASSISTANT.IDLE} size={isMobile ? 52 : 60} />
                <span style={S.fabLabel}>Ask me</span>
              </>
            : <AssistantIcon size={isMobile ? 22 : 24} />}
        </button>
      )}

      <Panel
        open={open}
        onClose={() => setOpen(false)}
        title={Character
          ? <span style={S.titleRow}><span style={S.characterChip}><Character state={ASSISTANT.IDLE} size={26} crop="head" /></span>Help</span>
          : 'Help'}
        subtitle="Ask how to do something, in your own words"
        width={420}
        isMobile={isMobile}
        /* ⚠️ A CHAT WIDGET, NOT A DIALOG. Sandeep: *"surface should be opening popup to the right
           bottom, like a chat bot. not in the middle of the screen."* It opens out of the button
           it belongs to, and the app behind stays lit and usable — which matters more here than
           anywhere, because the answer is usually instructions for the screen underneath it. */
        dock
        /* Above the designer's studios: the assistant is reachable from inside one, and a panel
           that opens behind the thing it was opened from is a dead button. */
        zIndex={Z.overStudio}
        maxHeightMobile="82vh"
      >
        <div style={S.askRow}>
          <input
            ref={inputRef}
            style={S.input}
            value={q}
            placeholder="How do I…?"
            enterKeyHint="search"
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask(q); } }}
          />
          <button type="button" style={{ ...S.askBtn, ...(q.trim() ? null : S.askBtnOff) }}
                  disabled={!q.trim() || state === 'asking'} onClick={() => ask(q)}>
            {state === 'asking' ? 'Looking…' : 'Ask'}
          </button>
        </div>

        {state === 'idle' && (
          <div style={S.examples}>
            <div style={S.examplesLabel}>For example</div>
            {EXAMPLES.map(e => (
              <button key={e} type="button" style={S.example} onClick={() => ask(e)}>{e}</button>
            ))}
          </div>
        )}

        {state === 'error' && (
          <div style={S.note}>
            That did not go through. Please try again in a moment.
          </div>
        )}

        {/* ── Asked something we do not answer ─────────────────────────────────────────────────
            ⚠️ A DIFFERENT SENTENCE FROM "I could not find an answer to that", because they are
            different facts. An empty result means the search came back with nothing and the baker
            should try again differently — saying that about a question we will never answer invites
            them to keep rephrasing forever. This says what we do, and offers the person who can
            answer. */}
        {state === 'answered' && declined && (
          <div style={S.note}>
            <strong style={{ color: PANEL.ink }}>I only help with using Spattoo.</strong>
            <div style={{ marginTop: 5 }}>
              {declined === 'others'
                ? 'I can only show you your own bakery — never another bakery\u2019s work, orders or customers.'
                : declined === 'security'
                  ? 'I will not help with passwords or keys that are not yours.'
                  : 'For anything about Spattoo the company, the team can answer you directly.'}
            </div>
          </div>
        )}

        {state === 'answered' && !declined && sections.length === 0 && (
          /* ⚠️ IT SAYS WE DID NOT FIND IT, NOT THAT IT IS NOT WRITTEN. The earlier copy — "Nothing
             is written about that yet" — is a claim about our documentation, and it is sometimes
             FALSE: retrieval misses. The sprinkles answer existed, scored 0.561 of 352 sections,
             and was still discarded by the per-doc cap; correct and wrong answers overlap at
             0.43–0.57, so a real article can fall under the floor. Telling a baker nothing is
             written when it is there stops them looking — and it contradicted the very next line,
             which asks them to rephrase.
             ⚠️ IT STILL NAMES WHAT IT UNDERSTOOD. "Not found" alone leaves a baker unable to tell
             a gap in the help from a question we misread, and those need opposite responses.
             ⚠️ The second option matches the button below it word for word. Two different phrases
             for one action reads as two actions. */
          <div style={S.note}>
            <strong style={{ color: PANEL.ink }}>I could not find an answer to that.</strong>
            <div style={{ marginTop: 5 }}>
              We looked for “{asked}”. Try asking it in different words — or ask the Spattoo team.
            </div>
          </div>
        )}

        {state === 'answered' && sections.length > 0 && (
          <div style={S.answers}>
            {sections.map((sec, i) => {
              const checked = niceDate(sec.checked_against_app);
              return (
                <div key={sec.id ?? `${sec.doc_slug}-${sec.position ?? i}`} style={S.card}>
                  {/* ⚠️ 57 OF THE 58 ARTICLES OPEN WITH AN UNHEADED PASSAGE, and it is often the
                      best answer. Rendering the article title in the small muted style and nothing
                      in the heading style left those cards with their most important line as the
                      smallest — so when there is no heading, the title IS the heading. */}
                  {/* ⚠️ A FAQ ANSWER SAYS SO. Two corpora are indexed: the help articles, written
                      for a baker mid-task, and the website's FAQ, written for somebody deciding
                      whether to sign up. Passing a sales answer off as instructions would be a
                      small lie, and the voices are different enough to notice. */}
                  {sec.audience === 'faq' && <div style={S.fromFaq}>From our FAQ</div>}
                  {sec.heading ? (
                    <>
                      <div style={S.cardTitle}>{sec.doc_title}</div>
                      <div style={S.cardHeading}>{sec.heading}</div>
                    </>
                  ) : (
                    <div style={S.cardHeading}>{sec.doc_title}</div>
                  )}
                  <HelpMarkdown md={sec.body} />
                  {/* ⚠️ THE DATE IS PART OF THE ANSWER. An article that stopped matching the app is
                      a confidently wrong instruction too, just an older one. */}
                  {checked && <div style={S.checked}>Checked against the app on {checked}</div>}
                </div>
              );
            })}
            {/* ⚠️ THE ONLY WAY WE LEARN ABOUT THE COMMON FAILURE. A card can score well, be from
                the right article, and still not contain the answer — measured, that is most of
                the misses, and no score can see it. Without this control a baker who got a useless
                card just closes the panel and we never find out.

                Quiet on purpose: it sits under the answers, in the muted tone, because it is not
                an action anybody came here to take. */}
            <div style={S.feedbackRow}>
              <button type="button" style={S.again} onClick={reset}>Ask something else</button>
              {toldUs ? (
                <span style={S.thanks}>Thank you — we will write that one.</span>
              ) : (
                <button type="button" style={S.tellUs} onClick={tellUs}>
                  This did not answer my question
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Asking a person ──────────────────────────────────────────────────────────────────
            ⚠️ OFFERED, NEVER AUTOMATIC, and offered in three places for different reasons: after
            nothing was found (a dead end must have an exit), after the baker says the answer
            missed (they have just told us), and quietly beside a good answer (somebody with a cake
            due tomorrow should not have to fail twice before reaching a person). NOT offered after
            a request error — that is our outage, and the right offer there is to try again. */}
        {canEscalate && escalation === 'sent' && (
          <div style={S.sent}>
            <strong style={{ color: PANEL.ink }}>Sent to the Spattoo team.</strong>
            <div style={{ marginTop: 4 }}>We will reply by email.</div>
          </div>
        )}

        {canEscalate && escalation !== 'sent' && (
          <div style={S.escalate}>
            {escalation === 'asking' ? (
              <div style={S.note}>Sending…</div>
            ) : (
              <>
                <textarea
                  style={S.noteBox}
                  rows={2}
                  value={note}
                  placeholder="Anything else we should know? (optional)"
                  onChange={e => setNote(e.target.value)}
                />
                <button type="button" style={S.askBtn} onClick={escalate}>Ask the Spattoo team</button>
              </>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

const S = {
  /* ⚠️ IT LOOKS PRESSABLE AT REST, ON A PHONE (rule 7). Its own dark surface, a border and a
     shadow — hover and the press scale are feedback on top of that, never what makes it legible. */
  /* ⚠️ THE TRIGGER IS APPU WHEN THERE IS AN APPU. Sandeep's reference for him was a peeking figure
     with *"something like this on the right bottom"* — this button IS the bottom-right thing, so
     the character belongs on it rather than a generic speech icon. What does NOT change is the
     footprint: 52 on desktop, 48 on a phone, clearing the 44px target floor without crowding a
     375px screen that already carries a five-slot nav strip. Those were measured; the artwork
     inside them is the part that was a placeholder.
     ⚠️ And he needs a LIGHT disc — he is drawn in INK, and on the icon's near-black circle his
     outline disappears and leaves a pale blob with two dark marks for eyes. */
  fab: {
    position: 'fixed', right: 14, zIndex: Z.toast,
    width: 52, height: 52, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0b0b0d', color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    overflow: 'hidden',
    boxShadow: '0 6px 20px rgba(0,0,0,0.26)',
    cursor: 'pointer', padding: 0,
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  /* 48 still clears the 44px target floor, and a 52px circle crowds a 375px screen that already
     carries a five-slot nav strip. */
  fabMobile: { width: 48, height: 48, right: 12 },
  /* ⚠️ HE IS NOT A BUTTON WITH A FACE ON IT, HE IS SITTING THERE. Sandeep, after the first attempt
     cropped his head into the icon's disc: *"'right bottom' meaning it should come on the right
     bottom side of the screen"* — the reference is the whole figure leaning on a line with a
     speech bubble, and a circle around it throws away the pose, the hands and the line, which are
     most of what makes him read as a character rather than a logo.
     So: no disc, no border, no shadow, no fill. The drawing carries its own ground line, and the
     frame is cut at that line so he sits ON the screen's edge instead of floating above it. */
  /* ⚠️ AND HIS BOX MUST NOT EAT THE CORNER. A 52px disc could afford to be a rectangle; the peeking
     figure is ~150x124 of mostly empty space over the designer's canvas. `pointerEvents: 'none'`
     here with `auto` on the drawing (see Appu's CSS) means only the painted parts of him are
     clickable — the event still bubbles through to this button's onClick. */
  fabCharacter: {
    width: 'auto', height: 'auto', borderRadius: 0, right: 10,
    background: 'none', border: 'none', boxShadow: 'none', overflow: 'visible',
    pointerEvents: 'none',
    flexDirection: 'column', gap: 4,
  },
  /* ⚠️ THE LABEL IS NOW THE AFFORDANCE. The three-dot bubble used to say "talk to me" and Sandeep
     removed it: *"otherwise user would not know why is this character"*. A character alone in a
     corner is decoration — two words make it a control, and rule 7 is judged at rest on a phone
     where no hover reveals anything.
     ⚠️ It needs its own pointerEvents. The button is `none` so his empty corners stay transparent
     to clicks (see Appu's CSS), and pointer-events INHERITS — without this the words are dead. */
  fabLabel: {
    pointerEvents: 'auto',
    font: '700 11px/1 inherit', letterSpacing: '0.01em', color: PANEL.ink,
    background: '#fff', border: `1px solid ${PANEL.line}`, borderRadius: 999,
    padding: '5px 10px', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
  },

  askRow: { display: 'flex', gap: 7, alignItems: 'stretch' },
  input: {
    flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14,
    padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${PANEL.line}`, background: '#fff', color: PANEL.ink,
  },
  askBtn: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '10px 15px',
    borderRadius: 10, border: '1px solid #0b0b0d', background: '#0b0b0d', color: '#fff',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  askBtnOff: { opacity: 0.4, cursor: 'default' },

  examples: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 13 },
  examplesLabel: { fontSize: 10, fontWeight: 700, color: PANEL.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  example: {
    textAlign: 'left', fontFamily: 'inherit', fontSize: 13, color: PANEL.body,
    padding: '9px 12px', borderRadius: 10,
    border: `1px solid ${PANEL.line}`, background: PANEL.tint, cursor: 'pointer',
  },

  note: { marginTop: 13, fontSize: 13, lineHeight: 1.55, color: PANEL.body },

  answers: { display: 'flex', flexDirection: 'column', gap: 11, marginTop: 13 },
  card: {
    border: `1px solid ${PANEL.line}`, borderRadius: 12, padding: '12px 13px 11px',
    background: '#fff',
  },
  fromFaq: {
    display: 'inline-block', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase', color: PANEL.muted,
    border: `1px solid ${PANEL.line}`, background: PANEL.tint,
    padding: '2px 7px', borderRadius: 20, marginBottom: 6,
  },
  cardTitle: { fontSize: 11, fontWeight: 700, color: PANEL.muted, letterSpacing: 0.3, marginBottom: 2 },
  cardHeading: { fontSize: 14.5, fontWeight: 700, color: PANEL.ink, marginBottom: 7 },
  checked: { fontSize: 10.5, color: PANEL.muted, marginTop: 8, paddingTop: 7, borderTop: `1px solid ${PANEL.line}` },
  titleRow: { display: 'inline-flex', alignItems: 'center', gap: 9 },
  /* ⚠️ THE CHARACTER NEEDS A LIGHT GROUND. He is drawn in INK on white, and the panel header is
     near-black — dropped straight onto it his outline vanishes and all that is left is a pale blob
     with two dark marks where the eyes should be. The chip is the host's job, not his: he keeps one
     drawing that works anywhere, and whoever mounts him supplies a surface he reads against. */
  characterChip: {
    width: 30, height: 30, borderRadius: '50%', background: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
  },
  escalate: {
    marginTop: 14, paddingTop: 13, borderTop: `1px solid ${PANEL.line}`,
    display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
  },
  noteBox: {
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13,
    padding: '9px 11px', borderRadius: 10, resize: 'vertical',
    border: `1px solid ${PANEL.line}`, background: '#fff', color: PANEL.ink,
  },
  sent: {
    marginTop: 14, paddingTop: 13, borderTop: `1px solid ${PANEL.line}`,
    fontSize: 13, lineHeight: 1.5, color: PANEL.body,
  },
  feedbackRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tellUs: {
    fontFamily: 'inherit', fontSize: 12, color: PANEL.muted,
    padding: '9px 4px', border: 'none', background: 'none', cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 3,
  },
  thanks: { fontSize: 12, color: PANEL.body, padding: '9px 4px' },
  again: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: PANEL.body,
    padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${PANEL.line}`, background: PANEL.tint, cursor: 'pointer',
  },
};
