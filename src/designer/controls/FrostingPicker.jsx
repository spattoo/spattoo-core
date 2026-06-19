import { FROSTING_TYPES } from '../hooks/useCakeDesign';

// Per-tier frosting TYPE (material) picker — a chip row over FROSTING_TYPES
// (buttercream | whipped | fondant | naked). Type only; the tier's colour is handled
// by the shared ColorWheel. `value` = the tier's current frostingType, `onChange(type)`.
export default function FrostingTypePicker({ value, onChange }) {
  return (
    <div style={styles.section}>
      <label style={styles.label}>Frosting</label>
      <div style={styles.chipRow}>
        {FROSTING_TYPES.map(ft => (
          <button
            key={ft.value}
            onClick={() => onChange(ft.value)}
            style={{ ...styles.chip, ...(value === ft.value ? styles.chipActive : {}) }}
          >
            {ft.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  section: {
    marginBottom: 14,
  },
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
  chipRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
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
