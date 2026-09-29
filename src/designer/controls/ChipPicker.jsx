import Chip from '../../shared/Chip.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { INK } from '../../shared/tokens.js';

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
export default function ChipPicker({ label, options, value, onChange }) {
  const narrow = useNarrow();
  return (
    <div style={styles.section}>
      <label style={styles.label}>{label}</label>
      <div style={styles.chipRow}>
        {options.map(opt => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={value === opt.value}
            isMobile={narrow}
            onClick={() => onChange(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

/* ⚠️ THE MARGINS ARE TIGHT ON PURPOSE, and this is a partial fix that should not be mistaken for a
 * complete one. On the tier sheet's Frosting tab at 390×844 the body shows 316px against 459px of
 * content, so the "Cream layer" row at the end sat 119px below the fold. FROSTING and STYLE are
 * 122px each — 64% of the section — because four and five chips wrap to two lines.
 *
 * ⚠️ WRAPPING IS THE RIGHT BEHAVIOUR AND STAYS. Scrolling the row instead was tried and reverted:
 * it recovered 104px and then clipped the labels at both edges ("…rcream", "Vertic…"), which is the
 * one thing `ScrollFadeRow` and `Segmented` both refuse — "a wrapped second row is always better
 * than a lie". Two honest lines beat one truncated one.
 *
 * So what is left to give is spacing, and only this control's own: `section` 14→4 and `label` 10→6
 * buys 28px across the two rows. Between the Frosting and Style groups that still leaves 14px of
 * separation, because the sheet body's own `gap: 10` sits on top of this margin — which is also why
 * the margin could go this low without the groups running together.
 *
 * ⚠️ NOT THE BODY'S `gap`. Trimming `s.sheetBody`'s 10px would buy 40px more and reflow every other
 * tab — Colour, Pattern, Size — to fix a crowding problem that belongs to this one.
 *
 * ⚠️ IT DOES NOT CLOSE THE GAP. ~34px against 119px. The row is still reached by scrolling, which
 * the sheet's double-chevron marker announces. Fixing it properly means one of the two things this
 * comment rules out or a block leaving this tab — recorded so the next person does not re-try the
 * scrolling row and rediscover the clipping.
 */
const styles = {
  section: { marginBottom: 4 },
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
  chipRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
};
