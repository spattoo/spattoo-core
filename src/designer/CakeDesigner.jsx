import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import CakeCanvas, { CakeThumbnailCanvas, preloadTopper } from './canvas/CakeCanvas';
import { cfImg } from './utils/imageUtils';
import { CAMERA_POSITION, CAMERA_POSITION_MOBILE, PIPING_FRONT_ANGLE, TIER_RADII, BOTTOM_H, BEND_ANCHOR_FRAC } from './constants';
import PipingPreview from './canvas/PipingPreview.jsx';
import { SHELL_HEIGHT_FRAC, getShellExtents, getFestoonExtents, festoonSig } from './canvas/pipingMetrics.js';
import { useCakeDesign } from './hooks/useCakeDesign';
import { CREAM_FONTS, DEFAULT_CREAM_FONT, creamFontPreview } from './geometry/creamText.js';
import { NOZZLE_BY_KEY, HEAP_HEIGHT_PER_DIAMETER } from './geometry/creamPen.js';
import ColorGuide from '../chefsdesk/ColorGuide';
import OrderModal from '../orders/OrderModal';
import OrdersPanel from '../orders/OrdersPanel';
import CustomersPanel from '../customers/CustomersPanel';
import DashboardPanel from '../dashboard/DashboardPanel';
import SettingsPanel from '../settings/SettingsPanel';
import BillingPanel from '../settings/BillingPanel';


// Tier caps are hardcoded — tiers are not element_types rows, they're the cake structure itself
const TIER_CAPS   = { color: true, resize: false, style: false, fontSize: false, duplicate: false, delete: false };
const TOPPER_CAPS = { resize: true, delete: true };

function hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(155,95,114,${alpha})`;
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

// Single source of truth for mapping an element's placement_config to the piping
// fields a ring consumes. Rim (top) and board (bottom) are symmetric: top_* mirrors
// bottom_*. Returned keys match what TopPipingRing / BottomPipingRing expect.
// Which arrangements an element allows for a zone. Mirrors the allowed_zones array
// convention; absent ⇒ ['ring'] (matches legacy piping that only ever ringed).
function pipingAllowedArrangements(pc, isTop) {
  const allowed = isTop ? pc?.top_arrangements_allowed : pc?.bottom_arrangements_allowed;
  return Array.isArray(allowed) && allowed.length ? allowed : ['ring'];
}

// Default arrangement for a zone: the admin's `*_arrangement` if it's actually allowed,
// otherwise the first allowed mode (so a single-only element defaults to single).
function pipingDefaultArrangement(pc, isTop) {
  const allowed = pipingAllowedArrangements(pc, isTop);
  const pref = isTop ? pc?.top_arrangement : pc?.bottom_arrangement;
  return allowed.includes(pref) ? pref : allowed[0];
}

function pipingPlacementFromConfig(placementConfig, isTop) {
  const pc = placementConfig ?? {};
  const arrangement = pipingDefaultArrangement(pc, isTop);
  // Single mode seeds exactly one instance from the configured angle; ring carries
  // no instances array so it stays the cheap, procedural full-circle path.
  const seed = arrangement === 'single'
    ? { instances: [{ id: Date.now(), angle: (isTop ? pc.top_single_angle : pc.bottom_single_angle) ?? PIPING_FRONT_ANGLE }] }
    : {};
  // Alternating A/B pattern — version B's shape + transform + the repeating cycle string.
  const alt = isTop
    ? {
        altEnabled:      pc.top_alt_enabled        ?? false,
        altGlbUrl:       pc.top_alt_glb_url         ?? null,
        altFlip:         pc.top_alt_flip            ?? false,
        altRotation:     pc.top_alt_rotation        ?? null,
        altRadialOffset: pc.top_alt_radial_offset   ?? null,
        altYOffset:      pc.top_alt_y_offset        ?? null,
        pattern:         pc.top_pattern             || 'AB',
      }
    : {
        altEnabled:      pc.bottom_alt_enabled      ?? false,
        altGlbUrl:       pc.bottom_alt_glb_url       ?? null,
        altFlip:         pc.bottom_alt_flip          ?? false,
        altRotation:     pc.bottom_alt_rotation      ?? null,
        altRadialOffset: pc.bottom_alt_radial_offset ?? null,
        altYOffset:      pc.bottom_alt_y_offset      ?? null,
        pattern:         pc.bottom_pattern           || 'AB',
      };
  // U-shaped (bend/festoon) fields — present only on strip elements tuned with "Bend" on.
  const bend = isTop
    ? { bend: pc.top_bend ?? false, bendRing: pc.top_bend_ring ?? false, festoons: pc.top_festoons ?? null, bendDepth: pc.top_bend_depth ?? null, bendTilt: pc.top_bend_tilt ?? null }
    : { bend: pc.bottom_bend ?? false, bendRing: pc.bottom_bend_ring ?? false, festoons: pc.bottom_festoons ?? null, bendDepth: pc.bottom_bend_depth ?? null, bendTilt: pc.bottom_bend_tilt ?? null };
  // Wrap: a pre-formed ring GLB wrapped round the wall as one band (round or sheet). Flag-only.
  const wrap = {
    wrap:     (isTop ? pc.top_wrap      : pc.bottom_wrap)      ?? false,
    wrapTilt: (isTop ? pc.top_wrap_tilt : pc.bottom_wrap_tilt) ?? null,
    wrapSize: (isTop ? pc.top_wrap_size : pc.bottom_wrap_size) ?? null,
  };
  if (isTop) {
    return {
      flipTop:           pc.top_flip          ?? false,
      rotation:          pc.top_rotation       ?? null,
      extraRadialOffset: pc.top_radial_offset  ?? null,
      yOffset:           pc.top_y_offset        ?? null,
      spacing:           pc.top_spacing         ?? null,
      softness:          pc.top_softness        ?? null,
      swagCount:         pc.top_swag_count      ?? null,
      swagDepth:         pc.top_swag_depth      ?? null,
      swagTilt:          pc.top_swag_tilt       ?? null,
      arrangement,
      ...alt,
      ...bend,
      ...wrap,
      ...seed,
    };
  }
  return {
    flipBottom:        pc.bottom_flip          ?? true,
    bottomRotation:    pc.bottom_rotation      ?? null,
    extraRadialOffset: pc.bottom_radial_offset ?? null,
    yOffset:           pc.bottom_y_offset      ?? null,
    spacing:           pc.bottom_spacing       ?? null,
    softness:          pc.bottom_softness      ?? null,
    swagCount:         pc.bottom_swag_count    ?? null,
    swagDepth:         pc.bottom_swag_depth    ?? null,
    swagTilt:          pc.bottom_swag_tilt     ?? null,
    arrangement,
    ...alt,
    ...bend,
    ...wrap,
    ...seed,
  };
}

// True when a ring's current placement differs from the config-derived placement.
// Used by the load-time sync to avoid redundant setState (and re-render loops).
function pipingPlacementChanged(current, next, isTop) {
  const flipKey = isTop ? 'flipTop' : 'flipBottom';
  const rotKey  = isTop ? 'rotation' : 'bottomRotation';
  const flipDefault = !isTop;
  return (
    JSON.stringify(next[rotKey] ?? null) !== JSON.stringify(current[rotKey] ?? null) ||
    (next[flipKey] ?? flipDefault)       !== (current[flipKey] ?? flipDefault) ||
    (next.extraRadialOffset ?? null)     !== (current.extraRadialOffset ?? null) ||
    (next.yOffset ?? null)               !== (current.yOffset ?? null) ||
    (next.spacing ?? null)               !== (current.spacing ?? null) ||
    // Seed arrangement once when the current ring has none. `instances` is user-owned
    // and deliberately excluded so re-sync never wipes pieces the customer placed.
    (current.arrangement == null && (next.arrangement ?? 'ring') !== 'ring')
  );
}

const TIER_LABELS = ['Bottom Tier', '2nd Tier', '3rd Tier', 'Top Tier'];

// ── Size dial ─────────────────────────────────────────────────────────────────
// Compact radial size control: a 280° arc whose band tapers thin → thick (= small →
// large), so it reads like a piping nozzle widening. Drag or tap anywhere on the arc;
// the filled portion shows the current value and the centre shows the number. Replaces
// the full-width linear slider so Color + Size fit a short row and the popup stays tight.
function SizeDial({ size = 1, min = 0.5, max = 2, step = 0.05, onChange }) {
  const CX = 24, CY = 24, R_IN = 12, W_MIN = 2, W_MAX = 8;
  const A_START = -140 * Math.PI / 180;   // lower-left (thin end)
  const A_SWEEP =  280 * Math.PI / 180;   // sweeps up over the top to lower-right (gap at bottom)
  const t = Math.max(0, Math.min(1, (size - min) / (max - min)));

  const angOf = u => A_START + u * A_SWEEP;
  const pt    = (u, r) => [CX + r * Math.sin(angOf(u)), CY - r * Math.cos(angOf(u))];
  // Filled band from uA→uB: inner edge at R_IN, outer edge growing with u (the taper).
  const band = (uA, uB) => {
    const N = Math.max(2, Math.round(40 * Math.abs(uB - uA)));
    const seg = [];
    for (let i = 0; i <= N; i++) { const u = uA + (uB - uA) * i / N; const [x, y] = pt(u, R_IN); seg.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`); }
    for (let i = 0; i <= N; i++) { const u = uB - (uB - uA) * i / N; const [x, y] = pt(u, R_IN + W_MIN + (W_MAX - W_MIN) * u); seg.push(`L${x.toFixed(2)} ${y.toFixed(2)}`); }
    return seg.join(' ') + ' Z';
  };
  const knob = pt(t, R_IN + (W_MIN + (W_MAX - W_MIN) * t) / 2);

  const setFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width  * 48;
    const py = (e.clientY - rect.top)  / rect.height * 48;
    const a  = Math.atan2(px - CX, CY - py);          // angle from top, clockwise
    const u  = Math.max(0, Math.min(1, (a - A_START) / A_SWEEP));
    onChange?.(+(min + Math.round(u * (max - min) / step) * step).toFixed(2));
  };

  return (
    <div style={{ width: 46, height: 46, position: 'relative', flexShrink: 0, cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
      onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={e => e.currentTarget.releasePointerCapture(e.pointerId)}>
      <svg viewBox="0 0 48 48" width={46} height={46} style={{ display: 'block', pointerEvents: 'none' }}>
        <path d={band(0, 1)} fill="#e6e0e3" />
        {t > 0.001 && <path d={band(0, t)} fill="#9b5268" />}
        <circle cx={knob[0]} cy={knob[1]} r={4.5} fill="#fff" stroke="#9b5268" strokeWidth={2} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#9b5268', fontFamily: "'Quicksand',sans-serif", pointerEvents: 'none' }}>
        {size.toFixed(1)}
      </span>
    </div>
  );
}

// ── Color picker (react-colorful) ─────────────────────────────────────────────
function ColorWheel({ color, onChange, cakeColors = [], width = 216 }) {
  // Common cake piping colour presets
  const PRESETS = [
    '#ffffff','#f5e6c8','#f5b8c8','#e8a0b0','#c8b5e8',
    '#b5c8e8','#b5e8d5','#f0c040','#e87040','#5c3d2e',
    '#3e2010','#1a1a1a','#d4af37','#8b1a1a','#2e5c3e',
  ];
  const dot = Math.max(18, Math.round(width / 9.8));   // swatch size scales with panel width
  const swatch = (c, key) => (
    <div key={key} onClick={() => onChange(c)} style={{
      width: dot, height: dot, borderRadius: '50%', background: c, cursor: 'pointer',
      border: color.toLowerCase() === c.toLowerCase() ? '2.5px solid #9b5f72' : '1.5px solid #e0d0d5',
      boxSizing: 'border-box', flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    }} />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <HexColorPicker color={color} onChange={onChange} style={{ width, height: Math.round(width * 0.72) }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width, justifyContent: 'center' }}>
        {PRESETS.map(c => swatch(c, c))}
      </div>
      {cakeColors.length > 0 && (
        <div style={{ width }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            color: '#9b5f72', textTransform: 'uppercase', marginBottom: 7, textAlign: 'center',
          }}>Colors from cake</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {cakeColors.map((c, i) => swatch(c, `cake-${i}`))}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact labelled range row — used by the Cream Pen tool panel.
function PenSlider({ label, value, min, max, step, onChange, fmt = v => v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#555', minWidth: 64 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#9b5f72' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#9b5f72', minWidth: 34, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

// Cream-pen font swatch — renders the font's own single-stroke shapes (not a system face)
// so bakers pick by the real piped look. The centerline path is stroked with round caps.
function CreamFontButton({ fontKey, label, selected, onClick }) {
  const { d, width, height } = useMemo(() => creamFontPreview(fontKey, 'Abc'), [fontKey]);
  const sw = Math.max(width, height) * 0.05;   // bead ≈ 5% of glyph extent
  const active = selected ? '#9b5f72' : '#f0dce3';
  return (
    <button key={fontKey} onClick={onClick} title={label}
      style={{ padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${active}`, background: selected ? '#fbf3f6' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 64, height: 34 }}>
      <svg viewBox={`${-sw} ${-sw} ${width + sw * 2} ${height + sw * 2}`} height={22}
        style={{ display: 'block', maxWidth: 96 }} preserveAspectRatio="xMidYMid meet">
        <path d={d} fill="none" stroke={selected ? '#9b5f72' : '#777'}
          strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// "Colors from cake" reuse rows are split by material so a reused hue renders EXACTLY.
// Tiers use a plain matte material; pipings/elements use a sheened (glossy) one — the same
// hex reads differently across the two. So a tier picker only offers other tier colors, and
// an element picker only offers other element colors; cross-material colors are never shown.
function collectTierColors(design) {
  const out = [];
  design.tiers?.forEach(t => { if (t.color) out.push(t.color); });
  return out;
}
function collectElementColors(design) {
  const out = [];
  const push = c => { if (c) out.push(c); };
  design.tiers?.forEach(t => {
    t.topPipings?.forEach(p => push(p.color));
    t.bottomPipings?.forEach(p => push(p.color));
  });
  design.texts?.forEach(t => push(t.color));
  design.stickers?.forEach(s => { if (s.allowedActions?.color !== false) push(s.color); });
  return out;
}

// ── Zone label map ────────────────────────────────────────────────────────────
const ZONE_LABELS = {
  top_edge:     'Top',
  bottom_board: 'Base',
  top_surface:  'Top surface',
  side:         'Side',
  side_edge:    'Side edge',
};


// ── Filter ────────────────────────────────────────────────────────────────────
const CAT_LABEL = { occasion: 'Occasion', style: 'Style', color: 'Color', material: 'Material', theme: 'Theme', age_group: 'Age group', gender: 'Gender' };
const TMPL_CATS = ['occasion', 'style', 'color', 'age_group', 'gender'];

function FunnelIcon({ size = 15, active }) {
  const c = active ? '#9b5f72' : '#888';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 2.5L14.5 2.5L9.5 8.5L9.5 13.5L6.5 13.5L6.5 8.5Z" />
    </svg>
  );
}

function FilterPanel({ allTags, active, onChange, categories, children }) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(active).filter(Boolean).length;

  const byCategory = categories.reduce((acc, cat) => {
    const tags = allTags.filter(t => t.category === cat);
    if (tags.length) acc[cat] = tags;
    return acc;
  }, {});

  return (
    <div style={{ borderBottom: '1px solid #f0dce3', marginBottom: 6 }}>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 6px' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <FunnelIcon active={activeCount > 0 || open} />
          {activeCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, color: '#9b5f72', fontFamily: "'Quicksand', sans-serif" }}>{activeCount}</span>
          )}
        </button>
        {activeCount > 0 && (
          <button onClick={() => onChange({})} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#9b5f72', fontWeight: 700, fontFamily: "'Quicksand', sans-serif" }}>
            clear
          </button>
        )}
      </div>

      {/* Filter controls */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
          {Object.keys(byCategory).length > 0
            ? Object.entries(byCategory).map(([cat, tags]) => (
                <div key={cat}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: '#bbb', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
                    {CAT_LABEL[cat]}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.map(tag => {
                      const on = active[cat] === tag.slug;
                      return (
                        <button key={tag.slug}
                          onClick={() => onChange({ ...active, [cat]: on ? null : tag.slug })}
                          style={{ padding: '3px 8px', borderRadius: 20, border: `1.5px solid ${on ? '#9b5f72' : '#f0dce3'}`, background: on ? '#9b5f72' : '#fff', color: on ? '#fff' : '#666', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", lineHeight: 1.4 }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            : !children && <span style={{ fontSize: 10, color: '#c8b8a2', fontStyle: 'italic' }}>No tags configured yet</span>
          }
          {children}
        </div>
      )}
    </div>
  );
}

function matchesFilters(item, filters) {
  return Object.entries(filters).every(([, slug]) => {
    if (!slug) return true;
    return item.tag_slugs?.includes(slug);
  });
}

// TOPPERS + PIPING STYLES are loaded from Supabase cake_elements table

// ── Per-element-type card in the elements panel ───────────────────────────────
function ElementTypeCard({
  elementType, design, toppersDb = [], scatteredDecorElements = [], picksElements = [], imageTopperElements = [], otherElements = [],
  onSetTopper, onDragStartSticker, onDragStartTopper, cfAssetsBase,
}) {
  const { slug, name } = elementType;

  // ── topper — pick from DB-driven GLB toppers ──────────────────────────────
  if (slug === 'topper') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        {toppersDb.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No toppers yet</div>
        )}
        {toppersDb.map(t => {
          const isActive = design.topper?.id === t.id;
          return (
            <div key={t.id} style={{ width: '100%', borderTop: '1px solid #f0dce3', paddingTop: 8, paddingBottom: 2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                {/* Thumbnail */}
                <div style={{
                  width: 80, height: 80, borderRadius: 10,
                  background: '#fff',
                  border: `2px solid ${isActive ? '#9b5f72' : '#f0dce3'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'grab', touchAction: 'none',
                  boxShadow: isActive ? '0 0 0 2px rgba(155,95,114,0.2)' : 'none',
                }}
                  onClick={() => onSetTopper(isActive ? null : t)}
                  onPointerDown={e => { e.preventDefault(); onDragStartTopper?.(t, e.clientX, e.clientY); }}
                >
                  {t.thumbnail_url
                    ? <img src={cfImg(t.thumbnail_url, 80, 80, cfAssetsBase)} alt={t.name} width={80} height={80} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    : null
                  }
                </div>
                {/* Label + action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ ...s.tierCheckLabel, flex: 1, textAlign: 'center' }}>{t.name}</span>
                  {isActive && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: '#e53935', fontWeight: 700 }}
                      onClick={() => onSetTopper(null)}>×</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── scattered_decor — PNG stickers placeable on any zone ──────────────────
  if (slug === 'scattered_decor') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
        {scatteredDecorElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No elements yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {scatteredDecorElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => {
                e.preventDefault();
                onDragStartSticker?.(el, e.clientX, e.clientY);
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                background: '#fff',
                border: '1.5px solid #f0dce3',
              }}>
                {el.thumbnail_url && <img src={cfImg(el.thumbnail_url, 64, 64, cfAssetsBase)} alt={el.name} width={64} height={64} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── picks — draggable GLB elements inserted into cake ─────────────────────
  if (slug === 'picks') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
        {picksElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No picks yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {picksElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                {el.thumbnail_url && <img src={cfImg(el.thumbnail_url, 64, 64, cfAssetsBase)} alt={el.name} width={64} height={64} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── image_topper — draggable 2D images placed upright on top surface ────────
  if (slug === 'image_topper') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto top of cake to place</div>
        {imageTopperElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No image toppers yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {imageTopperElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                {el.thumbnail_url && <img src={cfImg(el.thumbnail_url, 64, 64, cfAssetsBase)} alt={el.name} width={64} height={64} crossOrigin="anonymous" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── All other types — generic draggable grid ──────────────────────────────
  return (
    <div style={{ ...s.elementCard, cursor: 'default' }}>
      <div style={s.elementCardLabel}>{name}</div>
      {otherElements.length > 0 ? (
        <>
          <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {otherElements.map(el => (
              <div
                key={el.id}
                onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
              >
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                  {el.thumbnail_url && <img src={cfImg(el.thumbnail_url, 64, 64, cfAssetsBase)} alt={el.name} width={64} height={64} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No elements yet</div>
      )}
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
function GearIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function UserIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TemplatesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {/* Flame */}
      <path d="M12 2 C11 3 10.5 4.5 12 5.2 C13.5 4.5 13 3 12 2Z" />
      {/* Candle */}
      <line x1="12" y1="5.2" x2="12" y2="8" />
      {/* Top tier */}
      <rect x="5" y="8" width="14" height="6" rx="2" />
      {/* Bottom tier */}
      <rect x="2" y="14" width="20" height="8" rx="2" />
    </svg>
  );
}

function ElementsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function TextIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function ToolsIcon({ size = 20 }) {
  // Crossed wrench + screwdriver — the generic "tools" mark.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* wrench: handle bottom-left, open jaw top-right */}
      <path strokeWidth="1.7" d="M13.2 7.1a1 1 0 0 0 0 1.3l1.4 1.4a1 1 0 0 0 1.3 0l3.3-3.3a5.2 5.2 0 0 1-6.9 6.9l-6 6a1.85 1.85 0 0 1-2.6-2.6l6-6a5.2 5.2 0 0 1 6.9-6.9l-3.3 3.3z" />
      {/* screwdriver: handle top-left, tip bottom-right */}
      <path strokeWidth="3.2" d="M3.2 3.2l2.4 2.4" />
      <path strokeWidth="1.7" d="M5.6 5.6l9.6 9.6" />
      <path strokeWidth="2.4" d="M16 16l3.5 3.5" />
    </svg>
  );
}

function NewCakeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {/* large 4-pointed sparkle */}
      <path d="M12 2.5c.28 0 .5.22.5.5 0 4.1 1.9 5.5 5.5 5.5.28 0 .5.22.5.5s-.22.5-.5.5c-3.6 0-5.5 1.4-5.5 5.5 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-4.1-1.9-5.5-5.5-5.5-.28 0-.5-.22-.5-.5s.22-.5.5-.5c3.6 0 5.5-1.4 5.5-5.5 0-.28.22-.5.5-.5z" />
      {/* small sparkle top-right */}
      <path d="M19.5 2c.2 0 .35.16.35.35 0 1.75 1 2.65 2.65 2.65.19 0 .35.16.35.35s-.16.35-.35.35c-1.65 0-2.65.9-2.65 2.65 0 .19-.16.35-.35.35s-.35-.16-.35-.35c0-1.75-1-2.65-2.65-2.65-.19 0-.35-.16-.35-.35s.16-.35.35-.35c1.65 0 2.65-.9 2.65-2.65 0-.19.16-.35.35-.35z" />
    </svg>
  );
}

function DashboardIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function OrdersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="12" y2="15" />
    </svg>
  );
}

function CustomersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

// ── Sidebar tooltip ───────────────────────────────────────────────────────────
function SidebarTooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {children}
      <div style={{
        position: 'absolute',
        left: 'calc(100% + 12px)',
        top: '50%',
        background: '#18191b',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 10px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 200,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        fontFamily: "'Quicksand', sans-serif",
        letterSpacing: 0.3,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(-4px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Change password modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose, brandBtn, supabase, apiClient }) {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    if (form.newPassword !== form.confirmPassword) {
      setMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    if (form.newPassword.length < 8) {
      setMsg({ ok: false, text: 'Password must be at least 8 characters.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      if (apiClient?.changePassword) {
        await apiClient.changePassword(form.newPassword);
      } else if (supabase) {
        const { error } = await supabase.auth.updateUser({ password: form.newPassword });
        if (error) throw error;
      }
      setMsg({ ok: true, text: 'Password updated. Signing you out…' });
      // Supabase invalidates the session on password change — sign out cleanly
      // so the user lands on the login screen and re-authenticates with the new password.
      setTimeout(() => {
        apiClient?.signOut?.() ?? supabase?.auth.signOut();
      }, 1200);
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Failed to update password.' });
      setLoading(false);
    }
  }

  const canSubmit = form.newPassword && form.confirmPassword && !loading;

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Change Password</span>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>New password</span>
          <input style={s.modalInput} type="password" value={form.newPassword}
            onChange={e => setField('newPassword', e.target.value)} disabled={loading} autoFocus />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Confirm new password</span>
          <input style={s.modalInput} type="password" value={form.confirmPassword}
            onChange={e => setField('confirmPassword', e.target.value)} disabled={loading}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()} />
        </label>
        {msg && (
          <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#2e7d52' : '#e53935' }}>
            {msg.text}
          </div>
        )}
        <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
          disabled={!canSubmit} onClick={handleSubmit}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

// ── Add team member modal ──────────────────────────────────────────────────────
function AddUserModal({ onClose, brandBtn }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'staff' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    setLoading(true); setMsg(null);
    // TODO: POST /api/baker/invite-user
    await new Promise(r => setTimeout(r, 600));
    setMsg({ ok: true, text: 'Invitation sent successfully.' });
    setLoading(false);
  }

  const canSubmit = form.firstName.trim() && form.email.trim() && !loading;

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Add Team Member</span>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={s.fieldLabel}>First name</span>
            <input style={s.modalInput} value={form.firstName} onChange={e => setField('firstName', e.target.value)} disabled={loading} />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={s.fieldLabel}>Last name</span>
            <input style={s.modalInput} value={form.lastName} onChange={e => setField('lastName', e.target.value)} disabled={loading} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Email</span>
          <input style={s.modalInput} type="email" value={form.email} onChange={e => setField('email', e.target.value)} disabled={loading} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Role</span>
          <select style={{ ...s.modalInput, background: '#fff' }} value={form.role} onChange={e => setField('role', e.target.value)} disabled={loading}>
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        {msg && (
          <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#2e7d52' : '#e53935' }}>{msg.text}</div>
        )}
        <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
          disabled={!canSubmit} onClick={handleSubmit}>
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </div>
  );
}

// ── Cream piping inline section (per-tier, per-zone controls) ─────────────────
// ── Main designer ─────────────────────────────────────────────────────────────
export default function CakeDesigner({ apiClient, supabase, thumbnailBucket = 'cake-thumbnails', onOrder, onSaveTemplate, cfAssetsBase }) {
  const { design, setTierColor, setTierCornerR, addPipingLayer, updatePipingLayer, removePipingLayer, addText, updateText, duplicateText, removeText, addSticker, updateSticker, removeSticker, duplicateSticker, groupStickers, ungroupStickers, moveGroupStickers, setTopper, setTopperScale, setWriting, clearWriting, addStroke, removeStroke, clearPiping, resetDesign, loadDesign, canvasConfig } = useCakeDesign();
  const [elementsOpen, setElementsOpen] = useState(false);
  const [toolsOpen, setToolsOpen]   = useState(false);
  const [activeTool, setActiveTool] = useState(null);   // null = tool list · 'cream-pen' (Texts) · 'pen' (freehand Cream Pen)
  const [penStyle, setPenStyle] = useState({ nozzle: 'round', color: '#ffffff', thickness: 0.03, softness: 0.7, heapHeight: HEAP_HEIGHT_PER_DIAMETER, stampId: null, stampUrl: null, spacing: 0.85 });
  const [writingColorOpen, setWritingColorOpen] = useState(false);   // Texts: collapsible colour picker
  const [elementTypes, setElementTypes] = useState([]);
  const [elementTypesLoading, setElementTypesLoading] = useState(false);
  const [toppersDb, setToppersDb] = useState([]);
  const [scatteredDecorDb, setScatteredDecorDb] = useState([]);
  const [picksDb, setPicksDb] = useState([]);
  const [stampsDb, setStampsDb] = useState([]);
  const [imageTopperDb, setImageTopperDb] = useState([]);
  const [otherElementsDb, setOtherElementsDb] = useState({}); // typeId → elements[]
  const [filterTags,      setFilterTags]      = useState([]);
  const [templateFilters, setTemplateFilters] = useState({});
  const [filterWeight,    setFilterWeight]    = useState('');
  const [filterAge,       setFilterAge]       = useState('');
  const [elemSearch,      setElemSearch]      = useState('');
  const [tmplSearch,      setTmplSearch]      = useState('');
  const [pipingPopupOpen,    setPipingPopupOpen]    = useState(false);
  // Accordion stack of opened piping elements. Each card edits one element (across
  // its rings); multiple cards coexist so several piping styles stack on the cake.
  // Each card carries a unique cardId (a card is an element instance — the SAME style can be
  // added several times as independent nested rings), and its layers are tagged with that
  // cardId. expandedPipingId holds the expanded card's cardId; only one is open at a time.
  const [pipingCards,        setPipingCards]        = useState([]);
  const [expandedPipingId,   setExpandedPipingId]   = useState(null);
  // Which ring's color picker popup is open, keyed `${cardId}-${zone}-${tierIndex}` (null = none),
  // plus the screen-space anchor (the tapped Color dot) the floating popup positions against.
  const [pipingColorKey,     setPipingColorKey]     = useState(null);
  const [pipingColorAnchor,  setPipingColorAnchor]  = useState(null);
  // The expanded card (element + cardId) — drives the card body + edit handlers.
  const pipingPopupEl = pipingCards.find(c => c.cardId === expandedPipingId) ?? null;
  // The expanded card renders pinned to the TOP of the stack, so its (often tall, multi-zone)
  // controls always open from the top; reset the strip's scroll there whenever it changes.
  const pipingPopupRef = useRef(null);
  useEffect(() => { if (pipingPopupRef.current) pipingPopupRef.current.scrollTop = 0; }, [expandedPipingId]);
  const [activeElementTypeIds, setActiveElementTypeIds] = useState(new Set());

  // Capabilities fetched eagerly on mount so edit controls work
  // even before the elements panel is opened (e.g. text, piping selected directly)
  const allowedActionsBySlug = useMemo(() => {
    const m = {};
    elementTypes.forEach(et => { m[et.slug] = et.default_allowed_actions ?? {}; });
    return m;
  }, [elementTypes]);

  // ── Unified selection: null | { type, ...props } ──────────────────────────
  // type 'tier':   { index }
  // type 'piping': { tierIndex, zone: 'top'|'bottom' }
  // type 'text':   { id }
  // type 'topper': {}
  // type 'sticker': { id }  ← primary sticker (toolbar anchor)
  const [selectedEl, setSelectedEl] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  // Full sticker selection set (drives canvas highlight + group ops)
  const [selectedStickerIds, setSelectedStickerIds] = useState(new Set());
  // True when user entered multi-select via long-press (mobile) or Ctrl+click (desktop)
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Derived
  const selectedTier    = selectedEl?.type === 'tier'    ? selectedEl.index : null;
  const selectedPiping  = selectedEl?.type === 'piping'  ? selectedEl       : null;
  const selectedTextId  = selectedEl?.type === 'text'    ? selectedEl.id    : null;
  const selectedStickerId = selectedStickerIds.size === 1 ? [...selectedStickerIds][0] : null;
  const STICKER_CAPS = { resize: true, delete: true, color: false, duplicate: true };
  const caps = selectedEl
    ? (selectedEl.type === 'tier'    ? TIER_CAPS
     : selectedEl.type === 'topper'  ? TOPPER_CAPS
     : selectedEl.type === 'sticker' ? (design.stickers.find(s => s.id === selectedEl.id)?.allowedActions ?? STICKER_CAPS)
     : (allowedActionsBySlug[selectedEl.type] ?? null))
    : null;

  // pipingTarget: { tierIndex, zone } — triggers in-canvas style picker
  const [pipingTarget, setPipingTarget] = useState(null);
  const [saveModal, setSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateOffering, setTemplateOffering] = useState('standard');
  const [templateWeight, setTemplateWeight] = useState('');
  const [templateMinAge, setTemplateMinAge] = useState('');
  const [templateMaxAge, setTemplateMaxAge] = useState('');
  const [templateOccasionIds, setTemplateOccasionIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const textInputRef = useRef();
  const thumbContainerRef = useRef();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [addUserModal,        setAddUserModal]        = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [colorGuideOpen,      setColorGuideOpen]      = useState(false);
  const [orderModalOpen,      setOrderModalOpen]      = useState(false);
  const [newOrderId,          setNewOrderId]          = useState(null);
  const [editingOrder,        setEditingOrder]        = useState(null);
  const [ordersPanelOpen,     setOrdersPanelOpen]     = useState(false);
  const [customersPanelOpen,  setCustomersPanelOpen]  = useState(false);
  const [customersFilter,     setCustomersFilter]     = useState(null);
  const [dashboardOpen,       setDashboardOpen]       = useState(false);
  const [settingsPanelOpen,   setSettingsPanelOpen]   = useState(false);
  const [billingPanelOpen,    setBillingPanelOpen]    = useState(false);
  const [ordersFilter,        setOrdersFilter]        = useState(null);
  const [bakerReady,          setBakerReady]          = useState(false);
  const [bakerData,    setBakerData]    = useState(null);
  const [userData,     setUserData]     = useState(null);
  const [bakerSettings, setBakerSettings] = useState({});
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [mobilePanelHeight, setMobilePanelHeight] = useState(260);
  const settingsRef      = useRef(null);
  const profileRef       = useRef(null);
  const hitTestRef       = useRef(null);
  const snapCameraRef    = useRef(null);
  const dragStickerRef   = useRef(null);  // element being pointer-dragged
  const [dragGhost, setDragGhost] = useState(null); // { x, y, el } for floating preview

  const primaryColor = bakerData?.primary_color || '#1a1a1a';
  const accentColor  = bakerData?.accent_color  || '#333333';
  const brandBtn = {
    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
    boxShadow: `0 4px 16px ${hexToRgba(primaryColor, 0.25)}`,
  };
  const brandActive = {
    background: hexToRgba(primaryColor, 0.1),
    color: primaryColor,
  };
  const initials = userData
    ? `${(userData.firstName || '')[0] || ''}${(userData.lastName || '')[0] || ''}`.toUpperCase() || '?'
    : '?';
  const isMobile = windowWidth <= 640;

  useEffect(() => {
    if (apiClient?.fetchBakerSettings) {
      apiClient.fetchBakerSettings().then(s => setBakerSettings(s ?? {})).catch(() => {});
    }
  }, [apiClient]);

  useEffect(() => {
    if (apiClient?.fetchBakerProfile) {
      apiClient.fetchBakerProfile()
        .then(({ baker, user }) => {
          if (baker) setBakerData(baker);
          if (user)  setUserData(user);
        })
        .catch(() => {})
        .finally(() => setBakerReady(true));
      return;
    }
    if (!supabase) { setBakerReady(true); return; }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setBakerReady(true); return; }
      const { data: contact } = await supabase
        .from('baker_appusers')
        .select('first_name, last_name, baker_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!contact) { setBakerReady(true); return; }
      setUserData({ firstName: contact.first_name, lastName: contact.last_name, email: session.user.email });
      const { data: baker } = await supabase
        .from('bakers')
        .select('id, name, logo_url')
        .eq('id', contact.baker_id)
        .single();
      if (baker) setBakerData(baker);
      setBakerReady(true);
    });
  }, [supabase, apiClient]);

  useEffect(() => {
    function onMouseDown(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false);
      if (profileRef.current  && !profileRef.current.contains(e.target))  setProfileOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSaving(true);
    setSaveMsg(null);

    // Capture from the off-screen thumbnail canvas (no floor, transparent bg)
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const thumbnailBlob = await new Promise(resolve => {
      if (!thumbCanvas) return resolve(null);
      try {
        const timeout = setTimeout(() => resolve(null), 4000);
        thumbCanvas.toBlob(blob => { clearTimeout(timeout); resolve(blob ?? null); }, 'image/png');
      } catch {
        resolve(null);
      }
    });

    // Derive the cake shape from the design (bottom tier): rect with equal sides = square.
    const t0 = design.tiers[0];
    const cakeShape = t0?.shape === 'rect'
      ? (Math.abs((t0.width ?? 0) - (t0.depth ?? 0)) < 1e-3 ? 'square' : 'rectangle')
      : 'round';

    // Build design JSON (tiers carry shape/width/depth so a sheet round-trips on reload)
    const designJson = {
      shape: cakeShape,
      tiers: design.tiers.map(t => ({
        color:        t.color,
        topPipings:    t.topPipings    ?? [],
        bottomPipings: t.bottomPipings ?? [],
        decorations:  [],
        texts:        [],
        ...(t.radius != null && { radius: t.radius }),
        ...(t.height != null && { height: t.height }),
        ...(t.shape   != null && { shape: t.shape }),
        ...(t.width   != null && { width: t.width }),
        ...(t.depth   != null && { depth: t.depth }),
        ...(t.cornerR != null && { cornerR: t.cornerR }),
      })),
      texts:    design.texts,
      stickers: design.stickers,
      topper:   design.topper ?? null,
      writing:  design.writing ?? null,
      piping:   design.piping ?? [],
    };

    try {
    if (onSaveTemplate) {
      try {
        await onSaveTemplate({
          name:         templateName.trim(),
          offering:     templateOffering,
          tierCount:    design.tiers.length,
          designJson,
          thumbnailBlob,
          weightKg:     templateWeight !== '' ? parseFloat(templateWeight) : null,
          minAge:       templateMinAge !== '' ? parseInt(templateMinAge, 10) : null,
          maxAge:       templateMaxAge !== '' ? parseInt(templateMaxAge, 10) : null,
          occasionTagIds: [...templateOccasionIds],
        });
        setSaveMsg({ ok: true, text: 'Template saved!' });
        setTimeout(() => { setSaveModal(false); setSaveMsg(null); setTemplateName(''); setTemplateWeight(''); setTemplateMinAge(''); setTemplateMaxAge(''); setTemplateOccasionIds(new Set()); }, 1200);
      } catch (err) {
        setSaveMsg({ ok: false, text: err.message });
      }
      setSaving(false);
      return;
    }

    // Upload thumbnail to R2 via signed URL
    let thumbnail_url = null;
    if (thumbnailBlob && apiClient?.getSignedUploadUrl) {
      try {
        const filename = `${crypto.randomUUID()}.png`;
        const { url, key } = await apiClient.getSignedUploadUrl('templates/thumbnails', filename, 'image/png');
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: thumbnailBlob });
        thumbnail_url = key;
      } catch (_) { /* thumbnail upload failure is non-fatal */ }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: bakerUser } = await supabase
      .from('baker_appusers').select('baker_id').eq('auth_user_id', user?.id).maybeSingle();

    const { data: newTpl, error } = await supabase.from('cake_templates').insert({
      name: templateName.trim(),
      shape: cakeShape,
      tier_count: design.tiers.length,
      offering: templateOffering,
      design: designJson,
      thumbnail_url,
      baker_id: bakerUser?.baker_id ?? null,
      is_active: true,
      sort_order: 0,
    }).select('id').single();

    if (!error && newTpl) {
      const hasAttrs = templateWeight !== '' || templateMinAge !== '' || templateMaxAge !== '';
      if (hasAttrs) {
        const { error: attrsErr } = await supabase.from('cake_template_attrs').upsert({
          template_id:   newTpl.id,
          min_weight_kg: templateWeight  !== '' ? parseFloat(templateWeight)      : null,
          min_age:       templateMinAge  !== '' ? parseInt(templateMinAge, 10)    : null,
          max_age:       templateMaxAge  !== '' ? parseInt(templateMaxAge, 10)    : null,
        }, { onConflict: 'template_id' });
        if (attrsErr) throw new Error(`Attrs save failed: ${attrsErr.message}`);
      }
      if (templateOccasionIds.size > 0) {
        const rows = [...templateOccasionIds].map(tag_id => ({ template_id: newTpl.id, tag_id, source: 'manual' }));
        const { error: tagsErr } = await supabase.from('template_tags').insert(rows);
        if (tagsErr) throw new Error(`Tags save failed: ${tagsErr.message}`);
      }
    }

    if (error) {
      setSaveMsg({ ok: false, text: error.message });
    } else {
      setSaveMsg({ ok: true, text: 'Template saved!' });
      setTimeout(() => { setSaveModal(false); setSaveMsg(null); setTemplateName(''); setTemplateWeight(''); setTemplateMinAge(''); setTemplateMaxAge(''); setTemplateOccasionIds(new Set()); }, 1200);
    }
    } catch (err) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Eager load piping elements if any tier already has piping applied —
  // ensures placement_config.rotation syncs without opening the elements panel.
  useEffect(() => {
    const hasPiping = design.tiers.some(t => t.topPipings?.length || t.bottomPipings?.length);
    if (hasPiping) loadElementsIfNeeded();
  }, []);

  // Eager load element_types (with allowed_actions) on mount so edit controls
  // are available immediately — before the elements panel is ever opened.
  useEffect(() => {
    if (apiClient) {
      apiClient.fetchElementTypes().then(data => { if (data) setElementTypes(data); });
      apiClient.fetchTags?.().then(data => { if (data) setFilterTags(data); }).catch(() => {});
    } else {
      supabase
        .from('element_types')
        .select('id, slug, name, placement_rules, sort_order, default_allowed_actions')
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data }) => { if (data) setElementTypes(data); });
      supabase
        .from('tags')
        .select('id, name, slug, category')
        .eq('is_active', true)
        .order('category').order('sort_order')
        .then(({ data }) => { if (data) setFilterTags(data); });

    }
  }, []);

  async function loadElementsIfNeeded() {
    if (toppersDb.length > 0 || scatteredDecorDb.length > 0 || picksDb.length > 0 || imageTopperDb.length > 0 || Object.keys(otherElementsDb).length > 0) return;
    setElementTypesLoading(true);
    let rows = [];
    if (apiClient) {
      rows = await apiClient.fetchElements({ parentsOnly: true });
    } else {
      const { data: topLevelData } = await supabase
        .from('cake_elements')
        .select('id, name, description, image_url, thumbnail_url, allowed_zones, placement_config, sort_order, element_type_id, default_color, allowed_actions')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('sort_order');
      rows = topLevelData ?? [];
    }
    // Normalise relative keys to full URLs so cfImg and canvas renderers work consistently
    const resolveUrl = key => {
      if (!key) return key;
      try { new URL(key); return key; } catch { return cfAssetsBase ? `${cfAssetsBase}/${key}` : key; }
    };
    rows = rows.map(r => {
      // The alternate piping GLB lives inside placement_config (not a column), so resolve
      // its R2 key to a full URL here too, the same way image_url is handled.
      let pc = r.placement_config;
      if (pc && (pc.top_alt_glb_url || pc.bottom_alt_glb_url)) {
        pc = { ...pc };
        if (pc.top_alt_glb_url)    pc.top_alt_glb_url    = resolveUrl(pc.top_alt_glb_url);
        if (pc.bottom_alt_glb_url) pc.bottom_alt_glb_url = resolveUrl(pc.bottom_alt_glb_url);
      }
      return { ...r, image_url: resolveUrl(r.image_url), thumbnail_url: resolveUrl(r.thumbnail_url), placement_config: pc };
    });

    setActiveElementTypeIds(new Set(rows.map(r => r.element_type_id)));
    const topperTypeId         = elementTypes.find(et => et.slug === 'topper')?.id;
    const scatteredDecorTypeId = elementTypes.find(et => et.slug === 'scattered_decor')?.id;
    const picksTypeId          = elementTypes.find(et => et.slug === 'picks')?.id;
    const imageTopperTypeId    = elementTypes.find(et => et.slug === 'image_topper')?.id;
    const pipingStampTypeId    = elementTypes.find(et => et.slug === 'piping_stamp')?.id;
    const knownTypeIds         = new Set([topperTypeId, scatteredDecorTypeId, picksTypeId, imageTopperTypeId, pipingStampTypeId].filter(Boolean));
    setToppersDb(rows.filter(r => r.element_type_id === topperTypeId));
    setScatteredDecorDb(rows.filter(r => r.element_type_id === scatteredDecorTypeId));
    setPicksDb(rows.filter(r => r.element_type_id === picksTypeId));
    setStampsDb(rows.filter(r => r.element_type_id === pipingStampTypeId));
    setImageTopperDb(rows.filter(r => r.element_type_id === imageTopperTypeId));
    const others = {};
    rows.filter(r => !knownTypeIds.has(r.element_type_id)).forEach(r => {
      (others[r.element_type_id] ??= []).push(r);
    });
    setOtherElementsDb(others);
    setElementTypesLoading(false);
  }

  async function openElements() {
    const opening = !elementsOpen;
    setElementsOpen(opening);
    setTemplatesOpen(false);
    setToolsOpen(false);
    // Note: do NOT close the piping stack here — picking another element should add a
    // card to the existing stack, not wipe it.
    if (opening) await loadElementsIfNeeded();
  }

  // Tools flyout (Cream Pen, …). Opening jumps straight to the cream-pen editor when a
  // message already exists, otherwise shows the tool list.
  function openTools() {
    const opening = !toolsOpen;
    setToolsOpen(opening);
    setElementsOpen(false);
    setTemplatesOpen(false);
    if (opening) setActiveTool(design.writing?.text ? 'cream-pen' : null);
  }

  // Open (or focus) a card for this element in the accordion stack. Picking a new
  // element appends a card and expands it, collapsing the others — without closing
  // the stack or disturbing the other layers already on the cake.
  // Open a piping card. From the palette (no cardId) this ALWAYS spawns a fresh instance, so
  // the same style can be placed several times as independent (e.g. differently coloured)
  // nested rings. From click-to-edit (cardId given) it focuses the card owning that ring.
  async function openPipingPopup(el, { cardId } = {}) {
    const focusOnly = () => {
      setColorOpen(false); setPipingPopupOpen(true); setElementsOpen(false); setSelectedEl(null);
    };
    if (cardId) {
      setPipingCards(prev => prev.some(c => c.cardId === cardId) ? prev : [...prev, { ...el, cardId }]);
      setExpandedPipingId(cardId);
      focusOnly();
      return;
    }
    const newCardId = crypto.randomUUID();
    // Single-zone elements have nothing to choose — auto-add the ring (nested/stacked) on the
    // bottom tier. Multi-zone elements stay manual via each ring's toggle.
    const zones = (el.allowed_zones ?? []).filter(z => z === 'rim' || z === 'board');
    if (zones.length === 1) {
      const isTop = zones[0] === 'rim';
      const { glbUrl, altGlbUrl } = resolvePipingGlbs(el);
      const piping = {
        id: el.id, cardId: newCardId, glbUrl, name: el.name,
        color: '#f5e6c8', size: 1,
        ...pipingPlacementFromConfig(el.placement_config, isTop),
        ...(altGlbUrl ? { altGlbUrl } : {}),
      };
      if (isTop) { const ro = nextRimRadialOffset(0); if (ro) piping.userRadialOffset = ro; }
      else {
        piping.yAdjustable = !!el.placement_config?.bottom_y_adjustable;
        // Festoon swags bake an offset that lifts them clear of whatever's already on the board;
        // other side borders stack above existing layers; a plate ring sits flush (0).
        piping.userYOffset = piping.bend
          ? nextFestoonYOffset(0, piping)
          : (piping.yAdjustable ? nextBoardYOffset(0) : 0);
      }
      addRingLayer(0, zones[0], piping);
    }
    setPipingCards(prev => [...prev, { ...el, cardId: newCardId }]);
    setExpandedPipingId(newCardId);
    focusOnly();
  }

  // Drop a card from the accordion stack (UI only). Used when a card's last ring is
  // unchecked — that instance no longer carries any ring, so its card goes away too.
  function dropPipingCard(cardId) {
    const remaining = pipingCards.filter(c => c.cardId !== cardId);
    setPipingCards(remaining);
    if (expandedPipingId === cardId) setExpandedPipingId(remaining[remaining.length - 1]?.cardId ?? null);
  }

  // ── Ring-scoped edits ──────────────────────────────────────────────────────
  // Every appearance control targets ONE physical ring — a specific (tier, zone)
  // pair — so each ring (board, each tier's rim) is tuned independently.

  // The applied piping for a ring, or null when it isn't on the cake yet.
  function ringPiping(tierIndex, zone) {
    const arr = zone === 'rim' ? design.tiers[tierIndex]?.topPipings : design.tiers[tierIndex]?.bottomPipings;
    return arr?.find(p => p.cardId === pipingPopupEl?.cardId) ?? null;
  }

  // ── Layer stacking / overlap avoidance ─────────────────────────────────────
  // Shell height shares ONE constant with the renderer (SHELL_HEIGHT_FRAC). This nominal,
  // upright height is used only where an approximation is fine (initial stacking offsets).
  const PIPING_SHELL_FRAC = SHELL_HEIGHT_FRAC;
  function pipingShellHeight(tierIndex, size = 1) {
    return (canvasConfig.tiers[tierIndex]?.radius ?? 0.35) * PIPING_SHELL_FRAC * size;
  }
  // Tier-local vertical band [lo, hi] (0 = base, height = top edge) a layer occupies.
  function pipingBand(p, tierIndex, zone) {
    const tierHeight = canvasConfig.tiers[tierIndex]?.height ?? 0;
    // A festoon swag spans from its belly (anchor − scaled depth) up to its ends (anchor + a
    // little proud) — report that real band so new layers stack around the swag, not over it.
    if (zone === 'board' && p.bend) {
      const anchor = tierHeight * BEND_ANCHOR_FRAC + (p.userYOffset ?? 0);
      const { belly, top } = festoonReach(p, tierIndex);   // measured: real cream reach below/above anchor
      return [anchor - belly, anchor + top];
    }
    const h  = pipingShellHeight(tierIndex, p.size ?? 1);
    const yo = (p.yOffset ?? 0) + (p.userYOffset ?? 0);
    if (zone === 'rim') { const top = tierHeight + yo; return [top - h, top]; }
    return [yo, yo + h];
  }
  // EXACT tier-local band [lo, hi] of a side/board layer, from the shell extents the canvas
  // measured for this exact GLB + flip + size (its real tilt/orientation baked in). This is
  // what the Height clamp uses so "top edge touches the rim / bottom touches the board" is
  // precise for any cake size or template — no hardcoded heights.
  function sideBand(p, tierIndex) {
    const radius = canvasConfig.tiers[tierIndex]?.radius ?? 0.35;
    const flip   = p.userFlipBottom != null ? p.userFlipBottom : (p.flipBottom ?? true);
    const { topFrac, botFrac } = getShellExtents(p.glbUrl, flip, p.size ?? 1);
    const yo = (p.yOffset ?? 0) + (p.userYOffset ?? 0);
    return [yo + radius * botFrac, yo + radius * topFrac];
  }
  // Default userYOffset for a NEW side/board layer: stack it just above the highest board
  // layer already on the tier (kept within the wall) so layers don't overlap.
  function nextBoardYOffset(tierIndex) {
    const boards = design.tiers[tierIndex]?.bottomPipings ?? [];
    let top = 0;
    boards.forEach(p => { const [, hi] = pipingBand(p, tierIndex, 'board'); if (hi > top) top = hi; });
    const maxLo = (canvasConfig.tiers[tierIndex]?.height ?? 0) - pipingShellHeight(tierIndex, 1);
    return Math.max(0, Math.min(top, Math.max(0, maxLo)));
  }
  // A festoon swag's REAL vertical reach (cake units) below and above its anchor, from the bent
  // geometry the canvas measured (rope thickness baked in). Falls back — until the swag has
  // rendered once — to a generous estimate (centreline drop + a full shell for the rope) so a
  // first-time add over-clears rather than overlapping. depthRel = drop as a fraction of radius.
  function festoonReach(p, tierIndex) {
    const radius   = canvasConfig.tiers[tierIndex]?.radius ?? TIER_RADII[0];
    const depthRel = (p.bendDepth ?? 0.4) / TIER_RADII[0];
    const fallback = { bellyFrac: depthRel + SHELL_HEIGHT_FRAC * (p.size ?? 1), topFrac: SHELL_HEIGHT_FRAC * 0.5 * (p.size ?? 1) };
    const { bellyFrac, topFrac } = getFestoonExtents(p.glbUrl, festoonSig(p), fallback);
    return { belly: radius * bellyFrac, top: radius * topFrac };
  }
  // Baked userYOffset for a NEW festoon swag so its lowest CREAM rests just above the highest board
  // layer already on the tier (e.g. a base border), instead of dropping the drape over it. Computed
  // ONCE at add-time and stored — the renderer never re-fits it, so the swag won't jump when later
  // layers are added; those stack around its reported band (pipingBand) instead. Returns 0 (the
  // plain wall anchor) when the board is empty, and caps so the swag's ends stay under the rim.
  // Works for every tier — all extents come from this tier's own radius/height/neighbours.
  function nextFestoonYOffset(tierIndex, piping) {
    const boards = (design.tiers[tierIndex]?.bottomPipings ?? []).filter(p => !p.bend);
    if (!boards.length) return 0;
    const tierHeight  = canvasConfig.tiers[tierIndex]?.height ?? 0;
    const anchorBase  = tierHeight * BEND_ANCHOR_FRAC;
    const { belly, top } = festoonReach(piping, tierIndex);
    let borderTop = 0;
    boards.forEach(p => { const [, hi] = sideBand(p, tierIndex); if (hi > borderTop) borderTop = hi; });
    const anchor    = borderTop + belly;          // swag's lowest cream sits on the border's top
    const maxAnchor = tierHeight - top;            // keep the proud ends under the rim
    const clamped   = Math.min(Math.max(anchorBase, anchor), Math.max(anchorBase, maxAnchor));
    return +(clamped - anchorBase).toFixed(4);
  }
  // Radial footprint a rim ring occupies. Uses the MEASURED radial span of the rings already on
  // this rim — published by the renderer once each has drawn, so it reflects the GLB's real
  // width (a wide rosette occupies far more than the nominal upright shell height, which is why
  // a nominal step let the next ring overlap it). Falls back to the nominal shell width only
  // before anything has rendered. Takes the widest existing ring so the step always clears it.
  function pipingRingRadialWidth(tierIndex, size = 1) {
    const rings = design.tiers[tierIndex]?.topPipings ?? [];
    let w = 0;
    rings.forEach(p => { const [lo, hi] = rimRadialBand(p, tierIndex); if (hi - lo > w) w = hi - lo; });
    return w > 0 ? w : pipingShellHeight(tierIndex, size);
  }
  // Inward userRadialOffset for a NEW rim layer so it nests CONCENTRICALLY inside any rings
  // already on this tier's rim — each new ring steps inward by the existing rings' MEASURED
  // radial width, so its outer edge meets their inner edge (touching, not overlapping). First
  // ring is flush with the edge (0). Always returns a value; use rimHasRoom() to gate first.
  function nextRimRadialOffset(tierIndex) {
    const rings = design.tiers[tierIndex]?.topPipings ?? [];
    if (!rings.length) return 0;
    let innermost = 0;
    rings.forEach(p => { const o = p.userRadialOffset ?? 0; if (o < innermost) innermost = o; });
    return innermost - pipingRingRadialWidth(tierIndex, 1);
  }
  // Whether the tier's rim can hold one more nested ring: the proposed inner edge must clear
  // the floor — the cake center on the top tier, or the cylinder of the tier resting on this
  // rim (so middle/bottom tiers hold fewer rings).
  function rimHasRoom(tierIndex) {
    if (!(design.tiers[tierIndex]?.topPipings ?? []).length) return true;
    const radius    = canvasConfig.tiers[tierIndex]?.radius ?? 0.35;
    const half      = pipingRingRadialWidth(tierIndex, 1) / 2;
    const innerEdge = (radius - half + nextRimRadialOffset(tierIndex)) - half;
    const upper     = canvasConfig.tiers[tierIndex + 1];   // tier resting on this rim, if any
    return innerEdge >= (upper ? upper.radius : 0);
  }
  // EXACT radial band [innerEdge, outerEdge] (distance from the tier centre) a rim ring's VISIBLE
  // shell occupies, from its MEASURED post-tilt radial reach. outerEdge = radius + E + reachOut,
  // innerEdge = radius + E + reachIn (E = combined offset ≤ 0, matching the renderer's clamp).
  function rimRadialBand(p, tierIndex) {
    const radius = canvasConfig.tiers[tierIndex]?.radius ?? 0.35;
    const flip   = p.userFlipTop !== undefined ? p.userFlipTop : (p.flipTop ?? false);
    const { radialOutFrac, radialInFrac } = getShellExtents(p.glbUrl, flip, p.size ?? 1);
    const E = Math.min((p.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0), 0);
    return [radius + E + radius * radialInFrac, radius + E + radius * radialOutFrac];
  }

  // A fresh piping object for the open element in a zone, at config defaults.
  function buildRingPiping(zone, tierIndex = 0, overrides = {}) {
    const isTop = zone === 'rim';
    const { glbUrl, altGlbUrl } = resolvePipingGlbs(pipingPopupEl);
    const piping = {
      id: pipingPopupEl.id, cardId: pipingPopupEl.cardId, glbUrl, name: pipingPopupEl.name,
      color: '#f5e6c8', size: 1,
      ...pipingPlacementFromConfig(pipingPopupEl.placement_config, isTop),
    };
    // New rim layers nest concentrically inside any existing rim rings. On the board, a
    // y-adjustable SIDE border rides up the wall and stacks above existing side layers; a
    // non-adjustable PLATE ring is singular (one per board) and sits flush on the board (0).
    if (!isTop) {
      piping.yAdjustable = !!pipingPopupEl.placement_config?.bottom_y_adjustable;
      // Festoon swags bake an offset (once) that lifts them clear of whatever's already on the
      // board, then stay put. Other y-adjustable side borders stack above existing layers; a
      // non-adjustable plate ring is singular and sits flush on the board (0).
      piping.userYOffset = piping.bend
        ? nextFestoonYOffset(tierIndex, piping)
        : (piping.yAdjustable ? nextBoardYOffset(tierIndex) : 0);
    } else { const ro = nextRimRadialOffset(tierIndex); if (ro) piping.userRadialOffset = ro; }
    Object.assign(piping, overrides);
    if (altGlbUrl) piping.altGlbUrl = altGlbUrl;   // patterns resolve B from a referenced block
    return piping;
  }

  // The board holds at most ONE plate ring (a non-y-adjustable board border). Before adding a
  // new plate ring, evict any existing one (from another card) so it's replaced rather than
  // stacked — y-adjustable SIDE borders are exempt and keep stacking. Drops the evicted ring's
  // card too when that was its only piping anywhere (same as unchecking its last ring).
  function evictBoardPlateRing(tierIndex) {
    (design.tiers[tierIndex]?.bottomPipings ?? [])
      .filter(p => !p.yAdjustable)
      .forEach(p => {
        removePipingLayer(tierIndex, 'board', p.layerId);
        const stillOn = design.tiers.some((t, i) =>
          (t.topPipings ?? []).some(q => q.cardId === p.cardId) ||
          (t.bottomPipings ?? []).some(q => q.cardId === p.cardId && !(i === tierIndex && q.layerId === p.layerId))
        );
        if (!stillOn) dropPipingCard(p.cardId);
      });
  }

  // Add a piping layer, first enforcing the board's single-plate-ring rule for non-adjustable
  // board borders (rim rings and y-adjustable side borders pass straight through and stack).
  function addRingLayer(tierIndex, zone, piping) {
    if (zone === 'board' && !piping.yAdjustable) evictBoardPlateRing(tierIndex);
    addPipingLayer(tierIndex, zone, piping);
  }

  // Mutate the current card's piping on a ring, auto-applying it (at defaults) first if
  // it isn't on the cake yet — so color / size / arrangement are live even before the ring
  // is explicitly added. Edits the matching layer in place (leaving other layers intact).
  function updateRing(tierIndex, zone, mutate) {
    const existing = ringPiping(tierIndex, zone);
    if (existing) {
      updatePipingLayer(tierIndex, zone, existing.layerId, mutate);
    } else {
      const next = mutate(buildRingPiping(zone, tierIndex));
      if (next) addRingLayer(tierIndex, zone, next);
    }
  }

  function handlePipingColorChange(tierIndex, zone, c) {
    updateRing(tierIndex, zone, p => ({ ...p, color: c }));
  }

  function handlePipingSizeChange(tierIndex, zone, v) {
    updateRing(tierIndex, zone, p => ({ ...p, size: v }));
  }

  // Manual radial position (cake units): + pushes the ring outward, − pulls it inward.
  // Lets the baker decouple radial distance from size (size also shifts the ring radially).
  // For a rim ring this is collision-clamped (like the side Height): moving OUTWARD stops the
  // instant its outer edge touches the next ring out (else the rim edge); moving INWARD stops
  // when its inner edge touches the next ring in (else the cake centre, or the cylinder of the
  // tier resting on this rim). Bands use each shell's measured radial width — exact, no guesses.
  function handlePipingRadialOffsetChange(tierIndex, zone, v) {
    const cur = ringPiping(tierIndex, zone);
    if (zone !== 'rim' || !cur) { updateRing(tierIndex, zone, p => ({ ...p, userRadialOffset: v })); return; }
    const radius  = canvasConfig.tiers[tierIndex]?.radius ?? 0.35;
    const base    = cur.extraRadialOffset ?? 0;
    const flip    = cur.userFlipTop !== undefined ? cur.userFlipTop : (cur.flipTop ?? false);
    const reachOut = radius * getShellExtents(cur.glbUrl, flip, cur.size ?? 1).radialOutFrac;
    const [curIn, curOut] = rimRadialBand(cur, tierIndex);
    const depth   = curOut - curIn;   // our radial width
    const EPS = 1e-4;
    // Work in outer-edge space (distance from centre), then convert back. The outer edge stops
    // at the rim or the next ring out; the inner edge (outer − depth) stops at the centre, the
    // cylinder of the tier above, or the next ring in.
    let outerMax = radius;            // rim edge
    let outerMin = depth;             // inner edge ≥ cake centre (0)
    const upper = canvasConfig.tiers[tierIndex + 1];
    if (upper) outerMin = Math.max(outerMin, upper.radius + depth);   // inner edge ≥ upper cylinder
    const curCenter = (curIn + curOut) / 2;
    (design.tiers[tierIndex]?.topPipings ?? []).forEach(p => {
      if (p.layerId === cur.layerId) return;
      const [nin, nout] = rimRadialBand(p, tierIndex);
      // Classify by which side the neighbour's centre sits — robust even if the bands currently
      // overlap (so we can never push further INTO a neighbour, only separate from it).
      if ((nin + nout) / 2 < curCenter) outerMin = Math.max(outerMin, nout + depth);  // inside  → our inner edge rests on its outer edge
      else                              outerMax = Math.min(outerMax, nin);           // outside → our outer edge stops at its inner edge
    });
    const desiredOuter = radius + (base + v) + reachOut;
    const clampedOuter = Math.min(Math.max(outerMin, desiredOuter), Math.max(outerMin, outerMax));
    const clampedE     = clampedOuter - radius - reachOut;   // back to combined offset
    updateRing(tierIndex, zone, p => ({ ...p, userRadialOffset: +(clampedE - base).toFixed(4) }));
  }

  function handlePipingBoardYOffsetChange(tierIndex, v) {
    const cur = design.tiers[tierIndex]?.bottomPipings?.find(p => p.cardId === pipingPopupEl?.cardId);
    if (!cur) return;
    // A sideways element rides its tier's wall inside the gap between whatever sits ABOVE it (a
    // higher side element, else the tier's top edge / rim) and whatever sits BELOW (a lower side
    // element / the board, else the tier base). It stops the instant an edge touches a neighbour.
    // We clamp the shell's ANCHOR (yo), using each shell's EXACT measured top/bottom reach
    // (sideBand) so the test is precise for tilted shells and any cake size — no guessed heights.
    const baseYOffset = cur.yOffset ?? 0;
    const tierHeight  = canvasConfig.tiers[tierIndex]?.height ?? 0;
    // Bend (festoon) elements aren't discrete shells, so the shell-band clamp below doesn't
    // apply — their real vertical reach is anchor↑ to (anchor − scaled depth)↓. Clamp the
    // anchor so the belly stays on the cake and the top stays under the rim, and allow the
    // anchor to go BELOW the config height (negative userYOffset) so it can be lowered too.
    if (cur.bend) {
      // The renderer fits the festoon between the borders above/below (measured) so it never
      // overlaps; here we just keep the manual nudge within the tier wall. Anchor base matches
      // the renderer (a fraction of the wall); userYOffset is the delta from it.
      const anchorBase = tierHeight * BEND_ANCHOR_FRAC;
      const clampedYo  = Math.min(Math.max(0, anchorBase + v), tierHeight);
      updatePipingLayer(tierIndex, 'board', cur.layerId, p => ({ ...p, userYOffset: +(clampedYo - anchorBase).toFixed(4) }));
      return;
    }
    const [curLo, curHi] = sideBand(cur, tierIndex);
    const curYo  = baseYOffset + (cur.userYOffset ?? 0);
    const topExt = curHi - curYo;   // how far the shell reaches ABOVE its anchor (measured)
    const botExt = curLo - curYo;   // and BELOW (≤ 0 when it dips under the anchor)
    const EPS = 1e-4;
    let yoMin = -botExt;                 // bottom edge ≥ tier base (0)
    let yoMax = tierHeight - topExt;     // top edge ≤ tier top edge (the rim) — exact contact
    (design.tiers[tierIndex]?.bottomPipings ?? []).forEach(p => {
      if (p.layerId === cur.layerId) return;
      const [nlo, nhi] = sideBand(p, tierIndex);
      if      (nhi <= curLo + EPS) yoMin = Math.max(yoMin, nhi - botExt);   // neighbour below → our bottom rests on it
      else if (nlo >= curHi - EPS) yoMax = Math.min(yoMax, nlo - topExt);   // neighbour above → our top stops under it
    });
    const desiredYo = baseYOffset + v;
    const clampedYo = Math.min(Math.max(yoMin, desiredYo), Math.max(yoMin, yoMax));
    updatePipingLayer(tierIndex, 'board', cur.layerId, p => ({ ...p, userYOffset: Math.max(0, +(clampedYo - baseYOffset).toFixed(4)) }));
  }

  function handlePipingBoardFlipChange(tierIndex) {
    const cur = design.tiers[tierIndex]?.bottomPipings?.find(p => p.cardId === pipingPopupEl?.cardId);
    if (!cur) return;
    const defaultFlip = pipingPopupEl?.placement_config?.bottom_flip ?? true;
    const current = cur.userFlipBottom != null ? cur.userFlipBottom : defaultFlip;
    updatePipingLayer(tierIndex, 'board', cur.layerId, p => ({ ...p, userFlipBottom: !current }));
  }

  function handlePipingArrangementChange(tierIndex, zone, mode) {
    const isTop = zone === 'rim';
    const seedAngle = (isTop ? pipingPopupEl?.placement_config?.top_single_angle
                             : pipingPopupEl?.placement_config?.bottom_single_angle) ?? PIPING_FRONT_ANGLE;
    updateRing(tierIndex, zone, (p) => {
      if (mode === 'single') {
        const instances = p.instances?.length ? p.instances : [{ id: Date.now(), angle: seedAngle }];
        return { ...p, arrangement: 'single', instances };
      }
      const { instances, ...rest } = p;   // drop instances → cheap procedural ring
      return { ...rest, arrangement: 'ring' };
    });
  }

  function handlePipingAddInstance(tierIndex, zone) {
    const isTop = zone === 'rim';
    const max = (isTop ? pipingPopupEl?.placement_config?.top_single_max
                       : pipingPopupEl?.placement_config?.bottom_single_max) ?? 12;
    updateRing(tierIndex, zone, (p) => {
      const list = p.instances ?? [];
      if (list.length >= max) return null;
      const last = list[list.length - 1];
      const angle = ((last?.angle ?? 0) + Math.PI / 6) % (Math.PI * 2);   // +30° so it's visible
      return { ...p, arrangement: 'single', instances: [...list, { id: Date.now(), angle }] };
    });
  }

  function handlePipingSetInstanceAngle(tierIndex, zone, index, angle) {
    updateRing(tierIndex, zone, (p) => ({
      ...p,
      instances: (p.instances ?? []).map((x, idx) => idx === index ? { ...x, angle } : x),
    }));
  }

  function handlePipingRemoveInstance(tierIndex, zone, index) {
    updateRing(tierIndex, zone, (p) => {
      const next = (p.instances ?? []).filter((_, idx) => idx !== index);
      // Single mode is never empty — re-seed one piece at the front if the last was removed.
      return { ...p, instances: next.length ? next : [{ id: Date.now(), angle: PIPING_FRONT_ANGLE }] };
    });
  }

  // Add (at config defaults) or remove the current card's piping on a ring. isOn = the
  // ring currently has this element's layer (so the toggle removes it); else add it.
  function togglePipingZone(tierIndex, zone, isOn) {
    if (isOn) {
      const existing = ringPiping(tierIndex, zone);
      if (!existing) return;
      removePipingLayer(tierIndex, zone, existing.layerId);
      // If that was this card's last piping anywhere, drop its card from the stack too.
      const cardId = pipingPopupEl?.cardId;
      const stillOn = design.tiers.some((t, i) =>
        (t.topPipings ?? []).some(p => p.cardId === cardId && !(zone === 'rim' && i === tierIndex && p.layerId === existing.layerId)) ||
        (t.bottomPipings ?? []).some(p => p.cardId === cardId && !(zone === 'board' && i === tierIndex && p.layerId === existing.layerId))
      );
      if (!stillOn) dropPipingCard(cardId);
    } else {
      addRingLayer(tierIndex, zone, buildRingPiping(zone, tierIndex));
    }
  }

  async function openTemplates() {
    const isOpening = !templatesOpen;
    setTemplatesOpen(isOpening);
    setElementsOpen(false);
    if (!isOpening) return;
    setTemplatesLoading(true);
    if (apiClient) {
      const data = await apiClient.fetchTemplates().catch(() => []);
      setTemplates(data ?? []);
    } else {
      const { data, error } = await supabase
        .from('cake_templates')
        .select('id, name, offering, tier_count, thumbnail_url, created_at, template_tags(tags(slug)), cake_template_attrs(min_weight_kg, min_age, max_age)')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at', { ascending: false });
      setTemplates(error ? [] : (data ?? []).map(({ template_tags, cake_template_attrs, ...t }) => {
        const rawAttrs = cake_template_attrs;
        return {
          ...t,
          tag_slugs: (template_tags ?? []).map(r => r.tags?.slug).filter(Boolean),
          attrs: Array.isArray(rawAttrs) ? (rawAttrs[0] ?? null) : (rawAttrs ?? null),
        };
      }));
    }
    setTemplatesLoading(false);
  }

