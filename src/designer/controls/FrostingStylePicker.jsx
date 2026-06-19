// Per-tier frosting STYLE (surface technique) picker — a chip row over the cream styles allowed for
// the tier's current frosting type (Smooth | Cream Wave | Swirl | Rustic). Geometry only; the tier's
// material comes from its type and its colour from the ColorWheel. `value` = current style,
// `options` = [{ value, label }] (already filtered by what the type permits), `onChange(style)`.
export default function FrostingStylePicker({ value, options, onChange }) {
  return (
    <div style={styles.section}>
      <label style={styles.label}>Style</label>
      <div style={styles.chipRow}>
        {options.map(st => (
          <button
            key={st.value}
            onClick={() => onChange(st.value)}
            style={{ ...styles.chip, ...(value === st.value ? styles.chipActive : {}) }}
          >
            {st.label}
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
