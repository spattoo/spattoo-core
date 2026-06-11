import { DRIP_COLORS, FLOWER_COLORS } from '../hooks/useCakeDesign';

function SwatchRow({ options, selected, onSelect }) {
  return (
    <div style={styles.swatchRow}>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          title={opt.label}
          onClick={() => onSelect(opt.value)}
          style={{
            ...styles.swatch,
            background: opt.value ?? '#f0e8eb',
            border: selected === opt.value
              ? '3px solid #1a1a1a'
              : '2px solid #999999',
            transform: selected === opt.value ? 'scale(1.2)' : 'scale(1)',
            position: 'relative',
          }}
        >
          {/* "No" option gets an X */}
          {opt.value === null && (
            <span style={styles.noMark}>✕</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function DecorationPicker({ drip, flowers, onChange }) {
  return (
    <div>
      {/* Drip */}
      <div style={styles.section}>
        <label style={styles.label}>Drip</label>
        <SwatchRow
          options={DRIP_COLORS}
          selected={drip}
          onSelect={v => onChange('drip', v)}
        />
      </div>

      {/* Flowers */}
      <div style={styles.section}>
        <label style={styles.label}>Flowers</label>
        <SwatchRow
          options={FLOWER_COLORS}
          selected={flowers}
          onSelect={v => onChange('flowers', v)}
        />
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMark: {
    fontSize: 12,
    color: '#b07a8a',
    fontWeight: 700,
    lineHeight: 1,
  },
};
