import React, { useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MOBILE NAV — three options, side by side, at real phone widths. Open /mobile-nav.html
 *
 * Self-contained. Does NOT import CakeDesigner.jsx — but the BASELINE is a faithful copy of what
 * ships today (the MOBILE_BAR constants, the `left: 48 / right: 12` row, the `flex 1 1 0` button
 * with a 40px cap), because a comparison against a flattering reconstruction is worth nothing.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
 * The spatula bottom bar charges rent on the scarcest axis. Its icon row is pinned `left: 48` (to
 * clear the cap and hang-hole) and `right: 12` (to stop at the blade tip), so the row is always the
 * SCREEN's width minus 60 — the tax does not shrink when the phone does. On a 320px phone that
 * leaves 260px for eight targets: about 32px each, against a 44px floor, in a row only 40 tall.
 *
 * That is not a projection. CakeDesigner.jsx already carries a comment explaining that `sidebarBtn`'s
 * fixed 40px had to be overridden because eight of them need 320px and the row has 260 — written
 * when Share was found sitting off the end of the bar, invisible.
 *
 * Vertically it costs MOBILE_BAR_H (72) + lift (4) = 76px, `flexShrink: 0`, so the 3D canvas is what
 * pays for the paddle's bulge.
 *
 * ── THE TWO OPTIONS ─────────────────────────────────────────────────────────────────────────────
 *   A · STRIP + MORE      four primary destinations and a More sheet. Fixes the problem instead of
 *                         styling it: nothing hides behind a gesture, targets clear 44px with room,
 *                         and there is finally space for LABELS — which an icon-only bottom nav has
 *                         always needed and never had room for here.
 *
 *   B · STRIP + SCROLL    every destination, in one scrolling row. Keeps the flat list, at the cost
 *                         of putting items off-screen. The scroll affordance is a PEEK (the next
 *                         item is deliberately half-cut) plus a gradient fade — the clipped item IS
 *                         the affordance, and it is the one people reliably act on.
 *
 * The proposed right-edge arrow is behind a toggle rather than left out — it is a real idea and
 * worth seeing. What the toggle shows is that it takes a slot the size of a destination to do what
 * the swipe already does, and that it covers the peek that was doing the work.
 *
 * ── THE ITEM COUNT IS NOT FIXED, WHICH IS THE REAL ARGUMENT ─────────────────────────────────────
 * `railItems` is capability-filtered and flag-gated: Invite and Design Together appear behind
 * INVITE_UI_ENABLED and CODESIGN_UI_ENABLED. Toggle them here. A scrolling bar absorbs new items
 * quietly and each lands further out of sight; a More sheet absorbs them where they stay findable.
 * Watch the measured target width as you toggle — that number is the whole decision.
 * ───────────────────────────────────────────────────────────────────────────────────────────────*/

// ── Icons — copied from CakeDesigner so the comparison is honest ────────────────────────────────
const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const PlusIcon      = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const DashboardIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
const TemplatesIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M4 9h16l-2-3H6L4 9Z" /><path d="M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><circle cx="12" cy="5" r="1.2" /></svg>);
const ElementsIcon  = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" opacity="0.5" /></svg>);
const UploadsIcon   = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M21 15.5l-4.5-4.5L7 20.5" /></svg>);
const OrdersIcon    = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="9" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="12" y2="15" /></svg>);
const CustomersIcon = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2" /><path d="M19 8v6M22 11h-6" /></svg>);
const InviteIcon    = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>);
const ShareIcon     = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>);
const CoDesignIcon  = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...ic}><circle cx="8" cy="8" r="3.2" /><circle cx="16.5" cy="10" r="2.6" /><path d="M2.5 20v-1.6a5.5 5.5 0 0 1 11 0V20" /><path d="M15 20v-1.2a4.4 4.4 0 0 1 6.5-3.8" /></svg>);
const ChevronIcon   = ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>);

/* The spatula, kept. It is the only charm in the chrome, and mobile is where most bakers meet the
   product — so it moves rather than dies. As More's icon it still reads as "the Spattoo drawer",
   and it stops paying rent on the most contested 60px in the app. */
