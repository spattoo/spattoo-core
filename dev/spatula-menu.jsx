import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

/*
 * Standalone preview of the left nav strip re-shaped as a silicone SPATULA.
 * Open at  http://localhost:5173/spatula-menu.html
 *
 * Fully self-contained — it does NOT touch CakeDesigner.jsx. Once the look is
 * approved we port the silhouette + overlay into the real <s.sidebar>.
 *
 * The strip is an SVG spatula silhouette (handle + flared blade + hang hole)
 * sitting behind a flex column of the same nav items the real sidebar renders.
 */

// ── Icons (mirror the real sidebar) ───────────────────────────────────────────
const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PlusIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const DashboardIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const TemplatesIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <path d="M4 9h16l-2-3H6L4 9Z" /><path d="M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
    <circle cx="12" cy="5" r="1.2" />
  </svg>
);
const ElementsIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" opacity="0.5" />
  </svg>
);
const OrdersIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="9" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="12" y2="15" />
  </svg>
);
const CustomersIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2" /><path d="M19 8v6M22 11h-6" />
  </svg>
);
const InviteIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
  </svg>
);
const GearIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

const NAV = [
  { id: 'new',        label: 'New Cake',    Icon: PlusIcon,      isNew: true },
  { id: 'dashboard',  label: 'Dashboard',   Icon: DashboardIcon },
  { id: 'templates',  label: 'Templates',   Icon: TemplatesIcon },
  { id: 'elements',   label: 'Decorations', Icon: ElementsIcon },
  { id: 'orders',     label: 'Orders',      Icon: OrdersIcon },
  { id: 'customers',  label: 'Customers',   Icon: CustomersIcon },
  { id: 'invite',     label: 'Invite',      Icon: InviteIcon },
];

// ── Spatula silhouette path ───────────────────────────────────────────────────
// Proportions traced from the reference SVG (spattoo_sidebar_traced):
//  · blade centred on the handle, ~1.84× its width
//  · both shoulders flare symmetrically & gradually (~65px span each)
//  · bottom is asymmetric: a tight, LOW left heel + a big gentle right sweep,
//    with the flat (lowest) bottom sitting left-of-centre.
function spatulaPath({
  W, handleHalf, bladeHalf, capTopY,
  lShoulderY, rShoulderY, bladeFullY, bladeBotY,
  lCornerH, lCornerW, rCornerH, rCornerW,
}) {
  const cx = W / 2;
  const capR = handleHalf;
  const capCY = capTopY + capR;
  const Lh = cx - handleHalf, Rh = cx + handleHalf;
  const Lb = cx - bladeHalf,  Rb = cx + bladeHalf;
  // Each bottom corner: a cubic from the vertical edge (edgeBotY = where the curve
  // starts) into the flat (flatX = how far it reaches along the bottom).
  const rEdgeBotY = bladeBotY - rCornerH, flatR = Rb - rCornerW;
  const lEdgeBotY = bladeBotY - lCornerH, flatL = Lb + lCornerW;
  const rSh = bladeFullY - rShoulderY;
  const lSh = bladeFullY - lShoulderY;
  return [
    `M ${cx} ${capTopY}`,
    `A ${capR} ${capR} 0 0 1 ${Rh} ${capCY}`,
    `L ${Rh} ${rShoulderY}`,
    // right shoulder: flare out to full blade width
    `C ${Rh} ${rShoulderY + rSh * 0.5} ${Rb} ${bladeFullY - rSh * 0.5} ${Rb} ${bladeFullY}`,
    `L ${Rb} ${rEdgeBotY}`,                                  // right edge straight down
    // bottom-right corner sweeping into the flat
    `C ${Rb} ${bladeBotY} ${flatR + (Rb - flatR) * 0.45} ${bladeBotY} ${flatR} ${bladeBotY}`,
    `L ${flatL} ${bladeBotY}`,                               // flat bottom (lowest)
    // bottom-left corner up to the left edge
    `C ${flatL - (flatL - Lb) * 0.45} ${bladeBotY} ${Lb} ${bladeBotY} ${Lb} ${lEdgeBotY}`,
    `L ${Lb} ${bladeFullY}`,                                 // left edge straight up
    // left shoulder: flare back into the handle
    `C ${Lb} ${bladeFullY - lSh * 0.5} ${Lh} ${lShoulderY + lSh * 0.5} ${Lh} ${lShoulderY}`,
    `L ${Lh} ${capCY}`,
    `A ${capR} ${capR} 0 0 1 ${cx} ${capTopY}`,
    'Z',
  ].join(' ');
}

