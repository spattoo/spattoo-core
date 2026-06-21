import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

/*
 * MOBILE prototype: the spatula laid horizontally as the bottom nav bar, with
 * the bulged paddle on the RIGHT. Cap + hang-hole on the left, nav icons along
 * the handle, ST avatar in the blade. Open /spatula-mobile.html.
 * Self-contained — does NOT touch CakeDesigner.jsx.
 */

const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const PlusIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const DashboardIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
const TemplatesIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M4 9h16l-2-3H6L4 9Z" /><path d="M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><circle cx="12" cy="5" r="1.2" /></svg>);
const ElementsIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" opacity="0.5" /></svg>);
const OrdersIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="9" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="12" y2="15" /></svg>);
const CustomersIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2" /><path d="M19 8v6M22 11h-6" /></svg>);
const InviteIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>);

const NAV = [
  { id: 'new',       label: 'New Cake',    Icon: PlusIcon, isNew: true },
  { id: 'dashboard', label: 'Dashboard',   Icon: DashboardIcon },
  { id: 'templates', label: 'Templates',   Icon: TemplatesIcon },
  { id: 'elements',  label: 'Decorations', Icon: ElementsIcon },
  { id: 'orders',    label: 'Orders',      Icon: OrdersIcon },
  { id: 'customers', label: 'Customers',   Icon: CustomersIcon },
  { id: 'invite',    label: 'Invite',      Icon: InviteIcon },
];

// ── Horizontal spatula: cap+hole on the LEFT, handle, paddle on the RIGHT ──
// Transpose of the vertical silhouette. Symmetric top/bottom; the blade is a
// rounded paddle. handleHalf/bladeHalf are half-THICKNESSES (vertical).
function spatulaBarPath({ W, H, capLeftX, handleHalf, bladeHalf, shoulderX, bladeFullX, bladeRightX, topCornerR, botCornerR }) {
  const cy = H / 2;
  const capR = handleHalf;
  const capCX = capLeftX + capR;
  const Tt = cy - handleHalf, Tb = cy + handleHalf;   // handle top / bottom
  const Bt = cy - bladeHalf,  Bb = cy + bladeHalf;     // blade top / bottom
  const sh = bladeFullX - shoulderX;                   // shoulder span (horizontal)
  const crt = Math.min(topCornerR, bladeHalf);         // top-right paddle corner
  const crb = Math.min(botCornerR, bladeHalf);         // bottom-right paddle corner
  return [
    `M ${capCX} ${Tt}`,
    `L ${shoulderX} ${Tt}`,                                                  // handle top
    `C ${shoulderX + sh * 0.5} ${Tt} ${bladeFullX - sh * 0.5} ${Bt} ${bladeFullX} ${Bt}`, // shoulder up
    `L ${bladeRightX - crt} ${Bt}`,                                          // blade top edge
    `Q ${bladeRightX} ${Bt} ${bladeRightX} ${Bt + crt}`,                     // top-right corner
    `L ${bladeRightX} ${Bb - crb}`,                                          // right edge
    `Q ${bladeRightX} ${Bb} ${bladeRightX - crb} ${Bb}`,                     // bottom-right corner
    `L ${bladeFullX} ${Bb}`,                                                 // blade bottom edge
    `C ${bladeFullX - sh * 0.5} ${Bb} ${shoulderX + sh * 0.5} ${Tb} ${shoulderX} ${Tb}`, // shoulder down
    `L ${capCX} ${Tb}`,                                                      // handle bottom
    `A ${capR} ${capR} 0 0 1 ${capCX} ${Tt}`,                                // left cap
    'Z',
  ].join(' ');
}

