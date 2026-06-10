// Tin helper silhouette — a clean wireframe of the stacked tiers, sized by tin.
// Round tiers render as cylinders (full top ellipse + the tier below's top + the
// tier's own footprint ellipse where they meet); square/rect tiers render as
// boxes (3/4 view). Bodies don't overlap, so no occlusion/fills are needed — it's
// a pure line drawing. Verified in Chromium against the baker's reference.

const BASE_RX = 110;    // half-width of widest round tier
const RY_FACTOR = 0.18; // ellipse vertical squash
const BASE_HW = 96;     // half-width of widest square tier (front face)
const DX_F = 0.42;      // box depth: horizontal, as fraction of half-width
const DY_F = 0.34;      // box depth: vertical
const H = 120;          // tier body height
const PAD = 16;
const CX = 150;
const VBW = 300;
const STROKE = '#8f8a80';

const isSquare = (t) => t.shape === 'square' || t.shape === 'rect';

function Line({ a, b }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={STROKE} strokeWidth="1.1" />;
}

function Labels({ t, midY }) {
  return (
    <>
      <text x={CX} y={midY - 2} textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#3a352e" style={{ fontFamily: 'inherit' }}>
        {t.tinInch ? `${t.tinInch}″ ${t.shape}` : '—'}
      </text>
      {t.weightKg != null && (
        <text x={CX} y={midY + 17} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#6b6459" style={{ fontFamily: 'inherit' }}>
          {t.weightKg} kg
        </text>
      )}
    </>
  );
}

function Cylinder({ t }) {
  const { rx, ry, topY, bottomY } = t;
  const L = CX - rx, R = CX + rx, midY = (topY + bottomY) / 2;
  return (
    <g>
      <ellipse cx={CX} cy={topY} rx={rx} ry={ry} fill="none" stroke={STROKE} strokeWidth="1.1" />
      <line x1={L} y1={topY} x2={L} y2={bottomY} stroke={STROKE} strokeWidth="1.1" />
      <line x1={R} y1={topY} x2={R} y2={bottomY} stroke={STROKE} strokeWidth="1.1" />
      {/* full bottom ellipse on every tier so the base reads complete, not cut off */}
      <ellipse cx={CX} cy={bottomY} rx={rx} ry={ry} fill="none" stroke={STROKE} strokeWidth="1.1" />
      <Labels t={t} midY={midY} />
    </g>
  );
}

function Box({ t }) {
  const { hw, topY, bottomY } = t;
  const midY = (topY + bottomY) / 2;
  const dx = hw * DX_F, dy = hw * DY_F;
  const x0 = CX - hw - dx / 2, x1 = CX + hw - dx / 2;     // shift left to centre the prism
  const FTL = [x0, topY], FTR = [x1, topY], FBR = [x1, bottomY], FBL = [x0, bottomY];
  const BTL = [x0 + dx, topY - dy], BTR = [x1 + dx, topY - dy], BBR = [x1 + dx, bottomY - dy];
  return (
    <g>
      {/* front face */}
      <Line a={FTL} b={FTR} /><Line a={FTR} b={FBR} /><Line a={FBR} b={FBL} /><Line a={FBL} b={FTL} />
      {/* top face */}
      <Line a={FTL} b={BTL} /><Line a={FTR} b={BTR} /><Line a={BTL} b={BTR} />
      {/* right face */}
      <Line a={FBR} b={BBR} /><Line a={BBR} b={BTR} />
      <Labels t={t} midY={midY} />
    </g>
  );
}

export default function XrayTinDiagram({ tiers }) {
  const inches = tiers.map((t) => t.tinInch).filter(Boolean);
  if (inches.length === 0) return null;
  const maxInch = Math.max(...inches);
  const n = tiers.length;

  const geo = tiers.map((t) => {
    const frac = (t.tinInch || maxInch * 0.5) / maxInch;
    return { ...t, sq: isSquare(t), rx: BASE_RX * frac, ry: BASE_RX * frac * RY_FACTOR, hw: BASE_HW * frac };
  });

  const topOver = (g) => (g.sq ? g.hw * DY_F : g.ry);
  const botOver = (g) => (g.sq ? 0 : g.ry);

  // Place top-down: topmost tier first, each lower tier's top = upper tier's bottom.
  geo[n - 1].topY = PAD + topOver(geo[n - 1]);
  geo[n - 1].bottomY = geo[n - 1].topY + H;
  for (let i = n - 2; i >= 0; i--) {
    geo[i].topY = geo[i + 1].bottomY;
    geo[i].bottomY = geo[i].topY + H;
  }
  const vbh = geo[0].bottomY + botOver(geo[0]) + PAD;

  return (
    <div style={{ maxWidth: 280, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${VBW} ${vbh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* base first (index 0); a tier sits on the one below it */}
        {geo.map((t) => (t.sq ? <Box key={t.index} t={t} /> : <Cylinder key={t.index} t={t} />))}
      </svg>
    </div>
  );
}
