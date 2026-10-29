/* ── The assistant ───────────────────────────────────────────────────────────────────────────────
 *
 * Appu peeks from the bottom-right corner of every baker screen, and behind him a chat. The baker
 * asks in their own words and gets the step-by-step passage from the help article that answers it.
 *
 * ⚠️ IT IS A TRANSCRIPT, NOT A SEARCH FORM. Sandeep: *"this is not lookign like a chat window at
 * all. at least it should look like a basic chat window"*. Three things make the difference, and
 * styling was not among them: the composer sits at the BOTTOM in Panel's footer, the thread KEEPS
 * every turn instead of replacing the last one, and each side gets a bubble with one square corner
 * pointing at the speaker. A box at the top above a list of results reads as a search form however
 * it is painted.
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
 * ⚠️ AND IT SAYS "I COULD NOT FIND AN ANSWER TO THAT" RATHER THAN SHOWING THE NEAREST ARTICLE.
 * Every corpus has a closest match to a question it cannot answer. The server returns an empty list
 * below its floor, and this surface has to be honest about it instead of filling the space — but it
 * claims only that the SEARCH missed, never that nothing is written, because retrieval misses too.
 */
import { useEffect, useRef, useState } from 'react';
import { Panel, PANEL, Z } from './Panel.jsx';
import { AssistantIcon } from './icons.jsx';
import HelpMarkdown from './helpMarkdown.jsx';
import { ASSISTANT, THINKING_LONG_MS, assistantState } from './assistantState.js';

/* The send arrow. `icons.jsx` says plainly that only genuinely SHARED glyphs belong in it and that
   single-screen icons stay next to the screen — this is used nowhere else. */
function SendIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         focusable="false">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/* ⚠️ ONE COMPONENT FOR BOTH SIDES, because the only differences are which edge it hugs, which
   corner is square and which way the colours run. Two components drift the first time a radius
   changes.
   ⚠️ `first` controls the AVATAR, not the bubble. Appu replying with three passages should show
   his face once, the way a person sending three messages appears once — repeating it per bubble
   makes a column of heads and turns a reply into an interrogation. */
/* ⚠️ NAMESPACED, like Appu's own keyframes. This stylesheet lands in whatever document the host
   mounts into — beside a storefront's CSS and admin's — and a name like "blink" collides eventually.
   Injected once rather than per bubble: three <style> tags per reply is three style recalculations. */
const DOT_CSS = `@keyframes spattooHelpDot {
  0%, 60%, 100% { opacity: .3; transform: translateY(0) }
  30%           { opacity: 1;  transform: translateY(-3px) }
}`;

