import { CakePreview } from '../canvas/CakeCanvas.jsx';
import { starterDesign } from '../hooks/useCakeDesign.js';

// The camera a shape is judged from. Same view the Cake Shape Studio captures its thumbnail through — the
// live tile below and the saved image must agree, or a shape would change appearance the moment somebody
// saved a picture of it.
//
// The front of the cake, LIFTED about 25°: dead-on, a heart is a slab with a notch and reads as a box —
// the footprint, which is the entire thing being chosen, is the one thing a pure front view hides. Tilting
// enough to see the top surface shows the outline AND keeps it a cake. Long lens (20°) pulled in close, so
// the cake fills the tile without the wide-angle splay that makes a straight wall bulge at the base.
export const SHAPE_VIEW = { fov: 20, cameraPosition: [0, 5.0, 7.4], target: [0, 0.45, 0] };

// ── Shape tile — a cake, from the front ───────────────────────────────────────
// A cake, NOT a footprint. The first version of this drew the top-down outline, and it was useless on
// sight: every circle-family shape (Round, Cylinder, 2T Cylinder) drew the identical pink disc, so the
// grid was a geometry lesson that told you nothing about the cake you were about to start.
//
// Preferred source is the saved front view (`thumbnailKey`, rendered through the real renderer when admin
// saved the shape) — an <img> costs nothing, so the grid holds up at any catalog size. A shape with no
// picture yet falls back to rendering the real starter cake live: correct, and self-limiting, since it
// only costs a WebGL context for shapes nobody has captured. (A grid of ALL-live tiles would not hold:
// browsers cap concurrent contexts around 16 and start blanking the extras.)
export function ShapeTile({ shape, size = 96 }) {
  if (shape.thumbnailKey) {
    return (
      <img
        src={shape.thumbnailKey} alt="" width={size} height={size}
        loading="lazy" decoding="async"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size }}>
      <CakePreview design={starterDesign(shape.key)} autoRotate={false} {...SHAPE_VIEW} />
    </div>
  );
}

// ── The New-cake shape grid ───────────────────────────────────────────────────
// The first thing pressing "New" asks. It offers whatever is in the catalog — the two seeded keys plus
// every shape admin authored in the Cake Shape Studio — so a new shape reaches customers as a DB row, not
// a release. `shapes` is passed in rather than read from the module, so the caller owns the one list this
// grid and the tier's Shape row both read.
//
// Closing WITHOUT choosing leaves the cake alone: the caller discards nothing until onPick fires, so a
// mis-tap on New costs nothing.
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
                <div style={styles.art}><ShapeTile shape={s} /></div>
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
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Quicksand',sans-serif" },
  head:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #eee' },
  title: { fontSize: 15, fontWeight: 800, color: '#1a1a1a' },
  sub:   { fontSize: 11.5, color: '#888', marginTop: 2 },
  x:     { border: 'none', background: 'none', fontSize: 16, color: '#888', cursor: 'pointer' },
  body:  { padding: 16, overflowY: 'auto', flex: 1 },

  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 },
  card:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10, border: '1.5px solid #e2e0e6', borderRadius: 12, background: '#faf9fb', cursor: 'pointer', fontFamily: 'inherit' },
  art:   { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96 },
  name:  { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.3 },
};
