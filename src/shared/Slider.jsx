import { useId } from 'react';

/* ── THE slider ──────────────────────────────────────────────────────────────────────────────────
 *
 * A label, the current value beside it, and a track. Use it wherever a number is chosen by dragging.
 *
 * ⚠️ THERE WERE FIVE OF THESE AND NO SHARED ONE. `<input type="range">` is hand-rolled in
 * FrameControls, MyDecorationStudio, TopperComposer, GarnishStudio and CakeDesigner — each with its
 * own label markup, its own accent colour and its own idea of where the value goes, or whether it is
 * shown at all. Lifted from TopperComposer's `Slide`, which was the only one already shaped as a
 * general control: label left, live value right, formatter for the units.
 *
 * ⚠️ NOT A REPLACEMENT FOR `SizeDial` OR `ColorWheel`. Those are THE controls for a cake's size and
 * for a colour a customer picks (root CLAUDE.md rule 1), and they are not sliders wearing a hat — a
 * size has a dial because it reads against the cake. This is for the ordinary case: a bounded number
 * with no better metaphor.
 *
 * ── `value = null` IS "NOT SET", AND IT IS THE REASON THIS TAKES A `placeholder` ────────────────
 * A range input always has a position, so a filter built on one starts life filtering. The template
 * panel's age filter is the worked example: no template in the catalogue has `min_age` 0, so a
 * slider resting at its floor would have answered "no templates match" before anybody touched it.
 * Passing `null` parks the thumb at the floor, shows `placeholder` instead of a number, and tells
 * the caller nothing has been chosen — `onChange` only ever fires with a real number.
 */
export function Slider({
  label, value, min, max, step = 1, onChange,
  fmt,                    // (value) => string — units, "18+", "2.5 kg"
  placeholder = null,     // shown in place of the value while `value` is null
  accent = '#3D5A44',
  onClear = null,         // when given and a value is set, a small "any" escape appears
  ariaLabel,
}) {
  const unset = value == null;
  const id = useId();

  /* ⚠️ THE CLEAR BUTTON IS NOT INSIDE THE <label>, and the first version had it there. A button
     nested in a label is a nested interactive control: the accessibility tree does not surface it
     (Playwright's getByRole could not find a button that was plainly on screen and plainly clickable
     — which is the same tree a screen reader reads), and a click on it also activates the label and
     focuses the input. `htmlFor` gives the same association without the nesting. */
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 11.5, fontWeight: 700, color: accent, cursor: 'pointer' }}>{label}</label>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: unset ? '#A2968A' : '#6B7C70',
                         fontVariantNumeric: 'tabular-nums' }}>
            {unset ? (placeholder ?? '—') : (fmt ? fmt(value) : value)}
          </span>
          {/* The way back to "not set". A range input cannot express that by itself, so without this
              the only escape from a filter is to reload the panel. */}
          {!unset && onClear && (
            <button type="button" onClick={(e) => { e.preventDefault(); onClear(); }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                             font: 'inherit', fontSize: 10.5, fontWeight: 700, color: accent,
                             textDecoration: 'underline', textUnderlineOffset: 2 }}>
              any
            </button>
          )}
        </span>
      </div>
      <input
        id={id}
        type="range" min={min} max={max} step={step}
        value={unset ? min : value}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: accent,
                 // Parked-at-the-floor and chosen-the-floor look identical otherwise, and only one
                 // of them is filtering anything.
                 opacity: unset ? 0.55 : 1 }}
      />
    </div>
  );
}

export default Slider;
