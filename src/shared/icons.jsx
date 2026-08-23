/* ── Icons used by more than one screen ──────────────────────────────────────────────────────────
 *
 * Only what is genuinely SHARED lives here. Icons used by a single screen stay next to it — a
 * cupboard everything gets tipped into is worse than two definitions, because nothing can be removed
 * from it with confidence.
 *
 * ⚠️ This module exists because the alternative is an import CYCLE. ShareIcon was a private function
 * in CakeDesigner.jsx, and the storefront customiser needs the same glyph — but
 * ThemePreview → CakeDesigner → SettingsPanel → ThemePreview closes a loop. A leaf module both can
 * import breaks it, and keeps the two surfaces drawing the same mark rather than two hand-copied
 * SVGs that drift the first time one is touched.
 *
 * `currentColor` throughout, so a caller sets the colour by setting its own `color`.
 */

export function ShareIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
