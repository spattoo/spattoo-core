// ── One numbered, colour-spined section of the X-Ray sheet ───────────────────────────────────────
//
// The sheet is a worksheet a baker works through at a bench, top to bottom, on a phone — and it
// prints. Before this it was a flat stack of white cards, and the hierarchy was INVERTED:
//
//     section heading   12px / 800 / #555        ← "Decorations — how to make them"
//     card title        14px / 800 / #2C2A26     ← "flower", the item INSIDE it
//
// The child was bigger and darker than its parent, so no amount of spacing was going to make the
// page read as structured. Sandeep: *"Decorations and sub section flower more or less look same …
// the page is looking like not a well structured one."*
//
// Two things fix it, and neither is font size alone:
//
//   1. A NUMBER. The sections are a sequence — what tins, what colours, what piping, what
//      decorations — and numbering says so at a glance, gives a sense of progress through a long
//      sheet, and survives into the PDF where there is no scroll position to orient by.
//   2. A SPINE. Each section's content sits inside a left rule in that section's own colour, so a
//      card is grouped by GEOMETRY rather than by being slightly smaller than the thing above it.
//      "flower" is unmistakably inside "Decorations" even though both are cards on white.
//
// ⚠️ THE COLOURS ARE NOT NEW. Every section already carried one, spent on an 8px dot doing no work:
// tins blue, cream colours pink, piping green, decorations purple, garnishes brown, prints blue.
// This promotes what was already there rather than inventing a palette — so the sheet gains
// structure without gaining decoration.

/**
 * A render-order counter, so sections number themselves 1, 2, 3 … in the order they appear.
 *
 * ⚠️ NUMBERED BY WHAT IS PRESENT, NOT BY A FIXED CATALOGUE. A cake with no garnishes must read
 * 1, 2, 3, not 1, 2, 4 — a gap looks like something failed to load. Which sections exist is only
 * knowable while rendering (decorations depend on the design, prints are fetched), so the count is
 * claimed as each one draws.
 *
 * ⚠️ CREATED FRESH ON EVERY RENDER by the caller, never module-level. A counter that outlived a
 * render would keep climbing — 1, 2, 3 then 4, 5, 6 on the next paint — and StrictMode's double
 * render would show it immediately.
 *
 * Known and accepted: Edible prints load asynchronously, so on the rare sheet that has them the
 * sections after it renumber once, shortly after opening. The alternative is holding every number
 * back until the slowest section resolves, which would leave a baker looking at an unnumbered sheet
 * to protect them from a one-time shift.
 */
export function makeSeq() {
  let n = 0;
  return { next: () => ++n };
}

/**
 * The section heading: a numbered chip in the section's colour, then the title, then whatever the
 * section counts ("3 kg · 2 tiers", "4").
 *
 * `meta` sits INSIDE the heading rather than under it, because it is an attribute of the section
 * and a line of its own would read as content.
 */
export function SectionHead({ n, color, children, meta = null, style = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, ...style }}>
      <span
        aria-hidden
        style={{
          // Fixed 22px so single and double digits keep one left edge down the page — a ragged
          // margin is the thing a numbered list is supposed to remove.
          width: 22, height: 22, borderRadius: 7, background: color, color: '#fff',
          fontSize: 12, fontWeight: 800, lineHeight: '22px', textAlign: 'center', flexShrink: 0,
        }}
      >
        {n}
      </span>
      {/* 16px/800 dark — deliberately ABOVE the 14px card titles beneath it, which is the
          inversion this whole component exists to correct. */}
      <span style={{ fontSize: 16, fontWeight: 800, color: '#2C2A26', lineHeight: 1.25 }}>
        {children}
      </span>
      {meta}
    </div>
  );
}

/**
 * The section's content, held by a rule in its own colour.
 *
 * ⚠️ A TINT, NOT THE FULL COLOUR. Six saturated 3px rules down one page would compete with the
 * content they are meant to be organising; at 34% they read as structure rather than as emphasis.
 * The number chip carries the saturated version, once, where it is doing identification work.
 */
export function sectionWrap(color) {
  return {
    // ⚠️ THE RULE HOLDS THE HEADING TOO, not just the cards under it. Running it from the number
    // chip down past the last card is what makes a section one object — a rule that started BELOW
    // the heading would leave the heading floating and group only the cards, which is the grouping
    // that was already unclear.
    borderLeft: `3px solid ${color}57`,
    paddingLeft: 13,
    // ⚠️ A TINT, NOT THE FULL COLOUR. Six saturated 3px rules down one page compete with the
    // content they are meant to be organising; at ~34% they read as structure rather than emphasis.
    // The number chip carries the saturated version once, where it is doing identification work.
  };
}