function Bubble({ from, avatar: Avatar, first = true, children }) {
  const appu = from === 'appu';
  return (
    <div style={{ ...S.row, justifyContent: appu ? 'flex-start' : 'flex-end' }}>
      {appu && (
        <span style={S.avatar}>
          {Avatar && first
            ? <span style={S.avatarRing}><Avatar state={ASSISTANT.IDLE} size={22} crop="head" /></span>
            : null}
        </span>
      )}
      <div style={appu ? S.fromAppu : S.fromBaker}>{children}</div>
    </div>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [longWait, setLongWait] = useState(false);
  /* ⚠️ A THREAD, NOT ONE EXCHANGE. Sandeep: *"this is not lookign like a chat window at all. at
     least it should look like a basic chat window"*. The panel used to hold a single question and
     replace it on the next one, which is why it read as a search box: a chat is defined by the
     transcript staying put.
     ⚠️ EACH ANSWER CARRIES ITS OWN questionId, toldUs AND escalation. They were component state
     when only one answer existed; in a thread a baker can tell us the second answer missed while
     the first is still on screen, and a single flag would move both. */
  const [turns, setTurns] = useState([]);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  /* Ids for the transcript. A ref, not state: bumping it must not itself cause a render. */
  const seq = useRef(0);

  /* ⚠️ A WAIT WORTH SHOWING. Measured: a search takes 1.5–3s, median 2.3, most of it the server
     reading 6.5MB of vectors. Past the threshold the state becomes THINKING_LONG, which is what a
     character reacts to — and when that read is fixed, this simply stops firing. */
  useEffect(() => {
    if (!busy) { setLongWait(false); return undefined; }
    const t = setTimeout(() => setLongWait(true), THINKING_LONG_MS);
    return () => clearTimeout(t);
  }, [busy]);

  /* ⚠️ THE NEWEST MESSAGE MUST BE THE ONE YOU SEE. A transcript that grows upward off-screen is
     the one way a chat can be worse than the list it replaced. */
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end', behavior: turns.length > 1 ? 'smooth' : 'auto' });
  }, [turns, busy, open]);

  /* A host that has not wired the endpoint gets no button at all — the same rule NotificationBell
     follows. Better than a button that opens a panel which can only apologise. */
  if (!apiClient?.searchHelp) return null;

  /* ⚠️ COMPUTED BUT NOT YET SHOWN. Appu is pinned to IDLE everywhere until Sandeep has signed off
     the other eight poses — *"only the idle one for now. we will integrate others later"*. Swap
     ASSISTANT.IDLE for `mood` at the two <Character> sites to turn the whole set on. */
  const lastAnswer = [...turns].reverse().find(x => x.role === 'appu');
  const mood = assistantState({
    phase: busy ? 'asking' : lastAnswer ? (lastAnswer.kind === 'error' ? 'error' : 'answered') : 'idle',
    typing: !!q.trim(),
    sections: lastAnswer?.sections ?? [],
    longWait,
    escalated: lastAnswer?.escalation === 'sent',
    declined: !!lastAnswer?.declined,
  });

  /* A host that never wired escalation (an older one) simply never gets the offer. */
  const canOffer = turn => !!apiClient?.escalateHelp && !!turn.questionId && turn.kind !== 'error';

  const patch = (id, fields) =>
    setTurns(ts => ts.map(x => (x.id === id ? { ...x, ...fields } : x)));

  async function ask(text) {
    const question = String(text ?? '').trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    setTurns(ts => [...ts, { id: `b${++seq.current}`, role: 'baker', text: question }]);
    try {
      const r = await apiClient.searchHelp(question);
      const sections = Array.isArray(r?.sections) ? r.sections : [];
      setTurns(ts => [...ts, {
        id: `a${++seq.current}`, role: 'appu', asked: question, sections,
        questionId: r?.questionId ?? null, declined: r?.outOfScope ?? null,
        kind: r?.outOfScope ? 'declined' : sections.length ? 'answer' : 'empty',
        toldUs: false, escalation: null, note: '',
      }]);
    } catch {
      setTurns(ts => [...ts, { id: `a${++seq.current}`, role: 'appu', kind: 'error' }]);
    } finally {
      setBusy(false);
    }
  }

  /* ⚠️ OPTIMISTIC, AND IT NEVER REPORTS A FAILURE. The baker has said their piece; whether our row
     was found is our problem, and an error over a feedback tap teaches them not to tap it again. */
  function tellUs(turn) {
    patch(turn.id, { toldUs: true });
    if (turn.questionId) apiClient.sendHelpFeedback?.(turn.questionId).catch(() => {});
  }

  /* ⚠️ NEVER AUTOMATIC. The baker answers Appu's question. Every question is already logged with
     whether it landed — that is us deciding what to write next. This is them asking a person and
     waiting for a reply, and firing it on a miss would mail somebody about questions the baker
     went on to answer themselves. */
  function escalate(turn) {
    if (!turn.questionId || turn.escalation) return;
    patch(turn.id, { escalation: 'asking' });
    apiClient.escalateHelp(turn.questionId, (turn.note || '').trim())
      .then(() => patch(turn.id, { escalation: 'sent' }))
      /* Optimistic on failure too: the server records the request even when the email does not
         leave, so telling the baker it failed would be both discouraging and wrong. */
      .catch(() => patch(turn.id, { escalation: 'sent' }));
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
        flow="block"
        /* ⚠️ THE COMPOSER IS THE FOOTER, AND THAT IS WHAT MAKES IT A CHAT. Panel's footer stays put
           while the body scrolls — with the box at the TOP, above a list, the surface reads as a
           search form no matter how the results are styled. Every chat anyone has used puts it at
           the bottom, and that expectation is doing more work here than any amount of styling. */
        footer={
          <div style={S.composer}>
            <input
              ref={inputRef}
              style={S.input}
              value={q}
              placeholder="Ask anything…"
              enterKeyHint="send"
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask(q); } }}
            />
            <button type="button" aria-label="Send"
                    style={{ ...S.send, ...(q.trim() && !busy ? null : S.sendOff) }}
                    disabled={!q.trim() || busy} onClick={() => ask(q)}>
              <SendIcon size={17} />
            </button>
          </div>
        }
      >
        <div style={S.thread}>
          <style>{DOT_CSS}</style>
          {/* ⚠️ APPU SPEAKS FIRST. An empty transcript with a composer under it is a search box
              with extra steps; one message from him makes it a conversation already in progress,
              and it is the natural place for the examples to live. */}
          <Bubble from="appu" avatar={Character}>
            Hello! Ask me how to do something in Spattoo — in your own words.
          </Bubble>

          {turns.length === 0 && (
            <div style={S.suggestions}>
              {EXAMPLES.map(e => (
                <button key={e} type="button" style={S.suggestion} onClick={() => ask(e)}>{e}</button>
              ))}
            </div>
          )}

          {turns.map((turn, i) => turn.role === 'baker' ? (
            <Bubble key={turn.id} from="baker">{turn.text}</Bubble>
          ) : (
            <div key={turn.id}>
              {turn.kind === 'error' && (
                <Bubble from="appu" avatar={Character} first={turns[i - 1]?.role !== 'appu'}>
                  That did not go through. Please try again in a moment.
                </Bubble>
              )}

              {turn.kind === 'declined' && (
                <Bubble from="appu" avatar={Character} first>
                  <strong style={{ color: PANEL.ink }}>I only help with using Spattoo.</strong>
                  <div style={{ marginTop: 5 }}>
                    {turn.declined === 'others'
                      ? 'I can only show you your own bakery — never another bakery’s work, orders or customers.'
                      : turn.declined === 'security'
                        ? 'I will not help with passwords or keys that are not yours.'
                        : 'For anything about Spattoo the company, the team can answer you directly.'}
                  </div>
                </Bubble>
              )}

              {turn.kind === 'empty' && (
                <Bubble from="appu" avatar={Character} first>
                  <strong style={{ color: PANEL.ink }}>I could not find an answer to that.</strong>
                  <div style={{ marginTop: 5 }}>
                    I looked for “{turn.asked}”. Try asking it in different words.
                  </div>
                </Bubble>
              )}

              {/* ⚠️ ONE BUBBLE PER PASSAGE, not one bubble holding a list. Appu replying with two
                  or three short messages is what a chat does; a single bubble with three articles
                  stacked inside it is the old card list wearing a rounded corner. */}
              {turn.kind === 'answer' && turn.sections.map((sec, n) => {
                const checked = niceDate(sec.checked_against_app);
                return (
                  <Bubble key={sec.id ?? `${sec.doc_slug}-${sec.position ?? n}`}
                          from="appu" avatar={Character} first={n === 0}>
                    {/* ⚠️ A FAQ ANSWER SAYS SO. Two corpora are indexed: the help articles, written
                        for a baker mid-task, and the website's FAQ, written for somebody deciding
                        whether to sign up. Passing a sales answer off as instructions would be a
                        small lie, and the voices are different enough to notice. */}
                    {sec.audience === 'faq' && <div style={S.fromFaq}>From our FAQ</div>}
                    {/* ⚠️ 57 OF THE 58 ARTICLES OPEN WITH AN UNHEADED PASSAGE, and it is often the
                        best answer — so when there is no heading, the title IS the heading. */}
                    {sec.heading ? (
                      <>
                        <div style={S.cardTitle}>{sec.doc_title}</div>
                        <div style={S.cardHeading}>{sec.heading}</div>
                      </>
                    ) : (
                      <div style={S.cardHeading}>{sec.doc_title}</div>
                    )}
                    <HelpMarkdown md={sec.body} />
                    {/* ⚠️ THE DATE IS PART OF THE ANSWER. An article that stopped matching the app
                        is a confidently wrong instruction too, just an older one. */}
                    {checked && <div style={S.checked}>Checked against the app on {checked}</div>}
                  </Bubble>
                );
              })}

              {/* ⚠️ THE ONLY WAY WE LEARN ABOUT THE COMMON FAILURE. A passage can score well, be
                  from the right article, and still not contain the answer — measured, that is most
                  of the misses, and no score can see it. Quiet on purpose: it is not an action
                  anybody came here to take. */}
              {turn.kind === 'answer' && (
                <div style={S.underBubble}>
                  {turn.toldUs
                    ? <span style={S.thanks}>Thank you — we will write that one.</span>
                    : <button type="button" style={S.tellUs} onClick={() => tellUs(turn)}>
                        This did not answer my question
                      </button>}
                </div>
              )}

              {/* ── Appu offers a person ─────────────────────────────────────────────────────────
                  ⚠️ OFFERED, NEVER AUTOMATIC, and offered after every answer for different reasons:
                  after nothing was found (a dead end must have an exit), after a scope refusal, and
                  beside a good answer (somebody with a cake due tomorrow should not have to fail
                  twice to reach a person). NOT after a request error — that is our outage, and the
                  right offer there is to try again. */}
              {canOffer(turn) && turn.escalation === 'sent' && (
                <Bubble from="appu" avatar={Character} first>
                  <strong style={{ color: PANEL.ink }}>I have asked the Spattoo team.</strong>
                  <div style={{ marginTop: 4 }}>They will reply by email.</div>
                </Bubble>
              )}
              {/* ⚠️ THE OFFER FOLLOWS THE CONVERSATION; THE CONFIRMATION STAYS PUT. Shown under
                  every past answer it becomes a column of identical questions — in a thread the
                  live action belongs to the turn you are on. A SENT one is different: that is a
                  thing Appu did, and deleting it would make the transcript lie. */}
              {canOffer(turn) && turn.escalation !== 'sent' && turn.id === lastAnswer?.id && (
                <Bubble from="appu" avatar={Character} first>
                  {turn.escalation === 'asking' ? 'Sending…' : (
                    <>
                      {/* ⚠️ APPU ASKS; THE BUTTON ANSWERS HIM. There is no "No" — not answering is
                          the no, and a button whose only job is to hide an offer is clutter. */}
                      <div>Shall I ask the Spattoo team to get back to you on this?</div>
                      <textarea
                        style={S.noteBox} rows={2} value={turn.note}
                        placeholder="Anything else they should know? (optional)"
                        onChange={e => patch(turn.id, { note: e.target.value })}
                      />
                      <button type="button" style={S.yesBtn} onClick={() => escalate(turn)}>
                        Yes, ask them
                      </button>
                    </>
                  )}
                </Bubble>
              )}
            </div>
          ))}

          {/* ⚠️ THE WAIT IS A MESSAGE TOO. Measured: 1.5–3s, median 2.3. In a list that was a
              button label; in a thread the silence belongs to Appu, so he shows he is typing. */}
          {busy && (
            <Bubble from="appu" avatar={Character} first>
              <span style={S.typing}>
                <i style={{ ...S.dot, animationDelay: '0ms' }} />
                <i style={{ ...S.dot, animationDelay: '160ms' }} />
                <i style={{ ...S.dot, animationDelay: '320ms' }} />
              </span>
            </Bubble>
          )}
          <div ref={endRef} />
        </div>
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

  titleRow: { display: 'inline-flex', alignItems: 'center', gap: 9 },
  /* ⚠️ THE CHARACTER NEEDS A LIGHT GROUND. He is drawn in INK on white, and the panel header is
     near-black — dropped straight onto it his outline vanishes and all that is left is a pale blob
     with two dark marks where the eyes should be. The chip is the host's job, not his: he keeps one
     drawing that works anywhere, and whoever mounts him supplies a surface he reads against. */
  characterChip: {
    width: 30, height: 30, borderRadius: '50%', background: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
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
  thanks: { fontSize: 12, color: PANEL.body, padding: '2px 0' },
  tellUs: {
    fontFamily: 'inherit', fontSize: 12, color: PANEL.muted,
    padding: '2px 0', border: 'none', background: 'none', cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 3,
  },
  noteBox: {
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13,
    padding: '9px 11px', borderRadius: 10, resize: 'vertical', marginTop: 8,
    border: `1px solid ${PANEL.line}`, background: '#fff', color: PANEL.ink,
  },

  /* ── The transcript ──────────────────────────────────────────────────────────────────────── */
  thread: { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 2 },
  row: { display: 'flex', alignItems: 'flex-end', gap: 7 },
  /* Reserved even when empty, so a run of Appu's bubbles stays aligned under the one with a face
     on it rather than stepping left. */
  /* ⚠️ THE SLOT IS ALWAYS THERE; THE RING IS NOT. Reserving the width keeps a run of Appu's
     bubbles aligned under the one bearing his face, but drawing an empty circle under each of them
     is a column of blank badges. The frame only exists when there is a face in it.
     ⚠️ And it sits at the TOP of the bubble, not the bottom: beside a passage the height of the
     panel, a face pinned to the last line reads as belonging to whatever is under it. */
  avatar: { width: 24, height: 24, flex: '0 0 24px', alignSelf: 'flex-start', marginTop: 2 },
  avatarRing: {
    width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff', border: `1px solid ${PANEL.line}`,
  },
  /* ⚠️ THE SQUARE CORNER POINTS AT THE SPEAKER. It is the whole visual grammar of a chat: a
     uniformly rounded box on either side reads as two cards, not two people talking. */
  fromAppu: {
    maxWidth: '84%', background: '#F2F4F2', color: PANEL.ink,
    borderRadius: '14px 14px 14px 4px', padding: '9px 12px',
    fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere',
  },
  fromBaker: {
    maxWidth: '84%', background: '#0b0b0d', color: '#fff',
    borderRadius: '14px 14px 4px 14px', padding: '9px 12px',
    fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere',
  },
  /* Sits under Appu's bubble, inset past the avatar so it reads as a footnote to what he said. */
  underBubble: { display: 'flex', marginLeft: 31, marginTop: 4 },

  suggestions: { display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 31 },
  /* ⚠️ THESE ARE NOT PLACEHOLDERS, they are the SHAPE of question that works — "ask me anything"
     produces one-word queries. Each is a real question the measured eval answers correctly. */
  suggestion: {
    fontFamily: 'inherit', fontSize: 13, textAlign: 'left', color: PANEL.ink,
    background: '#fff', border: `1px solid ${PANEL.line}`, borderRadius: 999,
    padding: '7px 13px', cursor: 'pointer', alignSelf: 'flex-start',
  },

  /* ⚠️ THREE DOTS, NOT THE WORD "LOADING". It is Appu's turn to speak and he has not finished —
     the one place a loop belongs, because the wait IS the message. */
  typing: { display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 0' },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: '#9AA79C',
    display: 'inline-block', animation: 'spattooHelpDot 1.1s ease-in-out infinite',
  },

  /* ── The composer ────────────────────────────────────────────────────────────────────────── */
  composer: { display: 'flex', gap: 8, alignItems: 'center', width: '100%' },
  input: {
    flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14,
    padding: '11px 14px', borderRadius: 999,
    border: `1px solid ${PANEL.line}`, background: '#fff', color: PANEL.ink,
  },
  /* 38px clears the 44px target floor once its padding is counted by the row, and a round send
     button is the one control every chat shares. */
  send: {
    flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid #0b0b0d', background: '#0b0b0d', color: '#fff',
    cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent',
  },
  sendOff: { background: '#C8CFC9', border: '1px solid #C8CFC9', cursor: 'default' },

  yesBtn: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '9px 14px',
    borderRadius: 999, border: '1px solid #0b0b0d', background: '#0b0b0d', color: '#fff',
    cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 8,
  },

};
