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

// A circular arrow: fetch this again. Used by the dashboard's status card and the billing screen's
// "check the payment again" button.
export function RefreshIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// A camera: take or change a photo. The rail's capture actions, and the store logo's "change" overlay
// in Settings. Moved here from CakeDesigner.jsx when Settings needed it — Settings cannot import from
// the designer without closing the import cycle described at the top of this file.
export function CameraIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* The raised hump over the lens is what reads as "camera" at 15px; a plain rectangle with a
          circle in it reads as nothing at all. */}
      <path d="M3 8.5a2 2 0 012-2h1.9a1.5 1.5 0 001.28-.72l.64-1.06A1.5 1.5 0 0110.1 4h3.8a1.5 1.5 0 011.28.72l.64 1.06a1.5 1.5 0 001.28.72H19a2 2 0 012 2v8.5a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <circle cx="12" cy="12.75" r="3.25" />
    </svg>
  );
}

// A picture — a frame with a hill and a sun. The rail's Uploads destination, and the empty store-logo
// box in Settings, where it says "an image goes here". Same move, same reason, as CameraIcon.
export function UploadsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 15.5l-4.5-4.5L7 20.5" />
    </svg>
  );
}

// Two overlapping sheets: copy this to the clipboard. First used by the brand-colour hex in Settings.
export function CopyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5" />
    </svg>
  );
}
