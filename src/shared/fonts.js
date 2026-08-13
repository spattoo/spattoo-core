// ── UI typography: ONE declaration, and the host-app contract ────────────────
//
// SEC-WEB-7 (part 2). This library used to pull its UI font itself, with
// `@import url(https://fonts.googleapis.com/...Quicksand...)` repeated in **17
// places across 13 files**. That was two defects at once:
//   1. DRY — the same non-dynamic CSS pasted per screen, so a change had to be
//      made 17 times (and the copies had already drifted: some asked for weights
//      400-700, others 400-800, one also pulled Playfair Display).
//   2. Security/privacy — every screen hit `fonts.googleapis.com` +
//      `fonts.gstatic.com`, which are third-party origins in the host app's CSP
//      and disclose the visitor's IP to Google on every storefront visit.
//
// A LIBRARY CANNOT LOAD ITS OWN WEBFONT WELL: it has no document `<head>` it
// owns, and injecting an @import from a component is exactly what produced the
// duplication. So the split is: **the host app LOADS the font, this library only
// NAMES it.** Host apps self-host it (spattoo-web: `next/font/google`, which
// downloads at build time and serves from the app's own origin — no third-party
// origin at all; spattoo-admin: a self-hosted @font-face).
//
// ⚠️ THE CONTRACT FAILS SILENTLY, WHICH IS WHY `warnIfFontsMissing` EXISTS.
// A missing webfont doesn't error — the browser just falls back to a system
// font and everything keeps working, slightly wrong. That is not hypothetical
// here: `storefrontKit.js` FONT_THEMES has documented for months that its fonts
// "must be loaded in the host apps", **none of them were**, and nobody noticed —
// the DEFAULT storefront theme has been rendering in a fallback font. So this
// module warns, loudly and exactly once, when the font it names is not actually
// available. It is silent when the contract is honoured.

// The UI font stack. Import this instead of re-typing the family string — three
// separate `const FONT = "'Quicksand', sans-serif"` declarations had already
// accumulated across the codebase.
export const UI_FONT = "'Quicksand', system-ui, sans-serif";

// Families the host app is required to load for this library to render as
// designed. Keep in sync with what UI_FONT (and storefrontKit's FONT_THEMES,
// once wired) actually names.
export const REQUIRED_FONT_FAMILIES = ['Quicksand'];

let warned = false;

/**
 * Warn once if a required family isn't actually loaded by the host app.
 *
 * Deliberately NOT gated to development: this library is built in production
 * mode before being vendored, so a dev-only gate would compile the check away
 * and never fire in the consumer — which is precisely where the mistake shows
 * up. It is silent unless the contract is broken, so it costs nothing when
 * things are correct.
 */
export function warnIfFontsMissing() {
  if (warned || typeof document === 'undefined' || !document.fonts) return;
  warned = true;
  Promise.resolve(document.fonts.ready)
    // `document.fonts.check(...)` is the honest test: it answers "can this render
    // WITHOUT falling back", which is exactly what the warning claims. But it
    // runs true only once the face has actually loaded, and this fires at import
    // time — before React has rendered anything that uses the font, and (with
    // next/font) possibly before the @font-face rule is even injected. So wait
    // for fonts.ready AND a grace delay; without it the check cries wolf on a
    // perfectly healthy app, and a warning nobody trusts is worse than none. (It
    // did exactly that on the first attempt.) This catches BOTH failure modes
    // that leave the user on a fallback: the host never loaded the family (the
    // FONT_THEMES bug), and it declared but the file failed to fetch.
    .then(() => new Promise(resolve => setTimeout(resolve, 3000)))
    .then(() => {
      if (!document.fonts.check) return;
      const missing = REQUIRED_FONT_FAMILIES.filter(f => !document.fonts.check(`16px "${f}"`));
      if (!missing.length) return;
      console.warn(
        `[spattoo/designer] Font not loaded by the host app: ${missing.join(', ')}. ` +
        'The UI is rendering in a fallback font. Load it in the host app — ' +
        "spattoo-web: next/font/google in the root layout; spattoo-admin: a self-hosted @font-face. " +
        'This library deliberately does not fetch webfonts itself (see src/shared/fonts.js).',
      );
    })
    .catch(() => {});
}
