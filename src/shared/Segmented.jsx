import { useRef } from 'react';

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
  items, value, onChange, isMobile = false, equal = false, tone = '#1a1a1a', label = null,
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
        gap: 3, padding: 3, borderRadius: 12, flexShrink: 0,
        background: TRACK, border: `1.5px solid ${HAIR}`,
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
              /* ⚠️ MEASURE THE TAP TARGET, do not assume it. This said "44px on a phone" while
                 padding alone produced 33 — the label's line box is smaller than it looks and the
                 arithmetic is easy to get wrong in your head. `minHeight` states the guarantee
                 instead of hoping padding adds up to it. */
              minHeight: isMobile ? 44 : undefined,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: isMobile ? '6px 10px' : '6px 12px',
              fontSize: 12, fontWeight: 800,
              background: on ? '#fff' : 'transparent',
              color:      on ? tone : IDLE,
              boxShadow:  on ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            <span style={{ display: 'block' }}>{t.label}</span>
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