const selectedText = design.texts.find(t => t.id === selectedTextId) ?? null;

  // ── Color helpers ─────────────────────────────────────────────────────────
  function getCurrentColor() {
    if (!selectedEl) return '#f5b8c8';
    if (selectedEl.type === 'tier') return design.tiers[selectedEl.index]?.color ?? '#f5b8c8';
    if (selectedEl.type === 'piping') {
      const t = design.tiers[selectedEl.tierIndex];
      const arr = selectedEl.zone === 'top' ? t?.topPipings : t?.bottomPipings;
      return (arr?.find(p => p.layerId === selectedEl.layerId) ?? arr?.[0])?.color ?? '#f5e6c8';
    }
    if (selectedEl.type === 'text') return selectedText?.color ?? '#ffffff';
    if (selectedEl.type === 'sticker') return design.stickers.find(s => s.id === selectedEl.id)?.color ?? '#ffffff';
    return '#f5b8c8';
  }

  function handleColorChange(c) {
    if (!selectedEl) return;
    if (selectedEl.type === 'tier') { setTierColor(selectedEl.index, c); return; }
    if (selectedEl.type === 'piping') {
      const { tierIndex, zone } = selectedEl;
      const z = zone === 'top' ? 'rim' : 'board';
      if (selectedEl.layerId != null) updatePipingLayer(tierIndex, z, selectedEl.layerId, p => ({ ...p, color: c }));
      return;
    }
    if (selectedEl.type === 'text') updateText(selectedEl.id, { color: c });
    if (selectedEl.type === 'sticker') updateSticker(selectedEl.id, { color: c });
  }

  function handleDelete() {
    if (!selectedEl && selectedStickerIds.size === 0) return;
    if (selectedEl?.type === 'piping') {
      const z = selectedEl.zone === 'top' ? 'rim' : 'board';
      if (selectedEl.layerId != null) removePipingLayer(selectedEl.tierIndex, z, selectedEl.layerId);
    } else if (selectedEl?.type === 'text') {
      removeText(selectedEl.id);
    } else if (selectedStickerIds.size > 0) {
      selectedStickerIds.forEach(id => removeSticker(id));
      setSelectedStickerIds(new Set());
    } else if (selectedEl?.type === 'topper') {
      setTopper(null);
    }
    setSelectedEl(null);
    setColorOpen(false);
  }

  // ── Popup management — add new popups here to participate in mutual exclusion ──
  function closeAllPopups() {
    setPipingPopupOpen(false);
    setColorOpen(false);
  }

  // ── Selection handlers ────────────────────────────────────────────────────
  function clearAllSelections() {
    setSelectedEl(null);
    setColorOpen(false);
    setSelectedStickerIds(new Set());
    setMultiSelectMode(false);
  }

  function handleDeselect() { clearAllSelections(); }

  function handleTierClick(i) {
    closeAllPopups();
    setSelectedEl(prev => (prev?.type === 'tier' && prev.index === i) ? null : { type: 'tier', index: i });
  }

  function handleTextSelect(id) {
    setSelectedEl({ type: 'text', id });
    setColorOpen(false);
  }

  // Clicking a ring on the cake opens the card that owns it (matched by cardId). Layers from
  // before instances existed (templates) carry no cardId — backfill one so the card binds.
  function openCardForLayer(tierIndex, zone, piping) {
    const cardId = piping.cardId ?? crypto.randomUUID();
    if (!piping.cardId) updatePipingLayer(tierIndex, zone, piping.layerId, p => ({ ...p, cardId }));
    const el = pipingElementById[piping.id] ?? { id: piping.id, name: piping.name, image_url: piping.glbUrl, thumbnail_url: null };
    openPipingPopup(el, { cardId });
  }

  function handleTopPipingSelect(tierIndex, layerId) {
    const arr = design.tiers[tierIndex]?.topPipings ?? [];
    const piping = arr.find(p => p.layerId === layerId) ?? arr[0];
    if (piping) openCardForLayer(tierIndex, 'rim', piping);
  }

  function handleBottomPipingSelect(tierIndex, layerId) {
    const arr = design.tiers[tierIndex]?.bottomPipings ?? [];
    const piping = arr.find(p => p.layerId === layerId) ?? arr[0];
    if (piping) openCardForLayer(tierIndex, 'board', piping);
  }

  function handleTopperClick() {
    if (!design.topper) return;
    setSelectedEl(prev => prev?.type === 'topper' ? prev : { type: 'topper' });
    setColorOpen(false);
  }

  function handleStickerSelect(id, ctrlKey = false) {
    const sticker = design.stickers.find(s => s.id === id);

    if (ctrlKey || multiSelectMode) {
      setMultiSelectMode(true);
      setSelectedStickerIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) { next.delete(id); } else { next.add(id); }
        const primaryId = next.has(id) ? id : ([...next][next.size - 1] ?? null);
        setSelectedEl(primaryId ? { type: 'sticker', id: primaryId } : null);
        return next;
      });
      setColorOpen(false);
      return;
    }

    if (sticker?.groupId) {
      // Auto-select all stickers in this group
      const groupIds = new Set(
        design.stickers.filter(s => s.groupId === sticker.groupId).map(s => s.id)
      );
      setSelectedStickerIds(groupIds);
      setSelectedEl({ type: 'sticker', id });
    } else {
      // Toggle single selection
      const isOnly = selectedStickerIds.size === 1 && selectedStickerIds.has(id);
      setSelectedStickerIds(isOnly ? new Set() : new Set([id]));
      setSelectedEl(isOnly ? null : { type: 'sticker', id });
    }
    setColorOpen(false);
  }

  function handleStickerLongPress(id) {
    setMultiSelectMode(true);
    setSelectedStickerIds(new Set([id]));
    setSelectedEl({ type: 'sticker', id });
    setColorOpen(false);
  }

  function handleGroupMove(groupId, startPositions, delta) {
    moveGroupStickers(groupId, startPositions, delta);
  }

  function handleStickerMove(id, changes) {
    updateSticker(id, changes);
  }

  function handleElementDrop(element, hit) {
    let placementMode = element.placement_config?.[hit.zone];
    if (!placementMode && Object.values(element.placement_config ?? {}).includes('faux_ball_single')) {
      placementMode = 'faux_ball_single';
    }

    const imageTopperTypeId = elementTypes.find(et => et.slug === 'image_topper')?.id;
    const isImageTopper = element.element_type_id === imageTopperTypeId;

    // First image topper on an empty top surface → center it; subsequent ones → drop at cursor.
    const hasTopperOnTier = isImageTopper && hit.zone === 'top_surface' &&
      design.stickers.some(s => s.zone === 'top_surface' && s.tierIndex === hit.tierIndex && s.placementMode === 'stand');
    const effectiveHit = (isImageTopper && hit.zone === 'top_surface' && !hasTopperOnTier)
      ? { ...hit, x: 0, z: 0 }
      : hit;

    addSticker(element, effectiveHit.zone, effectiveHit.tierIndex, placementMode ?? 'hug', effectiveHit);
    setElementsOpen(false);

    if (isImageTopper && hit.zone === 'top_surface') {
      snapCameraRef.current?.([0, 5.5, 8.7]);
    }
  }

  function startTopperDrag(topper, startX, startY) {
    setDragGhost({ x: startX, y: startY, el: topper, canDrop: false });
    function onMove(e) {
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      setDragGhost({ x: e.clientX, y: e.clientY, el: topper, canDrop: !!hit });
    }
    function onUp(e) {
      setDragGhost(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      if (hit) {
        if (topper.image_url) preloadTopper(topper.image_url);
        setTopper(topper);
        setSelectedEl({ type: 'topper' });
        setElementsOpen(false);
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function startStickerDrag(el, startX, startY) {
    dragStickerRef.current = el;
    setDragGhost({ x: startX, y: startY, el, canDrop: false });

    function onMove(e) {
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      setDragGhost({ x: e.clientX, y: e.clientY, el, canDrop: !!hit });
    }
    function onUp(e) {
      setDragGhost(null);
      dragStickerRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      if (hit) handleElementDrop(el, hit);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handlePipingStyleSelect(element) {
    if (!pipingTarget) return;
    const { tierIndex, zone } = pipingTarget;
    const isTop = zone === 'top';
    const piping = {
      id: element.id, cardId: crypto.randomUUID(), glbUrl: element.glbUrl, name: element.name, color: '#f5e6c8',
      ...pipingPlacementFromConfig(element.placement_config, isTop),
    };
    if (isTop) { const ro = nextRimRadialOffset(tierIndex); if (ro) piping.userRadialOffset = ro; }
    else piping.userYOffset = piping.bend ? nextFestoonYOffset(tierIndex, piping) : nextBoardYOffset(tierIndex);
    addPipingLayer(tierIndex, isTop ? 'rim' : 'board', piping);
    setPipingTarget(null);
  }

  useEffect(() => {
    if (selectedEl?.type === 'text' && textInputRef.current) {
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  }, [selectedEl?.type === 'text' ? selectedEl.id : null]);


  function handleNewCake() {
    resetDesign();
    clearAllSelections();
    setEditingOrder(null);
    setElementsOpen(false);
    setTemplatesOpen(false);
  }

  function handlePanelDrag(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = mobilePanelHeight;
    function onMove(ev) {
      const delta = startY - ev.clientY; // drag up → taller panel
      setMobilePanelHeight(Math.min(560, Math.max(80, startH + delta)));
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handleOrder() {
    setOrderModalOpen(true);
  }

  async function handleOrderSubmit(formData) {
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const thumbnailBlob = await new Promise(resolve => {
      if (!thumbCanvas) return resolve(null);
      thumbCanvas.toBlob(blob => resolve(blob ?? null), 'image/png');
    });

    // Upload thumbnail directly to R2 via signed URL — never send base64 in JSON body
    let designThumbnailKey = null;
    if (thumbnailBlob && apiClient?.getSignedUploadUrl) {
      try {
        const filename = `${crypto.randomUUID()}.png`;
        const { url, key } = await apiClient.getSignedUploadUrl('orders/thumbnails', filename, 'image/png');
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: thumbnailBlob });
        designThumbnailKey = key;
      } catch (_) { /* thumbnail upload failure is non-fatal */ }
    }

    const ot0 = design.tiers[0];
    const orderShape = ot0?.shape === 'rect'
      ? (Math.abs((ot0.width ?? 0) - (ot0.depth ?? 0)) < 1e-3 ? 'square' : 'rectangle')
      : 'round';
    const designSnapshot = {
      shape: orderShape,
      tiers: design.tiers.map(t => ({
        color:        t.color,
        topPipings:    t.topPipings    ?? [],
        bottomPipings: t.bottomPipings ?? [],
        decorations:  [],
        texts:        [],
        ...(t.radius != null && { radius: t.radius }),
        ...(t.height != null && { height: t.height }),
        ...(t.shape   != null && { shape: t.shape }),
        ...(t.width   != null && { width: t.width }),
        ...(t.depth   != null && { depth: t.depth }),
        ...(t.cornerR != null && { cornerR: t.cornerR }),
      })),
      texts:    design.texts,
      stickers: design.stickers,
      topper:   design.topper ?? null,
      writing:  design.writing ?? null,   // typed cream lettering — was being dropped on order
      piping:   design.piping ?? [],       // freehand cream-pen strokes
    };

    if (editingOrder) {
      const payload = { designSnapshot, designThumbnailKey, comment: formData.comment };
      if (apiClient?.updateOrderDesign) return await apiClient.updateOrderDesign(editingOrder.id, payload);
      if (onOrder)                       return await onOrder({ ...payload, mode: 'update_design', orderId: editingOrder.id });
      return;
    }

    const payload = { ...formData, designSnapshot, designThumbnailKey };
    if (apiClient?.placeOrder) return await apiClient.placeOrder(payload);
    if (onOrder)               return await onOrder(payload);
  }

  const creamPipingType   = elementTypes.find(et => et.slug === 'cream_piping');
  const pipingPatternType = elementTypes.find(et => et.slug === 'piping_pattern');
  const creamPipingEls    = otherElementsDb[creamPipingType?.id] ?? [];
  const pipingPatternEls  = otherElementsDb[pipingPatternType?.id] ?? [];

  // Resolve a building-block element id → its element (image_url already full from the API).
  const pipingBlockById = Object.fromEntries(creamPipingEls.map(e => [e.id, e]));
  // Any piping element the baker can pick (for re-opening from a 3D click).
  const pipingElementById = Object.fromEntries([...creamPipingEls, ...pipingPatternEls].map(e => [e.id, e]));

  // Resolve the A/B GLB urls for a piping element. A pattern references blocks via
  // placement_config.parts[]; a plain block uses its own image_url. Returns nulls when a
  // referenced block is missing/inactive so callers can skip it (defensive).
  function resolvePipingGlbs(el) {
    const parts = el?.placement_config?.parts;
    if (Array.isArray(parts) && parts.length) {
      const a = pipingBlockById[parts[0]?.element_id];
      const b = pipingBlockById[parts[1]?.element_id] ?? a;
      return { glbUrl: a?.image_url ?? null, altGlbUrl: b?.image_url ?? a?.image_url ?? null };
    }
    return { glbUrl: el?.image_url ?? null, altGlbUrl: el?.placement_config?.bottom_alt_glb_url ?? el?.placement_config?.top_alt_glb_url ?? null };
  }

  // Picker list: plain (non pattern-only) blocks + patterns whose first part resolves.
  const pipingPickerEls = [
    ...creamPipingEls.filter(el => el.placement_config?.pattern_only !== true),
    ...pipingPatternEls.filter(el => pipingBlockById[el.placement_config?.parts?.[0]?.element_id]?.image_url),
  ];

  // Sync placement_config-derived fields from DB into any already-applied piping
  useEffect(() => {
    if (!creamPipingEls.length && !pipingPatternEls.length) return;
    const placementById = Object.fromEntries(
      [...creamPipingEls, ...pipingPatternEls].map(e => [e.id, {
        top:    pipingPlacementFromConfig(e.placement_config, true),
        bottom: pipingPlacementFromConfig(e.placement_config, false),
      }])
    );
    // Merge config-derived ring fields, but treat arrangement/instances as seed-once:
    // preserve whatever the customer/template already chose, only fill from config when absent.
    const mergePlacement = (current, next) => {
      const { arrangement: cfgArr, instances: cfgInst, ...rest } = next;
      return {
        ...current,
        ...rest,
        arrangement: current.arrangement ?? cfgArr ?? 'ring',
        ...(current.instances ? {} : (cfgInst ? { instances: cfgInst } : {})),
      };
    };
    design.tiers.forEach((tier, i) => {
      (tier.topPipings ?? []).forEach(p => {
        const top = placementById[p.id]?.top;
        if (top && pipingPlacementChanged(p, top, true))
          updatePipingLayer(i, 'rim', p.layerId, cur => mergePlacement(cur, top));
      });
      (tier.bottomPipings ?? []).forEach(p => {
        const bottom = placementById[p.id]?.bottom;
        if (bottom && pipingPlacementChanged(p, bottom, false))
          updatePipingLayer(i, 'board', p.layerId, cur => mergePlacement(cur, bottom));
      });
    });
  }, [creamPipingEls, pipingPatternEls]);

  const tierPanelVisible = selectedEl?.type === 'tier';
  const currentColor = getCurrentColor();
  // Right panel shows when: tier selected (always), or color picker opened, or topper selected (resize)
  const selectedStickerIsFauxBall = selectedEl?.type === 'sticker' &&
    (design.stickers.find(s => s.id === selectedEl.id)?.placementMode === 'faux_ball_single');
  const showRightPanel = tierPanelVisible
    || (caps?.color && colorOpen)
    || selectedStickerIsFauxBall;

  // ── Caps-driven floating toolbar (text + piping) ──────────────────────────
  function buildToolbar(el) {
    if (!el) return null;
    const c = el.type === 'tier'    ? TIER_CAPS
            : el.type === 'topper'  ? TOPPER_CAPS
            : el.type === 'sticker' ? (design.stickers.find(s => s.id === el.id)?.allowedActions ?? STICKER_CAPS)
            : (allowedActionsBySlug[el.type] ?? null);
    if (!c) return null;
    const items = [];

    if (c.color) {
      items.push(
        <button key="color"
          style={{ ...s.swatchBtn, background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 3, border: colorOpen ? '2.5px solid #6c47ff' : 'none' }}
          onClick={() => { const opening = !colorOpen; closeAllPopups(); if (opening) setColorOpen(true); }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: getCurrentColor() }} />
        </button>,
        <div key="d1" style={s.tbDivider} />
      );
    }

    if (c.fontSize && el.type === 'text') {
      const fs = selectedText?.fontSize ?? 0.2;
      items.push(
        <button key="fs-" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.max(0.10, +((fs) - 0.03).toFixed(2)) })}>−</button>,
        <span key="fs-val" style={s.tbSizeLabel}>{Math.round(fs * 100)}</span>,
        <button key="fs+" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.min(0.45, +((fs) + 0.03).toFixed(2)) })}>+</button>,
        <div key="d3" style={s.tbDivider} />
      );
    }

    if (c.resize && el.type === 'topper') {
      const sc = design.topper?.scale ?? 1;
      items.push(
        <button key="tp-" style={s.tbIconBtn} onClick={() => setTopperScale(Math.max(0.25, +(sc - 0.15).toFixed(2)))}>−</button>,
        <button key="tp+" style={s.tbIconBtn} onClick={() => setTopperScale(Math.min(4, +(sc + 0.15).toFixed(2)))}>+</button>,
        <div key="d-tp" style={s.tbDivider} />
      );
    }

    if (c.resize && el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      const sc = sticker?.scale ?? 1;
      const SC_MIN = 25, SC_MAX = 600;
      const scPct = Math.min(100, Math.max(0, ((Math.round(sc * 100) - SC_MIN) / (SC_MAX - SC_MIN)) * 100));
      function scFromEvent(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        return (SC_MIN + Math.round(ratio * (SC_MAX - SC_MIN) / 5) * 5) / 100;
      }
      items.push(
        <div key="sc-slider" style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:9, fontWeight:700, color:'#888', letterSpacing:0.3 }}>Size</span>
          <div
            style={{ width:80, position:'relative', height:20, display:'flex', alignItems:'center', cursor:'pointer', touchAction:'none', userSelect:'none' }}
            onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); updateSticker(el.id, { scale: scFromEvent(e) }); }}
            onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); updateSticker(el.id, { scale: scFromEvent(e) }); }}
            onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
            onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
          >
            <div style={{ width:'100%', height:4, borderRadius:2, background:'#e0e0e0', position:'relative' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${scPct}%`, background:'#9b5268', borderRadius:2 }} />
            </div>
            <div style={{ position:'absolute', left:`${scPct}%`, transform:'translateX(-50%)', width:14, height:14, borderRadius:'50%', background:'#9b5268', pointerEvents:'none' }} />
          </div>
          <span style={{ fontSize:11, fontWeight:700, color:'#333', minWidth:30 }}>{Math.round(sc * 100)}%</span>
        </div>,
        <div key="d4" style={s.tbDivider} />
      );
      const isGlbTop = sticker?.zone === 'top_surface' && /\.(glb|gltf)(\?|$)/i.test(sticker?.imageUrl ?? '');
      if (isGlbTop) {
        const yo = sticker?.yOffset ?? 0;
        items.push(
          <button key="ht-dn" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.max(0, +(yo - 0.1).toFixed(2)) })}>↓</button>,
          <button key="ht-up" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.min(1.2, +(yo + 0.1).toFixed(2)) })}>↑</button>,
          <div key="d-ht" style={s.tbDivider} />
        );
      }
      // Depth (radialOffset) — side stickers only
      const isSide = sticker?.zone === 'side' || sticker?.zone === 'middle_tier';
      if (isSide) {
        const ro = sticker?.radialOffset ?? 0;
        items.push(
          <span key="ro-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Depth</span>,
          <button key="ro-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.max(0, +(ro - 0.05).toFixed(2)) })}>−</button>,
          <button key="ro+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.min(0.6, +(ro + 0.05).toFixed(2)) })}>+</button>,
          <div key="d-ro" style={s.tbDivider} />
        );
      }
      // Tilt — all stickers
      {
        const ta = sticker?.tiltAngle ?? 0;
        items.push(
          <span key="ta-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Tilt</span>,
          <button key="ta-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { tiltAngle: Math.max(-1.2, +((ta) - 0.1).toFixed(3)) })}>−</button>,
          <span key="ta-val" style={{ ...s.tbSizeLabel, minWidth: 28 }}>{Math.round(ta * 180 / Math.PI)}°</span>,
          <button key="ta+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { tiltAngle: Math.min(1.2, +((ta) + 0.1).toFixed(3)) })}>+</button>,
          <div key="d-ta" style={s.tbDivider} />
        );
      }
      // Spin (rotation) — top_surface stand stickers only
      if (sticker?.zone === 'top_surface' && sticker?.placementMode === 'stand') {
        const rot = sticker?.rotation ?? 0;
        items.push(
          <span key="sp-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Spin</span>,
          <button key="sp-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot - 0.2).toFixed(3) })}>↺</button>,
          <button key="sp+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot + 0.2).toFixed(3) })}>↻</button>,
          <div key="d-sp" style={s.tbDivider} />
        );
      }
      // Group / Ungroup
      const isGrouped = !!sticker?.groupId;
      if (isGrouped) {
        items.push(
          <button key="ungroup" style={{ ...s.tbIconBtn, fontSize: 11, color: '#9b5f72' }}
            onClick={() => { ungroupStickers(sticker.groupId); clearAllSelections(); }}>
            Ungroup
          </button>,
          <div key="d-ug" style={s.tbDivider} />
        );
      }
    }

    if (c.duplicate && el.type === 'text') {
      items.push(
        <button key="dup" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateText(el.id); setSelectedEl(null); }}>Duplicate</button>
      );
    }

    if (c.duplicate && el.type === 'sticker') {
      const sticker = design.stickers.find(s => s.id === el.id);
      if (!sticker?.groupId) {
        items.push(
          <button key="dup-sticker" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateSticker(el.id); clearAllSelections(); }}>Duplicate</button>
        );
      }
    }

    if (c.delete) {
      const label = selectedStickerIds.size > 1 ? 'Remove all' : 'Remove';
      items.push(
        <button key="del" style={{ ...s.tbIconBtn, color: '#e53935', fontSize: 11 }} onClick={handleDelete}>{label}</button>
      );
    }

    items.push(
      <button key="ok" style={{ ...s.tbIconBtn, color: '#6c47ff', fontWeight: 700, fontSize: 11 }}
        onClick={() => { clearAllSelections(); }}>Done</button>
    );

    return <div style={s.textToolbar}>{items}</div>;
  }

  if (!bakerReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5', fontFamily: "'Quicksand', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ color: '#999', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>Loading…</div>
      </div>
    );
  }

  // Block access if subscription is expired or cancelled
  const blockedStatuses = ['expired', 'cancelled', 'paused'];
  if (bakerData && blockedStatuses.includes(bakerData.subscription_status)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F4F8F5', fontFamily: "'Quicksand', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
            {bakerData.subscription_status === 'expired' ? 'Your trial has ended' : 'Subscription inactive'}
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
            Choose a plan to continue using Spattoo. Start free with Spark or unlock more with a paid plan.
          </div>
          <button
            onClick={() => setBillingPanelOpen(true)}
            style={{
              padding: '14px 32px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
              color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}
          >
            View Plans
          </button>
          <BillingPanel
            open={billingPanelOpen}
            onClose={() => setBillingPanelOpen(false)}
            apiClient={apiClient}
            primaryColor={primaryColor}
            accentColor={accentColor}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.page, animation: 'spattooFadeIn 0.35s ease' }}>
      <style>{`@keyframes spattooFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Mobile header ── */}
      {isMobile && (
        <div style={s.mobileHeader}>
          <div style={s.topLogo}>
            {bakerData?.logo_url
              ? <img src={bakerData.logo_url} alt="" style={s.topLogoImg} />
              : <div style={s.topLogoText}>{bakerData?.name ?? 'My Bakery'}</div>
            }
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button
                style={{ ...s.sidebarBtn, color: settingsOpen ? '#1a1a1a' : '#555', background: settingsOpen ? 'rgba(0,0,0,0.06)' : 'none', width: 38, height: 38 }}
                onClick={() => { setSettingsOpen(o => !o); setProfileOpen(false); }}>
                <GearIcon size={18} />
              </button>
              {settingsOpen && (
                <div style={{ ...s.dropdown, left: 'auto', right: 0, top: 'calc(100% + 8px)' }}>
                  <div style={s.dropdownSection}>Settings</div>
                  <button style={s.dropdownItem} onClick={() => { setSettingsPanelOpen(true); setSettingsOpen(false); }}>Store Settings</button>
                  <button style={s.dropdownItem} onClick={() => { setBillingPanelOpen(true); setSettingsOpen(false); }}>Billing</button>
                  <button style={s.dropdownItem} onClick={() => { setColorGuideOpen(true); setSettingsOpen(false); }}>Color Guide</button>
                  <button style={s.dropdownItem} onClick={() => { setAddUserModal(true); setSettingsOpen(false); }}>Add User</button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }} ref={profileRef}>
              <button style={{ ...s.sidebarProfileBtn, background: primaryColor }}
                onClick={() => { setProfileOpen(o => !o); setSettingsOpen(false); }}>
                {initials}
              </button>
              {profileOpen && (
                <div style={{ ...s.dropdown, left: 'auto', right: 0, top: 'calc(100% + 8px)' }}>
                  <div style={s.dropdownUserInfo}>
                    <div style={s.dropdownName}>{userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'My Account'}</div>
                    {userData?.email && <div style={s.dropdownEmail}>{userData.email}</div>}
                  </div>
                  <div style={s.dropdownDivider} />
                  <button style={s.dropdownItem} onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>Change Password</button>
                  <button style={s.dropdownItem} onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ ...s.main, ...(isMobile ? { flexDirection: 'column' } : {}) }}>

        {/* ── Left column: logo + sidebar ── */}
        {!isMobile && <div style={s.leftCol}>
          {/* Logo sits above the dark pill */}
          <div style={s.topLogo}>
            {bakerData?.logo_url
              ? <img src={bakerData.logo_url} alt="" style={s.topLogoImg} />
              : <div style={s.topLogoText}>{bakerData?.name ?? 'My Bakery'}</div>
            }
          </div>

        {/* ── Sidebar ── */}
        <div style={s.sidebar}>
          <nav style={s.sidebarNav}>
            {[
              { id: 'new',        label: 'New Cake',  icon: null },
              { id: 'dashboard',  label: 'Dashboard', icon: <DashboardIcon size={20} /> },
              { id: 'templates',  label: 'Templates', icon: <TemplatesIcon size={20} /> },
              { id: 'elements',   label: 'Decorations', icon: <ElementsIcon size={20} /> },
              { id: 'orders',     label: 'Orders',    icon: <OrdersIcon size={20} /> },
              { id: 'customers',  label: 'Customers', icon: <CustomersIcon size={20} /> },
            ].map(({ id, label, icon }) => {
              const active = id === 'elements' ? elementsOpen : id === 'templates' ? templatesOpen : id === 'tools' ? toolsOpen : false;
              const isNew  = id === 'new';
              return (
                <button key={id} style={s.navItem}
                  onClick={() => {
                    if (id === 'new')       handleNewCake();
                    if (id === 'elements')  openElements();
                    if (id === 'tools')     openTools();
                    if (id === 'templates') openTemplates();
                    if (id === 'dashboard') setDashboardOpen(true);
                    if (id === 'orders')    setOrdersPanelOpen(true);
                    if (id === 'customers') setCustomersPanelOpen(true);
                  }}>
                  <span style={{ ...s.sidebarBtn, ...(isNew ? { borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.45)', color: '#fff' } : {}), ...(active ? s.sidebarBtnActive : {}) }}>
                    {isNew
                      ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      : icon}
                  </span>
                  <span style={{ ...s.navLabel, ...(active ? { color: '#fff' } : {}) }}>{label}</span>
                </button>
              );
            })}
          </nav>

          <div style={{ flex: 1 }} />

          <div style={s.sidebarDivider} />

          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <SidebarTooltip label="Settings">
                <button
                  style={{ ...s.sidebarBtn, ...(settingsOpen ? s.sidebarBtnActive : {}) }}
                  onClick={() => { setSettingsOpen(o => !o); setProfileOpen(false); }}>
                  <GearIcon size={18} />
                </button>
              </SidebarTooltip>
              {settingsOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropdownSection}>Settings</div>
                  <button style={s.dropdownItem}
                    onClick={() => { setSettingsPanelOpen(true); setSettingsOpen(false); }}>
                    Store Settings
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { setBillingPanelOpen(true); setSettingsOpen(false); }}>
                    Billing
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { setColorGuideOpen(true); setSettingsOpen(false); }}>
                    Color Guide
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { setAddUserModal(true); setSettingsOpen(false); }}>
                    Add User
                  </button>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }} ref={profileRef}>
              <SidebarTooltip label={userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'Profile'}>
                <button
                  style={{ ...s.sidebarProfileBtn, background: primaryColor }}
                  onClick={() => { setProfileOpen(o => !o); setSettingsOpen(false); }}>
                  {initials}
                </button>
              </SidebarTooltip>
              {profileOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropdownUserInfo}>
                    <div style={s.dropdownName}>
                      {userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'My Account'}
                    </div>
                    {userData?.email && <div style={s.dropdownEmail}>{userData.email}</div>}
                  </div>
                  <div style={s.dropdownDivider} />
                  <button style={s.dropdownItem}
                    onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>
                    Change Password
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>}{/* end leftCol */}

        {/* ── Elements flyout ── */}
        {elementsOpen && (
          <div style={{ ...s.flyout, ...(isMobile ? { ...s.flyoutMobile, height: mobilePanelHeight } : {}) }}>
            {isMobile && (
              <div style={s.panelHandle} onPointerDown={handlePanelDrag}>
                <div style={s.panelHandlePill} />
              </div>
            )}
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Elements</span>
              <button style={s.iconBtn} onClick={() => setElementsOpen(false)}>✕</button>
            </div>

            {/* Search */}
            <input
              value={elemSearch}
              onChange={e => setElemSearch(e.target.value)}
              placeholder="Search elements…"
              style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #f0dce3', borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box', background: '#fdf9fa', flexShrink: 0 }}
            />

            <div style={s.flyoutScroll}>
            {elementTypesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}

            {/* Cream piping — thumbnail grid, tap a style to open popup */}
            {pipingPickerEls.length > 0 && (() => {
              const q = elemSearch.trim().toLowerCase();
              const visiblePipingEls = q ? pipingPickerEls.filter(el => `${el.name ?? ''} ${el.description ?? ''}`.toLowerCase().includes(q)) : pipingPickerEls;
              if (q && visiblePipingEls.length === 0) return null;
              return (
              <div style={{ ...s.elementCard, cursor: 'default' }}>
                <div style={s.elementCardLabel}>Cream Piping</div>
                {visiblePipingEls.length === 0 && (
                  <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No styles yet</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {visiblePipingEls.map(el => {
                    const isActive = design.tiers.some(t => (t.topPipings ?? []).some(p => p.id === el.id) || (t.bottomPipings ?? []).some(p => p.id === el.id));
                    return (
                      <div key={el.id} onClick={() => openPipingPopup(el)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{
                          width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                          background: '#fff',
                          border: `1.5px solid ${isActive ? '#9b5f72' : '#f0dce3'}`,
                          boxShadow: isActive ? '0 0 0 2px rgba(155,95,114,0.18)' : 'none',
                        }}>
                          {el.thumbnail_url && <img src={cfImg(el.thumbnail_url, 64, 64, cfAssetsBase)} alt={el.name} width={64} height={64} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#9b5f72' : '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {/* All other element types */}
            {(() => {
              const q = elemSearch.trim().toLowerCase();
              const filterEl = els => !q ? els : els.filter(el => {
                const hay = `${el.name ?? ''} ${el.description ?? ''}`.toLowerCase();
                return hay.includes(q);
              });
              return elementTypes
                .filter(et => et.slug !== 'cream_piping' && et.slug !== 'piping_pattern' && activeElementTypeIds.has(et.id))
                .map(et => (
                  <ElementTypeCard
                    key={et.id}
                    elementType={et}
                    design={design}
                    toppersDb={filterEl(toppersDb)}
                    scatteredDecorElements={filterEl(scatteredDecorDb)}
                    picksElements={filterEl(picksDb)}
                    imageTopperElements={filterEl(imageTopperDb)}
                    otherElements={filterEl(otherElementsDb[et.id] ?? [])}
                    onDragStartSticker={(el, x, y) => startStickerDrag(el, x, y)}
                    onDragStartTopper={(t, x, y) => startTopperDrag(t, x, y)}
                    onSetTopper={(t) => {
                      if (t) {
                        if (t.image_url) preloadTopper(t.image_url);
                        setTopper(t);
                        setSelectedEl({ type: 'topper' });
                        setElementsOpen(false);
                      } else {
                        setTopper(null);
                      }
                    }}
                    cfAssetsBase={cfAssetsBase}
                  />
              ));
            })()}

            {/* Cream pen + texts — code-level decoration sections (not DB element types), shown
                last. Tapping opens the editor in the same flyout slot; its back arrow returns here. */}
            {!elemSearch.trim() && (
              <>
                <button
                  onClick={() => { setToolsOpen(true); setActiveTool('pen'); }}
                  style={{ ...s.elementCard, flexDirection: 'row', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fbeef2', flexShrink: 0 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#444' }}>Cream Pen</div>
                    <div style={{ fontSize: 10, color: '#888' }}>Draw cream freehand on the cake</div>
                  </div>
                </button>
                <button
                  onClick={() => { setToolsOpen(true); setActiveTool('cream-pen'); if (!design.writing) setWriting({ font: DEFAULT_CREAM_FONT }); }}
                  style={{ ...s.elementCard, flexDirection: 'row', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fbeef2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9b5f72', flexShrink: 0 }}>
                    <TextIcon size={22} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#444' }}>Texts</div>
                    <div style={{ fontSize: 10, color: '#888' }}>Write a name in piped cream</div>
                  </div>
                </button>
              </>
            )}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Cream Pen / Texts editor — a RIGHT-side popup (desktop) like the cream-piping
              popup, so the Decorations panel stays open on the left and the pen can be used
              alongside other cream elements. On mobile it stays a bottom sheet. ── */}
        {toolsOpen && (
          <div style={{ ...s.flyout, ...(isMobile
            ? { ...s.flyoutMobile, height: mobilePanelHeight }
            : { left: 'auto', right: 10, top: 12, bottom: 'auto', width: 256, margin: 0, borderRadius: 16,
                maxHeight: 'min(calc(100% - 24px), calc(100vh - 96px))' }) }}>
            {isMobile && (
              <div style={s.panelHandle} onPointerDown={handlePanelDrag}>
                <div style={s.panelHandlePill} />
              </div>
            )}
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>
                {activeTool === 'pen' ? 'Cream Pen' : 'Texts'}
              </span>
              <button style={s.iconBtn} onClick={() => { setToolsOpen(false); setActiveTool(null); }}>✕</button>
            </div>

            <div style={s.flyoutScroll}>
              {/* Cream Pen (freehand) editor */}
              {activeTool === 'pen' && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
                    Drag on the cake to pipe cream — release to stop. Drag the empty space around it to rotate.
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>Cream colour</div>
                  <ColorWheel color={penStyle.color} onChange={c => setPenStyle(ps => ({ ...ps, color: c }))}
                    cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== penStyle.color.toLowerCase())} width={208} />

                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>Adjust</div>
                  <PenSlider label="Thickness" value={penStyle.thickness} min={0.008} max={0.16} step={0.004} onChange={v => setPenStyle(ps => ({ ...ps, thickness: v }))} fmt={v => v.toFixed(3)} />
                  <PenSlider label="Softness"  value={penStyle.softness}  min={0}     max={1}    step={0.05}  onChange={v => setPenStyle(ps => ({ ...ps, softness: v }))}  fmt={v => v.toFixed(2)} />

                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b8c74', marginTop: 8 }}>
                    {design.piping.length} stroke{design.piping.length === 1 ? '' : 's'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={removeStroke} disabled={!design.piping.length}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #f0dce3', background: '#fff', fontWeight: 700, fontSize: 12,
                        color: design.piping.length ? '#9b5f72' : '#ccc', cursor: design.piping.length ? 'pointer' : 'not-allowed' }}>
                      ↶ Undo
                    </button>
                    <button onClick={clearPiping} disabled={!design.piping.length}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #f0dce3', background: '#fff', fontWeight: 700, fontSize: 12,
                        color: design.piping.length ? '#b56' : '#ccc', cursor: design.piping.length ? 'pointer' : 'not-allowed' }}>
                      Clear all
                    </button>
                  </div>
                </>
              )}

              {/* Texts editor (typed cream writing) */}
              {activeTool === 'cream-pen' && (() => {
                const w = design.writing ?? {};
                const isMultiline = (w.text ?? '').includes('\n');
                const surface = w.surface ?? 'top';
                const SURFACES = [{ k: 'top', label: 'Top' }, { k: 'side', label: 'Side' }, { k: 'board', label: 'Board' }];
                return (
                  <>
                    <div style={{ display: 'flex', gap: 4, background: '#f6eef1', borderRadius: 9, padding: 3, flexShrink: 0 }}>
                      {SURFACES.map(s => (
                        <button key={s.k} onClick={() => setWriting({ surface: s.k })}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                            background: surface === s.k ? '#9b5f72' : 'transparent', color: surface === s.k ? '#fff' : '#9b5f72' }}>
                          {s.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={w.text ?? ''}
                      onChange={e => setWriting({ text: e.target.value })}
                      placeholder={'Type a message…\n(Enter for a new line)'}
                      rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 13px', fontSize: 17, fontWeight: 700, color: '#444',
                        border: '1.5px solid #f0dce3', borderRadius: 10, outline: 'none', background: '#fdf9fa', fontFamily: "'Quicksand', sans-serif",
                        flexShrink: 0, resize: 'vertical', lineHeight: 1.4, minHeight: 96,
                        textTransform: w.uppercase ? 'uppercase' : 'none' }}
                    />

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
                      <button type="button" role="switch" aria-checked={!!w.uppercase}
                        onClick={() => setWriting({ uppercase: !w.uppercase })}
                        style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
                          background: w.uppercase ? '#9b5f72' : '#e3d4da', transition: 'background .15s' }}>
                        <span style={{ position: 'absolute', top: 2, left: w.uppercase ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
                          background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                      </button>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>CAPITAL LETTERS</span>
                    </label>

                    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>Font</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {CREAM_FONTS.map(f => (
                        <CreamFontButton key={f.key} fontKey={f.key} label={f.label}
                          selected={w.font === f.key} onClick={() => setWriting({ font: f.key })} />
                      ))}
                    </div>

                    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>Colour &amp; finish</div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* Colour wheel — tap to expand the full picker */}
                      <button onClick={() => setWritingColorOpen(o => !o)} title="Pick a colour"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 0', borderRadius: 9,
                          cursor: 'pointer', fontSize: 12, fontWeight: 800, color: writingColorOpen ? '#9b5f72' : '#777',
                          background: '#fff', border: `2px solid ${writingColorOpen ? '#9b5f72' : '#f0dce3'}` }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: w.color ?? '#ffffff',
                          border: '1.5px solid #d9c4cc', boxShadow: 'inset 0 0 0 2px #fff, 0 0 0 1.5px #d9c4cc' }} />
                        Colour
                      </button>
                      {/* Cream / Gold finish */}
                      {[{ k: 'cream', label: 'Cream' }, { k: 'gold', label: 'Gold' }].map(f => {
                        const on = (w.finish ?? 'cream') === f.k;
                        const gold = f.k === 'gold';
                        return (
                          <button key={f.k} onClick={() => setWriting({ finish: f.k })}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 0', borderRadius: 9,
                              cursor: 'pointer', fontSize: 12, fontWeight: 800, color: on ? (gold ? '#7a5a12' : '#9b5f72') : '#999',
                              background: on ? (gold ? '#fbf2d6' : '#fbeef2') : '#fff', border: `2px solid ${on ? (gold ? '#caa12f' : '#9b5f72') : '#f0dce3'}` }}>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                              background: gold ? 'linear-gradient(135deg,#f7e29a 0%,#caa12f 45%,#8a6b14 100%)' : '#fff',
                              border: gold ? '1px solid #b8902a' : '1.5px solid #d9c4cc',
                              boxShadow: gold ? 'inset 0 1px 1px rgba(255,255,255,0.7)' : 'none' }} />
                            {f.label}
                          </button>
                        );
                      })}
                    </div>

                    {writingColorOpen && (
                      <ColorWheel color={w.color ?? '#ffffff'} onChange={c => setWriting({ color: c })}
                        cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== (w.color ?? '#ffffff').toLowerCase())} width={208} />
                    )}

                    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>Adjust</div>
                    <PenSlider label="Thickness" value={w.thickness ?? 0.03} min={0.008} max={0.07} step={0.002} onChange={v => setWriting({ thickness: v })} fmt={v => v.toFixed(3)} />
                    <PenSlider label="Size"      value={w.fit ?? 0.8}        min={0.3}   max={0.95} step={0.05}  onChange={v => setWriting({ fit: v })}       fmt={v => `${Math.round(v * 100)}%`} />
                    {surface !== 'side' && (
                      <PenSlider label="Curve"   value={w.curve ?? 0}        min={-1}    max={1}    step={0.05}  onChange={v => setWriting({ curve: v })}     fmt={v => v === 0 ? 'flat' : `${Math.round(v * 100)}%`} />
                    )}
                    {surface !== 'side' && (
                      <PenSlider label="Rotate"  value={w.yaw ?? 0}          min={-180}  max={180}  step={1}     onChange={v => setWriting({ yaw: v })}       fmt={v => `${Math.round(v)}°`} />
                    )}
                    {isMultiline && (
                      <PenSlider label="Line gap" value={w.lineSpacing ?? 1.4} min={1}   max={2.2}  step={0.05}  onChange={v => setWriting({ lineSpacing: v })} fmt={v => `${v.toFixed(2)}×`} />
                    )}

                    <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 4 }}>
                      {surface === 'side' ? 'Drag the writing around and up the cake side.'
                        : surface === 'board' ? 'Drag the writing around the cake board.'
                        : 'Drag the writing anywhere on the cake top.'}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => setWriting(surface === 'side' ? { sideAngle: 0, sideY: undefined }
                          : surface === 'board' ? { boardX: undefined, boardZ: undefined }
                          : { offsetX: 0, offsetZ: 0 })}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #f0dce3', background: '#fff',
                          color: '#9b5f72', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Recentre
                      </button>
                      <button onClick={() => { clearWriting(); setActiveTool(null); }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #f0dce3', background: '#fff', color: '#b56', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Remove writing
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Templates flyout ── */}
        {templatesOpen && (
          <div style={{ ...s.flyout, ...(isMobile ? { ...s.flyoutMobile, height: mobilePanelHeight } : {}) }}>
            {isMobile && (
              <div style={s.panelHandle} onPointerDown={handlePanelDrag}>
                <div style={s.panelHandlePill} />
              </div>
            )}
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Templates</span>
              <button style={s.iconBtn} onClick={() => setTemplatesOpen(false)}>✕</button>
            </div>

            {/* Search */}
            <input
              value={tmplSearch}
              onChange={e => setTmplSearch(e.target.value)}
              placeholder="Search templates…"
              style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #f0dce3', borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box', background: '#fdf9fa', flexShrink: 0 }}
            />

            <div style={s.flyoutScroll}>
            {/* Filter panel — inside scroll, avoids outer flex/overflow conflicts */}
            <FilterPanel
              allTags={filterTags}
              active={templateFilters}
              onChange={setTemplateFilters}
              categories={TMPL_CATS}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#bbb', letterSpacing: 1.2, textTransform: 'uppercase', minWidth: 46 }}>Weight</span>
                  <input type="number" min="0" step="0.5" placeholder="e.g. 2" value={filterWeight} onChange={e => setFilterWeight(e.target.value)}
                    style={{ flex: 1, padding: '3px 6px', border: '1.5px solid #f0dce3', borderRadius: 6, fontSize: 11, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: 10, color: '#aaa' }}>kg+</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#bbb', letterSpacing: 1.2, textTransform: 'uppercase', minWidth: 46 }}>Age</span>
                  <input type="number" min="0" max="120" step="1" placeholder="e.g. 8" value={filterAge} onChange={e => setFilterAge(e.target.value)}
                    style={{ flex: 1, padding: '3px 6px', border: '1.5px solid #f0dce3', borderRadius: 6, fontSize: 11, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: 10, color: '#aaa' }}>yrs</span>
                </div>
              </div>
            </FilterPanel>

            {templatesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}
            {!templatesLoading && templates.length === 0 && (
              <div style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: '16px 0' }}>No templates yet</div>
            )}
            <div style={isMobile ? s.templateGrid : null}>
            {templates
              .filter(t => {
                const q = tmplSearch.trim().toLowerCase();
                if (q && !t.name?.toLowerCase().includes(q)) return false;
                if (!matchesFilters(t, templateFilters)) return false;
                if (filterWeight) {
                  const w = parseFloat(filterWeight);
                  if (!isNaN(w) && t.attrs?.min_weight_kg != null && t.attrs.min_weight_kg > w) return false;
                }
                if (filterAge) {
                  const age = parseInt(filterAge);
                  if (!isNaN(age)) {
                    if (t.attrs?.min_age != null && t.attrs.min_age > age) return false;
                    if (t.attrs?.max_age != null && t.attrs.max_age < age) return false;
                  }
                }
                return true;
              })
              .map(t => (
              <div key={t.id} style={{ ...s.templateCard, ...(isMobile ? { flex: '0 0 calc(50% - 5px)' } : {}) }}
                onClick={async () => {
                  let templateDesign = t.design ?? null;
                  if (!templateDesign) {
                    if (apiClient) {
                      const full = await apiClient.fetchTemplate(t.id).catch(() => null);
                      templateDesign = full?.design ?? null;
                    } else {
                      const { data } = await supabase
                        .from('cake_templates')
                        .select('design')
                        .eq('id', t.id)
                        .single();
                      templateDesign = data?.design ?? null;
                    }
                  }
                  if (templateDesign) {
                    loadDesign(templateDesign);
                    setTemplatesOpen(false);
                    clearAllSelections();
                  }
                }}
              >
                {t.thumbnail_url
                  ? <img src={cfImg(t.thumbnail_url, 180, 120, cfAssetsBase)} alt={t.name} width={180} height={120} decoding="async" style={{ width: '100%', height: 120, objectFit: 'contain', borderRadius: 8, background: '#faf7f5' }} />
                  : <div style={s.templateThumbPlaceholder} />
                }
                <div style={s.templateCardFooter}>
                  <span style={s.templateCardName}>{t.name}</span>
                  {t.offering === 'premium' && (
                    <span style={s.templateBadge}>Premium</span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: '#888', textAlign: 'center' }}>
                  {t.tier_count}-tier
                </div>
              </div>
            ))
            }
            </div>{/* end templateGrid */}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Canvas area ── */}
        <div style={{ ...s.canvasArea, ...(isMobile ? { order: -1, overflow: 'hidden' } : {}) }}>

          {/* Shrink the live canvas to the left when the piping strip is open, so the
              cake stays fully visible beside it (the Canvas is absolute inset:0 of this div). */}
          <div style={{ position: 'absolute', inset: 0, right: (!isMobile && toolsOpen) ? 276 : (pipingPopupOpen ? 184 : 0), transition: 'right 0.18s ease' }}>
          <Suspense fallback={<div style={s.loading}>Loading 3D cake...</div>}>
            <CakeCanvas
              config={canvasConfig}
              selectedTier={selectedTier}
              onTierClick={handleTierClick}
              onDeselect={handleDeselect}
              selectedPiping={selectedPiping}
              highlightPipingId={pipingPopupOpen ? expandedPipingId : null}
              onTopPipingSelect={handleTopPipingSelect}
              onBottomPipingSelect={handleBottomPipingSelect}
              pipingTarget={pipingTarget}
              onPipingStyleSelect={handlePipingStyleSelect}
              onPipingCancel={() => setPipingTarget(null)}
              pipingStyles={[]}
              pipingToolbar={selectedPiping !== null ? buildToolbar(selectedEl) : null}
              selectedTextId={selectedTextId}
              onTextSelect={handleTextSelect}
              onTextMove={(id, pos) => updateText(id, pos)}
              onTextContentChange={(id, content) => updateText(id, { content })}
              textToolbar={selectedText ? buildToolbar(selectedEl) : null}
              onTopperClick={handleTopperClick}
              topperSelected={selectedEl?.type === 'topper'}
              topperToolbar={null}
              onWritingClick={() => { setToolsOpen(true); setActiveTool('cream-pen'); setElementsOpen(false); setTemplatesOpen(false); }}
              onWritingMove={moves => setWriting(moves)}
              writingSelected={toolsOpen && activeTool === 'cream-pen'}
              penDrawMode={toolsOpen && activeTool === 'pen'}
              penStyle={penStyle}
              onAddStroke={addStroke}
              selectedStickerIds={selectedStickerIds}
              onStickerSelect={handleStickerSelect}
              onStickerLongPress={handleStickerLongPress}
              onStickerMove={handleStickerMove}
              onGroupMove={handleGroupMove}
              stickerToolbar={null}
              hitTestRef={hitTestRef}
              snapCameraRef={snapCameraRef}
              cameraPosition={isMobile ? CAMERA_POSITION_MOBILE : CAMERA_POSITION}
            />
          </Suspense>
          </div>

          {/* ── Sticker & topper toolbars (DOM overlays — desktop only) ── */}
          {!isMobile && selectedEl?.type === 'sticker' && !selectedStickerIsFauxBall && (
            <div style={{ position:'absolute', top:16, left:'50%', transform:'translateX(-50%)', zIndex:200, pointerEvents:'auto' }}>
              {buildToolbar(selectedEl)}
            </div>
          )}
          {!isMobile && selectedEl?.type === 'topper' && (
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 200, pointerEvents: 'auto' }}>
              {buildToolbar(selectedEl)}
            </div>
          )}

          {/* ── Mobile edit sheet — stickers & toppers ── */}
          {isMobile && selectedEl && (selectedEl.type === 'sticker' || selectedEl.type === 'topper') && !selectedStickerIsFauxBall && (
            <div style={s.editSheetMobile}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={s.wheelTitle}>
                  {selectedEl.type === 'topper'
                    ? (design.topper?.name ?? 'Topper')
                    : (design.stickers.find(sk => sk.id === selectedEl.id)?.name ?? 'Sticker')}
                </span>
                <button style={s.iconBtn} onClick={clearAllSelections}>✕</button>
              </div>
              <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:4 }}>
                {buildToolbar(selectedEl)}
              </div>
            </div>
          )}

          {/* ── Multi-select group bar ── */}
          {(multiSelectMode || selectedStickerIds.size > 1) && (() => {
            const ids = [...selectedStickerIds];
            const allGrouped = ids.length > 1 && ids.every(id => {
              const s = design.stickers.find(x => x.id === id);
              return s?.groupId && s.groupId === design.stickers.find(x => x.id === ids[0])?.groupId;
            });
            return (
              <div style={s.groupBar}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>
                  {ids.length === 0 ? 'Tap to select' : ids.length === 1 ? '1 selected — tap more' : `${ids.length} selected`}
                </span>
                {ids.length > 1 && !allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#9b5f72', borderColor: '#f0dce3' }}
                    onClick={() => { groupStickers(ids); clearAllSelections(); }}>
                    Group
                  </button>
                )}
                {ids.length > 1 && allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#9b5f72', borderColor: '#f0dce3' }}
                    onClick={() => {
                      const gid = design.stickers.find(x => x.id === ids[0])?.groupId;
                      if (gid) ungroupStickers(gid);
                      clearAllSelections();
                    }}>
                    Ungroup
                  </button>
                )}
                {ids.length > 1 && (
                  <button style={{ ...s.groupBarBtn, color: '#e53935', borderColor: '#fcc' }}
                    onClick={handleDelete}>
                    Delete all
                  </button>
                )}
                <button style={{ ...s.groupBarBtn, color: '#6c47ff', borderColor: '#ddd' }}
                  onClick={clearAllSelections}>
                  Done
                </button>
              </div>
            );
          })()}

          <div style={s.rotateHint}>Drag to rotate</div>

          {/* ── Right edit panel — driven by element caps ── */}
          {showRightPanel && (
            <div style={isMobile ? s.wheelPanelMobile : s.wheelPanel}>
              <div style={s.wheelHeader}>
                <span style={s.wheelTitle}>
                  {selectedEl?.type === 'tier'    ? TIER_LABELS[selectedEl.index]
                  : selectedEl?.type === 'piping'  ? `${TIER_LABELS[selectedEl.tierIndex]} ${selectedEl.zone === 'top' ? 'Top' : 'Base'}`
                  : selectedEl?.type === 'text'    ? 'Text Color'
                  : selectedEl?.type === 'topper'  ? (design.topper?.name ?? 'Topper')
                  : selectedEl?.type === 'sticker' ? (design.stickers.find(s => s.id === selectedEl.id)?.name ?? 'Sticker')
                  : ''}
                </span>
                <button style={s.iconBtn} onClick={() => {
                  if (tierPanelVisible) setSelectedEl(null);
                  else { setColorOpen(false); if (selectedEl?.type === 'topper') setSelectedEl(null); }
                }}>✕</button>
              </div>

              {/* Color wheel — tier (always), piping/text (when colorOpen) */}
              {caps?.color && (tierPanelVisible || colorOpen) && (() => {
                // Offer same-material colors so a reused hue renders exactly: tier → other
                // tier colors (matte), any element → other element colors (sheened). The
                // current selection's own color is dropped (no point reoffering it).
                const pool = selectedEl?.type === 'tier' ? collectTierColors(design) : collectElementColors(design);
                const cakeColors = [...new Set(pool)]
                  .filter(c => c.toLowerCase() !== currentColor.toLowerCase());
                return (
                  <ColorWheel
                    key={`${selectedEl.type}-${selectedEl.index ?? selectedEl.tierIndex ?? selectedEl.id ?? 'x'}-${selectedEl.zone ?? ''}`}
                    color={currentColor}
                    onChange={handleColorChange}
                    cakeColors={cakeColors}
                  />
                );
              })()}

              {/* Corner radius — only for sheet (rectangular) tiers */}
              {selectedEl?.type === 'tier' && design.tiers[selectedEl.index]?.shape === 'rect' && (() => {
                const tier = design.tiers[selectedEl.index];
                const w = tier.width ?? 2.16, d = tier.depth ?? 1.56, h = tier.height ?? 0.85;
                const maxR = +(Math.min(w, d, h) / 2 * 0.9).toFixed(2);
                const val  = Math.min(tier.cornerR ?? 0, maxR);
                const pct  = maxR > 0 ? (val / maxR) * 100 : 0;
                const setFromEvent = e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setTierCornerR(selectedEl.index, +(ratio * maxR).toFixed(3));
                };
                return (
                  <div style={{ width: '100%', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: 0.5 }}>Corner radius</span>
                      <span style={{ fontSize: 10, color: '#888' }}>{val < 0.02 ? 'Sharp' : val.toFixed(2)}</span>
                    </div>
                    <div
                      style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                      onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
                      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
                      onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                      onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                    >
                      <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                      </div>
                      <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#9b5268', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                );
              })()}

              {/* Faux ball single controls */}
              {selectedEl?.type === 'sticker' && (() => {
                const sticker = design.stickers.find(s => s.id === selectedEl.id);
                if (!sticker || sticker.placementMode !== 'faux_ball_single') return null;
                const tierRadius = canvasConfig.tiers[sticker.tierIndex]?.radius ?? 1.2;
                const isSideBall = sticker.zone === 'side' || sticker.zone === 'middle_tier';
                const dist  = Math.sqrt((sticker.x ?? 0) ** 2 + (sticker.z ?? 0) ** 2);
                const theta = Math.atan2(sticker.x ?? 0, sticker.z ?? 0);
                const rdInset = Math.max(0, tierRadius - dist);
                const tierInfo = canvasConfig.tiers[sticker.tierIndex];
                const tierBaseY = (() => {
                  let y = 0;
                  for (let i = 0; i < sticker.tierIndex; i++) y += (canvasConfig.tiers[i]?.height ?? 0.5);
                  return y + 0.1;
                })();
                const tierHeight = tierInfo?.height ?? 0.5;
                function pushApart(newX, newZ, selfR = sticker.scale ?? 0.12) {
                  const maxR  = tierRadius * 0.92;
                  let x = newX, z = newZ;
                  const siblings = design.stickers.filter(
                    s => s.id !== sticker.id && s.placementMode === 'faux_ball_single' && s.tierIndex === sticker.tierIndex && s.zone === sticker.zone
                  );
                  for (const sib of siblings) {
                    const minDist = selfR + (sib.scale ?? 0.12);
                    const ex = x - (sib.x ?? 0), ez = z - (sib.z ?? 0);
                    const d  = Math.sqrt(ex * ex + ez * ez);
                    if (d < minDist && d > 0.001) {
                      x = (sib.x ?? 0) + ex * (minDist / d);
                      z = (sib.z ?? 0) + ez * (minDist / d);
                      const r2 = Math.sqrt(x * x + z * z);
                      if (r2 > maxR) { x = x * maxR / r2; z = z * maxR / r2; }
                    }
                  }
                  return { x, z };
                }
                function setAngle(v) {
                  const { x, z } = pushApart(dist * Math.sin(v), dist * Math.cos(v));
                  updateSticker(sticker.id, { x, z });
                }
                function setInset(v) {
                  const d = Math.max(0, tierRadius - v);
                  const { x, z } = pushApart(d * Math.sin(theta), d * Math.cos(theta));
                  updateSticker(sticker.id, { x, z });
                }
                function pushApartSide(newTheta, newY, selfR = sticker.scale ?? 0.12) {
                  const surfR = tierRadius + selfR;
                  let t = newTheta, y = newY;
                  const siblings = design.stickers.filter(
                    s => s.id !== sticker.id && s.placementMode === 'faux_ball_single' && s.tierIndex === sticker.tierIndex
                  );
                  for (const sib of siblings) {
                    const minDist = selfR + (sib.scale ?? 0.12);
                    const sibSurfR = tierRadius + (sib.scale ?? 0.12);
                    const ax = surfR * Math.sin(t), ay = y, az = surfR * Math.cos(t);
                    const bx = sibSurfR * Math.sin(sib.theta ?? 0), by = sib.y ?? (tierBaseY + tierHeight * 0.5), bz = sibSurfR * Math.cos(sib.theta ?? 0);
                    const ex = ax - bx, ey = ay - by, ez = az - bz;
                    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
                    if (d < minDist && d > 0.001) {
                      t = Math.atan2(bx + ex * (minDist / d), bz + ez * (minDist / d));
                      y = Math.max(tierBaseY + selfR, Math.min(tierBaseY + tierHeight - selfR, by + ey * (minDist / d)));
                    }
                  }
                  return { theta: t, y };
                }
                const SliderRow = ({ label, value, min, max, step, onChange, display }) => {
                  const pct = ((value - min) / (max - min)) * 100;
                  function valFromEvent(e) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const snapped = min + Math.round((ratio * (max - min)) / step) * step;
                    return Math.min(max, Math.max(min, snapped));
                  }
                  return (
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: 0.5 }}>{label}</span>
                        <span style={{ fontSize: 10, color: '#888' }}>{display ?? value.toFixed(3)}</span>
                      </div>
                      <div
                        style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onChange(valFromEvent(e)); }}
                        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); onChange(valFromEvent(e)); }}
                        onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                        onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                      >
                        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                        </div>
                        <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#9b5268', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                  );
                };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4, width: '100%' }}>
                    {isSideBall ? <>
                      {SliderRow({ label: 'Angle', value: sticker.theta ?? 0, min: -Math.PI, max: Math.PI, step: 0.01, display: `${((sticker.theta ?? 0) * 180 / Math.PI).toFixed(1)}°`, onChange: v => { const { theta: t, y } = pushApartSide(v, sticker.y ?? (tierBaseY + tierHeight * 0.5)); updateSticker(sticker.id, { theta: t, y }); } })}
                      {SliderRow({ label: 'Height', value: sticker.y ?? (tierBaseY + tierHeight * 0.5), min: tierBaseY, max: tierBaseY + tierHeight, step: 0.01, onChange: v => { const { theta: t, y } = pushApartSide(sticker.theta ?? 0, v); updateSticker(sticker.id, { theta: t, y }); } })}
                    </> : <>
                      {SliderRow({ label: 'Angle', value: theta, min: -Math.PI, max: Math.PI, step: 0.01, onChange: setAngle, display: `${(theta * 180 / Math.PI).toFixed(1)}°` })}
                      {SliderRow({ label: 'Inset from rim', value: rdInset, min: 0, max: tierRadius * 0.95, step: 0.01, onChange: setInset })}
                    </>}
                    {SliderRow({ label: 'Radius', value: sticker.scale ?? 0.12, min: 0.03, max: 0.35, step: 0.005, onChange: v => {
                      if (isSideBall) {
                        const { theta: t, y } = pushApartSide(sticker.theta ?? 0, sticker.y ?? (tierBaseY + tierHeight * 0.5), v);
                        updateSticker(sticker.id, { scale: v, theta: t, y });
                      } else {
                        const { x, z } = pushApart(sticker.x ?? 0, sticker.z ?? 0, v);
                        updateSticker(sticker.id, { scale: v, x, z });
                      }
                    } })}
                    <button style={{ ...s.iconBtn, width: '100%', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#e53935', background: '#fff0f0', border: '1.5px solid #f5c0c0' }}
                      onClick={handleDelete}>Remove</button>
                  </div>
                );
              })()}

              {/* Resize slider — regular stickers */}
              {caps?.resize && selectedEl?.type === 'sticker' && (() => {
                const sticker = design.stickers.find(s => s.id === selectedEl.id);
                if (!sticker || sticker.placementMode === 'faux_ball_single') return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', paddingTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>Size</div>
                    {(() => {
                      const pct = ((Math.round(sticker.scale * 100) - 25) / 275) * 100;
                      return (
                        <div
                          style={{ width: 200, position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                          onPointerDown={e => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            updateSticker(sticker.id, { scale: (25 + Math.round(ratio * 275 / 5) * 5) / 100 });
                          }}
                          onPointerMove={e => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            updateSticker(sticker.id, { scale: (25 + Math.round(ratio * 275 / 5) * 5) / 100 });
                          }}
                          onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                          onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                        >
                          <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                          </div>
                          <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#9b5268', pointerEvents: 'none' }} />
                        </div>
                      );
                    })()}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{Math.round(sticker.scale * 100)}%</span>
                  </div>
                );
              })()}

            </div>
          )}

          {/* ── Cream Piping popup ── */}
          {pipingPopupOpen && pipingCards.length > 0 && (
            <div ref={pipingPopupRef} className="piping-popup-scroll" style={s.pipingPopup}>
              {/* WebKit scrollbar can't be hidden via inline style — inject the rule once. */}
              <style>{`.piping-popup-scroll::-webkit-scrollbar{width:0;height:0;display:none}`}</style>
              {/* Accordion stack: one collapsible card per added piping element. Picking a
                  new element from the left appends a card here; the cake renders all of them
                  stacked. Only the expanded card shows its rim/board controls — and it's pinned
                  to the top of the stack so its (often tall) controls open from the top, with
                  the other cards collapsed to compact headers below. */}
              {(expandedPipingId
                ? [pipingCards.find(c => c.cardId === expandedPipingId), ...pipingCards.filter(c => c.cardId !== expandedPipingId)].filter(Boolean)
                : pipingCards
              ).map((card) => {
                const expanded = card.cardId === expandedPipingId;
                // Number instances of the SAME element ("Soft Swirl 1", "Soft Swirl 2", …)
                // so duplicate cards are distinguishable; a lone instance stays unnumbered.
                const sameEl = pipingCards.filter(c => c.id === card.id);
                const title  = sameEl.length > 1 ? `${card.name} ${sameEl.indexOf(card) + 1}` : card.name;
                return (
                <div key={card.cardId} style={{ flexShrink: 0, border: `1.5px solid ${expanded ? '#9b5268' : '#eadde2'}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  {/* Card header: thumbnail + element name + expand/collapse arrow.
                      No close button — a layer leaves the cake by unchecking its rings. */}
                  <div role="button"
                    onClick={() => setExpandedPipingId(prev => prev === card.cardId ? null : card.cardId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 7px', cursor: 'pointer', background: expanded ? '#fbf3f6' : '#fff' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #f0dce3', background: '#fff', flexShrink: 0 }}>
                      {card.thumbnail_url && <img src={cfImg(card.thumbnail_url, 26, 26, cfAssetsBase)} alt={card.name} width={26} height={26} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1a1a1a', flex: 1, minWidth: 0, lineHeight: 1.2, fontFamily: "'Quicksand',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                    <span style={{ fontSize: 9, color: '#9b5268', flexShrink: 0, transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▼</span>
                  </div>
                  {expanded && (
                  <div style={{ padding: '0 9px 9px' }}>
                  {(() => {
              // Only rim/board drive piping candidates. The admin's "Side" zone is the cake
              // wall — the same place board piping rides (y-adjustable) — so treat it as 'board'
              // here, otherwise a side-zoned piping element yields no candidates (blank card).
              const allowed = (pipingPopupEl.allowed_zones?.length ? pipingPopupEl.allowed_zones : ['rim', 'board'])
                .map(z => z === 'side' ? 'board' : z);
              const multi   = design.tiers.length > 1;
              // One card per candidate ring, ordered to mirror the cake top → bottom.
              // Each is independently editable; the checkbox beside its preview adds/removes
              // it, and touching any control auto-adds it.
              //  • Rim — the top edge of each tier. A rim already carrying piping can still take
              //    more rings, each nesting concentrically inside the last (nextRimRadialOffset),
              //    until packed: the top tier fills to its center, lower tiers only to the
              //    cylinder of the tier resting on them, so they hold fewer rings.
              //  • Side/Board — the wall. A y-adjustable style is a sideways border that rides up
              //    a tier's wall, so we offer it on EVERY tier's side. Non-adjustable board styles
              //    are plate rings, valid on the bottom tier only.
              const yAdjustable = !!pipingPopupEl.placement_config?.bottom_y_adjustable;
              const allowsBoard = allowed.includes('board');
              let rimFull = false;
              const candidates = [];
              for (let i = design.tiers.length - 1; i >= 0; i--) {
                if (allowed.includes('rim')) {
                  const mine = ringPiping(i, 'rim');   // this card already on this rim
                  if (mine || rimHasRoom(i)) candidates.push({ tierIndex: i, zone: 'rim', label: multi ? `${TIER_LABELS[i]} Rim` : 'Rim' });
                  else rimFull = true;
                }
                // Sideways border on an UPPER tier's wall (bottom tier is the board candidate below).
                if (allowsBoard && yAdjustable && i > 0) candidates.push({ tierIndex: i, zone: 'board', label: `${TIER_LABELS[i]} Side` });
              }
              if (allowsBoard) candidates.push({ tierIndex: 0, zone: 'board', label: multi ? `${TIER_LABELS[0]} Board` : 'Board' });
              return (<>
              {rimFull && (
                <div style={{ borderTop: '1px solid #f5eaed', paddingTop: 9, fontSize: 9.5, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", lineHeight: 1.45 }}>
                  A rim is fully packed with nested rings — this style is offered on the side instead so they don't overlap.
                </div>
              )}
              {multi && allowsBoard && !yAdjustable && (
                <div style={{ borderTop: '1px solid #f5eaed', paddingTop: 9, fontSize: 9.5, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", lineHeight: 1.45 }}>
                  Board is on the bottom tier only — upper tiers rest on the rim of the tier below.
                </div>
              )}
              {candidates.map(({ tierIndex, zone, label }) => {
                const isTopZone     = zone === 'rim';
                const applied       = ringPiping(tierIndex, zone);
                // Unapplied rim rings preview at the inward offset they'd nest to once added.
                const nestRO        = (isTopZone && !applied) ? nextRimRadialOffset(tierIndex) : null;
                const p             = applied ?? { color: '#f5e6c8', size: 1, ...pipingPlacementFromConfig(pipingPopupEl.placement_config, isTopZone), ...(nestRO ? { userRadialOffset: nestRO } : {}) };
                const color         = p.color ?? '#f5e6c8';
                const size          = p.size  ?? 1;
                const pc            = pipingPopupEl.placement_config ?? {};
                const allowedArr    = pipingAllowedArrangements(pc, isTopZone);
                const arrAdjustable = allowedArr.length > 1;   // user can switch only when both allowed
                const arrangement   = p.arrangement ?? pipingDefaultArrangement(pc, isTopZone);
                const maxInstances  = (isTopZone ? pc.top_single_max : pc.bottom_single_max) ?? 12;
                const zoneInstances = p.instances ?? [];
                // Config-derived placement for the live preview, with this ring's own board
                // flip override applied so the preview matches what's on the cake.
                const previewPlacement = pipingPlacementFromConfig(pipingPopupEl.placement_config, isTopZone);
                if (!isTopZone && p.userFlipBottom != null) previewPlacement.flipBottom = p.userFlipBottom;
                // Reflect the manual radial nudge in the popup preview so it matches the cake.
                previewPlacement.extraRadialOffset = (previewPlacement.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0);
                // Festoon swags anchor at a fraction of the tier wall (dynamic), not the absolute
                // bottom_y_offset — mirror the cake renderer so the preview matches the placement.
                if (!isTopZone && previewPlacement.bend) {
                  const th = canvasConfig.tiers[tierIndex]?.height ?? BOTTOM_H;
                  previewPlacement.yOffset = th * BEND_ANCHOR_FRAC + (p.userYOffset ?? 0);
                }
                // A "piping pattern" element carries no image_url of its own — its A/B GLBs
                // live in the cream_piping blocks it references. Resolve them the same way
                // the real cake-apply path does (resolvePipingGlbs) so the preview matches.
                const { glbUrl: previewGlb, altGlbUrl: previewAltGlb } = resolvePipingGlbs(pipingPopupEl);
                if (previewAltGlb) previewPlacement.altGlbUrl = previewAltGlb;
                // Shared row styling so every control lines up; section headers add hairlines.
                const lbl     = { fontSize: 10, color: '#888', fontFamily: "'Quicksand',sans-serif", fontWeight: 600, flexShrink: 0 };
                const cap     = { fontSize: 8.5, fontWeight: 700, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 };
                const secRow   = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 };
                const secTitle = { fontSize: 9, fontWeight: 700, color: '#c39aa7', fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: 0.7, flexShrink: 0, whiteSpace: 'nowrap' };
                const hair     = { flex: 1, height: 1, background: '#f2e6ea' };
                const flipAdj  = zone === 'board' && pipingPopupEl.placement_config?.bottom_flip_adjustable;
                const yAdj     = zone === 'board' && pipingPopupEl.placement_config?.bottom_y_adjustable;
                const boardY   = p.userYOffset ?? 0;
                const radial   = p.userRadialOffset ?? 0;
                // "Radial" reads as a circle term; on a sheet (rect) cake the control insets the
                // border perpendicularly from each straight edge, so label it "Inset" instead.
                const isRectTier = canvasConfig.tiers[tierIndex]?.shape === 'rect';
                return (
                  <div key={`${zone}-${tierIndex}`} style={{ borderTop: '1px solid #f5eaed', paddingTop: 10, paddingBottom: 4 }}>
                    {/* ── Full-width preview with the checkbox floating in its corner ── */}
                    <div style={{ position: 'relative', width: '100%', height: 104, borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${applied ? '#9b5268' : '#cdccd3'}`, background: '#cfcdd6' }}>
                      <PipingPreview zone={zone} glbUrl={previewGlb} color={color} size={size}
                        tiers={canvasConfig.tiers} tierIndex={tierIndex}
                        placement={previewPlacement} arrangement={arrangement} instances={zoneInstances} />
                      <label title={applied ? 'Remove from cake' : 'Add to cake'}
                        onPointerDown={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: 5, left: 5, width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 3px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!applied}
                          onChange={() => togglePipingZone(tierIndex, zone, !!applied)}
                          style={{ accentColor: '#9b5268', width: 15, height: 15, cursor: 'pointer', margin: 0 }} />
                      </label>
                    </div>
                    {/* ring name */}
                    <span style={{ display: 'block', marginTop: 7, fontSize: 11, fontWeight: 700, color: '#9b5268', fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.25, textAlign: 'center' }}>{label}</span>
                    {/* Color + Size */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 22, marginTop: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div role="button" title="Choose colour"
                          onClick={e => {
                            const k = `${card.cardId}-${zone}-${tierIndex}`;
                            const r = e.currentTarget.getBoundingClientRect();
                            setPipingColorAnchor({ top: r.top, left: r.left });
                            setPipingColorKey(prev => prev === k ? null : k);
                          }}
                          style={{ width: 26, height: 26, flexShrink: 0, cursor: 'pointer', borderRadius: '50%', background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 4 }}>
                          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: color }} />
                        </div>
                        <span style={cap}>Color</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <SizeDial size={size} onChange={v => handlePipingSizeChange(tierIndex, zone, v)} />
                        <span style={cap}>Size</span>
                      </div>
                    </div>

                    {/* Colour picker — the same wheel as tiers, floated as a popup. Portaled to
                        <body> so it escapes the card's narrow, backdrop-blurred scroll container
                        (a backdrop-filter ancestor would otherwise trap a fixed-positioned child).
                        Anchored to the left of the tapped Color dot, clamped to the viewport. */}
                    {pipingColorKey === `${card.cardId}-${zone}-${tierIndex}` && pipingColorAnchor && createPortal(
                      (() => {
                        const PW = 216, EST_H = 400, PAD = 14;
                        const left = Math.max(8, pipingColorAnchor.left - PW - 2 * PAD - 18);
                        const top  = Math.max(8, Math.min(pipingColorAnchor.top - 48, window.innerHeight - EST_H));
                        return (
                          <div style={{ position: 'fixed', top, left, zIndex: 4000, background: '#fff',
                            borderRadius: 16, padding: PAD, boxShadow: '0 12px 44px rgba(0,0,0,0.24)',
                            border: '1px solid #eadde2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#9b5268', textTransform: 'uppercase' }}>{label}</span>
                              <button style={s.iconBtn} onClick={() => setPipingColorKey(null)}>✕</button>
                            </div>
                            <ColorWheel
                              color={color}
                              onChange={c => handlePipingColorChange(tierIndex, zone, c)}
                              cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== color.toLowerCase())}
                            />
                          </div>
                        );
                      })(),
                      document.body
                    )}

                    {/* Ring vs Single — full-width row directly below the cake preview */}
                    {arrAdjustable && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {allowedArr.map(mode => {
                          const on = arrangement === mode;
                          return (
                            <button key={mode}
                              onPointerDown={e => { e.stopPropagation(); handlePipingArrangementChange(tierIndex, zone, mode); }}
                              style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${on ? '#9b5268' : '#e0d0d5'}`, background: on ? '#9b5268' : '#fff', color: on ? '#fff' : '#9b5268', cursor: 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif", textTransform: 'capitalize' }}>
                              {mode}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Pieces (single layout only) ── */}
                    {arrangement === 'single' && (
                      <>
                        <div style={secRow}>
                          <span style={secTitle}>Pieces ({zoneInstances.length})</span>
                          <div style={hair} />
                          <button
                            disabled={zoneInstances.length >= maxInstances}
                            onPointerDown={e => { e.stopPropagation(); if (zoneInstances.length < maxInstances) handlePipingAddInstance(tierIndex, zone); }}
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1.5px solid #9b5268', background: zoneInstances.length >= maxInstances ? '#f0e0e5' : '#9b5268', color: zoneInstances.length >= maxInstances ? '#c9a9b3' : '#fff', cursor: zoneInstances.length >= maxInstances ? 'default' : 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif", flexShrink: 0 }}>
                            + Duplicate
                          </button>
                        </div>
                        {zoneInstances.map((inst, idx) => {
                          // Display/slider are relative to the cake front (0° = front).
                          const rel = ((((inst.angle ?? 0) - PIPING_FRONT_ANGLE) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                          const angleDeg = Math.round(rel * 180 / Math.PI);
                          const rotPct = (rel / (Math.PI * 2)) * 100;
                          const setAngleFromEvent = (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            handlePipingSetInstanceAngle(tierIndex, zone, idx, PIPING_FRONT_ANGLE + ratio * Math.PI * 2);
                          };
                          return (
                            <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                              <span style={{ fontSize: 10, color: '#aaa', width: 14, flexShrink: 0, fontFamily: "'Quicksand',sans-serif" }}>{idx + 1}</span>
                              <div
                                style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                                onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setAngleFromEvent(e); }}
                                onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setAngleFromEvent(e); }}
                                onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                                onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                              >
                                <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${rotPct}%`, background: '#9b5268', borderRadius: 2 }} />
                                </div>
                                <div style={{ position: 'absolute', left: `${rotPct}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#9b5268', pointerEvents: 'none' }} />
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#444', minWidth: 30, textAlign: 'right', fontFamily: "'Quicksand',sans-serif" }}>{angleDeg}°</span>
                              <button
                                onPointerDown={e => { e.stopPropagation(); handlePipingRemoveInstance(tierIndex, zone, idx); }}
                                style={{ fontSize: 12, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* ── Adjust: radial distance + flip + height on one row ── */}
                    <>
                        <div style={secRow}><span style={secTitle}>Adjust</span><div style={hair} /></div>
                        {/* Each control is its OWN full-width row (label left, stepper right) and
                            wraps internally, so nothing — including Reset — can clip off the edge. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
                          {/* Radial/inset — every ring except a wrap band, which auto-hugs the wall. */}
                          {!p.wrap && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', flexWrap: 'wrap' }}>
                            <span style={{ ...lbl, flex: 1, minWidth: 0 }}>{isRectTier ? 'Inset' : 'Radial'}</span>
                            <button
                              title="Move inward"
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #e0d0d5', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#9b5268', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              onPointerDown={e => { e.stopPropagation(); handlePipingRadialOffsetChange(tierIndex, zone, +(radial - 0.05).toFixed(2)); }}>−</button>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#444', minWidth: 32, textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}>
                              {radial > 0 ? `+${radial.toFixed(2)}` : radial.toFixed(2)}
                            </span>
                            <button
                              title="Move outward"
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #e0d0d5', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#9b5268', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              onPointerDown={e => { e.stopPropagation(); handlePipingRadialOffsetChange(tierIndex, zone, +(radial + 0.05).toFixed(2)); }}>+</button>
                            {radial !== 0 && (
                              <button
                                style={{ fontSize: 9, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: "'Quicksand',sans-serif" }}
                                onPointerDown={e => { e.stopPropagation(); handlePipingRadialOffsetChange(tierIndex, zone, 0); }}>Reset</button>
                            )}
                          </div>
                          )}
                          {flipAdj && (() => {
                            const defaultFlip = pipingPopupEl.placement_config?.bottom_flip ?? true;
                            const active = p.userFlipBottom != null ? p.userFlipBottom : defaultFlip;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', flexWrap: 'wrap' }}>
                                <span style={{ ...lbl, flex: 1, minWidth: 0 }}>Flip</span>
                                <button
                                  onPointerDown={e => { e.stopPropagation(); handlePipingBoardFlipChange(tierIndex); }}
                                  style={{ fontSize: 11, padding: '3px 11px', borderRadius: 6, border: `1.5px solid ${active ? '#9b5268' : '#e0d0d5'}`, background: active ? '#9b5268' : '#fff', color: active ? '#fff' : '#9b5268', cursor: 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif" }}>
                                  {active ? '↕ On' : '↕ Off'}
                                </button>
                              </div>
                            );
                          })()}
                          {yAdj && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', flexWrap: 'wrap' }}>
                              <span style={{ ...lbl, flex: 1, minWidth: 0 }}>Height</span>
                              <button
                                style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #e0d0d5', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#9b5268', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, +(boardY - 0.05).toFixed(2)); }}>−</button>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#444', minWidth: 32, textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}>
                                {boardY > 0 ? `+${boardY.toFixed(2)}` : boardY.toFixed(2)}
                              </span>
                              <button
                                style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #e0d0d5', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#9b5268', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, +(boardY + 0.05).toFixed(2)); }}>+</button>
                              {boardY !== 0 && (
                                <button
                                  style={{ fontSize: 9, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: "'Quicksand',sans-serif" }}
                                  onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, 0); }}>Reset</button>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                  </div>
                );
              })}
              </>);
              })()}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>{/* end main */}

      {/* ── Order + Save Template bar ── */}
      {selectedEl?.type !== 'text' && (
        <div style={{ ...s.orderBar, ...(isMobile ? { padding: '6px 16px 10px' } : {}), display: 'flex', gap: 8 }}>
          <button
            style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
            onClick={handleOrder}>
            {editingOrder ? 'Update Design' : 'Order This Cake'}
          </button>
          <button
            style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', opacity: 0.75, ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
            onClick={() => setSaveModal(true)}>
            Save as Template
          </button>
        </div>
      )}

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <div style={s.mobileBottomNav}>
          {/* New cake — circle + as first nav item */}
          <button style={{ ...s.sidebarBtn, borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.45)', color: '#fff' }} onClick={handleNewCake}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {[
            { id: 'dashboard',  icon: <DashboardIcon size={20} /> },
            { id: 'templates',  icon: <TemplatesIcon size={20} /> },
            { id: 'elements',   icon: <ElementsIcon size={20} /> },
            { id: 'orders',     icon: <OrdersIcon size={20} /> },
            { id: 'customers',  icon: <CustomersIcon size={20} /> },
          ].map(({ id, icon }) => {
            const active = id === 'elements' ? elementsOpen : id === 'templates' ? templatesOpen : id === 'tools' ? toolsOpen : false;
            return (
              <button key={id}
                style={{ ...s.sidebarBtn, ...(active ? s.sidebarBtnActive : {}) }}
                onClick={() => {
                  if (id === 'elements')  openElements();
                  if (id === 'tools')     openTools();
                  if (id === 'templates') openTemplates();
                  if (id === 'dashboard') setDashboardOpen(true);
                  if (id === 'orders')    setOrdersPanelOpen(true);
                  if (id === 'customers') setCustomersPanelOpen(true);
                }}>
                {icon}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Save as Template modal ── */}
      {saveModal && (
        <div style={s.modalOverlay} onClick={() => setSaveModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>Save as Template</span>
              <button style={s.iconBtn} onClick={() => setSaveModal(false)}>✕</button>
            </div>
            <input
              style={s.modalInput}
              placeholder="Template name..."
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {['standard', 'premium'].map(o => (
                <button
                  key={o}
                  style={{ ...s.offeringBtn, borderColor: templateOffering === o ? primaryColor : '#f0dce3', background: templateOffering === o ? hexToRgba(primaryColor, 0.08) : '#fff', color: templateOffering === o ? primaryColor : '#666' }}
                  onClick={() => setTemplateOffering(o)}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Weight (kg)</div>
                <input style={{ ...s.modalInput }} type="number" min="0" step="0.5" placeholder="e.g. 1.5" value={templateWeight} onChange={e => setTemplateWeight(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Age Range</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input style={{ ...s.modalInput, width: '50%' }} type="number" min="0" step="1" placeholder="Min" value={templateMinAge} onChange={e => setTemplateMinAge(e.target.value)} />
                  <span style={{ color: '#aaa', fontSize: 12 }}>–</span>
                  <input style={{ ...s.modalInput, width: '50%' }} type="number" min="0" step="1" placeholder="Max" value={templateMaxAge} onChange={e => setTemplateMaxAge(e.target.value)} />
                </div>
              </div>
            </div>

            {filterTags.filter(t => t.category === 'occasion').length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Occasions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {filterTags.filter(t => t.category === 'occasion').map(tag => {
                    const on = templateOccasionIds.has(tag.id);
                    return (
                      <button key={tag.id} type="button"
                        style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${on ? primaryColor : '#e5d0d8'}`, background: on ? hexToRgba(primaryColor, 0.1) : '#fff', color: on ? primaryColor : '#888', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}
                        onClick={() => setTemplateOccasionIds(prev => { const next = new Set(prev); on ? next.delete(tag.id) : next.add(tag.id); return next; })}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {saveMsg && (
              <div style={{ fontSize: 12, fontWeight: 600, color: saveMsg.ok ? '#4caf50' : '#e53935', marginTop: 8 }}>
                {saveMsg.text}
              </div>
            )}
            <button
              style={{ ...s.orderBtn, ...brandBtn, marginTop: 14, opacity: saving || !templateName.trim() ? 0.6 : 1 }}
              onClick={handleSaveTemplate}
              disabled={saving || !templateName.trim()}
            >
              {saving ? 'Saving...' : 'Save as Template'}
            </button>
          </div>
        </div>
      )}

      {/* ── Color Guide modal ── */}
      {colorGuideOpen && (
        <ColorGuide
          onClose={() => setColorGuideOpen(false)}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      )}

      {/* ── Add User modal ── */}
      {addUserModal && <AddUserModal onClose={() => setAddUserModal(false)} brandBtn={brandBtn} />}

      {/* ── Change Password modal ── */}
      {changePasswordModal && (
        <ChangePasswordModal
          onClose={() => setChangePasswordModal(false)}
          brandBtn={brandBtn}
          supabase={supabase}
          apiClient={apiClient}
        />
      )}

      {/* ── Billing panel ── */}
      <BillingPanel
        open={billingPanelOpen}
        onClose={() => setBillingPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />

      {/* ── Settings panel ── */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
        onBrandingUpdate={({ primary_color, accent_color, logo_url }) => {
          setBakerData(b => ({ ...b, primary_color, accent_color, logo_url }));
        }}
        onSettingsSaved={() => {
          if (apiClient?.fetchBakerSettings) {
            apiClient.fetchBakerSettings().then(s => setBakerSettings(s ?? {})).catch(() => {});
          }
        }}
      />

      {/* ── Orders panel ── */}
      <OrdersPanel
        open={ordersPanelOpen}
        onClose={() => { setOrdersPanelOpen(false); setOrdersFilter(null); setNewOrderId(null); }}
        onBack={ordersFilter ? () => { setOrdersPanelOpen(false); setOrdersFilter(null); setNewOrderId(null); setDashboardOpen(true); } : null}
        externalFilter={ordersFilter}
        initialOrderId={newOrderId}
        onEditDesign={(order) => {
          setEditingOrder(order);
          setOrdersPanelOpen(false);
          if (order.design_snapshot) {
            try { loadDesign(order.design_snapshot); } catch (e) { console.error('loadDesign failed', e); }
          }
        }}
        apiClient={apiClient}
        primaryColor={primaryColor}
        homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
      />

      {/* ── Dashboard panel ── */}
      <DashboardPanel
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
        onNavigateOrders={(filter) => {
          setOrdersFilter(filter);
          setDashboardOpen(false);
          setOrdersPanelOpen(true);
        }}
        onNavigateCustomers={(filter) => {
          setCustomersFilter(filter);
          setDashboardOpen(false);
          setCustomersPanelOpen(true);
        }}

      />

      {/* ── Customers panel ── */}
      <CustomersPanel
        open={customersPanelOpen}
        onClose={() => { setCustomersPanelOpen(false); setCustomersFilter(null); }}
        onBack={customersFilter ? () => { setCustomersPanelOpen(false); setCustomersFilter(null); setDashboardOpen(true); } : null}
        apiClient={apiClient}
        primaryColor={primaryColor}
        externalFilter={customersFilter}
        onViewOrder={orderId => {
          setCustomersPanelOpen(false);
          setCustomersFilter(null);
          setNewOrderId(orderId);
          setOrdersPanelOpen(true);
        }}
      />

      {/* ── Order modal ── */}
      {orderModalOpen && (
        <OrderModal
          tierCount={design.tiers.length}
          onClose={() => { setOrderModalOpen(false); setEditingOrder(null); }}
          onSubmit={handleOrderSubmit}
          editingOrder={editingOrder}
          apiClient={apiClient}
          supabase={supabase}
          bakerId={bakerData?.id}
          bakerSlug={bakerData?.slug}
          homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
          storeHours={bakerSettings?.store_hours ?? null}
          brandBtn={brandBtn}
          primaryColor={primaryColor}
          onViewOrder={(id) => {
            setOrderModalOpen(false);
            setEditingOrder(null);
            setNewOrderId(id);
            setOrdersPanelOpen(true);
          }}
        />
      )}


      {/* Off-screen thumbnail canvas — no floor, transparent background */}
      <CakeThumbnailCanvas config={canvasConfig} containerRef={thumbContainerRef} />

      {/* Floating sticker ghost while pointer-dragging from elements panel */}
      {dragGhost && (
        <div style={{
          position: 'fixed',
          left: dragGhost.x - 28, top: dragGhost.y - 28,
          width: 56, height: 56,
          borderRadius: 12,
          background: 'transparent',
          border: dragGhost.canDrop ? '2.5px solid #22c55e' : '2px solid #9b5f72',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: 0.85,
          boxShadow: dragGhost.canDrop
            ? '0 4px 16px rgba(34,197,94,0.35)'
            : '0 4px 16px rgba(0,0,0,0.18)',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}>
          {dragGhost.el.thumbnail_url && (
            <img src={dragGhost.el.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    display:'flex', flexDirection:'column', height:'100vh',
    background:'#f4f4f5', fontFamily:"'Quicksand',sans-serif", overflow:'hidden',
  },

  // Left column (logo above + sidebar below)
  leftCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 0 12px 12px', gap: 10, flexShrink: 0,
  },
  topLogo: {
    width: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  topLogoImg: { maxHeight: 36, maxWidth: 56, objectFit: 'contain' },
  topLogoText: {
    fontSize: 11, fontWeight: 700, color: '#444',
    textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word',
    fontFamily: "'Quicksand',sans-serif",
  },

  // Sidebar
  sidebar: {
    width: 64, minWidth: 64,
    background: '#18191b',
    borderRadius: 20,
    margin: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    flexShrink: 0,
    flex: 1,
    boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
  },
  sidebarDivider: {
    height: 1, width: 32,
    background: 'rgba(255,255,255,0.10)',
    margin: '6px 0', flexShrink: 0,
  },
  sidebarNav: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '4px 0', gap: 2,
  },
  // Stacked nav item: icon box on top, label below.
  navItem: {
    background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    width: 60, flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
    fontFamily: "'Quicksand',sans-serif",
  },
  navLabel: {
    fontSize: 9, fontWeight: 700, lineHeight: 1,
    color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2,
    transition: 'color 0.15s',
  },
  sidebarBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    width: 40, height: 40, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.45)',
    transition: 'background 0.15s, color 0.15s',
    flexShrink: 0,
  },
  sidebarBtnActive: {
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
  },
  sidebarProfileBtn: {
    width: 36, height: 36, borderRadius: '50%', border: 'none',
    cursor: 'pointer', color: '#fff',
    fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
    fontFamily: "'Quicksand',sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.5s ease',
  },

  // Dropdowns
  dropdown: {
    position: 'absolute', top: 0, left: 'calc(100% + 8px)',
    background: '#fff', borderRadius: 10,
    border: '1px solid #f0dce3',
    boxShadow: '0 4px 20px rgba(107,45,66,0.14)',
    minWidth: 160, zIndex: 50,
    display: 'flex', flexDirection: 'column',
    padding: '6px 0', overflow: 'hidden',
  },
  dropdownSection: {
    fontSize: 10, fontWeight: 700, color: '#888',
    letterSpacing: 1, textTransform: 'uppercase',
    padding: '6px 14px 4px',
  },
  dropdownItem: {
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', padding: '8px 14px',
    fontSize: 13, fontWeight: 500, color: '#1a1a1a',
    fontFamily: "'Quicksand',sans-serif",
  },
  dropdownUserInfo: { padding: '10px 14px 8px' },
  dropdownName: { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  dropdownEmail: { fontSize: 11, color: '#666', marginTop: 2 },
  dropdownDivider: { height: 1, background: '#f0dce3', margin: '4px 0' },

  // Main + flyout panels
  main: { flex: 1, display: 'flex', minHeight: 0, position: 'relative' },
  flyout: {
    position: 'absolute', left: 76, top: 0, bottom: 0, zIndex: 20,
    width: 200, background: '#fff',
    borderRadius: '0 16px 16px 0',
    display: 'flex', flexDirection: 'column',
    padding: '12px 10px', gap: 10,
    overflowY: 'auto',
    boxShadow: '4px 0 20px rgba(0,0,0,0.10)',
    margin: '12px 0',
  },
  flyoutHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4, flexShrink: 0,
  },
  flyoutScroll: {
    flex: 1, overflowY: 'auto', minHeight: 0,
    display: 'flex', flexDirection: 'column', gap: 10,
    paddingBottom: 8,
  },
  flyoutTitle: {
    fontSize: 10, fontWeight: 700, color: '#888',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  // Field label (modals)
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: 0.3,
  },
  elementCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: '#fff', border: '1.5px solid #f0dce3', borderRadius: 12,
    padding: '10px 8px', cursor: 'pointer', position: 'relative',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  elementCardLabel: {
    fontSize: 10, fontWeight: 700, color: '#666',
    letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center',
  },
  elementCardCheck: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 11, color: '#333', fontWeight: 800,
  },
  templateGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
  },
  templateCard: {
    border: '1.5px solid #f0dce3', borderRadius: 12,
    overflow: 'hidden', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '0 0 8px',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  templateThumbPlaceholder: {
    width: '100%', height: 120,
    background: '#faf7f5', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: 32,
  },
  templateCardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 8px 0',
  },
  templateCardName: {
    fontSize: 11, fontWeight: 700, color: '#1a1a1a',
  },
  templateBadge: {
    fontSize: 9, color: '#333', fontWeight: 700,
    background: '#fdf0f5', border: '1px solid #f0dce3',
    borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3,
  },

  tierCheckRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    cursor: 'pointer', padding: '2px 0',
  },
  tierCheckLabel: {
    fontSize: 10, fontWeight: 600, color: '#333',
    letterSpacing: 0.3,
  },

  // Canvas
  canvasArea: {
    flex:1, position:'relative', minHeight:0,
    // Match the 3D canvas's clear colour so the strip exposed when the piping popup shrinks
    // the canvas (right:184) blends in seamlessly instead of showing a hard "cut" edge.
    background:'#f4f4f5',
  },
  loading: {
    position:'absolute', inset:0, display:'flex',
    alignItems:'center', justifyContent:'center', color:'#666', fontSize:14,
  },
  hint: {
    position:'absolute', top:14, left:'50%', transform:'translateX(-50%)',
    zIndex:10, background:'rgba(107,45,66,0.7)', color:'#fff',
    fontSize:11, fontWeight:600, padding:'5px 14px', borderRadius:20,
    letterSpacing:0.3, pointerEvents:'none', backdropFilter:'blur(6px)',
  },
  rotateHint: {
    position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
    fontSize:10, color:'#999', letterSpacing:1, pointerEvents:'none',
  },

  // Tier colour wheel panel
  wheelPanel: {
    position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
    background:'rgba(255,255,255,0.92)', backdropFilter:'blur(18px)',
    WebkitBackdropFilter:'blur(18px)', borderRadius:20,
    padding:'14px 16px 16px',
    boxShadow:'0 4px 24px rgba(107,45,66,0.14)',
    zIndex:20, width:248,
  },
  wheelHeader: {
    display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14,
  },
  wheelTitle: {
    fontSize:11, fontWeight:700, color:'#666', letterSpacing:1.5, textTransform:'uppercase',
  },
  deleteBtn: {
    flex: 1, padding: '8px 0', borderRadius: 10,
    background: '#fff0f0', border: '1.5px solid #f5c0c0',
    fontSize: 11, fontWeight: 700, color: '#e53935', cursor: 'pointer',
    fontFamily: "'Quicksand',sans-serif",
  },
  doneBtn: {
    flex: 1, padding: '8px 0', borderRadius: 10,
    background: '#f0f0ff', border: '1.5px solid #c0c0f5',
    fontSize: 11, fontWeight: 700, color: '#6c47ff', cursor: 'pointer',
    fontFamily: "'Quicksand',sans-serif",
  },
  iconBtn: {
    background:'#f5eaed', border:'none', width:28, height:28, borderRadius:'50%',
    fontSize:12, color:'#333', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700,
  },

  // Text toolbar — floated above element via drei Html, no position needed
  textToolbar: {
    display:'inline-flex', alignItems:'center', gap:4,
    background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    padding:'6px 10px',
    borderRadius:12, whiteSpace:'nowrap',
    boxShadow:'0 4px 20px rgba(107,45,66,0.22), 0 1px 4px rgba(0,0,0,0.1)',
    border:'1px solid rgba(240,220,227,0.9)',
    pointerEvents:'auto',
  },
  swatchBtn: {
    width:26, height:26, borderRadius:'50%', border:'2.5px solid #e0d0d5',
    cursor:'pointer', flexShrink:0, padding:0,
    boxShadow:'0 1px 4px rgba(0,0,0,0.15)',
  },
  tbDivider: {
    width:1, height:20, background:'#e8d8dd', margin:'0 4px', flexShrink:0,
  },
  tbIconBtn: {
    background:'transparent', border:'none', borderRadius:8,
    padding:'4px 8px', fontSize:14, cursor:'pointer',
    color:'#333', fontWeight:600, fontFamily:"'Quicksand',sans-serif",
    minWidth:28, textAlign:'center',
  },
  tbSizeLabel: {
    fontSize:13, fontWeight:700, color:'#222', minWidth:26, textAlign:'center',
  },
  toolbarBtn: {
    background:'#f5eaed', border:'none', borderRadius:10,
    padding:'5px 10px', fontSize:13, cursor:'pointer', color:'#333', fontWeight:700,
    flexShrink:0,
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(107,45,66,0.18)',
    backdropFilter: 'blur(4px)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: '20px 22px 22px',
    width: 320, boxShadow: '0 8px 40px rgba(107,45,66,0.18)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle: {
    fontSize: 13, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.3,
  },
  modalInput: {
    border: '1.5px solid #d1d5db', borderRadius: 10, padding: '9px 12px',
    fontSize: 13, fontFamily: "'Quicksand',sans-serif", color: '#222',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  offeringBtn: {
    flex: 1, padding: '7px 0', borderRadius: 10, border: '1.5px solid #f0dce3',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
    fontFamily: "'Quicksand',sans-serif", transition: 'all 0.15s',
  },

  // Order
  orderBar: {
    padding:'10px 20px 16px', background:'transparent',
    flexShrink:0,
  },
  orderBtn: {
    width:'100%', padding:'13px',
    background:'linear-gradient(135deg,#1a1a1a,#333333)',
    color:'#fff', border:'none', borderRadius:12,
    fontSize:14, fontWeight:700, cursor:'pointer', letterSpacing:0.5,
    boxShadow:'0 4px 16px rgba(0,0,0,0.2)',
    fontFamily:"'Quicksand',sans-serif",
    transition:'background 0.5s ease, box-shadow 0.5s ease',
  },
  groupBar: {
    position:'absolute', bottom:60, left:'50%', transform:'translateX(-50%)',
    display:'flex', alignItems:'center', gap:8,
    background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)',
    padding:'8px 14px', borderRadius:12, whiteSpace:'nowrap',
    boxShadow:'0 4px 20px rgba(107,45,66,0.22)',
    border:'1px solid rgba(240,220,227,0.9)',
    zIndex:30, pointerEvents:'auto',
  },
  groupBarBtn: {
    background:'none', border:'1.5px solid #e0d0d5', borderRadius:8,
    padding:'4px 10px', fontSize:11, cursor:'pointer',
    fontWeight:700, fontFamily:"'Quicksand',sans-serif",
  },

  zoneToggle: {
    padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
    border: '1.5px solid #e0d0d5', background: 'transparent',
    color: '#888', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif",
    transition: 'all 0.12s',
  },
  zoneToggleOn: {
    background: 'rgba(155,95,114,0.12)',
    border: '1.5px solid #9b5f72',
    color: '#9b5f72',
  },

  // Narrow vertical strip docked to the right — same on desktop and mobile, so it never
  // blankets the cake; the canvas is padded right by the same amount so the cake sits clear.
  pipingPopup: {
    position: 'absolute',
    // Anchored to the top (not vertically centred) so collapsing/expanding a card grows
    // the strip downward without shifting its position.
    right: 10, top: 12,
    // Cap to the SMALLER of the parent's height and the actual viewport, so the strip never
    // extends below the screen (which would leave its bottom controls unscrollable). `vh` (not
    // `dvh`) so an older webview doesn't reject the whole min() and drop the cap entirely. The
    // 96px allows for the header above the canvas + the 12px top/bottom margins.
    width: 164, maxHeight: 'min(calc(100% - 24px), calc(100vh - 96px))',
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: 16,
    padding: '10px 10px 12px',
    boxShadow: '0 4px 24px rgba(107,45,66,0.18)',
    display: 'flex', flexDirection: 'column', gap: 7,
    // Scroll the stack with a finger-slide when it outgrows the strip; no visible scrollbar
    // (hidden inline for Firefox/IE, and via the injected ::-webkit-scrollbar rule below).
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    zIndex: 20,
  },

  // Mobile-specific
  mobileHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', height: 52, flexShrink: 0,
    background: '#fff', borderBottom: '1px solid #f0e8ea',
    position: 'relative', zIndex: 10,
  },
  mobileBottomNav: {
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    height: 60, background: '#18191b', flexShrink: 0, padding: '0 4px',
  },
  flyoutMobile: {
    position: 'relative',
    left: 'auto', top: 'auto', bottom: 'auto',
    width: '100%', flexShrink: 0,
    margin: 0, borderRadius: '20px 20px 0 0',
    zIndex: 1, order: 0,
    boxShadow: '0 -2px 16px rgba(0,0,0,0.10)',
  },
  panelHandle: {
    width: '100%', display: 'flex', justifyContent: 'center',
    padding: '6px 0 10px', cursor: 'ns-resize', touchAction: 'none', flexShrink: 0,
  },
  panelHandlePill: {
    width: 36, height: 4, borderRadius: 2, background: '#ddd',
  },
  wheelPanelMobile: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '80%', overflowY: 'auto',
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '20px 20px 0 0',
    padding: '14px 16px 24px',
    boxShadow: '0 -4px 24px rgba(107,45,66,0.14)',
    zIndex: 20,
  },
  editSheetMobile: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '20px 20px 0 0',
    padding: '14px 16px 24px',
    boxShadow: '0 -4px 24px rgba(107,45,66,0.14)',
    zIndex: 25,
    display: 'flex', flexDirection: 'column',
  },
};
