import Chip from '../../shared/Chip.jsx';
import { useNarrow } from '../../shared/useNarrow.js';

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

const styles = {
  section: { marginBottom: 14 },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a1a',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: "'Quicksand', sans-serif",
  },
  chipRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
};
