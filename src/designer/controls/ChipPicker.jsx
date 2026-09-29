import Chip from '../../shared/Chip.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { INK } from '../../shared/tokens.js';
import { ScrollFadeRow } from '../shared/ScrollFadeRow.jsx';

// Labeled chip-row picker — the shared presentational control behind the per-tier Frosting (type) and
// Style pickers (and any future single-select chip row). `options` = [{ value, label }]; the chip whose
// value === `value` shows the active style; `onChange(value)` fires on click. Pure presentation — the
// caller supplies the label, the options, and how to resolve/apply the value.
//
// ⚠️ The pill itself is `src/shared/Chip.jsx`, never a hand-rolled button. This row carried its own
// pink pill for a while, which is how a baker ended up looking at a pink Frosting row beside a black
// "How the colour sits" row in the same panel. Chip's default tone IS the app's ink (#1a1a1a) — the
// same default the order form's chips fall back to — so a chip reads the same everywhere, and its
// aria-pressed, focus ring and phone hit-target come along with it.
export default function ChipPicker({ label, options, value, onChange, fade = '255,255,255' }) {
  const narrow = useNarrow();
  return (
    <div style={styles.section}>
      <label style={styles.label}>{label}</label>
      <ScrollFadeRow style={styles.chipRow} fade={fade}>
        {options.map(opt => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={value === opt.value}
            isMobile={narrow}
            onClick={() => onChange(opt.value)}
          />
        ))}
      </ScrollFadeRow>
    </div>
  );
}

/* ⚠️ ONE SCROLLING LINE PER GROUP, PLUS TIGHT MARGINS — together they got the tier sheet's Frosting
 * tab inside its own height, and the "Cream layer" row at its end onto the screen.
 *
 * Measured at 390×844: the tab body shows 316px, and FROSTING + STYLE were 122px each — 64% of the
 * section — because four and five chips wrapped to two lines. 143px sat below the fold and the row
 * was off-screen on arrival. Scrolling takes each group to 66px; the margins here (`section` 14→4,
 * `label` 10→6) give 28px more. Result: hidden 143→5px, the row's bottom 963→825 inside an 844 fold,
 * fully visible at 390px and 360px alike.
 *
 * ⚠️ TWO REVERTS BEFORE THIS LANDED, both on wrong diagnoses, recorded so the next person does not
 * repeat either. The first scrolling attempt truncated the labels ("…rcream", "Vertic…") and was
 * blamed on the chips being shrinkable — they never were, `Chip` sets `whiteSpace: nowrap` and
 * `flexShrink: 0`. The second blamed the row auto-scrolling to its active chip — it does not,
 * `scrollLeft` measures 0. The real cause is in `section` below: the tab body centres its children,
 * so a row wider than the sheet overhung BOTH edges equally. The tell was in the numbers all along —
 * symmetric cuts (57/57, 77/77) are centring, never scrolling; a bounded scroller clips on one side
 * only, which is what it now does.
 *
 * ⚠️ AND A CHECK THAT COULD NOT FAIL: "clipped" was measured as `scrollWidth > clientWidth` on the
 * CHIP, which a nowrap non-shrinking pill can never satisfy. Clipping has to be measured against the
 * element doing the clipping — the row's own box — or the probe reports a clean bill while the
 * screenshot plainly shows cut labels. It did, twice.
 *
 * ⚠️ NOT THE BODY'S `gap`. Trimming `s.sheetBody`'s 10px would buy 40px more and reflow every other
 * tab — Colour, Pattern, Size — to fix a crowding problem belonging to this one.
 */
const styles = {
  /* ⚠️ `width: 100%` IS WHAT STOPS THE CLIPPING, and the cause was neither of the two things I
     blamed first. The tab body (`s.sheetBody`) is a flex COLUMN with `alignItems: 'center'`, so every
     block in it shrink-wraps its content and is centred. A wrapped chip row is narrower than the
     sheet, so that centring never shows. A NON-wrapping row wants 435px inside 358px — and a centred
     435px box overhangs BOTH edges equally, which is exactly what was measured: Buttercream cut 57px
     on the left and Chocolate Glaze 57px on the right, Smooth 77px and Vertical Piping 77px, all at
     `scrollLeft: 0`.
     It was not the chips (`Chip` already sets `whiteSpace: nowrap` and `flexShrink: 0`), and it was
     not scroll-into-view (`scrollLeft` measures 0). Stretching the section to the body's width bounds
     the scroller, so `ScrollFadeRow` scrolls within it instead of spilling out of it. */
  section: { marginBottom: 4, width: '100%', alignSelf: 'stretch' },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: INK,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: "'Quicksand', sans-serif",
  },
  chipRow: { display: 'flex', gap: 8 },
};