function SpatulaMenu({ primaryColor = '#7d7f4a', initials = 'ST' }) {
  const [active, setActive] = useState('elements');
  const [hover, setHover] = useState(null);

  // ── Live-tweakable bottom geometry (drag the sliders on the right) ──
  const [bladeHalf, setBladeHalf] = useState(61); // blade half-width
  const [bladeBotY, setBladeBotY] = useState(951); // bottom (lowest) Y
  const [lCornerH,  setLCornerH]  = useState(7);   // LEFT  corner: where the curve starts up the edge
  const [lCornerW,  setLCornerW]  = useState(37);  // LEFT  corner: how far it reaches along the bottom
  const [rCornerH,  setRCornerH]  = useState(90);  // RIGHT corner: where the curve starts up the edge
  const [rCornerW,  setRCornerW]  = useState(77);  // RIGHT corner: how far it reaches along the bottom

  // Geometry (SVG units == px so the overlay lines up 1:1).
  const W = 160, H = bladeBotY + 16;
  const geo = {
    W, handleHalf: 30, bladeHalf,
    capTopY: 8,
    lShoulderY: 692, rShoulderY: 692,    // shoulders symmetric & gradual (both span ~65px)
    bladeFullY: 757,                     // full blade width reached here
    bladeBotY,
    lCornerH, lCornerW, rCornerH, rCornerW,
  };
  const cx = W / 2;
  const holeY = geo.capTopY + geo.handleHalf + 24; // hang hole, just below the cap
  const path = spatulaPath(geo);
  // Hole as an opposite-wound circle, removed via even-odd fill.
  const hr = 9;
  const hole = `M ${cx} ${holeY - hr} a ${hr} ${hr} 0 1 0 0 ${2 * hr} a ${hr} ${hr} 0 1 0 0 ${-2 * hr} Z`;

  // Marbled-silicone swirls down the handle + a curl wrapping the hang hole.
  // Subtle, blurred, clipped to the body so it reads as moulded texture, not lines.
  const swirls = [
    `M ${cx + 12} ${holeY - 16} C ${cx + 32} ${holeY + 10} ${cx + 8} ${holeY + 46} ${cx - 10} ${holeY + 34} C ${cx - 24} ${holeY + 24} ${cx - 14} ${holeY + 2} ${cx + 2} ${holeY}`,
    `M ${cx - 4} ${holeY + 70} C ${cx + 22} ${holeY + 180} ${cx - 22} ${holeY + 300} ${cx + 8} ${holeY + 430}`,
    `M ${cx + 10} ${holeY + 150} C ${cx - 20} ${holeY + 260} ${cx + 20} ${holeY + 400} ${cx - 6} ${holeY + 520}`,
  ];

  const s = styles;
  return (
    <div style={s.stage}>
      <div style={{ ...s.wrap, width: W, height: H }}>
        {/* silhouette */}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={s.svg}>
          <defs>
            <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2c2d30" />
              <stop offset="0.5" stopColor="#1d1e21" />
              <stop offset="1" stopColor="#121315" />
            </linearGradient>
            <radialGradient id="sheen" cx="0.36" cy="0.10" r="0.62">
              <stop offset="0" stopColor="rgba(255,255,255,0.09)" />
              <stop offset="1" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id="soft" x="-40%" y="-10%" width="180%" height="120%">
              <feDropShadow dx="0" dy="7" stdDeviation="16" floodColor="#000" floodOpacity="0.26" />
            </filter>
            <filter id="blur"><feGaussianBlur stdDeviation="9" /></filter>
            <filter id="blurHole"><feGaussianBlur stdDeviation="2.5" /></filter>
            <clipPath id="sil"><path d={path} /></clipPath>
          </defs>
          <path d={`${path} ${hole}`} fill="url(#body)" fillRule="evenodd" filter="url(#soft)" />
          {/* moulded marbled-silicone texture, clipped to the body — soft, low-contrast */}
          <g clipPath="url(#sil)">
            <g filter="url(#blur)">
              {swirls.slice(1).map((d, i) => (
                <path key={`d${i}`} d={d} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth={11} strokeLinecap="round" />
              ))}
              {swirls.slice(1).map((d, i) => (
                <path key={`l${i}`} d={d} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={6} strokeLinecap="round" transform="translate(9,2)" />
              ))}
            </g>
            {/* the hole curl stays crisper so it reads as a swirl, not a smudge */}
            <path d={swirls[0]} fill="none" stroke="rgba(0,0,0,0.30)" strokeWidth={5} strokeLinecap="round" filter="url(#blurHole)" />
          </g>
          {/* soft matte sheen + crisp inner edge */}
          <path d={`${path} ${hole}`} fill="url(#sheen)" fillRule="evenodd" />
          <path d={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
          <circle cx={cx} cy={holeY} r={hr} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
        </svg>

        {/* nav overlay */}
        <div style={{ ...s.overlay, paddingTop: holeY + 80 }}>
          <nav style={s.nav}>
            {NAV.map(({ id, label, Icon, isNew }) => {
              const on = active === id, hot = hover === id;
              return (
                <button key={id} style={s.item}
                  onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
                  onClick={() => setActive(id)}>
                  <span style={{
                    ...s.btn,
                    ...(isNew ? s.btnNew : {}),
                    ...(on ? s.btnActive : hot ? s.btnHover : {}),
                  }}>
                    <Icon size={isNew ? 20 : 20} />
                  </span>
                  <span style={{ ...s.label, ...(on || hot ? { color: '#fff' } : {}) }}>{label}</span>
                </button>
              );
            })}
          </nav>

          <div style={{ flex: 1 }} />

          {/* blade controls */}
          <div style={s.blade}>
            <div style={s.divider} />
            <button style={{ ...s.btn, ...(hover === 'gear' ? s.btnHover : {}) }}
              onMouseEnter={() => setHover('gear')} onMouseLeave={() => setHover(null)}>
              <GearIcon size={18} />
            </button>
            <button style={{ ...s.profile, background: primaryColor }}>{initials}</button>
          </div>
        </div>
      </div>

      {/* ── Tweak panel ── */}
      <div style={s.panel}>
        <div style={s.panelTitle}>Blade</div>
        <Slider label="Width"   value={bladeHalf} set={setBladeHalf} min={40} max={75} />
        <Slider label="Bottom Y" value={bladeBotY} set={setBladeBotY} min={900} max={990} />

        <div style={s.panelTitle}>Left corner</div>
        <Slider label="Start height (up edge)" value={lCornerH} set={setLCornerH} min={2} max={110} />
        <Slider label="Reach (along bottom)"   value={lCornerW} set={setLCornerW} min={2} max={110} />

        <div style={s.panelTitle}>Right corner</div>
        <Slider label="Start height (up edge)" value={rCornerH} set={setRCornerH} min={2} max={130} />
        <Slider label="Reach (along bottom)"   value={rCornerW} set={setRCornerW} min={2} max={130} />

        <div style={s.panelCode}>
          {`bladeHalf:${bladeHalf} bladeBotY:${bladeBotY}\nlCornerH:${lCornerH} lCornerW:${lCornerW}\nrCornerH:${rCornerH} rCornerW:${rCornerW}`}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, set, min, max }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#444' }}>
        <span>{label}</span><b style={{ color: '#111' }}>{value}</b>
      </span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => set(+e.target.value)} style={{ width: 200, accentColor: '#7d7f4a' }} />
    </label>
  );
}

