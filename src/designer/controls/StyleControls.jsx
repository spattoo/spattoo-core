// Generic per-tier STYLE controls — renders one labeled slider per param in `params` (already the
// user-facing subset of the active style's schema). Works for ANY texture with zero per-style code:
// the schema drives the controls. `values` = resolved current values, `onChange(key, value)`.
export default function StyleControls({ params, values, onChange }) {
  if (!params?.length) return null;
  return (
    <div style={styles.section}>
      {params.map(p => (
        <div key={p.key} style={styles.row}>
          <div style={styles.head}>
            <span style={styles.label}>{p.label}</span>
            <span style={styles.val}>{fmt(values[p.key], p.step)}</span>
          </div>
          <input
            type="range"
            min={p.min} max={p.max} step={p.step}
            value={values[p.key]}
            onChange={e => onChange(p.key, Number(e.target.value))}
            style={styles.range}
          />
        </div>
      ))}
    </div>
  );
}

// Show integers cleanly, fractions to a sensible precision derived from the step.
function fmt(v, step) {
  if (Number.isInteger(step)) return String(Math.round(v));
  const dp = Math.min(3, Math.max(0, String(step).split('.')[1]?.length ?? 2));
  return Number(v).toFixed(dp);
}

const styles = {
  section: { marginBottom: 14 },
  row: { marginBottom: 10 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#7a4a5a', fontFamily: "'Quicksand', sans-serif" },
  val: { fontSize: 12, color: '#999', fontFamily: "'Quicksand', sans-serif" },
  range: { width: '100%', accentColor: '#d4849a', cursor: 'pointer' },
};