const SpatulaMark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9.4 2.4h5.2c.75 0 1.3.58 1.3 1.3v6.1c0 1.45-.62 2.3-1.5 3.0l-.55.44v7.2a1.85 1.85 0 0 1-3.7 0v-7.2l-.55-.44c-.88-.7-1.5-1.55-1.5-3.0V3.7c0-.72.55-1.3 1.3-1.3Z" />
  </svg>
);

// ── The real rail, in the real order ────────────────────────────────────────────────────────────
// `new` is in the list because the desktop rail draws it first; every bar below renders it as a
// circled +, which is a different SHAPE rather than a different item — same as the shipped code.
const ALL_ITEMS = [
  { id: 'new',       label: 'New',         Icon: PlusIcon,      isNew: true },
  { id: 'dashboard', label: 'Dashboard',   Icon: DashboardIcon },
  { id: 'templates', label: 'Templates',   Icon: TemplatesIcon },
  { id: 'elements',  label: 'Decorations', Icon: ElementsIcon },
  { id: 'uploads',   label: 'Uploads',     Icon: UploadsIcon },
  { id: 'orders',    label: 'Orders',      Icon: OrdersIcon },
  { id: 'customers', label: 'Customers',   Icon: CustomersIcon },
  { id: 'invite',    label: 'Invite',      Icon: InviteIcon,    flag: 'invite' },
  { id: 'share',     label: 'Share',       Icon: ShareIcon },
  { id: 'codesign',  label: 'Together',    Icon: CoDesignIcon,  flag: 'codesign' },
];

/* Option A's four. Chosen as what a baker on a PHONE is doing: making a cake, and answering an
   enquiry. Dashboard, Customers, Uploads, Share and the flagged pair are errands — real, but not
   what you open the app on a phone to do, and each is one tap away rather than zero. */
const PRIMARY = ['new', 'templates', 'elements', 'orders'];

const MIN_TARGET = 44;                  // Apple HIG; Material says 48dp. 44 is the charitable floor.
const STRIP_H    = 56;                  // icon (20) + label (12) + padding — and 20px back to the canvas
const BASE = { handleHalf: 19, bladeHalf: 34, bladeLen: 135, shoulderSpan: 36, topCornerR: 4, botCornerR: 54, holeOff: 4, lift: 4 };
const BASE_H = BASE.bladeHalf * 2 + 4;  // MOBILE_BAR_H

const visibleItems = (flags) => ALL_ITEMS.filter(i => !i.flag || flags[i.flag]);

