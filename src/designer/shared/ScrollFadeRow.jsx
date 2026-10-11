import { useLayoutEffect, useRef, useState } from 'react';
import { INK, LINE, SURFACE } from '../../shared/tokens.js';
import { ChevronRightIcon } from '../../shared/icons.jsx';

/* ── Lifted out of CakeDesigner.jsx unchanged, for the same reason SizeDial was ───────────────────
 *
 * It was reachable only by living in the same 14k-line module, and it is THE scrolling row: 21 of
 * them already exist inside the designer, and admin has none because it could not import this one.
 * Sandeep, asking for the calendar's controls: "see how we aligned in a scrollable row. we should
 * make some standard i belive- so that admin also can follow."
 *
 * Nothing below is redesigned. The only ADDITION is the `<style>` rule, and it is not cosmetic —
 * see the note on it.
 */

/**
 * A horizontally scrolling row that admits it scrolls.
 *
 * Fifteen presets, seven visible, and the seventh landed 5px short of the edge — near enough to a
 * clean end that the row read as "these are the colours". Exactly the defect the sheet had
 * vertically, rotated ninety degrees, so it gets the same answer: a fade at the edge that is there
 * while there is more and gone when there is not.
 */
/* ⚠️ BOTH EDGES, AND ONLY WHERE THERE IS SOMETHING TO SEE. Sandeep, on the rainbow's tile row:
 * "can we add something to show that there are still items to right and you need to scroll. how
 * does the user know otherwise" — then "both edges and every row whereever needed. if the controls
 * fit in row, not needed."
 *
 * That last sentence is the whole design: each fade is derived from the scroll position, so a row
 * whose contents fit shows nothing at all. There is no flag to set and no way for a caller to
 * declare "this one scrolls" and be wrong about it.
 *
 * The LEFT edge matters as much as the right. Once you have scrolled, the tiles you came from are
 * off-screen behind you with nothing to say so, and a row that only ever hints forward reads as
 * having a beginning wherever you happen to have stopped.
 *
 * ⚠️ `fade` IS THE SURFACE COLOUR, as an "r,g,b" triple, and it has to be passed. The gradient has
 * to end in the colour BEHIND the row or the fade reads as a smear: the default 255,253,249 is the
 * colour picker's sheet, and over a white card it would show as a faint cream wash. Callers on a
 * white surface pass '255,255,255'.
 *
 * ⚠️ `read` returns the PREVIOUS object when nothing changed. Without that, every scroll event sets
 * fresh state and re-renders the row — 21 of these now exist, several carrying live 3D previews.
 */
/* ⚠️ `wrapStyle` EXISTS BECAUSE THE WRAPPER IS NOT ALWAYS A BLOCK. The default `width: '100%'` is
 * right for a row that owns its line, but buildToolbar's panel rows are FLEX CHILDREN sitting beside
 * a label span (s.editPanelRow) — a 100%-wide wrapper there pushes the label out and overflows the
 * card. Those pass `{ flex: 1, minWidth: 0 }` instead, which is what the bare div they replaced had. */
