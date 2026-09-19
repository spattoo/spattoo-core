import { useCallback, useMemo, useState } from 'react';
import { Captcha } from '../../auth/Captcha.jsx';
import { useOtp } from '../useOtp.js';
import { FONT, SERIF, alpha, darken, lum, mix, onColor } from '../storefrontKit.js';
import { useTrimmedLogo } from '../../shared/useTrimmedLogo.js';

// ── Proving the number, at the last possible moment ─────────────────────────────────────────────
// The baker's next action on every enquiry is to phone the customer. That makes the number the one
// field worth proving, and an unverified one makes the whole record worthless — a beautiful enquiry
// nobody can answer.
//
// ── WHY HERE AND NOT AT THE DOOR ────────────────────────────────────────────────────────────────
// Asking a browsing stranger to verify a phone before they may look at cakes empties the funnel:
// they have nothing invested and no reason to trust the ask. Asking at SUBMIT costs almost nothing,
// because by then they want to be called. The draft lives in localStorage, so somebody who bails
// half-way through verification loses none of what they built.
//
// ── THE ONE EXCEPTION: THE 3D DESIGNER ──────────────────────────────────────────────────────────
// `/{slug}/design` asks first, and the reason is not that designing is more precious than browsing.
// It is that the designer CANNOT WORK without a session: every catalogue route behind it
// (/api/elements, /element-types, /materials, /textures, /cake-shapes) requires one, so an
// unverified visitor got the shell, an empty decorations panel, and a console full of 401s with
// nothing on screen explaining why. The choice there was never "verify or browse" — it was "verify
// or a broken page". Found 2026-08-17 on super-bake.spattoo.dev.
//
// So the rule stands everywhere it was written for. It bends only where the alternative is showing
// someone a room with nothing in it. If those catalogue routes ever accept an anonymous caller with
// a valid baker slug, this exception should go with them.
//
// ── WHY THE NUMBER IS TYPED HERE, NOT EARLIER ───────────────────────────────────────────────────
// The date facet used to ask for a phone. It no longer does. Collecting it there and verifying it
// here would ask the same question twice, and the second ask reads as though the first was not
// believed.

// What each channel calls itself, asks for, and how a phone keyboard should behave for it. One
// table rather than ternaries at six call sites — adding WhatsApp later is a row, not a hunt.
const CHANNEL = {
  sms:   { pick: 'Text me',  ask: 'Phone number',   mode: 'tel',   sent: 'a 6-digit code to' },
  email: { pick: 'Email me', ask: 'Email address',  mode: 'email', sent: 'a 6-digit code to' },
};

