import { normalizeTiers, anchorWorld, projectToScreen } from './xrayProject.js';

// Annotated cake — the order's design thumbnail with leader lines projected
// EXACTLY onto each piping (via the matching thumbnail camera). Labels are the
// recommended nozzle only. The thumbnail is square (1:1); we centre it in a
// wider box and put nozzle labels in the side margins.

const A = 1.7;                 // diagram box aspect (w/h)
const CW = 1 / A;              // cake (square) width as a fraction of box width
const CX0 = (1 - CW) / 2;      // left edge of the cake within the box
const MIN_GAP = 8;             // min vertical gap between labels on a side (%)

function placeColumn(items) {
  const sorted = [...items].sort((a, b) => a.by - b.by);
  let last = -Infinity;
  for (const it of sorted) { it.ly = Math.max(it.by, last + MIN_GAP); last = it.ly; }
  const over = (sorted[sorted.length - 1]?.ly ?? 0) - 97;
  if (over > 0) for (const it of sorted) it.ly -= over;
  return sorted;
}

const strokeFor = (s) => (s?.label === 'Strong' ? '#1E7A35' : s?.label === 'Good' ? '#B26B00' : '#8A7CB0');

export default function XrayCakeDiagram({ thumbnailUrl, items, snapshotTiers }) {
  if (!thumbnailUrl || !items?.length) return null;
  const tiers = normalizeTiers(snapshotTiers);
  if (tiers.length === 0) return null;

  // Project each item's anchor onto the thumbnail, mapped into box coordinates.
  const enriched = items.map((it, i) => {
    const side = i % 2 === 0 ? 'L' : 'R';
    const tier = tiers[it.tierIndex] ?? tiers[tiers.length - 1];
    const p = projectToScreen(anchorWorld(tier, it.zone, side));
    return { ...it, side, ax: (CX0 + p.x * CW) * 100, by: p.y * 100 };
  });
  const all = [
    ...placeColumn(enriched.filter(e => e.side === 'L')),
    ...placeColumn(enriched.filter(e => e.side === 'R')),
  ];

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: String(A), maxWidth: 760, margin: '0 auto' }}>
      {/* cake image, square, centred */}
      <img
        src={thumbnailUrl}
        alt=""
        style={{ position: 'absolute', top: 0, height: '100%', left: `${CX0 * 100}%`, width: `${CW * 100}%`, objectFit: 'contain' }}
      />

      {/* leader lines + anchor dots */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {all.map((it) => {
          const lx = it.side === 'L' ? CX0 * 100 - 3 : (CX0 + CW) * 100 + 3;
          return (
            <polyline
              key={it.key}
              points={`${lx},${it.ly} ${it.ax},${it.by}`}
              fill="none" stroke="#9a958d" strokeWidth="0.4"
              strokeDasharray="0.5 1" strokeLinecap="round" opacity="0.9"
            />
          );
        })}
      </svg>

      {/* nozzle labels in the margins */}
      {all.map((it) => {
        const isL = it.side === 'L';
        return (
          <div key={it.key} style={{
            position: 'absolute', top: `${it.ly}%`, [isL ? 'left' : 'right']: '0.5%',
            transform: 'translateY(-50%)', maxWidth: `${CX0 * 100 - 2}%`, textAlign: isL ? 'left' : 'right',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: strokeFor(it.strength), lineHeight: 1.15 }}>{it.primaryLabel}</div>
            {it.strength && <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa' }}>{it.strength.pct}% match</div>}
          </div>
        );
      })}
    </div>
  );
}
