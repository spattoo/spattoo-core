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
export const Captcha = forwardRef(function Captcha({ siteKey, onVerify, onExpire, theme = 'light', style }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

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
          callback: (token) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current && onExpireRef.current(),
          'error-callback': () => onExpireRef.current && onExpireRef.current(),
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
