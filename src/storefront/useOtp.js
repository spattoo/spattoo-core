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
//
// ── AND WHY IT IS HIDDEN ON THE CODE STEP ───────────────────────────────────────────────────────
// Sandeep: "capcha on the storefront appears two times - one as soon as user laods that page, once i
// tick the checkbox, and enter mobile and send code, capcha checkbox appears again."
//
// It is ONE widget, not two. The reset above spends the solved token and Turnstile re-challenges;
// the widget is rendered OUTSIDE the step branch (deliberately — remounting it would throw away a
// token the resend needs), so the fresh challenge lands on the code screen. Two correct decisions
// colliding: the captcha gates the SEND, and the only thing to do on the code screen is type six
// digits.
//
// So the widget stays MOUNTED throughout and is merely hidden there, until a resend is asked for.
//
// ⚠️ HIDING IT ALONE WOULD KILL "RESEND". That button is gated by sendBlocked, which needs a token,
// and the reset just cleared it — so with the widget hidden the button would be disabled forever.
// `requestResend` is the other half: with no token it REVEALS the captcha instead of sending, and
// the send happens on the next press once it is solved.
/* ── The two decisions, as plain functions ───────────────────────────────────────────────────────
 * Pulled out of the hook so they can be TESTED. vitest runs `environment: 'node'` here — no jsdom,
 * no @testing-library — so a rule living inside React state is a rule nothing can check, and this
 * one cannot be checked in the harness either: dev/facets.jsx passes captchaSiteKey={null} and no
 * site key exists locally, so no real widget ever renders. Same reason mobileNav.js was split out of
 * CakeDesigner.
 */

/**
 * Where the captcha belongs on screen. Mounted either way — callers HIDE it, never unmount it.
 *
 * ⚠️ `contactReady` KEEPS THE CHALLENGE OUT OF THE FRONT DOOR. Sandeep: "only when the contact feild
 * has something." The widget used to render the instant the page opened, so a customer met a security
 * check before typing anything. It defaults TRUE because LoginModal has no contact field at all — an
 * invite sends to a contact the server already knows, so gating it there would mean a captcha that
 * never appears and a Send button that can never unblock.
 */
export function captchaVisible(step, resendAsked, contactReady = true) {
  return step === 'start' ? contactReady === true : resendAsked === true;
}

/**
 * What pressing "Resend code" should do.
 *
 * ⚠️ THIS IS THE HALF THAT KEEPS THE BUTTON ALIVE. Resend is gated by sendBlocked, which needs a
 * token, and the send that got us to this screen spent it. With the widget hidden and no reveal, the
 * button would be disabled forever — on the one screen where someone is already waiting for a code
 * that did not arrive.
 */
export function resendAction(configured, token) {
  return configured && !token ? 'reveal' : 'send';
}

export function useOtp({ send, verify, onVerified, contactReady = true }) {
  const [step, setStep] = useState('start');    // 'start' → 'code'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [resendAsked, setResendAsked] = useState(false);
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
      // A fresh code makes the previous resend request spent too — hide the widget again.
      setResendAsked(false);
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

  /* Asked for another code. With a token in hand this just sends; without one it reveals the captcha
     and sends nothing, because the token the first send spent is gone and nothing else can restore it. */
  const requestResend = useCallback((configured) => {
    if (resendAction(configured, captchaToken) === 'reveal') { setResendAsked(true); return; }
    doSend();
  }, [captchaToken, doSend]);

  return {
    step, code, setCode, busy, err, setErr,
    captchaRef, captchaToken, setCaptchaToken,
    send: doSend, verify: doVerify, requestResend,
    /* Where the widget belongs on screen. It is MOUNTED either way — callers hide it rather than
       unmount it — so a solved token survives the move to the code step. */
    captchaNeeded: captchaVisible(step, resendAsked, contactReady),
    // A send is blocked until the captcha is solved — but only when one is configured at all, or
    // every environment without a site key would have a permanently dead button.
    sendBlocked: (configured) => busy || (configured && !captchaToken),
    reset: () => { setStep('start'); setCode(''); setErr(null); setResendAsked(false); resetCaptcha(); },
  };
}
