import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import CakeVisual from './CakeVisual.jsx';
import DesignFacet from './DesignFacet.jsx';
import FlavourFacet from './FlavourFacet.jsx';
import VerifyStep from './VerifyStep.jsx';
import { SizeFacet, DateFacet } from './SizeDateFacets.jsx';
import {
  FACETS, emptyDraft, loadDraft, saveDraft, clearDraft, isFilled, canSubmit, withTierCount,
  draftSummary,
} from './cakeDraft.js';

// ── The shell ───────────────────────────────────────────────────────────────────────────────────
// Everything except the doors: the shared draft, the visual, which facet is open, and the submit
// gate. The doors (templates, photo, designer, flavour list, suggester) plug in as facet bodies.
//
// Built first because every door depends on the draft's shape and none of them can settle it alone.
//
// ── DELIBERATELY NOT shared/Panel.jsx ───────────────────────────────────────────────────────────
// That shell wears the app's near-black chrome, and this is the CUSTOMER's storefront, which wears
// the BAKER's colours. Putting app furniture here would be the same mistake as styling a baker's
// storefront in Spattoo green — the whole point of the storefront is that it belongs to them.

const FACET_TITLE = {
  design:  'The design',
  flavour: 'The flavour',
  size:    'Size and shape',
  date:    'When do you need it?',
};

// The chip that INVITES someone in, which is not the same string as the heading once they are there.
// "How many people?" is a good invitation and a poor header — the size facet asks a second question
// about shape, and a header still saying "how many people" contradicts the body.
const FACET_CHIP = { ...FACET_TITLE, size: 'How many people?' };

// ── The entry screen's title ────────────────────────────────────────────────────────────────────
// "Where would you like to start?" and NOT the hero button's words. The button says "Let's make your
// cake"; repeating it here would spend the panel's one headline confirming what the customer just
// read, when the thing they actually need is orientation — there are two doors and no wrong one.
//
// It also completes the sentence the doors already start: a question above two answers that both
// begin "I'll start with…". The panel asks and the customer replies, which is the voice the whole
// chooser is written in.

// The two entries. Their labels differ in SHAPE, not one word — two lines differing by a single
// word force the eye to compare rather than recognise, which is backwards for a screen whose job is
// instant self-identification. And neither asks the customer to KNOW anything: "I know how it
// should look" would have no door for the many people who know neither.
const ENTRIES = [
  { facet: 'design',  label: "I'll start with the design" },
  { facet: 'flavour', label: "I'll pick the flavour first" },
];

function reduce(draft, action) {
  // A tier-count change is a RESHAPE, not a merge: the flavour array has to grow or shrink while
  // keeping what has already been answered, which a shallow merge cannot express.
  if (action.__tierCount != null) return withTierCount(draft, action.__tierCount);
  // Start over. Rebuilt from `emptyDraft` rather than patched key by key, so a field added to the
  // draft later is cleared by this without anybody remembering to add it here. Keeps the SLUG,
  // because the draft belongs to this baker and always did.
  //
  // Back to ONE tier deliberately: the tier count is an answer like any other, and a reset that
  // silently kept "two tiers" would leave the customer's next cake shaped by the one they just
  // threw away.
  if (action.__reset) return emptyDraft(draft.bakerSlug, 1);
  return merge(draft, action);
}

function merge(draft, patch) {
  // Facets MUTATE the shared draft rather than returning values this shell stitches together,
  // because any facet may fill a field that nominally belongs to another — the suggester asks the
  // occasion because it needs it, and the answer belongs to the cake. A shallow merge per top-level
  // key keeps a facet from having to rebuild the parts it did not touch.
  const next = { ...draft };
  for (const [k, v] of Object.entries(patch)) {
    next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...draft[k], ...v } : v;
  }
  return next;
}

