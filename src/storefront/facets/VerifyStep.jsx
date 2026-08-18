import { useCallback, useState } from 'react';
import { Captcha } from '../../auth/Captcha.jsx';
import { useOtp } from '../useOtp.js';

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
  apiBaseUrl, slug, bakerName, captchaSiteKey, primary, initialPhone = '', initialEmail = '', initialName = '',
  // Which channels the SERVER will accept, in its order of preference — read back from /settings so
  // a channel we cannot deliver on is never offered. SMS to an Indian number needs DLT clearance;
  // offering it before that is how a customer waits for a code a telco already scrubbed.
  channels = ['sms'],
  otpRequired = true, onVerified, onBack,
  // The customer's own words, held on the draft by FacetShell. See `noteField` below.
  note = '', onNote,
}) {
  const [channel, setChannel] = useState(channels[0] ?? 'sms');
  const [noteOpen, setNoteOpen] = useState(false);
  // ONE field holding whichever contact the chosen channel wants. Seeded from the matching side of
  // the draft — an email typed last time should not reappear in a box now labelled Phone number.
  const [phone, setPhone] = useState((channels[0] ?? 'sms') === 'email' ? initialEmail : initialPhone);
  // Asked HERE, with the contact, rather than inside the date facet. They are one question — who
  // you are and how the baker reaches you — and splitting them made the Send button look dead for a
  // reason that lived two screens away.
  const [name, setName] = useState(initialName);
  const named = !!name.trim();
  const captchaConfigured = !!captchaSiteKey;
  const ch = CHANNEL[channel] ?? CHANNEL.sms;

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
    return (
      <div style={s.wrap}>
        <h3 style={s.title}>Who shall {bakerName} ask for?</h3>
        <p style={s.sub}>{bakerName} will call or message you about your cake.</p>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)}
               placeholder="Your name" autoFocus aria-label="Your name" />
        <input style={s.input} value={phone} onChange={e => setPhone(e.target.value)}
               inputMode={ch.mode} placeholder={ch.ask} aria-label={ch.ask} />
        {noteField}
        <button type="button" style={s.primary(primary, ready)} disabled={!ready}
                onClick={() => onVerified?.(null, phone.trim(), name.trim(), channel)}>
          Send to {bakerName}
        </button>
        <button type="button" style={{ ...s.link, marginTop: 2 }} onClick={onBack}>Back to my cake</button>
      </div>
    );
  }

  // ONE widget for the whole step, rendered outside the step branch so moving to the code entry
  // does not remount it — a remount would throw away a solved captcha the resend still needs.
  const captchaEl = (
    <Captcha ref={otp.captchaRef} siteKey={captchaSiteKey}
             onVerify={otp.setCaptchaToken} onExpire={() => otp.setCaptchaToken(null)}
             style={{ margin: '2px 0' }} />
  );

  return (
    <div style={s.wrap}>
      <h3 style={s.title}>
        {otp.step === 'start' ? `Who shall ${bakerName} ask for?` : 'Enter the code'}
      </h3>
      <p style={s.sub}>
        {otp.step === 'start'
          // Says why, because "verify your number" with no reason reads as a hoop. The reason is
          // true and it is the customer's benefit, not ours.
          ? (channel === 'email'
              ? `${bakerName} will be in touch about your cake, so we just need to check this reaches you.`
              : `${bakerName} will call or message you about your cake, so we just need to check the number works.`)
          : <>We sent a 6-digit code to <b>{phone.trim()}</b>.</>}
      </p>

      {/* Only when there is a genuine choice. One channel is not a decision, and rendering a single
          disabled-looking tab would invite somebody to hunt for the other. */}
      {otp.step === 'start' && channels.length > 1 && (
        <div style={s.tabs} role="group" aria-label="How to send the code">
          {channels.map(c => (
            <button key={c} type="button" aria-pressed={channel === c}
                    style={{ ...s.tab, ...(channel === c ? s.tabOn(primary) : null) }}
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
          <input
            style={s.input} value={name} onChange={e => setName(e.target.value)}
            placeholder="Your name" autoFocus aria-label="Your name"
          />
          <input
            style={s.input} value={phone} onChange={e => setPhone(e.target.value)}
            inputMode={ch.mode} placeholder={ch.ask}
            aria-label={ch.ask}
          />
          {/* On the CONTACT phase only. The code screen is one job — read six digits, type six
              digits — and a textarea there would be a second thing to do while a timer runs. */}
          {noteField}
          <button type="button" style={s.primary(primary, !!phone.trim() && named && !otp.sendBlocked(captchaConfigured))}
                  disabled={!phone.trim() || !named || otp.sendBlocked(captchaConfigured)}
                  onClick={otp.send}>
            {otp.busy ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <input
            style={s.input} value={otp.code} onChange={e => otp.setCode(e.target.value)}
            inputMode="numeric" placeholder="6-digit code" autoFocus
            aria-label="Verification code"
          />
          <button type="button" style={s.primary(primary, !!otp.code.trim() && !otp.busy)}
                  disabled={!otp.code.trim() || otp.busy} onClick={otp.verify}>
            {otp.busy ? 'Checking…' : `Send to ${bakerName}`}
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
      <button type="button" style={{ ...s.link, marginTop: 2 }} onClick={onBack}>Back to my cake</button>
    </div>
  );
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
  return res.json();
}

const s = {
  noteOpen:  { alignSelf: 'flex-start', border: 'none', background: 'none', font: 'inherit',
               fontSize: 12.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer', padding: '2px 0' },
  // 500 is generous for a remark and short of an essay. There is no cap on the API side, and the
  // whole thing is pasted into the baker's email — the limit is a courtesy to whoever reads it.
  noteInput: { width: '100%', boxSizing: 'border-box', resize: 'vertical', font: 'inherit',
               fontSize: 13.5, lineHeight: 1.5, color: '#2A241F', padding: '10px 12px',
               borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff' },

  wrap:  { display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 2px 4px' },
  title: { fontSize: 18, fontWeight: 800, color: '#2A241F', margin: 0, letterSpacing: '-0.01em' },
  sub:   { fontSize: 13, color: '#7A6C60', margin: 0, lineHeight: 1.5 },
  input: { padding: '13px 14px', borderRadius: 12, border: '1.5px solid #E7DFD5', font: 'inherit',
           fontSize: 15, color: '#2A241F', boxSizing: 'border-box', width: '100%' },
  primary: (primary, on) => ({
    width: '100%', padding: '13px 0', borderRadius: 13, border: 'none',
    background: on ? primary : '#E3DBD1', color: on ? '#fff' : '#A2968A',
    font: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: on ? 'pointer' : 'default',
  }),
  tabs:  { display: 'flex', gap: 6 },
  tab:   { flex: 1, padding: '9px 0', borderRadius: 10, border: '1.5px solid #E7DFD5', background: '#fff',
           font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },
  tabOn: (primary) => ({ borderColor: primary, color: primary, background: '#F4F7F4' }),
  links: { display: 'flex', gap: 16, justifyContent: 'center' },
  link: { background: 'none', border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: '#7A6C60', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },
  err:  { fontSize: 12.5, color: '#C0392B', fontWeight: 700 },
};