function MobilePreview({ primaryColor = '#7d7f4a', initials = 'ST' }) {
  const [active, setActive] = useState('elements');
  const [handleHalf,   setHandleHalf]   = useState(19);
  const [bladeHalf,    setBladeHalf]    = useState(34);
  const [bladeLen,     setBladeLen]     = useState(135);
  const [shoulderSpan, setShoulderSpan] = useState(36);
  const [topCornerR,   setTopCornerR]   = useState(4);
  const [botCornerR,   setBotCornerR]   = useState(54);
  const [holeOff,      setHoleOff]      = useState(4);
  const [lift,         setLift]         = useState(4);

  const PHONE_W = 390;
  const W = PHONE_W - 24;            // bar width (12px margin each side)
  const H = bladeHalf * 2 + 22;      // svg height (room for paddle bulge + shadow)
  const cy = H / 2;
  const capLeftX = 6;
  const bladeRightX = W - 6;
  const shoulderX = bladeRightX - bladeLen;
  const bladeFullX = shoulderX + shoulderSpan;
  const holeX = capLeftX + handleHalf + holeOff, hr = 7;

  const path = spatulaBarPath({ W, H, capLeftX, handleHalf, bladeHalf, shoulderX, bladeFullX, bladeRightX, topCornerR, botCornerR });
  const hole = `M ${holeX} ${cy - hr} a ${hr} ${hr} 0 1 0 0 ${2 * hr} a ${hr} ${hr} 0 1 0 0 ${-2 * hr} Z`;

  // icons spread across the handle (after the hole, before the blade)
  const iconsLeft = holeX + 18;
  const iconsRight = shoulderX + 4;

  const s = styles;
  return (
    <div style={s.stage}>
      {/* phone */}
      <div style={{ ...s.phone, width: PHONE_W }}>
        {/* fake canvas + cake */}
        <div style={s.canvas}>
          <div style={s.cake} />
          <div style={s.caption}>FRONT · drag to rotate</div>
        </div>

        {/* spatula bottom bar */}
        <div style={{ ...s.barWrap, height: H, bottom: lift }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="mbody" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#121214" /><stop offset="0.55" stopColor="#08080a" /><stop offset="1" stopColor="#020203" />
              </linearGradient>
              <radialGradient id="msheen" cx="0.5" cy="0.1" r="0.7">
                <stop offset="0" stopColor="rgba(255,255,255,0.03)" /><stop offset="1" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <filter id="msoft" x="-20%" y="-60%" width="140%" height="220%">
                <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#000" floodOpacity="0.26" />
              </filter>
              <filter id="mspec" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
                <feSpecularLighting in="b" surfaceScale="2.5" specularConstant="0.62" specularExponent="22" lightingColor="#d7dbe2" result="s">
                  <feDistantLight azimuth="235" elevation="30" />
                </feSpecularLighting>
                <feComposite in="s" in2="SourceAlpha" operator="in" />
              </filter>
              <filter id="minner" x="-30%" y="-30%" width="160%" height="160%">
                <feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
                <feGaussianBlur stdDeviation="3.5" result="ab" />
                <feOffset in="ab" dx="0" dy="-0.5" result="o" />
                <feFlood floodColor="#000" floodOpacity="0.45" />
                <feComposite in2="o" operator="in" result="sh" />
                <feComposite in="sh" in2="SourceAlpha" operator="in" />
              </filter>
            </defs>
            <path d={`${path} ${hole}`} fill="url(#mbody)" fillRule="evenodd" filter="url(#msoft)" />
            <path d={`${path} ${hole}`} fill="#000" fillRule="evenodd" filter="url(#minner)" />
            <path d={path} fill="#000" filter="url(#mspec)" />
            <path d={`${path} ${hole}`} fill="url(#msheen)" fillRule="evenodd" />
            <circle cx={holeX} cy={cy} r={hr} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
          </svg>

          {/* icon row over the handle */}
          <div style={{ ...s.iconRow, left: iconsLeft, width: iconsRight - iconsLeft, top: cy - handleHalf, height: handleHalf * 2 }}>
            {NAV.map(({ id, Icon, isNew }) => {
              const on = active === id;
              return (
                <button key={id} style={s.iconBtn} onClick={() => setActive(id)}>
                  <span style={{ ...s.btn, ...(isNew ? s.btnNew : {}), ...(on ? s.btnActive : {}) }}><Icon size={19} /></span>
                </button>
              );
            })}
          </div>

          {/* ST avatar in the blade */}
          <button style={{ ...s.profile, background: primaryColor, left: (bladeFullX + bladeRightX) / 2 - 19, top: cy - 19 }}>{initials}</button>
        </div>
      </div>

      {/* controls */}
      <div style={s.panel}>
        <div style={s.panelTitle}>Handle &amp; blade</div>
        <Slider label="Handle thickness" value={handleHalf}   set={setHandleHalf}   min={16} max={44} />
        <Slider label="Blade thickness"  value={bladeHalf}    set={setBladeHalf}    min={30} max={80} />
        <Slider label="Blade length"     value={bladeLen}     set={setBladeLen}     min={60} max={220} />
        <Slider label="Shoulder flare"   value={shoulderSpan} set={setShoulderSpan} min={4}  max={90} />

        <div style={s.panelTitle}>Paddle corners</div>
        <Slider label="Top corner R"     value={topCornerR}   set={setTopCornerR}   min={2}  max={80} />
        <Slider label="Bottom corner R"  value={botCornerR}   set={setBotCornerR}   min={2}  max={80} />

        <div style={s.panelTitle}>Layout</div>
        <Slider label="Hang-hole offset" value={holeOff}      set={setHoleOff}      min={4}  max={60} />
        <Slider label="Float off bottom" value={lift}         set={setLift}         min={4}  max={90} />

        <div style={s.panelCode}>{`handleHalf:${handleHalf} bladeHalf:${bladeHalf}\nbladeLen:${bladeLen} shoulderSpan:${shoulderSpan}\ntopCornerR:${topCornerR} botCornerR:${botCornerR}\nholeOff:${holeOff} lift:${lift}`}</div>
      </div>
    </div>
  );
}

function Slider({ label, value, set, min, max }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#444' }}><span>{label}</span><b style={{ color: '#111' }}>{value}</b></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(+e.target.value)} style={{ width: 200, accentColor: '#7d7f4a' }} />
    </label>
  );
}