export default function FacetShell({
  baker, tierCount = 1, isMobile = false, palette, api, leadTimeDays = 0,
  apiBaseUrl, captchaSiteKey, otpRequired = true, otpChannels, slug: slugProp, onStartDesign,
  // The baker's mark, already background-trimmed by the host. The storefront exists partly to BE
  // their shop, and the chooser is where a customer now spends the longest — dropping to a text
  // eyebrow the moment the panel opens hands the most attentive minutes back to us.
  logo = null,
  onClose, onSubmit, renderFacet,
}) {
  // The host resolves this and passes it — see CustomerStorefront. Falling back to baker.slug
  // keeps the dev harnesses working, but a caller that supplies both must win, or the photo
  // store gets written under one slug and read under another.
  const slug = slugProp ?? baker?.slug ?? 'unknown';
  const [draft, patch] = useReducer(reduce, null, () => loadDraft(slug, tierCount));
  // null = the entry screen. A facet is opened, filled, and closed back to here — there is no
  // "next", because there is no order to go in.
  const [open, setOpen] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState(null);
  const [sent, setSent]       = useState(false);
  // The number has to be proved before the enquiry can go anywhere, so "Send" opens verification
  // rather than posting. Its own screen, not a field in the footer: it is a conversation with two
  // steps and a wait for an SMS in the middle, and that does not belong under a button.
  const [verifying, setVerifying] = useState(false);
  // Two-step, because this throws away everything the customer has entered and there is no undo.
  // Inline rather than a modal: a confirmation dialog over a sheet that is itself a dialog is a lot
  // of ceremony for a link most people will never touch.
  const [confirmReset, setConfirmReset] = useState(false);
  // Kept so a FAILED send does not cost a second SMS. The code proved the number; if the POST then
  // fell over on a flaky connection that proof is still good, and asking them to receive another
  // code would punish them for our failure. Retry goes straight back to the network.
  const [session, setSession] = useState(null);

  /* ── A restored draft has to announce itself ────────────────────────────────────────────────────
   *
   * ⚠️ THE DRAFT SURVIVES SEVEN DAYS, AND A SEEDED ANSWER NARROWS LATER QUESTIONS SILENTLY. That is
   * the fault this closes, and it is not the ordinary "a field was still filled in": `recipient` is
   * asked in one place, and once answered it removes "Who's it for?" from the flow AND splits the
   * celebration question down the child branch. A customer returning inside the week is never asked
   * who the cake is for and is then offered a first birthday, a children's party and a teenager's
   * party as though that were everything the bakery does. It reads as a bakery that only does
   * children's cakes, and nothing on screen explains it.
   *
   * ⚠️ NOT SOLVED BY CLEARING ON ENTRY. The obvious fix — wipe the draft when "Let's make your cake"
   * is tapped — kills resume outright, because that button is the ONLY way in: every return visit
   * would start from nothing and the seven days would never restore anything. A cake is a considered
   * purchase and putting the phone down mid-way is exactly the case the persistence exists for.
   *
   * So it ASKS, once, before the doors. That is simultaneously the fix for the invisible answer, the
   * summary of what is already chosen, and a one-tap clear that is not hidden at the bottom of a
   * screen.
   *
   * ⚠️ Captured from the FIRST render only. Reading it live would make the panel flip back to this
   * screen the moment the customer answered anything, which is the same trap the `asked` list fell
   * into elsewhere in this flow. */
  const [resumeAsked, setResumeAsked] = useState(false);
  const [restored] = useState(() => draftSummary(draft));
  const askResume = restored.length > 0 && !resumeAsked;

  useEffect(() => { saveDraft(draft); }, [draft]);

  const remaining = useMemo(() => FACETS.filter(f => !isFilled(draft, f)), [draft]);
  const ready = canSubmit(draft);
  // Nothing answered yet means nothing to start over from, and a reset link on an empty screen is
  // just a button that does nothing.
  const anyAnswered = remaining.length < FACETS.length;

  // The one place the enquiry actually leaves. Both callers reach it — the verify step on success,
  // and the footer on a retry after a failed send — so the sending/error/sent transitions live here
  // once rather than being written twice and drifting.
  async function send(d, tok) {
    setSending(true); setError(null);
    try {
      await onSubmit?.(d, tok);
      // It is theirs now. Clearing here and not before: a failed send keeps everything, because a
      // timed-out POST is our problem and rebuilding a cake is not the customer's penalty for it.
      clearDraft(slug);
      setSent(true);
    } catch (e) {
      setError(e.message || 'Could not send that just now.');
      // Back to the cake, where the error is visible in the footer. Leaving them on a spent code
      // step with a dead button would strand them.
      setVerifying(false);
    } finally { setSending(false); }
  }

  // ── What the pinned slice is drawn in ─────────────────────────────────────────────────────────
  // Normally the first tier that has a flavour, since that is the one being chosen. Resolved here
  // rather than in the visual so the visual never has to know what a tier is.
  //
  // `preview` lets a facet borrow the stage for something not yet chosen. Only the suggester uses
  // it, and it exists because the alternative was worse: the suggester drew its OWN slice under the
  // pinned one, so the screen carried two cakes in different flavours — the customer's current pick
  // above, the recommendation below — with nothing saying which was which. Reported from the live
  // storefront as "two cake images… can we have only the recommended flavour".
  //
  // Previewing rather than deleting the stage keeps the rule this shell is built on ("if the cake
  // scrolls away we have built a form again") AND makes the pinned cake finally earn being pinned:
  // it now answers the question on screen instead of showing something else.
  const [preview, setPreview] = useState(null);
  const shownFlavour = preview ?? draft.flavours.find(f => f.flavourId) ?? null;

  // ── ONE back button, and it remembers where you were ──────────────────────────────────────────
  // There were two — this header arrow and an inline "← Back" inside the facet — with five
  // different destinations between them across the facets. Which screen you landed on depended on
  // which button you happened to hit, so the same arrow could take you two steps or none.
  // Reported as "two back buttons, both land on the same screen… it behaves so random".
  //
  // The open facet REGISTERS a handler here and returns true if it consumed the Back — the
  // suggester popping a question, the size facet stepping back to the guest count. Only when a
  // facet is at its own first screen (returns false, or never registered) does Back close the
  // facet. So one arrow walks the whole stack, one step at a time, and the facets keep owning
  // their own steps rather than the shell having to know what a "shape step" is.
  //
  // A ref, not state: it is written during a facet's render and only ever read inside an event
  // handler, so it must not trigger one.
  const facetBack = useRef(null);

  // A preview belongs to the facet that set it. Closing or switching facets must drop it, or the
  // stage keeps showing a recommendation from a screen the customer has left.
  useEffect(() => { setPreview(null); facetBack.current = null; }, [open]);

  const primary = palette?.primary ?? baker?.primary_color ?? '#2C4433';
  const accent  = palette?.accent  ?? baker?.accent_color  ?? '#6B8C74';

  // ── Sent ──────────────────────────────────────────────────────────────────────────────────────
  // A fact, and one soft expectation. No duration and no channel: we cannot promise the baker's
  // response time, and naming WhatsApp would be a promise about somebody else's behaviour — quotes
  // go by email today and a baker may simply telephone. A missed promise here is worse than none.
  if (sent) {
    return (
      <div style={s.scrim} onClick={onClose}>
        <div style={s.sheet(isMobile)} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div style={s.doneWrap}>
            {/* Here most of all: this is the screen they remember, and the last thing they see
                should be whose kitchen it went to. */}
            {logo && <img src={logo} alt={baker?.name || 'Bakery'} style={s.doneLogo} />}
            <div style={s.doneTick(primary)}>✓</div>
            <h2 style={s.doneTitle}>It&rsquo;s with {baker?.name || 'the baker'} now.</h2>
            <p style={s.doneBody}>They&rsquo;ll be in touch with your price.</p>
            <button type="button" style={s.send(primary, true)} onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.sheet(isMobile)} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <header style={s.head}>
          <div>
            {/* The logo REPLACES the name rather than sitting beside it — both is a lockup nobody
                designed, and a baker whose logo already contains their name would read it twice.
                Falls back to the name, so a baker with no logo still gets a branded header. */}
            {logo
              ? <img src={logo} alt={baker?.name || 'Bakery'} style={s.logo} />
              : <div style={s.eyebrow}>{baker?.name}</div>}
            <h2 style={s.title}>
              {/* ⚠️ The resume screen brings its OWN question, so the panel must not also ask one.
                  "Where would you like to start?" over "Pick up where you left off?" is two
                  questions stacked, and they disagree — one assumes nothing has happened yet. */}
              {open ? FACET_TITLE[open]
                : verifying ? 'Almost there'
                : askResume ? 'Welcome back'
                : 'Where would you like to start?'}
            </h2>
          </div>
          <button type="button"
                  onClick={open
                    ? () => { if (!facetBack.current?.()) setOpen(null); }
                    : verifying ? () => setVerifying(false) : onClose}
                  aria-label={open || verifying ? 'Back' : 'Close'} style={s.close}>
            {open || verifying ? '←' : '✕'}
          </button>
        </header>

        <div style={s.body(isMobile)}>
          {/* PINNED, on both layouts. If the cake scrolls away we have built a form again — the
              whole reason this is not a wizard is that something happens on every tap, and that
              only lands if the thing is still visible when you tap. */}
          <div style={s.stage(isMobile, primary)}>
            {/* Smaller on a phone than it was. The plan says the cake stays PINNED — "if it scrolls
                away it is a form" — and that still holds; but at 170 it was a third of the sheet, and
                the answer to its own open question ("unless it costs too much of a small screen") is
                that six choices crowding the bottom edge is too much. */}
            <CakeVisual facet={open} flavour={shownFlavour} primary={primary} accent={accent}
                        height={isMobile ? 124 : 230} />
          </div>

          <div style={s.panel(isMobile)}>
            {open
              ? (renderFacet?.({ facet: open, draft, patch, close: () => setOpen(null), api })
                 ?? <Facet facet={open} draft={draft} patch={patch} api={api}
                           bakerName={baker?.name} slug={slug} close={() => setOpen(null)}
                           setTierCount={(n) => patch({ __tierCount: n })}
                           onStartDesign={onStartDesign}
                           accent={accent} setPreview={setPreview} facetBack={facetBack}
                           leadTimeDays={leadTimeDays} />)
              : verifying ? (
                <VerifyStep
                  apiBaseUrl={apiBaseUrl} slug={slug} bakerName={baker?.name || 'the baker'}
                  captchaSiteKey={captchaSiteKey} primary={primary}
                  otpRequired={otpRequired} channels={otpChannels}
                  initialPhone={draft.contact.phone} initialEmail={draft.contact.email}
                  initialName={draft.contact.name}
                  // ── Anything the facets could not ask for ─────────────────────────────────────
                  // Lives on the DRAFT, not inside the verify step, so it survives going back to
                  // the cake and comes back with a draft restored days later.
                  //
                  // Asked HERE and not on the entry screen, which is where it was first built. A
                  // textarea sitting among the two doors makes the chooser look like a form and
                  // invites somebody to start writing when the screen's whole argument is that they
                  // should be picking. At the point of sending, the question is a natural last one.
                  note={draft.details.specialInstructions}
                  onNote={v => patch({ details: { specialInstructions: v } })}
                  onBack={() => setVerifying(false)}
                  onVerified={(tok, contact, name, channel) => {
                    // Keep the proved number on the draft. The server takes the contact from the
                    // token and ignores this, but a draft that disagrees with what was sent would
                    // mislead anyone who came back to it.
                    // Routed by CHANNEL. It briefly wrote every verified contact to `phone`, so an
                    // email arrived on the order as a phone number — invisible in production, where
                    // the server reads the contact from the token, but wrong on the suppressed path
                    // where the body is what the baker gets.
                    const field = channel === 'email' ? { email: contact } : { phone: contact };
                    patch({ contact: { ...field, name } });
                    setSession(tok);
                    send({ ...draft, contact: { ...draft.contact, ...field, name } }, tok);
                  }}
                />
              ) : askResume ? (
                /* Before the doors, and instead of them — a choice this small is not a banner to
                   be scrolled past. It names what is being resumed, because "continue?" with no
                   object is a question nobody can answer. */
                <div style={s.resumeWrap}>
                  <div style={s.resumeTitle}>Pick up where you left off?</div>
                  <div style={s.resumeChips}>
                    {restored.map((r, i) => <span key={i} style={s.resumeChip}>{r}</span>)}
                  </div>
                  <button type="button" style={s.entry(primary)} onClick={() => setResumeAsked(true)}>
                    <span style={s.entryLabel}>Continue this cake</span>
                  </button>
                  <button type="button" style={s.resumeFresh}
                          onClick={() => { patch({ __reset: true }); setResumeAsked(true); }}>
                    Start a new one
                  </button>
                </div>
              ) : (
                <>
                  {ENTRIES.map(e => (
                    <button key={e.facet} type="button" onClick={() => setOpen(e.facet)}
                            style={s.entry(primary)}>
                      <span style={s.entryLabel}>{e.label}</span>
                      {isFilled(draft, e.facet) && <span style={s.tick(primary)}>✓</span>}
                    </button>
                  ))}

                  {/* What is left, as an invitation rather than a checklist. Nothing here is
                      required — someone who sends a photo and a date has made a real enquiry, and
                      demanding the rest would rebuild the corridor this design exists to remove. */}
                  {remaining.length > 0 && (
                    <div style={s.rest}>
                      {remaining.filter(f => !ENTRIES.some(e => e.facet === f)).map(f => (
                        <button key={f} type="button" onClick={() => setOpen(f)} style={s.restBtn}>
                          {FACET_CHIP[f]}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── Start over ───────────────────────────────────────────────────────────────
                      The draft SURVIVES the tab closing, which is the point of it — somebody can
                      put their phone down mid-cake and come back. The cost is that a customer
                      returning days later meets a half-answered cake with no way to clear it, and
                      until now the only cure was clearing site data.

                      Quiet, and at the bottom: it is the least likely thing anybody came here to
                      do, and it sits below the doors so it can never be the first thing tapped. */}
                  {anyAnswered && (
                    <div style={s.resetWrap}>
                      {confirmReset ? (
                        <>
                          <span style={s.resetAsk}>Clear everything and start again?</span>
                          <button type="button" style={s.resetYes}
                                  onClick={() => { patch({ __reset: true }); setConfirmReset(false); }}>
                            Yes, start over
                          </button>
                          <button type="button" style={s.resetNo}
                                  onClick={() => setConfirmReset(false)}>Cancel</button>
                        </>
                      ) : (
                        /* ⚠️ A BUTTON, not a 12px link. It was styled quiet and put at the bottom
                           on the reasoning that it is "the least likely thing anybody came here to
                           do" — but it turned out to be the CURE for the commonest confusion (a
                           draft restored days later), and the first person to hit that could not
                           find it. Quiet is right for something rarely wanted; this is rarely
                           wanted and urgently needed when it is. */
                        <button type="button" style={s.resetBtn}
                                onClick={() => setConfirmReset(true)}>Start over</button>
                      )}
                    </div>
                  )}
                </>
              )}
          </div>
        </div>

        {!open && !verifying && (
          <footer style={s.foot}>
            {/* Already verified — a previous send failed — so retry goes straight to the network.
                Re-asking for a code they have already given would charge them for our failure. */}
            <button type="button" disabled={!ready || sending}
                    onClick={() => { setError(null); session ? send(draft, session) : setVerifying(true); }}
                    style={s.send(primary, ready && !sending)}>
              {sending ? 'Sending…' : session ? 'Try again' : `Send to ${baker?.name || 'the baker'}`}
            </button>
            {/* Errors only. There is no standing hint: the gate is now "one thing about the cake",
                which the two doors and the chips above already make obvious, and a line explaining a
                button you can see is disabled reads as nagging. Name and contact are asked for on
                the next screen, where they belong together. */}
            {error && <div style={s.err}>{error}</div>}
          </footer>
        )}
      </div>
    </div>
  );
}

// Which facet's body to show. A plain switch rather than a registry: there are four, they are
// named in one place, and a registry would hide that from anyone reading this file.
function Facet({ facet, ...props }) {
  if (facet === 'design')  return <DesignFacet {...props} />;
  if (facet === 'flavour') return <FlavourFacet {...props} />;
  if (facet === 'size')    return <SizeFacet {...props} />;
  return <DateFacet {...props} />;
}

const s = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28, 24, 22, 0.44)',
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: (m) => ({
    background: '#FFFDF9', borderRadius: m ? '20px 20px 0 0' : 22, overflow: 'hidden',
    boxShadow: '0 24px 70px rgba(28,24,22,0.28)', display: 'flex', flexDirection: 'column',
    width: m ? '100%' : 'min(880px, 100%)',
    maxHeight: m ? '94vh' : 'calc(100vh - 32px)',
    ...(m ? { position: 'fixed', left: 0, right: 0, bottom: 0 } : {}),
  }),
  head: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '18px 20px 14px', flexShrink: 0,
  },
  eyebrow: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
             color: '#B3A79A' },
  // Capped on BOTH axes: a wide wordmark and a square emblem are both common, and constraining one
  // dimension only lets the other run away and shove the title out of the header.
  logo:    { maxHeight: 26, maxWidth: 150, objectFit: 'contain', display: 'block' },
  doneLogo:{ maxHeight: 34, maxWidth: 180, objectFit: 'contain', display: 'block', marginBottom: 4 },
  title:   { fontSize: 21, fontWeight: 800, color: '#2A241F', margin: '3px 0 0', letterSpacing: '-0.01em' },
  close:   { border: 'none', background: '#F1EBE3', width: 32, height: 32, borderRadius: '50%',
             cursor: 'pointer', fontSize: 14, color: '#6B5F55', flexShrink: 0 },

  body:  (m) => ({ display: 'flex', flexDirection: m ? 'column' : 'row', gap: 0,
                   minHeight: 0, flex: 1 }),
  stage: (m, primary) => ({
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `linear-gradient(180deg, ${primary}0D, ${primary}03)`,
    width: m ? '100%' : 340, padding: m ? '4px 0 6px' : '0 12px',
  }),
  // ⚠️ The bottom padding on mobile was 4px, against 18px on desktop — backwards. A phone needs MORE
  // room at the bottom, not less: the home indicator sits there, and a row of choices flush against
  // the screen edge reads as cut off even when every pixel is present. safe-area-inset keeps it clear
  // of the gesture bar on the devices that have one, and falls back to a plain 18px where env() is
  // unsupported.
  panel: (m) => ({ flex: 1, minHeight: 0, overflowY: 'auto',
                   padding: m ? '14px 18px calc(18px + env(safe-area-inset-bottom, 0px))' : '4px 22px 18px',
                   display: 'flex', flexDirection: 'column', gap: 10 }),

  entry: (primary) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '16px 18px', borderRadius: 14, border: `1.5px solid ${primary}22`,
    background: '#fff', font: 'inherit',
  }),
  entryLabel: { fontSize: 15, fontWeight: 700, color: '#2A241F', lineHeight: 1.35 },
  tick: (primary) => ({ color: primary, fontWeight: 800, fontSize: 14 }),

  rest:    { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  resetWrap: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  resetBtn:  { border: '1.5px solid #DFD6C8', background: '#fff', borderRadius: 11,
               padding: '10px 16px', font: 'inherit', fontSize: 13, fontWeight: 700,
               color: '#6B5B4C', cursor: 'pointer' },
  resumeWrap:  { display: 'flex', flexDirection: 'column', gap: 10 },
  resumeTitle: { fontSize: 17, fontWeight: 800, color: '#3D3226' },
  resumeChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  resumeChip:  { fontSize: 12, fontWeight: 700, color: '#6B5B4C', background: '#F4EFE7',
                 border: '1px solid #E5DCCF', borderRadius: 999, padding: '5px 10px' },
  resumeFresh: { border: '1.5px solid #DFD6C8', background: '#fff', borderRadius: 12,
                 padding: '12px 16px', font: 'inherit', fontSize: 14, fontWeight: 700,
                 color: '#6B5B4C', cursor: 'pointer' },
  resetLink: { border: 'none', background: 'none', font: 'inherit', fontSize: 12, fontWeight: 700,
               color: '#A2968A', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  resetAsk:  { fontSize: 12.5, fontWeight: 700, color: '#7A6C60' },
  resetYes:  { border: '1.5px solid #C0392B', background: '#fff', borderRadius: 9, padding: '6px 11px',
               font: 'inherit', fontSize: 12, fontWeight: 800, color: '#C0392B', cursor: 'pointer' },
  resetNo:   { border: 'none', background: 'none', font: 'inherit', fontSize: 12, fontWeight: 700,
               color: '#7A6C60', cursor: 'pointer', padding: '6px 4px' },
  restBtn: { padding: '8px 13px', borderRadius: 20, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#7A6C60', cursor: 'pointer' },

  foot: { flexShrink: 0, padding: '12px 20px calc(18px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid #F0E9E0', background: '#FFFDF9' },
  send: (primary, ready) => ({
    width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
    background: ready ? primary : '#E3DBD1', color: ready ? '#fff' : '#A2968A',
    font: 'inherit', fontSize: 15, fontWeight: 800, cursor: ready ? 'pointer' : 'default',
  }),
  hint: { fontSize: 11.5, color: '#A2968A', fontWeight: 600, textAlign: 'center', marginTop: 8 },
  err:  { fontSize: 12, color: '#C0392B', fontWeight: 700, textAlign: 'center', marginTop: 8 },

  doneWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
               padding: '46px 26px 34px', textAlign: 'center' },
  doneTick:  (primary) => ({ width: 54, height: 54, borderRadius: '50%', display: 'flex',
                             alignItems: 'center', justifyContent: 'center', fontSize: 24,
                             color: '#fff', background: primary, marginBottom: 4 }),
  doneTitle: { fontSize: 21, fontWeight: 800, color: '#2A241F', margin: 0 },
  doneBody:  { fontSize: 13.5, color: '#7A6C60', margin: '0 0 14px' },
};
