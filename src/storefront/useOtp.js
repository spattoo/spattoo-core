import { useCallback, useRef, useState } from 'react';

// ── The OTP state machine ───────────────────────────────────────────────────────────────────────
// Two places on the storefront ask someone for a code, and they ask for different reasons:
//
//   LoginModal    an INVITED customer proving they are who the baker addressed the invite to
//   VerifyStep    an anonymous visitor proving the number they just typed is one they can receive on
//
// Different endpoints, different payloads, different copy — but an identical dance: solve the
// captcha, send, move to the code step, verify, and keep exactly one thing on screen at a time while
// something is in flight. That dance is what lives here, and only that.
//
// Transport stays with the caller (`send` / `verify` are supplied), because the moment this hook
// starts building URLs it has to know which of the two callers it is serving, and a shared thing
// that branches on its callers is two things wearing one name.
//
// ── WHY THE CAPTCHA RESETS ON EVERY SEND ────────────────────────────────────────────────────────
// A Turnstile token is single-use. Without the reset a resend silently reuses a spent token, and the
// failure surfaces as an unexplained error on the SECOND attempt — which is the attempt someone
// makes precisely because the first one seemed not to work.
export function useOtp({ send, verify, onVerified }) {
  const [step, setStep] = useState('start');    // 'start' → 'code'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);

  const resetCaptcha = useCallback(() => {
    captchaRef.current?.reset();
    setCaptchaToken(null);
  }, []);

  const doSend = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      await send(captchaToken ?? undefined);
      setStep('code');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      resetCaptcha();
    }
  }, [send, captchaToken, resetCaptcha]);

  const doVerify = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      onVerified?.(await verify(code.trim()));
    } catch (e) {
      // Stay on the code step. A wrong digit is the common case and re-typing six characters is the
      // whole recovery — dropping back to 'start' would make them request a second code they do not
      // need, and the first one is still valid.
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [verify, code, onVerified]);

  return {
    step, code, setCode, busy, err, setErr,
    captchaRef, captchaToken, setCaptchaToken,
    send: doSend, verify: doVerify,
    // A send is blocked until the captcha is solved — but only when one is configured at all, or
    // every environment without a site key would have a permanently dead button.
    sendBlocked: (configured) => busy || (configured && !captchaToken),
    reset: () => { setStep('start'); setCode(''); setErr(null); resetCaptcha(); },
  };
}