// ── Measuring, not eyeballing ───────────────────────────────────────────────────────────────────
// Every tappable thing carries data-t. An item overflowing a row with no visible boundary looks
// exactly like an item that was never added — which is how Share went missing — so the numbers are
// read off getBoundingClientRect and printed, per option, on every change.
function useTargets(ref, deps) {
  const [m, setM] = useState({ n: 0, minW: 0, minH: 0, clipped: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const box = el.getBoundingClientRect();
      const t = [...el.querySelectorAll('[data-t]')];
      if (!t.length) { setM({ n: 0, minW: 0, minH: 0, clipped: 0 }); return; }
      const r = t.map(x => x.getBoundingClientRect());
      setM({
        n: t.length,
        minW: Math.round(Math.min(...r.map(x => x.width))),
        minH: Math.round(Math.min(...r.map(x => x.height))),
        // Anything whose CENTRE falls outside the bar cannot be tapped where it sits.
        clipped: r.filter(x => x.left + x.width / 2 > box.right + 0.5
                            || x.right - x.width / 2 < box.left - 0.5).length,
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return m;
}

// ── Horizontal spatula silhouette — transposed from the vertical rail ───────────────────────────
function spatulaBarPath({ H, capLeftX, handleHalf, bladeHalf, shoulderX, bladeFullX, bladeRightX, topCornerR, botCornerR }) {
  const cy = H / 2, capR = handleHalf, capCX = capLeftX + capR;
  const Tt = cy - handleHalf, Tb = cy + handleHalf;
  const Bt = cy - bladeHalf,  Bb = cy + bladeHalf;
  const sh = bladeFullX - shoulderX;
  const crt = Math.min(topCornerR, bladeHalf), crb = Math.min(botCornerR, bladeHalf);
  return [
    `M ${capCX} ${Tt}`, `L ${shoulderX} ${Tt}`,
    `C ${shoulderX + sh * 0.5} ${Tt} ${bladeFullX - sh * 0.5} ${Bt} ${bladeFullX} ${Bt}`,
    `L ${bladeRightX - crt} ${Bt}`, `Q ${bladeRightX} ${Bt} ${bladeRightX} ${Bt + crt}`,
    `L ${bladeRightX} ${Bb - crb}`, `Q ${bladeRightX} ${Bb} ${bladeRightX - crb} ${Bb}`,
    `L ${bladeFullX} ${Bb}`,
    `C ${bladeFullX - sh * 0.5} ${Bb} ${shoulderX + sh * 0.5} ${Tb} ${shoulderX} ${Tb}`,
    `L ${capCX} ${Tb}`, `A ${capR} ${capR} 0 0 1 ${capCX} ${Tt}`, 'Z',
  ].join(' ');
}

function SpatulaSvg({ W }) {
  const { handleHalf, bladeHalf, bladeLen, shoulderSpan, topCornerR, botCornerR, holeOff } = BASE;
  const H = BASE_H, cy = H / 2, capLeftX = 6, bladeRightX = W - 6;
  const shoulderX = bladeRightX - bladeLen, bladeFullX = shoulderX + shoulderSpan;
  const holeX = capLeftX + handleHalf + holeOff, hr = 7;
  const path = spatulaBarPath({ H, capLeftX, handleHalf, bladeHalf, shoulderX, bladeFullX, bladeRightX, topCornerR, botCornerR });
  const hole = `M ${holeX} ${cy - hr} a ${hr} ${hr} 0 1 0 0 ${2 * hr} a ${hr} ${hr} 0 1 0 0 ${-2 * hr} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
      <defs>
        <linearGradient id="mn-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#121214" /><stop offset="0.5" stopColor="#08080a" /><stop offset="1" stopColor="#020203" />
        </linearGradient>
        <filter id="mn-soft" x="-10%" y="-60%" width="120%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="11" floodColor="#000" floodOpacity="0.24" />
        </filter>
        <filter id="mn-spec" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feSpecularLighting in="b" surfaceScale="2.5" specularConstant="0.62" specularExponent="22" lightingColor="#d7dbe2" result="s">
            <feDistantLight azimuth="235" elevation="30" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <path d={`${path} ${hole}`} fill="url(#mn-body)" fillRule="evenodd" filter="url(#mn-soft)" />
      <path d={path} fill="#000" filter="url(#mn-spec)" />
      <circle cx={holeX} cy={cy} r={hr} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
    </svg>
  );
}

// ── One card: heading, phone, and the readout underneath ────────────────────────────────────────
// The metrics sit OUTSIDE the phone frame — inside it they would be clipped by the bezel's
// overflow, and they are commentary on the phone rather than part of the screen.
function Card({ title, blurb, width, m, barH, note, children }) {
  const bad = (m.minW && m.minW < MIN_TARGET) || (m.minH && m.minH < MIN_TARGET);
  // The card tracks the phone's width. Fixed at 300 it was NARROWER than a 375px phone, so each
  // frame overflowed its own card and sat on top of the next one — and the sheet, correctly clipped
  // by its own phone, appeared to spill into the neighbour.
  return (
    <div style={{ ...st.card, width }}>
      <div style={st.cardHead}>
        <div style={st.cardTitle}>{title}</div>
        <div style={st.cardBlurb}>{blurb}</div>
      </div>
      <div style={{ ...st.phone, width }}>
        <div style={st.canvas}>
          <div style={st.cake} />
          <div style={st.caption}>FRONT · drag to rotate</div>
        </div>
        {children}
      </div>
      <div style={st.metrics}>
        <Row k="Bar height" v={`${barH}px`} />
        <Row k="Targets" v={`${m.n}${note ? ` · ${note}` : ''}`} />
        <Row k="Smallest target" v={`${m.minW}×${m.minH}`} warn={bad} />
        {m.clipped > 0 && <Row k="Off the bar" v={String(m.clipped)} warn />}
        <div style={{ ...st.verdict, color: bad ? '#b3261e' : '#2C4433' }}>
          {bad ? `under the ${MIN_TARGET}px floor` : `clears ${MIN_TARGET}px`}
        </div>
      </div>
    </div>
  );
}
const Row = ({ k, v, warn }) => (
  <div style={st.row}><span>{k}</span><b style={{ color: warn ? '#b3261e' : '#111' }}>{v}</b></div>
);

/* ═══ BASELINE — what ships today ═══════════════════════════════════════════════════════════════
   Reproduced exactly: the band is BASE_H tall with `lift` under it, and the icon row is inset
   `left: 48 / right: 12` to clear the cap and stop at the blade tip. Buttons are `flex: 1 1 0` with
   a 40px cap — the override that had to be written when eight fixed-40s would not fit. */
function Baseline({ width, flags, active, onPick }) {
  const ref = useRef(null);
  const items = visibleItems(flags);
  const m = useTargets(ref, [width, flags.invite, flags.codesign]);
  return (
    <Card title="Now · spatula" width={width} m={m} barH={BASE_H + BASE.lift}
          blurb="Row pinned left 48 / right 12 — the screen minus 60, whatever the phone.">
      <div style={{ position: 'relative', height: BASE_H, marginBottom: BASE.lift, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <SpatulaSvg W={width} />
        </div>
        <div ref={ref} style={{
          position: 'absolute', zIndex: 1, top: '50%', transform: 'translateY(-50%)',
          left: 48, right: 12, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        }}>
          {items.map(({ id, Icon, isNew }) => (
            <button key={id} data-t onClick={() => onPick(id)} style={{
              ...st.iconBtn, flex: '1 1 0', minWidth: 0, maxWidth: 40, height: 40,
              ...(isNew ? { borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.45)', color: '#fff' } : {}),
              ...(active === id ? st.on : {}),
            }}><Icon size={20} /></button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ═══ OPTION A — strip + More ═══════════════════════════════════════════════════════════════════
   Five slots, full width, no shape tax. The reclaimed room buys LABELS, which is the quiet win: an
   icon-only bottom nav asks every baker to learn eight glyphs, and there was never space to stop
   asking. Everything else is one tap away in a sheet, where it is listed BY NAME. */
function OptionA({ width, flags, active, onPick }) {
  const ref = useRef(null);
  const [sheet, setSheet] = useState(false);
  const items = visibleItems(flags);
  const primary = PRIMARY.map(id => items.find(i => i.id === id)).filter(Boolean);
  const rest = items.filter(i => !PRIMARY.includes(i.id));
  const m = useTargets(ref, [width, flags.invite, flags.codesign]);
  const restActive = rest.some(i => i.id === active);

  return (
    <Card title="A · strip + More" width={width} m={m} barH={STRIP_H} note={`+${rest.length} in sheet`}
          blurb="Four primary; the rest one tap away, by name. Room for labels.">
      {sheet && <div style={st.scrim} onClick={() => setSheet(false)} />}
      {sheet && (
        <div style={st.sheet}>
          <div style={st.sheetGrip} />
          <div style={st.sheetGrid}>
            {rest.map(({ id, Icon, label }) => (
              <button key={id} onClick={() => { onPick(id); setSheet(false); }}
                      style={{ ...st.sheetItem, ...(active === id ? { background: 'rgba(255,255,255,0.14)', color: '#fff' } : {}) }}>
                <Icon size={22} /><span style={st.sheetLabel}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={ref} style={st.strip}>
        {primary.map(({ id, Icon, label, isNew }) => (
          <button key={id} data-t onClick={() => onPick(id)}
                  style={{ ...st.slot, ...(active === id ? st.slotOn : {}) }}>
            <span style={isNew ? st.plusRing : undefined}><Icon size={20} /></span>
            <span style={st.label}>{label}</span>
          </button>
        ))}
        <button data-t onClick={() => setSheet(v => !v)}
                style={{ ...st.slot, ...(sheet || restActive ? st.slotOn : {}) }}>
          <SpatulaMark size={20} />
          <span style={st.label}>More</span>
        </button>
      </div>
    </Card>
  );
}

/* ═══ OPTION B — strip + peek scroll ════════════════════════════════════════════════════════════
   Every destination kept, in one scrolling row. Items are a fixed width so the row OVERFLOWS
   deliberately and the next one is cut in half at the right edge — the clipped item is the
   affordance. A gradient fade sits over it so the cut reads as "more", not as a rendering bug.

   "Off the bar" in the readout is not a bug here — it is the cost being stated out loud. In the
   baseline the same number meant an item nobody could reach; here it means an item behind a swipe.
   Both are items a baker cannot see. */
function OptionB({ width, flags, active, onPick, arrow }) {
  const ref = useRef(null);
  const scroller = useRef(null);
  const items = visibleItems(flags);
  const m = useTargets(ref, [width, flags.invite, flags.codesign, arrow]);
  const [atEnd, setAtEnd] = useState(false);

  const onScroll = (e) => {
    const el = e.currentTarget;
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };
  const nudge = () => scroller.current?.scrollBy({ left: 132, behavior: 'smooth' });

  return (
    <Card title="B · strip + scroll" width={width} m={m} barH={STRIP_H} note={`${items.length} items`}
          blurb="Everything kept. The half-cut item at the right edge is the affordance.">
      <div ref={ref} style={{ ...st.strip, padding: 0, position: 'relative' }}>
        <div ref={scroller} onScroll={onScroll} style={st.scroller} className="no-sb">
          {items.map(({ id, Icon, label, isNew }) => (
            <button key={id} data-t onClick={() => onPick(id)}
                    style={{ ...st.slot, ...st.scrollSlot, ...(active === id ? st.slotOn : {}) }}>
              <span style={isNew ? st.plusRing : undefined}><Icon size={20} /></span>
              <span style={st.label}>{label}</span>
            </button>
          ))}
        </div>
        {/* pointer-events: none, so the fade never eats a tap on the item beneath it. */}
        {!atEnd && <div style={{ ...st.fade, right: arrow ? 38 : 0 }} />}
        {arrow && (
          <button onClick={nudge} style={{ ...st.arrow, opacity: atEnd ? 0.3 : 1 }} aria-label="More destinations">
            <ChevronIcon />
          </button>
        )}
      </div>
    </Card>
  );
}

function Harness() {
  const [width, setWidth] = useState(375);
  const [flags, setFlags] = useState({ invite: false, codesign: false });
  const [arrow, setArrow] = useState(false);
  const [active, setActive] = useState('elements');
  const n = visibleItems(flags).length;

  return (
    <div style={st.page}>
      <div style={st.bar}>
        <b style={{ fontSize: 13, color: '#2A241F' }}>Mobile nav</b>
        <span style={st.sep} />
        <span style={st.ctlLabel}>Phone</span>
        {[[320, 'SE'], [375, '13 mini'], [393, '15 Pro']].map(([w, name]) => (
          <button key={w} onClick={() => setWidth(w)} style={{ ...st.chip, ...(width === w ? st.chipOn : {}) }}>
            {name} · {w}
          </button>
        ))}
        <span style={st.sep} />
        <span style={st.ctlLabel}>Rail items ({n})</span>
        {[['invite', 'Invite'], ['codesign', 'Design Together']].map(([k, label]) => (
          <button key={k} onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))}
                  style={{ ...st.chip, ...(flags[k] ? st.chipOn : {}) }}>{label}</button>
        ))}
        <span style={st.sep} />
        <button onClick={() => setArrow(v => !v)} style={{ ...st.chip, ...(arrow ? st.chipOn : {}) }}>
          B: scroll arrow
        </button>
      </div>

      <div style={st.stage}>
        <Baseline width={width} flags={flags} active={active} onPick={setActive} />
        <OptionA  width={width} flags={flags} active={active} onPick={setActive} />
        <OptionB  width={width} flags={flags} active={active} onPick={setActive} arrow={arrow} />
      </div>
    </div>
  );
}

const st = {
  page: { minHeight: '100%', background: '#edeae3', padding: '0 0 44px', fontFamily: "'Quicksand',sans-serif" },
  bar: {
    position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '10px 18px', background: '#fff', borderBottom: '1px solid #e0dbd2', marginBottom: 26,
  },
  sep: { width: 1, height: 18, background: '#e0dbd2', margin: '0 6px' },
  ctlLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8d8378' },
  chip: {
    border: '1.5px solid #ddd6cb', background: '#fff', color: '#5f574e', borderRadius: 999,
    padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Quicksand',sans-serif", lineHeight: 1.4,
  },
  chipOn: { background: '#3a4f46', borderColor: '#3a4f46', color: '#fff' },

  stage: { display: 'flex', gap: 34, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap', padding: '0 18px' },
  card: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 },
  cardHead: { textAlign: 'center' },
  cardTitle: { fontSize: 13.5, fontWeight: 800, color: '#2A241F' },
  cardBlurb: { fontSize: 11.5, color: '#7A6C60', lineHeight: 1.5, marginTop: 3, minHeight: 34 },

  phone: {
    height: 600, background: '#f4f2ee', borderRadius: 30, position: 'relative', overflow: 'hidden',
    border: '7px solid #111', boxShadow: '0 18px 46px rgba(0,0,0,0.22)', flexShrink: 0,
    display: 'flex', flexDirection: 'column',
  },
  canvas: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 0 },
  cake: { width: 140, height: 112, borderRadius: '50% / 16%', background: 'linear-gradient(#f6dfe6,#efc9d6)', boxShadow: '0 14px 30px rgba(0,0,0,0.12)' },
  caption: { fontSize: 10.5, letterSpacing: 1, color: '#b9b3ab', fontWeight: 700 },

  iconBtn: {
    border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', flexShrink: 0,
  },
  on: { background: 'rgba(255,255,255,0.16)', color: '#fff' },

  // The strip. Flat, full-bleed, same chrome family as the spatula so it does not read as a
  // different product — the shape goes, the material stays.
  strip: {
    flexShrink: 0, height: STRIP_H, background: '#0b0b0d', display: 'flex', alignItems: 'stretch',
    padding: '0 2px', borderTop: '1px solid rgba(255,255,255,0.07)',
  },
  slot: {
    flex: '1 1 0', minWidth: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    color: 'rgba(255,255,255,0.5)', fontFamily: "'Quicksand',sans-serif",
  },
  slotOn: { color: '#fff' },
  label: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  plusRing: {
    width: 24, height: 24, borderRadius: '50%', border: '1.6px solid currentColor',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  // 66px is chosen so the row overflows at EVERY width in the switcher — the peek has to be
  // guaranteed, not a coincidence of the current item count.
  scroller: { display: 'flex', alignItems: 'stretch', overflowX: 'auto', width: '100%', scrollSnapType: 'x proximity' },
  scrollSlot: { flex: '0 0 66px', width: 66, scrollSnapAlign: 'start' },
  fade: {
    position: 'absolute', top: 0, bottom: 0, width: 34, pointerEvents: 'none',
    background: 'linear-gradient(to right, rgba(11,11,13,0), #0b0b0d)',
  },
  arrow: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 38, border: 'none',
    background: '#0b0b0d', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
  },

  // Stops ABOVE the strip rather than at inset 0. A scrim that dims the nav bar makes the bar look
  // disabled at the exact moment its most useful job is letting you leave — tapping a different
  // destination should switch, not just dismiss.
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: STRIP_H, background: 'rgba(0,0,0,0.42)', zIndex: 4 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: STRIP_H, zIndex: 5,
    background: '#141416', borderRadius: '18px 18px 0 0', padding: '8px 10px 16px',
    boxShadow: '0 -8px 28px rgba(0,0,0,0.35)',
  },
  sheetGrip: { width: 34, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)', margin: '2px auto 12px' },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  sheetItem: {
    border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, padding: '12px 4px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    color: 'rgba(255,255,255,0.72)', fontFamily: "'Quicksand',sans-serif", minHeight: 68,
  },
  sheetLabel: { fontSize: 10.5, fontWeight: 700 },

  metrics: { width: '100%', padding: '10px 12px', background: '#fff', border: '1px solid #e0dbd2', borderRadius: 10 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#7A6C60', padding: '2px 0' },
  verdict: { marginTop: 6, paddingTop: 6, borderTop: '1px solid #f0ece5', fontSize: 11.5, fontWeight: 800, textAlign: 'center' },
};

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Harness /></React.StrictMode>);
