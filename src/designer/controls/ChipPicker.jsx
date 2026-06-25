// Labeled chip-row picker — the shared presentational control behind the per-tier Frosting (type) and
// Style pickers (and any future single-select chip row). `options` = [{ value, label }]; the chip whose
// value === `value` shows the active style; `onChange(value)` fires on click. Pure presentation — the
// caller supplies the label, the options, and how to resolve/apply the value.
export default function ChipPicker({ label, options, value, onChange }) {
  return (
    <div style={styles.section}>
      <label style={styles.label}>{label}</label>
      <div style={styles.chipRow}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{ ...styles.chip, ...(value === opt.value ? styles.chipActive : {}) }}
          >
            {opt.label}
          </button>
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
  chip: {
    padding: '6px 14px',
    borderRadius: 20,
    border: '1.5px solid #e0c8cf',
    background: '#fff',
    fontSize: 13,
    color: '#7a4a5a',
    cursor: 'pointer',
    fontFamily: "'Quicksand', sans-serif",
    fontWeight: 500,
  },
  chipActive: {
    background: '#f5b8c8',
    border: '1.5px solid #d4849a',
    color: '#6b3040',
    fontWeight: 700,
  },
};