const styles = {
  stage: { minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, padding: 32 },
  phone: {
    height: 620, background: '#f4f2ee', borderRadius: 34, position: 'relative',
    overflow: 'hidden', border: '8px solid #111', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', flexShrink: 0,
  },
  canvas: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 },
  cake: { width: 150, height: 120, borderRadius: '50% / 16%', background: 'linear-gradient(#f6dfe6,#efc9d6)', boxShadow: '0 14px 30px rgba(0,0,0,0.12)' },
  caption: { fontSize: 11, letterSpacing: 1, color: '#b9b3ab', fontWeight: 700 },
  barWrap: { position: 'absolute', left: 12, right: 12, bottom: 30 },
  iconRow: { position: 'absolute', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' },
  btn: {
    width: 38, height: 38, borderRadius: 11, border: 'none', background: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)',
    transition: 'background .15s, color .15s',
  },
  btnNew: { borderRadius: '50%', border: '1.7px solid rgba(255,255,255,0.5)', color: '#fff' },
  btnActive: { background: 'rgba(255,255,255,0.15)', color: '#fff' },
  profile: {
    position: 'absolute', zIndex: 1, width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
    color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, fontFamily: "'Quicksand',sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: { alignSelf: 'flex-start', marginTop: 40, padding: '16px 18px', background: '#fff', border: '1px solid #e2e2e2', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.08)', width: 244 },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#111', textTransform: 'uppercase', letterSpacing: 0.6, margin: '2px 0 10px' },
  panelCode: { marginTop: 12, padding: '8px 10px', background: '#f5f5f4', borderRadius: 8, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10.5, color: '#333', whiteSpace: 'pre-line', lineHeight: 1.5 },
};

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><MobilePreview /></React.StrictMode>);