const styles = {
  stage: {
    height: '100%', display: 'flex', alignItems: 'stretch',
    background: 'linear-gradient(115deg,#ffffff 0%,#ffffff 46%,#f1efe9 46%,#f4f2ec 100%)',
    padding: '24px 0 24px 18px',
  },
  wrap: { position: 'relative', flexShrink: 0 },
  svg: { position: 'absolute', inset: 0, display: 'block' },
  panel: {
    alignSelf: 'flex-start', margin: '24px 0 0 48px', padding: '16px 18px',
    background: '#fff', border: '1px solid #e2e2e2', borderRadius: 12,
    boxShadow: '0 6px 24px rgba(0,0,0,0.08)', width: 244,
    fontFamily: "'Quicksand',sans-serif",
  },
  panelTitle: {
    fontSize: 12, fontWeight: 700, color: '#111', textTransform: 'uppercase',
    letterSpacing: 0.6, margin: '10px 0 8px',
  },
  panelCode: {
    marginTop: 14, padding: '8px 10px', background: '#f5f5f4', borderRadius: 8,
    fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10.5, color: '#333',
    whiteSpace: 'pre-line', lineHeight: 1.5,
  },
  overlay: {
    position: 'relative', zIndex: 1, height: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    paddingBottom: 30,
  },
  nav: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 },
  item: {
    background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    width: 64, WebkitTapHighlightColor: 'transparent', fontFamily: "'Quicksand',sans-serif",
  },
  btn: {
    width: 40, height: 40, borderRadius: 12, border: 'none', background: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.5)', transition: 'background .15s, color .15s, border-color .15s',
  },
  btnNew: { borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.5)', color: '#fff' },
  btnHover: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' },
  btnActive: { background: 'rgba(255,255,255,0.16)', color: '#fff' },
  label: {
    fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.5)', transition: 'color .15s',
  },
  blade: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  divider: { height: 1, width: 34, background: 'rgba(255,255,255,0.12)', marginBottom: 4 },
  profile: {
    width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff',
    fontSize: 13, fontWeight: 700, letterSpacing: 0.5, fontFamily: "'Quicksand',sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><SpatulaMenu /></React.StrictMode>
);
