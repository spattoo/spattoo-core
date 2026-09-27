/* ── THE spinning ring, in plain DOM ─────────────────────────────────────────────────────────────
 *
 * ⚠️ NOT A DUPLICATE OF `CakeSpinner` — that one cannot be used outside the 3D scene. Its module
 * imports `Html` from `@react-three/drei` (canvas/CakeSpinner.jsx line 1), which only renders
 * inside a `<Canvas>`, so importing it into a panel drags drei in and still draws nothing useful.
 * The cake glyph belongs to the scene; a panel waiting on a request needs a ring.
 *
 * ⚠️ AND IT EXISTS BECAUSE THE RING WAS ALREADY HAND-ROLLED FIVE TIMES. `@keyframes spin { to {
 * transform: rotate(360deg) } }` is declared separately in BillingPanel, SettingsPanel,
 * FlavoursPanel, LibraryPanel and DashboardPanel, and LibraryPanel draws the ring itself at two
 * sizes. A sixth copy inside TemplateGrid is exactly what CLAUDE.md rule 1 warns about: nobody
 * copy-pastes on purpose, they write a fresh 12-line style object because they never looked.
 *
 * The five existing copies are deliberately LEFT ALONE. Converting them is a separate change with
 * its own risk of a visual diff on five screens, and folding it into a bug fix is how a one-line
 * fix becomes unreviewable. This is the shared definition new callers use.
 *
 * `color` sets the moving arc, `track` the rest of the ring. Defaults are the settings panels' pair
 * (#2C4433 on #C5D4C8) so a caller that names neither matches the screens this came from.
 */

/* One keyframe name for every caller. Duplicated <style> blocks with the SAME name are harmless —
 * the animation is defined identically — which is what makes this safe to mount per-spinner rather
 * than requiring a provider at the root. */
const SPIN_KEYFRAMES = '@keyframes spattooSpin { to { transform: rotate(360deg) } }';

export default function Spinner({ size = 20, thickness = null, color = '#2C4433', track = '#C5D4C8', label }) {
  const border = thickness ?? Math.max(2, Math.round(size / 8));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: label ? 8 : 0 }}>
      <style>{SPIN_KEYFRAMES}</style>
      <span
        /* `role="status"` rather than an aria-label on a div: a screen reader announces that
           something is happening, and `aria-live` is implicit. The visual ring is decorative. */
        role="status"
        aria-label={label || 'Loading'}
        style={{
          width: size, height: size, borderRadius: '50%',
          border: `${border}px solid ${track}`, borderTopColor: color,
          animation: 'spattooSpin 0.7s linear infinite',
          display: 'inline-block', flexShrink: 0, boxSizing: 'border-box',
        }}
      />
      {label && (
        <span style={{ fontSize: 12, color: '#9BB5A2', fontWeight: 600, fontFamily: "'Quicksand', sans-serif" }}>
          {label}
        </span>
      )}
    </span>
  );
}
