import { silhouettePath } from '../geometry/surface.js';

// ── Shape swatch — a footprint, drawn ─────────────────────────────────────────
// The outline comes from silhouettePath (→ tierShape), which is the same descriptor the renderer
// extrudes: what you press is what you get. Nothing here knows what a heart is.
//
// The tier passed in carries ONLY the shape key, so every shape draws at its own authored proportions
// (a Rectangle is 2.16 × 1.56, not a squashed square) and the viewBox — sized from the returned
// half-extents, with `meet` — fits that aspect into the tile without distorting it.
export function ShapeSwatch({ shapeKey, size = 78 }) {
  const { d, halfW, halfD } = silhouettePath({ shape: shapeKey });
  const pad = 0.06 * Math.max(halfW, halfD);
  const w = 2 * (halfW + pad), h = 2 * (halfD + pad);
  return (
    <svg
      width={size} height={size} aria-hidden="true"
      viewBox={`${-halfW - pad} ${-halfD - pad} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={d} fill="#f5b8c8" stroke="#d4849a" strokeWidth={Math.max(w, h) * 0.018} strokeLinejoin="round" />
    </svg>
  );
}

// ── The New-cake shape grid ───────────────────────────────────────────────────
// The first thing pressing "New" asks. It offers whatever is in the catalog — the two seeded keys plus
// every shape admin has authored in the Cake Shape Studio — so a new shape reaches customers as a DB row,
// not a release. `shapes` is passed in (never read from the module here) so the caller owns the one list
// both this grid and the tier's Shape row read.
//
// Closing WITHOUT choosing must leave the cake alone: the caller does not discard the current design
// until onPick fires, so a mis-tap on New costs nothing.
export default function ShapePicker({ shapes, onPick, onClose }) {
  return (
    <div style={styles.scrim} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.head}>
          <div>
            <div style={styles.title}>Start a new cake</div>
            <div style={styles.sub}>Pick a shape — you can change it later</div>
          </div>
          <button style={styles.x} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={styles.body}>
          <div style={styles.grid}>
            {shapes.map(s => (
              <button key={s.key} style={styles.card} onClick={() => onPick(s.key)}>
                <div style={styles.swatch}><ShapeSwatch shapeKey={s.key} /></div>
                <div style={styles.name}>{s.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(20,20,24,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '92vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Quicksand',sans-serif" },
  head:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #eee' },
  title: { fontSize: 15, fontWeight: 800, color: '#1a1a1a' },
  sub:   { fontSize: 11.5, color: '#888', marginTop: 2 },
  x:     { border: 'none', background: 'none', fontSize: 16, color: '#888', cursor: 'pointer' },
  body:  { padding: 16, overflowY: 'auto', flex: 1 },

  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 14 },
  card:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10, border: '1.5px solid #e2e0e6', borderRadius: 12, background: '#faf9fb', cursor: 'pointer', fontFamily: 'inherit' },
  swatch: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 78 },
  name:  { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.3 },
};
