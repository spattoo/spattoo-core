import { layoutDiagram, DIAGRAM } from './xrayProject.js';
import { strengthColor } from './report.js';

// Annotated cake — the order's design thumbnail with leader lines projected
// EXACTLY onto each piping (via the matching thumbnail camera). Labels are the
// recommended nozzle only. The thumbnail is square (1:1); we centre it in a
// wider box and put nozzle labels in the side margins.
//
// WHERE the labels go is decided by layoutDiagram (xrayProject.js) — the very
// same call the printable PDF makes, so the screen and the sheet in the kitchen
// point at the same piping. This file only turns those fractions into SVG/CSS.

const pct = (v) => `${v * 100}%`;

export default function XrayCakeDiagram({ thumbnailUrl, items, snapshotTiers }) {
  if (!thumbnailUrl) return null;
  const all = layoutDiagram(items, snapshotTiers);
  if (!all.length) return null;

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: String(DIAGRAM.aspect), maxWidth: 760, margin: '0 auto' }}>
      {/* cake image, square, centred */}
      <img
        src={thumbnailUrl}
        alt=""
        style={{ position: 'absolute', top: 0, height: '100%', left: pct(DIAGRAM.cakeX), width: pct(DIAGRAM.cakeW), objectFit: 'contain' }}
      />

      {/* leader lines + anchor dots */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {all.map((it) => {
          const lx = it.side === 'L'
            ? DIAGRAM.cakeX * 100 - 3
            : (DIAGRAM.cakeX + DIAGRAM.cakeW) * 100 + 3;
          return (
            <polyline
              key={it.key}
              points={`${lx},${it.ly * 100} ${it.ax * 100},${it.ay * 100}`}
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
            position: 'absolute', top: pct(it.ly), [isL ? 'left' : 'right']: '0.5%',
            transform: 'translateY(-50%)', maxWidth: `${DIAGRAM.cakeX * 100 - 2}%`, textAlign: isL ? 'left' : 'right',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: strengthColor(it.strength), lineHeight: 1.15 }}>{it.primaryLabel}</div>
            {it.strength && <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa' }}>{it.strength.pct}% match</div>}
          </div>
        );
      })}
    </div>
  );
}
