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
// ── WHY THE NUMBER IS TYPED HERE, NOT EARLIER ───────────────────────────────────────────────────
// The date facet used to ask for a phone. It no longer does. Collecting it there and verifying it
// here would ask the same question twice, and the second ask reads as though the first was not
// believed.

export default function VerifyStep({
  apiBaseUrl, slug, bakerName, captchaSiteKey, primary, initialPhone = '',
  otpRequired = true, onVerified, onBack,
}) {
  const [phone, setPhone] = useState(initialPhone);
  const captchaConfigured = !!captchaSiteKey;

  const send = useCallback(async (captchaToken) => {
    await postJSON(`${apiBaseUrl}/api/storefront/${slug}/send-otp`, {
      to: phone.trim(), channel: 'sms', captchaToken,
    });
  }, [apiBaseUrl, slug, phone]);

  const verify = useCallback(async (code) => (
    postJSON(`${apiBaseUrl}/api/storefront/${slug}/verify-otp`, { to: phone.trim(), channel: 'sms', code })
  ), [apiBaseUrl, slug, phone]);

  const otp = useOtp({ send, verify, onVerified: (r) => onVerified?.(r.session, phone.trim()) });

  // ── OTP suppressed ────────────────────────────────────────────────────────────────────────────
  // STOREFRONT_OTP_REQUIRED=false on the API, read back through /settings. Temporary, for the window
  // where SMS delivery is not yet wired to Supabase.
  //
  // The step SURVIVES rather than being skipped, because the number is still needed — the baker's
  // next action is to phone the customer whether or not we checked the line first. Only the proving
  // goes. Skipping the screen entirely would drop the one field the enquiry cannot do without, and
  // the copy would then have to lie about having checked it.
  if (!otpRequired) {
    const ready = !!phone.trim();
    return (
      <div style={s.wrap}>
        <h3 style={s.title}>How can {bakerName} reach you?</h3>
        <p style={s.sub}>{bakerName} will call or message you about your cake.</p>
        <input style={s.input} value={phone} onChange={e => setPhone(e.target.value)}
               inputMode="tel" placeholder="Phone number" autoFocus aria-label="Phone number" />
        <button type="button" style={s.primary(primary, ready)} disabled={!ready}
                onClick={() => onVerified?.(null, phone.trim())}>
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
        {otp.step === 'start' ? `How can ${bakerName} reach you?` : 'Enter the code'}
      </h3>
      <p style={s.sub}>
        {otp.step === 'start'
          // Says why, because "verify your number" with no reason reads as a hoop. The reason is
          // true and it is the customer's benefit, not ours.
          ? `${bakerName} will call or message you about your cake, so we just need to check the number works.`
          : <>We sent a 6-digit code to <b>{phone.trim()}</b>.</>}
      </p>

      {captchaEl}

      {otp.step === 'start' ? (
        <>
          <input
            style={s.input} value={phone} onChange={e => setPhone(e.target.value)}
            inputMode="tel" placeholder="Phone number" autoFocus
            aria-label="Phone number"
          />
          <button type="button" style={s.primary(primary, !!phone.trim() && !otp.sendBlocked(captchaConfigured))}
                  disabled={!phone.trim() || otp.sendBlocked(captchaConfigured)}
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
            <button type="button" style={s.link} onClick={otp.reset}>Change number</button>
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
  links: { display: 'flex', gap: 16, justifyContent: 'center' },
  link: { background: 'none', border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: '#7A6C60', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },
  err:  { fontSize: 12.5, color: '#C0392B', fontWeight: 700 },
};
