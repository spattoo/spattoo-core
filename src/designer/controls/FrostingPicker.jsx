import { FROSTING_COLORS, FROSTING_TYPES } from '../hooks/useCakeDesign';

export default function FrostingPicker({ frosting, onChange }) {
  return (
    <div style={styles.section}>
      <label style={styles.label}>Frosting</label>

      {/* Type */}
      <div style={styles.chipRow}>
        {FROSTING_TYPES.map(ft => (
          <button
            key={ft.value}
            onClick={() => onChange('frosting.type', ft.value)}
            style={{
              ...styles.chip,
              ...(frosting.type === ft.value ? styles.chipActive : {}),
            }}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* Color swatches */}
      <div style={styles.swatchRow}>
        {FROSTING_COLORS.map(fc => (
          <button
            key={fc.value}
            title={fc.label}
            onClick={() => onChange('frosting.color', fc.value)}
            style={{
              ...styles.swatch,
              background: fc.value,
              border: frosting.color === fc.value
                ? '3px solid #1a1a1a'
                : '2px solid #999999',
              transform: frosting.color === fc.value ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const styles = {
  section: {
    marginBottom: 20,
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
    marginBottom: 12,
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
  swatchRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'transform 0.15s',
    padding: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
};
