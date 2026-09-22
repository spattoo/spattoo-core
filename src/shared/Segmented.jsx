import { useRef } from 'react';
import { INK } from './tokens.js';

// ── Pick one of a few, to change what is shown ──────────────────────────────────────────────────
//
// Extracted at the THIRD copy, which is two later than it should have been: the orders List/Calendar
// switch, and then Before/After and the tool strip in the finished-photo editor. All three had grown
// the same track (#F2F0EB on a #E8E4DC hairline), the same white raised selection with the same
// 0 1px 3px shadow, and the same three-line style ternary — and none of them had a focus ring, a
// keyboard path or a single line of ARIA. That is the real cost of a fourth copy: the visual drift
// is what you notice, and the accessibility is what silently never arrives.
//
// ⚠️ THIS IS A TABLIST, NOT A ROW OF BUTTONS, and that is not pedantry. To a screen reader an
// unmarked row says "button, button, button" with nothing to say they are alternatives, which is
// selected, or how many there are. Marked up, it says "tab, 2 of 4, selected". The keyboard
// behaviour follows the same pattern: arrows move between tabs and Tab leaves the group, so a strip
// of eight does not cost eight presses to walk past.
//
// Use `Chip` instead when the options are INDEPENDENT (a dietary picker: any number on at once).
// This is for mutually exclusive choices that change what is displayed below or beside them.

const TRACK  = '#F2F0EB';
const HAIR   = '#E8E4DC';
const IDLE   = '#8a8a8a';

/**
 * items    [{ id, label, note?, noteOn? }] — `note` is a second line (an amount, a count, a state);
 *          `noteOn` colours it with `tone` rather than grey, for "this one is doing something".
 * equal    true  → equal-width columns (a strip that must not reflow as labels change)
 *          false → each hugs its label (a two-item switch tucked into a header)
 * tone     the selected label's colour; the brand/primary colour where there is one.
 */
export default function Segmented({
  items, value, onChange, isMobile = false, equal = false, tone = INK, label = null,
  scroll = false,
}) {
  const refs = useRef([]);

  // Arrows move the selection AND the focus together (the ARIA "automatic activation" pattern):
  // for a strip whose whole job is switching a view, hearing the next option without seeing it is
  // the less useful half of the interaction.
  function onKeyDown(e) {
    const i = items.findIndex(t => t.id === value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % items.length;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End')  next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label ?? undefined}
      onKeyDown={onKeyDown}
      style={{
        display: equal ? 'grid' : 'flex',
        gridTemplateColumns: equal ? `repeat(${items.length}, 1fr)` : undefined,
        // Hugging strips WRAP rather than compress; equal ones are a grid and cannot wrap at all.
        /* ⚠️ `scroll` is the THIRD shape, for a strip too long to wrap sensibly. Eleven font names
           are ~880px of labels: wrapped, that is three rows inside a tinted track on a phone, which
           is no smaller than the grid it replaced. Scrolled, it is one row.
           It does NOT breach the rule below. That rule forbids SHRINKING or CLIPPING a label —
           "Nor", "Hatc", "Cros s-hatc h" — and scrolling keeps every label at full size; only the
           track moves. Reach for it when wrapping would cost more rows than the list is worth, not
           to avoid thinking about label length. */
        flexWrap: equal || scroll ? undefined : 'wrap',
        ...(scroll ? { overflowX: 'auto', scrollbarWidth: 'none' } : null),
        gap: 3, padding: 3, borderRadius: 12, flexShrink: 0,
        background: TRACK, border: `1.5px solid ${HAIR}`,
        /* ⚠️ THE 44px TOUCH TARGET IS THE TRACK'S, NOT EACH TAB'S PLUS THE TRACK'S CHROME. It used
           to sit on the buttons, so the control came out at 44 + 3px padding + 1.5px border top and
           bottom = 53px — against 32px neighbours in the orders header, which read as swollen next
           to everything beside it. Reported as "looks bulgy".
           Carried here, the control IS 44 and each tab stretches to fill it, so the tap area is the
           full height of the control minus its own 9px of chrome. Same guarantee for the thing a
           finger actually aims at; 9px less box around it. */
        /* ⚠️ border-box, OR THE PADDING AND BORDER GO ON TOP AGAIN. `minHeight` is content-box by
           default, so 44 here meant 44 + 6 + 3 = 53 and the control came out exactly as tall as
           before — the change measured as no change. Caught by measuring rather than by reading. */
        ...(isMobile ? { minHeight: 44, boxSizing: 'border-box', alignItems: 'stretch' } : null),
      }}
    >
      {/* The one place a focus ring can live: :focus-visible has no inline-style equivalent, and
          without it a keyboard user moving through the strip sees nothing move. */}
      <style>{`.spattoo-seg:focus-visible { outline: 2px solid ${tone}; outline-offset: -1px; }`}</style>

      {items.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={el => { refs.current[i] = el; }}
            className="spattoo-seg"
            type="button"
            role="tab"
            aria-selected={on}
            /* Roving tabindex: the strip is ONE tab stop, and arrows move within it. */
            tabIndex={on ? 0 : -1}
            title={t.title ?? undefined}
            onClick={() => onChange(t.id)}
            style={{
              border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              minWidth: 0, textAlign: 'center',
              /* ⚠️ NEVER SHRINK A LABEL TO FIT. Flex's default is to compress items, and with the
                 clip below that silently truncates: six hugging tabs in a 340px column rendered as
                 "Nor", "Hatc", "Wov". A wrapped second row is always better than a lie. */
              flexShrink: 0,
              /* ⚠️ MEASURE THE TAP TARGET, do not assume it. This said "44px on a phone" while
                 padding alone produced 33 — the label's line box is smaller than it looks and the
                 arithmetic is easy to get wrong in your head.
                 ⚠️ THE NUMBER CHANGED AND SAYING SO IS THE POINT. The guarantee lives on the TRACK
                 now (see above), so on a phone the control is 44px and each tab stretches to 36 —
                 44 minus the track's own 3px padding and 1.5px border, top and bottom. 36 is below
                 the 44 of WCAG 2.5.5 (Enhanced) and well above the 24 of 2.5.8 (Minimum), which is
                 the level that is actually required; and the target is 36 × ~60px, so the short
                 side is the only one near a limit. The 8px bought back is what stopped this
                 reading as swollen beside 32px neighbours. If a strip ever needs the full 44 on
                 the tab itself, raise the track — do not put minHeight back here, or the two add
                 up again. */
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: isMobile ? '6px 10px' : '6px 12px',
              fontSize: 12, fontWeight: 800,
              background: on ? '#fff' : 'transparent',
              color:      on ? tone : IDLE,
              boxShadow:  on ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            {/* ⚠️ A LONG LABEL MUST NOT SPILL OUT OF ITS SEGMENT — and must not be MANGLED either.
                It took three goes. Letting it overflow printed "Scribble" past the rounded border;
                breaking anywhere gave "Non e" and "Cros s-hatc h"; clipping gave "Nor" and "Hatc".
                The clip stays as a backstop, but the fix that works is structural: `equal` lays a
                grid that cannot wrap, so it is for a FEW SHORT labels only, and a hugging strip
                wraps to a second row instead of compressing. */}
            <span style={{ display: 'block', overflow: 'hidden' }}>{t.label}</span>
            {t.note != null && (
              <span style={{
                display: 'block', fontSize: 10, fontWeight: 800, marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
                color: t.noteOn ? tone : '#BDB8B0',
              }}>{t.note}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
