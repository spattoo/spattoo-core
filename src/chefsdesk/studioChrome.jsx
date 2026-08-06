// ── The shell every Chef's Desk full-screen tool wears ────────────────────────────────────────────
// The Edible Print Studio is two screens — the sheet library and the A4 page — and a baker moves
// between them without leaving. They must therefore look like ONE tool: the same full-bleed surface,
// the same title bar, the same two buttons in the same place. A header that shifted by two pixels on
// the way in would read as a different screen having opened.
//
// Extracted because it had already been copied once. `check:dup` caught the second copy the moment
// it existed, which is the entire reason src/chefsdesk was added to that gate's paths — a shared
// vocabulary that lives in two files stops being shared the first time somebody tunes one of them.
//
// Tool-specific styling stays with its tool. Only what BOTH screens are is here.

import { useEffect, useState } from 'react';
import { Z } from '../shared/Panel.jsx';

// ── Is this a phone? ────────────────────────────────────────────────────────────────────────────
// One definition, used by the header here and by A4Sheet's body layout, because two components
// disagreeing about where "mobile" starts is how a header stacks while the thing under it does not.
//
// SSR-safe on purpose: `typeof window` guards the initialiser, so importing this into anything
// server-rendered — or into renderToStaticMarkup, which is how both studio screens are tested —
// does not throw. Reading the width in the initialiser rather than in the effect also means a phone
// never paints one desktop frame first, which on a header that RESHAPES is a visible jump.
export function useStudioNarrow(breakpoint = 760) {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return narrow;
}

// ── The header ──────────────────────────────────────────────────────────────────────────────────
// A component, not just styles, because the two screens must not merely LOOK alike — they have to
// reshape alike, and a rule copied into both is a rule that will be tuned in one.
//
// ── WHY IT RESHAPES ─────────────────────────────────────────────────────────────────────────────
// One row of `title + buttons` fits a laptop and not a phone. At 390px the title lost the fight for
// width and wrapped to THREE lines — "Edible / Print / Studio" — beside a row of buttons that kept
// their full size. The title is the one thing telling a baker which tool they are in, so it is the
// last thing that should be squeezed.
//
// On a phone: the title gets a row to itself and stays on ONE line, the actions get the row below,
// and Close becomes a × in the corner. The × is not decoration — dropping "Close" from the button
// row is what leaves the real actions enough width to sit side by side, and a × top-right is where
// a full-screen tool is closed from anyway.
export function StudioHeader({ title, actions, onClose }) {
  const narrow = useStudioNarrow();

  if (!narrow) {
    return (
      <div style={chrome.header}>
        <div style={chrome.title}>{title}</div>
        <div style={chrome.actions}>
          {actions}
          <button style={chrome.ghostBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...chrome.header, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* nowrap + the title winning the flex row is the whole point — `minWidth: 0` is deliberately
            NOT set here, because that is what would let it shrink and wrap again. */}
        <div style={{ ...chrome.title, whiteSpace: 'nowrap', flex: 1 }}>{title}</div>
        <button style={chrome.closeX} onClick={onClose} aria-label="Close">×</button>
      </div>
      {/* Actions share the row evenly rather than sitting at their natural widths: "Save sheet" and
          "Download PDF" are not the same length, and a ragged pair reads as one being an
          afterthought. Equal columns also make every button a generous tap target.
          A grid rather than flex:1 on each child, because the children come from the CALLER — this
          shapes them without reaching into their props, so a screen can pass whatever it likes. */}
      {/* No actions is a real state — the library hides its "New sheet" while the empty state is
          offering one — and an empty row still costs its gap, leaving the title floating above a
          band of nothing. */}
      {actions && (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 8 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export const chrome = {
  // Full-bleed and fixed: these are destinations, not dialogs. Z.studio sits above the designer's
  // own panels, which is what lets the studio be opened from inside it — and it comes from the
  // shared scale so that anything needing to sit ABOVE the studio can name that instead of guessing
  // (Z.overStudio). A bare 4000 here is what left the uploads picker opening underneath it.
  overlay: {
    position: 'fixed', inset: 0, zIndex: Z.studio, background: '#FAFAF8',
    display: 'flex', flexDirection: 'column', fontFamily: 'inherit',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px', borderBottom: '1.5px solid #E8E4DC', background: '#fff',
  },
  // The tool's name. Identical on both screens on purpose — it is the one thing telling a baker they
  // are still in the same place.
  title: { fontWeight: 800, fontSize: 16, color: '#2C4433' },
  actions: { display: 'flex', gap: 10 },
  primaryBtn: {
    padding: '9px 16px', borderRadius: 10, border: 'none', background: '#3D5A44',
    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  ghostBtn: {
    padding: '9px 14px', borderRadius: 10, border: '1.5px solid #ccc', background: '#fff',
    fontSize: 13, fontWeight: 700, color: '#555', cursor: 'pointer',
  },
  // The phone's Close. 40×40 rather than the text button's height: this is the one control a baker
  // reaches for with a thumb while holding the phone, and it is the smallest square that is still a
  // comfortable target. Square and borderless so it reads as chrome, not as a third action.
  closeX: {
    width: 40, height: 40, flexShrink: 0, borderRadius: 10, border: 'none', background: 'none',
    fontSize: 26, lineHeight: 1, color: '#555', cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