export default function VerifyStep({
  apiBaseUrl, slug, bakerName: bakerNameProp, captchaSiteKey, primary,
  initialPhone = '', initialEmail = '', initialName = '',
  // Which channels the SERVER will accept, in its order of preference — read back from /settings so
  // a channel we cannot deliver on is never offered. SMS to an Indian number needs DLT clearance;
  // offering it before that is how a customer waits for a code a telco already scrubbed.
  channels = ['sms'],
  otpRequired = true, onVerified, onBack,
  // ⚠️ THIS SCREEN IS NOT ALWAYS A SEND. It was written for the enquiry, where the customer really
  // is handing a design to the baker, so both buttons said so. The order page reuses it as a plain
  // door: the customer arrived from a WhatsApp link and is proving the address is theirs so they
  // can SEE their order — nothing is sent, and `onBack` goes to the shop front, not to a cake. A
  // button reading "Send to 31 Bakers" there tells them pressing it will message the bakery, which
  // is the one thing it does not do. So the caller names the action; the defaults leave the
  // enquiry exactly as it was.
  submitLabel = null, backLabel = 'Back to my cake',
  // ⚠️ AND THE WORDS, for the same reason as the buttons. "${bakerName} will be in touch about your
  // cake" is true at SUBMIT and false at the designer door: nothing has been sent, there is no cake
  // yet, and nobody is getting in touch. The door asks only because the designer cannot work without
  // a session — every catalogue route behind it 401s (see "THE ONE EXCEPTION" above). Telling
  // somebody they will be contacted, to open a tool, is a promise made on the baker's behalf that
  // the baker has not been asked about.
  // Sandeep, 2026-09-19: "i came here to design the cake and the cake design is not ready yet."
  title = null, lede = null,
  /* ⚠️ ASKING A NAME WE ALREADY HAVE. The field exists so the customer row the API binds on success
     is not nameless — see the note on `verify` below. On the ORDER route that row already exists,
     with a name, because the order was placed through it: the person clicked a link in a message
     addressed to them by name. Asking again reads as not being believed, and it is a second field
     between someone and the order they were invited to look at.
     Sandeep, 2026-09-19: "we should not ask name every time." */
  askName = true,
  /* ── IS THIS SCREEN THE PAGE, OR A STEP INSIDE ONE? ────────────────────────────────────────────
   * The enquiry reaches this as the last STEP inside FacetShell's sheet, which already carries the
   * bakery's name, colours and the cake being ordered — a second wordmark there is the shop sign
   * hung twice. The designer and order doors reach it as the WHOLE PAGE, on a bare route, and that
   * is the screen Sandeep called "very boring": a left-aligned form flush against the top-left of
   * an empty white viewport, with nothing on it to say whose shop this is.
   * `standalone` is the difference, so the chrome goes only where there is nothing else.
   * ⚠️ IT ALSO OWNS THE 100vh. `wrap` used to force full height and a white ground unconditionally,
   * for the standalone case (see the note on `page` below) — inside the sheet that painted over the
   * shell's tinted panel and made a 340px step scroll. */
  standalone = false,
  /* The bakery's mark, for the header `standalone` draws. Optional and it stays optional: the name
     is the fallback, and when the settings read failed there is no header at all rather than one
     reading "the bakery". Trimmed at render like every other surface — see useTrimmedLogo. */
  logoUrl = null,
  // One small line above the title saying where this is ("Your order", "Cake designer"). The title
  // says what happens next; this says what you are standing in front of.
  eyebrow = null,
  // The customer's own words, held on the draft by FacetShell. See `noteField` below.
  note = '', onNote,
}) {
  /* ⚠️ THE NAME IS NOT GUARANTEED, and this screen says it seven times. It comes from
     /storefront/:slug/settings, and both callers deliberately swallow a failed read rather than
     strand the gate (`.catch(() => setSettings({}))`) — so a 404, an unpublished storefront or a
     flaky network leaves it undefined and every line here reads "Who shall undefined ask for?".
     Seen 2026-09-18 on the order page, which is reached from a WhatsApp button, so the first thing a
     customer would have read was a bug.
     "the bakery" is not a good name — it is just never a broken one. */
  const bakerName = bakerNameProp || 'the bakery';
  const sendLabel = submitLabel || `Send to ${bakerName}`;

  const [channel, setChannel] = useState(channels[0] ?? 'sms');
  const [noteOpen, setNoteOpen] = useState(false);
  // ONE field holding whichever contact the chosen channel wants. Seeded from the matching side of
  // the draft — an email typed last time should not reappear in a box now labelled Phone number.
  const [phone, setPhone] = useState((channels[0] ?? 'sms') === 'email' ? initialEmail : initialPhone);
  // Asked HERE, with the contact, rather than inside the date facet. They are one question — who
  // you are and how the baker reaches you — and splitting them made the Send button look dead for a
  // reason that lived two screens away.
  const [name, setName] = useState(initialName);
  // Nothing to withhold when we are not asking: the button must not wait for a field that is gone.
  const named = !askName || !!name.trim();
  const captchaConfigured = !!captchaSiteKey;
  const ch = CHANNEL[channel] ?? CHANNEL.sms;

  // Every colour on this screen is derived from the ONE the baker chose, so it belongs to their shop
  // rather than to ours. Rebuilt only when that colour or the mode changes.
  const s = useMemo(() => makeStyles(primary || '#2C4433', standalone), [primary, standalone]);
  const logo = useTrimmedLogo(standalone ? logoUrl : null);
  useGateCss();

  /* The shop sign. Only where the page has no other identity on it, and only when we actually KNOW
     the identity — with a failed settings read `bakerName` is the word "bakery", and setting that in
     a wordmark is worse than an unbranded card. */
  const brand = standalone && (logo || bakerNameProp) ? (
    logo
      ? <img src={logo} alt={bakerName} style={s.brandLogo} />
      : <div style={s.brandName}>{bakerName}</div>
  ) : null;

  /* ── ONE surface, drawn in two shapes ──────────────────────────────────────────────────────────
   * Wrapping rather than a second copy of the form: the three branches below (OTP suppressed, ask
   * for the contact, read the code) already repeat enough, and a chrome pasted into each is the
   * version that ends up disagreeing with itself. */
  const shell = (children) => (standalone
    ? <div style={s.page}><div style={s.card}>{brand}{children}</div></div>
    : <div style={s.wrap}>{children}</div>);

  // Above the title, in the baker's own ink. Standalone only — inside the sheet the facet header is
  // already doing this job two inches higher.
  const eyebrowEl = eyebrow && standalone ? <div style={s.eyebrow}>{eyebrow}</div> : null;

  const send = useCallback(async (captchaToken) => {
    await postJSON(`${apiBaseUrl}/api/storefront/${slug}/send-otp`, {
      to: phone.trim(), channel, captchaToken,
    });
  }, [apiBaseUrl, slug, phone, channel]);

  // `name` rides along so the customer row the API binds on success is not nameless. It is
  // best-effort on the server — an unnamed prospect is better than a failed login — but the name is
  // sitting in a field two inches above this button, so there is no reason to throw it away and
  // make the baker meet "(no name)" in their list.
  const verify = useCallback(async (code) => (
    postJSON(`${apiBaseUrl}/api/storefront/${slug}/verify-otp`,
             { to: phone.trim(), channel, code, name: name.trim() || undefined })
  ), [apiBaseUrl, slug, phone, channel, name]);

  const otp = useOtp({ send, verify, onVerified: (r) => onVerified?.(r.session, phone.trim(), name.trim(), channel) });

  // ── "Anything else?" ──────────────────────────────────────────────────────────────────────────
  // The facets ask the four questions worth asking everybody. This is the fifth, which is different
  // every time — no nuts, it is a surprise, leave it with the neighbour, my daughter drew this.
  // Nothing structured holds that, and without it the only place to say it was a WhatsApp message
  // after the enquiry, which is the round trip this whole flow exists to remove.
  //
  // COLLAPSED. Most people have nothing to add, and an open textarea on the last screen before
  // sending reads as one more thing between them and being done.
  //
  // ASKED HERE, not on the entry screen, which is where it was first built. A textarea among the
  // two doors makes the chooser look like a form and invites somebody to start writing when the
  // screen's whole argument is that they should be picking. At the point of sending it is a natural
  // last question.
  //
  // Rendered in BOTH branches — OTP and suppressed — because it belongs to the act of sending, not
  // to the act of proving a number. Defined once rather than pasted twice.
  //
  // It rides in `special_instructions`, which cakeDraft's buildInstructions() already appends LAST,
  // after the occasion and the message: the baker reads the generated lines first and the
  // customer's own words at the end, where they read as a remark rather than another field. No
  // schema change — the column, the payload and the composition were all already there.
  const noteField = onNote && (
    (noteOpen || note.trim()) ? (
      <textarea
        style={s.noteInput} rows={3} maxLength={500}
        autoFocus={noteOpen && !note}
        placeholder="Anything else? Allergies, delivery details, how you'd like it to look…"
        value={note} onChange={e => onNote(e.target.value)} aria-label="A note for the baker"
      />
    ) : (
      <button type="button" style={s.noteOpen} onClick={() => setNoteOpen(true)}>+ Add a note</button>
    )
  );

  // ── OTP suppressed ────────────────────────────────────────────────────────────────────────────
  // STOREFRONT_OTP_REQUIRED=false on the API, read back through /settings. Temporary, for the window
  // where SMS delivery is not yet wired to Supabase.
  //
  // The step SURVIVES rather than being skipped, because the number is still needed — the baker's
  // next action is to phone the customer whether or not we checked the line first. Only the proving
  // goes. Skipping the screen entirely would drop the one field the enquiry cannot do without, and
  // the copy would then have to lie about having checked it.
  if (!otpRequired) {
    const ready = !!phone.trim() && named;
    return shell(
      <>
        {eyebrowEl}
        <h3 style={s.title}>{title ?? "We can't wait to bake this"}</h3>
        <p style={s.sub}>{lede ?? 'We\u2019ll call or message you about your cake.'}</p>
        {askName && (
          <input className="spattoo-gate-input" style={s.input} value={name}
                 onChange={e => setName(e.target.value)}
                 placeholder="Your name" autoFocus aria-label="Your name" />
        )}
        <input className="spattoo-gate-input" style={s.input} value={phone}
               onChange={e => setPhone(e.target.value)}
               inputMode={ch.mode} placeholder={ch.ask} aria-label={ch.ask} autoFocus={!askName} />
        {noteField}
        <button type="button" className="spattoo-gate-cta" style={s.primary(primary, ready)}
                disabled={!ready}
                onClick={() => onVerified?.(null, phone.trim(), name.trim(), channel)}>
          {sendLabel}
        </button>
        <button type="button" style={{ ...s.link, marginTop: 2 }} onClick={onBack}>{backLabel}</button>
      </>
    );
  }

  // ONE widget for the whole step, rendered outside the step branch so moving to the code entry
  // does not remount it — a remount would throw away a solved captcha the resend still needs.
  const captchaEl = (
    <Captcha ref={otp.captchaRef} siteKey={captchaSiteKey}
             onVerify={otp.setCaptchaToken} onExpire={() => otp.setCaptchaToken(null)}
             style={{ margin: '2px 0' }} />
  );

  return shell(
    <>
      {otp.step === 'start' && eyebrowEl}
      <h3 style={s.title}>
        {/* Only the FIRST screen is context-dependent. "Enter the code" is true wherever this is
            used, and so is the line under it. */}
        {otp.step === 'start' ? (title ?? "We can't wait to bake this") : 'Enter the code'}
      </h3>
      <p style={s.sub}>
        {otp.step === 'start'
          // Says why, because "verify your number" with no reason reads as a hoop. The reason is
          // true and it is the customer's benefit, not ours — which is exactly why a caller whose
          // reason is DIFFERENT has to be able to say so.
          ? (lede ?? (channel === 'email'
              ? 'We\u2019ll be in touch about your cake, so we just need to check this reaches you.'
              : 'We\u2019ll call or message you about your cake, so we just need to check this number works.'))
          : <>We sent a 6-digit code to <b>{phone.trim()}</b>.</>}
      </p>

      {/* Only when there is a genuine choice. One channel is not a decision, and rendering a single
          disabled-looking tab would invite somebody to hunt for the other. */}
      {otp.step === 'start' && channels.length > 1 && (
        <div style={s.tabs} role="group" aria-label="How to send the code">
          {channels.map(c => (
            <button key={c} type="button" aria-pressed={channel === c}
                    style={{ ...s.tab, ...(channel === c ? s.tabOn() : null) }}
                    onClick={() => {
                      // The contact belongs to the channel, so switching clears it — an email left
                      // in the box after a switch to SMS is a guaranteed failed send.
                      if (c !== channel) { setChannel(c); setPhone(''); otp.setErr(null); }
                    }}>
              {CHANNEL[c]?.pick ?? c}
            </button>
          ))}
        </div>
      )}

      {captchaEl}

      {otp.step === 'start' ? (
        <>
          {askName && (
            <input
              className="spattoo-gate-input"
              style={s.input} value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" autoFocus aria-label="Your name"
            />
          )}
          <input
            className="spattoo-gate-input"
            style={s.input} value={phone} onChange={e => setPhone(e.target.value)}
            inputMode={ch.mode} placeholder={ch.ask}
            aria-label={ch.ask}
            /* The cursor lands in the first field there IS. Without this, hiding the name left the
               screen with nothing focused and a keyboard that never opened on a phone. */
            autoFocus={!askName}
          />
          {/* On the CONTACT phase only. The code screen is one job — read six digits, type six
              digits — and a textarea there would be a second thing to do while a timer runs. */}
          {noteField}
          <button type="button" className="spattoo-gate-cta"
                  style={s.primary(primary, !!phone.trim() && named && !otp.sendBlocked(captchaConfigured))}
                  disabled={!phone.trim() || !named || otp.sendBlocked(captchaConfigured)}
                  onClick={otp.send}>
            {otp.busy ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <input
            className="spattoo-gate-input"
            style={s.input} value={otp.code} onChange={e => otp.setCode(e.target.value)}
            inputMode="numeric" placeholder="6-digit code" autoFocus
            aria-label="Verification code"
          />
          <button type="button" className="spattoo-gate-cta"
                  style={s.primary(primary, !!otp.code.trim() && !otp.busy)}
                  disabled={!otp.code.trim() || otp.busy} onClick={otp.verify}>
            {otp.busy ? 'Checking…' : sendLabel}
          </button>
          {/* Error first, before the escape hatches — a wrong digit is the common case, and the
              explanation belongs where the eye already is rather than below three links. */}
          {otp.err && <div style={s.err}>{otp.err}</div>}
          <div style={s.links}>
            <button type="button" style={s.link} disabled={otp.sendBlocked(captchaConfigured)}
                    onClick={otp.send}>
              Resend code
            </button>
            {/* Back to the number, for the commonest failure of all: they typed it wrong. Without
                this the only way out is to abandon the enquiry. */}
            <button type="button" style={s.link} onClick={otp.reset}>
              {channel === 'email' ? 'Change address' : 'Change number'}
            </button>
          </div>
        </>
      )}

      {otp.step === 'start' && otp.err && <div style={s.err}>{otp.err}</div>}
      <button type="button" style={{ ...s.link, marginTop: 2 }} onClick={onBack}>{backLabel}</button>
    </>
  );
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
  return res.json();
}

/* ── Focus and press, which inline styles cannot express ─────────────────────────────────────────
 *
 * Injected once, the same way `shared/NavRow.jsx` does it and for the same reason: this library is
 * vendored into two apps and neither bundles our stylesheets.
 *
 * ⚠️ THE COLOUR IS A CSS VARIABLE, NOT A LITERAL, because it is the BAKER's and there is one
 * stylesheet for every baker. `--gate-ink` is set inline on the surface, so the same rule paints a
 * sage focus ring in one shop and a plum one in the next.
 *
 * ⚠️ AND THE INPUTS HAD NO FOCUS STATE AT ALL. Every field here was a bare inline-styled <input>, so
 * the only thing marking the active one was the browser's default outline — which `apps/app` resets
 * away. On the screen where somebody types a phone number and then a code, nothing said which box
 * they were in.
 */
const CSS = `
  .spattoo-gate-input { transition: box-shadow .15s; }
  /* ⚠️ THE EDGE IS DRAWN WITH A SHADOW, NOT border-color, and that is not a style choice. The rest
     state is an INLINE \`border: 1.5px solid #E7DFD5\`, and an inline declaration beats a stylesheet —
     so \`border-color\` here silently never applied (measured: the focused field stayed #E7DFD5).
     A 1.5px ring laid over the border repaints the same edge and cannot lose. */
  .spattoo-gate-input:focus {
    outline: none;
    box-shadow: 0 0 0 1.5px var(--gate-ink, #2C4433), 0 0 0 4.5px var(--gate-ink-soft, rgba(44,68,51,0.18));
  }
  .spattoo-gate-cta { transition: transform .12s, box-shadow .15s, filter .15s; }
  .spattoo-gate-cta:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
  .spattoo-gate-cta:active:not(:disabled) { transform: translateY(0); filter: brightness(0.97); }
  .spattoo-gate-cta:focus-visible { outline: 2px solid var(--gate-ink, #2C4433); outline-offset: 3px; }
`;

let injected = false;
function useGateCss() {
  if (typeof document !== 'undefined' && !injected) {
    injected = true;
    const el = document.createElement('style');
    el.dataset.spattoo = 'gate';
    el.textContent = CSS;
    document.head.appendChild(el);
  }
}

/* ── How the gate is dressed ─────────────────────────────────────────────────────────────────────
 *
 * Sandeep, 2026-09-19, about the order door: "over all, this login screen is very boring." It was —
 * and boring was the least of it. It was the FIRST thing a paying customer saw after tapping a link
 * in a WhatsApp message from their bakery, and it carried nothing of that bakery: white, flush
 * top-left, a 18px sans heading, two grey boxes.
 *
 * ── WHERE THE LOOK COMES FROM, AND WHY IT IS NOT NEW ────────────────────────────────────────────
 * `WelcomeModal` in CustomerStorefront.jsx already solved "a card that speaks to a customer in their
 * baker's voice": an eyebrow in the baker's ink, the mark, a Cormorant heading, muted body, and a
 * CTA carrying a soft shadow of the same colour. That is the customer-facing house style, so this
 * screen wears it rather than inventing a second one — including `mix(primary, '#2b2228', 0.42)` for
 * headings, which is the recipe that keeps a PALE brand colour readable as type.
 *
 * ── WHAT WAS CONSIDERED AND DROPPED ─────────────────────────────────────────────────────────────
 * · The cake's own picture above the title. It cannot go here: the gate is what stands BEFORE the
 *   session, so rendering the order's photo would show the order to whoever holds the link, which is
 *   the exact thing the code is being asked for.
 * · `heroes/CakeLine.jsx`, the ink drawing, as decoration. Its own file forbids it in as many
 *   words — "the hero art for the INK theme, and its alone... re-using this drawing anywhere else
 *   would rebuild that problem with a nicer line". A gate wearing Ink's picture would make every
 *   baker's door look like one theme's.
 *
 * So the warmth comes from the shop, not from art we do not have: their colour on the ground, their
 * mark at the top, their colour under the button.
 */
function makeStyles(primary, standalone) {
  /* ⚠️ A BAKER CAN PICK A PALE COLOUR, and half of this screen is that colour used as TYPE. Measured
     with a real brand yellow (#F2D24E): the eyebrow came out 1.5:1 on the white card — a line nobody
     can read — and the focus ring with it. `doorInk` in FacetShell.jsx solved exactly this for the
     door outlines, and its threshold is reused rather than re-picked, so the storefront has ONE
     definition of "is this colour light": 0.6, which is also `onColor`'s.
     The CTA keeps the raw colour — a pale button is fine, because `onColor` flips its text. */
  const brand  = lum(primary) > 0.6 ? darken(primary, 0.45) : primary;

  /* ⚠️ AND ONE DARKENING STEP IS NOT ENOUGH FOR EVERY COLOUR. `darken(c, 0.45)` is a fixed guess, and
     a baker whose brand is nearly white (#F7F4EF is a real shade of cream) still lands too light
     after it: measured 4.36:1 for the lede, under the 4.5 that 14px body text needs. So the small
     text is darkened until it MEASURES readable rather than until a constant says it should be.
     0.36 relative luminance is about 4.6:1 against the white card. */
  const readable = (c) => { let o = c; for (let i = 0; i < 8 && lum(o) > 0.36; i++) o = darken(o, 0.2); return o; };

  // Everything else derives from that one safe colour, so the ground, the ink and the shadow can
  // never end up belonging to different bakers.
  const ink    = mix(brand, '#2b2228', 0.42);     // headings — readable whatever hue was chosen
  const muted  = readable(mix(brand, '#6f696c', 0.5));   // body copy, still tinted, never grey-by-default
  /* The eyebrow is 10.5px, so it is small text and wants 4.5:1 — the brand alone reached only 4.3
     against a real pale pink. A short pull toward the heading ink keeps the hue and clears the bar.
     Measured across four brand colours, not guessed: see the note above. */
  const label  = readable(mix(brand, '#2b2228', 0.2));
  const ground = mix(primary, '#FBF8F5', 0.95);   // the page wash: a breath of the brand, not a wall

  return {
    /* ⚠️ THE PAGE DRAWS ITS OWN BACKGROUND, because standalone it IS the page and the app's body is
       DARK. apps/app globals.css sets `body { background: #111111 }` on purpose — "so the redirect
       into the app + the loading state never flash white" — and says in the same breath that
       "full-screen surfaces draw their own background over this". This one did not, and the title
       was dark grey on #111.
       Seen 2026-09-18 on the order page's gate, which a customer reaches from a WhatsApp button, so
       the first screen they meet was near-unreadable. The designer's door has the same shape.
       100vh, not 100%: as a standalone gate its parent has no height, so a percentage collapses to
       the content and leaves a band of the app's black below it. */
    page: {
      minHeight: '100vh', boxSizing: 'border-box', background: ground, fontFamily: FONT,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      // More room at the bottom than the top on a phone: the home indicator lives there.
      padding: '26px 18px calc(30px + env(safe-area-inset-bottom, 0px))',
      '--gate-ink': brand, '--gate-ink-soft': alpha(brand, 0.2),
    },
    card: {
      width: '100%', maxWidth: 380, boxSizing: 'border-box', background: '#FFFFFF',
      borderRadius: 22, padding: '26px 22px 18px', color: '#1a1a1a',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: `0 18px 44px ${alpha(primary, 0.14)}, 0 2px 6px rgba(28,20,24,0.06)`,
    },
    /* Inside FacetShell. No ground, no height and no white: the sheet around it already paints a
       tinted panel, and the previous unconditional `background:#FFF; minHeight:100vh` covered that
       panel over and made one step of a four-step flow scroll on its own. */
    wrap: {
      display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 2px 4px', color: '#1a1a1a',
      '--gate-ink': brand, '--gate-ink-soft': alpha(brand, 0.2),
    },

    // Capped by HEIGHT, and the trim is what makes that height be mark rather than margin.
    brandLogo: { maxHeight: 40, maxWidth: 200, objectFit: 'contain', display: 'block',
                 margin: '0 auto 4px' },
    brandName: { fontFamily: SERIF, fontSize: 23, fontWeight: 600, color: ink, textAlign: 'center',
                 letterSpacing: '0.01em', margin: '0 0 2px' },
    eyebrow:   { fontSize: 10.5, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase',
                 color: label, textAlign: 'center', margin: '6px 0 -2px' },

    /* Serif and centred ONLY standalone. Inside the sheet the type belongs to the baker's chosen
       theme, and dropping Cormorant into a shop that picked Montserrat would be this screen
       overruling the theme on one step out of four. */
    title: standalone
      ? { fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: ink, margin: '2px 0 0',
          lineHeight: 1.2, textAlign: 'center', letterSpacing: '0.005em' }
      : { fontSize: 18, fontWeight: 800, color: '#2A241F', margin: 0, letterSpacing: '-0.01em' },
    sub: standalone
      ? { fontSize: 14, color: muted, margin: '0 2px 4px', lineHeight: 1.55, textAlign: 'center' }
      : { fontSize: 13, color: '#7A6C60', margin: 0, lineHeight: 1.5 },

    input: { padding: standalone ? '14px 15px' : '13px 14px', borderRadius: 12,
             border: '1.5px solid #E7DFD5', font: 'inherit', fontSize: 15, color: '#2A241F',
             boxSizing: 'border-box', width: '100%', background: '#fff' },
    primary: (p, on) => ({
      width: '100%', padding: standalone ? '15px 0' : '13px 0', borderRadius: 13, border: 'none',
      background: on ? p : '#E3DBD1', color: on ? onColor(p) : '#A2968A',
      font: 'inherit', fontSize: standalone ? 15.5 : 14.5, fontWeight: 800,
      cursor: on ? 'pointer' : 'default',
      // The shadow is the baker's colour, so the button reads as theirs even at a glance.
      boxShadow: on && standalone ? `0 10px 24px ${alpha(p, 0.34)}` : 'none',
      marginTop: standalone ? 4 : 0,
    }),

    tabs:  { display: 'flex', gap: 6 },
    tab:   { flex: 1, padding: '9px 0', borderRadius: 10, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },
    tabOn: () => ({ borderColor: brand, color: brand, background: alpha(brand, 0.07) }),
    links: { display: 'flex', gap: 16, justifyContent: 'center' },
    link: { background: 'none', border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
            color: standalone ? muted : '#7A6C60', cursor: 'pointer', padding: '4px 0',
            textDecoration: 'underline', textAlign: 'center' },
    err:  { fontSize: 12.5, color: '#C0392B', fontWeight: 700, textAlign: standalone ? 'center' : 'left' },

    noteOpen:  { alignSelf: standalone ? 'center' : 'flex-start', border: 'none', background: 'none',
                 font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#7A6C60',
                 cursor: 'pointer', padding: '2px 0' },
    // 500 is generous for a remark and short of an essay. There is no cap on the API side, and the
    // whole thing is pasted into the baker's email — the limit is a courtesy to whoever reads it.
    noteInput: { width: '100%', boxSizing: 'border-box', resize: 'vertical', font: 'inherit',
                 fontSize: 13.5, lineHeight: 1.5, color: '#2A241F', padding: '10px 12px',
                 borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff' },
  };
}
