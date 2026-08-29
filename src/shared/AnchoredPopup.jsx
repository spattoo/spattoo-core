import { useLayoutEffect, useRef, useState } from 'react';

// ── A popup pinned beside something, that always fits on screen ──────────────────────────────────
//
// The colour picker used to place itself with a GUESSED height:
//
//   const EST_H = 400;
//   const top = Math.max(8, Math.min(anchor.top - 48, window.innerHeight - EST_H));
//
// The arithmetic was right and the number was wrong. That popup carries a wheel, a swatch grid,
// "colours from cake" and — when the element allows a gradient — a whole stops row, which together
// run well past 400px. So the clamp did not lift it far enough and the bottom fell off the screen.
//
// It surfaced as "the more decorations I add, the more of the picker I lose", which sounds like a
// bug about element count and is not: a longer card stack simply puts the swatch lower down, and
// low enough exposes an estimate that was always too small. Anything that made the popup taller
// would have done it just as well.
//
// So this MEASURES rather than estimates. The height is unknowable up front — it depends on the
// element's config, the palette, whether gradients are allowed — and any constant is a guess that
// some future row invalidates.
//
// ── WHY A COMPONENT ─────────────────────────────────────────────────────────────────────────────
// Measuring needs a ref and a layout effect, and the caller renders this from inside an IIFE in a
// map. Hooks cannot go there, which is exactly why it was a constant in the first place.
//
// ── AND A BACKSTOP ──────────────────────────────────────────────────────────────────────────────
// `maxHeight` + scroll, so a popup taller than the whole viewport — a short phone, a pinch-zoomed
// page — is reachable rather than clipped. Measurement handles every normal case; this handles the
// one where no position can fit it.

const MARGIN = 8;      // never nearer any edge than this
const LIFT   = 48;     // sit slightly above the anchor, so the anchor stays visible

export default function AnchoredPopup({ anchor, width, gap = 18, anchorSize = 26, children, style }) {
  const ref = useRef(null);
  // Start at the anchor's own top: on the first paint, before the height is known, that is the
  // closest honest guess. The layout effect corrects it before the browser paints, so nothing is
  // seen in the wrong place.
  const [top, setTop] = useState(() => Math.max(MARGIN, (anchor?.top ?? 0) - LIFT));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    // Wanted position, then pulled up by however much it overhangs, then held off the top edge.
    // Math.min BEFORE Math.max: on a viewport too short for the popup, the top edge wins and the
    // overflow goes off the BOTTOM, where scrolling can reach it — not off the top, where nothing
    // can.
    setTop(Math.max(MARGIN, Math.min(anchor.top - LIFT, vh - h - MARGIN)));
  }, [anchor, children]);

  if (!anchor) return null;

  const vw = window.innerWidth;
  // Left of the anchor by preference; right of it if that would go off-screen; then clamped.
  let left = anchor.left - width - gap;
  if (left < MARGIN) left = anchor.left + anchorSize + gap;
  left = Math.min(Math.max(left, MARGIN), vw - width - MARGIN);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, width, boxSizing: 'border-box',
        maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: 'auto',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
