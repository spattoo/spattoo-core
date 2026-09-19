import { useId, useState } from 'react';
import { ChevronRightIcon } from './icons.jsx';

/* ── A question you can open ─────────────────────────────────────────────────────────────────────
 *
 * A link-looking button with a chevron, and an answer underneath it. Use it for the explanation a
 * new person needs and a returning one has read fifty times.
 *
 * ⚠️ WHY NOT JUST PRINT THE PARAGRAPH. Because the two readers want opposite things. Somebody who
 * signed up this morning cannot read "240 credits to spend" without knowing what a credit buys;
 * somebody on their fortieth order wants the number and the packs, and three lines of prose between
 * them is furniture they have to look past every time. A disclosure serves both — the question is
 * always visible, so the explanation is never hidden, only folded.
 *
 * Closed by default. An explanation that starts open is just a paragraph with extra clicks.
 *
 * ⚠️ THE CHEVRON IS THE SHARED ONE, ROTATED — not a second glyph. `ChevronRightIcon` turned a
 * quarter-turn is the same mark meaning the same thing (root CLAUDE.md rule 14), and it animates
 * between the two states for free.
 */
export function Disclosure({ label, children, accent = '#2C4433', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={id}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0',
          background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
          fontSize: 12.5, fontWeight: 700, color: accent, textAlign: 'left',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        {label}
        {/* Down when closed, up when open — the direction the content is about to move. */}
        <span style={{ display: 'flex', transform: `rotate(${open ? -90 : 90}deg)`, transition: 'transform .18s' }}>
          <ChevronRightIcon size={14} />
        </span>
      </button>
      {open && (
        <div id={id} style={{ fontSize: 12.5, color: '#5A6B60', lineHeight: 1.55, paddingTop: 7 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default Disclosure;
