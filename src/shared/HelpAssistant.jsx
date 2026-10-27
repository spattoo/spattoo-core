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
import { useRef, useState } from 'react';
import { Panel, PANEL, Z } from './Panel.jsx';
import { AssistantIcon } from './icons.jsx';
import HelpMarkdown from './helpMarkdown.jsx';

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
  const inputRef = useRef(null);

  /* A host that has not wired the endpoint gets no button at all — the same rule NotificationBell
     follows. Better than a button that opens a panel which can only apologise. */
  if (!apiClient?.searchHelp) return null;

  async function ask(text) {
    const question = String(text ?? '').trim();
    if (!question || state === 'asking') return;
    setQ(question);
    setAsked(question);
    setState('asking');
    setToldUs(false);
    setQuestionId(null);
    try {
      const r = await apiClient.searchHelp(question);
      setSections(Array.isArray(r?.sections) ? r.sections : []);
      setQuestionId(r?.questionId ?? null);
      setState('answered');
    } catch {
      setState('error');
    }
  }

  function reset() {
    setQ(''); setAsked(''); setSections([]); setState('idle');
    setQuestionId(null); setToldUs(false);
    inputRef.current?.focus();
  }

  /* ⚠️ OPTIMISTIC, AND IT NEVER REPORTS A FAILURE. The baker has said their piece; whether our row
     was found is our problem, and an error over a feedback tap teaches them not to tap it again. */
  function tellUs() {
    setToldUs(true);
    if (questionId) apiClient.sendHelpFeedback?.(questionId).catch(() => {});
  }

  return (
    <>
      {!hidden && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Help — ask how to do something"
          style={{ ...S.fab, bottom: `calc(${bottomInset + 14}px + env(safe-area-inset-bottom, 0px))`,
                   ...(isMobile ? S.fabMobile : null) }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.94)'; }}
          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
        >
          <AssistantIcon size={isMobile ? 22 : 24} />
        </button>
      )}

      <Panel
        open={open}
        onClose={() => setOpen(false)}
        title="Help"
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

        {state === 'answered' && sections.length === 0 && (
          /* ⚠️ IT NAMES WHAT IT UNDERSTOOD. "Nothing found" alone leaves a baker unable to tell a
             gap in the help from a question we misread, and those need opposite responses from
             them. */
          <div style={S.note}>
            <strong style={{ color: PANEL.ink }}>Nothing is written about that yet.</strong>
            <div style={{ marginTop: 5 }}>
              We looked for “{asked}”. Try asking it a different way — or tell us, and it becomes
              the next help article we write.
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
      </Panel>
    </>
  );
}

const S = {
  /* ⚠️ IT LOOKS PRESSABLE AT REST, ON A PHONE (rule 7). Its own dark surface, a border and a
     shadow — hover and the press scale are feedback on top of that, never what makes it legible. */
  fab: {
    position: 'fixed', right: 14, zIndex: Z.toast,
    width: 52, height: 52, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0b0b0d', color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.26)',
    cursor: 'pointer', padding: 0,
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  /* 48 still clears the 44px target floor, and a 52px circle crowds a 375px screen that already
     carries a five-slot nav strip. */
  fabMobile: { width: 48, height: 48, right: 12 },

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
  cardTitle: { fontSize: 11, fontWeight: 700, color: PANEL.muted, letterSpacing: 0.3, marginBottom: 2 },
  cardHeading: { fontSize: 14.5, fontWeight: 700, color: PANEL.ink, marginBottom: 7 },
  checked: { fontSize: 10.5, color: PANEL.muted, marginTop: 8, paddingTop: 7, borderTop: `1px solid ${PANEL.line}` },
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
