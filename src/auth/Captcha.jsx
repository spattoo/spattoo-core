import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Cloudflare Turnstile widget for the AuthGate dev-harness login/reset. Mirror of spattoo-web's
// apps/app/components/Captcha.tsx and spattoo-admin's src/auth/Captcha.jsx (same cross-repo mirror
// pattern as the password policy).
//
// spattoo-core is a LIBRARY — it reads NO env of its own; the host injects config (like `supabase`).
// So this takes the Turnstile `siteKey` as a PROP rather than reading import.meta.env. The dev
// harness passes VITE_TURNSTILE_SITE_KEY; a consumer that never sets it gets a no-op.
//
// Enforcement is Supabase-native: when captcha is enabled in the Supabase dashboard, the auth call
// requires a valid Turnstile token in options.captchaToken. This widget produces that token; Supabase
// verifies it server-side (we hold no secret). Renders nothing when siteKey is empty.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Load the Turnstile script exactly once.
let scriptPromise = null;
function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

// Exposes reset() via ref — the caller resets after a failed submit because Turnstile tokens are
// SINGLE-USE and expire (~5 min), so a retry needs a fresh token. Defaults to the light theme (the
// AuthGate card is light).
//
// `onError(code)` is optional and is the ONLY way anyone finds out why a captcha would not pass —
// see the note on 'error-callback' below. Whether or not it is supplied, the code is warned to the
// console with the `[captcha]` prefix, because the person who needs it is usually reading a customer's
// console and not our source.
export const Captcha = forwardRef(function Captcha({ siteKey, onVerify, onExpire, onError, theme = 'light', style }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // One automatic retry per mount. See the note on 'error-callback' below.
  const retriedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }), []);

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          // Invisible for the common silent pass — the widget only renders when Turnstile actually
          // needs the user to solve a challenge (no confusing "Success!" box before any input).
          appearance: 'interaction-only',
          callback: (token) => { retriedRef.current = false; onVerifyRef.current(token); },
          'expired-callback': () => onExpireRef.current && onExpireRef.current(),
          /* ⚠️ TURNSTILE HANDS US AN ERROR CODE AND WE USED TO THROW IT AWAY. Cloudflare's
             client-side-rendering doc shows the signature as `function (errorCode)`; all three
             copies of this component took no argument. So a captcha that would not pass produced a
             dead widget, a dead button and NOTHING anywhere saying why — reported twice as "captcha
             failed" with nothing to go on either time. The code is the whole diagnosis: `600*` is
             "generic challenge failure / bot behaviour detected", `110200` is a hostname not on the
             widget's allowlist, `400020` a bad sitekey.

             ⚠️ AND `600*` IS DOCUMENTED RETRYABLE, which we also never did. The widget sits in its
             error state until something resets it, so the only way forward was reloading the page.
             One automatic retry per mount: enough to survive a transient failure, and it stops there
             rather than spinning against a misconfiguration that will fail identically forever. */
          'error-callback': (errorCode) => {
            const code = String(errorCode ?? '');
            console.warn(`[captcha] turnstile error ${code || '(no code)'}`);
            onErrorRef.current && onErrorRef.current(code);
            onExpireRef.current && onExpireRef.current();
            if (!retriedRef.current && widgetIdRef.current && window.turnstile) {
              retriedRef.current = true;
              try { window.turnstile.reset(widgetIdRef.current); } catch { /* already gone */ }
            }
          },
        });
      })
      .catch(() => {
        // Script blocked / offline: leave the widget empty; the caller's submit stays gated.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* already gone */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={style} />;
});