export function ScrollFadeRow({ children, style, fade = '255,253,249', wrapStyle = null }) {
  const ref = useRef(null);
  /* `over` is whether the row scrolls AT ALL, which is a different question from which edge is
     currently live — and it is the one that decides whether to reserve the arrows' lane. */
  const [edges, setEdges] = useState({ left: false, right: false, over: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollWidth - el.scrollLeft - el.clientWidth > 4;
      const over = el.scrollWidth - el.clientWidth > 4;
      setEdges(prev => (prev.left === left && prev.right === right && prev.over === over
        ? prev : { left, right, over }));
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [children]);
  /* ⚠️ THE FADE ALONE WAS NOT ENOUGH, AND THAT IS THE WHOLE REASON FOR THE ARROW. Shipped in
   * 0.1.584 as a gradient only; Sandeep, looking at it on a phone: "if you did the right side
   * shaded part, thats not very impactful. and not looking obvious. may be a right arrow something
   * like that would help?" He was right — 30px of white-to-transparent over a near-white card on a
   * translucent surface is a whisper, and the clipped tile was still doing the work.
   *
   * ⚠️ IT IS A REAL BUTTON, NOT A MARKER. Rule 7 cuts both ways: a thing that looks pressable must
   * be pressable. Tapping scrolls the row one step, which on a phone is the difference between a
   * hint and a control you can actually use.
   *
   * ⚠️ IT SCROLLS THIS ROW AND NOTHING ELSE. `scrollBy` is called on `ref.current` alone, and the
   * handler stops propagation — these rows sit inside a scrolling card body inside a docked sheet,
   * and a click that bubbled could move either of them out from under the thing being tapped.
   *
   * ⚠️ ChevronRightIcon, ROTATED — not a second glyph. `check:one-chevron` scans for `›`, its
   * entities, and a hand-drawn `M9 6l6 6-6 6` path; drawing one here would fail it, and rightly,
   * since a text glyph takes whatever font is loaded and changes shape between screens. Disclosure
   * already rotates this same icon rather than drawing a twin. The gate's ACCEPTED list carves out
   * carousel arrows, but this does not need the carve-out: reusing the shared icon keeps it green.
   *
   * ⚠️ The step follows the storefront carousel: first child's width plus the gap, smooth. A fixed
   * pixel step would over- or under-shoot depending on whether a row holds 46px dials or 68px tiles.
   * But a row whose only child is ONE full-width track — the piping ring controls, which centre
   * themselves with `margin: 0 auto` — would measure that track and jump straight to the far end,
   * so the step is capped at most of a screenful.
   */
  const step = (dir) => (e) => {
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild;
    const gap = parseFloat(getComputedStyle(el).gap) || 8;
    const cell = first ? first.getBoundingClientRect().width + gap : el.clientWidth * 0.6;
    const by = Math.min(cell, el.clientWidth * 0.8);
    el.scrollBy({ left: dir * by, behavior: 'smooth' });
  };
  // `to left` / `to right` point AWAY from the edge, so each gradient is opaque at its own side.
  const edgeStyle = (side) => ({
    /* Against the SCROLLER's edge, which is the lane in from the outer box once one is reserved —
       a gradient parked over the arrow's gutter shades nothing and reads as a bruise. */
    position: 'absolute', top: 0, bottom: 0, [side]: LANE, width: 30, pointerEvents: 'none',
    background: `linear-gradient(to ${side}, rgba(${fade},0), rgba(${fade},0.95))`,
  });
  /* ── 20px, INSET — and the number it replaced was sized against the wrong surface ────────────────
   *
   * Sandeep: "scrolling row arrow mark is really looks disturbing. it covers the view. can it be a
   * small arrow mark (and clearly visible also)."
   *
   * It was 26px flush at the edge, justified here as "these rows are ~354px inside a phone card".
   * That was true of the phone and wrong about desktop, where the same row lives in the element
   * stack — 184px of usable width at the old 200px popup. A 26px circle is 14% of that row and it
   * landed squarely ON the PLACEMENT tile beside it, which is what "covers the view" means.
   *
   * Two changes, and the second matters more than the first. SMALLER (20, glyph 13) so it is
   * furniture rather than a control competing with the tiles; and INSET 3px so it sits beside the
   * row's edge instead of flush against the card, which is what made it read as pasted on top.
   * The fade narrows to 30 to match — a 38px gradient under a 20px button is a shadow with nothing
   * casting it.
   *
   * ⚠️ AND IT IS NO LONGER AN OVERLAY — see LANE below. Smaller and inset made the button less
   * obtrusive; it did not stop it sitting on top of a control, which is what "covers the view"
   * actually meant. That took the structural change this comment used to defer. */
  const ARROW = 20, ARROW_INSET = 3;

  /* ── The lane the arrows live in, which the scroller may not use ────────────────────────────────
   *
   * ⚠️ THE ARROWS COVERED THE CONTROLS, AND TWO ROUNDS OF MAKING THEM SMALLER DID NOT FIX IT.
   * Sandeep, with a picture of a Size dial reading "2.0" under the left button and a Tilt readout
   * under the right: *"the horizontal scrolling buttons are hiding the controls."* Both previous
   * attempts treated it as a size problem. It is a LAYOUT problem: an absolutely-positioned button
   * over a scroller will sit on whatever has scrolled beneath it, at any size.
   *
   * ⚠️ PADDING THE SCROLLER DOES NOT WORK, AND THAT IS MEASURED RATHER THAN ASSUMED — the note this
   * replaces carried the numbers. `paddingRight` adds to the SCROLL EXTENT, so at scrollLeft 0 every
   * item sits exactly where it did and the lane only appears once you have already scrolled to the
   * end. The scroller was the same box the arrow was anchored to, so there was nothing to pad
   * BETWEEN them. Hence two boxes: the outer one owns the arrows, the inner one scrolls, and a
   * margin between them is a lane the content cannot enter.
   *
   * ⚠️ RESERVED ON BOTH SIDES WHENEVER THE ROW SCROLLS, not on the side whose arrow is showing. The
   * live side changes as you scroll, so reserving per-side would shift every control sideways the
   * moment a left arrow appeared — a row that moves under your thumb while you are aiming at a dial.
   * Costing ~52px of a 300px row is the price of never hiding a control, and a control you cannot
   * see is worth less than the width it occupies. */
  const LANE = ARROW + ARROW_INSET * 2;

  const arrowStyle = (side) => ({
    position: 'absolute', top: '50%', [side]: ARROW_INSET, transform: 'translateY(-50%)',
    width: ARROW, height: ARROW, borderRadius: '50%', padding: 0, zIndex: 2,
    /* ⚠️ INK ON WHITE, NOT WHITE ON WHITE. It was a white circle with a hairline border on a
       near-white card — furniture so quiet it read as a smudge. Sandeep: *"if we can make them in
       black color, i think they ll highlight."* A scroll affordance has one job, which is to be
       noticed; INK is this app's near-black and the glyph inverts to the card's own surface. */
    border: `1px solid ${INK}`, background: INK, color: SURFACE,
    boxShadow: '0 1px 4px rgba(0,0,0,0.22)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...(side === 'left' ? { transform: 'translateY(-50%) rotate(180deg)' } : null),
  });
  return (
    <div style={{ position: 'relative', ...(wrapStyle ?? { width: '100%' }) }}>
      {/* ⚠️ THE RULE TRAVELS WITH THE COMPONENT, and this is the one line that is NEW here.
          `scrollbarWidth:'none'` in the caller's inline style covers Firefox; WebKit needs a real
          rule, which an inline style cannot express. It used to be injected once by CakeDesigner,
          which is fine for the designer and useless to anyone else — an admin studio importing
          this component would have mounted a row with a visible scrollbar under the fade.
          Segmented.jsx carries its own :focus-visible rule for exactly this reason.
          ⚠️ AND CakeDesigner KEEPS ITS COPY. `s.sheetBody` uses the same class OUTSIDE this
          component, so deleting it there would restore a scrollbar on the docked sheet. Two
          identical rules cost nothing; one missing rule is a bug on a surface nobody is looking at. */}
      <style>{'.spattoo-noscrollbar::-webkit-scrollbar { display: none; }'}</style>
      {/* The inner box. Its margins are the lane — the arrows are anchored to the OUTER div, so
          nothing that scrolls here can ever pass beneath one. */}
      <div style={edges.over ? { marginLeft: LANE, marginRight: LANE } : undefined}>
        {/* ⚠️ THE SCROLLING IS THE COMPONENT'S, NOT THE CALLER'S — and it was the caller's, which is
            how a row named for scrolling came to have 26 call sites of which several did not scroll.
            Everything else here already assumes a scroller: `read()` compares scrollWidth against
            clientWidth to decide whether to show the arrows, and `step()` calls scrollBy on this
            element. With `overflow-x: visible` all of that still RUNS — scrollWidth exceeds
            clientWidth, so both arrows appear — and then pressing one does nothing while the chips
            spill out of the card behind it.
            ⚠️ WORSE, THEY TAKE THE CARD WITH THEM. `ChipPicker`'s row is `{display:'flex', gap:8}`,
            so Frosting and Style spilled to 425px inside a 164px lane; the tier edit popup sets
            `overflowY:'auto'` and nothing on x, which CSS computes as `auto` on BOTH axes, so the
            whole card scrolled sideways. Reported 2026-10-06 with the card's contents slid off their
            own edge.
            Caller's style is spread AFTER, so the two rows that genuinely want `overflow:'hidden'`
            still get it. */}
        <div ref={ref} className="spattoo-noscrollbar"
             style={{ overflowX: 'auto', scrollbarWidth: 'none', ...style }}>{children}</div>
      </div>
      {edges.left && <div aria-hidden="true" style={edgeStyle('left')} />}
      {edges.right && <div aria-hidden="true" style={edgeStyle('right')} />}
      {edges.left && (
        <button type="button" aria-label="Scroll left" style={arrowStyle('left')} onClick={step(-1)}>
          <ChevronRightIcon size={13} />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Scroll right" style={arrowStyle('right')} onClick={step(1)}>
          <ChevronRightIcon size={13} />
        </button>
      )}
    </div>
  );
}

export default ScrollFadeRow;
