/* ── The small icon button that sits ON a studio's drawing surface ───────────────────────────────
 *
 * Undo and Clear belong where the mistake just happened. GarnishStudio's own note says it plainest:
 * *"below the drawing it is a round trip away from the hand and, on a phone, often below the fold"*
 * — and icons rather than words because two labels at that size were the largest thing on the screen
 * after the drawing itself.
 *
 * ⚠️ LIFTED OUT OF GarnishStudio RATHER THAN COPIED. It was a local function there until a second
 * studio wanted the same button, which is exactly the moment root CLAUDE.md rule 1 is about: nobody
 * copy-pastes a component on purpose, they build a fresh one because they never looked. One
 * definition means a baker meets ONE control in both studios, not two that drift.
 *
 * ⚠️ ALWAYS PRESENT, DISABLED WHEN THERE IS NOTHING TO DO. GarnishStudio learned this twice: hidden
 * until the first stroke, undo was reported missing — and both reports were right, because a control
 * that appears only once you have already needed it teaches nobody it exists. A greyed button says
 * "this is where undo lives"; an absent one says the tool has no undo.
 *
 * Children are raw SVG paths, drawn into a 24×24 viewBox — the caller owns the glyph, this owns the
 * button. `danger` tints the stroke and the border for Clear, which is the one that destroys work.
 */
export default function PlateButton({ label, onClick, danger, disabled, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled}
      style={{
        width: 34, height: 34, borderRadius: 9, display: 'grid',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        placeItems: 'center', background: 'rgba(255,255,255,0.92)',
        border: `1.5px solid ${danger ? '#E4CFCF' : '#DED8CE'}`,
      }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke={danger ? '#A33' : '#4A4A4A'} strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

/* The two glyphs themselves, so undo is the same arrow and clear the same bin in every studio that
   has them. INVARIANTS #14: an icon means the same thing everywhere — find the one this codebase
   already uses before drawing a new one. */
export const UndoGlyph = () => (
  <>
    <path d="M4 9h9a5 5 0 1 1 0 10h-3" />
    <polyline points="7.5 5 3.5 9 7.5 13" />
  </>
);

export const ClearGlyph = () => (
  <>
    <polyline points="4 6 20 6" />
    <path d="M9 6V4h6v2M6.5 6l1 14h9l1-14" />
  </>
);
