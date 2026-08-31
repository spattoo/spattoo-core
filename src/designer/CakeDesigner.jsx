import { Fragment, Suspense, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from '../telemetry/ErrorBoundary.jsx';
import { setContext } from '../telemetry/index.js';
import { splitMobileNav, strandedMenus } from './mobileNav.js';
import PasswordChecklist from '../auth/PasswordChecklist.jsx';
import { isPasswordValid } from '../auth/passwordPolicy.js';
import { HexColorPicker } from 'react-colorful';
import CakeCanvas, { CakeThumbnailCanvas, CakePreview, configureEnvMap, boardOf, rainbowSupportRadius } from './canvas/CakeCanvas';
import { CAMERA_POSITION, CAMERA_POSITION_MOBILE, PIPING_FRONT_ANGLE, TIER_RADII, BOTTOM_H, BOTTOM_BASE, BEND_ANCHOR_FRAC, ELEMENT_SLUGS, ZONES, STICKER_SIZE } from './constants';
import { LAPSED_GATE_COPY, lapsedGateState } from './lapsedGate.js';
import PipingPreview from './canvas/PipingPreview.jsx';
import TopperPreview from './canvas/TopperPreview.jsx';
import { CakeSpinner, CakeSpinnerFill, DecorLoadingOverlay } from './canvas/CakeSpinner.jsx';
import { useAnyLoading } from './canvas/loadingRegistry.js';
import { isSinglePerSlot, placementSlots, flatPose, isDynamicHug, facingOffsetRadians, scaleRangeOf, DEFAULT_FOLD_DEG, edgeSeatSeed, insertSeat, tierAbove, occludedTopFrac, stickerSizeControl, zoneMode, zoneModes, zoneHasChoice, zoneInsert, zoneSeatFields, clampLean } from './placement.js';
import { corsUrl, assetUrl } from './utils/assetUrl.js';
import { useTrimmedLogo } from '../shared/useTrimmedLogo.js';
import { CHROME_STOPS } from '../shared/chrome.js';
import { RAIL, RAIL_FLYOUT_LEFT } from '../shared/rail.js';
import { Panel, Z } from '../shared/Panel.jsx';
// Shared with the storefront customiser's Share button — see shared/icons.jsx for why it is not
// declared here any more.
import { ShareIcon } from '../shared/icons.jsx';
import ReelOptions from './reel/ReelOptions.jsx';
import { captionText, captionColours, CAPTION } from './reel/reelCaption.js';
import PhotoOptions from './photo/PhotoOptions.jsx';
import { shapeByKey, photoFilename } from './photo/photoShapes.js';
import { DESIGNER_GROUND } from './constants.js';
import { MAX_STRIPES, stripeColors, areStripesActive, STRIPE_DEFAULTS } from './shared/color/stripeMaterial.js';
import { STRIPE_PRESETS } from './stripePresets.js';
import { tierShape, topClampInset, boardRingClamp } from './geometry/surface.js';
import { packCluster, clusterRadii, manualSeat } from './geometry/spherePacking.js';
import { GRASS_DEFAULTS, nextPatchSpot } from './geometry/grass.js';
import { MEDIA, DEFAULT_MEDIUM } from './geometry/pipingMedia.js';
import { fillStrokeOnFlat, FILL_PATTERNS } from './geometry/pipingFillOnCake.js';
import GarnishStudio from './garnish/GarnishStudio.jsx';
import { garnishDragTo } from './geometry/garnishPlacement.js';
import Segmented from '../shared/Segmented.jsx';
import { RAINBOW_DEFAULTS, rainbowDragTo, rainbowBands } from './geometry/rainbow.js';
import { CLOUD_DEFAULTS, cloudDragTo } from './geometry/cloud.js';
import { RAINBOW_ARRANGEMENTS, ArrangementTile, arrangementOf, arrangementShape } from './decorations/RainbowArrangements.jsx';
import { NAME_BLOCK_DEFAULTS, nameBlockRun, nameBlockYaw, boardRunRadius } from './geometry/nameBlocks.js';
// The board's top surface — where the tier stack starts (see CakeScene). Blocks stand on it.
const BOARD_TOP_Y = 0.1;

// The rail's minimum spacing between stacked items. Used by sidebarNav's `gap` AND as the floor for
// the measured tools gap below the divider — one number, because the two groups sit in one column
// and any disagreement shows up as the bottom pair being crammed together on a short window.
const RAIL_MIN_GAP = 2;
import { BOARD_TIER } from './canvas/FinishHandles.jsx';
import { finishToMaterial, finishOf } from './geometry/finish.js';
import { SHELL_HEIGHT_FRAC, getShellExtents, getFestoonExtents, festoonSig, resolveSidePipingBands, sidePipingClearance } from './canvas/pipingMetrics.js';
import { pipingAllowedArrangements, pipingDefaultArrangement, pipingPlacementFromConfig, makePipingLayer } from './piping/pipingLayer.js';
import { useCakeDesign, normalizeDesign } from './hooks/useCakeDesign';
import { useDesignSession } from './hooks/useDesignSession';
import SessionPanel from './SessionPanel.jsx';
import { captureThumbnailBlob, uploadThumbnail, captureAndUploadThumbnail, previewPosition } from './utils/thumbnail.js';
import { buildDesignSnapshot } from './utils/designSnapshot.js';
import { GOLD_LEAF_DEFAULTS, GOLD_LEAF_COLORS } from './shared/textures/goldLeafFlakes.js';
import { useImageRegions } from './shared/color/useImageRegions.js';
import PreviewTile from './shared/PreviewTile.jsx';
import AnchoredPopup from '../shared/AnchoredPopup.jsx';
import MyDecorationStudio from './decorations/MyDecorationStudio.jsx';
import UploadsPanel from './decorations/UploadsPanel.jsx';
import FrostingTypePicker from './controls/FrostingPicker.jsx';
import FrostingStylePicker from './controls/FrostingStylePicker.jsx';
import StyleControls from './controls/StyleControls.jsx';
import { frostingSupportsGradient, frostingAllowsStyles, stylesForFrosting, applyMaterialConfig, frostingDef } from './frostings.js';
import { applyDecorMaterialConfig } from './materials.js';
import { GLAZE_DEFAULTS } from './shared/glaze/glazeMaterial.js';
import { applyTextureConfig, DEFAULT_STYLE, userStyleParams, resolveStyleParams } from './creamStyles.js';
import { applyTextStyleConfig } from './textStyles.js';
import { applyCakeShapeConfig, cakeShapeList } from './cakeShapes.js';
import ShapePicker from './controls/ShapePicker.jsx';
import TierShapeControls, { hasShapeControls } from './controls/TierShapeControls.jsx';
import { CREAM_FONTS, DEFAULT_CREAM_FONT, creamFontPreview } from './geometry/creamText.js';
import { NOZZLE_BY_KEY, HEAP_HEIGHT_PER_DIAMETER } from './geometry/creamPen.js';
import { SECOND_CREAM_PRESETS, paintProfile } from './geometry/secondCreamLayer.js';   // drives the "Cream layer" finish element
import ColorGuide from '../chefsdesk/ColorGuide';
import EdiblePrintStudio from '../chefsdesk/EdiblePrintStudio.jsx';
import OrderModal from '../orders/OrderModal';
import OrdersPanel from '../orders/OrdersPanel';
import CustomersPanel from '../customers/CustomersPanel';
import InvitePanel from '../customers/InvitePanel';
import DashboardPanel from '../dashboard/DashboardPanel';
import SettingsPanel from '../settings/SettingsPanel';
import FlavoursPanel from '../settings/FlavoursPanel';
import TemplatesPanel from '../settings/TemplatesPanel';
import BillingPanel from '../settings/BillingPanel';
import CreditsPill from '../billing/CreditsPill.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import BuyCreditsPanel from '../billing/BuyCreditsPanel.jsx';
import { PrivacyDataSection } from '../settings/PrivacyDataPanel.jsx';
import PastDueBanner, { PAST_DUE_BAR_H } from '../billing/PastDueBanner.jsx';
import DesignTour from './tour/DesignTour.jsx';
import { DEFAULT_LEGAL_BASE } from '../legal/links.js';


// ── Staff accounts are hidden ────────────────────────────────────────────────────────
// The feature WORKS — the modal, POST /api/baker/staff, the `staff:manage` capability and the
// per-plan `max_team_members` entitlement all exist. What is not settled is whether we ship team
// seats as a product at all, so it is not advertised on the pricing page and it should not be
// discoverable in the app either. Selling nothing while quietly shipping it to whoever opens the
// menu is the worst of both.
//
// A flag rather than deleting the buttons, because nothing here is wrong — only undecided. One
// line to bring it back, and the modal below stays exercised by the same state it always was.
// If seats are dropped for good, this and everything it guards can go together.
const STAFF_UI_ENABLED = false;

// ── The Invite rail item ────────────────────────────────────────────────────────────────────────
// Hidden, not removed. Inviting a customer by email predates the storefront: it was how a baker got
// somebody into a design at all. The storefront is now the single front door for customers — they
// arrive at a published shop, pick, and send an enquiry — so a second, parallel way in mostly
// invites the question of which one is the real one.
//
// A flag rather than a deletion, because the invite machinery is not broken and it is not
// unreachable: "Share the draft" and the live co-design session BOTH open the same InvitePanel, and
// both still make sense — they invite a customer to a SPECIFIC design that already exists, which is
// a different act from "come and start something". Only the standalone rail entry, the one that
// starts from nothing and duplicates the storefront, goes quiet. One line brings it back.
const INVITE_UI_ENABLED = false;

// ── The Design Together rail item ───────────────────────────────────────────────────────────────
// Not in V1. Live co-design — baker and customer in the same room, editing one cake — is built and
// works, but it is a feature that has to be SUPPORTED once it exists: two people, a socket, and a
// baker on a phone in a kitchen. It is not what V1 is being judged on.
//
// Note this is a SECOND gate, not the only one. `codesign.live` already hides the item when the
// host provides no session API — that is a capability check, answering "can this build do it". This
// one answers "do we SHIP it", which is a different question with a different owner, so it gets its
// own line rather than being smuggled into the capability test.
//
// The machinery underneath stays live: SessionPanel, the Realtime channel, and the invite-into-
// session flow are all untouched, so an existing session still works and nothing rots. Only the way
// IN from the rail is closed.
const CODESIGN_UI_ENABLED = false;

// Tier caps are hardcoded — tiers are not element_types rows, they're the cake structure itself
const TIER_CAPS   = { color: true, gradient: true, resize: false, style: false, fontSize: false, duplicate: false, delete: false };

// Thumbnail src for any item (element / template / piping card): prefer the
// pre-baked WebP (thumb_key), fall back to the raw thumbnail_url. Served DIRECT
// from R2 — the old Cloudflare /cdn-cgi/image transform 404'd on the r2.dev
// endpoint (no zone) and was removed.
/* The reel's shape, as a NUMBER — the frame box takes `aspectRatio`, which accepts one, and the
 * photo swaps it for whatever shape the baker picked. It was a bare literal in two style branches;
 * a third copy for the photo would have been the point where the phone and the desktop preview
 * could start disagreeing about the frame. */
const REEL_ASPECT = 9 / 16;

const thumbSrc = (item) => item?.thumb_key ?? item?.thumbnail_url ?? null;
// Hide a thumbnail that fails to load so the card shows its neutral background
// instead of the browser's broken-image icon.
const onThumbError = (e) => { e.currentTarget.style.display = 'none'; };

function hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(26,26,26,${alpha})`;
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
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
    // Clamp to [min,max]: a step that doesn't evenly divide (max-min) can round the top notch past max.
    onChange?.(+(Math.min(max, Math.max(min, min + Math.round(u * (max - min) / step) * step))).toFixed(2));
  };

  return (
    <div style={{ width: 46, height: 46, position: 'relative', flexShrink: 0, cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
      onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={e => e.currentTarget.releasePointerCapture(e.pointerId)}>
      <svg viewBox="0 0 48 48" width={46} height={46} style={{ display: 'block', pointerEvents: 'none' }}>
        <path d={band(0, 1)} fill="#e6e0e3" />
        {t > 0.001 && <path d={band(0, t)} fill="#1a1a1a" />}
        <circle cx={knob[0]} cy={knob[1]} r={4.5} fill="#fff" stroke="#1a1a1a" strokeWidth={2} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Quicksand',sans-serif", pointerEvents: 'none' }}>
        {size.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * A horizontally scrolling row that admits it scrolls.
 *
 * Fifteen presets, seven visible, and the seventh landed 5px short of the edge — near enough to a
 * clean end that the row read as "these are the colours". Exactly the defect the sheet had
 * vertically, rotated ninety degrees, so it gets the same answer: a fade at the edge that is there
 * while there is more and gone when there is not.
 */
function ScrollFadeRow({ children, style }) {
  const ref = useRef(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [children]);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={ref} className="spattoo-noscrollbar" style={style}>{children}</div>
      {more && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, bottom: 0, right: 0, width: 30, pointerEvents: 'none',
          background: 'linear-gradient(to right, rgba(255,253,249,0), rgba(255,253,249,0.95))',
        }} />
      )}
    </div>
  );
}

// ── Color picker (react-colorful) ─────────────────────────────────────────────
function ColorWheel({ color, onChange, cakeColors = [], width = 216, compact = false }) {
  // Common cake piping colour presets
  const PRESETS = [
    '#ffffff','#f5e6c8','#f5b8c8','#e8a0b0','#c8b5e8',
    '#b5c8e8','#b5e8d5','#f0c040','#e87040','#5c3d2e',
    '#3e2010','#1a1a1a','#d4af37','#8b1a1a','#2e5c3e',
  ];
  // ── What you SEE and what you can TAP are different sizes ───────────────────────────────────
  // These were 22px, half the touch floor, in four wrapped rows. Making the whole circle 44 fixed the
  // target and overshot the drawing — a row of 44px discs reads as buttons rather than colour chips,
  // and dominates a sheet where the picker is the main event.
  //
  // So the circle is 32 and the tap area around it is still 44. The floor is about what a thumb can
  // hit, not about how big the paint is, and conflating the two is why it looked wrong.
  const HIT = 44;
  const dot = compact ? 32 : Math.max(18, Math.round(width / 9.8));
  const swatch = (c, key) => {
    const circle = (
      <div style={{
        width: dot, height: dot, borderRadius: '50%', background: c,
        border: color.toLowerCase() === c.toLowerCase() ? '2.5px solid #1a1a1a' : '1.5px solid #999999',
        boxSizing: 'border-box', flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }} />
    );
    if (!compact) return <div key={key} onClick={() => onChange(c)} style={{ cursor: 'pointer', display: 'flex' }}>{circle}</div>;
    return (
      <div key={key} onClick={() => onChange(c)} style={{
        width: HIT, height: HIT, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{circle}</div>
    );
  };

  // ── Phone: swatches FIRST, in one row that scrolls ──────────────────────────────────────────
  // Order is the whole point. The sheet opens short, so whatever is at the top is what a baker can
  // reach without doing anything — and picking a preset is the common case, while the gradient
  // picker is the rare one. It used to be the other way round: the picker sat on top and the
  // swatches were below the fold of a sheet that covered the cake anyway.
  //
  // The picker stays, directly underneath. It does not need a disclosure of its own because the
  // sheet's drag handle already is one — pull up and it is there.
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        {/* gap 2, not 8: each swatch already carries 6px of invisible tap area on either side, so a
            wider gap here is spacing added to spacing. */}
        <ScrollFadeRow style={{
          display: 'flex', gap: 2, overflowX: 'auto', padding: '2px 0 4px',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {PRESETS.map(c => swatch(c, c))}
          {cakeColors.length > 0 && (
            // A rule rather than a heading: "Colors from cake" cost a whole line of the sheet's
            // height to label six swatches that are self-evident once they are beside the presets.
            <div aria-label="Colors from cake"
                 style={{ flexShrink: 0, width: 1, alignSelf: 'stretch', margin: '4px 2px', background: 'rgba(0,0,0,0.16)' }} />
          )}
          {cakeColors.map((c, i) => swatch(c, `cake-${i}`))}
        </ScrollFadeRow>
        <HexColorPicker color={color} onChange={onChange}
                        style={{ width: '100%', height: 150 }} />
      </div>
    );
  }

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
            color: '#1a1a1a', textTransform: 'uppercase', marginBottom: 7, textAlign: 'center',
          }}>Colors from cake</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {cakeColors.map((c, i) => swatch(c, `cake-${i}`))}
          </div>
        </div>
      )}
    </div>
  );
}

// Gradient (multi-colour) controls — the swatch chips + direction toggle that sit under the
// colour wheel. Purely presentational and SHARED by every colour popup (sticker, piping, …): the
// caller owns the stops/mode (read off whatever instance it edits) and the write callbacks. This is
// the one place the gradient editor UI lives — there is no per-element-type copy.
//   stops      : array of hex strings (1 = solid, 2–3 a gradient)
//   activeStop : index the wheel is currently editing
//   mode       : 'swirl' | 'vertical' | 'linear'
//   modes      : which directions to offer (default all three); a single entry fixes the direction
//                and hides the toggle (the cake base is vertical-only).
//   balance    : 0..1 blend bias (0.5 = even). Omit to hide the balance slider (sticker/piping today).
//   pending    : when true the LAST entry in `stops` is an empty placeholder (a null) — the user
//                clicked "+" but hasn't picked its colour yet. It renders as a dashed "pick a colour"
//                chip and isn't a real stop, so direction/balance stay hidden until it's filled.
const MODE_LABELS = { swirl: 'Swirl', vertical: 'Vertical', linear: 'Linear' };
function GradientControls({ stops, activeStop, mode, onSelectStop, onAddStop, onRemoveStop, onModeChange,
                            modes = ['swirl', 'vertical', 'linear'], balance, onBalanceChange, pending = false,
                            label = 'Gradient colors', maxStops = 3 }) {
  const realCount = stops.length - (pending ? 1 : 0);   // gradient is "real" only with ≥2 filled stops
  return (
    <div style={s.gradientBlock}>
      <div style={s.gradientLabel}>{label}</div>
      <div style={s.gradientStops}>
        {stops.map((c, i) => {
          const isPlaceholder = pending && i === stops.length - 1;
          return (
            <div key={i} style={s.gradientStopWrap}>
              <div onClick={() => onSelectStop(i)} title={isPlaceholder ? 'Pick a color' : `Stop ${i + 1}`}
                style={{ ...s.gradientStop,
                  ...(isPlaceholder
                    ? { background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', opacity: 0.55,
                        borderStyle: 'dashed', borderWidth: i === activeStop ? 2.5 : 2,
                        borderColor: i === activeStop ? '#1a1a1a' : '#999999' }
                    : { background: c, border: i === activeStop ? '2.5px solid #1a1a1a' : '1.5px solid #999999' }) }} />
              {!isPlaceholder && stops.length > 1 && (
                <button style={s.gradientStopRemove} title="Remove color"
                  onClick={() => onRemoveStop(i)}>×</button>
              )}
            </div>
          );
        })}
        {!pending && stops.length < maxStops && (
          <button style={s.gradientStopAdd} title="Add color" onClick={onAddStop}>+</button>
        )}
      </div>
      {pending && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6c47ff', marginTop: 4 }}>
          Pick a color for the new stop
        </div>
      )}
      {realCount >= 2 && modes.length > 1 && (
        <div style={s.gradientModes}>
          {modes.map(m => (
            <button key={m} onClick={() => onModeChange(m)}
              style={{ ...s.gradientMode, ...(mode === m ? s.gradientModeOn : null) }}>
              {MODE_LABELS[m] ?? m}
            </button>
          ))}
        </div>
      )}
      {realCount >= 2 && balance != null && (
        <div style={{ marginTop: 10 }}>
          <div style={s.gradientLabel}>Balance</div>
          <input type="range" min={0.2} max={0.8} step={0.01} value={balance}
            onChange={e => onBalanceChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a1a1a' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#888' }}>
            <span>Primary</span><span>Secondary</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stripe controls ─────────────────────────────────────────────────────────────────────────────
 *
 * Several colours up the wall (shared/color/stripeMaterial.js). WRAPS GradientControls for the
 * palette rather than drawing a second row of swatches — it is the same job (pick some colours, edit
 * one at a time) and the codebase already says that editor lives in exactly one place. What is added
 * is the three things stripes have and an ombre does not.
 *
 * `count` is what makes two colours into a striped cake. ⚠️ Its hint mentions the ODD trick on
 * purpose: an odd count over an even palette puts the same colour top and bottom, which is what a
 * baker means by "stripes" and is unreachable if you think of it as repeating the palette N times.
 */
function StripeControls({ palette, activeStop, pending, onSelectStop, onAddStop, onRemoveStop,
                          count, softness, wobble, onCountChange, onSoftnessChange, onWobbleChange,
                          presets, onPreset }) {
  const colours = palette.length - (pending ? 1 : 0);
  return (
    <div>
      {/* Starting points: choosing six colours that work together is a colourist's job, and a blank
          palette is where this feature turns into eight saturated colours at softness 0.8.

          ⚠️ SWATCH-FIRST and wrapped, not a stacked list of labelled buttons. Five full-width rows
          cost ~250px, and on desktop every section of this panel is stacked in ONE scrolling column —
          which pushed the colour wheel so far above the stripe chips that changing a stripe's colour
          meant scrolling up to a control you could no longer see. The swatch is the useful part
          anyway: it shows the cake, where the name only names it. */}
      <div style={s.gradientBlock}>
        <div style={s.gradientLabel}>Start from</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {Object.entries(presets).map(([key, preset]) => (
            <button key={key} onClick={() => onPreset(key)} title={`${preset.label} — ${preset.note}`}
              aria-label={preset.label} style={s.stripePreset}>
              <span style={{ display: 'flex', flexDirection: 'column-reverse', width: 26, height: 30,
                             borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                {stripeColors(preset).map((c, i) => (
                  <span key={i} style={{ flex: 1, background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <GradientControls
        stops={palette} activeStop={activeStop} pending={pending}
        label="Stripe colours" maxStops={MAX_STRIPES}
        onSelectStop={onSelectStop} onAddStop={onAddStop} onRemoveStop={onRemoveStop}
        mode="vertical" modes={['vertical']} onModeChange={() => {}}
      />

      {colours >= 2 && (
        <div style={s.gradientBlock}>
          {/* ⚠️ width 100%: gradientBlock is a centred column, so a row without it shrinks to its
              content and the label sits glued to its value — "HOW MANY STRIPES6". */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
            <div style={s.gradientLabel}>How many stripes</div>
            <span style={s.stripeValue}>{count}</span>
          </div>
          <input type="range" min={2} max={MAX_STRIPES} step={1} value={count}
            onChange={e => onCountChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a1a1a' }} />
          <div style={s.stripeHint}>
            {count === colours ? 'One stripe per colour.' : `Your ${colours} colours repeat.`}
            {' '}An odd number matches top and bottom.
          </div>

          <div style={{ ...s.gradientLabel, marginTop: 12, width: '100%' }}>Softness</div>
          <input type="range" min={0} max={1} step={0.01} value={softness}
            onChange={e => onSoftnessChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a1a1a' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#888', width: '100%' }}>
            <span>Crisp</span><span>Blended</span>
          </div>

          <div style={{ ...s.gradientLabel, marginTop: 12, width: '100%' }}>Hand-scraped</div>
          <input type="range" min={0} max={1} step={0.01} value={wobble}
            onChange={e => onWobbleChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a1a1a' }} />
          <div style={s.stripeHint}>A little of this reads as iced by hand.</div>
        </div>
      )}
    </div>
  );
}

// Texts colour picker — the wheel plus a "Metallic" toggle that turns the chosen
// cream colour into a shiny, shimmery metallic finish. Used both inline (mobile) and
// in the desktop left-side flyout.
function WritingColourPicker({ writing, design, setWriting, width = 208 }) {
  const w = writing ?? {};
  const metallic = !!w.metallic;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <ColorWheel color={w.color ?? '#ffffff'} onChange={c => setWriting({ color: c })}
        cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== (w.color ?? '#ffffff').toLowerCase())} width={width} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', width, justifyContent: 'center' }}>
        <button type="button" role="switch" aria-checked={metallic}
          onClick={() => setWriting({ metallic: !metallic })}
          style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
            background: metallic ? '#caa12f' : '#e3d4da', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 2, left: metallic ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
            background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: metallic ? '#7a5a12' : '#666' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#fff 0%,#d9c47a 45%,#a8842a 100%)', border: '1px solid #c9b88a' }} />
          Metallic
        </span>
      </label>
    </div>
  );
}

// Compact labelled range row — used by the Cream Pen tool panel.
function PenSlider({ label, value, min, max, step, onChange, fmt = v => v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#555', minWidth: 56, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0, accentColor: '#1a1a1a' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a', minWidth: 32, flexShrink: 0, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

// Tier chooser shared by the tier-finish cards (food foil, second cream layer): a finish edits ONE
// tier at a time, so tapping a number switches which. Hidden on single-tier cakes. Config-free —
// the SAME picker for any finish (no slug/type branch). Lives in ONE place so the two finish cards
// don't each carry a copy (the jscpd duplication gate).
function FinishTierPicker({ tiers, tier, onPick }) {
  if (tiers.length <= 1) return null;
  const btn = (active) => ({ minWidth: 26, padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: active ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8', background: active ? '#3D5A44' : '#fff', color: active ? '#fff' : '#3D5A44' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={s.editPanelLabel}>Tier</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {tiers.map((_, i) => (
          <button key={i} style={btn(tier === i)} onClick={() => onPick(i)}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}

// Cream-pen font swatch — renders the font's own single-stroke shapes (not a system face)
// so bakers pick by the real piped look. The centerline path is stroked with round caps.
function CreamFontButton({ fontKey, label, selected, onClick }) {
  const { d, width, height } = useMemo(() => creamFontPreview(fontKey, 'Abc'), [fontKey]);
  const sw = Math.max(width, height) * 0.05;   // bead ≈ 5% of glyph extent
  const active = selected ? '#1a1a1a' : '#999999';
  return (
    <button key={fontKey} onClick={onClick} title={label}
      style={{ padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${active}`, background: selected ? '#F2F1EE' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 64, height: 34 }}>
      <svg viewBox={`${-sw} ${-sw} ${width + sw * 2} ${height + sw * 2}`} height={22}
        style={{ display: 'block', maxWidth: 96 }} preserveAspectRatio="xMidYMid meet">
        <path d={d} fill="none" stroke={selected ? '#1a1a1a' : '#777'}
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


// ── Filter ────────────────────────────────────────────────────────────────────
const CAT_LABEL = { occasion: 'Occasion', style: 'Style', color: 'Color', material: 'Material', theme: 'Theme', age_group: 'Age group', gender: 'Gender' };
const TMPL_CATS = ['occasion', 'style', 'color', 'age_group', 'gender'];

function FunnelIcon({ size = 15, active }) {
  const c = active ? '#1a1a1a' : '#888';
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
    <div style={{ borderBottom: '1px solid #999999', marginBottom: 6 }}>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 6px' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <FunnelIcon active={activeCount > 0 || open} />
          {activeCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, color: '#1a1a1a', fontFamily: "'Quicksand', sans-serif" }}>{activeCount}</span>
          )}
        </button>
        {activeCount > 0 && (
          <button onClick={() => onChange({})} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#1a1a1a', fontWeight: 700, fontFamily: "'Quicksand', sans-serif" }}>
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
                          style={{ padding: '3px 8px', borderRadius: 20, border: `1.5px solid ${on ? '#1a1a1a' : '#999999'}`, background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#666', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", lineHeight: 1.4 }}
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
// A "top & side" decor element can be placed on BOTH the top surface and the side wall.
// Support is declared via allowed_zones (canonical) and/or placement_config keys.
function supportsTopAndSide(el) {
  const zones = el?.allowed_zones ?? [];
  const pc = el?.placement_config ?? {};
  const hasTop  = zones.includes('top_surface') || !!pc.top_surface;
  const hasSide = zones.includes('side') || !!pc.side;
  return hasTop && hasSide;
}

// PreviewTile now lives in ./shared/PreviewTile.jsx (imported above) — the upload studio needs the
// same tile, so it is ONE component, not a second copy. Its `locked` prop carries the
// allowed_actions.delete rule (0.1.68); the extraction kept it.

// Tilt stepper (−/°/+) — decor-specific (piping has no tilt); paired with the shared SizeDial.
// Nudge one lean axis, through the shared clamp (placement.js) so this and the chooser's TiltRow
// cannot end up with different limits.
const leanStep = (v, d) => clampLean((v ?? 0) + d);
const leanDeg  = (v) => `${Math.round((v ?? 0) * 180 / Math.PI)}°`;

// Tilt is TWO axes: ↑↓ leans front/back, ←→ leans left/right (on a wall, that second one spins the
// element in the plane of the wall). Four arrows in one row rather than two −/+ rows: the mapping to
// what is on screen is direct, and it costs less width on a phone.
function TiltRow({ tiltAngle, rollAngle, onChange }) {
  const ta = tiltAngle ?? 0, ra = rollAngle ?? 0;
  return (
    // Wraps and centres: label + four arrows + the readout is wider than the ~180px element card,
    // and a nowrap row inside a clipping panel loses whichever end falls off — which is how the SIZE
    // dial beside this one came to be invisible.
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: '#b29aa2', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tilt</span>
      <button style={s.tbIconBtn} title="Lean back"  onClick={() => onChange({ tiltAngle: leanStep(ta, -0.1) })}>↑</button>
      <button style={s.tbIconBtn} title="Lean forward" onClick={() => onChange({ tiltAngle: leanStep(ta,  0.1) })}>↓</button>
      <button style={s.tbIconBtn} title="Lean left"  onClick={() => onChange({ rollAngle: leanStep(ra, -0.1) })}>←</button>
      <button style={s.tbIconBtn} title="Lean right" onClick={() => onChange({ rollAngle: leanStep(ra,  0.1) })}>→</button>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 46, textAlign: 'center' }}>{leanDeg(ta)}/{leanDeg(ra)}</span>
    </div>
  );
}

// Bury stepper (−/%/+) — how far an INSERTED decoration's base sinks INTO the cake. Only meaningful
// for an inserted instance (insertDepth != null), the same signal the renderer's isInsert uses.
// Writes the length-FRACTION buried (0 = flush/standing, 0.5 = half-buried) the renderer already reads.
function BuryRow({ insertDepth, onChange }) {
  const bd = insertDepth ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: '#b29aa2', textTransform: 'uppercase', letterSpacing: 0.5 }}>Bury</span>
      <button style={s.tbIconBtn} onClick={() => onChange(Math.max(0, +(bd - 0.05).toFixed(2)))}>−</button>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{Math.round(bd * 100)}%</span>
      <button style={s.tbIconBtn} onClick={() => onChange(Math.min(0.5, +(bd + 0.05).toFixed(2)))}>+</button>
    </div>
  );
}

// Placement chooser — one PreviewTile per valid (tier × surface) SLOT the element allows, each
// an INDEPENDENT add/remove checkbox (check = place, uncheck = remove). A placed slot gets its own
// Size dial + Tilt — the SAME SizeDial the cream-piping popup uses (no clamp; sizes freely).
// `slots` = [{ key, placement, tierIndex, label, checked, sticker }]; `onUpdate(id, changes)` edits.
// ⚠️ `locked` is now always FALSE from every caller, and the prop survives only because the piping
// path still uses it for a different reason. It used to carry allowed_actions.delete === false —
// "this may be ADDED but not un-ticked" — and that rule is gone: a customer cannot be made to keep
// something on their own cake, so EVERY element is deletable. The field is still on the row and the
// admin form still shows it, ticked and locked, so the rule is visible rather than merely absent.
/* ⚠️ `canResize` / `canTilt` — the element's allowed_actions, which this used to ignore entirely.
 *
 * It took only `locked` (delete), and rendered Size AND Tilt for every placed slot regardless of
 * config. Two consequences, both reported: a topper with `tilt: false` in admin showed a Tilt row
 * anyway, and — because Size + Tilt together measure wider than the ~184px card — the row overflowed
 * and the LEFT-most control was painted outside it. `resize: true` looked like a missing Size dial.
 *
 * The scatter path gated both of these on the capability from the start; this path never did. Same
 * flags, same meaning, one place fewer for them to be inert. */
function PlacementChooser({ previewUrl, tiers, baseRotation = null, slots = [], locked = false,
                            canResize = true, canTilt = true, onToggle, onUpdate }) {
  const cap = { fontSize: 8.5, fontWeight: 700, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 };
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: 0.3, marginBottom: 6 }}>PLACEMENT</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.map(slot => (
          <div key={slot.key}>
            <PreviewTile checked={slot.checked} onToggle={() => onToggle(slot)} label={slot.label} height={116} locked={locked}>
              <TopperPreview glbUrl={previewUrl} placement={slot.placement} mode={slot.mode} tiers={tiers} tierIndex={slot.tierIndex} baseRotation={baseRotation} />
            </PreviewTile>
            {slot.sticker && (
              /* ⚠️ WRAPS, and the gap is small enough that Size + Tilt fit side by side.
                 Without this the row is a nowrap centred flex line inside a 200px panel that clips:
                 Size + Tilt + Bury measured wider than the card, and centring split the overflow BOTH
                 ways, so the left-most control — the Size dial — was laid out at x 1056 against a card
                 starting at 1090 and simply painted outside it. It was in the DOM, opaque, the right
                 colour, and invisible. Reported as "resizable is on and the size control is missing",
                 which is exactly what it looked like. */
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            flexWrap: 'wrap', gap: '8px 14px', marginTop: 8 }}>
                {canResize && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  {/* Hero hug auto-sizes to the tier wall; the dial nudges a multiplier (hugMul,
                      default 1×) rather than an absolute scale. Stand uses absolute scale (r). */}
                  {isDynamicHug(slot.sticker)
                    ? <SizeDial size={slot.sticker.hugMul ?? 1} min={0.3} max={3} step={0.05} onChange={v => onUpdate(slot.sticker.id, { hugMul: v })} />
                    : <SizeDial size={slot.sticker.scale ?? 1} min={slot.scaleRange?.min ?? 0.5} max={slot.scaleRange?.max ?? 8} step={slot.scaleRange?.step ?? 0.1} onChange={v => onUpdate(slot.sticker.id, { scale: v })} />}
                  <span style={cap}>Size</span>
                </div>
                )}
                {canTilt && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
                  <TiltRow tiltAngle={slot.sticker.tiltAngle} rollAngle={slot.sticker.rollAngle}
                           onChange={patch => onUpdate(slot.sticker.id, patch)} />
                </div>
                )}
                {/* Bury — only for an inserted instance (insertDepth != null), same signal as the renderer. */}
                {slot.sticker.insertDepth != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
                    <BuryRow insertDepth={slot.sticker.insertDepth} onChange={v => onUpdate(slot.sticker.id, { insertDepth: v })} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ONE grid of elements — no element_type headings, and no empty groups.
 *
 * The panel used to render a card per element_type: CREAM PIPING, FOOD FOIL, BUTTERFLY, IMAGE
 * TOPPER. Those names are OUR taxonomy — they decide which placement rules an element inherits —
 * and they mean nothing to somebody shopping for a baby-clothes topper. What a customer navigates
 * is a CATEGORY, and under it, elements. So the headings are gone, and the groups with them.
 *
 * ⚠️ Dropping the groups is what fixes the reported bug, and it is the same bug. Searching "clo"
 * listed FOOD FOIL and BUTTERFLY, each saying "No elements yet" — an answer to a question nobody
 * asked, pushing the four real matches below the fold. A group can only be empty on screen if it
 * has a name to be empty UNDER; with the name gone there is nothing left to draw, browsing or
 * searching.
 *
 * The type still decides how a tile is DRAWN — an image topper is a picture whose edges matter, so
 * it is fitted whole rather than cropped. That now travels per element instead of per group.
 *
 * ⚠️ crossOrigin is unconditional. Every caller already passed it: a tile <img> caches the asset
 * CORS-clean and the SAME url is later loaded as a WebGL texture (placement preview, on-cake), which
 * a non-CORS cache entry would refuse. The src must go through corsUrl for that warming to land —
 * the texture path asks for the QUALIFIED url, so a tile fetching the raw one warms an entry nobody
 * reads (see assetUrl.js).
 */
function ElementGrid({ items = [], onElementTap, onDragStartSticker }) {
  if (!items.length) return null;

  // Grid-item pointer handler, disambiguating tap vs drag. Per INVARIANTS #6 EVERY element is
  // click-to-place: a tap calls tapPlaceElement (drops it on its default surface and opens its edit
  // popup); drag is the alternative for precise positioning. No tappable/type/zone gate — the panel
  // treats every element identically.
  const gridPointerDown = (el, e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    const move = ev => {
      if (dragging) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        dragging = true;
        cleanup();
        onDragStartSticker?.(el, ev.clientX, ev.clientY);
      }
    };
    const up = () => { cleanup(); if (!dragging) onElementTap?.(el); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ ...s.elementCard, cursor: 'default' }}>
      {/* One hint for one grid. The per-type wording it replaces ("Drag onto TOP of cake to place")
          described a rule the element enforces for itself — an image topper lands on its own zone
          however it is placed — and it cannot be said per group when there are no groups. */}
      <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Tap or drag onto the cake to place</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(({ el, objectFit }) => (
          <div key={el.id} onPointerDown={e => gridPointerDown(el, e)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}>
            <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #999999' }}>
              {thumbSrc(el) && <img src={corsUrl(thumbSrc(el))} alt={el.name} width={64} height={64} loading="lazy" decoding="async" onError={onThumbError} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit, pointerEvents: 'none' }} />}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
          </div>
        ))}
      </div>
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

// Uploads — a picture (frame + hill + sun), matching the stroke weight of the other rail icons.
function TourIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.9 2.9 0 1 1 3.6 3.6c-.5.2-.8.7-.8 1.2v.5" />
      <circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UploadsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 15.5l-4.5-4.5L7 20.5" />
    </svg>
  );
}

// "My decorations" — the one card in the category grid that can never have a photo on it.
//
// Every other tile shows a real decoration, because a category is a shelf of things and the picture
// IS the label. This one is not a shelf, it is an ownership filter with no row in element_categories
// to hang a thumbnail_url on, so there is nothing to upload and nowhere to put it. Showing the
// customer's own first decoration would have been the nice answer and is the one thing the grid
// cannot afford: knowing what is in here means fetching the whole catalogue, which is exactly what
// the grid exists to defer. So it is drawn.
//
// A STACK of pictures, deliberately built from the same frame-and-hill mark as UploadsIcon. The two
// are neighbours in this panel and the relationship is real — these are your uploads, filed — so the
// icon should rhyme with that one rather than invent a second visual language for the same idea. The
// second sheet behind it is what makes it "several of mine" instead of "a picture", and it is drawn
// as an open corner rather than a full rectangle so the two outlines never cross and turn to mud at
// 30px.
function MyDecorationsIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {/* The sheet behind: top and right edges only. */}
      <path d="M7.6 6.4V4.7A1.7 1.7 0 0 1 9.3 3h10A1.7 1.7 0 0 1 21 4.7v10a1.7 1.7 0 0 1-1.7 1.7h-1.7" />
      {/* The one in front, with the same sun and hill Uploads uses. */}
      <rect x="3" y="7.6" width="14.6" height="13.4" rx="2.2" />
      <circle cx="7.1" cy="11.7" r="1.35" />
      <path d="M17.6 17.6l-3.9-3.9L6.4 21" />
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

function LockIcon({ size = 44 }) {
  // Padlock, shackle closed — the access-gate mark. Replaces a pictographic emoji
  // (INVARIANTS #7: zero emoji in UI, empty states included).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" strokeWidth="1.6" />
      <path strokeWidth="1.6" d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" />
      <circle cx="12" cy="15.5" r="1.25" fill="currentColor" stroke="none" />
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

function InviteIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function CoDesignIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17.5" cy="9.5" r="2.2" />
      <path d="M15.6 20a5 5 0 0 1 6.4-4.8" />
    </svg>
  );
}

function MoreIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

/* The two takes. Same 24-grid, same 1.8 stroke, currentColor — so each takes the colour of whatever
 * it sits in, whether that is a dark button or a white menu row. */
function CameraIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* The raised hump over the lens is what reads as "camera" at 15px; a plain rectangle with a
          circle in it reads as nothing at all. */}
      <path d="M3 8.5a2 2 0 012-2h1.9a1.5 1.5 0 001.28-.72l.64-1.06A1.5 1.5 0 0110.1 4h3.8a1.5 1.5 0 011.28.72l.64 1.06a1.5 1.5 0 001.28.72H19a2 2 0 012 2v8.5a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <circle cx="12" cy="12.75" r="3.25" />
    </svg>
  );
}

function ReelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18M8 5l-2 4.5M14 5l-2 4.5M20 5l-2 4.5" />
    </svg>
  );
}

// One shared upward popover for the mobile baker action bar (so the item styling / overlay live in ONE
// place). align 'left' | 'right' | 'center' positions it against its anchor and keeps it on-screen.
const SHEET_ITEM = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '12px', fontSize: 14, color: '#1a1a1a', cursor: 'pointer', borderRadius: 8, whiteSpace: 'nowrap' };
function ActionSheet({ open, onClose, align = 'left', children }) {
  if (!open) return null;
  const pos = align === 'center' ? { left: '50%', transform: 'translateX(-50%)' } : { [align]: 0 };
  return (<>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
    <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', ...pos, minWidth: 210, background: '#fff', borderRadius: 12, boxShadow: '0 10px 34px rgba(0,0,0,0.20)', padding: 6, zIndex: 40 }}>
      {children}
    </div>
  </>);
}
// ── Spatula silhouette ─────────────────────────────────────────────────────────
// The sidebar is shaped like a silicone spatula: rounded top cap + hang-hole, a
// long straight handle (stretches to the column height), then an asymmetric
// rounded-rectangle blade at the bottom. Proportions traced from the design ref;
// each bottom corner is a cubic (cornerH = where it leaves the vertical edge,
// cornerW = how far it reaches along the bottom). See dev/spatula-menu.html.
function spatulaFramePath({
  W, handleHalf, bladeHalf, capTopY,
  lShoulderY, rShoulderY, bladeFullY, bladeBotY,
  lCornerH, lCornerW, rCornerH, rCornerW,
}) {
  const cx = W / 2;
  const capR = handleHalf;
  const capCY = capTopY + capR;
  const Lh = cx - handleHalf, Rh = cx + handleHalf;
  const Lb = cx - bladeHalf,  Rb = cx + bladeHalf;
  const rEdgeBotY = bladeBotY - rCornerH, flatR = Rb - rCornerW;
  const lEdgeBotY = bladeBotY - lCornerH, flatL = Lb + lCornerW;
  const rSh = bladeFullY - rShoulderY;
  const lSh = bladeFullY - lShoulderY;
  return [
    `M ${cx} ${capTopY}`,
    `A ${capR} ${capR} 0 0 1 ${Rh} ${capCY}`,
    `L ${Rh} ${rShoulderY}`,
    `C ${Rh} ${rShoulderY + rSh * 0.5} ${Rb} ${bladeFullY - rSh * 0.5} ${Rb} ${bladeFullY}`,
    `L ${Rb} ${rEdgeBotY}`,
    `C ${Rb} ${bladeBotY} ${flatR + (Rb - flatR) * 0.45} ${bladeBotY} ${flatR} ${bladeBotY}`,
    `L ${flatL} ${bladeBotY}`,
    `C ${flatL - (flatL - Lb) * 0.45} ${bladeBotY} ${Lb} ${bladeBotY} ${Lb} ${lEdgeBotY}`,
    `L ${Lb} ${bladeFullY}`,
    `C ${Lb} ${bladeFullY - lSh * 0.5} ${Lh} ${lShoulderY + lSh * 0.5} ${Lh} ${lShoulderY}`,
    `L ${Lh} ${capCY}`,
    `A ${capR} ${capR} 0 0 1 ${cx} ${capTopY}`,
    'Z',
  ].join(' ');
}

// Absolutely-positioned SVG that fills the sidebar (measured) and draws the
// spatula behind the nav. The blade is wider than the handle, so it bulges out
// (overflow visible, pointer-events none so it never blocks the canvas).
function SpatulaFrame() {
  const ref = useRef(null);
  const [h, setH] = useState(720);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setH(el.clientHeight || 720);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── No hang-hole ──────────────────────────────────────────────────────────────────────────────
  // It was the most expensive detail in the rail. The first nav item had to clear the hole's bottom
  // edge (y=71), which is what `sidebarInner`'s top padding was buying — a whole menu item's worth
  // of the most valuable space in the rail, spent on a feature of a real spatula that hangs on a
  // hook. Without it the clearance is the CAP's bottom (y=38), and the silhouette is still
  // unmistakably a spatula: the shape is the cap, the taper and the blade, not the hole.
  //
  // `holeY` survives as an anchor because the cream swirls are positioned relative to it — they are
  // a separate decoration that happens to have been measured from the hole.
  const W = RAIL.svgW, cx = W / 2, handleHalf = 30;
  // The cap's bottom is capTopY + handleHalf = 38 — the clearance sidebarInner's top padding now
  // buys, instead of the hole's 71. Stated here rather than derived, because the padding is CSS on
  // the other side of the file; if this geometry moves, that number moves with it.
  const capTopY = 8, holeY = capTopY + handleHalf + 24;
  const bladeBotY = h - 12;
  const bladeFullY = bladeBotY - 194;     // blade body height (per tuned design)
  const shoulderY  = bladeFullY - 65;     // shoulder span
  const path = spatulaFramePath({
    W, handleHalf, bladeHalf: RAIL.bladeHalf, capTopY,
    lShoulderY: shoulderY, rShoulderY: shoulderY, bladeFullY, bladeBotY,
    lCornerH: 7, lCornerW: 37, rCornerH: 90, rCornerW: 77,
  });
  const swirls = [
    `M ${cx + 12} ${holeY - 16} C ${cx + 32} ${holeY + 10} ${cx + 8} ${holeY + 46} ${cx - 10} ${holeY + 34} C ${cx - 24} ${holeY + 24} ${cx - 14} ${holeY + 2} ${cx + 2} ${holeY}`,
    `M ${cx - 4} ${holeY + 70} C ${cx + 22} ${holeY + 180} ${cx - 22} ${holeY + 300} ${cx + 8} ${holeY + 430}`,
    `M ${cx + 10} ${holeY + 150} C ${cx - 20} ${holeY + 260} ${cx + 20} ${holeY + 400} ${cx - 6} ${holeY + 520}`,
  ];

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`}
        style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', overflow: 'visible' }}>
        <defs>
          {/* The stops live in shared/chrome.js — panel headers render the same surface as CSS,
              and "match the spatula" only holds if both read from one definition. */}
          <linearGradient id="spat-body" x1="0" y1="0" x2="0" y2="1">
            {CHROME_STOPS.map(({ offset, color }) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
          <radialGradient id="spat-sheen" cx="0.36" cy="0.06" r="0.5">
            <stop offset="0" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="spat-soft" x="-60%" y="-6%" width="220%" height="112%">
            <feDropShadow dx="0" dy="7" stdDeviation="16" floodColor="#000" floodOpacity="0.26" />
          </filter>
          <filter id="spat-blur"><feGaussianBlur stdDeviation="9" /></filter>
          <filter id="spat-blurHole"><feGaussianBlur stdDeviation="2.5" /></filter>
          {/* 3D: thin edge sheen (top-left light) + thin inner shadow → flat, not chunky */}
          <filter id="spat-spec" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
            <feSpecularLighting in="b" surfaceScale="2.5" specularConstant="0.62" specularExponent="22" lightingColor="#d7dbe2" result="s">
              <feDistantLight azimuth="235" elevation="30" />
            </feSpecularLighting>
            <feComposite in="s" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id="spat-inner" x="-30%" y="-30%" width="160%" height="160%">
            <feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
            <feGaussianBlur stdDeviation="3.5" result="ab" />
            <feOffset in="ab" dx="0" dy="-0.5" result="o" />
            <feFlood floodColor="#000" floodOpacity="0.45" />
            <feComposite in2="o" operator="in" result="sh" />
            <feComposite in="sh" in2="SourceAlpha" operator="in" />
          </filter>
          <clipPath id="spat-sil"><path d={path} /></clipPath>
        </defs>
        <path d={path} fill="url(#spat-body)" filter="url(#spat-soft)" />
        <g clipPath="url(#spat-sil)">
          <g filter="url(#spat-blur)">
            {swirls.slice(1).map((d, i) => (
              <path key={`d${i}`} d={d} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth={11} strokeLinecap="round" />
            ))}
            {swirls.slice(1).map((d, i) => (
              <path key={`l${i}`} d={d} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={6} strokeLinecap="round" transform="translate(9,2)" />
            ))}
          </g>
          <path d={swirls[0]} fill="none" stroke="rgba(0,0,0,0.30)" strokeWidth={5} strokeLinecap="round" filter="url(#spat-blurHole)" />
        </g>
        {/* 3D shading: thin inner shadow (depth) + rounded edge specular */}
        <path d={path} fill="#000" filter="url(#spat-inner)" />
        <path d={path} fill="#000" filter="url(#spat-spec)" />
        <path d={path} fill="url(#spat-sheen)" />
        <path d={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ── Mobile: the spatula comes off the bottom bar ────────────────────────────────
// The horizontal silhouette (spatulaBarPath / MobileSpatulaBar / MOBILE_BAR) lived here and drew a
// spatula behind the phone's nav icons. It is gone, and the reason is measured rather than aesthetic.
//
// Its icon row had to be inset `left: 48` to clear the cap and hang-hole and `right: 12` to stop at
// the blade tip, so the row was always the SCREEN's width minus 60 — a tax that did not shrink when
// the phone did. Eight 40px buttons need 320px; a 320px phone gave the row 260. That is why
// `mobileNavBtn` had to override sidebarBtn's fixed width, and it still landed at 31x40 on a small
// phone and 40x40 on a large one: under the 44px floor on EVERY phone, because the 40px cap was a
// ceiling a wider screen could not lift. It is also how Share came to sit off the end of the bar,
// invisible — an item overflowing a row with no visible boundary looks exactly like an item that was
// never added.
//
// The shape is not lost. The desktop rail still draws it (SpatulaFrame), where there is room for it,
// and SpatulaMarkIcon below carries it into the phone's More button — so the charm moves to somewhere
// it costs nothing instead of paying rent on the most contested 60px in the app.
//
// dev/mobile-nav.html holds the comparison this came from, with the numbers live.

/** The spatula, small enough to be an icon. Marks the phone's More button, so the drawer reads as
 *  "the rest of Spattoo" rather than a generic ellipsis. Solid rather than stroked: at 20px the
 *  handle and blade of an outlined spatula collapse into an indistinct stick. */
function SpatulaMarkIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.4 2.4h5.2c.75 0 1.3.58 1.3 1.3v6.1c0 1.45-.62 2.3-1.5 3.0l-.55.44v7.2a1.85 1.85 0 0 1-3.7 0v-7.2l-.55-.44c-.88-.7-1.5-1.55-1.5-3.0V3.7c0-.72.55-1.3 1.3-1.3Z" />
    </svg>
  );
}

/** The + that starts a cake. railItems carries `icon: null` for it because both bars draw it as a
 *  ring rather than a glyph — a different SHAPE, not a different item. */
function PlusGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** Double chevron: "there is more below". Two rather than one because a single chevron in this
 *  position reads as a collapse control — something that would fold the sheet away — where a
 *  doubled one is the scroll idiom. */
function ChevronsDown({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" />
    </svg>
  );
}

/**
 * The mobile edit sheet's scrolling body.
 *
 * A tab normally fits, so this normally does nothing. When it does not — a long frosting section on
 * a short phone — the chevron appears and disappears the moment you reach the bottom. It exists
 * because the previous design failed exactly here: content ran past a hard edge with no marker, six
 * pixels above the Actions bar, and the two read as a floor. A cut with no sign is not an
 * affordance; it is content nobody knows about.
 */
function SheetBody({ children }) {
  const ref = useRef(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [children]);
  return (
    <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', width: '100%' }}>
      <div ref={ref} className="spattoo-noscrollbar" style={s.sheetBody}>{children}</div>
      {more && <div style={s.sheetMore} aria-hidden="true"><ChevronsDown /></div>}
    </div>
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
    // Full policy (length + character classes) is enforced by isPasswordValid, mirroring
    // the Supabase Auth policy; the live checklist below shows each rule. canSubmit already
    // gates on it, so this is a defensive backstop for any programmatic call path.
    if (!isPasswordValid(form.newPassword)) {
      setMsg({ ok: false, text: 'Password does not meet the requirements below.' });
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

  const mismatch = form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword;
  const canSubmit = isPasswordValid(form.newPassword) && form.newPassword === form.confirmPassword && !loading;

  return (
    <Panel onClose={onClose} title="Change Password" width={380}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>New password</span>
          <input style={s.modalInput} type="password" value={form.newPassword}
            onChange={e => setField('newPassword', e.target.value)} disabled={loading} autoFocus />
          <PasswordChecklist password={form.newPassword} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Confirm new password</span>
          <input style={s.modalInput} type="password" value={form.confirmPassword}
            onChange={e => setField('confirmPassword', e.target.value)} disabled={loading}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()} />
          {mismatch && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e53935', fontFamily: "'Quicksand',sans-serif" }}>
              Passwords do not match.
            </span>
          )}
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
    </Panel>
  );
}

// ── Add staff modal ─────────────────────────────────────────────────────────────
// Creates a real staff account: POST /api/baker/staff → auth user + baker_appusers
// (role='staff'). Returns a temp password the owner hands to the staff member. V1 =
// one baker per staff (server rejects an email/phone already used by any appuser).
function AddUserModal({ onClose, brandBtn, apiClient }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [created, setCreated] = useState(null);   // { email, tempPassword }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    if (!apiClient?.addStaff) { setMsg({ ok: false, text: 'Staff management is not available here.' }); return; }
    setLoading(true); setMsg(null);
    try {
      await apiClient.addStaff({
        first_name: form.firstName.trim(),
        last_name:  form.lastName.trim(),
        email:      form.email.trim(),
        phone:      form.phone.trim() || null,
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      setCreated({ email: form.email.trim() });
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not add staff member.' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = form.firstName.trim() && form.email.trim() && !loading;

  return (
    <Panel onClose={onClose} title="Add Staff" width={380}>
        {created ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d52' }}>Invitation sent.</div>
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
              We emailed <b>{created.email}</b> an activation link. They'll set their own password,
              then sign in via the <b>Staff</b> tab.
            </div>
            <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4 }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
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
              <span style={s.fieldLabel}>Phone <span style={{ fontWeight: 400, color: '#999' }}>(optional)</span></span>
              <input style={s.modalInput} type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} disabled={loading} placeholder="+91 98765 43210" />
            </label>
            {msg && (
              <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#2e7d52' : '#e53935' }}>{msg.text}</div>
            )}
            <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
              disabled={!canSubmit} onClick={handleSubmit}>
              {loading ? 'Adding…' : 'Add Staff'}
            </button>
          </>
        )}
    </Panel>
  );
}

// Read-only 3D viewer for a locked order's design (confirmed onward). Renders the
// agreed cake on a rotatable turntable via CakePreview — NO edit tools, no save —
// so the baker can inspect it without being able to change what the customer agreed
// to. Fed the SAME normalised design shape the editor uses (normalizeDesign).
function OrderDesignViewer({ order, onClose }) {
  const design = useMemo(
    () => (order?.design_snapshot ? normalizeDesign(order.design_snapshot) : null),
    [order],
  );
  if (!order) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#F7F5F0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 56, padding: '0 20px', background: '#fff', borderBottom: '1.5px solid #E8E4DC', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #E8E4DC', background: '#fff', color: '#666', fontSize: 14, cursor: 'pointer' }}>✕</button>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', flex: 1 }}>Cake design · view only</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {design
          ? <CakePreview design={design} autoRotate />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontWeight: 600 }}>No design to show</div>}
      </div>
    </div>
  );
}

// ── Cream piping inline section (per-tier, per-zone controls) ─────────────────
// The Orders rail item's submenu. Both entries open the SAME Orders panel — `view` just
// says which face of it to land on — so there is one orders destination, not two.
// One ACTION that starts an order, then two VIEWS of the ones that exist. "New Order" is the manual
// path — no 3D design, a customer's reference photo (or nothing) — which until now was only
// reachable from inside the Orders panel or by picking a day on the calendar. It needs
// `order:manage`: a view-only member must not be offered a form they cannot submit, and for them
// the list is simply first.
/** Bottom strip height, before the home-indicator inset. Icon (20) + label (12) + padding. The
 *  spatula band it replaces was 76, so the 3D canvas gets 20px back on every phone. */
/**
 * The bakery name's font size, stepped by how long the name is.
 *
 * A cheap stand-in for measuring: the alternative is a ResizeObserver and a measure/shrink loop for
 * a string that changes about once in a bakery's lifetime. Thresholds come from measuring the real
 * face (Quicksand 700) against the narrowest slot, and the point is only to keep the COMMON long
 * name on one line — anything longer wraps, which is correct and costs nothing.
 */
export function nameFontSize(name = '') {
  const n = name.trim().length;
  if (n <= 18) return 15;   // "Feelings & Flavours" and shorter
  if (n <= 28) return 14;
  return 13;
}

/** The tallest a baker's logo renders in a header. mobileHeader is 52 tall and shares topLogoImg,
 *  so this cannot grow without that header growing with it. */
const HEADER_LOGO_MAX_H = 40;

/** The desktop header row. DERIVED from the logo cap plus even breathing room, never picked: at a
 *  hand-chosen 52 a max-height logo sat 14 from the top and ended at 54, pushing its own mark two
 *  pixels through the rule that is supposed to contain it. Tie the two together and the biggest
 *  logo a baker can upload still lands inside the row. */
const DESKTOP_HEADER_H = HEADER_LOGO_MAX_H + 24;

const MOBILE_BAR_H = 56;

/** Floor for the drag — below this the grip and header have nowhere to sit. */
const EDIT_PANEL_MIN = 108;
/** Ceiling for a self-sizing sheet, as a fraction of the viewport. A tab taller than this scrolls,
 *  and says so — see the chevron. Past ~60% the cake stops being big enough to judge a colour on,
 *  which is the entire reason any of this is here. */
const EDIT_PANEL_MAX_VH = 0.6;

/** The element stack's width on a phone. */
/* ⚠️ TWO WIDTHS, because the stack does two jobs. Closed, it is a LIST of cards and 156px is right:
 * narrow enough that the cake stays the thing you are looking at. Expanded, it is an EDITOR, and
 * 156px is where the Texts card ended up — a textarea, ten fonts and a colour row in a column two
 * words wide, running off the bottom of the screen. A width chosen for browsing was being asked to
 * do editing.
 *
 * The open width is capped against the viewport rather than fixed, so it cannot exceed a small phone
 * while still leaving the drag lane (STACK_RIGHT_MOBILE) and a strip of cake visible down the side. */
const STACK_W_MOBILE = 156;
const STACK_W_MOBILE_OPEN = 'min(300px, calc(100vw - 84px))';
/** The flyout handle's width — it lives on the right edge and never moves. */
const STACK_TAB_W = 22;
/** How far the stack sits in from the right on a phone: clear of the handle, plus the same 10 of
 *  breathing room it has on a desktop. Derived, so widening the handle never lands it on the panel. */
const STACK_RIGHT_MOBILE = STACK_TAB_W + 10;

const ORDERS_MENU = [
  { id: 'orders-new',      label: 'New Order', action: 'newOrder', requires: 'order:manage' },
  { id: 'orders-list',     label: 'Orders',    view: 'list' },
  { id: 'orders-calendar', label: 'Calendar',  view: 'calendar' },
];

// The rail's menu surface — the ONE place that knows a rail flyout is dark and hover-highlights.
// Every rail menu (Orders submenu, Settings, profile) goes through here, so a new one cannot
// accidentally ship the white card that belongs under the mobile header.
function RailMenu({ style, children }) {
  return (
    <div className="spattoo-rail-menu" style={style ? { ...s.railDropdown, ...style } : s.railDropdown}>
      {children}
    </div>
  );
}

// A rail nav item that opens a submenu. The desktop rail and the mobile bottom bar
// differ ONLY in where the dropdown is anchored (sideways vs upward), so the markup
// lives here once instead of being pasted into both rails.
function RailSubmenu({ label, items, open, anchorStyle = null, containerRef, onSelect, escapeClip = false,
                      // The wrapper is a flex child of whatever rail draws it. The mobile bar needs
                      // it to shrink with its siblings; the desktop rail leaves this alone.
                      style = null,
                      onHoverOpen, onHoverClose, children }) {
  const hostRef = useRef(null);
  const [fixedAt, setFixedAt] = useState(null);
  const closeTimer = useRef(null);

  // Hover to open, on pointers that hover. The menu is a DOM child of this wrapper, so moving onto
  // it does not fire mouseleave — but the 10px gap between button and menu is over neither, which
  // is what the close DELAY buys. Cancelled on re-entry. Click still toggles, which is what a touch
  // device gets, and the mobile bar passes no hover handlers at all.
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const hoverProps = typeof onHoverOpen === 'function' ? {
    onMouseEnter: () => { clearTimeout(closeTimer.current); onHoverOpen(); },
    onMouseLeave: () => {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => onHoverClose?.(), 220);
    },
  } : {};

  // The desktop rail SCROLLS: sidebarNav carries overflow-y so a short viewport can't cut the
  // spatula's blade. A scroll container clips on BOTH axes — CSS computes overflow-x to `auto` the
  // moment overflow-y stops being `visible` — so this menu, absolutely positioned at
  // left:calc(100% + 8px), was clipped away and Orders opened nothing. Measuring the anchor and
  // switching to position:fixed escapes ancestor overflow. Deliberately NOT a portal: the menu stays
  // a DOM child of the wrapper, so the existing click-outside test (containerRef.contains) still
  // sees it. Mobile passes no escapeClip — its bar isn't a scroll container and keeps `absolute`.
  useLayoutEffect(() => {
    if (!escapeClip || !open) { setFixedAt(null); return undefined; }
    const el = hostRef.current;
    if (!el) return undefined;
    const place = () => {
      const r = el.getBoundingClientRect();
      setFixedAt({ left: Math.round(r.right + 8), top: Math.round(r.top) });
    };
    place();
    const scroller = el.closest('nav');
    window.addEventListener('resize', place);
    scroller?.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      scroller?.removeEventListener('scroll', place);
    };
  }, [escapeClip, open]);

  // one node, two refs — ours for measuring, the caller's for its click-outside test
  const setRefs = (node) => {
    hostRef.current = node;
    if (typeof containerRef === 'function') containerRef(node);
    else if (containerRef) containerRef.current = node;
  };

  // Only the ANCHOR varies here — the surface itself lives in RailMenu.
  const anchor = fixedAt ? { position: 'fixed', top: fixedAt.top, left: fixedAt.left } : anchorStyle;

  return (
    <div style={{ position: 'relative', ...style }} ref={setRefs} {...hoverProps}>
      {children}
      {open && (
        <RailMenu style={anchor}>
          <div style={s.railDropdownSection}>{label}</div>
          {items.map(item => (
            <button key={item.id} style={s.railDropdownItem} onClick={() => onSelect(item)}>
              {item.label}
            </button>
          ))}
        </RailMenu>
      )}
    </div>
  );
}

// ── Main designer ─────────────────────────────────────────────────────────────
function CakeDesignerInner({ apiClient, supabase, thumbnailBucket = 'cake-thumbnails', onOrder, onQuoteRequested, onShareStore, onSaveTemplate, cfAssetsBase, orderMode = 'baker', initialDesign = null, liveSessionId = null, legalBase = DEFAULT_LEGAL_BASE }) {
  // Point the scenes' env map at the host's R2 assets base (runs before children
  // render, so CakeScene/CakeThumbnailScene read the resolved URL this pass).
  configureEnvMap(cfAssetsBase);
  const { design, setTierColor, setTierFrostingType, setTierFrostingStyle, setTierStyleParam, setTierGradient, setTierGlaze, setTierStripes, setTierCornerR, setTierShape, setTierShapeConfig, addPipingLayer, updatePipingLayer, removePipingLayer, addCreamLayer, updateCreamLayer, removeCreamLayer, addText, updateText, duplicateText, removeText, addAge, updateAge, duplicateAge, removeAge, addWriting, updateWriting, removeWriting, addSticker, updateSticker, removeSticker, duplicateSticker, groupStickers, ungroupStickers, moveGroupStickers, moveStickersBy, scaleStickers, scaleGroupBy, addStroke, updateStrokePoints, setStrokeFill, removeStroke, clearPiping, addGarnish, updateGarnish, removeGarnish, addDustSplash, applyDustLook, updateDusting, clearDusting, updateDustSplash, removeDustSplash, addFoilFlake, updateFoil, updateFoilFlake, removeFoilFlake, clearFoil, setTierGrass, updateGrass, setBoardGrass, updateBoardGrass, updateTierRainbows, updateTierClouds, setNameBlocks, updateNameBlocks, resetDesign, loadDesign, canvasConfig } = useCakeDesign();
  // Seed a starting design once on mount — the customer resuming a baker's shared invite (the
  // design_snapshot handed over at OTP verify), or any host that pre-loads a design. Reuses the same
  // loadDesign() hydration as template-pick and order-reopen; runs once so later edits aren't clobbered.
  const seededInitialRef = useRef(false);
  useEffect(() => {
    if (initialDesign && !seededInitialRef.current) {
      seededInitialRef.current = true;
      try { loadDesign(initialDesign); } catch (e) { console.error('initialDesign seed failed', e); }
    }
  }, [initialDesign]);

  const [elementsOpen, setElementsOpen] = useState(false);
  // The promote studio (decorations/MyDecorationStudio.jsx) — a BAKER giving one of his own images a
  // behaviour (kind, zones, hug/stand, colours) as he releases it to his customers. Only reachable from
  // Uploads; uploading itself happens there.
  const [decorStudioOpen, setDecorStudioOpen] = useState(false);
  // "Uploads" — everything this person uploaded (baker_uploads), private to them. `promoting` holds
  // the upload a BAKER is releasing into his library: the studio reopens in promote mode to author its
  // behaviour (kind, zones, hug/stand, colours). Null = the studio is in plain upload mode.
  const [uploadsOpen, setUploadsOpen] = useState(false);
  const [promoting, setPromoting] = useState(null);
  // Which photo-frame sticker is waiting for an image. Non-null = Uploads opened to CHOOSE for that
  // frame (rather than to place on the cake). One panel, two purposes — decided by the caller.
  const [framePhotoFor, setFramePhotoFor] = useState(null);

  const [toolsOpen, setToolsOpen]   = useState(false);
  const [activeTool, setActiveTool] = useState(null);   // null = tool list · 'cream-pen' (Texts) · 'pen' (freehand Cream Pen) · 'luster-dust'
  // Luster dust: colour for new flicks, which tier is being dusted, and the selected splash to aim.
  const [dustColor, setDustColor] = useState('#f0cf63');
  const [dustTier, setDustTier] = useState(0);
  const [dustSel, setDustSel] = useState(0);
  // Gold leaf ("food foil") — selection state for the finish card (which tier / surface / flake).
  const [foilColor, setFoilColor] = useState(GOLD_LEAF_COLORS.gold);
  const [foilTier, setFoilTier] = useState(0);
  const [foilSel, setFoilSel] = useState(0);
  const [foilSurface, setFoilSurface] = useState('side');   // which surface "Add foil" places onto
  // The New-cake shape grid. Open = the customer pressed New and has not chosen yet; the current cake is
  // still on screen and still intact behind it.
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  // Second cream layer ("Cream layer" finish element) — which tier the card edits + which band is selected.
  const [creamTier, setCreamTier] = useState(0);
  const [creamSel, setCreamSel] = useState(0);
  // Phase B: live spin-paint. creamPaint = the layer currently being scraped; creamAutoRotate spins the cake.
  const [creamPaint, setCreamPaint] = useState(null);   // { tierIndex, layerId } | null
  const [creamAutoRotate, setCreamAutoRotate] = useState(false);
  const handleCreamPaint = (tierIndex, layerId, theta01, frac) =>
    updateCreamLayer(tierIndex, layerId, l => ({ ...l, edge: paintProfile(l.edge, theta01, frac) }));
  // A new flick lands on the front of the wall (default camera view); the customer then aims it.
  const addDustToTier = (tierIndex) => {
    const count = design.tiers[tierIndex]?.dusting?.splashes?.length ?? 0;
    addDustSplash(tierIndex, 0.0, 0.4);   // u=0 is the +z front; v=0.4 leaves room for the upward spray
    updateDusting(tierIndex, { dustColor });
    setDustTier(tierIndex); setDustSel(count);
  };
  const setAllDustColor = (c) => {
    setDustColor(c);
    design.tiers.forEach((t, i) => { if (t.dusting) updateDusting(i, { dustColor: c }); });
  };
  const dustSplashes = design.tiers[dustTier]?.dusting?.splashes ?? [];
  const dustSplashCount = design.tiers.reduce((n, t) => n + (t.dusting?.splashes?.length ?? 0), 0);
  const DUST_COLORS = [   // quick picks; the colour picker covers everything else
    { label: 'Gold', color: '#f0cf63' }, { label: 'Silver', color: '#cdd2d8' },
  ];
  // ── Two different sizes, because they measure two different things ─────────────────────────────
  // The pen's `thickness` is a rope DIAMETER — 0.03 is a fine line of cream. The stamp path reuses
  // the same number as its target footprint (2×thickness), which is right for a bead and far too
  // small for a piped shell: a ring shell stands SHELL_HEIGHT_FRAC × the tier radius tall, so on the
  // bottom tier 0.24 × 1.2 = 0.288 against the pen default's 0.104. Piped by hand at the pen's size,
  // a border came out at under half the ring's, which is what "piping is too small" was.
  //
  // Halved because the stamp target is a DIAMETER and the shell fraction is a full height. It puts
  // the two in the same league; it does not make them equal — the fraction normalises height and the
  // stamp scales by widest horizontal extent, which no constant here can reconcile for an arbitrary
  // GLB. Hence the wider slider in stamp mode rather than a range that stops just above this.
  const PEN_DEFAULT_THICKNESS = 0.03;
  const PIPE_STAMP_THICKNESS  = +(SHELL_HEIGHT_FRAC * TIER_RADII[0] / 2).toFixed(3);   // 0.144
  // `medium` is what is in the bag — cream or chocolate. It is a KEY into MEDIA (see pipingMedia.js),
  // never a branch, and the element row's placement_config is what switches it.
  const [garnishStudio, setGarnishStudio] = useState(false);
  const [pendingGarnish, setPendingGarnish] = useState(null);
  /* Kept pieces, for the "My decorations" shelf. Reloaded whenever the studio closes, so one just
     saved appears without a refresh — the shelf is the place a baker goes to check it worked. */
  const [savedGarnishes, setSavedGarnishes] = useState([]);
  useEffect(() => {
    let alive = true;
    apiClient?.fetchGarnishes?.()
      .then(rows => { if (alive) setSavedGarnishes(rows ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient, garnishStudio]);
  // Kept on the DESIGNER, not inside the studio, so closing and reopening does not lose the chocolate
  // a baker just chose — the same reason penStyle lives out here.
  const [garnishColor, setGarnishColor] = useState('#4A2C1B');
  const [garnishRope, setGarnishRope] = useState(6);
  const [selectedGarnishId, setSelectedGarnishId] = useState(null);
  const [penStyle, setPenStyle] = useState({ medium: DEFAULT_MEDIUM, nozzle: 'round', color: '#ffffff', thickness: PEN_DEFAULT_THICKNESS, softness: 0.7, heapHeight: HEAP_HEIGHT_PER_DIAMETER, stampId: null, stampUrl: null, spacing: 0.85 });
  const [writingColorOpen, setWritingColorOpen] = useState(false);   // Texts: collapsible colour picker
  const [elementTypes, setElementTypes] = useState([]);
  const [elementTypesLoading, setElementTypesLoading] = useState(false);
  const [elementById, setElementById] = useState(() => new Map()); // id → element row, for placed-sticker config lookups
  // The food-foil ("gold leaf") element is identified by CONFIG, never slug (#1): kind === 'tier_finish'.
  // (Declared after elementById so it doesn't read it before initialization.)
  const foilElement = [...elementById.values()].find(e => e.placement_config?.kind === 'tier_finish') ?? null;

  // ── Can this decoration be dragged? ─────────────────────────────────────────────────────────────
  // Read from the ELEMENT, never from the sticker's own allowedActions. Two reasons, and the second
  // is the one that would have caused a regression:
  //
  //   * Capabilities are admin master data. An admin unticking Movable should pin decorations that
  //     are ALREADY on cakes, not just the next one placed — the same way `delete` behaves.
  //   * Every sticker placed before this was wired carries an explicit `move: false`, because the
  //     placement path defaulted it that way while nothing read it. Those values are baked into
  //     saved design_snapshots too. Gating on the sticker's copy would have frozen every decoration
  //     on every cake and in every saved order, which no migration of the catalogue could undo.
  //
  // Absent → movable: an element that never expressed an opinion, or a promoted upload with no
  // catalogue row at all, keeps the behaviour it has always had. Only an explicit false pins it.
  const isStickerMovable = useCallback(
    (sticker) => elementById.get(sticker?.elementId)?.allowed_actions?.move !== false,
    [elementById],
  );
  // The same capability, for a piping LAYER. A layer stores the element id as `id` (makePipingLayer),
  // not `elementId` — the only difference between this and the sticker read. Same catalogue, same
  // "absent → movable" rule, so one admin tick governs a rosette whether it is placed as a decoration
  // or piped onto a rim.
  const isPipingMovable = useCallback(
    (layer) => elementById.get(layer?.id)?.allowed_actions?.move !== false,
    [elementById],
  );
  // The "Cream layer" element is a tier finish too, identified by CONFIG not slug (#1): it carries a
  // placement_config.second_cream block (lift/noise/fill_side seeds). It drives tier.creamLayers (raised
  // second-buttercream bands), NOT a sticker — so it routes to the cream card, never the generic path.
  const creamElement = [...elementById.values()].find(e => e.placement_config?.second_cream) ?? null;
  // A new flake lands in view (default camera) so its dot is grabbable; the customer drags it / adds
  // more. (u,v) is interpreted per surface (side = angle/height; top = angle/radial-frac), so each
  // surface seeds a small in-view cluster in its own space.
  const addFoilToTier = (tierIndex, surface = 'side') => {
    const count = design.tiers[tierIndex]?.foil?.flakes?.length ?? 0;
    const pc = foilElement?.placement_config ?? {};
    let u, v;
    if (surface === 'top_surface') {
      // Spread shards around the VISIBLE top ring (outside the footprint of the tier above), so a lower
      // tier's flakes never land under the upper tier. occludedTopFrac is the shared stacking helper.
      const lo = Math.min(0.9, occludedTopFrac(canvasConfig.tiers, tierIndex) + 0.06), hi = 0.95;
      u = (count * 0.37) % 1;                          // around the disk
      v = lo + ((count * 0.23) % 1) * (hi - lo);       // radial fraction within the visible ring
    } else {
      // Side wall: land at the FRONT (u≈0, default camera view), spread in a small front cluster.
      u = ((((count * 0.37) % 1) - 0.5) * 0.16 + 1) % 1;   // ~±0.08 around the front
      v = 0.40 + ((count * 0.29) % 1) * 0.25;              // ~0.40 .. 0.65 of the wall height
    }
    // Default flake size = the element's placement_config.r (default scale, never hard-coded).
    addFoilFlake(tierIndex, u, v, { color: foilColor, finish: pc.finish, size: pc.r ?? 0.5, surface });
    setFoilTier(tierIndex); setFoilSel(count);
  };
  const setAllFoilColor = (c) => {
    setFoilColor(c);
    design.tiers.forEach((t, i) => { if (t.foil) updateFoil(i, { color: c }); });
  };
  // Add a second-cream band to a tier, seeding ONLY the keys the admin authored (lift/noise/fill_side)
  // from placement_config.second_cream so the reducer's own defaults stand for anything absent — passing
  // `undefined` would clobber them. Selects the new band so the card edits it. Renders via SecondCreamLayers.
  const addCreamToTier = (tierIndex) => {
    const sc = creamElement?.placement_config?.second_cream ?? {};
    const existing = design.tiers[tierIndex]?.creamLayers ?? [];
    const count = existing.length;
    const layer = {};
    if (sc.lift != null) layer.lift = sc.lift;
    if (sc.noise != null) layer.noise = sc.noise;
    if (sc.height != null) layer.height = sc.height;
    // First band sits at the bottom (admin default). Each subsequent band defaults to the OPPOSITE
    // anchor of the previous one, so two taps give the popular top+bottom two-tone with a gap between.
    const prevSide = count ? (existing[count - 1].fillSide ?? 'below') : null;
    layer.fillSide = prevSide ? (prevSide === 'above' ? 'below' : 'above') : (sc.fill_side ?? 'below');
    addCreamLayer(tierIndex, layer);
    setCreamTier(tierIndex); setCreamSel(count);
  };
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

  // The decoration-grid filter: honour the search box, and hide pattern_only building blocks (a
  // decor_pattern's individual parts) — they are placed via their parent pattern, never on their own.
  //
  // Defined HERE, at component scope, because BOTH the element-type grids and the "My decorations"
  // section below use it. It used to live inside the grids' IIFE, so the second caller referenced a
  // binding that was not in scope — a ReferenceError the moment the panel rendered. One definition,
  // both callers: the same rule cannot be in two places (INVARIANTS.md).
  const filterEl = (els) => {
    const q = elemSearch.trim().toLowerCase();
    return (els ?? []).filter(el => {
      if (el.placement_config?.pattern_only === true) return false;
      // Inside a category, show only that category — the dbs accumulate across every category
      // visited this session, so without this the second one opened would show the first as well.
      // Search deliberately ignores the category: someone typing "lion" wants the lion, not to be
      // told it is filed elsewhere.
      if (!q && activeCategory && el.category_id !== activeCategory.id) return false;
      if (!q) return true;
      return `${el.name ?? ''} ${el.description ?? ''}`.toLowerCase().includes(q);
    });
  };

  const [tmplSearch,      setTmplSearch]      = useState('');
  const [pipingPopupOpen,    setPipingPopupOpen]    = useState(false);
  // Accordion stack of opened piping elements. Each card edits one element (across
  // its rings); multiple cards coexist so several piping styles stack on the cake.
  // Each card carries a unique cardId (a card is an element instance — the SAME style can be
  // added several times as independent nested rings), and its layers are tagged with that
  // cardId. expandedPipingId holds the expanded card's cardId; only one is open at a time.
  const [pipingCards,        setPipingCards]        = useState([]);
  const [expandedPipingId,   setExpandedPipingId]   = useState(null);
  // Is the element stack pulled OUT? Phone only — see the flyout below. Shut by default, because a
  // baker opens the designer to look at the cake, not at a list of what is on it.
  const [stackFlyoutOpen,    setStackFlyoutOpen]    = useState(false);
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
  // ── Browse by category (migration 065) ──────────────────────────────────────────────────────────
  // The panel opens onto CATEGORIES, and nothing is fetched until one is tapped. 86 decorations in a
  // flat grid is hard to search on any connection, and on mobile data it is 102 KB of JSON and 430
  // KB of thumbnails before the customer has expressed any interest at all.
  //
  // `loadedCategories` is what makes going back and forth free — a category already fetched is not
  // fetched again. `allElementsLoaded` is the separate question "do we hold the whole catalogue",
  // which search and saved designs need and no number of category loads can answer.
  const [categories, setCategories]           = useState([]);
  const [activeCategory, setActiveCategory]   = useState(null);
  const [loadedCategories, setLoadedCategories] = useState(() => new Set());
  const [allElementsLoaded, setAllElementsLoaded] = useState(false);

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
  // type 'sticker': { id }  ← primary sticker (toolbar anchor); toppers are stickers too
  const [selectedEl, setSelectedEl] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  // GLB Recompose: which editable part-group the colour wheel is currently editing (group key), or
  // null when editing the element's single colour. Set when a per-group swatch / on-canvas dot is
  // tapped; the wheel then reads/writes sticker.groupColors[activeGroupKey] instead of sticker.color.
  const [activeGroupKey, setActiveGroupKey] = useState(null);
  // "Is a group being edited?" is a question about PRESENCE, not truthiness — and it must be asked
  // through this flag, never as `if (activeGroupKey)`.
  //
  // GLB part-groups are keyed by NAME ("Shoes", "Eyes"), which is always truthy, so truthiness worked
  // by accident. `hue_regions` reuses this same path (correctly — one groupColors path, not two) but
  // keys its groups by REGION INDEX, and index 0 is FALSY. Every `if (activeGroupKey)` therefore read
  // the first region as "no group selected" and wrote the picked colour to sticker.color — which the
  // hue_regions render path ignores entirely. Result: the first (and on a single-colour sticker, the
  // ONLY) swatch silently did nothing.
  const hasActiveGroup = activeGroupKey != null;
  // Which gradient stop the colour wheel is currently editing (0-based). Only meaningful when the
  // selected element is gradient-eligible (caps.gradient) and has ≥2 stops.
  const [gradStop, setGradStop] = useState(0);
  // True while the user has clicked "+" to add a stop but hasn't picked its colour yet. The new stop
  // is shown as an EMPTY placeholder chip (not a copy of the last colour) and isn't written to the
  // design until a colour is chosen — so adding a stop never silently duplicates a colour.
  const [gradPending, setGradPending] = useState(false);
  // Full sticker selection set (drives canvas highlight + group ops)
  const [selectedStickerIds, setSelectedStickerIds] = useState(new Set());
  // True when user entered multi-select via long-press (mobile) or Ctrl+click (desktop)
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Derived
  const selectedTier    = selectedEl?.type === 'tier'    ? selectedEl.index : null;
  const selectedPiping  = selectedEl?.type === 'piping'  ? selectedEl       : null;
  const selectedTextId  = selectedEl?.type === 'text'    ? selectedEl.id    : null;
  const selectedAgeId   = selectedEl?.type === 'age'     ? selectedEl.id    : null;
  // Which message the Texts editor is pointed at. `setWriting` writes to THAT one, so the twenty-odd
  // controls below (font, colour, thickness, curve…) are unchanged by writings becoming a list —
  // they always meant "the message being edited", and now that is said once here instead of being
  // implied by there only ever being one.
  //
  // ⚠️ It MUST live below `const [selectedEl] = useState(...)`. It was declared ~160 lines above it,
  // which is the temporal dead zone: `const` is hoisted but unreadable until its initialiser runs, so
  // CakeDesignerInner threw "Cannot access 'selectedEl' before initialization" on EVERY render and
  // the whole app showed "Something went wrong". Minified it reads as an unrecognisable name, which
  // is most of why it was not obvious from production. Keep derivations next to what they derive.
  const selectedWritingId = selectedEl?.type === 'writing' ? (selectedEl.id ?? null) : null;
  const selectedAge     = design.ages.find(a => a.id === selectedAgeId) ?? null;
  const selectedStickerId = selectedStickerIds.size === 1 ? [...selectedStickerIds][0] : null;
  // For a selected `hue_regions` sticker, derive its colour regions (from the image) once — the toolbar
  // feeds them into the shared "Customise colours" swatches (one per region). No-op for other elements.
  const selRecolorInst = useMemo(() => {
    if (!selectedEl) return null;
    if (selectedEl.type === 'sticker') return design.stickers.find(s => s.id === selectedEl.id) ?? null;
    if (selectedEl.type === 'decorEl') return design.stickers.find(s => s.elementId === selectedEl.elementId) ?? null;
    return null;
  }, [selectedEl, design.stickers]);
  const hueRegionsCfg = selRecolorInst?.recolor?.method === 'hue_regions' ? selRecolorInst.recolor : null;
  const hueRegions = useImageRegions(hueRegionsCfg ? selRecolorInst.imageUrl : null, hueRegionsCfg);
  // The colour the ACTIVE group starts from when the customer hasn't set one yet — for a hue region,
  // the hue actually detected in the artwork. Without this the wheel opens on the instance's colour
  // (or white) while the swatch beside it shows the detected hue, so the picker disagrees with the
  // thing it is editing. Array lookup, so a GLB group's NAME key simply misses → null → unchanged
  // behaviour for GLB (its groups carry their own colours).
  const activeGroupDefault = hasActiveGroup ? (hueRegions[activeGroupKey]?.hex ?? null) : null;
  // Title above the colour wheel while a group is being edited. A GLB part-group has a NAME ("Shoes")
  // worth showing. A hue region has only an index — and it is labelless on purpose (see the swatch
  // panel: "Colour 1/2/3" is noise, the swatch already shows the colour), so it must NOT fall back to
  // printing a bare "0" at the customer. Null here → the caller shows the element's own name.
  const activeGroupLabel = hasActiveGroup
    ? (selRecolorInst?.groups?.find(g => g.key === activeGroupKey)?.label
       ?? (typeof activeGroupKey === 'string' ? activeGroupKey : null))
    : null;
  // Resize is opt-in (allowed_actions.resize; default off — see useCakeDesign placement). This defensive
  // fallback (a sticker with no allowedActions at all) mirrors that default so the edge case is opt-in too.
  const STICKER_CAPS = { resize: false, delete: true, color: false, duplicate: true };
  const caps = selectedEl
    ? (selectedEl.type === 'tier'    ? TIER_CAPS
     : selectedEl.type === 'sticker' ? (design.stickers.find(s => s.id === selectedEl.id)?.allowedActions ?? STICKER_CAPS)
     : selectedEl.type === 'scatter' ? (design.stickers.find(s => s.elementId === selectedEl.elementId)?.allowedActions ?? STICKER_CAPS)
     : (allowedActionsBySlug[selectedEl.type] ?? null))
    : null;

  // pipingTarget: { tierIndex, zone } — triggers in-canvas style picker
  const [pipingTarget, setPipingTarget] = useState(null);
  const [saveModal, setSaveModal] = useState(false);
  // After a template saves, offer to film it — see handleSaveTemplate. Separate from saveMsg so the
  // modal can stay open on a success it would otherwise close itself out of.
  const [reelOffer, setReelOffer] = useState(false);
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
  // Draws the capture canvas a frame on demand. The browser stops animating a hidden or minimised
  // window, so a save made in the background would otherwise photograph a frame that was never
  // rendered — see FitCakeCamera. Every capture below asks for a frame first.
  const thumbRenderNowRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [chefsDeskOpen, setChefsDeskOpen] = useState(false);   // Chef's Desk menu (Color Guide, …)
  // Which rail item's submenu is open, by nav id (null = none). Generic rather than a
  // flag per menu, so a nav item gets a submenu purely by declaring `menu` in the config.
  const [navMenuId, setNavMenuId] = useState(null);
  const [addUserModal,        setAddUserModal]        = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [colorGuideOpen,      setColorGuideOpen]      = useState(false);
  const [printStudioOpen,     setPrintStudioOpen]     = useState(false);
  // Blaze+ (edible_print_studio). Hidden rather than shown-and-locked, matching how xray_reports is
  // handled a few files over — one convention for "your plan does not include this" beats two.
  const [printStudioEnabled,  setPrintStudioEnabled]  = useState(false);
  // Reels. Two entitlements, because "may record" and "whose name is on it" are different questions
  // — see spattoo-docs/plans/reel-for-bakers.md §2e.
  const [reelCapture,  setReelCapture]  = useState(false);   // may record at all
  const [reelBranding, setReelBranding] = useState(false);   // their own name, vs "made with Spattoo"
  /* Whether this take carries their name at all — the record panel's tick, held HERE because the
   * 9:16 preview overlay and the recorder both read the composed caption. Reset per panel open would
   * be a nicety; it is deliberately sticky for the session instead, since somebody filming a batch of
   * unbranded reels is doing it repeatedly and would otherwise untick it for every cake. */
  const [reelIncludeName, setReelIncludeName] = useState(true);

  /* ── The photo take ───────────────────────────────────────────────────────────────────────────
   * Shares the reel's framing, ground, caption and director; everything below is what differs.
   *
   * ⚠️ `frameAspect` is why the framing state lost its `reel` prefix. The preview box, the drawing
   * buffer and the captured file all come from this ONE number — R3F sizes the buffer from the
   * container, so constraining the box IS constraining the render. A second constant for the CSS
   * would be a preview that is a different shape from the photograph it promises. */
  const [photoOptsOpen, setPhotoOptsOpen] = useState(false);
  const [photoBusy, setPhotoBusy]         = useState(false);
  const [photoCutout, setPhotoCutout]     = useState(false);
  // True from opening the photo panel until it closes — the panel itself shuts for the capture, so
  // photoOptsOpen cannot answer "is this a photo take" at the moment the shutter goes.
  const [photoFraming, setPhotoFraming]   = useState(false);
  const [photoAngle, setPhotoAngle]       = useState(null);
  const [frameAspect, setFrameAspect]     = useState(REEL_ASPECT);
  // ── Has the baker ever curated their flavour list? ────────────────────────────────────────────
  // false = never opened the screen, which is not "no preference": a global flavour with no
  // settings row is OFFERED (spattoo-api lib/flavourList.js), so this baker's storefront would
  // carry every flavour Spattoo ships, including ones they do not make.
  //
  // Marks the Flavours menu item until it is dealt with. Not a dismissible banner and not a
  // first-run popup: a popup on day one is cleared by a baker who has not yet seen a storefront,
  // and a dismissal would hide a thing that is still true. This disappears when the list is
  // curated — including by a baker who genuinely offers everything and saves it unchanged — so it
  // is self-limiting rather than nagging. The gate that actually catches it is at PUBLISH
  // (ThemePreview), which is the moment the list becomes public.
  const [flavoursUncurated, setFlavoursUncurated] = useState(false);
  const [orderModalOpen,      setOrderModalOpen]      = useState(false);
  const [manualOrderOpen,     setManualOrderOpen]     = useState(false);   // baker's "New Order" (no designer)
  const [manualOrderDate,     setManualOrderDate]     = useState(null);    // pre-filled delivery date when started from the Orders calendar
  const [ordersInitialView,   setOrdersInitialView]   = useState('list');  // which Orders view the rail asked for ('list' | 'calendar')
  // Holds the quote result after a successful customer submit; read when the
  // OrderModal success screen is dismissed so the host can react (redirect to a
  // share screen). A ref so it survives the submit→close render gap.
  const quoteSubmittedRef = useRef(null);
  const [newOrderId,          setNewOrderId]          = useState(null);
  const [editingOrder,        setEditingOrder]        = useState(null);
  const [viewingOrder,        setViewingOrder]        = useState(null);  // locked order opened READ-ONLY in 3D
  const [ordersPanelOpen,     setOrdersPanelOpen]     = useState(false);
  const [customersPanelOpen,  setCustomersPanelOpen]  = useState(false);
  const [invitePanelOpen,     setInvitePanelOpen]     = useState(false);
  // When set, the invite panel opens with the CURRENT design attached (the "Share the draft" flow):
  // { designSnapshot, designThumbnailKey }. Null = a plain invite (blank start).
  const [shareDraftDesign,    setShareDraftDesign]    = useState(null);
  const [actionsMenuOpen,     setActionsMenuOpen]     = useState(false);   // mobile baker/staff ⋮ actions menu
  const [captureMenuOpen,    setCaptureMenuOpen]    = useState(false);   // desktop "Capture ⋯" → photo / reel
  const [customersFilter,     setCustomersFilter]     = useState(null);
  const [dashboardOpen,       setDashboardOpen]       = useState(false);
  const [settingsPanelOpen,   setSettingsPanelOpen]   = useState(false);
  const [flavoursPanelOpen,   setFlavoursPanelOpen]   = useState(false);
  const [templatesPanelOpen,  setTemplatesPanelOpen]  = useState(false);
  const [billingPanelOpen,    setBillingPanelOpen]    = useState(false);
  // Privacy & Data, opened from the LAPSED gate. Separate from the settings-menu route because that
  // whole menu is unrendered once access is blocked — see the exit row on the gate.
  const [lapsedPrivacyOpen, setLapsedPrivacyOpen] = useState(false);
  // Bumped by the "Take a tour" rail item. A counter, not a flag: "asked again" is the event, and a
  // boolean cannot say it twice without the caller resetting it.
  const [tourNonce, setTourNonce] = useState(0);
  // Has THIS PERSON seen it — from /me, so it survives a new device. Customers are not identified
  // when the tour runs (DesignFacet opens the designer before any OTP), so theirs is a cookie
  // inside DesignTour and this stays null for them.
  //
  // NULL = not answered yet, and that is the whole point of three states rather than two. Starting
  // at `false` means "never seen" for the ~200ms before /me returns, and DesignTour's start timer is
  // 400ms — so a baker who HAS seen it would be shown it again on every single load, in the gap.
  const [tourSeen, setTourSeen] = useState(null);
  // Separate from Billing on purpose: someone topping up wants credits, not a plan conversation.
  const [buyCreditsOpen,      setBuyCreditsOpen]      = useState(false);
  const [ordersFilter,        setOrdersFilter]        = useState(null);
  const [bakerReady,          setBakerReady]          = useState(false);
  const [bakerData,    setBakerData]    = useState(null);
  // Read twice — by the banner and by the desktop logo's offset — so the two can never disagree
  // about whether the bar is on screen. Declared HERE, immediately after bakerData: it was above
  // it, which is a temporal dead zone — valid JavaScript, clean build, 567 passing tests, and a
  // blank screen the moment anything renders. The same trap railItems hit earlier today.
  const pastDue = bakerData?.subscription_status === 'past_due';
  // Uploaded logos carry a transparent margin (29–38% on the ones we have), and every surface caps
  // by height — so that margin is spent out of the height budget and the mark reads small. Trimmed
  // once per URL at render, which fixes existing logos without a re-upload or a backfill.
  const logoSrc = useTrimmedLogo(bakerData?.logo_url);

  // Enlarged template thumbnail. The card is 180x120 and the stored capture is the camera's whole
  // 800x800 frame, so even a badly-framed thumbnail has real pixels behind it — showing it bigger
  // is what rescues the templates saved before the capture was cropped, which is most of them.
  // { src, name, tiers, rect } — rect is the card, so the panel can be anchored beside it.
  const [tplPreview, setTplPreview] = useState(null);
  const tplPreviewTimer = useRef(null);
  useEffect(() => () => clearTimeout(tplPreviewTimer.current), []);
  const [userData,     setUserData]     = useState(null);
  const [bakerSettings, setBakerSettings] = useState({});
  // Server-resolved capabilities (from /api/me). null = not loaded / host app
  // doesn't expose it → default to full access so existing baker apps are unchanged.
  const [capabilities, setCapabilities] = useState(null);
  const [role, setRole] = useState(null);  // principal role from /me (e.g. 'customer'); null = unknown
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [mobilePanelHeight, setMobilePanelHeight] = useState(260);
  // ── The edit sheet sizes itself to ONE section ────────────────────────────────────────────────
  // It opened at 552px — 65% of an 852px phone, the cake's centre 200px behind it. Shortening it to
  // a fixed 152 fixed that and introduced a worse problem: the colour picker was sliced in half by
  // the sheet's bottom edge, six pixels above the Actions bar, and the two read as one solid floor.
  // Nobody would guess a picker was under there, so the sheet looked like seven swatches and a
  // decorative stripe.
  //
  // So nothing is cut any more. The sheet shows one TAB at a time and takes exactly the height that
  // tab needs (capped — see EDIT_PANEL_MAX_VH). `editDragH` is null until a baker drags, and resets
  // when they switch tab or element, so each view fits itself and a drag is an override of the view
  // in front of them rather than a setting they have to undo.
  const [editTab,   setEditTab]   = useState(null);
  const [editDragH, setEditDragH] = useState(null);
  // The sheet's real, rendered height. The canvas insets by exactly this, so "the cake is never
  // behind the sheet" holds whether the height came from the content or from a drag. The effect
  // that measures it lives below, beside showRightPanel — it depends on it, and a `const` cannot be
  // read from an effect declared above its definition.
  const [editSheetH, setEditSheetH] = useState(0);
  const editSheetRef = useRef(null);
  const settingsRef      = useRef(null);
  const profileRef       = useRef(null);
  const chefsDeskRef     = useRef(null);
  const navMenuRef       = useRef(null);
  const hitTestRef       = useRef(null);
  const snapCameraRef    = useRef(null);
  const turnCameraRef    = useRef(null);   // spin the cake from a button — see the pen editor
  // Draw or slide: one pen, two gestures, and they cannot share a drag. See the toggle in the pen card.
  const [penMove, setPenMove] = useState(false);
  // Filled by TakeDirector when the baker is a catalogue author. Null otherwise — and the canvas
  // only mounts the director when it is passed, so every other bakery renders nothing extra.
  const takeRef          = useRef(null);
  const [reelOptsOpen, setReelOptsOpen] = useState(false);
  // True while the reel panel is open: the canvas is constrained to 9:16 and everything outside is
  // dimmed, so the baker sees the actual frame rather than discovering the crop in the file.
  const [framing, setFraming]   = useState(false);
  const [reelBusy, setReelBusy]         = useState(false);
  const dragStickerRef   = useRef(null);  // element being pointer-dragged
  const [dragGhost, setDragGhost] = useState(null); // { x, y, el } for floating preview

  // ── The baker's brand is the STOREFRONT's, not the app's ──────────────────────────────────────
  // These two feed every control in the baker app — every panel takes them as primaryColor /
  // accentColor, and ThemePreview names the concept outright (`appPrimary` / `appAccent`, "the APP
  // brand"). They used to read bakerData, which meant a bakery's brand pair was turned into a
  // gradient on every button in the product. Most pairs do not survive that: they are chosen to sit
  // on a storefront's own background, next to that bakery's photographs, and a colour that reads as
  // warm and considered there reads as muddy on a 40px control against app chrome.
  //
  // So the app keeps its own black, everywhere, for every baker — and the brand goes where it was
  // chosen for: the storefront, which is the surface a baker's customers actually see. The
  // storefront is unaffected by this; CustomerStorefront and ThemePreview read the profile's
  // primary_color/accent_color directly and never went through here.
  const primaryColor = '#1a1a1a';
  const accentColor  = '#333333';

  // ── Reel recording — catalogue authors only ───────────────────────────────────────────────────
  // A per-BAKER flag (bakers.is_catalog_author, migration 070), not a per-user capability: hasCap
  // answers "may this person do X" and this asks "is this bakery one of ours". The same bakeries
  // publish catalogue templates and film them. See spattoo-docs/features/reel-capture.md.
  const isCatalogAuthor = !!bakerData?.is_catalog_author;
  // Catalogue authors get the recorder regardless of plan — they need it to announce catalogue
  // templates, which is a different question from what a subscription buys.
  const canRecordReel = reelCapture || isCatalogAuthor;

  /* The one line burned into every frame. DERIVED, never stored: the preview overlay and the
   * recorder both read this, so they cannot disagree about what the baker is about to publish.
   *
   * A catalogue author is not automatically branded — `is_catalog_author` says WHO writes the public
   * templates, `reel_branding` says whose name is on a video. Spattoo's own catalogue account happens
   * to be on a plan that carries both, which is why they look the same from in here. */
  const reelCaptionText = captionText({ bakeryName: bakerData?.name, ownBranding: reelBranding,
                                        includeName: reelIncludeName });
  // A cutout has nothing for a caption to sit on — see PhotoOptions, which also hides the tick.
  const captionOnFrame = photoCutout ? '' : reelCaptionText;
  // Which ground the preview is showing, so the overlay can pick its contrast the same way the
  // recorder does. Mirrors what was handed to setGround; the scene holds a THREE.Color, not a hex.
  const [takeGround, setTakeGround] = useState(DESIGNER_GROUND);
  // True while any decoration is still resolving. The same registry the canvas spinner reads —
  // deliberately not a second notion of "is it ready", which would drift from the visible one.
  const decorLoading = useAnyLoading();

  /* ⚠️ NOT saveMsg. The reel's messages were written to saveMsg, which renders in exactly one place
   * — inside the save-as-template modal — so every one of them was set and never seen: the WebM
   * warning, "Recording… hold still", "Couldn't record", all of it. The feature had no voice at all
   * and nothing said so, because setting state always succeeds.
   *
   * { ok, text } | null. Successes clear themselves; failures do not, because they carry an
   * instruction the baker needs to still be there when they look up. */
  const [reelMsg, setReelMsg] = useState(null);
  useEffect(() => {
    if (!reelMsg?.ok) return;                       // failures stay until they are dismissed
    const id = setTimeout(() => setReelMsg(null), 7000);
    return () => clearTimeout(id);
  }, [reelMsg]);
  // Measured rather than assumed: the caption's size is a fraction of the FRAME's height, and the
  // frame is sized by CSS (min() against the viewport). Nothing in JS knows how tall it came out.
  const frameRef = useRef(null);
  const [frameH, setFrameH] = useState(0);
  /* Where the frame ENDS on screen, so the bottom sheet can stop above it.
   *
   * ⚠️ Measured, not calculated. The frame is `top: 8px; height: 46%` of the canvas container, and
   * the container's own top depends on the header, the rail and whatever else the phone is showing —
   * so the only honest way to say "the sheet must not reach this" is to ask the box where it is.
   * Recomputed by the same ResizeObserver that already measures the height for the caption. */
  const [frameBottom, setFrameBottom] = useState(0);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!framing || !el) { setFrameH(0); setFrameBottom(0); return; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setFrameH(r.height);
      setFrameBottom(r.bottom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [framing]);


  /* Everything the reel panel changed, put back — the framing, the scrim, the ground, the camera.
   *
   * ⚠️ One function because there are TWO ways out and only one of them used to do this. The ✕ tore
   * the preview down; finishing a take did not, and left the designer wearing the 9:16 crop, the
   * scrim and the reel's ground with the panel gone — so there was no visible way back at all. The
   * baker's only escape was to guess that reopening the panel and closing it would clear it.
   *
   * It runs in runReel's `finally`, so a take that THREW restores too. A failed recording stranding
   * the designer is the same bug with worse timing. */
  function closeReelPanel() {
    setReelOptsOpen(false);
    setFraming(false);
    setTakeGround(DESIGNER_GROUND);
    takeRef.current?.endPreview?.();
  }

  function openReelPanel() {
    // Drop any selection first. Handles, grips and the piping toolbar are editing furniture that
    // renders IN the scene, so whatever was selected when the baker hit Record would have been
    // filmed along with the cake.
    handleDeselect();
    setReelOptsOpen(true);
    setFraming(true);
    setTakeGround(DESIGNER_GROUND);            // the panel opens on Studio, which IS the designer's

    // Portrait camera + the chosen ground, applied now so the panel's preview is the real frame.
    takeRef.current?.beginPreview?.();
  }

  /* The photo's own bracket. It reuses openReelPanel's teardown of the SELECTION for the same
   * reason — handles and grips render in the scene and would be photographed along with the cake —
   * and everything else it sets is the framing the reel already knows how to draw. */
  function openPhotoPanel() {
    handleDeselect();
    setPhotoOptsOpen(true);
    setFraming(true);
    setPhotoFraming(true);
    setTakeGround(DESIGNER_GROUND);
    setPhotoCutout(false);
    takeRef.current?.beginPreview?.();
  }

  function closePhotoPanel() {
    setPhotoOptsOpen(false);
    setFraming(false);
    setPhotoFraming(false);
    setTakeGround(DESIGNER_GROUND);
    setPhotoCutout(false);
    setFrameAspect(REEL_ASPECT);
    setPhotoAngle(null);
    takeRef.current?.endPreview?.();
  }

  async function runPhoto({ shape, ground, cutout } = {}) {
    if (!takeRef.current) { setReelMsg({ ok: false, text: 'The 3D view is still loading.' }); return; }
    // ⚠️ A decoration that resolves a moment after the shutter is simply MISSING from the picture,
    // and nothing about the downloaded file says so. Milder than the reel's version of this — a
    // topper popping in mid-take — but harder to notice, which is its own problem.
    if (decorLoading) {
      setReelMsg({ ok: false, text: 'Still loading the decorations — give it a moment so they are all in shot.' });
      return;
    }
    // The panel closes for the shot: it sits over the canvas, and the canvas is what is being
    // photographed. The framing stays up, so the frame on screen is still the frame being saved.
    setPhotoOptsOpen(false);
    setPhotoBusy(true);
    try {
      const { clamped, width, height } = await takeRef.current.capture({
        aspect: shapeByKey(shape).aspect,
        filename: photoFilename(design?.name, shape),
        caption: cutout ? '' : reelCaptionText,
        ground, transparent: !!cutout,
      });
      // Say when it came out smaller than asked. Silence means a baker eventually notices one photo
      // is softer than the rest with nothing to attribute it to.
      setReelMsg({ ok: true, text: clamped
        ? `Photo saved at ${width}×${height} — this device could not hold full size.`
        : `Photo saved${cutout ? ' with a see-through background' : ''} — ${width}×${height}.` });
    } catch (e) {
      setReelMsg({ ok: false, text: `Couldn't save the photo: ${e.message}` });
    } finally {
      setPhotoBusy(false);
      closePhotoPanel();
    }
  }

  async function runReel(opts = {}) {
    if (!takeRef.current) { setReelMsg({ ok: false, text: 'The 3D view is still loading.' }); return; }
    // ⚠️ A decoration that arrives mid-take POPS INTO the reel — and a reel is the one artefact here
    // that leaves the app and cannot be quietly re-rendered afterwards. The Record button is disabled
    // while anything is in flight; this is the second line of defence, for the case where the last
    // topper starts loading between the tap and the first frame.
    if (decorLoading) {
      setReelMsg({ ok: false, text: 'Still loading the decorations — give it a moment so they are all in shot.' });
      return;
    }
    const secs = opts.seconds ?? 4.5;
    // The panel closes for the take — it sits over the canvas, and the canvas is what is being
    // filmed. It is NOT unmounted, so the settings are still there for the next cake, and the 9:16
    // framing stays up so the shot on screen is still the shot being recorded.
    setReelOptsOpen(false);
    setReelBusy(true);
    setReelMsg({ ok: true, text: `Recording… hold still for ${secs} seconds.` });
    try {
      const safe = (design?.name || 'cake').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { instagramReady, mimeType, resolution, demoted } = await takeRef.current.record({
        ...opts, filename: `${safe || 'cake'}-reel`,
        caption: reelCaptionText, ground: takeGround,
      });
      // ⚠️ Say when it is NOT an MP4. Instagram rejects WebM, and a baker who is only told
      // "downloaded" finds that out at the moment they try to post — by which time the cake may not
      // even be on screen any more.
      // Say when it recorded smaller. Silence here means a baker eventually notices one reel is
      // softer than the rest with nothing to attribute it to — and the honest version also tells
      // them the lever they have: fewer decorations, or a newer phone.
      const smaller = demoted ? ` Recorded at ${resolution} — this device could not hold full size.` : '';
      setReelMsg(instagramReady
        ? { ok: true, text: `Reel downloaded — ready for Instagram.${smaller}` }
        : { ok: false, text: `Downloaded as ${mimeType?.includes('webm') ? 'WebM' : mimeType}. Instagram needs MP4 — convert it before posting, or record in a newer Chrome.${smaller}` });
    } catch (e) {
      setReelMsg({ ok: false, text: `Couldn't record: ${e.message}` });
    } finally {
      setReelBusy(false);
      // Back to the designer. The message stays up to say what happened — it is a toast, not part
      // of the framing — so nothing is lost by clearing the preview here.
      closeReelPanel();
    }
  }

  // Identity, not chrome: the avatar says WHOSE account this is, so it keeps the bakery's colour —
  // it is the one place in the app where the brand is the content rather than the decoration.
  const brandPrimary = bakerData?.primary_color || primaryColor;
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
  /* The ceiling handed to both take panels: stop the bottom sheet 10px short of the frame's own
   * bottom edge, so the shot stays visible while it is being described.
   *
   * ⚠️ DECLARED HERE, next to isMobile, and not beside the measurement it uses. Placed with the
   * frame effect above it read isMobile before its `const` — "Cannot access 'isMobile' before
   * initialization", which the build and the whole suite passed and the first page load threw.
   *
   * Only while FRAMING and only on a phone: on desktop the panel is centred and the frame is parked
   * beside it, so there is nothing to get out of the way of. */
  const takeSheetMaxH = (isMobile && framing && frameBottom > 0)
    ? `calc(100vh - ${Math.round(frameBottom) + 10}px)`
    : undefined;
  // Capability gate for nav/chrome. Unknown caps (not loaded / no /me) → show all,
  // preserving existing baker apps. '*' = super admin. Enforcement is server-side;
  // this only hides controls a principal can't use.
  const hasCap = (cap) => !capabilities || !cap || capabilities.includes('*') || capabilities.includes(cap);
  // Which Orders entries this person may see — decided once, read by both rails.
  const ordersMenu = ORDERS_MENU.filter(item => hasCap(item.requires));
  const canManageStore = hasCap('store:manage') || hasCap('billing:manage') || hasCap('staff:manage');

  // ── Opening what a notification points at ──────────────────────────────────────────────────────
  // The API decides the destination (lib/notificationLink.js) and hands over a PATH like
  // `/?order=123`. It is a query param and not a route because the baker app is one page — the order
  // list is a panel in here, not a screen you can navigate to — so a link says WHAT TO OPEN and this
  // opens it. Same mechanism `?session=` already uses for live co-design.
  //
  // Parsed rather than assigned to window.location: navigating would reload the designer, throwing
  // away an unsaved cake to show an order. Nobody would forgive that twice.
  const openNotificationLink = useCallback((link) => {
    if (!link) return;
    const params = new URLSearchParams(String(link).split('?')[1] ?? '');
    const orderId = params.get('order');
    const panel   = params.get('panel');

    if (orderId || panel === 'orders') {
      setOrdersFilter(null);
      setOrdersInitialView('list');
      setNewOrderId(orderId || null);   // OrdersPanel's initialOrderId — selects it on open
      setOrdersPanelOpen(true);
      return;
    }
    if (panel === 'billing') { setBuyCreditsOpen(true); return; }
    // An unknown panel means a newer API than this bundle. Doing nothing is better than guessing at
    // a screen — the notification is already marked read and the bell still lists it.
  }, []);

  // Which Chef's Desk tools this plan includes. Asked once, and only for someone who could see the
  // menu at all — a customer designing a cake on a storefront has no plan to ask about, and the call
  // is behind requireAuth.
  useEffect(() => {
    if (!canManageStore || !apiClient?.fetchBakerFlavours) return;
    let alive = true;
    apiClient.fetchBakerFlavours()
      .then(r => { if (alive) setFlavoursUncurated(r?.curated === false); })
      .catch(() => {});   // a failed lookup marks nothing, like the entitlement one below
    return () => { alive = false; };
  }, [canManageStore, apiClient, flavoursPanelOpen]);

  useEffect(() => {
    if (!canManageStore || !apiClient?.fetchEntitlements) return;
    let alive = true;
    apiClient.fetchEntitlements()
      .then(res => {
        if (!alive) return;
        setPrintStudioEnabled(res?.ent?.edible_print_studio === true);
        setReelCapture(res?.ent?.reel_capture === true);
        setReelBranding(res?.ent?.reel_branding === true);
      })
      .catch(() => {});   // a failed lookup leaves the tool hidden, which is the safe way round
    return () => { alive = false; };
    // ⚠️ This fetch is gated on canManageStore, so the reel flags inherit that condition — a designer
    // without store:manage would never see the option. Left as-is rather than widened, because
    // STAFF_UI_ENABLED is false and every user therefore has the capability today. If staff logins
    // are ever switched on, this is the line that decides whether they can record.
  }, [canManageStore, apiClient]);

  // Live co-design (Phase 1) — opt-in; fully inert unless enableLive/liveSessionId is set, so the
  // normal app is unchanged. Shares the single `design` atom over Supabase Realtime: the pen holder
  // broadcasts, everyone else applies via loadDesign (echo-guarded inside the hook).
  const codesign = useDesignSession({
    supabase, apiClient, design, loadDesign,
    initialSessionId: liveSessionId,
    role,
    displayName: userData ? `${userData.firstName ?? ''} ${userData.lastName ?? ''}`.trim() || null : null,
    enabled: true,   // available whenever the host app wires the session apiClient methods
  });
  // "Design Together" share/control panel (right-side), opened from the sidebar. Auto-opens
  // for someone who arrived on a join link so they see the live status immediately.
  const [codesignPanelOpen, setCodesignPanelOpen] = useState(!!liveSessionId);
  // When the InvitePanel is opened FROM a live session, this carries the session id so the
  // invite binds the customer to it and the link routes them into the live room. Null = a
  // normal (non-live) invite.
  const [inviteLiveSessionId, setInviteLiveSessionId] = useState(null);

  // ── The rail, declared ONCE ─────────────────────────────────────────────────────────────────────
  // Every destination in the spatula rail, in order. Both surfaces read this array: the desktop rail
  // draws it with labels, the mobile bottom bar draws the same items as icons.
  //
  // ── WHY ONE LIST ────────────────────────────────────────────────────────────────────────────────
  // It was two, plus two copies of the click handler and two copies of the "is it active" ternary —
  // four places that had to agree about one menu, kept in step by a comment asking the next person
  // to remember. They stopped agreeing: Uploads was added to the rail as its own destination and
  // never reached the phone, so a baker holding a phone had NO route to their own images. The
  // desktop `active` ternary knew about uploadsOpen and the mobile one did not, which is the same
  // divergence a second time in the same feature.
  //
  // A missing nav item is invisible to every gate we have. It is not a crash, not a duplicate block
  // (the lists were formatted differently), and no test renders this rail. The only defence is that
  // there is nothing to keep in step.
  //
  // 'new' is in the list so the desktop rail can draw it first; the mobile bar filters it out and
  // draws its own circled +, which is a different SHAPE, not a different item.
  const railItems = useMemo(() => [
    // `short` is for the phone's strip, where a slot is ~70px and a label is 9.5px. Only the items
    // that can appear THERE need one; the More sheet is three-across and fits the full name.
    { id: 'new',        label: 'New Cake',    icon: null,                        requires: 'design:create', short: 'New' },
    { id: 'dashboard',  label: 'Dashboard',   icon: <DashboardIcon size={20} />, requires: 'order:view' },
    { id: 'templates',  label: 'Templates',   icon: <TemplatesIcon size={20} />, requires: 'design:create' },
    { id: 'elements',   label: 'Decorations', icon: <ElementsIcon size={20} />,  requires: 'design:create' },
    // Uploads sits in the RAIL, not inside Decorations: it is a PLACE you go (your own images —
    // photos, decorations), not a kind of decoration. It is also where uploading now happens, so
    // burying it three taps deep inside another panel made no sense.
    { id: 'uploads',    label: 'Uploads',     icon: <UploadsIcon size={20} />,   requires: 'element:manage' },
    // Orders carries a submenu: the calendar is a VIEW of the same orders, so it belongs under
    // Orders rather than as its own rail destination. Declared as `menu` config — any nav item gets
    // a submenu the same way.
    { id: 'orders',     label: 'Orders',      icon: <OrdersIcon size={20} />,    requires: 'order:view', menu: ordersMenu },
    { id: 'customers',  label: 'Customers',   icon: <CustomersIcon size={20} />, requires: 'customer:manage' },
    ...(INVITE_UI_ENABLED ? [{ id: 'invite', label: 'Invite', icon: <InviteIcon size={20} />, requires: 'customer:manage' }] : []),
    { id: 'share',      label: 'Share',       icon: <ShareIcon size={20} />,     requires: 'design:create' },
    ...(CODESIGN_UI_ENABLED && codesign.live && role !== 'customer'
      ? [{ id: 'codesign', label: 'Design Together', icon: <CoDesignIcon size={20} />, requires: 'design:create' }] : []),
    // ── "Take a tour" is not a rail item ──────────────────────────────────────────────────────
    // Removed from the rail: the column is short of vertical room (the hang-hole came out for the
    // same reason), and a tour is the one entry here that a baker needs once rather than daily.
    //
    // ⚠️ THIS LEAVES NO WAY BACK IN. `autoStart` is `customer || tourSeen === false`, so once a
    // baker's tour_seen_at is stamped the tour never runs again, and this item was the only manual
    // re-entry. If it should be reachable, the Settings menu is the natural home — but that menu is
    // written TWICE (desktop rail + mobile header), so it wants sharing before a thirteenth entry is
    // added to one of them and not the other. `tourNonce` / `startNonce` / `TourIcon` are left in
    // place deliberately — unused today, and exactly what a new home would need.
  ].filter(item => hasCap(item.requires)), [ordersMenu, codesign.live, role, capabilities, orderMode]);

  /* ── The tools below the divider must sit on the nav's rhythm ────────────────────────────────
   * sidebarNav is `flex: 1` with `justify-content: space-evenly`, so its items spread to fill the
   * blade — 68px apart on a 900px window, tightening toward the bare 2px gap on a short one. The
   * tools group below the divider is a plain stack, so it sat at its natural 49px however tall the
   * window was. On a laptop that reads as Chef's Desk and Settings being crammed together while
   * everything above them is evenly spaced.
   *
   * Measured rather than hard-coded, because the nav's pitch is not a constant — it is whatever
   * space-evenly worked out for this viewport. A fixed gap would match at exactly one window height
   * and be wrong at every other, which is the bug again with a different number.
   *
   * ⚠️ Declared HERE, below railItems and isMobile. A dependency array is evaluated on every render,
   * so sitting this above them threw "Cannot access 'isMobile' before initialization" — the same
   * temporal-dead-zone shape that took the app down for an hour on 2026-08-22.
   */
  /* ⚠️ A callback ref held in STATE, not useRef.
   *
   * With useRef the effect ran once at mount — when the designer was still on its loading screen and
   * the rail did not exist yet — found `.current` null, bailed, and never ran again, because neither
   * dependency changes when the rail finally mounts. Everything else was correct and the gap simply
   * stayed at its default. Storing the node in state re-runs the effect the moment it appears. */
  const [railNavEl, setRailNavEl] = useState(null);
  // 2, because that is sidebarNav's own `gap` — its floor when the viewport is too short to spread.
  // Floored at 4 instead, the two groups settled 2px apart on any window under ~750px: the nav had
  // bottomed out at its gap and this one had bottomed out at a different number.
  const [toolGap, setToolGap] = useState(RAIL_MIN_GAP);
  useLayoutEffect(() => {
    const nav = railNavEl;
    if (isMobile || !nav) return undefined;
    const measure = () => {
      const items = nav.querySelectorAll('button[data-tour]');
      if (items.length < 2) return;
      const a = items[0].getBoundingClientRect();
      const b = items[1].getBoundingClientRect();
      const pitch = (b.top + b.height / 2) - (a.top + a.height / 2);
      // pitch = gap + item height, so the gap that reproduces it is pitch - height. Floored at the
      // nav's own gap so a mid-layout measurement of 0 cannot collapse the group.
      if (a.height <= 0 || pitch <= 0) return;
      const next = Math.max(RAIL_MIN_GAP, Math.round(pitch - a.height));
      /* ⚠️ This is a FEEDBACK LOOP, deliberately damped.
       *
       * Widening this gap makes the tools group taller, which leaves the flex:1 nav less height,
       * which shortens the nav's own pitch — so measuring again gives a slightly different answer
       * and the observer fires once more. The maths converges quickly (each round moves the answer
       * by about a fifth of the last change), but "quickly" is not "never", and a 1px disagreement
       * ping-ponging forever would spin the ResizeObserver for the life of the session.
       *
       * So: ignore movements of a pixel or less. The loop settles in three or four sub-frame rounds
       * and then stops entirely. */
      setToolGap(prev => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [isMobile, railNavEl, railItems.length]);


  // ── Chef's Desk + Settings, declared ONCE ───────────────────────────────────────────────────────
  // These were written TWICE — desktop rail and phone header — each with a comment asking the next
  // person to keep them in step. railItems' own note asked for exactly this "before a thirteenth
  // entry is added to one of them and not the other".
  //
  // ⚠️ FLAT, not nested. The More sheet has no surface for a submenu (mobileNav.js says so, and
  // `strandedMenus` exists to make a violation loud), so the sheet renders these ITEMS under a
  // heading rather than a button that would open something the sheet cannot draw.
  const toolMenus = useMemo(() => [
    {
      id: 'chefsdesk', label: "Chef's Desk", icon: <ToolsIcon size={20} />,
      items: [
        { id: 'colorGuide', label: 'Color Guide', open: () => setColorGuideOpen(true) },
        ...(printStudioEnabled ? [{ id: 'printStudio', label: 'Edible Print Studio', open: () => setPrintStudioOpen(true) }] : []),
      ],
    },
    {
      id: 'settings', label: 'Settings', icon: <GearIcon size={20} />,
      items: [
        ...(hasCap('store:manage') ? [
          { id: 'store',     label: 'Store Settings', open: () => setSettingsPanelOpen(true) },
          // The badge rides the DATA, so both surfaces show it. It used to be typed into each copy.
          { id: 'flavours',  label: 'Flavours', open: () => setFlavoursPanelOpen(true),
            badge: flavoursUncurated ? { text: 'all on', title: 'Every flavour is switched on by default' } : null },
          // NOT "Templates". The rail already has a Templates destination — browsing templates to
          // start a design — and in the More sheet the two now sit a few rows apart, where one word
          // for two different things is a coin toss. This one chooses which global templates the
          // bakery OFFERS, which is what features/template-visibility.md calls it.
          { id: 'templates', label: 'Template visibility', open: () => setTemplatesPanelOpen(true) },
        ] : []),
        // Catalogue authors only. Gated on the BAKER flag, not a capability: `hasCap` answers "may
        // this person do X", and this asks "is this bakery one of ours" — a question no user-level
        // permission can answer. See spattoo-docs/features/reel-capture.md.

        ...(hasCap('billing:manage') ? [{ id: 'billing', label: 'Billing', open: () => setBillingPanelOpen(true) }] : []),
        ...(STAFF_UI_ENABLED && hasCap('staff:manage') ? [{ id: 'staff', label: 'Add Staff', open: () => setAddUserModal(true) }] : []),
      ],
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // ⚠️ EVERY asynchronously-loaded condition used above must be in this list. exhaustive-deps is
  // disabled here, so nothing warns — and the failure is silent and total: the value arrives after
  // mount, the memo never recomputes, and the menu entry can never appear however correct its gate
  // is. That is exactly how 'Record a reel' shipped invisible (fixed in cc21e06). printStudioEnabled
  // is the live example: it is false until fetchEntitlements resolves.
  ].filter(m => m.items.length), [printStudioEnabled, flavoursUncurated, capabilities]);

  // Where each rail item goes on a phone: four in the strip, the rest behind More. The reasoning
  // and the submenu invariant live in mobileNav.js, which is tested — the two surfaces sharing one
  // list is the whole point, and the last time they did not, Uploads went missing from the phone.
  const { primary: mobilePrimary, secondary: mobileSecondary } = useMemo(() => splitMobileNav(railItems), [railItems]);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    const stranded = strandedMenus(railItems);
    if (stranded.length) {
      console.error(`[nav] ${stranded.join(', ')} carries a submenu but sits in the More sheet, which has no surface to render one. Add it to MOBILE_PRIMARY, or give the sheet a submenu.`);
    }
  }, [railItems]);

  // What tapping one DOES. One function, both surfaces — the phone's copy of this had also lost
  // 'uploads', so even re-adding the item to the mobile array would have drawn a dead button.
  const openRailItem = (id, menu) => {
    if (menu) {
      setNavMenuId(o => (o === id ? null : id));
      setChefsDeskOpen(false); setSettingsOpen(false); setProfileOpen(false);
      return;
    }
    if (id === 'new')       handleNewCake();
    if (id === 'elements')  openElements();
    if (id === 'uploads')   setUploadsOpen(true);
    if (id === 'tools')     openTools();
    if (id === 'templates') openTemplates();
    if (id === 'dashboard') setDashboardOpen(true);
    if (id === 'customers') setCustomersPanelOpen(true);
    if (id === 'invite')    { setInviteLiveSessionId(null); setShareDraftDesign(null); setInvitePanelOpen(true); }
    if (id === 'share')     onShareStore?.();
    if (id === 'codesign')  setCodesignPanelOpen(true);
  };

  // Whether it reads as the current destination. Also shared: the two copies of this had drifted
  // too, and a lit-up item is a smaller bug than a missing one only because it is visible.
  const railItemActive = (id, menu) => (menu ? navMenuId === id
    : id === 'elements'  ? elementsOpen
    : id === 'uploads'   ? uploadsOpen
    : id === 'templates' ? templatesOpen
    : id === 'tools'     ? toolsOpen
    : id === 'codesign'  ? codesignPanelOpen
    : false);

  // More lights up when the destination you are looking at lives inside it — otherwise the strip
  // would show nothing selected while a panel from the sheet is open, and the bar would read as
  // though you were nowhere.
  const mobileSecondaryActive = mobileSecondary.some(i => railItemActive(i.id, i.menu));


  useEffect(() => {
    if (apiClient?.fetchBakerSettings) {
      apiClient.fetchBakerSettings().then(s => setBakerSettings(s ?? {})).catch(() => {});
    }
  }, [apiClient]);

  useEffect(() => {
    if (apiClient?.fetchMe) {
      apiClient.fetchMe().then(me => {
        setCapabilities(me?.capabilities ?? null);
        setRole(me?.role ?? null);
        // baker_appusers.tour_seen_at (migration 060). Undefined on an API that predates it, which
        // must read as NOT seen — a baker on an old server should still be offered the tour, not
        // silently denied it.
        setTourSeen(me?.tourSeen === true);
        // Avatar initials: in customer mode fetchBakerProfile returns no `user`, so
        // /api/me is where the logged-in principal's name comes from (baker or customer).
        if (me?.firstName || me?.lastName) {
          setUserData({ firstName: me.firstName, lastName: me.lastName, email: me.email });
        }
      }).catch(() => {});
    }
  }, [apiClient]);

  // Overlay DB-authored cream textures onto the in-code seed (Phase 2). Falls back to the seed if the
  // host apiClient has no fetchTextures or the table is empty. Bump a version to re-render with merged
  // params (the style picker + tier geometry read the registry at render time).
  const [, setTextureVersion] = useState(0);
  useEffect(() => {
    if (apiClient?.fetchTextures) {
      apiClient.fetchTextures()
        .then(rows => { if (rows?.length) { applyTextureConfig(rows); setTextureVersion(v => v + 1); } })
        .catch(() => {});
    }
  }, [apiClient]);

  // Overlay DB-authored text styles (the look of an editable {name}/{number} placeholder) onto the
  // in-code seed. Same seed+overlay contract as textures: a host with no fetchTextStyles — or an empty
  // table — keeps rendering off the seed, so a placeholder never silently loses its value.
  useEffect(() => {
    if (apiClient?.fetchTextStyles) {
      apiClient.fetchTextStyles()
        .then(rows => { if (rows?.length) { applyTextStyleConfig(rows); setTextureVersion(v => v + 1); } })
        .catch(() => {});
    }
  }, [apiClient]);

  // Overlay DB-authored cake shapes — the footprints admin authored in the Cake Shape Studio — onto the
  // in-code seed. Same seed+overlay contract as textures and text styles, but the stakes are the reverse
  // way round: the seed carries ONLY `round` and `rect` (the keys existing designs already store), so a
  // host with no fetchCakeShapes still renders every cake that exists — while every shape a customer can
  // CHOOSE arrives from this fetch. A baker who has authored no shapes offers round and rectangle, which
  // is the honest answer, not a broken one.
  const [shapeVersion, setShapeVersion] = useState(0);
  useEffect(() => {
    if (apiClient?.fetchCakeShapes) {
      apiClient.fetchCakeShapes()
        .then(rows => { if (rows?.length) { applyCakeShapeConfig(rows); setShapeVersion(v => v + 1); } })
        .catch(() => {});
    }
  }, [apiClient]);

  // The ONE catalog both shape pickers read — the New-cake grid and the tier popup's Shape row. Two
  // lists would be two chances to disagree about what shapes exist; recomputed when the overlay lands.
  const shapeOptions = useMemo(() => cakeShapeList(), [shapeVersion]);

  // Overlay DB-authored materials (the per-material ordered style list) onto the in-code frostings seed.
  // Bumps the same version so the style picker re-reads the merged registry. Materials absent from the
  // DB keep their seed. Run after textures so style keys the materials reference are already resolvable.
  useEffect(() => {
    if (apiClient?.fetchMaterials) {
      apiClient.fetchMaterials()
        .then(rows => { if (rows?.length) { applyMaterialConfig(rows); applyDecorMaterialConfig(rows); setTextureVersion(v => v + 1); } })
        .catch(() => {});
    }
  }, [apiClient]);

  // Re-read the baker profile from the API. Extracted (rather than living only inside the mount
  // effect) because bakerData drives the blocked-access gate below, and it was otherwise fetched
  // ONCE at mount: a baker who lapsed, opened Billing from the gate and PAID still had
  // subscription_status='expired' in state, so closing the panel dropped them back on the expired
  // screen despite a successful payment. BillingPanel calls this via onSubscriptionChange.
  // Failure keeps the last good profile — a transient network error must not blank the app or
  // (worse) gate a baker who is actually paid up.
  const refreshBakerProfile = useCallback(async () => {
    if (!apiClient?.fetchBakerProfile) return;
    try {
      const { baker, user } = await apiClient.fetchBakerProfile();
      // Same precedence as CustomerStorefront — prefer the background-removed logo. On THIS
      // path the backend has already resolved the key, so it arrives as logo_transparent_url;
      // the supabase fallback below gets the raw logo_transparent_key and resolves it itself.
      if (baker) setBakerData({
        ...baker,
        logo_url: baker.logo_transparent_url || baker.logo_url,
      });
      if (user) setUserData(user);
    } catch { /* keep the last good profile */ }
  }, [apiClient]);

  useEffect(() => {
    if (apiClient?.fetchBakerProfile) {
      refreshBakerProfile().finally(() => setBakerReady(true));
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
        .select('id, name, logo_url, logo_transparent_key')
        .eq('id', contact.baker_id)
        .single();
      // Prefer the background-removed logo, the same precedence CustomerStorefront uses — it
      // floats cleanly on any surface, where the raw upload can carry a white or coloured box.
      // Note the column shapes differ: logo_url is already absolute, logo_transparent_key is a
      // bare R2 key, because the backend resolves keys only for the profile it serves and this
      // reads the table directly. assetUrl() returns null when the key is absent or no assets
      // base is configured, so the fallback to logo_url is what runs in local dev.
      if (baker) setBakerData({
        ...baker,
        logo_url: assetUrl(baker.logo_transparent_key, cfAssetsBase) ?? baker.logo_url,
      });
      setBakerReady(true);
    });
  }, [supabase, apiClient, cfAssetsBase, refreshBakerProfile]);

  // Tag telemetry with baker context so every error report (boundary, texture,
  // global handler) carries baker_id. The host app sets `surface`; the customer
  // path attaches customer_id from the storefront/order flow.
  useEffect(() => {
    if (bakerData?.id) setContext({ bakerId: bakerData.id });
  }, [bakerData]);

  useEffect(() => {
    function onMouseDown(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false);
      if (profileRef.current  && !profileRef.current.contains(e.target))  setProfileOpen(false);
      if (chefsDeskRef.current && !chefsDeskRef.current.contains(e.target)) setChefsDeskOpen(false);
      if (navMenuRef.current && !navMenuRef.current.contains(e.target)) setNavMenuId(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Saving a design as a template goes through the HOST — never straight to the DB.
  //
  // There used to be a fallback here that inserted into cake_templates directly from the browser,
  // resolving baker_id CLIENT-side. It was REMOVED: it let the caller pick its own tenant. A host
  // that wants templates must supply onSaveTemplate, which posts to an API route that resolves the
  // tenant from the token. Fail closed: no host callback, no save.
  //
  // No rights attestation here: a template is the baker's design library, seen only by their own
  // invited customers. The IP gate is the storefront Publish button (ThemePreview) — the one moment
  // content becomes world-visible.
  /* Closing the save modal and clearing what was typed into it. One function because there are now
   * three ways out — the ✕, "Record a reel" and "Not now" — and a form that half-resets on one of
   * them shows the last template's name to the next one. */
  function closeSaveModal() {
    setSaveModal(false); setSaveMsg(null); setReelOffer(false);
    setTemplateName(''); setTemplateWeight('');
    setTemplateMinAge(''); setTemplateMaxAge(''); setTemplateOccasionIds(new Set());
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    // ── A tiered template needs its floor ────────────────────────────────────────────────────────
    // Required on TIERED designs only. A single-tier cake has no structural minimum — it is whatever
    // size the customer asks for — so demanding a number there is friction on the common case for a
    // problem that does not exist on it.
    //
    // Without one, storefront floorFor() returns 0 and the size facet's shape step cannot move the
    // weight at all: a customer can order three tiers at 1kg and nothing stops them. That is the
    // check the step exists for, and it never fires.
    //
    // Client-side only, deliberately. Core is vendored and ships separately from the API, so a
    // server rule rejecting tiered templates without a weight would start failing saves from any
    // cached older client.
    if (design.tiers.length > 1 && templateWeight === '') {
      setSaveMsg({ ok: false, text: 'A tiered design needs a minimum weight — the lightest you can build it at.' });
      return;
    }
    if (!onSaveTemplate) {
      setSaveMsg({ ok: false, text: 'Saving templates is unavailable here.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);

    // Capture from the off-screen thumbnail canvas (no floor, flattened onto white) as a compact WebP.
    // Keep the blob here — the onSaveTemplate callback path hands the raw blob to the host.
    thumbRenderNowRef.current?.();
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const thumbnailBlob = await captureThumbnailBlob(thumbCanvas);

    // Same shared serializer as order + share (tiers carry shape/width/depth so a sheet
    // round-trips on reload).
    const designJson = buildDesignSnapshot(design);

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
      /* ── Saving a template is the moment to offer a reel ──────────────────────────────────────
       * Not a nag and not a coach-mark. A baker has just finished a design they thought worth
       * keeping — which is the same judgement that makes a design worth posting — and they are
       * looking at it, on the screen that can film it. Ten minutes later they are somewhere else and
       * the thought is gone.
       *
       * It also puts the feature in front of bakers who would never go looking through the Actions
       * sheet for it, at the one moment the answer is obviously yes.
       *
       * ⚠️ Only when there is something to offer. A baker whose plan cannot record must get the
       * modal they have always got — closing itself, out of the way — rather than a dead end or,
       * worse, an upsell at the end of a task they just completed. */
      if (canRecordReel) {
        setSaveMsg({ ok: true, text: 'Template saved.' });
        setReelOffer(true);
      } else {
        setSaveMsg({ ok: true, text: 'Template saved!' });
        setTimeout(closeSaveModal, 1200);
      }
    } catch (err) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Eager load elements if the design already has piping or placed decor — piping needs
  // placement_config.rotation synced, and placed stickers need their source element resolvable
  // (so the placement chooser can read allowed_zones/placement_config) before the panel opens.
  useEffect(() => {
    const hasPiping = design.tiers.some(t => t.topPipings?.length || t.bottomPipings?.length);
    if (hasPiping || design.stickers.length) loadElementsIfNeeded();
  }, []);

  // Eager load element_types (with allowed_actions) on mount so edit controls
  // are available immediately — before the elements panel is ever opened.
  useEffect(() => {
    if (apiClient) {
      apiClient.fetchElementTypes().then(data => { if (data) setElementTypes(data); });
      // ⚠️ Array.isArray, not a truthiness check. `if (data)` accepts an OBJECT, and the save
      // modal calls filterTags.filter() — so any host whose fetchTags answers with an envelope
      // ({ items: [] }, an error body) white-screens the modal rather than showing no occasions.
      // Found because the harness's catch-all stub returns exactly that shape.
      apiClient.fetchTags?.().then(data => { if (Array.isArray(data)) setFilterTags(data); }).catch(() => {});
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

  // `force` re-reads the catalog even though it's already loaded — used after the user uploads their
  // own decoration, which adds a row the in-memory copy doesn't know about.
  //
  // `categoryId` loads ONE browsing category instead of the lot (migration 065) — what the panel
  // does on a category tap. Those rows are MERGED into what is already held rather than replacing
  // it: `elementById` is how a placed sticker resolves its own source element, so replacing the map
  // when the customer opens a second category would strip the placement rules off decorations
  // already standing on the cake.
  //
  // Loading everything stays the default and stays correct for the cases that need it — a saved
  // design references arbitrary elements, and search has to see all of them.
  async function loadElementsIfNeeded(force = false, categoryId = null) {
    if (!force && !categoryId && allElementsLoaded) return;
    if (categoryId && loadedCategories.has(categoryId)) return;
    setElementTypesLoading(true);
    let rows = [];
    if (apiClient) {
      rows = await apiClient.fetchElements({ parentsOnly: true, ...(categoryId ? { categoryId } : {}) });
    } else {
      let q = supabase
        .from('cake_elements')
        .select('id, name, description, image_url, thumbnail_url, allowed_zones, placement_config, sort_order, element_type_id, category_id, default_color, allowed_actions')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('sort_order');
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data: topLevelData } = await q;
      rows = topLevelData ?? [];
    }
    // Normalise relative keys to full URLs so the canvas renderers work consistently
    const resolveUrl = key => {
      if (!key) return key;
      try { new URL(key); return key; } catch { return cfAssetsBase ? `${cfAssetsBase}/${key}` : key; }
    };
    rows = rows.map(r => {
      // The alternate piping GLB lives inside placement_config (not a column), so resolve
      // its R2 key to a full URL here too, the same way image_url is handled.
      let pc = r.placement_config;
      if (pc && (pc.top_alt_glb_url || pc.bottom_alt_glb_url || pc.photo?.mask || pc.photo?.overlay)) {
        pc = { ...pc };
        if (pc.top_alt_glb_url)    pc.top_alt_glb_url    = resolveUrl(pc.top_alt_glb_url);
        if (pc.bottom_alt_glb_url) pc.bottom_alt_glb_url = resolveUrl(pc.bottom_alt_glb_url);
        // Photo-frame nested asset keys (mask shape, optional decorative overlay) → full URLs, like
        // image_url. Idempotent: the API already expands these, so resolveUrl(fullUrl) is a no-op;
        // this also covers the direct-Supabase path.
        if (pc.photo?.mask || pc.photo?.overlay) {
          pc.photo = { ...pc.photo };
          if (pc.photo.mask)    pc.photo.mask    = resolveUrl(pc.photo.mask);
          if (pc.photo.overlay) pc.photo.overlay = resolveUrl(pc.photo.overlay);
        }
      }
      return { ...r, image_url: resolveUrl(r.image_url), thumbnail_url: resolveUrl(r.thumbnail_url), placement_config: pc };
    });

    // Which type cards to render. Unioned on a category load — the set drives the picker, so
    // replacing it would hide the type cards belonging to a category opened a moment ago.
    setActiveElementTypeIds(prev => {
      const next = categoryId ? new Set(prev) : new Set();
      rows.forEach(r => next.add(r.element_type_id));
      return next;
    });
    // Match the food-foil type tolerantly (slug or name contains "foil") so routing fires regardless of
    // the exact slug the admin chose (food-foil / food_foil / gold foil …).
    const foilTypeId     = elementTypes.find(et => /foil/i.test(et.slug ?? '') || /foil/i.test(et.name ?? ''))?.id;
    // BEHAVIOUR IS CONFIG, NEVER ELEMENT TYPE. Placement STYLE ("hero" = `single_per_slot`, ONE instance
    // per tier×surface via the checkbox chooser) and orientation (stand/hug/facing) are read straight
    // from each element's OWN placement_config — authored in admin, and materialised into every existing
    // row by the one-time migrate_topper_placement (2026-07-20). Element type is a LOGICAL CATEGORY only
    // (it groups the picker below); it injects NO config. (Gold leaf is the ONE remaining type→config
    // seed — a tier-finish whose kind/finish/colours aren't yet admin-authored; migrate it the same way
    // when the Gold Leaf studio owns that config, then this last branch goes too.)
    rows = rows.map(r => {
      // Gold leaf ("food foil"): a tier-finish element. Seed kind:'tier_finish' + the studio-tuned
      // finish look and the two allowed colours; the row's own config always wins via the spread.
      if (r.element_type_id === foilTypeId) {
        const rPc = r.placement_config ?? {};
        return { ...r,
          allowed_zones: r.allowed_zones?.length ? r.allowed_zones : ['side'],
          placement_config: { ...rPc, kind: 'tier_finish',
            finish: { ...GOLD_LEAF_DEFAULTS, ...(rPc.finish ?? {}) },
            colors: rPc.colors ?? GOLD_LEAF_COLORS } };
      }
      return r;
    });
    const scatteredDecorTypeId = elementTypes.find(et => et.slug === ELEMENT_SLUGS.SCATTERED_DECOR)?.id;
    const picksTypeId          = elementTypes.find(et => et.slug === ELEMENT_SLUGS.PICKS)?.id;
    const imageTopperTypeId    = elementTypes.find(et => et.slug === ELEMENT_SLUGS.IMAGE_TOPPER)?.id;
    const pipingStampTypeId    = elementTypes.find(et => et.slug === 'piping_stamp')?.id;
    // Note: topper / top_side elements are intentionally NOT in knownTypeIds — they fall into the
    // generic `others` bucket and render via the same draggable grid as every other type (their
    // hero/stand behaviour is config, not type — see above).
    const knownTypeIds         = new Set([scatteredDecorTypeId, picksTypeId, imageTopperTypeId, pipingStampTypeId].filter(Boolean));

    // A CATEGORY load adds to what is held; a full load is the truth and replaces it. Merging by id
    // rather than concatenating, because two categories can legitimately contain the same element
    // and a duplicate card in the picker is a bug the customer sees.
    const mergeById = (prev, next) => {
      if (!categoryId) return next;
      const seen = new Set(next.map(r => r.id));
      return [...prev.filter(r => !seen.has(r.id)), ...next].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    };

    setScatteredDecorDb(prev => mergeById(prev, rows.filter(r => r.element_type_id === scatteredDecorTypeId)));
    setPicksDb        (prev => mergeById(prev, rows.filter(r => r.element_type_id === picksTypeId)));
    setStampsDb       (prev => mergeById(prev, rows.filter(r => r.element_type_id === pipingStampTypeId)));
    setImageTopperDb  (prev => mergeById(prev, rows.filter(r => r.element_type_id === imageTopperTypeId)));

    const others = {};
    rows.filter(r => !knownTypeIds.has(r.element_type_id)).forEach(r => {
      (others[r.element_type_id] ??= []).push(r);
    });
    setOtherElementsDb(prev => {
      if (!categoryId) return others;
      const out = { ...prev };
      for (const [typeId, list] of Object.entries(others)) out[typeId] = mergeById(out[typeId] ?? [], list);
      return out;
    });

    // NEVER replaced on a category load. This map is what a placed sticker reads to find its own
    // element — swapping it for one category's worth would leave every decoration already on the
    // cake unable to resolve its placement rules.
    setElementById(prev => {
      const next = categoryId ? new Map(prev) : new Map();
      rows.forEach(r => next.set(r.id, r));
      return next;
    });
    if (categoryId) setLoadedCategories(prev => new Set(prev).add(categoryId));
    else            setAllElementsLoaded(true);
    setElementTypesLoading(false);
  }

  // Searching has to see the WHOLE catalogue, not the categories that happen to have been opened.
  // "lion" must find the lion whether or not the customer has been into Animals. So the first
  // keystroke pulls the lot — once, and only for someone who actually searched, which is the
  // difference between this and the old behaviour of doing it for everybody on open.
  useEffect(() => {
    if (elementsOpen && elemSearch.trim() && !allElementsLoaded) loadElementsIfNeeded();
  }, [elemSearch, elementsOpen]);   // eslint-disable-line react-hooks/exhaustive-deps

  // "My decorations" is a category to the customer even though it is an OWNERSHIP filter rather than
  // a row in element_categories. It earns a card in the same grid because that is where someone will
  // look for their own pictures — behind a real category is the one place they would never think to.
  const MY_DECORATIONS = { id: '__mine__', name: 'My decorations' };

  // Tapping a category. The elements arrive on demand; a category already visited is instant,
  // because loadElementsIfNeeded short-circuits on `loadedCategories`.
  async function openCategory(cat) {
    setActiveCategory(cat);
    // Mine has no category_id to filter on — the rows are identified by carrying a baker_id — so it
    // is the one card that needs the whole catalogue. Fine: it is opened rarely and by someone who
    // has uploaded something, not by every customer on arrival.
    await loadElementsIfNeeded(false, cat.id === MY_DECORATIONS.id ? null : cat.id);
  }

  async function openElements() {
    const opening = !elementsOpen;
    setElementsOpen(opening);
    setTemplatesOpen(false);
    setToolsOpen(false);
    // Note: do NOT close the piping stack here — picking another element should add a
    // card to the existing stack, not wipe it.
    if (!opening) return;

    // Back to the category list each time the panel opens, rather than resuming where the customer
    // left off. Reopening is how you go and look for something ELSE; landing back inside Animals
    // would hide every other category behind a Back button they have no reason to press.
    setActiveCategory(null);

    // Categories only — no elements. This is the whole point: the menu can be drawn from a list of
    // eleven names with counts, and nothing else is fetched until the customer picks one.
    if (!categories.length) {
      try {
        const cats = apiClient
          ? await apiClient.fetchElementCategories?.()
          : (await supabase.from('element_categories').select('id, slug, name, sort_order').eq('is_active', true).order('sort_order')).data;
        if (cats?.length) setCategories(cats);
        // No categories configured (or the call failed) → fall back to loading everything, which is
        // exactly how this panel behaved before. An environment that has not run migration 065 gets
        // the old experience rather than an empty panel.
        else await loadElementsIfNeeded();
      } catch {
        await loadElementsIfNeeded();
      }
    }
  }

  // Tools flyout (Cream Pen, …). Opening jumps straight to the cream-pen editor when a
  // message already exists, otherwise shows the tool list.
  function openTools() {
    const opening = !toolsOpen;
    setToolsOpen(opening);
    setElementsOpen(false);
    setTemplatesOpen(false);
    if (opening) { focusEditor('tools'); setActiveTool(writings.some(w => w.text) ? 'cream-pen' : null); }
  }

  // Open (or focus) a card for this element in the accordion stack. Picking a new
  // element appends a card and expands it, collapsing the others — without closing
  // the stack or disturbing the other layers already on the cake.
  // Open a piping card. From the palette (no cardId) this ALWAYS spawns a fresh instance, so
  // the same style can be placed several times as independent (e.g. differently coloured)
  // nested rings. From click-to-edit (cardId given) it focuses the card owning that ring.
  async function openPipingPopup(el, { cardId } = {}) {
    const focusOnly = () => {
      focusEditor('piping'); setPipingPopupOpen(true); setElementsOpen(false);
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
      const piping = makePipingLayer(el, { isTop, glbUrl, altGlbUrl, cardId: newCardId });
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
    const upper     = tierAbove(canvasConfig.tiers, tierIndex);   // tier resting on this rim, if any
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
      color: pipingPopupEl.default_color ?? '#f5e6c8', size: 1,
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

  // Gradient on a piping ring layer — same instance-level model as stickers (config gates
  // eligibility via the piping element's allowed_actions.gradient; the stops + mode live on the
  // ring layer's `gradient`). `color` stays the solid/stop-0 fallback. ≥2 stops = a gradient.
  function writePipingGradient(tierIndex, zone, colors, mode) {
    const clean = colors.filter(Boolean);
    updateRing(tierIndex, zone, p => clean.length >= 2
      ? ({ ...p, gradient: { mode, colors: clean }, color: clean[0] })
      : ({ ...p, gradient: undefined, color: clean[0] ?? p.color }));
  }

  function handlePipingSizeChange(tierIndex, zone, v) {
    updateRing(tierIndex, zone, p => ({ ...p, size: v }));
  }

  // Drip ring controls — a multiplier on the authored run length, and the wet/matte gloss.
  function handleDripLengthChange(tierIndex, zone, v) {
    updateRing(tierIndex, zone, p => ({ ...p, dripLength: v }));
  }
  function handleDripGlossChange(tierIndex, zone, v) {
    updateRing(tierIndex, zone, p => ({ ...p, dripGloss: v }));
  }
  function handleDripFloodChange(tierIndex, zone, v) {
    updateRing(tierIndex, zone, p => ({ ...p, dripFlood: v }));
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
    const upper = tierAbove(canvasConfig.tiers, tierIndex);
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
    const { yoMin, yoMax } = boardYoBounds(cur, tierIndex);
    const desiredYo = baseYOffset + v;
    const clampedYo = Math.min(Math.max(yoMin, desiredYo), Math.max(yoMin, yoMax));
    updatePipingLayer(tierIndex, 'board', cur.layerId, p => ({ ...p, userYOffset: Math.max(0, +(clampedYo - baseYOffset).toFixed(4)) }));
  }

  // The vertical band a board/side layer's ANCHOR may occupy: its bottom edge resting on the tier
  // base (or on the layer below), its top edge stopping under the rim (or under the layer above),
  // measured from each shell's real rendered reach rather than a guessed height.
  //
  // Extracted so the Height slider and the on-cake DRAG share one definition of "how far can this
  // go" (INVARIANTS #3). A second copy would drift, and the drag would let a baker push a piece
  // somewhere the slider refuses to — the two would disagree about the same cake.
  function boardYoBounds(cur, tierIndex) {
    const tierHeight = canvasConfig.tiers[tierIndex]?.height ?? 0;
    const [curLo, curHi] = sideBand(cur, tierIndex);
    const curYo  = (cur.yOffset ?? 0) + (cur.userYOffset ?? 0);
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
    return { yoMin, yoMax };
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

  // Dragging a single-mode piece on the CAKE. Writes the same field as the angle slider above — a
  // drag and the slider are two ways to set one number, not two features.
  //
  // Addresses the layer by layerId rather than going through updateRing, which resolves the ring from
  // the currently EXPANDED card: you can drag a piece with no card open (or with a different card
  // open), and it must still be that piece that moves.
  function handlePipingInstanceMove(tierIndex, zone, layerId, index, angle, wallY = null) {
    const cur = design.tiers[tierIndex]?.[zone === 'rim' ? 'topPipings' : 'bottomPipings']
      ?.find(p => p.layerId === layerId);
    if (!cur) return;
    // Height is a BOARD affordance: those pieces ride the wall, and the zone already has a Height
    // slider and a clamp. A rim piece sits ON the top edge — lifting it would leave it in mid-air —
    // so the rim drag stays angle-only and the canvas sends no wallY for it.
    let dy = null;
    if (wallY != null && zone === 'board') {
      const { yoMin, yoMax } = boardYoBounds(cur, tierIndex);
      const layerYo = (cur.yOffset ?? 0) + (cur.userYOffset ?? 0);
      // wallY is where the pointer met the wall, in tier-local units. Clamp the piece's own anchor
      // into the SAME band the slider clamps to, then store it as a delta from the layer's anchor —
      // so nudging the layer's Height afterwards still carries every piece with it.
      const clamped = Math.min(Math.max(yoMin, wallY), Math.max(yoMin, yoMax));
      dy = +(clamped - layerYo).toFixed(4);
    }
    updatePipingLayer(tierIndex, zone, layerId, (p) => ({
      ...p,
      instances: (p.instances ?? []).map((x, idx) =>
        idx === index ? { ...x, angle, ...(dy != null ? { dy } : {}) } : x),
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
  // Take this piping element OFF the cake entirely — every layer it has, on every tier and zone. The
  // per-zone checkbox above is the fine-grained control; this is the card-level "Remove" that the sticker,
  // cluster, foil and cream cards all have, so a piping element behaves like every other decoration.
  // Gated by the caller on allowed_actions.delete (config, not element type).
  function removePipingCard(cardId) {
    design.tiers.forEach((t, i) => {
      (t.topPipings    ?? []).forEach(p => { if (p.cardId === cardId) removePipingLayer(i, 'rim',   p.layerId); });
      (t.bottomPipings ?? []).forEach(p => { if (p.cardId === cardId) removePipingLayer(i, 'board', p.layerId); });
    });
    dropPipingCard(cardId);
    setExpandedPipingId(null);
  }

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
    if (selectedEl.type === 'tier') {
      const t = design.tiers[selectedEl.index];
      // A glaze tier's colour is its marble BASE stop (glaze.colors[0]), not tier.color — so the shared
      // wheel edits the glaze, config-driven off the finish's render KEY (never the literal name).
      if (frostingDef(t?.frostingType).render === 'glaze') return t?.glaze?.colors?.[0] ?? GLAZE_DEFAULTS.colors[0];
      return t?.color ?? '#f5b8c8';
    }
    if (selectedEl.type === 'piping') {
      const t = design.tiers[selectedEl.tierIndex];
      const arr = selectedEl.zone === 'top' ? t?.topPipings : t?.bottomPipings;
      return (arr?.find(p => p.layerId === selectedEl.layerId) ?? arr?.[0])?.color ?? '#f5e6c8';
    }
    if (selectedEl.type === 'text') return selectedText?.color ?? '#ffffff';
    if (selectedEl.type === 'sticker') {
      const st = design.stickers.find(s => s.id === selectedEl.id);
      // Editing a part-group / hue region → that group's colour, falling back to the colour the group
      // ACTUALLY IS (a hue region's detected hex) before the element's single colour.
      if (hasActiveGroup) return st?.groupColors?.[activeGroupKey] ?? activeGroupDefault ?? st?.color ?? '#ffffff';
      return st?.color ?? '#ffffff';
    }
    if (selectedEl.type === 'scatter') return design.stickers.find(s => s.elementId === selectedEl.elementId)?.color ?? '#ffffff';
    // Single-per-slot topper (decorEl card): read the recompose group colour off any instance.
    if (selectedEl.type === 'decorEl') {
      const st = design.stickers.find(s => s.elementId === selectedEl.elementId);
      if (hasActiveGroup) return st?.groupColors?.[activeGroupKey] ?? activeGroupDefault ?? st?.color ?? '#ffffff';
      return st?.color ?? '#ffffff';
    }
    return '#f5b8c8';
  }

  function handleColorChange(c) {
    if (!selectedEl) return;
    if (selectedEl.type === 'tier') {
      const t = design.tiers[selectedEl.index];
      // Glaze tier → set the marble BASE stop, preserving any further marble stops; other finishes → tier.color.
      if (frostingDef(t?.frostingType).render === 'glaze') {
        const rest = (t?.glaze?.colors ?? GLAZE_DEFAULTS.colors).slice(1);
        setTierGlaze(selectedEl.index, { colors: [c, ...rest] });
      /* ⚠️ A STRIPED tier's swatches edit the SELECTED STRIPE, not tier.color.
       *
       * Following the glaze precedent directly above: when a treatment owns the wall, the colour
       * controls edit that treatment rather than the solid colour underneath it. Without this the
       * whole swatch row is DEAD while stripes are on — measured, not assumed: clicking a dark green
       * left the wall unchanged, because tier.color is not what the shader reads.
       *
       * A picker that visibly does nothing is the kind of thing reported as a bug months later by
       * someone who cannot say what they expected, only that it felt broken. */
      } else if (areStripesActive(t?.stripes)) {
        const palette = (t.stripes.palette ?? []).slice();
        palette[Math.min(activeStop, palette.length - 1)] = c;
        setTierStripes(selectedEl.index, { palette });
      } else {
        setTierColor(selectedEl.index, c);
      }
      return;
    }
    if (selectedEl.type === 'piping') {
      const { tierIndex, zone } = selectedEl;
      const z = zone === 'top' ? 'rim' : 'board';
      if (selectedEl.layerId != null) updatePipingLayer(tierIndex, z, selectedEl.layerId, p => ({ ...p, color: c }));
      return;
    }
    if (selectedEl.type === 'text') updateText(selectedEl.id, { color: c });
    if (selectedEl.type === 'sticker') {
      if (hasActiveGroup) {
        // Recolour ONE group on this instance — a GLB part-group (render matches every mesh whose
        // userData.group === activeGroupKey: both shoes, both eyes) or a hue region (render recolours
        // every pixel clustered into that region). Leaves sticker.color alone.
        const st = design.stickers.find(s => s.id === selectedEl.id);
        updateSticker(selectedEl.id, { groupColors: { ...(st?.groupColors ?? {}), [activeGroupKey]: c } });
      } else {
        updateSticker(selectedEl.id, { color: c });
      }
    }
    // Single-per-slot topper: apply the group recolour to every placed instance of this element.
    if (selectedEl.type === 'decorEl') {
      const insts = design.stickers.filter(s => s.elementId === selectedEl.elementId);
      if (hasActiveGroup) insts.forEach(st => updateSticker(st.id, { groupColors: { ...(st.groupColors ?? {}), [activeGroupKey]: c } }));
      else insts.forEach(st => updateSticker(st.id, { color: c }));
    }
    // Scatter shares ONE colour across all its packed instances.
    if (selectedEl.type === 'scatter') design.stickers.filter(s => s.elementId === selectedEl.elementId).forEach(s => updateSticker(s.id, { color: c }));
  }

  function handleDelete() {
    if (!selectedEl && selectedStickerIds.size === 0) return;
    if (selectedEl?.type === 'piping') {
      const z = selectedEl.zone === 'top' ? 'rim' : 'board';
      if (selectedEl.layerId != null) removePipingLayer(selectedEl.tierIndex, z, selectedEl.layerId);
    } else if (selectedEl?.type === 'text') {
      removeText(selectedEl.id);
    } else if (selectedEl?.type === 'age') {
      removeAge(selectedEl.id);
    } else if (selectedStickerIds.size > 0) {
      // Orphan guard: a decor_pattern part whose pattern is not parts_deletable takes its
      // whole pattern with it — you can't leave a lone eye. Deletable patterns drop singly.
      const toRemove = new Set(selectedStickerIds);
      selectedStickerIds.forEach(id => {
        const s = design.stickers.find(x => x.id === id);
        if (s?.patternId && s.patternDeletable === false) {
          design.stickers.forEach(x => { if (x.patternId === s.patternId) toRemove.add(x.id); });
        }
      });
      toRemove.forEach(id => removeSticker(id));
      setSelectedStickerIds(new Set());
    }
    setSelectedEl(null);
    setColorOpen(false);
  }

  // ── Popup management — add new popups here to participate in mutual exclusion ──
  function closeAllPopups() {
    setPipingPopupOpen(false);
    setColorOpen(false);
    setActiveGroupKey(null);
  }

  // Clear the transient right-side editor UI: the piping-card stack + tools composer + open popups.
  // Decoration cards are DERIVED from `design` (so a reset/replace of the design clears them on its
  // own); piping cards + tools are independent UI state and must be cleared explicitly, else they
  // linger as orphaned cards after the design underneath them is gone. Used by every full design swap
  // (New Cake, template load) so no stale cards survive it.
  function resetEditors() {
    setPipingCards([]);
    setExpandedPipingId(null);
    setToolsOpen(false);
    setActiveTool(null);
    closeAllPopups();
  }

  // One right-side editor active at a time. Opening any of the three editors —
  // the decoration accordion, the piping stack, or the tools composer — collapses
  // the other two, so a newly opened element is the sole expanded popup (the rule
  // piping already followed, now common to all). Pass which editor is being opened.
  function focusEditor(which) {
    // Decoration and piping share ONE stack — opening one only collapses the OTHER
    // group's expanded card (single expansion), it does not hide the stack. Tools and
    // tier are separate editors that replace the stack entirely.
    if (which !== 'decoration') { setSelectedEl(null); setSelectedStickerIds(new Set()); setMultiSelectMode(false); }
    if (which !== 'piping')     setExpandedPipingId(null);
    if (which !== 'tools')      setToolsOpen(false);
    setColorOpen(false);
  }

  // ── Selection: ONE authority ──────────────────────────────────────────────
  // `selectedEl` is the single source of truth for WHAT is selected; `selectedStickerIds` only holds
  // the decoration instances to highlight for that selection. They are ALWAYS written together here so
  // they can never diverge into "two things selected at once" (the tier lit up while a decoration keeps
  // its box, or the reverse) — that entire class of bug came from call sites setting one state and
  // forgetting the other, per type. So NO call site clears the other state by hand: any exclusive
  // selection routes through this, passing its decoration instance ids (or none → the Set empties). The
  // additive multi-select path (ctrl / multi-select mode) is the ONE exception and owns the Set itself.
  function selectExclusive(el, stickerIds = null) {
    setSelectedEl(el);
    setSelectedStickerIds(new Set(stickerIds ?? []));
    setMultiSelectMode(false);
    setActiveGroupKey(null);
    setColorOpen(false);
  }

  function clearAllSelections() { selectExclusive(null); }

  // Clicking the floor or the sky clears the selection — right for every other tool, and wrong while
  // piping. Drawing means aiming at the cake, and missing it is ordinary: a stroke that starts a
  // fraction off the rim, a finger that lands on the board. Each of those ended the whole piping
  // session, took the nozzle cursor with it, and left the customer wondering why they could no
  // longer draw.
  //
  // Piping ends on "Done piping" and nowhere else. That was the point of adding the button; this is
  // the other half of it.
  function handleDeselect() {
    if (selectedEl?.type === 'tool' && selectedEl.tool === 'pen') return;
    clearAllSelections();
  }

  // ── Grass ───────────────────────────────────────────────────────────────────
  // Applied to the TOP tier: grass covers a surface, and the only top surface fully in view is the
  // topmost one — on a stack, a lower tier's top is mostly hidden under the tier above it. The card
  // lets it be moved to another tier afterwards; this is just where it lands.
  function grassTierIndex() { return Math.max(0, design.tiers.length - 1); }

  // `el` is the catalogue row when grass is picked from the Decorations grid, and absent when it is
  // picked from the Tools shortcut. The row carries the TUNED parameters an admin authored in the
  // studio (placement_config.grass) — that is the whole point of it being a row: "Putting green" and
  // "Wild meadow" are two rows over one generator, not two presets hardcoded in a studio.
  function addGrass(el) {
    const i = grassTierIndex();
    const tuned = el?.placement_config?.grass ?? {};
    // Defaults first, so a row that authors only a colour still gets a sensible field.
    if (!design.tiers[i]?.grass) {
      setTierGrass(i, { ...GRASS_DEFAULTS, color: el?.default_color ?? '#4caf3d', ...tuned });
    }
    selectExclusive({ type: 'grass' });
  }

  // ── Fondant rainbows ────────────────────────────────────────────────────────
  // Which tier a new one lands on: the TOP one, same as grass. It is the tier a decoration is most
  // often meant for, and on a single-tier cake — which is most of them — it is the only answer.
  function rainbowTierIndex() { return Math.max(0, design.tiers.length - 1); }

  // `el` is the catalogue row. It carries the parameters an admin tuned in the studio
  // (placement_config.rainbow), which is the whole point of it being a row: "Pastel arch" and "Bold
  // six-band" are two rows over one generator, not two presets hardcoded in a studio.
  //
  // Defaults first, so a row that authors only its colours still gets a whole rainbow.
  function addRainbow(el) {
    const i = rainbowTierIndex();
    const tuned = el?.placement_config?.rainbow ?? {};
    const id = `rb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // ── A new rainbow is one of the TILES, never a mixture of two ────────────────────────────────
    // RAINBOW_DEFAULTS is not a neutral base: its feet and its `offsetX: 0.71` are the FALLING RIGHT
    // shape. So a catalogue row that authors only part of a shape inherits the rest from a different
    // one. That is not hypothetical — the shipped Rainbow row sets both feet to 'top' and never
    // mentions offsetX, so it arrived as an on-top arch carrying a falling rainbow's lean: a shape
    // none of the six tiles can produce, which is exactly what "the default one is not from the
    // tiles" was. It looked centred only because the code below then shoved it back by -0.71 to
    // hide the lean it should not have had.
    //
    // The first tile sits BETWEEN the defaults and the row, so it fills what the row leaves unsaid
    // without overruling what the row actually says. An admin who authors a wall rainbow still gets
    // one; a row that authors nothing gets "On the top" exactly, tile for tile.
    const base = { ...RAINBOW_DEFAULTS, ...arrangementShape(RAINBOW_ARRANGEMENTS[0]), ...tuned };
    // Computed inside the updater from the LIVE list, not from `design` as this component last
    // rendered it — otherwise two quick presses both read the same list and the second rainbow lands
    // exactly on the first. The same bug the grass patches had, fixed the same way.
    updateTierRainbows(i, cur => [
      ...cur,
      { ...base, id,
        // ── Which CATALOGUE element this is ────────────────────────────────────────────────────
        // A placed rainbow used to keep only its own instance id, so nothing downstream could tell
        // WHICH rainbow it was — and the X-Ray sheet looks a craft guide up by element id. The
        // result was a cake whose most visible decoration had no how-to at all.
        elementId: el?.id ?? null,
        elementName: el?.name ?? null,
        // ── The first one lands in the MIDDLE ───────────────────────────────────────────────────
        // An arch carries its own lean — `offsetX` is how far it straddles along its own plane, and
        // for the shapes that fall off one side that is most of a radius. Placed with no position of
        // its own it therefore arrives shoved to one side, which is exactly what "it loads to the
        // right" was. Cancelling the lean puts the arc over the middle of the cake.
        //
        // A SECOND one steps aside rather than landing on the first, and it steps — it does not
        // turn. Turning each new one a quarter round was the old answer and it was the same mistake
        // the drag made: a rainbow seen edge-on is not a rainbow anybody ordered.
        ...(() => {
          // From the MERGED shape, not from `tuned` with RAINBOW_DEFAULTS behind it. Those two
          // disagree the moment the tile supplies an offsetX the row does not, and this line
          // cancelling a lean the arch no longer has is how a centred rainbow ends up shoved
          // three quarters of a radius to the left.
          const lean = -(base.offsetX ?? 0);
          if (!cur.length) return { px: lean, pz: 0 };
          const a = cur.length * 1.2;          // irrational-ish turn, so four in a row do not stack
          return { px: lean + Math.sin(a) * 0.4, pz: Math.cos(a) * 0.4 };
        })() },
    ]);
    selectExclusive({ type: 'rainbow', tierIndex: i, id });
  }

  function removeRainbow(tierIndex, id) {
    updateTierRainbows(tierIndex, cur => cur.filter(r => r.id !== id));
    clearAllSelections();
  }

  // ── Fondant clouds ──────────────────────────────────────────────────────────
  // Its own element, never a checkbox on the rainbow: clouds turn up without one, several at a time,
  // on the top and the sides and the board. The pair arrives together as a decor_pattern instead.
  function addCloud(el) {
    const i = Math.max(0, design.tiers.length - 1);
    const tuned = el?.placement_config?.cloud ?? {};
    const id = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    updateTierClouds(i, cur => [
      ...cur,
      { ...CLOUD_DEFAULTS, ...tuned, id,
        // The catalogue element, so the X-Ray can find its guide — see addRainbow.
        elementId: el?.id ?? null,
        elementName: el?.name ?? null,
        // Each one further round than the last, so a second cloud is visibly a second cloud rather
        // than a redraw of the first. Read from the LIVE list inside the updater, or two quick
        // presses both see the same list and the second lands exactly on the first.
        yaw: cur.length * 0.9 },
    ]);
    selectExclusive({ type: 'cloud', tierIndex: i, id });
  }

  function removeCloud(tierIndex, id) {
    updateTierClouds(tierIndex, cur => cur.filter(c => c.id !== id));
    clearAllSelections();
  }

  // The handle machinery hands back (u, v) on the surface; cloudDragTo turns that into the cloud's
  // own words. A board cloud is measured against the BOARD's radius, because it stands outside the
  // cake and the tier's own scale would cap it at the cake's edge.
  // The canvas resolves the pointer against the surface the cloud sits on and hands back the patch
  // already in the cloud's own words — it has the tier geometry to hand, and re-deriving it here
  // would be a second definition of where a tier's lid is.
  function handleCloudMove(tierIndex, id, patch) {
    updateTierClouds(tierIndex, cur => cur.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeGrass() {
    design.tiers.forEach((t, i) => { if (t.grass) setTierGrass(i, null); });
    setBoardGrass(null);
    clearAllSelections();
  }

  // The two placements are independent — the football cake wants a pitch on top AND tufts ringing
  // the base. Toggling one never disturbs the other, and turning both off removes the card.
  function toggleTopGrass() {
    const i = grassTier >= 0 ? grassTier : grassTierIndex();
    if (design.tiers[i]?.grass) setTierGrass(i, null);
    else setTierGrass(i, { ...GRASS_DEFAULTS, color: grassColor });
  }

  function toggleBoardGrass() {
    if (design.boardGrass) setBoardGrass(null);
    // A board ring is shorter and denser than a lawn — it reads as a hedge at the cake's foot, not a
    // field. `ringWidth` is a fraction of the gap between the cake and the board's edge.
    else setBoardGrass({ ...GRASS_DEFAULTS, height: 0.16, spacing: 0.06, color: grassColor, ringWidth: 0.75 });
  }

  // Which tier currently carries grass (the card edits that one).
  // Declared ABOVE grassColor deliberately: grassColor reads it during RENDER, and a `const` read
  // before its declaration is a TDZ crash — one that compiles, passes every test, and only appears
  // as a blank screen. This file has been bitten by exactly that twice.
  const grassTier = design.tiers.findIndex(t => t.grass);

  // ── Fondant letter blocks ───────────────────────────────────────────────────
  // Type a name, get one cube per letter, then move any of them. The run is generated ONCE; after
  // that each block is its own placement, so a drag moves that block and nothing else. "Line them
  // up again" re-runs the generator, which is the escape hatch from an arrangement gone wrong.
  const [blocksSelected, setBlocksSelected] = useState(null);
  const nb = design.nameBlocks;

  // The surface a run is laid on. Board: the cake's foot, so the arc clears the wall. Top: the
  // highest tier, since a lower tier's top is mostly hidden under the one above it.
  // How far a board run must stand OFF the wall to clear whatever is already piped there.
  //
  // Reuses the rule that already exists rather than inventing a second one (INVARIANTS #3):
  // resolveSidePipingBands turns a tier's stacked piping into absolute bands, and
  // sidePipingClearance answers "how far out must something spanning [yBottom, yTop] sit to clear
  // every band it overlaps". A proud decoration on the wall has used this since it was written; a
  // block on the board is the same question asked by a different object.
  //
  // The vertical span is the CUBE: from the board up by one edge. A tall block overlaps a border a
  // short one passes under, and it should be pushed out further for it.
  function blockWallClearance(zone, size) {
    if (zone !== 'board') return 0;
    const t = canvasConfig.tiers?.[0];
    if (!t) return 0;
    const bands = resolveSidePipingBands({
      topPipings: t.topPipings ?? [], bottomPipings: t.bottomPipings ?? [],
      topY: BOARD_TOP_Y + t.height, yBase: BOARD_TOP_Y, height: t.height, radius: t.radius,
    });
    return sidePipingClearance({ bands, yBottom: BOARD_TOP_Y, yTop: BOARD_TOP_Y + size });
  }

  function blockSurface(zone, sizeOverride) {
    const tiers = canvasConfig.tiers ?? [];
    const bottom = tiers[0], top = tiers[tiers.length - 1];
    const boardR = (bottom?.radius ?? 1.2) + 0.6;
    const size = sizeOverride ?? nb?.size ?? NAME_BLOCK_DEFAULTS.size;
    if (zone === 'top') {
      return { surfaceRadius: top?.radius ?? 1.2, runRadius: (top?.radius ?? 1.2) * 0.55, minV: 0 };
    }
    // The wall, plus whatever is piped on it, plus half a block.
    const runRadius = boardRunRadius((bottom?.radius ?? 1.2) + blockWallClearance('board', size), size);
    return { surfaceRadius: boardR, runRadius, minV: Math.min(0.97, runRadius / boardR) };
  }

  function layoutBlocks(text, zone, style = {}) {
    const { surfaceRadius, runRadius } = blockSurface(zone, style.size);
    return nameBlockRun({
      text, zone, surfaceRadius, runRadius,
      size: style.size ?? nb?.size ?? NAME_BLOCK_DEFAULTS.size,
      gap:  style.gap  ?? nb?.gap  ?? NAME_BLOCK_DEFAULTS.gap,
    });
  }

  // `el` is the catalogue row when picked from the Decorations grid, absent from the Tools shortcut
  // — same contract as addGrass. The row carries the parameters that make a cube read as FONDANT
  // (chamfer, letter relief, gap); the card owns what changes per cake (the name, size, colours).
  function addNameBlocks(el) {
    if (!design.nameBlocks) {
      const zone = 'board';
      const tuned = el?.placement_config?.letter_blocks ?? {};
      const seed = { ...NAME_BLOCK_DEFAULTS, ...tuned,
        ...(el?.default_color ? { blockColor: el.default_color } : {}) };
      setNameBlocks({ ...seed, zone, text: 'NAME', blocks: layoutBlocks('NAME', zone, seed) });
    }
    selectExclusive({ type: 'blocks' });
  }

  function removeNameBlocks() { setNameBlocks(null); setBlocksSelected(null); clearAllSelections(); }

  // ── The procedural registry ─────────────────────────────────────────────────
  // `placement_config.procedural` → the tool that adds it. Declared HERE, below both tools, purely
  // for readability: these are function declarations, so they hoist, but a reader should meet the
  // registry after the things it names.
  //
  // Adding a generator is one entry. Adding another GRASS is not a code change at all — it is a
  // catalogue row with different parameters, which is the entire reason for doing this.
  // ── Texts and Number toppers, from a ROW or from the Tools menu ─────────────────────────────
  // Both are generated objects that happen to be reachable from a hardcoded button, which is the
  // whole subject of plans/tools-into-the-catalogue.md: a thing that is not a `cake_elements` row
  // cannot be categorised, searched, priced, promoted to production, or retuned without a deploy.
  //
  // These two make them reachable from a row as well. `el` is the catalogue row when picked from
  // Decorations and absent when picked from Tools — the same optional-row contract addGrass has had
  // since the registry was written, so both paths run one function and cannot drift.
  function addWritingFromRow(el) {
    const tuned = el?.placement_config?.writing ?? {};
    const id = addWriting({ font: DEFAULT_CREAM_FONT, ...tuned });
    focusEditor('decoration');
    selectExclusive({ type: 'writing', id });
  }

  // ── Luster dust, from a catalogue row ─────────────────────────────────────────────────────────
  // Dust is not an object you place: it is `tier.dusting`, a wall treatment made of flicked splashes
  // plus an appearance. So a row cannot carry a POSITION the way a rainbow does — what it carries is
  // the LOOK, and tapping it seeds the tier with that look and opens the tool so the next tap flicks
  // dust that already looks like the thing that was chosen.
  //
  // NOT the colour, though — that is the customer's, along with density, fleck size, direction,
  // spread, height and glow, all of which their own card offers. A row that meant "gold" would be a
  // row they can undo with one tap.
  //
  // What a row is FOR is the material character the card does not expose: sparkle, glitter,
  // metalness, clearcoat. A soft pearl dust and a hard glitter are genuinely different products in a
  // way that gold and silver are not.
  function addDustFromRow(el) {
    const i = rainbowTierIndex();
    applyDustLook(i, el?.placement_config?.luster_dust ?? {});
    setDustTier(i);
    selectExclusive({ type: 'tool', tool: 'luster-dust' });
  }

  // ── The cream pen, from a catalogue row ───────────────────────────────────────────────────────
  // Same shape as the dust: the pen is a way of DRAWING, not an object, so a row carries the LOOK —
  // the nozzle, the colour, how thick and how soft — and tapping it sets the pen to that and opens
  // it. Every stroke drawn afterwards comes out as the thing that was chosen.
  //
  // `penStyle` is the seam. It already held exactly these settings for the pen's own card, so a row
  // does not need a second place to put them.
  // ── "I'll pipe it myself" ────────────────────────────────────────────────────────────────────
  // The zones above answer "where does this ring go". They cover the borders a baker pipes round a
  // rim or a board and nothing else — but a baker pipes anywhere, and the zone list is the whole
  // vocabulary the customer had. This hands them the same shape with no zone at all: drag on the
  // cake and it repeats along the line drawn.
  //
  // Nothing new renders it. The pen already stamps a GLB along a dragged path (`stamprope` in
  // CreamPen.jsx), walking the drawn polyline by arc length and dropping a copy every
  // `spacing × footprint`, each seated on the surface and turned to face along the path. That has
  // been complete since the pen was built and unreachable in core, because `stampId`/`stampUrl` sat
  // in penStyle and NOTHING ever set them. This is the door, not the machinery.
  //
  // `stampRegular` is the one thing piping needs that scattering does not — see stampTransforms.
  function pipeItMyself(el) {
    const { glbUrl } = resolvePipingGlbs(el);
    if (!glbUrl) return;
    setPenStyle(prev => ({
      ...prev,
      stampId: el.id,
      stampUrl: glbUrl,
      stampRegular: true,
      stampName: el.name,
      // Which card to go BACK to. Tapping this swaps the piping card for the pen card, and without
      // remembering where it came from there is no return: the zone tiles, the colour and the size
      // for the ring version are all behind a card the customer can no longer find.
      stampCardId: el.cardId,
      // How the ring stands this piece up. Without it a shell authored lying on its side is piped
      // lying on its side — the same element ringed round a rim stands, hand-piped it fell over.
      // The RIM (top) config, because drawing on the cake is the case that surface answers: feet on
      // the surface, leaning along it. The board variant is the same piece rotated for a plate.
      stampRotation: pipingPlacementFromConfig(el.placement_config, true).rotation ?? null,
      // ── Size it like PIPING, not like a rope ─────────────────────────────────────────────────
      // `thickness` on the pen is a rope DIAMETER, and the stamp scales to it: target = 2×thickness.
      // At the pen's own default that is 0.104 against a ring shell's 0.24 × 1.2 = 0.288, so the
      // first thing a customer saw was their border piped at under half size — beads, not shells.
      //
      // PIPE_STAMP_THICKNESS lands the stamp on the ring's own footing. It is an ESTIMATE, not a
      // derivation: SHELL_HEIGHT_FRAC normalises a shell's HEIGHT and the stamp scales by its widest
      // horizontal extent, so the two agree in magnitude and not exactly. That is what the slider is
      // for, and why its range opens up in stamp mode rather than stopping just above this value.
      thickness: PIPE_STAMP_THICKNESS,
      color: el.default_color ?? prev.color,
    }));
    // Collapse the piping card: the choice has been made and the next move is on the cake, not in
    // this popup. Leaving it open puts a zone list over the surface being drawn on.
    setExpandedPipingId(null);
    selectExclusive({ type: 'tool', tool: 'pen' });
  }

  // Back to the piping card this came from — the zone tiles, and everything about the ring version.
  const stampSourceCard = pipingCards.find(c => c.cardId === penStyle.stampCardId) ?? null;
  function backToPipingCard() {
    if (!stampSourceCard) return;
    openPipingPopup(stampSourceCard, { cardId: stampSourceCard.cardId });
  }

  // Back to drawing plain cream. Without this the only way out of stamp mode is a reload — penStyle
  // keeps whatever was last put in it, so a customer who tried piping by hand and then wanted a line
  // of cream would go on stamping shells with no way to say stop.
  // Coming back to the pen always starts in DRAW. A tool that remembers it was left in move mode
  // greets the next visit by doing nothing when you drag, which reads as broken.
  useEffect(() => {
    if (!(selectedEl?.type === 'tool' && selectedEl.tool === 'pen')) setPenMove(false);
  }, [selectedEl]);

  function pipeWithCreamAgain() {
    setPenStyle(prev => ({ ...prev, stampId: null, stampUrl: null, stampRegular: false,
                           stampName: null, stampCardId: null, stampRotation: null, stampLean: 0,
                           thickness: PEN_DEFAULT_THICKNESS }));
  }

  /* ⚠️ THE ROW IS THE AUTHORITY, and the medium's defaults sit UNDER it. A `chocolate_pen` row gets
     a fine round tip, dark brown and a gloss finish without restating any of it; a row that also
     names a colour — white chocolate, ruby — wins over the default. Master data on the row, material
     recipe in the table (pipingMedia.js), and neither needs a deploy to change.

     `medium` comes from the registry key rather than from the row, because AddElement writes only
     `placement_config.procedural` — an admin can pick the generator but cannot author nested config,
     so a medium that lived only in the nested block could not actually be created by anyone. */
  function addPenFromRow(el, medium = DEFAULT_MEDIUM) {
    /* ⚠️ THE NESTED BLOCK IS KEYED BY THE ROW'S OWN GENERATOR, falling back to `cream_pen`. Every
       existing pen row carries its tuning under `cream_pen` and must keep working; but an admin
       filling in a chocolate pen would reasonably write `chocolate_pen: {…}`, and reading only the
       one key would ignore it in silence — the worst kind of wrong, because the row looks configured
       and behaves as though it is not. */
    const cfg = el?.placement_config ?? {};
    const tuned = cfg[cfg.procedural] ?? cfg.cream_pen ?? {};
    setPenStyle(prev => ({ ...prev, medium, ...(MEDIA[medium]?.defaults ?? {}), ...tuned }));
    selectExclusive({ type: 'tool', tool: 'pen' });
  }

  function addAgeFromRow(el) {
    addAge(el?.placement_config?.number_topper ?? {});
    focusEditor('decoration');
    // `pending`, because the id is minted inside the setState and is not readable here — an effect
    // below resolves it to the real one. The same dance the Tools button has always done.
    selectExclusive({ type: 'age', pending: true });
  }

  const PROCEDURAL_TOOLS = {
    grass: addGrass,
    letter_blocks: addNameBlocks,
    rainbow: addRainbow,
    cloud: addCloud,
    writing: addWritingFromRow,
    // `number_topper`, never `age`. This key is DATA — it sits in placement_config on the row and an
    // admin reads it on screen, so it is not the internal name it looks like. The same reasoning
    // that named the button "Number topper": a 5 on a cake is usually somebody's age, and naming the
    // thing after that makes the product look like it is asking for one. It is not, and it stores
    // nothing of the kind.
    //
    // `design.ages[]` and addAge keep their names, because those ARE internal and are written into
    // every saved snapshot — renaming them is a data migration for a word nobody sees. This key has
    // no rows yet, so it costs nothing to get right now.
    number_topper: addAgeFromRow,
    // Both are LOOKS rather than objects — see addDustFromRow and addPenFromRow.
    luster_dust: addDustFromRow,
    cream_pen: addPenFromRow,
    /* One pen, two media. A separate KEY rather than a flag on the row, for two reasons:
       the key is the only thing an admin can author on Add Element (it writes `procedural` and
       nothing nested); and a customer looking for chocolate should meet a chocolate item on the
       shelf rather than a cream one with a setting to change.

       ⚠️ What that item is CALLED is data, not this. The display name lives on the row and an admin
       edits it without a deploy — it reads "Chocolate Drawing" today. Never write a name into a
       comment as though the code depends on it; the code depends on the key. */
    /* ⚠️ CHOCOLATE OPENS THE STUDIO; it does not write on the cake. Drawing a filigree on a curved
       surface with a mouse is the hard way to do it and not how the piece is made — piped flat on
       parchment, set, then placed. Doing it on a plate also removes two limits at a stroke: a fill
       always works (there is no curved wall to cut through), and fill becomes per-shape rather than
       "whatever you drew last".

       Chocolate strokes already on saved cakes keep rendering; the renderer is untouched. Only the
       way NEW ones are made has changed. Cream still writes directly on the cake — the same move is
       planned for it, deliberately after this one. */
    chocolate_pen: () => setGarnishStudio(true),
    /* Opens the studio rather than placing something. A garnish has to be MADE before it can be
       put anywhere, which is the one procedural tool so far whose first act is a screen. */
    chocolate_garnish: () => setGarnishStudio(true),
  };

  // Re-typing re-lays the run. Keeping arrangements across an edit was considered and dropped: the
  // letters change, so index-matched positions would put an old letter's spot under a new letter,
  // which is worse than an honest fresh line-up.
  function setBlocksText(text) {
    updateNameBlocks(cur => ({ text, blocks: layoutBlocks(text, cur.zone, cur) }));
  }

  function setBlocksZone(zone) {
    updateNameBlocks(cur => ({ zone, blocks: layoutBlocks(cur.text, zone, cur) }));
  }

  function realignBlocks() {
    updateNameBlocks(cur => ({ blocks: layoutBlocks(cur.text, cur.zone, cur) }));
  }

  // Dragged on the cake. Yaw is recomputed rather than kept: on the board a block that holds its
  // old angle after being moved ends up showing its blank side to the room.
  function handleBlockMove(_tier, idx, u, v) {
    updateNameBlocks(cur => {
      // Dragging INWARD stops at the piping, not at the wall. Clamped here rather than at render so
      // the stored position and the handle agree — clamping only the drawing would leave the grab
      // dot sitting inside a border while its block stood outside.
      const { minV } = blockSurface(cur.zone, cur.size);
      const cv = Math.max(v, minV);
      return { blocks: (cur.blocks ?? []).map((b, k) => k === idx ? { ...b, u, v: cv, yaw: nameBlockYaw(cur.zone, u) } : b) };
    });
  }

  // ── Grass clumps ────────────────────────────────────────────────────────────
  // A third placement, and a different KIND from the other two: whole-top and rim band both answer
  // "cover this surface", a clump answers "put one here". Stored and dragged exactly like a luster
  // dust splash — polar (u, v) against the surface, moved by a handle on the cake — so this reuses
  // FinishHandles rather than inventing a third way to drag something.
  const [grassSelected, setGrassSelected] = useState(null);   // { tier, idx } — BOARD_TIER for the board
  const GRASS_PATCH_R = 0.42;

  // A new clump goes wherever there is most ROOM, not at a fixed spot. The first version put every
  // one at the same (u, v), so the second landed on top of the first and "+ Add clump" looked
  // broken — the list grew and the cake did not change.
  const newPatch = (existing = [], v = 0.62) => nextPatchSpot(existing, { v, r: GRASS_PATCH_R });

  function addGrassPatch(onBoard) {
    // The next spot is computed from the LIVE list inside the updater, not from `design` as this
    // component last rendered it — otherwise two quick presses both read the same list and the
    // second clump lands on the first, which is the bug this whole change is fixing.
    if (onBoard) {
      updateBoardGrass(cur => {
        const list = cur.patches ?? [];
        return { patches: [...list, newPatch(list, 0.86)] };   // 0.86 — clear of the cake wall
      });
      setGrassSelected({ tier: BOARD_TIER, idx: (design.boardGrass?.patches?.length ?? 0) });
    } else if (grassTier >= 0) {
      updateGrass(grassTier, cur => {
        const list = cur.patches ?? [];
        return { patches: [...list, newPatch(list)] };
      });
      setGrassSelected({ tier: grassTier, idx: (design.tiers[grassTier].grass.patches?.length ?? 0) });
    }
  }

  function removeGrassPatch(tier, idx) {
    if (tier === BOARD_TIER) {
      updateBoardGrass({ patches: (design.boardGrass?.patches ?? []).filter((_, k) => k !== idx) });
    } else {
      updateGrass(tier, { patches: (design.tiers[tier]?.grass?.patches ?? []).filter((_, k) => k !== idx) });
    }
    setGrassSelected(null);
  }

  // Dragged on the cake. The handle reports (u, v) on whichever surface it was grabbed from.
  // A rainbow is MOVED, never dialled. The handle machinery hands back (u, v) on the surface — an
  // angle round the cake and a fraction out from its middle — and rainbowDragTo turns that into the
  // rainbow's own words: `yaw` and `standoff` over the cake, `theta` and `spring` on the wall.
  //
  // The lean is held. `offsetX` is the arch's SHAPE, not its position, so a drag moves where the
  // rainbow stands without quietly turning "over, falling right" into something else.
  function handleRainbowMove(tierIndex, id, patch) {
    updateTierRainbows(tierIndex, cur => cur.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }


  function handleGrassMove(tier, idx, u, v) {
    if (tier === BOARD_TIER) {
      updateBoardGrass({ patches: (design.boardGrass?.patches ?? []).map((p, k) => k === idx ? { ...p, u, v } : p) });
    } else {
      updateGrass(tier, { patches: (design.tiers[tier]?.grass?.patches ?? []).map((p, k) => k === idx ? { ...p, u, v } : p) });
    }
  }

  function setGrassPatchSize(tier, idx, r) {
    if (tier === BOARD_TIER) {
      updateBoardGrass({ patches: (design.boardGrass?.patches ?? []).map((p, k) => k === idx ? { ...p, r } : p) });
    } else {
      updateGrass(tier, { patches: (design.tiers[tier]?.grass?.patches ?? []).map((p, k) => k === idx ? { ...p, r } : p) });
    }
  }

  // One colour across both placements: it is one piping bag. Read from whichever exists.
  const grassColor = design.tiers[grassTier]?.grass?.color ?? design.boardGrass?.color ?? '#4caf3d';
  function setGrassColor(color) {
    if (grassTier >= 0) updateGrass(grassTier, { color });
    if (design.boardGrass) updateBoardGrass({ color });
  }

  function moveGrassToTier(next) {
    const cur = grassTier;
    if (cur === next || next == null) return;
    const g = design.tiers[cur]?.grass;
    if (!g) return;
    setTierGrass(cur, null);
    setTierGrass(next, g);
  }

  function handleTierClick(i) {
    // ── The cake is the CANVAS while piping, not a thing to select ─────────────────────────────
    // A tap on the cake normally selects that tier and opens its panel, which replaces the pen
    // editor and so ends draw mode. While piping that is precisely backwards: the cake is what you
    // are drawing ON, and every press lands on it.
    //
    // The catchers already stopPropagation on POINTERDOWN, and it does not help — tier selection
    // fires on CLICK, a separate event that goes through regardless. Hence the guard here rather
    // than another stopPropagation there.
    //
    // The floor got the same treatment last release. Between them: while the pen is out, nothing on
    // the canvas changes the selection, and piping ends on "Done piping".
    if (selectedEl?.type === 'tool' && selectedEl.tool === 'pen') return;
    closeAllPopups();
    // Clicking the already-selected tier toggles it off; otherwise the tier becomes the sole selection.
    const isSame = selectedEl?.type === 'tier' && selectedEl.index === i;
    selectExclusive(isSame ? null : { type: 'tier', index: i });
  }

  // ── Re-pose a placed decoration ─────────────────────────────────────────────────────────────────
  // A jersey on the cake top reads as a standing topper OR as a decal hugging the surface, and which
  // is right is the customer's taste rather than a property of the jersey. The pose is per-INSTANCE (it
  // always was — `placementMode` lives on the sticker), so this changes one decoration and leaves its
  // siblings alone.
  //
  // A pose change is a RE-SEAT, not a field edit. Three of the instance's fields mean different
  // things (or nothing) in the other pose, and carrying them across is how an element ends up
  // floating, leaning, or half-buried:
  //
  //   yOffset     a height nudge tuned against a standing seat is wrong against a flat one
  //   tiltAngle   only the upright branch leans; a stale tilt makes a stood-up element lurch
  //   rollAngle   the same, on the other axis
  //   insertDepth burial is upright-only
  //
  // `rotation` is deliberately KEPT: it is spin in both poses (yaw standing, in-plane hugging), so
  // losing it would undo work the customer can see.
  //
  // x/z are re-clamped because the legal area differs — a standing element may sit right at the rim
  // (margin 0), while hugging it needs half its width of clearance or it hangs off the edge. Without
  // this, flipping an element parked at the rim leaves it overhanging.
  function setStickerPose(sticker, mode) {
    const el = elementById.get(sticker?.elementId);
    if (!el || !sticker) return;
    const seat = zoneSeatFields(el.placement_config, sticker.zone, mode);
    if (seat.placementMode === sticker.placementMode) return;
    const next = { ...seat, yOffset: 0, tiltAngle: 0, rollAngle: 0, insertDepth: null };
    if (sticker.zone === ZONES.TOP_SURFACE) {
      const tier = canvasConfig.tiers[sticker.tierIndex] ?? canvasConfig.tiers[0];
      const margin = seat.placementMode === 'stand' ? 0 : (STICKER_SIZE / 2) * (sticker.scale ?? 1);
      const { x, z } = topClampInset(tierShape(tier), sticker.x ?? 0, sticker.z ?? 0, margin);
      next.x = x; next.z = z;
    }
    updateSticker(sticker.id, next);
  }

  function handleTextSelect(id) {
    focusEditor('decoration');
    selectExclusive({ type: 'text', id });
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
    // While the pen is out the cake is a CANVAS, not a set of things to select — see
    // handleTierClick. A ring or a decoration under the nozzle is something you are drawing over.
    if (selectedEl?.type === 'tool' && selectedEl.tool === 'pen') return;
    const arr = design.tiers[tierIndex]?.topPipings ?? [];
    const piping = arr.find(p => p.layerId === layerId) ?? arr[0];
    if (piping) openCardForLayer(tierIndex, 'rim', piping);
  }

  function handleBottomPipingSelect(tierIndex, layerId) {
    // While the pen is out the cake is a CANVAS, not a set of things to select — see
    // handleTierClick. A ring or a decoration under the nozzle is something you are drawing over.
    if (selectedEl?.type === 'tool' && selectedEl.tool === 'pen') return;
    const arr = design.tiers[tierIndex]?.bottomPipings ?? [];
    const piping = arr.find(p => p.layerId === layerId) ?? arr[0];
    if (piping) openCardForLayer(tierIndex, 'board', piping);
  }

  // Tap an element in the Decorations menu → place it on its first allowed zone (config decides
  // hug vs stand) and select it, which opens its card with the placement chooser. Fully
  // config-driven; works for any element whose allowed_zones has more than one surface.
  function tapPlaceElement(element) {
    // ── Procedural elements ─────────────────────────────────────────────────────────────────────
    // Grass and letter blocks are GENERATED, so the row carries no artwork — it carries identity
    // (name, thumbnail, tags) and the parameters an admin tuned. `placement_config.procedural` names
    // the generator; the registry maps that key to the tool that already exists.
    //
    // A registry rather than a branch per family, and keyed off CONFIG rather than the element type
    // (INVARIANTS #1) — so a second grass ("Putting green") is a row, never a code change. The same
    // functions the Tools shortcuts call, so there is one way to add grass and it cannot drift.
    //
    // Chocolate drip is deliberately NOT here: it is a piping element and rides the ring popup a few
    // branches down, which is the right home for it. "Procedural" is not the thing they have in
    // common — WHAT THEY WRITE is, and a drip writes a piping layer.
    const proc = PROCEDURAL_TOOLS[element.placement_config?.procedural];
    if (proc) {
      setElementsOpen(false);
      focusEditor('decoration');
      proc(element);
      return;
    }
    // Cluster elements: clicking in the decorations menu opens a placement popup (consistent "click to
    // open" behaviour) — the user drags the ball FROM the popup onto the cake (top or side), then grows
    // it into a cluster. Tapping never auto-drops one on top.
    if (element.placement_config?.cluster) {
      setElementsOpen(false);
      focusEditor('decoration');
      selectExclusive({ type: 'cluster-place', elementId: element.id });
      return;
    }
    // Tier-finish elements (gold leaf / food foil) paint flakes into the tier material rather than
    // placing a sticker. Config-driven (kind === 'tier_finish', never slug) → open the finish card,
    // where the customer picks tier/colour and taps flakes onto the cake.
    if (element.placement_config?.kind === 'tier_finish') {
      setElementsOpen(false);
      focusEditor('decoration');
      setFoilTier(0); setFoilSel(0);
      selectExclusive({ type: 'foil', elementId: element.id });
      return;
    }
    // Second cream layer (config: placement_config.second_cream) — a raised buttercream band, not a
    // sticker. Seed a first band so it shows immediately, then open the cream card to edit/add more.
    if (element.placement_config?.second_cream) {
      setElementsOpen(false);
      focusEditor('decoration');
      addCreamToTier(0);
      selectExclusive({ type: 'cream', elementId: element.id });
      return;
    }
    // Full-ring decoration (config: an 'element' ring finish on an allowed rim/board zone) — an ordinary
    // decoration set to repeat around the perimeter. It rides the SAME proven ring path as piping
    // (openPipingPopup → topPipings/bottomPipings); the renderer keeps its REAL materials because the
    // layer's finish resolves to 'element'. A finish KEY, never the element type (INVARIANTS #1/#6), so
    // the picker stays one uniform tap-to-open for every element.
    const rc = element.placement_config, rz = element.allowed_zones ?? [];
    const ringsRim   = rz.includes(ZONES.RIM)   && (rc?.top_ring_finish    ?? rc?.ring_finish) === 'element';
    const ringsBoard = rz.includes(ZONES.BOARD) && (rc?.bottom_ring_finish ?? rc?.ring_finish) === 'element';
    if (ringsRim || ringsBoard) {
      openPipingPopup(element);
      return;
    }
    const zones = element.allowed_zones ?? [];
    // Prefer the top surface; a hero decoration belongs on the cake's actual top (the LAST/
    // topmost tier), not tier 0 (which is hidden under upper tiers on a multi-tier cake).
    const zone = zones.includes(ZONES.TOP_SURFACE) ? ZONES.TOP_SURFACE : (zones[0] ?? ZONES.TOP_SURFACE);
    const tierIndex = zone === ZONES.TOP_SURFACE ? design.tiers.length - 1 : 0;
    handleElementDrop(element, { zone, tierIndex, x: 0, z: 0 });
  }

  function handleStickerSelect(id, ctrlKey = false) {
    // Same rule as the tier and the rings: while piping, a decoration under the nozzle is something
    // you are drawing OVER, not something to open. Selecting it swaps the pen editor away and ends
    // the session mid-stroke.
    if (selectedEl?.type === 'tool' && selectedEl.tool === 'pen') return;
    const sticker = design.stickers.find(s => s.id === id);
    focusEditor('decoration');

    // A decor_pattern part belongs to ONE pattern card (the parts are abstracted away). Tapping any
    // part selects that pattern card; parts still drag individually (moveSet excludes patternId).
    if (!ctrlKey && !multiSelectMode && sticker?.patternId) {
      selectExclusive(
        { type: 'pattern', patternId: sticker.patternId, patternElementId: sticker.patternElementId },
        design.stickers.filter(s => s.patternId === sticker.patternId).map(s => s.id));
      return;
    }

    // A cluster ball belongs to ONE cluster card (the packed clump is abstracted away); tapping any
    // ball selects that card (ops run by clusterId). Like scatter, no per-instance highlight.
    if (!ctrlKey && !multiSelectMode && sticker?.clusterId) {
      selectExclusive({ type: 'cluster', clusterId: sticker.clusterId });
      return;
    }

    // A scatter instance belongs to ONE scatter card (density-managed set); tapping any selects the
    // card. We DON'T mark the instances selected — painting 41 sprinkles purple reads as a recolour
    // and would trip the grouping bar; the open card is the selection feedback. Ops run by elementId.
    if (!ctrlKey && !multiSelectMode && sticker?.scatter) {
      selectExclusive({ type: 'scatter', elementId: sticker.elementId });
      return;
    }

    // A multi-slot decor instance opens its element's single card (manages all placements),
    // not a per-instance selection — keeps one uniform card per element.
    if (!ctrlKey && !multiSelectMode && sticker && isMultiSlotEl(sticker.elementId)) {
      selectExclusive(
        { type: 'decorEl', elementId: sticker.elementId },
        design.stickers.filter(s => s.elementId === sticker.elementId).map(s => s.id));
      return;
    }

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
      // A grouped member belongs to ONE group card (members abstracted away, like a decor_pattern).
      // Tapping any member selects the group as a unit; drill into a single member from the card.
      selectExclusive(
        { type: 'group', groupId: sticker.groupId },
        design.stickers.filter(s => s.groupId === sticker.groupId).map(s => s.id));
    } else {
      // Toggle single selection
      const isOnly = selectedStickerIds.size === 1 && selectedStickerIds.has(id);
      selectExclusive(isOnly ? null : { type: 'sticker', id }, isOnly ? null : [id]);
    }
  }

  function handleStickerLongPress(id) {
    focusEditor('decoration');
    setMultiSelectMode(true);
    setSelectedStickerIds(new Set([id]));
    setSelectedEl({ type: 'sticker', id });
  }

  function handleGroupMove(key, startPositions, delta) {
    // A ball cluster belongs at the rim — rim-lock its drag so it slides AROUND the rim but can't be
    // dragged off the cake. Clamp the delta so the SEED (first/biggest ball) stays on a ring just
    // inside the rim; the rest of the clump follows rigidly. (User groups — keyed by groupId, not a
    // clusterId — are unaffected. Round only; rect is a follow-up.)
    const members = design.stickers.filter(s => s.clusterId === key);
    if (members.length) {
      const seed = [...members].sort((a, b) => a.id - b.id)[0];
      const start = startPositions[seed.id];
      const shp = tierShape(design.tiers[seed.tierIndex ?? 0] ?? design.tiers[0]);
      if (start && shp.kind !== 'rect') {
        const seedR = (seed.scale ?? 1) * CLUSTER_BASE_R;
        // A TOP/rim cluster locks to a ring just inside the rim; a SIDE cluster locks to the wall ring
        // (just outside R) so it slides AROUND the wall — neither can be dragged off the cake.
        const onTop = (seed.yOffset ?? 0) > -seedR;
        const ring = onTop ? Math.max(0, shp.radius - seedR) : shp.radius + seedR;
        const nx = start.x + (delta.dx ?? 0), nz = start.z + (delta.dz ?? 0);
        const rho = Math.hypot(nx, nz) || 1;
        delta = { ...delta, dx: (nx / rho) * ring - start.x, dz: (nz / rho) * ring - start.z };
      }
    }
    moveGroupStickers(key, startPositions, delta);
  }

  // Drag any sticker that's part of a multi-selection → move the whole selection together.
  function handleMoveMany(ids, startPositions, delta) {
    moveStickersBy(ids, startPositions, delta);
  }

  function handleStickerMove(id, changes) {
    updateSticker(id, changes);
  }

  // A decor_pattern element places several real stickers at once — one per
  // placement_config.parts entry, offset by the part's dx/dz and tied by a shared patternId.
  // Each part is an ordinary sticker, so independent move/resize/select come for free; the
  // pattern is selected as a unit on drop so the pair can be positioned, then a single tap
  // drills into one part. Config-driven (reads `parts`), no element-type branch.
  function placePattern(pattern, parts, hit, keepId = null) {
    const patternId = keepId ?? crypto.randomUUID();
    const deletable = pattern.placement_config?.parts_deletable === true;
    const baseId = Date.now();
    const ids = [];
    parts.forEach((part, i) => {
      const partEl = elementById.get(part.element_id);
      if (!partEl) { console.warn(`[decor_pattern] part element_id not found: "${part.element_id}" — check the parts JSON`); return; }
      const mode = zoneMode(partEl.placement_config, hit.zone);
      // Part offset is interpreted in the surface's own coordinates: on the TOP it's (x, z) in
      // cake units; on a WALL (side / middle tier) `dx` becomes an angular offset in radians so the
      // parts fan around the wall, and `dz` raises or lowers them.
      //
      // `dz` used to be DROPPED on a wall — every part stayed level. That was right for the two
      // things patterns had been used for (unicorn eyes, a piping pair, both horizontal) and it
      // silently ruled out anything stacked: a honeycomb of football panels is rows above rows, and
      // authoring one produced a single squashed line with no error to explain it. Both existing
      // patterns carry dz: 0, so nothing authored before this behaves differently.
      const isWall = hit.zone === ZONES.SIDE || hit.zone === ZONES.MIDDLE_TIER;
      const partHit = isWall
        ? { ...hit, theta: (hit.theta ?? 0) + (part.dx ?? 0), y: (hit.y ?? 0) + (part.dz ?? 0) }
        : { ...hit, x: (hit.x ?? 0) + (part.dx ?? 0), z: (hit.z ?? 0) + (part.dz ?? 0) };
      ids.push(addSticker(partEl, partHit.zone, partHit.tierIndex, mode ?? 'stand', partHit,
        { id: baseId + i, patternId, patternElementId: pattern.id, patternDeletable: deletable, flipX: part.mirror === true }));
    });
    if (!ids.length) return;
    setElementsOpen(false);
    focusEditor('decoration');
    // Select the pattern as ONE entity (its card carries the zone chooser); parts still drag
    // individually on the canvas (moveSet excludes patternId). No multi-select bar.
    setMultiSelectMode(false);
    setSelectedStickerIds(new Set(ids));
    setSelectedEl({ type: 'pattern', patternId, patternElementId: pattern.id });
  }

  // A scatter element drops a BATCH of instances spread randomly across the zone, rendered through
  // the NORMAL sticker path (so they look like the element). They're spaced so they touch but don't
  // overlap (min-centre distance ≈ one tile, STICKER_SIZE × scale). One scatter card with a density +
  // surface chooser manages the set.
  const SCATTER_DEFAULT_COUNT = 12;
  // Per-instance size for scatter: the element's own configured r (admin-controlled), default 0.5
  // when unset. No element-type branch — just the config value. Tunable on the card afterwards.
  function scatterScaleFor(element) {
    return element?.placement_config?.r ?? 0.5;
  }
  const isSideZoneName = z => z === ZONES.SIDE || z === ZONES.MIDDLE_TIER;
  // The cake's actual top tier (top decor belongs there); side defaults to the bottom tier.
  function scatterTierForZone(zone) {
    return isSideZoneName(zone) ? 0 : Math.max(0, (canvasConfig.tiers?.length ?? 1) - 1);
  }
  // Sensible max instances for a (zone × tier × size): surface area ÷ sprinkle footprint, packed
  // ~70%. So the cap fills the cake and scales with size, instead of an arbitrary number.
  function scatterMaxCount(zone, tierIndex, scale) {
    const tier = canvasConfig.tiers[tierIndex] ?? canvasConfig.tiers[0];
    const R = tier?.radius ?? 1.2;
    const tierH = tier?.height ?? BOTTOM_H;
    const area = isSideZoneName(zone) ? (2 * Math.PI * R * tierH) : (Math.PI * (R * 0.82) ** 2);
    const footprint = (STICKER_SIZE * scale) ** 2;
    return Math.max(12, Math.min(400, Math.floor((area / footprint) * 0.7)));
  }
  // The count a NEW scatter seeds with — the element's admin-authored default
  // (placement_config.scatter_count), falling back to SCATTER_DEFAULT_COUNT. Config-driven, never a
  // hardcoded per-element number. Clamped to the surface's physical cap so a large default can't
  // over-pack a small cake (the density slider's own max).
  function scatterCountFor(element, zone, tierIndex, scale) {
    const configured = element?.placement_config?.scatter_count;
    const n = Number.isFinite(configured) && configured > 0 ? Math.round(configured) : SCATTER_DEFAULT_COUNT;
    return Math.min(n, scatterMaxCount(zone, tierIndex, scale));
  }
  // Deterministic scatter for the card's preview tile — a handful of the element spread on the
  // surface (golden-angle disk on top; an angular spread on the wall) so the tile shows a SCATTER,
  // not one piece. Same TopperPreview parts shape decor_pattern uses (glbUrl/baseRotation/r/dx/dz).
  const PREVIEW_SCATTER_N = 6;
  function scatterPreviewParts(el, zone, scale) {
    if (!el) return [];
    const glbUrl = el.image_url;
    const baseRotation = facingOffsetRadians(el.placement_config);
    const isSide = isSideZoneName(zone);
    const GA = Math.PI * (3 - Math.sqrt(5));
    const parts = [];
    for (let i = 0; i < PREVIEW_SCATTER_N; i++) {
      if (isSide) {
        parts.push({ glbUrl, baseRotation, r: scale, dx: (i / (PREVIEW_SCATTER_N - 1) - 0.5) * 1.4 });
      } else {
        const rad = Math.sqrt((i + 0.5) / PREVIEW_SCATTER_N) * 0.62, ang = i * GA;
        parts.push({ glbUrl, baseRotation, r: scale, dx: rad * Math.cos(ang), dz: rad * Math.sin(ang) });
      }
    }
    return parts;
  }
  // A random seat within (zone × tier), best-effort ≥ minDist from already-taken seats. Top =
  // a point in the top disk; side = a (theta, y) on the wall. Returns a position for addSticker.
  function randomScatterSeat(zone, tierIndex, taken, minDist) {
    const tier = canvasConfig.tiers[tierIndex] ?? canvasConfig.tiers[0];
    const R = tier?.radius ?? 1.2;
    const tierH = tier?.height ?? BOTTOM_H;
    let baseY = 0.1; for (let i = 0; i < tierIndex; i++) baseY += (canvasConfig.tiers[i]?.height ?? BOTTOM_H);
    const isSide = isSideZoneName(zone);
    let seat = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cand = isSide
        ? { theta: Math.random() * 2 * Math.PI - Math.PI, y: baseY + 0.08 + Math.random() * Math.max(0.02, tierH - 0.16) }
        : (() => { const rad = Math.sqrt(Math.random()) * R * 0.82, ang = Math.random() * 2 * Math.PI; return { x: rad * Math.sin(ang), z: rad * Math.cos(ang) }; })();
      const clear = taken.every(t => {
        if (isSide) {
          const dth = Math.abs(Math.atan2(Math.sin(cand.theta - t.theta), Math.cos(cand.theta - t.theta)));
          return dth * R >= minDist || Math.abs(cand.y - t.y) >= minDist;   // arc OR height apart
        }
        const dx = cand.x - t.x, dz = cand.z - t.z; return Math.sqrt(dx * dx + dz * dz) >= minDist;
      });
      seat = cand;
      if (clear) break;
    }
    return seat;
  }
  // Place `count` instances of `el` scattered on (zone × tier), spaced from `taken` seats, all at
  // `scale` (and `color` if given). The ONE generator used by initial drop, density +, and zone
  // change. Mode comes from the element's config for the zone (renders its art).
  function scatterInstances(el, zone, tierIndex, count, scale, taken = [], color) {
    const mode = zoneMode(el.placement_config, zone, 'hug');
    const minDist = STICKER_SIZE * scale;
    const baseId = Date.now();
    const ids = [];
    for (let i = 0; i < count; i++) {
      const seat = randomScatterSeat(zone, tierIndex, taken, minDist);
      taken.push(seat);
      const id = addSticker(el, zone, tierIndex, mode, seat, { id: baseId + i, scale });
      if (color != null) updateSticker(id, { color });
      ids.push(id);
    }
    return ids;
  }
  function takenSeatsOf(instances) {
    return instances.map(s => isSideZoneName(s.zone) ? { theta: s.theta, y: s.y } : { x: s.x, z: s.z });
  }
  function placeScatter(element, hit, count) {
    const scale = scatterScaleFor(element);
    const n = count ?? scatterCountFor(element, hit.zone, hit.tierIndex, scale);
    scatterInstances(element, hit.zone, hit.tierIndex, n, scale, []);
    setElementsOpen(false);
    focusEditor('decoration');
    setMultiSelectMode(false);
    setSelectedStickerIds(new Set());   // card is the selection feedback; no per-instance highlight
    setSelectedEl({ type: 'scatter', elementId: element.id });
  }

  // ── Faux-ball cluster ─────────────────────────────────────────────────────────
  // A cluster is a packed clump of mixed-size GLB-sphere stickers sharing ONE clusterId, rendered on
  // the generic art path (NOT a procedural mode — that was faux_balls). The pure packer
  // (geometry/spherePacking.js) computes tangent, non-overlapping ball positions; each becomes a
  // `stand` sticker placed EXACTLY (extra.exact) so de-overlap can't un-pack it. Mixed colours come
  // from the palette. Config: placement_config.cluster = { min, max, sizes, palette }. Multiple
  // clusters per cake, each its own clusterId grown from its own seed.
  const CLUSTER_BASE_R = STICKER_SIZE / 2;   // a GLB sphere's world radius at scale 1 (normalised to STICKER_SIZE)
  const CLUSTER_DEFAULT_COUNT = 9;
  function clusterConfigOf(element) {
    const c = element.placement_config?.cluster ?? {};
    // Size TIERS, descending: [largest, 2nd, 3rd, small]. clusterRadii turns these into the per-ball
    // mix (1 biggest, ~11% 2nd, ~35% 3rd, rest small).
    const sizes = (Array.isArray(c.sizes) && c.sizes.length) ? c.sizes : [1.6, 1.35, 0.85, 0.5];
    const palette = (Array.isArray(c.palette) && c.palette.length) ? c.palette : [element.default_color ?? '#D4AF37'];
    return { min: c.min ?? 3, max: c.max ?? 30, sizes, palette };
  }
  // A tier's geometry in the render's world-Y frame (baseY convention matches seatOnSlot, so a cluster
  // ball's yOffset lines up with the renderer). Round drapes over the rim; rect packs flat (B3 = round).
  function tierGeom(tierIndex) {
    const ti = tierIndex ?? 0;
    let baseY = 0.1;
    for (let i = 0; i < ti; i++) baseY += (canvasConfig.tiers[i]?.height ?? BOTTOM_H);
    const height = canvasConfig.tiers[ti]?.height ?? BOTTOM_H;
    const shp = tierShape(canvasConfig.tiers[ti] ?? canvasConfig.tiers[0]);
    return { baseY, topY: baseY + height, height, shp, R: shp.kind === 'rect' ? 1e6 : shp.radius };
  }
  // Spawn `count` packed balls around `seedCenter` ([x,y,z] world — on the cake top OR side wall), all
  // sharing `clusterId`. The packer rests the clump on the cake and drapes it over the rim / down the
  // side. EVERY ball is a top-surface `stand` sticker positioned by absolute x/z (may pass the rim) +
  // yOffset (packed height − rest seat; negative = below the top, on the side) — the zone the seed came
  // from doesn't matter, the balls are placed absolutely.
  function clusterInstances(element, tierIndex, seedCenter, count, clusterId, paletteOverride, finishOverride) {
    const { sizes, palette: cfgPalette } = clusterConfigOf(element);
    // The CUSTOMER controls the palette (config's is only the default seed). On re-pack we pass the
    // cluster's current palette so the chosen colours survive a size change.
    const palette = (paletteOverride && paletteOverride.length) ? paletteOverride : cfgPalette;
    // Per-ball radii following the size mix (1 big, ~11% 2nd, ~35% 3rd, rest small), descending so the
    // packer puts the big ones on the base and the small ones on top.
    const radii = clusterRadii(count, sizes.map(s => s * CLUSTER_BASE_R));   // world radii, length = count
    const { topY, baseY, R } = tierGeom(tierIndex);
    const r0 = radii[0];
    // Keep the seed (big ball) on the cake: its centre can't sit so low its bottom dips below the cake
    // base, nor above the rim. Radially, a side seed must rest AGAINST the wall (ρ = R+r0), never inside.
    const sc = [...seedCenter];
    sc[1] = Math.max(baseY + r0, Math.min(topY + r0, sc[1]));
    const rho = Math.hypot(sc[0], sc[2]);
    if (sc[1] < topY - r0 && rho < R + r0 - 1e-3 && rho > 1e-3) {   // a side seed pulled to the wall
      sc[0] = (sc[0] / rho) * (R + r0); sc[2] = (sc[2] / rho) * (R + r0);
    }
    const packed = packCluster({ count, radii, cake: { R, topY, baseY, seed: sc } });
    const baseId = Date.now();
    packed.forEach((ball, i) => {
      addSticker(element, ZONES.TOP_SURFACE, tierIndex, 'stand',
        { x: ball.x, z: ball.z },
        { id: baseId + i, scale: ball.r / CLUSTER_BASE_R, exact: true,
          yOffset: ball.y - topY - ball.r, clusterId, color: palette[i % palette.length],
          // Preserve the customer's finish across a re-pack (null → addSticker falls back to config).
          roughness: finishOverride?.roughness ?? null, metalness: finishOverride?.metalness ?? null });
    });
    return clusterId;
  }
  // The cake-surface centre of where a placed ball currently rests (top → x/z at topY+r; side → on the
  // wall at its angle/height). The cluster seed inherits this so the clump forms AT the ball's spot —
  // no rim-snap, so several clusters can sit anywhere, including more than one on the same surface.
  function ballSeedCenter(sticker, seedR) {
    const { topY, height, shp, R } = tierGeom(sticker.tierIndex);
    const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
    if (isSide && shp.kind !== 'rect') {
      const th = sticker.theta ?? Math.atan2(sticker.x ?? 0, sticker.z ?? 0);
      const y = sticker.y ?? (topY - height * 0.4);
      return [(R + seedR) * Math.sin(th), y, (R + seedR) * Math.cos(th)];
    }
    if (shp.kind !== 'rect') {
      let ax = sticker.x ?? 0, az = sticker.z ?? 0;
      const rho = Math.hypot(ax, az), maxR = Math.max(0, R - seedR * 0.5);
      if (rho > maxR) { ax = (ax / rho) * maxR; az = (az / rho) * maxR; }
      return [ax, topY + seedR, az];
    }
    return [sticker.x ?? 0, topY + seedR, sticker.z ?? 0];
  }
  // "Cluster" toggle ON: turn a single placed ball into a packed clump at its current spot (fresh
  // clusterId). The ball is replaced by the packed set; its card becomes the cluster card.
  function makeCluster(sticker) {
    const element = elementById.get(sticker.elementId);
    if (!element) return;
    const clusterId = crypto.randomUUID();
    const seedR = (clusterConfigOf(element).sizes[0] ?? 1.6) * CLUSTER_BASE_R;
    const seedCenter = ballSeedCenter(sticker, seedR);
    const finish = (sticker.roughness == null && sticker.metalness == null)
      ? null : { roughness: sticker.roughness ?? null, metalness: sticker.metalness ?? null };
    removeSticker(sticker.id);
    clusterInstances(element, sticker.tierIndex, seedCenter, CLUSTER_DEFAULT_COUNT, clusterId, null, finish);
    setColorOpen(false);
    focusEditor('decoration');
    setMultiSelectMode(false);
    setSelectedStickerIds(new Set());
    setSelectedEl({ type: 'cluster', clusterId });
  }
  // "Cluster" toggle OFF: dissolve the clump back to a SINGLE ball at the seed's spot.
  function dissolveCluster(clusterId) {
    const members = design.stickers.filter(s => s.clusterId === clusterId);
    if (!members.length) return;
    const el = elementById.get(members[0].elementId);
    const seed = [...members].sort((a, b) => a.id - b.id)[0];
    members.forEach(s => removeSticker(s.id));
    if (!el) return;
    const zone = (el.allowed_zones ?? []).includes(seed.zone) ? seed.zone
      : (el.allowed_zones?.[0] ?? ZONES.TOP_SURFACE);
    const mode = zoneMode(el.placement_config, zone, 'stand');
    const newId = addSticker(el, zone, seed.tierIndex, mode, { x: seed.x, z: seed.z });
    setSelectedEl({ type: 'sticker', id: newId });
    setSelectedStickerIds(new Set([newId]));
  }
  // Resize a manual cluster ball, then RE-SETTLE it so growing/shrinking can't leave it penetrating its
  // neighbours — it re-seats on the surface (de-overlapped) or a stable cradle at the new radius.
  function resizeClusterBall(id, scale) {
    const st = design.stickers.find(s => s.id === id);
    if (!st?.clusterBall || st.zone !== ZONES.TOP_SURFACE) { updateSticker(id, { scale }); return; }
    const { topY } = tierGeom(st.tierIndex);
    const selfR = CLUSTER_BASE_R * scale;
    const balls = design.stickers
      .filter(s => s.id !== id && s.clusterBall && s.zone === ZONES.TOP_SURFACE && s.tierIndex === st.tierIndex)
      .map(s => { const sR = CLUSTER_BASE_R * (s.scale ?? 1); return { x: s.x, z: s.z, y: topY + (s.yOffset ?? 0) + sR, r: sR }; });
    const seat = manualSeat(st.x ?? 0, st.z ?? 0, selfR, balls, topY);
    updateSticker(id, { scale, x: seat.x, z: seat.z, yOffset: seat.y - topY - selfR });
  }
  // ── The ONE size path for a placed sticker ───────────────────────────────────
  // `sizeControlOf` answers "which field, what value, what bounds"; `resizeSticker` performs the
  // write. The edit popup's SizeDial and the canvas corner grips both go through these, so a drag
  // and a dial can never disagree (INVARIANTS #3). The bounds themselves — config range, hero-hug
  // hugMul, photo-frame cake cap — live in ONE pure helper, `stickerSizeControl` (placement.js).
  const tierOfSticker = st => canvasConfig.tiers[st?.tierIndex] ?? canvasConfig.tiers[0];
  const sizeControlOf = st => (st ? stickerSizeControl(elementById.get(st.elementId), st, tierOfSticker(st)) : null);

  function resizeSticker(sticker, value) {
    if (!sticker) return;
    // A hero hug is sized by its wall-derived nudge, never by an absolute scale — and it is
    // single-per-slot, so it has no multi-select or cluster semantics to honour.
    if (sizeControlOf(sticker)?.key === 'hugMul') { updateSticker(sticker.id, { hugMul: value }); return; }
    // Multi-selection → set the same size on all selected (so a pattern's parts stay equal).
    if (selectedStickerIds.size > 1 && selectedStickerIds.has(sticker.id)) scaleStickers([...selectedStickerIds], value);
    else if (sticker.clusterBall) resizeClusterBall(sticker.id, value);   // re-settle so it can't grow into others
    else updateSticker(sticker.id, { scale: value });
  }

  // Handed to CakeCanvas so a selected element can show corner resize grips.
  const stickerResize = { controlFor: sizeControlOf, onResize: resizeSticker };

  // The cluster's CURRENT palette = the distinct ball colours in placement order (reconstructs what
  // the customer chose, so a re-pack / re-read can reapply it).
  function clusterPaletteOf(clusterId) {
    const out = [];
    design.stickers.filter(s => s.clusterId === clusterId).sort((a, b) => a.id - b.id)
      .forEach(s => { if (s.color && !out.includes(s.color)) out.push(s.color); });
    return out;
  }
  // Recolour a cluster's balls by cycling the customer's palette across them (mixed-colour clump).
  function setClusterPalette(clusterId, palette) {
    if (!palette.length) return;
    design.stickers.filter(s => s.clusterId === clusterId).sort((a, b) => a.id - b.id)
      .forEach((s, i) => updateSticker(s.id, { color: palette[i % palette.length] }));
  }
  // The cluster's CURRENT finish = the material override its balls share (every member carries the
  // same roughness/metalness). Returned so a re-pack can reapply it; null = config-default finish.
  function clusterFinishOf(clusterId) {
    const s = design.stickers.find(st => st.clusterId === clusterId);
    if (!s || (s.roughness == null && s.metalness == null)) return null;
    return { roughness: s.roughness ?? null, metalness: s.metalness ?? null };
  }
  // Set the finish (one metallic→matte slider, finishToMaterial) on every ball of a cluster.
  function setClusterFinish(clusterId, mat) {
    design.stickers.filter(s => s.clusterId === clusterId)
      .forEach(s => updateSticker(s.id, mat));
  }
  // ONE Finish slider — metallic (left, the default) ↔ matte (right). Shared by the cluster card and
  // a single ball so the metallic↔matte mapping (finish.js) renders identically in both. Reads the
  // slider position from the stored metalness; onPick gets the derived { roughness, metalness }.
  function finishSliderControls(metalness, onPick) {
    const t = finishOf(metalness);
    return [
      <span key="fin-m" style={{ fontSize: 10, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>Metallic</span>,
      <input key="fin-r" type="range" min={0} max={1} step={0.01} value={t}
        onChange={e => onPick(finishToMaterial(parseFloat(e.target.value)))}
        style={{ flex: 1, minWidth: 60, accentColor: '#1a1a1a' }} />,
      <span key="fin-x" style={{ fontSize: 10, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>Matte</span>,
    ];
  }

  // ── Element-stack card chrome (ONE source) ───────────────────────────────────
  // The right-side accordion's card shell + header was the SAME inline literal in 6 places
  // (decoration / writing / piping cards). Unified here so the mobile see-through treatment lives
  // once. On mobile the cards go translucent so the cake shows THROUGH the stack instead of being
  // covered; the expanded (actively-edited) card is more opaque than the collapsed list strips.
  // Desktop keeps solid white. Stays a right-side panel (INVARIANTS §3a) — no relocation.
  const stackCardStyle = (expanded) => ({
    flexShrink: 0,
    border: `1.5px solid ${expanded ? '#1a1a1a' : '#eadde2'}`,
    borderRadius: 10, overflow: 'hidden',
    background: isMobile ? (expanded ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)') : '#fff',
  });
  const stackCardHeaderStyle = (expanded) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 7px', cursor: 'pointer',
    background: expanded
      ? (isMobile ? 'rgba(242,241,238,0.85)' : '#F2F1EE')
      : (isMobile ? 'transparent' : '#fff'),
  });
  // Resize: re-pack from the seed ball's anchor with a new count, KEEPING the customer's palette. A
  // cluster is packed (not hand-dragged), so regenerating is correct — unlike scatter (dragged seats).
  function setClusterSize(clusterId, count) {
    const members = design.stickers.filter(s => s.clusterId === clusterId);
    if (!members.length) return;
    const ref = members[0];
    const el = elementById.get(ref.elementId);
    if (!el) return;
    const palette = clusterPaletteOf(clusterId);                // preserve the customer's colours
    const finish = clusterFinishOf(clusterId);                  // …and their metallic/matte finish
    const seed = [...members].sort((a, b) => a.id - b.id)[0];   // first-placed = packer seed = cluster centre
    // Reconstruct the seed's world centre from its sticker (top-path: x/z absolute, y = topY+yOffset+r).
    const { topY } = tierGeom(seed.tierIndex);
    const seedCenter = [seed.x ?? 0, topY + (seed.yOffset ?? 0) + (seed.scale ?? 1) * CLUSTER_BASE_R, seed.z ?? 0];
    members.forEach(s => removeSticker(s.id));
    clusterInstances(el, seed.tierIndex, seedCenter, count, clusterId, palette, finish);
  }

  // Top vs side are INDEPENDENT scatter sets of the same element (sprinkles on both at once). Group
  // an instance by surface so a count/toggle touches only that surface's instances.
  const scatterGroupOf = s => isSideZoneName(s.zone) ? 'side' : 'top';

  // Reconcile ONE surface's scatter count: add randomly-seated instances (spaced from that surface's
  // existing ones, matching their mode/scale/colour) or remove its newest — never regenerate, so
  // dragged positions survive (the decor_pattern/group "edit as a set" rule).
  function setScatterDensity(elementId, zone, target) {
    const grp = isSideZoneName(zone) ? 'side' : 'top';
    const instances = design.stickers.filter(s => s.elementId === elementId && s.scatter && scatterGroupOf(s) === grp);
    const cur = instances.length;
    if (target === cur || !instances.length) return;
    if (target > cur) {
      const el = elementById.get(elementId);
      const ref = instances[0];
      if (!el) return;
      scatterInstances(el, ref.zone, ref.tierIndex, target - cur, ref.scale ?? scatterScaleFor(el), takenSeatsOf(instances), ref.color ?? undefined);
    } else {
      // Drop the newest (highest id) instances first.
      const remove = [...instances].sort((a, b) => b.id - a.id).slice(0, cur - target).map(s => s.id);
      remove.forEach(id => removeSticker(id));
    }
  }

  // Toggle a whole surface's scatter set on/off (the card's surface checkbox — like piping's rim/board,
  // INVARIANTS #3a/#6). ON scatters a default batch on that (tier×surface), sharing the element's
  // existing size/colour; OFF removes just that surface's instances. Surfaces come from allowed_zones.
  function toggleScatterSurface(elementId, zone, on) {
    const el = elementById.get(elementId);
    if (!el) return;
    const grp = isSideZoneName(zone) ? 'side' : 'top';
    const all = design.stickers.filter(s => s.elementId === elementId && s.scatter);
    if (on) {
      if (all.some(s => scatterGroupOf(s) === grp)) return;   // already present
      const ref = all[0];                                     // share size/colour with the existing set
      const tierIndex = scatterTierForZone(zone);
      const scale = ref?.scale ?? scatterScaleFor(el);
      scatterInstances(el, zone, tierIndex, scatterCountFor(el, zone, tierIndex, scale), scale, [], ref?.color ?? undefined);
    } else {
      all.filter(s => scatterGroupOf(s) === grp).forEach(s => removeSticker(s.id));
    }
    setSelectedStickerIds(new Set());
    setSelectedEl({ type: 'scatter', elementId });
  }

  // ─── DEV-ONLY temp fixture (remove once real decor_pattern rows exist) ───
  // Builds a throwaway decor_pattern from an existing top-surface element (same element used
  // for both parts → an obvious pair) and runs it through the real placePattern path. Drive it
  // from Playwright via window.__placeTestPattern() AFTER opening Decorations (so elements load).
  function placeTestPattern() {
    const pool = [...elementById.values()].filter(e =>
      (e.allowed_zones ?? []).includes('top_surface') && e.placement_config?.pattern_only !== true);
    if (!pool.length) { console.warn('[test-pattern] open Decorations first to load elements'); return false; }
    // Prefer a GLB that stands on the top (like the eyes will) so it renders via DraggableTopSticker.
    const isGlb = e => /\.(glb|gltf)(\?|$)/i.test(e.image_url ?? '');
    const a = pool.find(e => isGlb(e) && zoneMode(e.placement_config, 'top_surface') === 'stand')
      ?? pool.find(e => isGlb(e) && e.placement_config?.single_per_slot)
      ?? pool.find(isGlb) ?? pool[0];
    const pattern = { id: 'dev-test-pattern', name: 'Test Pattern (dev)', allowed_zones: ['top_surface'],
      placement_config: { parts_deletable: false, parts: [
        { element_id: a.id, dx: -0.8, dz: 0 }, { element_id: a.id, dx: 0.8, dz: 0, mirror: true } ] } };
    handleElementDrop(pattern, { zone: 'top_surface', tierIndex: design.tiers.length - 1, x: 0, z: 0 });
    return true;
  }
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    window.__placeTestPattern = placeTestPattern;
    window.__loadElements = loadElementsIfNeeded;   // call first, wait a beat, then place
    window.__getStickers = () => design.stickers;   // assert spawn/patternId/selection from tests
    window.__getSelection = () => [...selectedStickerIds];
    // Piping lives on the tiers, not in `stickers` — expose it so a test can assert what a piping
    // element actually put on the cake (and that Remove took it off), not just what the popup shows.
    window.__getPiping = () => design.tiers.flatMap((t, i) => [
      ...(t.topPipings    ?? []).map(p => ({ tierIndex: i, zone: 'rim',   cardId: p.cardId, layerId: p.layerId })),
      ...(t.bottomPipings ?? []).map(p => ({ tierIndex: i, zone: 'board', cardId: p.cardId, layerId: p.layerId })),
    ]);
    window.__listElements = () => [...elementById.values()].map(e => ({
      id: e.id, name: e.name, mode: zoneMode(e.placement_config, 'top_surface'),
      glb: /\.(glb|gltf)(\?|$)/i.test(e.image_url ?? ''),
      top: (e.allowed_zones ?? []).includes('top_surface'),
    }));
    window.__dumpElement = (id) => { const e = elementById.get(id); if (!e) return null; const et = elementTypes.find(t => t.id === e.element_type_id); return { id: e.id, name: e.name, element_type_id: e.element_type_id, element_type_slug: et?.slug ?? null, allowed_zones: e.allowed_zones, placement_config: e.placement_config, image_url: e.image_url, allowed_actions: e.allowed_actions }; };
    window.__findPatterns = () => [...elementById.values()].filter(e => Array.isArray(e.placement_config?.parts)).map(e => ({ id: e.id, name: e.name, parts: e.placement_config.parts, pc: e.placement_config }));
    window.__placeElementById = (id) => { const e = elementById.get(id); if (!e) return false; const zones = e.allowed_zones ?? ['top_surface']; const zone = zones.includes('top_surface') ? 'top_surface' : zones[0]; handleElementDrop(e, { zone, tierIndex: design.tiers.length - 1, x: 0, z: 0 }); return true; };
    window.__placeElementByIdZone = (id, zone) => { const e = elementById.get(id); if (!e) return false; handleElementDrop(e, { zone, tierIndex: 0, x: 0, z: 0 }); return true; };
    window.__placeTestPatternWith = (id) => {   // place a pattern using a chosen element id (mirrored 2nd part)
      const partEl = elementById.get(id); if (!partEl) return false;
      const pattern = { id: 'dev-test-pattern', name: 'Test Pattern (dev)', allowed_zones: ['top_surface'],
        placement_config: { parts_deletable: false, parts: [
          { element_id: id, dx: -0.8, dz: 0 }, { element_id: id, dx: 0.8, dz: 0, mirror: true } ] } };
      handleElementDrop(pattern, { zone: 'top_surface', tierIndex: design.tiers.length - 1, x: 0, z: 0 });
      return true;
    };
    // Gradient visual check (TEMP): place a GLB on the top surface and apply a multi-colour
    // gradient instance. mode = 'swirl'|'vertical'|'linear', colors = ['#…', …].
    window.__placeGradientTest = (id, mode, colors) => {
      const e = elementById.get(id); if (!e) return null;
      const zones = e.allowed_zones ?? ['top_surface'];
      const zone = zones.includes('top_surface') ? 'top_surface' : zones[0];
      const ti = design.tiers.length - 1;
      const newId = addSticker(e, zone, ti, zoneMode(e.placement_config, zone, 'stand'), { zone, tierIndex: ti, x: 0, z: 0 });
      updateSticker(newId, {
        gradient: { mode, colors },
        // force gradient (and colour) caps on so the popup controls show in dev verification
        allowedActions: { resize: true, duplicate: true, color: true, gradient: true, delete: true, move: false, tilt: true },
      });
      return newId;
    };
    window.__setStickerGradient = (sid, mode, colors) => { updateSticker(sid, { gradient: { mode, colors } }); return true; };
    window.__updateSticker = (sid, changes) => { updateSticker(sid, changes); return true; };  // test hook: scale / groupColors
    // Relief visual check: place a SIDE sticker whose image is a local (same-origin) URL and whose config
    // carries `relief` — so it mounts with a loadable image + relief from the start (headless can't fetch R2).
    window.__placeReliefTest = (imageUrl, relief) => {
      const base = [...elementById.values()].find(e => (e.allowed_zones ?? []).includes('side')) ?? [...elementById.values()][0];
      if (!base) return null;
      const e = { ...base, image_url: imageUrl,
        placement_config: { ...(base.placement_config ?? {}), ...(relief ? { relief } : {}) },
        allowed_actions: { ...(base.allowed_actions ?? {}), color: true } };
      return addSticker(e, 'side', 0, 'hug', { zone: 'side', tierIndex: 0, x: 0, z: 0 });
    };
  }

  function handleElementDrop(element, hit) {
    // Tier-finish elements (food foil) paint into the tier material, never place a sticker — open the
    // finish card. Covers the DRAG path (tapPlaceElement covers tap). Config-driven, no slug branch.
    if (element.placement_config?.kind === 'tier_finish') {
      setElementsOpen(false);
      focusEditor('decoration');
      setFoilTier(hit?.tierIndex ?? 0); setFoilSel(0);
      selectExclusive({ type: 'foil', elementId: element.id });
      return;
    }
    // Second cream layer (config: placement_config.second_cream) — drag path. Seeds a band on the
    // dropped tier (round tiers only render it) and opens the cream card. Config-driven, no slug branch.
    if (element.placement_config?.second_cream) {
      setElementsOpen(false);
      focusEditor('decoration');
      addCreamToTier(hit?.tierIndex ?? 0);
      selectExclusive({ type: 'cream', elementId: element.id });
      return;
    }
    const parts = element.placement_config?.parts;
    if (Array.isArray(parts) && parts.length) { placePattern(element, parts, hit); return; }
    // Faux-ball cluster (placement_config.cluster): drops as a SINGLE ball at the hit point; the card's
    // "Cluster" toggle turns it into a packed clump (Size 1 = back to single). Drop several balls — on
    // any surface, several per surface — and toggle each, for multiple independent clusters.
    // Density-scatter element (sprinkles): drop a packed batch as ONE scatter card. Config-driven.
    if (element.placement_config?.scatter === true) { placeScatter(element, hit); return; }

    const placementMode = zoneMode(element.placement_config, hit.zone);

    const imageTopperTypeId = elementTypes.find(et => et.slug === ELEMENT_SLUGS.IMAGE_TOPPER)?.id;
    const isImageTopper = element.element_type_id === imageTopperTypeId;

    // First image topper on an empty top surface → center it; subsequent ones → drop at cursor.
    const hasTopperOnTier = isImageTopper && hit.zone === 'top_surface' &&
      design.stickers.some(s => s.zone === 'top_surface' && s.tierIndex === hit.tierIndex && s.placementMode === 'stand');
    const effectiveHit = (isImageTopper && hit.zone === 'top_surface' && !hasTopperOnTier)
      ? { ...hit, x: 0, z: 0 }
      : hit;

    // Manual faux-ball arrangement: a cluster ball DROPPED on the top is physically seated — on the
    // surface (de-overlapped, touches but never penetrates) or cradled on ≥3 balls when dropped onto a
    // real pocket; never balanced on 1–2, never floating. Placed `exact` (verbatim seat + yOffset) so
    // de-overlap can't shove it off. Config-gated (placement_config.cluster).
    let dropHit = effectiveHit, dropExtra;
    if (element.placement_config?.cluster && effectiveHit.zone === ZONES.TOP_SURFACE) {
      const selfR = CLUSTER_BASE_R * (element.placement_config?.r ?? 2.5);
      const { topY } = tierGeom(effectiveHit.tierIndex);
      const balls = design.stickers
        .filter(s => s.clusterBall && s.zone === ZONES.TOP_SURFACE && s.tierIndex === effectiveHit.tierIndex)
        .map(s => { const sR = CLUSTER_BASE_R * (s.scale ?? 1); return { x: s.x, z: s.z, y: topY + (s.yOffset ?? 0) + sR, r: sR }; });
      const seat = manualSeat(effectiveHit.x ?? 0, effectiveHit.z ?? 0, selfR, balls, topY);
      dropHit = { ...effectiveHit, x: seat.x, z: seat.z };
      dropExtra = { exact: true, yOffset: seat.y - topY - selfR };
    }
    const newId = addSticker(element, dropHit.zone, dropHit.tierIndex, placementMode ?? 'hug', dropHit, dropExtra);
    setElementsOpen(false);
    // Make the just-added decoration the active card — collapsing any other open
    // card — so a second element added stacks below and only the newest is expanded
    // (the same rule piping already follows).
    focusEditor('decoration');
    // Multi-slot decor opens its single element card (manages all placements); others select
    // the just-placed instance.
    if (isMultiSlotEl(element.id)) {
      selectExclusive({ type: 'decorEl', elementId: element.id },
        design.stickers.filter(s => s.elementId === element.id).map(s => s.id).concat(newId));
    } else {
      selectExclusive({ type: 'sticker', id: newId }, [newId]);
    }

    if (isImageTopper && hit.zone === 'top_surface') {
      snapCameraRef.current?.([0, 5.5, 8.7]);
    }
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

  // After "Add age" the new item's id isn't known until design updates — resolve the pending
  // selection to the newest age so its edit popup opens.
  useEffect(() => {
    if (selectedEl?.type === 'age' && selectedEl.pending && design.ages.length) {
      setSelectedEl({ type: 'age', id: design.ages[design.ages.length - 1].id });
    }
  }, [design.ages.length, selectedEl?.pending]);


  // "New" asks for the SHAPE first, then clears the cake — deliberately in that order. The old flow wiped
  // the design on click and always gave back a round cake, so the shapes a baker had authored were
  // invisible unless the customer went hunting in a tier popup; and a mis-click was destructive with no
  // step in between. Opening the picker is now the whole of the click: nothing is discarded until a shape
  // is chosen, and closing the picker leaves the cake exactly as it was.
  function handleNewCake() {
    setShapePickerOpen(true);
  }

  function startNewCake(shape, opts) {
    setShapePickerOpen(false);
    resetDesign(shape, opts);
    clearAllSelections();
    resetEditors();
    setEditingOrder(null);
    setElementsOpen(false);
    setTemplatesOpen(false);
  }

  /**
   * Drag a bottom sheet taller or shorter. One implementation, every sheet — the edit panel was the
   * only one without a handle at all, which made it the only sheet a baker could not get out of the
   * way of the cake.
   */
  function startPanelDrag(e, startH, setH, min = 80, max = 560) {
    e.preventDefault();
    const startY = e.clientY;
    function onMove(ev) {
      const delta = startY - ev.clientY; // drag up → taller panel
      setH(Math.min(max, Math.max(min, startH + delta)));
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  const handlePanelDrag = (e) => startPanelDrag(e, mobilePanelHeight, setMobilePanelHeight);

  function handleOrder() {
    setOrderModalOpen(true);
  }

  // "Share the draft": snapshot the current design + upload a thumbnail (same helpers as order
  // placement), then open the invite panel with it attached so the baker sends a customer straight
  // into THIS design. The design rides on the invite (design_snapshot) — no template row is created.
  async function handleShareDraft() {
    thumbRenderNowRef.current?.();
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const designThumbnailKey = await captureAndUploadThumbnail(thumbCanvas, apiClient, 'orders/thumbnails');
    setInviteLiveSessionId(null);
    setShareDraftDesign({ designSnapshot: buildDesignSnapshot(design), designThumbnailKey });
    setInvitePanelOpen(true);
  }

  async function handleOrderSubmit(formData) {
    // Thumbnail → R2 (never base64 in the JSON body) + the full design snapshot, via the
    // shared helpers so order / template / share all serialise identically.
    thumbRenderNowRef.current?.();
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const designThumbnailKey = await captureAndUploadThumbnail(thumbCanvas, apiClient, 'orders/thumbnails');
    const designSnapshot = buildDesignSnapshot(design);

    if (editingOrder) {
      const payload = { designSnapshot, designThumbnailKey, comment: formData.comment };
      if (apiClient?.updateOrderDesign) return await apiClient.updateOrderDesign(editingOrder.id, payload);
      if (onOrder)                       return await onOrder({ ...payload, mode: 'update_design', orderId: editingOrder.id });
      return;
    }

    const payload = { ...formData, designSnapshot, designThumbnailKey };

    // Customer mode (storefront): the logged-in customer requests a quote. Identity
    // comes from their session server-side (never in the payload); the route needs
    // the baker slug to resolve the storefront.
    if (orderMode === 'customer') {
      const quotePayload = { ...payload, bakerSlug: bakerData?.slug };
      if (apiClient?.requestQuote) {
        const result = await apiClient.requestQuote(quotePayload);
        quoteSubmittedRef.current = result ?? true;   // → onQuoteRequested fires on Done
        return result;
      }
      if (onOrder)                 return await onOrder({ ...quotePayload, mode: 'request_quote' });
      return;
    }

    // Baker mode: places an order on behalf of the searched customer.
    if (apiClient?.placeOrder) return await apiClient.placeOrder(payload);
    if (onOrder)               return await onOrder(payload);
  }

  // "New Order" (manual): a baker creates an order WITHOUT the 3D designer — from a
  // customer reference photo (or nothing). No design snapshot; the reference photo
  // keys ride along and become the order's picture. Never touches the canvas.
  // ONE way into the Orders panel, from the rail submenu or anywhere else: same panel,
  // `view` only chooses which face of it opens.
  function openOrdersPanel(view = 'list') {
    setOrdersInitialView(view);
    setOrdersPanelOpen(true);
  }

  // The manual-order flow. A day picked in the Orders calendar passes that date so it arrives
  // pre-filled; the rail's "New Order" passes none. One creation path, one optional field —
  // not two ways to make an order.
  function startOrderForDate(date = null) {
    setOrdersPanelOpen(false);
    setManualOrderDate(date);
    setManualOrderOpen(true);
  }

  // What an Orders-menu entry does, decided once — the desktop rail and the mobile bar both read
  // this, so they cannot drift into meaning different things by the same label.
  function selectOrdersMenuItem(item) {
    setNavMenuId(null);
    if (item.action === 'newOrder') { startOrderForDate(); return; }
    openOrdersPanel(item.view);
  }

  async function handleManualOrderSubmit(formData) {
    if (apiClient?.createManualOrder) return await apiClient.createManualOrder(formData);
    if (onOrder)                      return await onOrder({ ...formData, mode: 'manual_order' });
  }

  const creamPipingType   = elementTypes.find(et => et.slug === 'cream_piping');
  const pipingPatternType = elementTypes.find(et => et.slug === 'piping_pattern');
  const dripType          = elementTypes.find(et => et.slug === 'drip');
  const creamPipingEls    = otherElementsDb[creamPipingType?.id] ?? [];
  const pipingPatternEls  = otherElementsDb[pipingPatternType?.id] ?? [];
  // Chocolate-drip elements ride the SAME ring system as piping (a per-tier rim ring), so they're
  // picked + edited through the piping popup, not the generic sticker grid.
  const dripEls           = otherElementsDb[dripType?.id] ?? [];

  // Resolve a building-block element id → its element (image_url already full from the API).
  const pipingBlockById = Object.fromEntries(creamPipingEls.map(e => [e.id, e]));
  // Any piping element the baker can pick (for re-opening from a 3D click).
  const pipingElementById = Object.fromEntries([...creamPipingEls, ...pipingPatternEls, ...dripEls].map(e => [e.id, e]));

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
  // Drips ride the SAME ring popup as piping, but are their OWN picker group (a chocolate drip is not
  // "cream piping"). dripEls render in a separate labelled card via the shared renderRingPickerCard.

  // Shared thumbnail-grid card for any element that opens the piping/ring popup (piping AND drips) —
  // ONE renderer so the two groups never drift. `label` is the group heading.
  function renderRingPickerCard(label, els) {
    if (!els.length) return null;
    // `filterEl`, not a filter of its own. This card used to match on the search text alone, and the
    // element stores accumulate across every category opened this session — so once Piping had been
    // visited its card stayed on screen inside Animals, inside Sky, inside everything. Two
    // categories looked open at once because two categories WERE on screen at once.
    //
    // The main grid had the rule already. Having a second, narrower copy of the same filtering here
    // is what let them drift apart.
    const visible = filterEl(els);
    if (!visible.length) return null;
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {visible.map(el => {
            const isActive = design.tiers.some(t => (t.topPipings ?? []).some(p => p.id === el.id) || (t.bottomPipings ?? []).some(p => p.id === el.id));
            return (
              <div key={el.id} onClick={() => openPipingPopup(el)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff',
                  border: `1.5px solid ${isActive ? '#1a1a1a' : '#999999'}`,
                  boxShadow: isActive ? '0 0 0 2px rgba(26,26,26,0.18)' : 'none' }}>
                  {thumbSrc(el) && <img src={thumbSrc(el)} alt={el.name} width={64} height={64} loading="lazy" decoding="async" onError={onThumbError} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#1a1a1a' : '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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

  // ── Gradient (multi-colour) controls ──────────────────────────────────────
  // Eligibility is config-driven: allowed_actions.gradient for elements, TIER_CAPS.gradient for the
  // cake base. The stops + direction + balance live on the design instance as
  // instance.gradient = { mode, colors:[…], balance }. `color` stays the solid/stop-0 fallback so a
  // single-colour instance behaves exactly as before. Stops drive the shared shader in
  // shared/color/gradientMaterial.js (up to 3 stops). A tier and a sticker are the two gradient targets;
  // both use the identical stops/mode/balance model — no per-type gradient code.
  const selectedSticker = selectedEl?.type === 'sticker'
    ? design.stickers.find(s => s.id === selectedEl.id) : null;
  const selectedTierObj = selectedEl?.type === 'tier'
    ? (design.tiers[selectedEl.index] ?? null) : null;
  const isTierGradient = selectedEl?.type === 'tier';
  const gradTarget = selectedSticker ?? selectedTierObj;
  // For a tier, gradient is offered only when its frosting supports it (cream finishes, not
  // fondant/naked) — a declared capability in the frostings registry, not a hardcoded branch.
  const tierGradientOk = selectedEl?.type !== 'tier'
    || frostingSupportsGradient(selectedTierObj?.frostingType ?? 'buttercream');
  const gradientEligible = !!caps?.gradient && !!gradTarget && tierGradientOk;
  // A GLAZE tier edits its MARBLE palette (tier.glaze.colors, up to 5 stops) through the SAME stop editor
  // as the ombre gradient — reuse, not a parallel control. Eligibility is config-driven off the finish's
  // render KEY, never the literal frosting name (INVARIANTS #1/#6).
  const isGlazeTier = selectedEl?.type === 'tier'
    && frostingDef(selectedTierObj?.frostingType).render === 'glaze';
  /* ── The tier's colour TREATMENT: solid | ombre | stripes ────────────────────────────────────
   *
   * One choice, never two: a wall is painted one of these ways. Derived from the tier rather than
   * held in state, so it cannot disagree with what is actually saved on the design — a mode flag that
   * drifts from the data is how a baker ends up looking at stripes with "Ombre" selected.
   *
   * ⚠️ Stripes ride the SAME eligibility as the gradient (a declared frosting capability), and the
   * same stop editor: `gradStops` becomes the palette and `writeGradient` routes to setTierStripes.
   * A second swatch editor for the same job is what this codebase spent a comment telling us not to
   * build. */
  const tierStripes = isTierGradient ? (selectedTierObj?.stripes ?? null) : null;
  const stripesOn = areStripesActive(tierStripes);
  const treatment = stripesOn ? 'stripes'
    : ((gradTarget?.gradient?.colors?.filter(Boolean).length ?? 0) >= 2 ? 'ombre' : 'solid');

  const stopsEligible = gradientEligible || isGlazeTier;
  const maxStops = isGlazeTier ? 5 : stripesOn ? MAX_STRIPES : 3;   // glaze 5 · stripes 8 · gradient 3
  // The stops to show: the glaze palette / saved gradient if any, else a single chip = the solid colour.
  const gradStops = isGlazeTier
    ? (selectedTierObj?.glaze?.colors?.length ? selectedTierObj.glaze.colors : GLAZE_DEFAULTS.colors)
    // Stripes edit their PALETTE through the same chips — not the expanded stripe list, which would
    // show sixteen swatches for two colours and make every one of them look separately editable.
    : stripesOn
      ? tierStripes.palette
      : gradientEligible
        ? (gradTarget.gradient?.colors?.length ? gradTarget.gradient.colors : [gradTarget.color ?? '#ffffff'])
        : [];
  // Tiers blend vertically (ombre up the wall); elements default to swirl. A saved mode always wins.
  const gradMode = gradTarget?.gradient?.mode ?? (isTierGradient ? 'vertical' : 'swirl');
  const gradBalance = gradTarget?.gradient?.balance ?? 0.5;
  // Reset the pending-stop affordance when the selection changes, so an unfinished "+" on one tier
  // doesn't carry over to the next.
  const gradSelKey = `${selectedEl?.type ?? ''}:${selectedEl?.index ?? selectedEl?.id ?? ''}`;
  useEffect(() => { setGradPending(false); setGradStop(0); }, [gradSelKey]);
  // Chips the popup shows: the real stops, plus one empty placeholder while a "+" add is pending.
  const gradStopsView = gradPending ? [...gradStops, null] : gradStops;
  const activeStop = gradPending
    ? gradStops.length                                   // the placeholder slot
    : Math.min(gradStop, Math.max(0, gradStops.length - 1));
  // The colour the wheel edits: the active stop when eligible, else the normal single colour.
  const wheelColor = (stopsEligible && !hasActiveGroup) ? (gradStops[activeStop] ?? '#ffffff') : currentColor;

  function writeGradient(colors, mode = gradMode, balance = gradBalance) {
    const clean = colors.filter(Boolean);
    // Glaze marble palette lives on tier.glaze.colors (1 = solid, 2–5 = marble); route there first.
    if (isGlazeTier) { setTierGlaze(selectedEl.index, { colors: clean.length ? clean : GLAZE_DEFAULTS.colors }); return; }
    /* Stripes: the chips are the palette. Dropping below two colours is not "stripes with one
     * colour" — it is a solid wall, so the stripes come off entirely and the tier keeps the colour
     * that is left. Leaving a one-colour stripe set behind would render as a solid cake that a baker
     * cannot turn back into stripes without knowing to add a colour first. */
    if (stripesOn) {
      if (clean.length >= 2) setTierStripes(selectedEl.index, { palette: clean });
      else { setTierStripes(selectedEl.index, null); handleColorChange(clean[0] ?? gradTarget.color); }
      return;
    }
    // Tier and sticker share the model; route to the matching setter. Both drop the gradient and
    // keep the solid colour when fewer than 2 stops remain.
    if (isTierGradient) { setTierGradient(selectedEl.index, clean, mode, balance); return; }
    if (clean.length >= 2) {
      updateSticker(selectedEl.id, { gradient: { mode, colors: clean, balance }, color: clean[0] });
    } else {
      updateSticker(selectedEl.id, { gradient: null, color: clean[0] ?? selectedSticker.color });
    }
  }
  /* Switching treatment. Each one CLEARS the other, because they are one choice — and because both
   * shaders write the same pixel, so a tier carrying both is a wall whose look depends on which
   * effect happened to re-run last.
   *
   * ⚠️ Turning stripes ON seeds a whole PRESET, never an empty object. A stripe set missing
   * `softness` renders at whatever the material defaults to, which is a look the baker did not
   * choose and cannot account for. */
  function setTreatment(next) {
    if (!isTierGradient) return;
    const i = selectedEl.index;
    if (next === 'solid') {
      setTierStripes(i, null);
      setTierGradient(i, [gradStops[0] ?? selectedTierObj?.color ?? '#ffffff']);
    } else if (next === 'ombre') {
      setTierStripes(i, null);
      const base = gradStops.filter(Boolean);
      // Seed a second stop from the tier's own colour rather than inventing one, so the first thing
      // a baker sees is their cake slightly blended — not a colour they never picked.
      setTierGradient(i, base.length >= 2 ? base : [base[0] ?? '#ffffff', base[0] ?? '#f0dede']);
    } else {
      setTierGradient(i, []);                 // drops the gradient, keeps the solid colour
      setTierStripes(i, STRIPE_PRESETS.pastel);
    }
    setGradPending(false); setGradStop(0);
  }

  function handleWheelChange(c) {
    // Editing a recompose part-group is always a solid per-group colour, never a gradient.
    if (hasActiveGroup) { handleColorChange(c); return; }
    if (!stopsEligible) { handleColorChange(c); return; }
    // Filling a pending (empty) stop: append it now — this is what turns a solid colour into a
    // gradient, or adds a 3rd stop. No colour is ever auto-copied.
    if (gradPending) {
      const next = [...gradStops, c];
      setGradPending(false);
      setGradStop(next.length - 1);
      writeGradient(next);
      return;
    }
    const next = gradStops.slice();
    next[activeStop] = c;
    // 1 stop is just the solid colour; route through the normal colour path (tier or sticker). A glaze
    // tier always writes through writeGradient (→ setTierGlaze), where 1 stop is the solid glaze.
    if (next.length < 2 && !isGlazeTier) {
      if (isTierGradient) handleColorChange(c);
      else updateSticker(selectedEl.id, { color: c });
      return;
    }
    writeGradient(next);
  }
  function addGradStop() {
    revealColourPicker();
    if (gradStops.length >= maxStops || gradPending) return;
    // Show an empty placeholder stop and wait for the user to pick its colour (handleWheelChange) —
    // don't duplicate the last colour, which looked like "nothing happened".
    setGradPending(true);
    setGradStop(gradStops.length);
  }
  // Select a chip: picking a real stop cancels a pending placeholder; the placeholder itself keeps it.
  const colourWheelRef = useRef(null);
  /* Picking a stop must BRING YOU TO THE PICKER, on whichever layout you are on.
   *
   * ⚠️ Reported twice as "the colour picker does not appear". Tapping a stripe chip did select it —
   * the ring moved — but the wheel that changes it was somewhere the baker could not see, so the tap
   * looked like it did nothing. Nothing was broken; the control and its effect were just far apart.
   *
   *   desktop — every section is stacked in one scrolling column, so the wheel is above and often
   *             scrolled out. `block: 'nearest'` scrolls only when it actually is.
   *   phone   — the sections are TABS and the wheel lives in a different one, so no amount of
   *             scrolling would ever reveal it. Switch tabs instead.
   *
   * The same was already true of a glaze tier's marble stops; this fixes that too. */
  function revealColourPicker() {
    if (isMobile) setEditTab('colour');
    else colourWheelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function selectGradStop(i) {
    if (gradPending && i < gradStops.length) setGradPending(false);
    setGradStop(i);
    revealColourPicker();
  }
  function removeGradStop(i) {
    setGradPending(false);
    writeGradient(gradStops.filter((_, idx) => idx !== i));
    setGradStop(0);
  }
  // Right panel shows when: tier selected (always), or color picker opened, or topper selected (resize)
  const showRightPanel = tierPanelVisible
    || ((caps?.color || caps?.gradient) && colorOpen)
    // Recompose per-group editing is gated on the group's `editable` flag, not allowed_actions.color.
    || (hasActiveGroup && colorOpen);

  // Measured rather than assumed: the height can come from the content, from a drag, or from the
  // 60% cap, and the canvas has to inset by whichever it actually was.
  useLayoutEffect(() => {
    const el = editSheetRef.current;
    if (!el) { setEditSheetH(0); return undefined; }
    const read = () => setEditSheetH(Math.round(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showRightPanel, isMobile, editTab, editDragH]);

  // ── Decoration edit stack ────────────────────────────────────────────────
  // Every editable decoration (sticker + topper + text) is a card in a right-side
  // accordion, mirroring the cream-piping popup: the selected one expands to its
  // full controls, the rest collapse to clickable headers, so adding/selecting a
  // second element stacks beneath the first instead of replacing it.
  // "Single-per-slot" hero elements (topper, top&side decor — flagged in placement_config)
  // collapse to ONE card per element (type 'decorEl'); everything else scatters freely. Pure
  // classifier lives in placement.js (shared with the contract test).
  // A cluster element is NEVER multi-slot (hero) — even if the load-time backfill added single_per_slot
  // for its type — so it places as a plain ball + Cluster toggle, not the per-slot hero chooser.
  const isMultiSlotEl = elId => {
    const e = elementById.get(elId);
    return isSinglePerSlot(e) && !e?.placement_config?.cluster;
  };
  const decorationCards = [];
  const seenDecorEl = new Set();
  const seenPattern = new Set();
  const seenGroup = new Set();
  const seenScatter = new Set();
  const seenCluster = new Set();
  design.stickers
    .forEach(st => {
      const thumb = /\.(glb|gltf)(\?|$)/i.test(st.imageUrl ?? '') ? null : st.imageUrl;
      // A faux-ball cluster's balls collapse into ONE card (managed by a size slider), keyed by
      // clusterId so multiple clusters each get their own card.
      if (st.clusterId) {
        if (seenCluster.has(st.clusterId)) return;
        seenCluster.add(st.clusterId);
        decorationCards.push({ key: `cluster-${st.clusterId}`, type: 'cluster', clusterId: st.clusterId, name: st.name ?? 'Cluster', thumb });
      // A density-scatter element's instances collapse into ONE card (managed by a density slider).
      } else if (st.scatter) {
        if (seenScatter.has(st.elementId)) return;
        seenScatter.add(st.elementId);
        decorationCards.push({ key: `scatter-${st.elementId}`, type: 'scatter', elementId: st.elementId, name: st.name ?? 'Scatter', thumb });
      } else if (st.groupId) {
      // A user group's members collapse into ONE card (members abstracted away), exactly like a
      // decor_pattern. groupId rides along through save/load, so the card reappears on reload.
        if (seenGroup.has(st.groupId)) return;
        seenGroup.add(st.groupId);
        decorationCards.push({ key: `group-${st.groupId}`, type: 'group', groupId: st.groupId, name: 'Group', thumb });
      } else if (st.patternId) {
        if (seenPattern.has(st.patternId)) return;
        seenPattern.add(st.patternId);
        const patEl = elementById.get(st.patternElementId);
        decorationCards.push({ key: `pattern-${st.patternId}`, type: 'pattern', patternId: st.patternId, patternElementId: st.patternElementId, name: patEl?.name ?? st.name ?? 'Decoration', currentZone: st.zone, thumb: patEl?.thumbnail_url ?? null });
      } else if (isMultiSlotEl(st.elementId)) {
        if (seenDecorEl.has(st.elementId)) return;
        seenDecorEl.add(st.elementId);
        decorationCards.push({ key: `el-${st.elementId}`, type: 'decorEl', elementId: st.elementId, name: st.name ?? 'Decoration', thumb });
      } else {
        decorationCards.push({ key: `sticker-${st.id}`, type: 'sticker', id: st.id, name: st.name ?? 'Decoration', thumb });
      }
    });
  decorationCards.push(...design.texts.map(t => ({
    key: `text-${t.id}`, type: 'text', id: t.id,
    name: (t.content && t.content.trim()) || 'Text', thumb: null, glyph: 'T',
  })));
  // Transient placement popup for a cluster element clicked in the decorations menu (no instance yet):
  // a "drag onto the cake" card. It vanishes once a ball is dropped (selection moves to that ball).
  if (selectedEl?.type === 'cluster-place') {
    const cpEl = elementById.get(selectedEl.elementId);
    decorationCards.unshift({
      key: `cluster-place-${selectedEl.elementId}`, type: 'cluster-place', elementId: selectedEl.elementId,
      name: cpEl?.name ?? 'Cluster', thumb: /\.(glb|gltf)(\?|$)/i.test(cpEl?.image_url ?? '') ? (cpEl?.thumbnail_url ?? null) : (cpEl?.image_url ?? cpEl?.thumbnail_url ?? null),
    });
  }
  // Gold-leaf finish card: ONE card with the tier/colour chooser inside, shown while editing foil OR
  // whenever the cake carries any (so it reappears on reload — a finish is not a sticker).
  if (selectedEl?.type === 'foil' || design.tiers.some(t => t.foil?.flakes?.length)) {
    const fEl = foilElement ?? (selectedEl?.elementId ? elementById.get(selectedEl.elementId) : null);
    decorationCards.unshift({
      key: 'foil', type: 'foil', elementId: fEl?.id ?? selectedEl?.elementId ?? null,
      name: fEl?.name ?? 'Foil',
      thumb: /\.(glb|gltf)(\?|$)/i.test(fEl?.image_url ?? '') ? (fEl?.thumbnail_url ?? null) : (fEl?.image_url ?? fEl?.thumbnail_url ?? null),
    });
  }
  // Second-cream-layer finish card: ONE card editing the raised bands (tier.creamLayers). Shown while
  // editing OR whenever any tier carries a band (so it reappears on reload — a finish, not a sticker).
  if (selectedEl?.type === 'cream' || design.tiers.some(t => t.creamLayers?.length)) {
    const cEl = creamElement ?? (selectedEl?.elementId ? elementById.get(selectedEl.elementId) : null);
    decorationCards.unshift({
      key: 'cream', type: 'cream', elementId: cEl?.id ?? selectedEl?.elementId ?? null,
      name: cEl?.name ?? 'Cream layer',
      thumb: /\.(glb|gltf)(\?|$)/i.test(cEl?.image_url ?? '') ? (cEl?.thumbnail_url ?? null) : (cEl?.image_url ?? cEl?.thumbnail_url ?? null),
    });
  }
  // Tool finishes (luster dust, freehand cream pen) — their editor is the Tools composer (a placement
  // MODE), but the applied result is a persistent finish just like foil/cream. So they get a persistent
  // card here that reappears whenever the cake carries the finish; clicking it reopens the composer
  // (selectDecorationCard → type 'tool'). This is the always-present re-entry the composer's ✕ collapses
  // back to — so closing the composer is never a dead-end. type 'tool' never expands inline (isCardSelected
  // is false for it), it only launches the composer.
  if ((selectedEl?.type === 'tool' && selectedEl.tool === 'luster-dust') || design.tiers.some(t => t.dusting?.splashes?.length)) {
    decorationCards.unshift({ key: 'luster-dust', type: 'tool', tool: 'luster-dust', name: 'Luster Dust', thumb: null });
  }
  // Grass shows a card for as long as any tier HAS grass — unlike the tools above it, which also
  // appear while merely selected. Grass is applied the moment you pick it (there is nothing to
  // compose first), so "has grass" and "should show a card" are the same condition.
  if (design.tiers.some(t => t.grass) || design.boardGrass) {
    decorationCards.unshift({ key: 'grass', type: 'grass', name: 'Grass', thumb: null });
  }
  // ONE CARD PER RAINBOW, like the writing cards and for the same reason: each carries its own
  // arrangement and its own place on the cake, so a single shared card could only ever edit one of
  // them and would silently be the wrong one. Numbered only when there is more than one, because
  // "Rainbow 1" on a cake with one rainbow is a label answering a question nobody asked.
  // One card per cloud, same rule as the rainbows: each carries its own kind and its own place.
  design.tiers.forEach((t, tierIndex) => (t.clouds ?? []).forEach((cl, n) => {
    decorationCards.unshift({
      key: `cloud-${cl.id}`, type: 'cloud', id: cl.id, tierIndex,
      name: (t.clouds.length > 1 ? `Cloud ${n + 1}` : 'Cloud'), thumb: null,
    });
  }));
  design.tiers.forEach((t, tierIndex) => (t.rainbows ?? []).forEach((rb, n) => {
    decorationCards.unshift({
      key: `rainbow-${rb.id}`, type: 'rainbow', id: rb.id, tierIndex,
      name: (t.rainbows.length > 1 ? `Rainbow ${n + 1}` : 'Rainbow'), thumb: null,
    });
  }));
  if (design.nameBlocks?.blocks?.length) {
    decorationCards.unshift({ key: 'blocks', type: 'blocks', name: 'Letter Blocks', thumb: null, glyph: 'A' });
  }
  /* One card per placed garnish, newest first — the same shape every other placed decoration has, so
     a customer meets one accordion rather than a special case for chocolate. */
  (design.garnishes ?? []).forEach(g => {
    decorationCards.unshift({ key: `garnish-${g.id}`, type: 'garnish', id: g.id, garnish: g, thumb: null,
                              name: g.name || 'Chocolate garnish' });
  });
  if ((selectedEl?.type === 'tool' && selectedEl.tool === 'pen') || design.piping?.length) {
    // Named for what is in the bag. "Cream Pen" while piping chocolate was the giveaway that the
    // medium had reached the renderer and nothing else.
    decorationCards.unshift({ key: 'cream-pen', type: 'tool', tool: 'pen', thumb: null,
      name: `${MEDIA[penStyle.medium]?.label ?? MEDIA[DEFAULT_MEDIUM].label} Pen` });
  }
  // The element stack is ONE persistent right-side editor holding every editable
  // element on the cake — decorations (sticker/topper/text) AND piping cards — in a
  // single accordion. It stays open as long as the cake carries any of them and no
  // OTHER editor (tools composer or tier panel) is active. Only ONE card is expanded
  // at a time across both groups; collapsing/minimising a card never closes the
  // stack — only removing an element drops its card, and the stack closes when none
  // remain. Adding a piping does not hide the decoration cards (and vice versa).
  const writings = design.writings ?? [];
  const activeWriting = writings.find(w => w.id === selectedWritingId) ?? null;
  const setWriting = changes => { if (selectedWritingId) updateWriting(selectedWritingId, changes); };
  const clearWriting = () => { if (selectedWritingId) removeWriting(selectedWritingId); };
  const hasWriting = writings.length > 0;
  const elementStackOpen = (decorationCards.length > 0 || pipingCards.length > 0 || hasWriting)
    && !toolsOpen
    && selectedEl?.type !== 'tier';
  // A group card stays expanded both when the group itself is selected AND when the user has
  // drilled into one of its members (selectedEl is that member's sticker) — the member has no
  // card of its own, so its controls render inside the group card.
  const memberGroupId = (id) => design.stickers.find(s => s.id === id)?.groupId ?? null;
  const isCardSelected = (card) =>
    card.type === 'group'
      ? (selectedEl?.type === 'group' && selectedEl.groupId === card.groupId)
        || (selectedEl?.type === 'sticker' && memberGroupId(selectedEl.id) === card.groupId)
      : selectedEl?.type === card.type &&
        (card.type === 'decorEl' || card.type === 'scatter' || card.type === 'cluster-place' ? selectedEl.elementId === card.elementId
         : card.type === 'pattern' ? selectedEl.patternId === card.patternId
         : card.type === 'cluster' ? selectedEl.clusterId === card.clusterId
         : card.type === 'foil' ? true
         : card.type === 'grass' ? true
         : card.type === 'blocks' ? true
         : card.type === 'cream' ? true
         : card.type === 'tool' ? selectedEl.tool === card.tool
         : selectedEl?.id === card.id);

  // ── The stack is a FLYOUT on a phone ──────────────────────────────────────────────────────────
  // Shut by default, pulled out by a tab on the right edge. It used to be permanently open, and on a
  // 335px viewport a list of a dozen decorations covered the cake it was describing — you could not
  // see the thing you were editing. Desktop keeps it open: there is room beside the cake there, and
  // hiding it would cost a click for nothing.
  //
  // It cannot simply be DROPPED on a phone, which is the tempting version of this fix. Grass, letter
  // blocks, gold leaf and luster dust have no pointer handlers on the cake at all — their drag handles
  // only exist inside their own mode, and their card is what opens that mode. Take the stack away and
  // a baker can add grass and then never edit or remove it.
  //
  // And it springs open by itself whenever a card is EXPANDED, because selecting a decoration on the
  // cake is what expands that decoration's card. With the flyout shut, tapping a decoration would
  // otherwise look like nothing happened at all.
  const stackHasExpandedCard = decorationCards.some(isCardSelected)
    || selectedEl?.type === 'writing'
    || expandedPipingId != null;
  const stackShown = !isMobile || stackFlyoutOpen || stackHasExpandedCard;

  // Opened by picking something ON THE CAKE rather than by the handle → show ONLY that element's
  // card. Tapping a lion is a question about the lion; answering it with a list of the other eleven
  // decorations puts the rest of the cake behind a column the baker did not ask for. The handle is
  // what asks for the list, and it still does.
  const stackSingleCard = isMobile && !stackFlyoutOpen && stackHasExpandedCard;

  // The handle has three states to move between, not two: shut, one card, and the whole list.
  //   · shut or one card → open the list. From a single card that is "and show me the others",
  //     which beats making the baker close the card first and then pull the handle.
  //   · list → shut, AND collapse whatever was expanded. Without the second half the panel springs
  //     straight back open, because an expanded card is itself a reason to be shown.
  function toggleStackFlyout() {
    if (stackFlyoutOpen) { setStackFlyoutOpen(false); clearAllSelections(); }
    else setStackFlyoutOpen(true);
  }

  function selectDecorationCard(card) {
    // Every card is a single exclusive selection routed through selectExclusive (selectedEl + the
    // highlight Set written together), so clicking any card can never leave a previous card OR a canvas
    // decoration still selected. Per-instance highlight ids are derived per card type; card-managed
    // selections (tool / scatter / cluster / cluster-place / foil / cream / text) highlight no instances.
    // Tool finishes (luster dust / cream pen) expand INLINE like the others; their placement mode is
    // gated on this selection. Collapse = click the header again (clearAllSelections).
    setExpandedPipingId(null);   // collapse any expanded piping card — single expansion
    if (card.type === 'tool') setToolsOpen(false);
    const stickerIds =
        card.type === 'decorEl' ? design.stickers.filter(s => s.elementId === card.elementId).map(s => s.id)
      : card.type === 'pattern' ? design.stickers.filter(s => s.patternId === card.patternId).map(s => s.id)
      : card.type === 'group'   ? design.stickers.filter(s => s.groupId === card.groupId).map(s => s.id)
      : card.type === 'sticker' ? [card.id]
      : null;
    const el =
        card.type === 'tool'          ? { type: 'tool', tool: card.tool }
      : card.type === 'decorEl'       ? { type: 'decorEl', elementId: card.elementId }
      : card.type === 'scatter'       ? { type: 'scatter', elementId: card.elementId }
      : card.type === 'cluster'       ? { type: 'cluster', clusterId: card.clusterId }
      : card.type === 'cluster-place' ? { type: 'cluster-place', elementId: card.elementId }
      : card.type === 'foil'          ? { type: 'foil', elementId: card.elementId }
      : card.type === 'cream'         ? { type: 'cream', elementId: card.elementId }
      : card.type === 'cloud'         ? { type: 'cloud', tierIndex: card.tierIndex, id: card.id }
      : card.type === 'rainbow'       ? { type: 'rainbow', tierIndex: card.tierIndex, id: card.id }
      : card.type === 'garnish'       ? { type: 'garnish', id: card.id }
      : card.type === 'grass'         ? { type: 'grass' }
      : card.type === 'blocks'        ? { type: 'blocks' }
      : card.type === 'sticker'       ? { type: 'sticker', id: card.id }
      : card.type === 'pattern'       ? { type: 'pattern', patternId: card.patternId, patternElementId: card.patternElementId }
      : card.type === 'group'         ? { type: 'group', groupId: card.groupId }
      : card.type === 'text'          ? { type: 'text', id: card.id }
      : null;
    if (el?.type === 'cloud') {
    }
    if (el?.type === 'rainbow') {
      // Which handle is lit follows which card is open. Without this, opening a card on a cake with
      // two rainbows leaves the previous one's dot highlighted, and the highlight is the only thing
      // saying which of two identical dots belongs to the panel you are looking at.
    }
    if (el) selectExclusive(el, stickerIds);
  }

  // Move a whole decor_pattern to another surface: drop its current parts, re-place on the new zone
  // keeping the SAME patternId so the card (and its selection) stays put. Reuses placePattern.
  function changePatternZone(card, zone, tierIndex) {
    const patEl = elementById.get(card.patternElementId);
    if (!patEl) return;
    const parts = patEl.placement_config?.parts ?? [];
    design.stickers.filter(s => s.patternId === card.patternId).forEach(s => removeSticker(s.id));
    placePattern(patEl, parts, { zone, tierIndex, x: 0, z: 0 }, card.patternId);
  }
  function removePattern(card) {
    design.stickers.filter(s => s.patternId === card.patternId).forEach(s => removeSticker(s.id));
    clearAllSelections();
  }
  // The pattern card body: a persistent zone chooser (Top/Side preview tiles, current one ticked),
  // like piping's rim/board. Reuses the pattern-aware TopperPreview. Parts move on the canvas.
  function renderPatternBody(card) {
    const patEl = elementById.get(card.patternElementId);
    const parts = (patEl?.placement_config?.parts ?? []).map(p => {
      const pe = elementById.get(p.element_id);
      return pe ? { glbUrl: pe.image_url, baseRotation: facingOffsetRadians(pe.placement_config), r: pe.placement_config?.r ?? 2.5, dx: p.dx ?? 0, dz: p.dz ?? 0, mirror: p.mirror === true } : null;
    }).filter(Boolean);
    const zones = patEl?.allowed_zones ?? [];
    const tiles = [];
    if (zones.includes(ZONES.TOP_SURFACE)) tiles.push({ zone: ZONES.TOP_SURFACE, placement: 'top', label: 'Top', tierIndex: (canvasConfig.tiers?.length ?? 1) - 1 });
    if (zones.includes(ZONES.SIDE) || zones.includes(ZONES.MIDDLE_TIER)) tiles.push({ zone: ZONES.SIDE, placement: 'side', label: 'Side', tierIndex: 0 });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>Surface — drag each piece on the cake to fine-tune.</div>
        {tiles.map(t => {
          const active = card.currentZone === t.zone || (t.zone === ZONES.SIDE && card.currentZone === ZONES.MIDDLE_TIER);
          return (
            <div key={t.zone} role="button" onClick={() => { if (!active) changePatternZone(card, t.zone, t.tierIndex); }} style={{ cursor: active ? 'default' : 'pointer' }}>
              <div style={{ width: '100%', height: 110, borderRadius: 10, overflow: 'hidden', border: `2px solid ${active ? '#1a1a1a' : '#cdccd3'}`, background: '#cfcdd6' }}>
                <TopperPreview parts={parts} placement={t.placement} tiers={canvasConfig.tiers} tierIndex={t.tierIndex} />
              </div>
              <span style={{ display: 'block', marginTop: 4, fontSize: 10, fontWeight: 700, color: active ? '#1a1a1a' : '#8a7a80', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Quicksand',sans-serif" }}>{t.label}{active ? ' ✓' : ''}</span>
            </div>
          );
        })}
        <button onClick={() => removePattern(card)} style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: '#e53935', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", textAlign: 'left', padding: 0 }}>Remove</button>
      </div>
    );
  }

  // The group card body: a user-locked group presented as ONE unit (members abstracted away).
  // Group view = member chips (tap to drill into one) + proportional Size + Ungroup + Remove-all.
  // Drill-in view = that member's normal controls (reusing buildToolbar) with a "← Group" back.
  // A member carries no card of its own, so its editing lives here. Per-member delete/duplicate
  // are suppressed in buildToolbar while grouped — ungroup to delete a single piece.
  function renderGroupBody(card) {
    const members = design.stickers.filter(s => s.groupId === card.groupId);
    if (!members.length) return null;
    const drilled = selectedEl?.type === 'sticker' && members.some(m => m.id === selectedEl.id);
    if (drilled) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => { setSelectedEl({ type: 'group', groupId: card.groupId }); setSelectedStickerIds(new Set(members.map(m => m.id))); setColorOpen(false); }}
            style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, color: '#6c47ff', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", padding: 0 }}>
            ← Group
          </button>
          {buildToolbar(selectedEl, 'panel')}
        </div>
      );
    }
    const meanScale = members.reduce((a, m) => a + (m.scale ?? 1), 0) / members.length;
    // A group can span elements with different configured ranges — use their INTERSECTION so the
    // shared dial can't push any member past its own cap (tightest floor, tightest ceiling).
    const memberRanges = members.map(m => scaleRangeOf(elementById.get(m.elementId), 0.25, 8, 0.05));
    const grpMin = Math.max(...memberRanges.map(r => r.min));
    const grpMax = Math.min(...memberRanges.map(r => r.max));
    const grpStep = Math.min(...memberRanges.map(r => r.step));   // finest increment any member wants
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>Drag on the cake to move the group · tap a piece to edit it.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {members.map(m => {
            const t = /\.(glb|gltf)(\?|$)/i.test(m.imageUrl ?? '') ? null : m.imageUrl;
            return (
              <div key={m.id} role="button"
                onClick={() => { setSelectedEl({ type: 'sticker', id: m.id }); setSelectedStickerIds(new Set([m.id])); setColorOpen(false); }}
                title={m.name ?? 'Piece'}
                style={{ width: 34, height: 34, borderRadius: 7, overflow: 'hidden', border: '1.5px solid #999999', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {t ? <img src={t} alt={m.name ?? ''} width={34} height={34} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                   : <span style={{ fontSize: 14, fontWeight: 800, color: '#bbb' }}>{m.name?.[0]?.toUpperCase() ?? '•'}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={s.editPanelLabel}>Size</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <SizeDial size={meanScale} min={grpMin} max={grpMax} step={grpStep}
              onChange={v => { if (meanScale > 0) scaleGroupBy(members.map(m => m.id), v / meanScale); }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <button onClick={() => { ungroupStickers(card.groupId); clearAllSelections(); }}
            style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", padding: 0 }}>Ungroup</button>
          <button onClick={handleDelete}
            style={{ fontSize: 11, fontWeight: 700, color: '#e53935', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", padding: 0 }}>Remove group</button>
        </div>
      </div>
    );
  }

  // A compact "drag another ball onto the cake" handle, shown INSIDE the single-ball and cluster cards
  // so the drag-to-place affordance is never lost — you can always add one more ball / cluster without
  // returning to the menu. Same drag path as the panel / placement popup.
  // A prominent draggable ball that sits at the TOP of a cluster element's card (bigger than the
  // controls below it). Dragging it onto the cake places a new ball — same path as the panel — so you
  // can always add one more ball / cluster without leaving the popup.
  function clusterAddHandle(element) {
    if (!element?.placement_config?.cluster) return null;
    const thumb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '') ? (element.thumbnail_url ?? null) : (element.image_url ?? element.thumbnail_url ?? null);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, marginBottom: 6, borderBottom: '1px dashed #eadde2' }}>
        <div role="button" title="Drag onto the cake"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); startStickerDrag(element, e.clientX, e.clientY); }}
          style={{ width: 78, height: 78, borderRadius: 16, border: '2px dashed #c9a227', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', background: '#fffdf5', flexShrink: 0, touchAction: 'none' }}>
          {thumb ? <img src={corsUrl(thumb)} alt="" width={58} height={58} draggable={false} crossOrigin="anonymous" style={{ objectFit: 'contain', pointerEvents: 'none' }} />
                 : <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #f4e3a1, #c9a227 70%)' }} />}
        </div>
        <span style={{ fontSize: 10.5, color: '#5a5a5a', lineHeight: 1.4, fontFamily: "'Quicksand',sans-serif" }}>Drag this ball onto the cake to add another — anywhere on the top or down the side. Switch on <b>Cluster</b> to grow it.</span>
      </div>
    );
  }
  // The placement popup for a cluster element (before anything is on the cake): a clear instruction
  // and a draggable ball the user drops onto the cake. Dragging reuses the same path as the panel.
  function renderClusterPlaceBody(card) {
    const el = elementById.get(card.elementId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <div style={{ fontSize: 10.5, color: '#5a5a5a', lineHeight: 1.45, fontFamily: "'Quicksand',sans-serif", textAlign: 'center' }}>
          Drag the ball onto the cake to place it — anywhere on the top or down the side. Once it’s on the cake, switch on <b>Cluster</b> to grow it into a full clustered arrangement.
        </div>
        <div role="button" title="Drag onto the cake"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); startStickerDrag(el, e.clientX, e.clientY); }}
          style={{ width: 70, height: 70, borderRadius: 14, border: '1.5px dashed #c9a227', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', background: '#fffdf5', touchAction: 'none' }}>
          {card.thumb
            ? <img src={corsUrl(card.thumb)} alt={card.name} width={52} height={52} draggable={false} crossOrigin="anonymous" style={{ objectFit: 'contain', pointerEvents: 'none' }} />
            : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #f4e3a1, #c9a227 70%)' }} />}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif", letterSpacing: 0.3 }}>DRAG ONTO THE CAKE</div>
      </div>
    );
  }
  // The cluster card body: ONE packed clump (sharing a clusterId). Size slider re-packs; a
  // CUSTOMER-controlled colour palette (add / edit / remove swatches) recolours the balls — one
  // colour = solid clump, several = mixed (cycled across the balls); Remove drops the whole clump.
  // The gold-leaf ("food foil") finish card: a tier finish painted into the wall (like dusting), but
  // edited through the decorations card stack. Tier + colour chooser INSIDE the card; then tap "Add",
  // and drag each flake's dot on the cake to scatter the shards. Round tiers only in v1.
  function renderFoilBody(card) {
    const el = elementById.get(card.elementId);
    const colors = el?.placement_config?.colors ?? GOLD_LEAF_COLORS;
    const flakes = design.tiers[foilTier]?.foil?.flakes ?? [];
    // Surfaces come straight from the element's allowed_zones (config-driven, #1) — foil is a finish, so
    // only the round surfaces it can paint (side wall, flat top). Chooser shows only when >1 is allowed.
    const surfaces = (el?.allowed_zones ?? ['side']).filter(z => z === 'side' || z === 'top_surface');
    const surfOpts = surfaces.length ? surfaces : ['side'];
    const effSurface = surfOpts.includes(foilSurface) ? foilSurface : surfOpts[0];
    const SURF_LABEL = { side: 'Side', top_surface: 'Top' };
    const tierBtn = (active) => ({ minWidth: 26, padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      border: active ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8', background: active ? '#3D5A44' : '#fff', color: active ? '#fff' : '#3D5A44' });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>Torn shards of edible foil pressed onto the cake. Add a few, then drag each dot to move it.</div>
        <FinishTierPicker tiers={design.tiers} tier={foilTier} onPick={i => { setFoilTier(i); setFoilSel(0); }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={s.editPanelLabel}>Colour</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(colors).map(([name, hex]) => (
              <button key={name} onClick={() => setAllFoilColor(hex)} title={name}
                style={{ padding: '5px 12px', borderRadius: 14, fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                  border: foilColor.toLowerCase() === hex.toLowerCase() ? '2px solid #3D5A44' : '1.5px solid #C5D4C8',
                  background: hex, color: '#3d2f12' }}>{name}</button>
            ))}
          </div>
        </div>
        {surfOpts.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.editPanelLabel}>Surface</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {surfOpts.map(z => (
                <button key={z} style={tierBtn(effSurface === z)} onClick={() => setFoilSurface(z)}>{SURF_LABEL[z] ?? z}</button>
              ))}
            </div>
          </div>
        )}
        <button style={{ width: '100%', borderRadius: 8, fontSize: 12, fontWeight: 800, color: '#fff', background: '#3D5A44', border: 'none', padding: '9px', cursor: 'pointer' }}
          onClick={() => addFoilToTier(foilTier, effSurface)}>Add foil</button>
        {flakes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {flakes.map((_, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 14, overflow: 'hidden',
                border: foilSel === i ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8', background: foilSel === i ? '#EEF4EF' : '#fff' }}>
                <button onClick={() => setFoilSel(i)} style={{ padding: '4px 6px 4px 10px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: '#3D5A44', cursor: 'pointer' }}>Flake {i + 1}</button>
                <button title="Remove" onClick={() => { if (foilSel >= i) setFoilSel(v => Math.max(0, v - 1)); removeFoilFlake(foilTier, i); }}
                  style={{ padding: '4px 8px', border: 'none', background: 'transparent', fontSize: 13, color: '#e53935', cursor: 'pointer' }}>×</button>
              </span>
            ))}
          </div>
        )}
        {flakes[foilSel] && (() => {
          // Dial bounds + increment from the element's placement_config.scale (fallbacks if absent).
          const sc = scaleRangeOf(elementById.get(card.elementId), 0.1, 1.5, 0.05);
          return (
            <PenSlider label="Size" value={flakes[foilSel].size ?? 0.5} min={sc.min} max={sc.max} step={sc.step}
              onChange={v => updateFoilFlake(foilTier, foilSel, { size: v })} fmt={v => v.toFixed(2)} />
          );
        })()}
        {flakes.length > 0 && (
          <button style={{ ...s.iconBtn, width: '100%', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#e53935', background: '#fff0f0', border: '1.5px solid #f5c0c0' }}
            onClick={() => { clearFoil(foilTier); setFoilSel(0); }}>Remove all on this tier</button>
        )}
      </div>
    );
  }

  // The second-cream-layer finish card: raised buttercream bands on a tier (tier.creamLayers). Pick a
  // tier, "Add band", then per band recolour / set fill side / Lift / Torn / edge preset / gold edge,
  // and "Paint edge" to scrape the torn rim live (with Auto-rotate to go all the way around). Round
  // tiers only — SecondCreamLayers renders on round walls. Reuses the cream reducers + presets + paint.
  function renderCreamBody() {
    const layers = design.tiers[creamTier]?.creamLayers ?? [];
    const sel = Math.min(creamSel, Math.max(0, layers.length - 1));
    const band = layers[sel] ?? null;
    // Height slider bounds from config (placement_config.second_cream.height_range), with sane fallbacks
    // so a band can't be a sliver or swallow the whole wall. Mirrors how foil's Size reads scaleRangeOf.
    const hr = creamElement?.placement_config?.second_cream?.height_range ?? {};
    const hMin = typeof hr.min === 'number' ? hr.min : 0.15;
    const hMax = typeof hr.max === 'number' && hr.max > 0 ? hr.max : 0.9;
    const hStep = typeof hr.step === 'number' && hr.step > 0 ? hr.step : 0.05;
    const up = (fn) => band && updateCreamLayer(creamTier, band.layerId, fn);
    const painting = creamPaint?.tierIndex === creamTier && creamPaint?.layerId === band?.layerId;
    const chip = (active) => ({ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      border: active ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8', background: active ? '#3D5A44' : '#fff', color: active ? '#fff' : '#3D5A44' });
    const action = { width: '100%', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      border: '1.5px solid #C5D4C8', background: '#fff', color: '#3D5A44', padding: '8px' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>A raised second buttercream band with a torn edge. Add a band, then scrape its edge on the cake (turn on Auto-rotate to go around).</div>
        <FinishTierPicker tiers={design.tiers} tier={creamTier} onPick={i => { setCreamTier(i); setCreamSel(0); }} />
        <button style={{ width: '100%', borderRadius: 8, fontSize: 12, fontWeight: 800, color: '#fff', background: '#3D5A44', border: 'none', padding: '9px', cursor: 'pointer' }}
          onClick={() => addCreamToTier(creamTier)}>+ Add band</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#3D5A44' }}>
          <input type="checkbox" checked={creamAutoRotate} onChange={e => setCreamAutoRotate(e.target.checked)} />
          Auto-rotate (spin to paint)
        </label>
        {layers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {layers.map((l, i) => (
              <span key={l.layerId} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 14, overflow: 'hidden',
                border: sel === i ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8', background: sel === i ? '#EEF4EF' : '#fff' }}>
                <button onClick={() => setCreamSel(i)} style={{ padding: '4px 6px 4px 10px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: '#3D5A44', cursor: 'pointer' }}>Band {i + 1}</button>
                <button title="Remove" onClick={() => { if (creamPaint?.layerId === l.layerId) setCreamPaint(null); if (sel >= i) setCreamSel(v => Math.max(0, v - 1)); removeCreamLayer(creamTier, l.layerId); }}
                  style={{ padding: '4px 8px', border: 'none', background: 'transparent', fontSize: 13, color: '#e53935', cursor: 'pointer' }}>×</button>
              </span>
            ))}
          </div>
        )}
        {band && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={s.editPanelLabel}>Colour</span>
              <input type="color" value={band.color} onChange={e => up(x => ({ ...x, color: e.target.value }))}
                style={{ width: 36, height: 26, border: '1.5px solid #C5D4C8', borderRadius: 7, cursor: 'pointer', background: '#fff', padding: 0 }} />
            </div>
            {/* Anchor: Bottom = band rises from the base (torn TOP edge); Top = band hangs from the rim
                (torn BOTTOM edge). One of each leaves the classic gap-in-the-middle two-tone. */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...chip(band.fillSide !== 'above'), flex: 1 }} onClick={() => up(x => ({ ...x, fillSide: 'below' }))}>Bottom</button>
              <button style={{ ...chip(band.fillSide === 'above'), flex: 1 }} onClick={() => up(x => ({ ...x, fillSide: 'above' }))}>Top</button>
            </div>
            <PenSlider label="Height" value={band.height ?? 0.5} min={hMin} max={hMax} step={hStep} onChange={v => up(x => ({ ...x, height: v }))} fmt={v => v.toFixed(2)} />
            <PenSlider label="Lift" value={band.lift} min={0} max={0.12} step={0.005} onChange={v => up(x => ({ ...x, lift: v }))} fmt={v => v.toFixed(3)} />
            <PenSlider label="Torn" value={band.noise} min={0} max={0.18} step={0.005} onChange={v => up(x => ({ ...x, noise: v }))} fmt={v => v.toFixed(3)} />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {Object.keys(SECOND_CREAM_PRESETS).map(name => (
                <button key={name} style={chip(false)} onClick={() => up(x => ({ ...x, edge: SECOND_CREAM_PRESETS[name]() }))}>{name}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#3D5A44' }}>
              <input type="checkbox" checked={!!band.gold?.on} onChange={e => up(x => ({ ...x, gold: { ...(x.gold ?? {}), on: e.target.checked } }))} />
              Gold edge
              {band.gold?.on && <input type="color" value={band.gold?.color ?? '#c89b3c'} onChange={e => up(x => ({ ...x, gold: { ...(x.gold ?? {}), color: e.target.value } }))}
                style={{ width: 30, height: 22, border: '1.5px solid #C5D4C8', borderRadius: 6, cursor: 'pointer', padding: 0 }} />}
            </label>
            <button style={{ ...action, ...(painting ? { background: '#3D5A44', color: '#fff', borderColor: '#3D5A44' } : {}) }}
              onClick={() => setCreamPaint(painting ? null : { tierIndex: creamTier, layerId: band.layerId })}>
              {painting ? 'Painting edge — drag on the cake' : 'Paint edge'}
            </button>
          </>
        )}
      </div>
    );
  }

  function renderClusterBody(card) {
    const members = design.stickers.filter(s => s.clusterId === card.clusterId);
    if (!members.length) return null;
    const count = members.length;
    const el = elementById.get(members[0].elementId);
    const { min, max } = clusterConfigOf(el ?? {});
    const palette = clusterPaletteOf(card.clusterId);
    const swatch = { width: 26, height: 26, padding: 0, border: '1.5px solid #C5D4C8', borderRadius: 6, cursor: 'pointer' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clusterAddHandle(el)}
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>A packed clump of balls — they touch without overlapping. Drag the clump to move it; Size adds or removes balls; add colours for a mixed clump.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={s.editPanelLabel}>Cluster</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#333', cursor: 'pointer' }}>
            <input type="checkbox" checked readOnly onChange={() => dissolveCluster(card.clusterId)} style={{ cursor: 'pointer' }} />
            on (uncheck → single ball)
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={s.editPanelLabel}>Size</span>
          <input type="range" min={min} max={max} step={1} value={count}
            onChange={e => setClusterSize(card.clusterId, parseInt(e.target.value, 10))}
            style={{ flex: 1, accentColor: '#1a1a1a' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#333', minWidth: 24, textAlign: 'right' }}>{count}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={s.editPanelLabel}>Colours</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {palette.map((c, i) => (
              <span key={i} style={{ position: 'relative', display: 'inline-flex' }}>
                <input type="color" value={c} style={swatch}
                  onChange={e => { const next = [...palette]; next[i] = e.target.value; setClusterPalette(card.clusterId, next); }} />
                {palette.length > 1 && (
                  <button title="Remove colour" onClick={() => setClusterPalette(card.clusterId, palette.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, lineHeight: '12px', fontSize: 10, borderRadius: '50%', border: '1px solid #ccc', background: '#fff', color: '#e53935', cursor: 'pointer', padding: 0 }}>×</button>
                )}
              </span>
            ))}
            <button title="Add colour" onClick={() => setClusterPalette(card.clusterId, [...palette, palette[palette.length - 1] ?? '#D4AF37'])}
              style={{ ...swatch, width: 26, fontSize: 16, color: '#3D5A44', background: '#F2F7F3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={s.editPanelLabel}>Finish</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {finishSliderControls(members[0]?.metalness, mat => setClusterFinish(card.clusterId, mat))}
          </div>
        </div>
        <button style={{ ...s.iconBtn, width: '100%', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#e53935', background: '#fff0f0', border: '1.5px solid #f5c0c0' }}
          onClick={() => { members.forEach(m => removeSticker(m.id)); clearAllSelections(); }}>Remove</button>
      </div>
    );
  }

  // The scatter card body: a density-managed set of packed instances (sprinkles). Density slider
  // (add/remove instances, never regenerate), one shared Size, one shared Colour (if the element
  // allows it), and Remove all. Reuses SizeDial + the colour wheel; no parallel renderer.
  function renderScatterBody(card) {
    const all = design.stickers.filter(s => s.elementId === card.elementId && s.scatter);
    if (!all.length) return null;
    const size = all[0]?.scale ?? 1;        // shared across surfaces (Size + Colour are one set)
    const canColor = !!caps?.color;
    const el = elementById.get(card.elementId);
    const scR = scaleRangeOf(el, 0.1, 4, 0.05);   // dial bounds + increment from config
    const zones = el?.allowed_zones ?? [];
    // Allowed surfaces (config-driven). Sprinkles can occupy SEVERAL at once, so each is an
    // INDEPENDENT checkbox (like piping's rim/board) — not a single-select move. INVARIANTS #3a/#6.
    const surfaces = [];
    if (zones.includes(ZONES.TOP_SURFACE)) surfaces.push({ group: 'top', zone: ZONES.TOP_SURFACE, label: 'Top', placement: 'top', tierIndex: scatterTierForZone(ZONES.TOP_SURFACE) });
    if (zones.includes(ZONES.SIDE) || zones.includes(ZONES.MIDDLE_TIER)) surfaces.push({ group: 'side', zone: ZONES.SIDE, label: 'Side', placement: 'side', tierIndex: scatterTierForZone(ZONES.SIDE) });
    const onSurfaces = surfaces.filter(su => all.some(s => scatterGroupOf(s) === su.group));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, color: '#8a7a80', fontFamily: "'Quicksand',sans-serif" }}>They pack together without overlapping. Tick a surface to scatter there; drag any one on the cake to nudge it.</div>
        {/* One checkbox per allowed surface — sprinkles can sit on Top AND Side at once, each its own
            set. Reuses PreviewTile (the piping/chooser tile): tick = scatter there, untick = remove
            that surface's set. Mode/preview come from config (placement_config[zone]); no type branch. */}
        {surfaces.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={s.editPanelLabel}>Surface</span>
            {surfaces.map(su => {
              const on = all.some(s => scatterGroupOf(s) === su.group);
              return (
                <PreviewTile key={su.zone} checked={on} onToggle={() => toggleScatterSurface(card.elementId, su.zone, !on)} label={su.label} height={96}
                  locked={false}>
                  {/* mode read by zone (no literal/default) so the preview matches the renderer */}
                  <TopperPreview parts={scatterPreviewParts(el, su.zone, size)} placement={su.placement} mode={zoneMode(el?.placement_config, su.zone)} tiers={canvasConfig.tiers} tierIndex={su.tierIndex} />
                </PreviewTile>
              );
            })}
          </div>
        )}
        {/* Count is per active surface (denser top than side if you like); Size + Colour are shared. */}
        {onSurfaces.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={s.editPanelLabel}>Count</span>
            {onSurfaces.map(su => {
              const c = all.filter(s => scatterGroupOf(s) === su.group).length;
              // Max from the CONFIGURED size, not the live (resized) size — else resizing would jog the slider.
              const maxCount = scatterMaxCount(su.zone, su.tierIndex, scatterScaleFor(el));
              return (
                <div key={su.group} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {onSurfaces.length > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: '#8a7a80', minWidth: 30 }}>{su.label}</span>}
                  <input type="range" min={1} max={maxCount} step={1} value={Math.min(c, maxCount)}
                    onChange={e => setScatterDensity(card.elementId, su.zone, parseInt(e.target.value, 10))}
                    style={{ flex: 1, accentColor: '#6c47ff', minWidth: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#333', minWidth: 22, textAlign: 'right' }}>{c}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={s.editPanelLabel}>Size</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <SizeDial size={size} min={scR.min} max={scR.max} step={scR.step}
              onChange={v => scaleStickers(all.map(s => s.id), v)} />
          </div>
        </div>
        {canColor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.editPanelLabel}>Colour</span>
            <button
              style={{ ...s.swatchBtn, background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 3, border: colorOpen ? '2.5px solid #6c47ff' : 'none' }}
              onClick={() => {
                const opening = !colorOpen;
                closeAllPopups();
                setSelectedEl({ type: 'scatter', elementId: card.elementId });
                setSelectedStickerIds(new Set());
                if (opening) setColorOpen(true);
              }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: all[0]?.color ?? '#ffffff' }} />
            </button>
          </div>
        )}
        {/* Always offered. See the note on `delete` in the toolbar's actions below: a decoration a
            customer cannot take off their own cake is not a capability, it is a trap. */}
        {true && (
          <button onClick={() => { all.forEach(s => removeSticker(s.id)); clearAllSelections(); }}
            style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: '#e53935', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", padding: 0 }}>Remove all</button>
        )}
      </div>
    );
  }

  // ── Caps-driven floating toolbar (text + piping) ──────────────────────────
  // Builds the per-element edit controls. `layout` decides the chrome:
  //   'strip' → the horizontal floating toolbar (mobile sheet, text, piping)
  //   'panel' → a vertical right-side popup (desktop sticker/topper), mirroring
  //             the cream-piping popup so element editing feels consistent.
  // Both layouts share one source of truth: a list of control `groups`. Each
  // group is `{ controls, divider, panelLabel, footer }` — the strip flattens
  // them with vertical dividers (identical to the original output); the panel
  // stacks them as labelled rows.
  // Shared per-surface placement chooser — the ONE live-preview UI (INVARIANTS #3/#6), reused two
  // ways via `instance`:
  //   • instance = null  (hero / decorEl card): ONE card per element; each surface checkbox
  //     ADDS/REMOVES one instance on that (tier×surface) slot. Per-slot Size/Tilt shown.
  //   • instance = the sticker (scatter card): ONE card per placed instance; the chooser MOVES
  //     that single instance between surfaces (single-select). Adding the element again is a
  //     separate click in the panel (→ its own card). No add/remove here.
  // Surfaces come from placementSlots (config-driven, allowed_zones); preview via TopperPreview.
  function elementPlacementChooser(srcEl, { instance = null } = {}) {
    if (!srcEl) return null;
    const pc = srcEl.placement_config ?? {};
    const elId = srcEl.id;
    const multiTier = design.tiers.length > 1;
    const isSideZone = z => z === ZONES.SIDE || z === ZONES.MIDDLE_TIER;
    const sameSurface = (sk, slot) =>
      slot.zone === ZONES.TOP_SURFACE ? sk.zone === ZONES.TOP_SURFACE
      // ⚠️ No tierIndex: there is ONE board. Without this branch a board slot fell through to the
      // side test below, isSideZone('board') is false, and the tile never recognised its own
      // instance — so it never ticked, and every click took the ADD path instead of the remove one.
      // Clicking three times put three footballs on the board.
      : slot.zone === ZONES.BOARD     ? sk.zone === ZONES.BOARD
      : slot.zone === ZONES.RIM       ? sk.zone === ZONES.RIM && sk.tierIndex === slot.tierIndex
      : isSideZone(sk.zone) && sk.tierIndex === slot.tierIndex;
    // A zone that offers two poses gets a tile EACH, so the tick has to say which pose is on — the
    // surface alone would light both. Where a zone offers one pose the mode is not compared at all:
    // an instance placed before the element gained a second pose carries whatever it carries, and
    // matching on it would show a placed element as unplaced.
    const onSlot = (sk, slot) =>
      sameSurface(sk, slot) && (!slot.poseChoice || sk.placementMode === slot.mode);
    // How the element sits on a slot comes ENTIRELY from config (placement_config[zone]) — never a
    // hardcoded per-zone default (INVARIANTS #1). Position is just the seat point on that surface.
    const seatOnSlot = slot => {
      let baseY = 0.1;
      for (let i = 0; i < slot.tierIndex; i++) baseY += (canvasConfig.tiers[i]?.height ?? BOTTOM_H);
      const tierH = canvasConfig.tiers[slot.tierIndex]?.height ?? BOTTOM_H;
      // Mode via zoneMode (never the raw value) so the { mode, seat } object form doesn't leak into
      // placementMode / edgeSeatSeed — INVARIANTS #1.
      // The TILE's pose, not the zone default — picking "Top hugging" has to seat it hugging.
      // Flat surfaces are stood on, never hugged — see flatPose.
      const mode = flatPose(slot.zone, slot.mode ?? zoneMode(pc, slot.zone, 'hug'));
      // Rim: seed the front-edge seat + lean via the SAME helper addSticker uses, so the move path
      // (updateSticker) lands identically to the add path. Non-edge rim modes get a bare edge point.
      let pos;
      if (slot.zone === ZONES.RIM) {
        const shp = tierShape(design.tiers[slot.tierIndex] ?? design.tiers[0]);
        const seed = edgeSeatSeed(pc, shp, mode);
        pos = seed
          ? { x: seed.x, z: seed.z, tiltAngle: seed.tiltAngle, yOffset: seed.yOffset }
          : { x: 0, z: (shp.kind === 'rect' ? shp.halfD : shp.radius) };
      } else if (slot.zone === ZONES.TOP_SURFACE) {
        pos = { x: 0, z: 0 };
      } else if (slot.zone === ZONES.BOARD) {
        /* Board: seat it on the drum, in FRONT of the cake.
         *
         * ⚠️ Without this branch a board slot fell through to the `else` below and got a SIDE seat
         * (theta + a mid-wall height) — a decoration meant to stand on the board, hung on the wall.
         *
         * (0,0) is the cake's centre and boardRingClamp answers exactly this question: it has no
         * outward direction to push, so it sends the point to the front of the ring, which is where
         * a board decoration is always visible and most likely wanted. The same call the drag uses,
         * so the seat and every later move agree by construction. */
        const bt = canvasConfig.tiers[0];
        const board = bt ? boardOf(bt) : null;
        const boardShp = board && (board.kind === 'rect'
          ? { kind: 'rect', halfW: board.halfW, halfD: board.halfD }
          : { kind: 'round', radius: board.radius });
        const seat = boardShp
          ? boardRingClamp(boardShp, tierShape(design.tiers[0] ?? {}), 0, 0)
          : { x: 0, z: 0 };
        pos = { x: seat.x, z: seat.z };
      } else {
        pos = { theta: 0, y: baseY + tierH * 0.45 };
      }
      // Insert modifier (top or side): if the target zone carries an `insert` modifier, re-bake the
      // lean/fan/depth via the SAME helper the add path uses, so a moved insert doesn't lose its angle
      // (the reset below zeroes tiltAngle/rollAngle/rotation). Composes with the zone's pose (`mode`).
      const zi = zoneInsert(pc, slot.zone);
      if (zi) {
        const s = insertSeat(zi);
        pos = { ...pos, tiltAngle: s.tiltAngle, rotation: s.fanYaw, insertDepth: s.depthFrac };
      }
      return { mode, pos };
    };
    // One tile per zone × POSE. A jersey that stands or lies on the top gets two previews of the
    // real thing (TopperPreview renders from `mode`), so the choice is made the same way the surface
    // is — not by a separate control the customer has to find afterwards. Single-pose zones expand to
    // exactly one tile, which is what every element today already produces.
    const slots = placementSlots(srcEl, design.tiers.length).flatMap(slot => {
      const poses = zoneModes(pc, slot.zone, 'hug');
      return poses.map(mode => ({ ...slot, mode, poseChoice: poses.length > 1 }));
    }).map(slot => {
      const label = slot.zone === ZONES.RIM
          ? (multiTier ? `${TIER_LABELS[slot.tierIndex] ?? `Tier ${slot.tierIndex + 1}`} edge` : 'Edge')
        // ⚠️ Before `placement`, not after. A board slot carries placement 'top' ON PURPOSE — it
        // stands on a flat surface and reuses the whole top-surface seat/drag/renderer — so a label
        // read off `placement` called it "Top" and the panel showed two tiles both named Top.
        // Zone is what the baker is choosing; placement is how it is drawn.
        : slot.zone === ZONES.BOARD ? 'Board'
        : slot.placement === 'top' ? 'Top'
        : (multiTier ? `${TIER_LABELS[slot.tierIndex] ?? `Tier ${slot.tierIndex + 1}`} side` : 'Side');
      const checked = instance
        ? onSlot(instance, slot)
        : !!design.stickers.find(s => s.elementId === elId && onSlot(s, slot));
      // Per-slot Size/Tilt only in hero mode (scatter keeps its own controls below the chooser).
      const sticker = !instance ? design.stickers.find(s => s.elementId === elId && onSlot(s, slot)) : null;
      // Drives the preview's orientation (stand vs hug), straight from config — matches the renderer.
      // Resolve via zoneMode (never the raw value) so the { mode, … } object form and the legacy
      // `insert` position both surface as their upright pose (TopperPreview keys upright off 'stand').
      // scaleRange caps the stand-slot Size dial from config (placement_config.scale); hug uses hugMul.
      const POSE_LABEL = { stand: 'standing', hug: 'hugging', perch: 'perched', verge: 'over edge' };
      return { ...slot,
        key:   slot.poseChoice ? `${slot.key}-${slot.mode}` : slot.key,
        label: slot.poseChoice ? `${label} ${POSE_LABEL[slot.mode] ?? slot.mode}` : label,
        checked, sticker, scaleRange: scaleRangeOf(srcEl, 0.5, 8, 0.1) };
    });
    const onToggle = slot => {
      if (instance) {
        // Scatter: move THIS instance to the picked surface (single-select; can't unplace here).
        if (onSlot(instance, slot)) return;
        const { pos } = seatOnSlot(slot);
        // Re-seat IDENTICALLY to a fresh add for the target zone (INVARIANTS #1/#3): derive the
        // config-driven seat fields (placementMode via zoneMode, sideProud via zoneSeat — the same
        // zoneSeatFields the add path uses) and clear the previous zone's seed fields so nothing
        // leaks across. Without the sideProud re-derive, moving a proud element off the wall and back
        // left it flush/buried; without the reset, a verge lean/height-nudge stuck to the side seat.
        // `pos` re-seeds only the fields the new zone needs.
        updateSticker(instance.id, {
          zone: slot.zone, tierIndex: slot.tierIndex,
          ...zoneSeatFields(pc, slot.zone, slot.mode),
          x: 0, z: 0, tiltAngle: 0, rollAngle: 0, yOffset: 0, radialOffset: 0, rotation: 0, insertDepth: null,
          ...pos,
        });
        return;
      }
      /* ⚠️ ONE INSTANCE, ONE ZONE.
       *
       * This card used to treat every slot independently: ticking Top and then Board gave you TWO
       * footballs, one on each. That reads as a bug even when the tick state is right — the card is
       * headed by a single element with a single Size, a single colour and one Remove, so a baker
       * ticking a second zone means "put it there instead", not "give me another one".
       *
       * Wanting a ball on the top AND the board is two decorations, and is expressed by adding the
       * element twice. Same rule the scatter path above already follows for a selected instance.
       *
       * MOVE rather than remove-and-re-add: re-adding would seat the replacement back at the centre
       * of the new surface and throw away the position the customer dragged it to. */
      const elsewhere = !slot.checked
        && design.stickers.find(s => s.elementId === elId && !onSlot(s, slot));
      if (elsewhere) {
        const { pos } = seatOnSlot(slot);
        updateSticker(elsewhere.id, {
          zone: slot.zone, tierIndex: slot.tierIndex,
          ...zoneSeatFields(pc, slot.zone, slot.mode),
          x: 0, z: 0, tiltAngle: 0, rollAngle: 0, yOffset: 0, radialOffset: 0, rotation: 0, insertDepth: null,
          ...pos,
        });
        return;
      }
      // Hero: add/remove one instance on the slot.
      if (slot.checked) {
        design.stickers.filter(s => s.elementId === elId && onSlot(s, slot)).forEach(s => removeSticker(s.id));
      } else {
        // Two poses are two tiles but ONE surface. Picking the other pose for a surface that is
        // already occupied RE-POSES what is there rather than stacking a second copy on it — and
        // re-posing keeps the position the customer dragged it to, which remove-and-re-add would
        // throw away by seating the replacement back at the centre.
        const here = slot.poseChoice
          ? design.stickers.find(s => s.elementId === elId && sameSurface(s, slot))
          : null;
        if (here) { setStickerPose(here, slot.mode); return; }
        const { mode, pos } = seatOnSlot(slot);
        addSticker(srcEl, slot.zone, slot.tierIndex, mode, pos);
      }
    };
    return (
      <PlacementChooser key="place" previewUrl={srcEl.image_url} tiers={canvasConfig.tiers}
        baseRotation={facingOffsetRadians(pc)} slots={slots} locked={false}
        // Read from the ELEMENT, so an admin change reaches decorations already on cakes — the rule
        // isStickerMovable already follows for `move`, rather than a snapshot taken at placement.
        // resize is OPT-IN (absent ⇒ off); tilt defaults ON, matching the placement path's defaults.
        canResize={srcEl.allowed_actions?.resize === true}
        canTilt={srcEl.allowed_actions?.tilt !== false}
        onToggle={onToggle} onUpdate={updateSticker} />
    );
  }

  // Photo-cake frames get their image from Uploads (setFramePhotoFor -> UploadsPanel), which is
  // ALSO where a new one is uploaded. There is deliberately no upload path here any more: a second
  // one would drift from the first, and the old straight-to-frame input uploaded the same photo again
  // for every frame that used it — a duplicate R2 object per use, and a baker who already had his
  // customer's photo still had to re-upload it.

  function buildToolbar(el, layout = 'strip') {
    if (!el) return null;
    const c = el.type === 'tier'    ? TIER_CAPS
            : el.type === 'decorEl' ? {}   // one card per multi-slot element; controls built below
            : el.type === 'sticker' ? (design.stickers.find(s => s.id === el.id)?.allowedActions ?? STICKER_CAPS)
            : (allowedActionsBySlug[el.type] ?? null);
    if (!c) return null;
    const groups = [];

    // A hue_regions sticker recolours PER REGION (the "Customise colours" swatches below); its single
    // `sticker.color` is ignored by the render, so the generic wheel does nothing — skip it and let the
    // per-region swatches be the only colour control. BUT only when regions actually loaded: if detection
    // returned empty (CORS taint, greyscale image) there are no swatches either, so keep the wheel rather
    // than leave the element with no colour control at all. GLB tint / opaque / saturated keep the wheel.
    const hueRegionsReplacesWheel = !!hueRegionsCfg && hueRegions.length > 0;
    if ((c.color || c.gradient) && !hueRegionsReplacesWheel) {
      groups.push({ key: 'color', divider: true, panelLabel: 'Colour', controls: [
        <button key="color"
          style={{ ...s.swatchBtn, background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 3, border: (colorOpen && !hasActiveGroup) ? '2.5px solid #6c47ff' : 'none' }}
          onClick={() => { const opening = !(colorOpen && !hasActiveGroup); closeAllPopups(); if (opening) setColorOpen(true); }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: getCurrentColor() }} />
        </button>
      ] });
    }

    // GLB Recompose — per-group colour pickers. Self-explaining: each editable part-group gets a
    // named, filled swatch ("Shoes", "Eyes", …) so the customer sees exactly which parts recolour.
    // Config-driven off the instance's `groups` (admin's `_model.groups` where editable); absent →
    // nothing renders. No element-type/slug branch. Tapping a swatch opens the shared ColorWheel for
    // that group (activeGroupKey); the render recolours every mesh whose userData.group matches.
    // Resolve the representative instance: a plain sticker is itself; a single-per-slot topper is a
    // decorEl card, so use any one of its placed instances (recolour applies to all of them).
    if (el.type === 'sticker' || el.type === 'decorEl') {
      const inst = el.type === 'sticker'
        ? design.stickers.find(s => s.id === el.id)
        : design.stickers.find(s => s.elementId === el.elementId);
      // GLB part-groups (inst.groups) OR — for a 2D `hue_regions` sticker — one group per detected colour
      // (index-keyed; default = the region's detected hex). Same swatch UI + groupColors path for both.
      // `recolor.locked` — the uploader of a custom decoration said "these colours must not change"
      // (a logo, a brand mark). The element still RENDERS in the colours they chose (groupColors is
      // seeded from recolor.group_defaults), it simply offers no swatches to change them. Config, not
      // a type branch.
      const editGroups = inst?.groups?.length
        ? inst.groups
        : (inst?.recolor?.method === 'hue_regions' && !inst.recolor.locked
            // No label: auto-detected regions have no meaningful name (unlike a GLB's "Shoes"/"Eyes"), and
            // "Colour 1/2/3" is just noise — the swatch shows the colour. Labelless → the span is skipped.
            ? hueRegions.map((r, i) => ({ key: i, default: r.hex }))
            : []);
      if (editGroups.length) {
        groups.push({ key: 'recolor-groups', divider: true, panelLabel: 'Customise colours', controls: [
          <div key="groups" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {editGroups.map(g => {
              const cur = inst?.groupColors?.[g.key] ?? g.default ?? '#ffffff';
              const on = colorOpen && activeGroupKey === g.key;
              return (
                <div key={g.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: g.label ? 54 : 'auto' }}>
                  <button
                    style={{ ...s.swatchBtn, padding: 3, border: on ? '2.5px solid #6c47ff' : '1px solid #cdccd3' }}
                    onClick={() => { const opening = !on; closeAllPopups(); if (opening) { setActiveGroupKey(g.key); setColorOpen(true); } }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: cur }} />
                  </button>
                  {g.label && <span style={{ fontSize: 9, fontWeight: 700, color: on ? '#1a1a1a' : '#8a7a80', textAlign: 'center', lineHeight: 1.1, fontFamily: "'Quicksand',sans-serif" }}>{g.label}</span>}
                </div>
              );
            })}
          </div>,
          <div key="hint" style={{ fontSize: 9, color: '#8a7a80', marginTop: 4, fontFamily: "'Quicksand',sans-serif" }}>Tap a colour to change it</div>,
        ] });
      }
    }

    if (c.fontSize && el.type === 'text') {
      const fs = selectedText?.fontSize ?? 0.2;
      groups.push({ key: 'fs', divider: true, panelLabel: 'Size', controls: [
        <button key="fs-" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.max(0.10, +((fs) - 0.03).toFixed(2)) })}>−</button>,
        <span key="fs-val" style={s.tbSizeLabel}>{Math.round(fs * 100)}</span>,
        <button key="fs+" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.min(0.45, +((fs) + 0.03).toFixed(2)) })}>+</button>,
      ] });
    }

    // ── Multi-slot decor element — ONE card per element (like a cream-piping card), whose
    // chooser manages every (tier × surface) placement of it via independent add/remove
    // checkboxes; each placed slot carries its own Size + Tilt. Config-driven; no per-type code.
    if (el.type === 'decorEl') {
      const elId = el.elementId;
      groups.push({ key: 'place', divider: true, controls: [
        elementPlacementChooser(elementById.get(elId)),
      ] });
      /* ⚠️ Colour, which this card simply never offered.
       *
       * allowed_actions.color was honoured on the scatter card and nowhere here, so a single-per-slot
       * element with `color: true` had no way to be recoloured at all — five real elements today
       * (both unicorn eyes, the unicorn horn, two chocolate bars), each one something a baker would
       * obviously want to change. Not a missed gate: the control did not exist on this path.
       *
       * The wheel already understands a decorEl selection — wheelColorOf and handleColorChange both
       * have a branch for it — so this is the button that was missing, not a new colour path. */
      if (elementById.get(elId)?.allowed_actions?.color === true) {
        groups.push({ key: 'colour', divider: true, panelLabel: 'Colour', controls: [
          <button key="col"
            style={{ ...s.swatchBtn, background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 3,
                     border: colorOpen ? '2.5px solid #6c47ff' : 'none' }}
            onClick={() => {
              const opening = !colorOpen;
              closeAllPopups();
              setSelectedEl({ type: 'decorEl', elementId: elId });
              if (opening) setColorOpen(true);
            }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%',
                          background: design.stickers.find(st => st.elementId === elId)?.color ?? '#ffffff' }} />
          </button>,
        ] });
      }
      groups.push({ key: 'actions', divider: false, footer: true, controls: [
        <button key="del" style={{ ...s.tbIconBtn, color: '#e53935', fontSize: 11 }}
          onClick={() => { design.stickers.filter(s => s.elementId === elId).forEach(s => removeSticker(s.id)); clearAllSelections(); }}>
          Remove
        </button>,
      ] });
    }

    // Per-surface live preview for THIS instance — one card per placed instance (scatter), each
    // showing top/side previews and letting you MOVE this instance between them (INVARIANTS #6/#3).
    // Reuses the shared chooser in single-instance mode; instance controls stay below.
    if (el.type === 'sticker') {
      const inst = design.stickers.find(s => s.id === el.id);
      const srcEl = elementById.get(inst?.elementId);
      // Cluster-capable elements don't use the per-surface move chooser — you drag the ball to position
      // it and use the "Cluster" toggle (drop several for multiple clusters). Skip the preview chooser.
      if (!srcEl?.placement_config?.cluster) {
        const chooser = elementPlacementChooser(srcEl, { instance: inst });
        if (chooser) groups.push({ key: 'place', divider: true, controls: [chooser] });
      }
    }

    // Photo-cake frame controls — Upload + fit (zoom/pan). Gated on the instance carrying a window
    // mask (config-driven, placement_config.photo), never on element type/slug (INVARIANTS #1/#6).
    if (el.type === 'sticker') {
      const inst = design.stickers.find(s => s.id === el.id);
      if (inst?.photoMask) {
        const t = inst.photoTransform ?? { x: 0, y: 0, zoom: 1 };
        const setT = patch => updateSticker(el.id, { photoTransform: { ...t, ...patch } });
        const PAN = 0.04, clampPan = v => Math.max(-0.6, Math.min(0.6, +v.toFixed(3)));
        // ONE way to get a photo into a frame: choose from Uploads — which is also where you upload
        // a new one. Not two buttons. The old file input uploaded straight into the frame, so the same
        // photo used in a second frame (or a second design) was uploaded, stored and paid for TWICE,
        // and the baker who already has the photo his customer sent him would have had to upload it
        // again. Now every photo is picked from the one place photos live.
        const controls = [
          <button key="up" style={{ ...s.toolbarBtn, display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFramePhotoFor(el.id)}>
            {inst.photoUrl ? 'Change image' : 'Select image'}
          </button>,
        ];
        if (inst.photoUrl) {
          controls.push(
            <div key="zoom" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, width: '100%' }}>
              <span style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888' }}>Zoom</span>
              <SizeDial size={t.zoom ?? 1} min={0.5} max={4} step={0.1} onChange={v => setT({ zoom: v })} />
            </div>,
            <div key="pan" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6, width: '100%' }}>
              <span style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888' }}>Position</span>
              <button style={s.tbIconBtn} onClick={() => setT({ y: clampPan((t.y ?? 0) - PAN) })}>↑</button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={s.tbIconBtn} onClick={() => setT({ x: clampPan((t.x ?? 0) + PAN) })}>←</button>
                <button style={s.tbIconBtn} onClick={() => setT({ x: clampPan((t.x ?? 0) - PAN) })}>→</button>
              </div>
              <button style={s.tbIconBtn} onClick={() => setT({ y: clampPan((t.y ?? 0) + PAN) })}>↓</button>
            </div>,
            <div key="rot" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, width: '100%' }}>
              <span style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888' }}>Rotate</span>
              <button style={s.tbIconBtn} onClick={() => setT({ rot: (t.rot ?? 0) - 5 })}>↺</button>
              <button style={s.tbIconBtn} onClick={() => setT({ rot: (t.rot ?? 0) + 5 })}>↻</button>
            </div>,
          );
        }
        groups.push({ key: 'photo', divider: true, panelLabel: 'Photo', controls });
        // Border width — procedural ring around the photo (0 = no border). Hidden when the frame uses
        // a decorative overlay (that art IS the border). Colour comes from the shared ColorWheel group.
        if (!inst.photoOverlay) {
          const bw = inst.borderWidth ?? 0.06;
          groups.push({ key: 'border', divider: true, panelLabel: 'Border', controls: [
            <SizeDial key="bw-dial" size={bw} min={0} max={0.4} step={0.02} onChange={v => updateSticker(el.id, { borderWidth: v })} />,
          ] });
        }
      }

      // Editable text placeholders — one field per slot the artwork declares. Gated on the instance
      // carrying text_slots (config-driven, placement_config.text_slots), never on element type/slug
      // (INVARIANTS #1/#6) — exactly like the photo frame's Upload above. The value is composited into
      // the sticker's texture, so what the customer types is what renders on the cake.
      if (inst?.textSlots?.length) {
        const vals = inst.textValues ?? {};
        const setVal = (key, v) => updateSticker(el.id, { textValues: { ...vals, [key]: v } });
        groups.push({
          key: 'textslots',
          divider: true,
          panelLabel: inst.textSlots.length === 1 ? (inst.textSlots[0].label || 'Text') : 'Text',
          controls: inst.textSlots.map(sl => (
            <div key={sl.key} style={{ width: '100%', marginBottom: 6 }}>
              {inst.textSlots.length > 1 && (
                <span style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', display: 'block', marginBottom: 3 }}>
                  {sl.label || sl.key}
                </span>
              )}
              <input
                type="text"
                value={vals[sl.key] ?? ''}
                maxLength={sl.maxLen ?? 24}
                inputMode={sl.kind === 'number' ? 'numeric' : 'text'}
                placeholder={sl.label || sl.key}
                onChange={e => {
                  const raw = e.target.value;
                  // A 'number' slot takes digits only — the artwork's box is sized for them.
                  setVal(sl.key, sl.kind === 'number' ? raw.replace(/[^0-9]/g, '') : raw);
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8,
                  border: '1.5px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  textAlign: 'center',
                }}
              />
            </div>
          )),
        });
      }
    }

    if (c.resize && el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      // Same SizeDial as piping + the hero chooser — one Size control everywhere. Field, value and
      // bounds (config range, hero-hug hugMul, photo-frame cake cap) come from the ONE helper the
      // canvas resize grips also read, so the dial and a drag can never disagree.
      const ctl = sizeControlOf(sticker);
      groups.push({ key: 'sc', divider: true, panelLabel: 'Size', controls: [
        <SizeDial key="sc-dial" size={ctl?.value ?? 1} min={ctl?.min ?? 0.25} max={ctl?.max ?? 8} step={ctl?.step ?? 0.05}
          onChange={v => resizeSticker(sticker, v)} />,
      ] });
      const isGlbTop = sticker?.zone === 'top_surface' && /\.(glb|gltf)(\?|$)/i.test(sticker?.imageUrl ?? '');
      if (isGlbTop) {
        const yo = sticker?.yOffset ?? 0;
        groups.push({ key: 'ht', divider: true, panelLabel: 'Height', controls: [
          <button key="ht-dn" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.max(0, +(yo - 0.1).toFixed(2)) })}>↓</button>,
          <button key="ht-up" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.min(1.2, +(yo + 0.1).toFixed(2)) })}>↑</button>,
        ] });
      }
      // Depth (radialOffset) — side stickers only. A photo frame is a flat print that must stay
      // flush on the wall (config-gated on photoMask, like the Fold control on foldable), so it has
      // no Depth control and keeps radialOffset 0.
      const isSide = (sticker?.zone === 'side' || sticker?.zone === 'middle_tier') && !sticker?.photoMask;
      if (isSide) {
        const ro = sticker?.radialOffset ?? 0;
        groups.push({ key: 'ro', divider: true, controls: [
          <span key="ro-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Depth</span>,
          <button key="ro-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.max(0, +(ro - 0.05).toFixed(2)) })}>−</button>,
          <button key="ro+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.min(0.6, +(ro + 0.05).toFixed(2)) })}>+</button>,
        ] });
      }
      // Pose — only where the element's config offers this zone more than one (zoneHasChoice), so an
      // element with a single pose grows no control. Standing vs hugging is a RE-SEAT: see
      // setStickerPose for why yOffset/tilt/insert are cleared and x/z re-clamped.
      if (sticker && zoneHasChoice(elementById.get(sticker.elementId)?.placement_config, sticker.zone)) {
        const poses = zoneModes(elementById.get(sticker.elementId)?.placement_config, sticker.zone);
        // "Hugging", not "lying" — `hug` is the word this codebase and its authoring screens have
        // always used for an element laid against a surface, so the customer-facing label matches
        // the one everyone already says.
        const POSE_LABEL = { stand: 'Standing', hug: 'Hugging', perch: 'Perched', verge: 'Over edge' };
        groups.push({ key: 'pose', divider: true, controls: [
          <span key="pose-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Pose</span>,
          ...poses.map(m => (
            <button key={`pose-${m}`}
              style={{ ...s.tbIconBtn, width: 'auto', padding: '0 8px', fontSize: 10, fontWeight: 800,
                background: sticker.placementMode === m ? '#1a1a1a' : undefined,
                color: sticker.placementMode === m ? '#fff' : undefined }}
              onClick={() => setStickerPose(sticker, m)}>
              {POSE_LABEL[m] ?? m}
            </button>
          )),
        ] });
      }
      // (Tilt moved out below — now gated by the `tilt` capability)
      // Spin (rotation) — any decoration on the top surface. Flat mode spins it in the plane of the
      // surface and stand spins its facing; both read `sticker.rotation`, so gating this on `stand`
      // (as it was) left a hugging element rotatable by the renderer and unrotatable by the customer —
      // which only became visible once a pose could be flipped.
      if (sticker?.zone === 'top_surface') {
        const rot = sticker?.rotation ?? 0;
        groups.push({ key: 'sp', divider: true, controls: [
          <span key="sp-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Spin</span>,
          <button key="sp-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot - 0.2).toFixed(3) })}>↺</button>,
          <button key="sp+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot + 0.2).toFixed(3) })}>↻</button>,
        ] });
      }
      // Ungroup lives on the group card (renderGroupBody), not here — a grouped member only
      // reaches buildToolbar via drill-in, where the group-level action would be out of place.
    }

    // Move arrows were removed — elements are repositioned by dragging them
    // directly with the pointer, so the nudge buttons were redundant.

    // Tilt (lean) — BOTH axes, gated by the one `tilt` capability. Front/back and left/right are one
    // capability on purpose: they are the same gesture to a customer, and asking an admin to permit
    // them separately would be a distinction nobody placing a cake decoration perceives.
    if (c.tilt && el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      const ta = sticker?.tiltAngle ?? 0, ra = sticker?.rollAngle ?? 0;
      groups.push({ key: 'ta', divider: true, controls: [
        <span key="ta-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Tilt</span>,
        <button key="ta-up"    style={s.tbIconBtn} title="Lean back"    onClick={() => updateSticker(el.id, { tiltAngle: leanStep(ta, -0.1) })}>↑</button>,
        <button key="ta-down"  style={s.tbIconBtn} title="Lean forward" onClick={() => updateSticker(el.id, { tiltAngle: leanStep(ta,  0.1) })}>↓</button>,
        <button key="ta-left"  style={s.tbIconBtn} title="Lean left"    onClick={() => updateSticker(el.id, { rollAngle: leanStep(ra, -0.1) })}>←</button>,
        <button key="ta-right" style={s.tbIconBtn} title="Lean right"   onClick={() => updateSticker(el.id, { rollAngle: leanStep(ra,  0.1) })}>→</button>,
        <span key="ta-val" style={{ ...s.tbSizeLabel, minWidth: 46 }}>{leanDeg(ta)}/{leanDeg(ra)}</span>,
      ] });
    }

    // Bury (insert depth) — how far an INSERTED element's base sinks INTO the cake. Config-gated on
    // the instance being inserted (`insertDepth != null` — the SAME signal the renderer's `isInsert`
    // uses in CakeCanvas.jsx), never on element type/zone/mode. ORTHOGONAL to Height (vertical float
    // on top / seat height on the wall) and the side Depth (radial off-wall nudge): those POSITION the
    // piece, Bury sinks it in — so all three legitimately co-exist on an inserted side element. Value
    // is a length-FRACTION buried (0 = flush/standing, 0.5 = half-buried), the same field the renderer
    // already reads live; `updateSticker` re-seats it with no render change. Matches the local −/+
    // stepper idiom (Height/Depth/Tilt/Fold).
    if (el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      if (sticker?.insertDepth != null) {
        const bd = sticker.insertDepth;
        groups.push({ key: 'bury', divider: true, controls: [
          <span key="bury-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Bury</span>,
          <button key="bury-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { insertDepth: Math.max(0, +(bd - 0.05).toFixed(2)) })}>−</button>,
          <span key="bury-val" style={{ ...s.tbSizeLabel, minWidth: 28 }}>{Math.round(bd * 100)}%</span>,
          <button key="bury+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { insertDepth: Math.min(0.5, +(bd + 0.05).toFixed(2)) })}>+</button>,
        ] });
      }
    }

    // Fold (wing dihedral) — a foldable sticker lets the customer adjust how far the two wings
    // hinge up. Config-gated on the instance's `foldable` (placement_config.foldable), never on
    // element type/slug; the render re-folds live via StickerTexture's createFoldedPlane.
    if (el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      if (sticker?.foldable === true) {
        const fa = sticker.fold ?? DEFAULT_FOLD_DEG;
        groups.push({ key: 'fold', divider: true, controls: [
          <span key="fold-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Fold</span>,
          <button key="fold-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { fold: Math.max(0, Math.round(fa - 5)) })}>−</button>,
          <span key="fold-val" style={{ ...s.tbSizeLabel, minWidth: 28 }}>{Math.round(fa)}°</span>,
          <button key="fold+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { fold: Math.min(75, Math.round(fa + 5)) })}>+</button>,
        ] });
      }
    }

    // Cluster-capable element (placement_config.cluster): a per-card toggle turns this single ball into
    // a packed clump (and the cluster card toggles it back). Config-driven, never element-type.
    if (el.type === 'sticker') {
      const sticker = design.stickers.find(stkr => stkr.id === el.id);
      const srcEl = sticker && elementById.get(sticker.elementId);
      if (sticker && !sticker.clusterId && srcEl?.placement_config?.cluster) {
        // Finish: same metallic→matte slider as the cluster card, on the single ball (config-gated on
        // cluster capability, never element type). Writes the derived material straight to the instance.
        groups.push({ key: 'finish', divider: true, panelLabel: 'Finish', controls:
          finishSliderControls(sticker.metalness, mat => updateSticker(sticker.id, mat)) });
        groups.push({ key: 'cluster-toggle', divider: true, controls: [
          <button key="cl-on" style={{ ...s.toolbarBtn, width: '100%', background: '#1a1a1a', color: '#fff', padding: '8px 10px', fontSize: 12 }} onClick={() => makeCluster(sticker)}>Create cluster</button>,
        ] });
      }
    }


    // Trailing actions (duplicate / remove / done) — no dividers between them in
    // the strip; rendered as a footer row in the panel.
    const actions = [];
    if (c.duplicate && el.type === 'text') {
      actions.push(
        <button key="dup" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateText(el.id); setSelectedEl(null); }}>Duplicate</button>
      );
    }
    if (c.duplicate && el.type === 'sticker') {
      const sticker = design.stickers.find(s => s.id === el.id);
      if (!sticker?.groupId) {
        actions.push(
          <button key="dup-sticker" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateSticker(el.id); clearAllSelections(); }}>Duplicate</button>
        );
      }
    }
    // A grouped member can't be deleted on its own — the group is a lock. Ungroup (on the group
    // card) to delete a single piece; the group card's own "Remove group" deletes them all.
    const groupedMember = el.type === 'sticker' && !!design.stickers.find(s => s.id === el.id)?.groupId;
    /* ⚠️ NOT gated on `delete`. Every decoration comes off the cake.
     *
     * allowed_actions.delete used to pin an element: no Remove in the toolbar, no "Remove all" on the
     * card, and a locked tile in the chooser. Three of those four agreed; the single-per-slot card's
     * own Remove button never checked it, so a "non-deletable" element was removable there anyway —
     * which is how the inconsistency surfaced.
     *
     * The rule is the simpler one: a baker can always take a decoration off their own cake. An
     * element that cannot be removed is not a protected element, it is a cake nobody can fix — and
     * the half-honoured version was worse still, since whether it held depended on which panel you
     * happened to use.
     *
     * The flag is now inert everywhere. It should come off the admin form too, or it is dead config
     * that reads as a promise. */
    /* ⚠️ …and not for a decorEl card, which pushes its OWN Remove a few dozen lines up.
     *
     * This was masked before: caps for a decorEl selection carry no `delete`, so the old
     * `c.delete && …` was falsy here and the duplicate never appeared. Dropping the capability check
     * without this exclusion put TWO Remove buttons on the single-per-slot card — a real regression,
     * caught by looking at the panel rather than by the build or the suite. */
    if (!groupedMember && el.type !== 'decorEl') {
      const label = selectedStickerIds.size > 1 ? 'Remove all' : 'Remove';
      actions.push(
        <button key="del" style={{ ...s.tbIconBtn, color: '#e53935', fontSize: 11 }} onClick={handleDelete}>{label}</button>
      );
    }
    if (actions.length) groups.push({ key: 'actions', divider: false, footer: true, controls: actions });

    // Cluster element: the prominent "drag another ball" handle sits at the TOP of the card (above the
    // controls), so the drag-to-place affordance is the first thing and bigger than the controls below.
    if (el.type === 'sticker') {
      const stk = design.stickers.find(stkr => stkr.id === el.id);
      const cEl = stk && elementById.get(stk.elementId);
      if (cEl?.placement_config?.cluster) {
        groups.unshift({ key: 'cluster-add', divider: false, controls: [
          <div key="cl-add" style={{ width: '100%' }}>{clusterAddHandle(cEl)}</div>,
        ] });
      }
    }

    // Vertical right-side popup — consistent with the cream-piping popup.
    if (layout === 'panel') {
      return (
        <div style={s.editPanelGroups}>
          {groups.map(g => (
            <div key={g.key} style={g.footer ? s.editPanelFooter : s.editPanelRow}>
              {g.panelLabel && <span style={s.editPanelLabel}>{g.panelLabel}</span>}
              {/* minWidth:0 lets wide children (e.g. a <canvas>, whose intrinsic width is
                  300px) shrink to the column instead of overflowing the popup. */}
              <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', flex:1, minWidth: 0 }}>{g.controls}</div>
            </div>
          ))}
        </div>
      );
    }

    // Horizontal floating strip — flatten groups, dividing the editing groups.
    const items = [];
    groups.forEach(g => {
      items.push(...g.controls);
      if (g.divider) items.push(<div key={`gd-${g.key}`} style={s.tbDivider} />);
    });
    return <div style={s.textToolbar}>{items}</div>;
  }

  // The typed-cream "Texts" editor, rendered as the expanded body of the writing card
  // in the unified element stack (it used to live in the tools drawer). The colour
  // picker drops in inline; "Remove writing" deletes the element and closes its card.
  function renderWritingEditor() {
    const w = activeWriting ?? {};
    const isMultiline = (w.text ?? '').includes('\n');
    const surface = w.surface ?? 'top';
    const SURFACES = [{ k: 'top', label: 'Top' }, { k: 'side', label: 'Side' }, { k: 'board', label: 'Board' }];
    return (
      <>
        <div style={{ display: 'flex', gap: 4, background: '#f6eef1', borderRadius: 9, padding: 3, flexShrink: 0 }}>
          {SURFACES.map(sf => (
            <button key={sf.k} onClick={() => setWriting({ surface: sf.k })}
              style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                background: surface === sf.k ? '#1a1a1a' : 'transparent', color: surface === sf.k ? '#fff' : '#1a1a1a' }}>
              {sf.label}
            </button>
          ))}
        </div>

        <textarea
          value={w.text ?? ''}
          onChange={e => setWriting({ text: e.target.value })}
          placeholder={'Type a message…\n(Enter for a new line)'}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 15, fontWeight: 700, color: '#444',
            border: '1.5px solid #999999', borderRadius: 10, outline: 'none', background: '#ffffff', fontFamily: "'Quicksand', sans-serif",
            flexShrink: 0, resize: 'vertical', lineHeight: 1.4, minHeight: 80,
            textTransform: w.uppercase ? 'uppercase' : 'none' }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
          <button type="button" role="switch" aria-checked={!!w.uppercase}
            onClick={() => setWriting({ uppercase: !w.uppercase })}
            style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
              background: w.uppercase ? '#1a1a1a' : '#e3d4da', transition: 'background .15s' }}>
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

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>Colour</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexShrink: 0, padding: '2px 0' }}>
          {[
            { k: 'colour', label: 'Colour',
              ring: (w.finish ?? 'cream') === 'cream',
              swatch: 'conic-gradient(from 90deg,#ff5b5b,#ffd24d,#5bff8a,#4dd2ff,#9b6bff,#ff5bd2,#ff5b5b)',
              onClick: () => { setWriting({ finish: 'cream' }); setWritingColorOpen(o => !o); } },
            { k: 'gold', label: 'Gold',
              ring: w.finish === 'gold',
              swatch: 'linear-gradient(135deg,#f7e29a 0%,#caa12f 45%,#8a6b14 100%)',
              onClick: () => { setWriting({ finish: 'gold' }); setWritingColorOpen(false); } },
            { k: 'silver', label: 'Silver',
              ring: w.finish === 'silver',
              swatch: 'linear-gradient(135deg,#fbfcfd 0%,#c2c8cf 45%,#8b9097 100%)',
              onClick: () => { setWriting({ finish: 'silver' }); setWritingColorOpen(false); } },
          ].map(c => (
            <button key={c.k} onClick={c.onClick} title={c.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: c.swatch,
                border: c.ring ? '3px solid #1a1a1a' : '2px solid #e7d6dc',
                boxShadow: c.ring ? '0 0 0 2px #fff inset, 0 1px 3px rgba(0,0,0,0.18)' : '0 1px 2px rgba(0,0,0,0.12)' }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: c.ring ? '#1a1a1a' : '#999' }}>{c.label}</span>
            </button>
          ))}
        </div>

        {writingColorOpen && (
          <WritingColourPicker writing={w} design={design} setWriting={setWriting} width={152} />
        )}

        {/* ── Draw or slide ────────────────────────────────────────────────────────────────────
            One pen, two gestures, and a drag cannot mean both — pressing a placed line to move it and
            pressing the cake to draw over it are the same press. So it is a mode, said out loud,
            rather than a modifier key nobody would find on a phone.
            Sliding moves the WHOLE stroke and keeps its shape: it is the unit you drew, and the unit
            a ring already is. Until this, a border a few millimetres too low cost you the whole line.
        */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {[['Draw', false], ['Move', true]].map(([label, val]) => (
            <button key={label} onClick={() => setPenMove(val)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                       border: `1.5px solid ${penMove === val ? '#2C4433' : '#999999'}`,
                       background: penMove === val ? '#2C4433' : '#fff',
                       color: penMove === val ? '#fff' : '#1a1a1a',
                       fontWeight: 800, fontSize: 11, fontFamily: "'Quicksand',sans-serif" }}>
              {label}
            </button>
          ))}
        </div>
        {penMove && (
          <div style={{ fontSize: 9.5, fontWeight: 600, color: '#b29aa2', lineHeight: 1.4, marginTop: 5 }}>
            Drag a piped line to slide it. It keeps its shape and stays on the cake.
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>Adjust</div>
        <PenSlider label="Thickness" value={w.thickness ?? 0.03} min={0.008} max={0.07} step={0.002} onChange={v => setWriting({ thickness: v })} fmt={v => v.toFixed(3)} />
        <PenSlider label="Size"      value={w.fit ?? 0.8}        min={0.3}   max={0.95} step={0.05}  onChange={v => setWriting({ fit: v })}       fmt={v => `${Math.round(v * 100)}%`} />
        <PenSlider label="Spacing"   value={w.letterSpacing ?? 0} min={0}     max={0.6}  step={0.02}  onChange={v => setWriting({ letterSpacing: v })} fmt={v => v === 0 ? 'normal' : `+${Math.round(v * 100)}%`} />
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
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999', background: '#fff',
              color: '#1a1a1a', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Recentre
          </button>
          <button onClick={() => { clearWriting(); clearAllSelections(); }}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999', background: '#fff', color: '#b56', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </>
    );
  }

  // Cream Pen (freehand) editor body — rendered inline as the expanded body of its stack card (like
  // renderWritingEditor / renderFoilBody), NOT in a floating popup. Dismiss = collapse the card; no ✕.
  /* A placed garnish: how it sits, how big, and away with it. Everything else about the piece —
     its shape, its fill — was decided in the studio and is not editable here, because changing it
     would change every cake that used the same saved garnish if it were ever a reference. It is not
     (each design carries its own paths), but the card should not invite the idea either. */
  function renderGarnishBody(g) {
    if (!g) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            How it sits
          </div>
          <Segmented
            label="How the garnish sits"
            items={[{ id: 'stand', label: 'Standing' }, { id: 'lie', label: 'Lying flat' }]}
            value={g.mode ?? 'stand'}
            onChange={mode => updateGarnish(g.id, { mode })}
            tone={primaryColor}
          />
        </div>

        <PenSlider label="Size" value={g.scale ?? 1} min={0.4} max={2} step={0.05}
          onChange={v => updateGarnish(g.id, { scale: v })} fmt={v => `${Math.round(v * 100)}%`} />
        <PenSlider label="Turn" value={g.yaw ?? 0} min={-Math.PI} max={Math.PI} step={0.05}
          onChange={v => updateGarnish(g.id, { yaw: v })} fmt={v => `${Math.round(v * 180 / Math.PI)}°`} />
        <PenSlider label="Shine" value={g.gloss ?? 0.9} min={0.2} max={1} step={0.05}
          onChange={v => updateGarnish(g.id, { gloss: v })} fmt={v => v.toFixed(2)} />

        <div style={{ fontSize: 10.5, color: '#999', lineHeight: 1.5 }}>
          Drag it on the cake to move it round.
        </div>

        <button onClick={() => { removeGarnish(g.id); setSelectedGarnishId(null); }}
          style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
                   border: '1.5px solid #E0C9C9', background: '#fff', color: '#A33',
                   fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800 }}>
          Remove
        </button>
      </div>
    );
  }

  function renderPenBody() {
    /* ⚠️ THE COPY FOLLOWS THE MEDIUM. The card said "Cream Pen" and "Cream colour" while piping
       chocolate — the medium reached the renderer and not a word of the interface, which is the kind
       of gap a screenshot finds and a test never will. */
    const mediumLabel = MEDIA[penStyle.medium]?.label ?? MEDIA[DEFAULT_MEDIUM].label;

    /* Fill applies to the LAST stroke: the one just drawn, which is what a baker means by "fill it
       in". Offered only when that stroke can honestly be filled — closed, and on a flat surface. A
       wall curves away and a straight pass would cut through the cake; see pipingFillOnCake.js. */
    /* ⚠️ THE LAST OUTLINE, not the last stroke. A fill adds strokes of its own, so "the last stroke"
       became a fill pass the moment one was applied — and the control, which asks whether the last
       stroke can be filled, answered no and vanished. The baker got one guess at a pattern. */
    const outlines = (design.piping ?? []).filter(s2 => !s2.fillOf);
    const last = outlines[outlines.length - 1] ?? null;
    const fillable = last && last.kind !== 'stamp' && last.kind !== 'stamprope'
      ? fillStrokeOnFlat(last.points ?? [], { thickness: last.thickness ?? 0.03 })
      : null;

    const canFillLast = !!fillable?.canFill;
    /* Why NOT, in words. "No fill button" with no explanation reads as a bug, and the two reasons
       lead to different actions: close the shape, or draw it somewhere flat. */
    /* ⚠️ A TAP HAS NO `points` — it stores a single `point` — so it reached the "on the side" message,
       which is simply untrue and sends the baker to the wrong place. Three cases, three sentences,
       and the wrong one is worse than none. */
    const lastHasPath = (last?.points?.length ?? 0) >= 4;
    const whyNotFill = !last || canFillLast ? null
      : !lastHasPath
        ? 'Draw a shape with the pen, then fill it — a single dab has no inside.'
      : fillable?.flat
        ? 'Bring the ends of a stroke together to fill it — letters and swirls are piped as drawn.'
        : 'A shape on the side of a cake cannot be filled — draw it on the top or the board.';

    function fillLastStroke(pattern) {
      if (!last) return;
      const out = fillStrokeOnFlat(last.points ?? [], {
        pattern, thickness: last.thickness ?? 0.03, seed: last.id?.length ?? 7,
      });
      /* Each continuous squeeze becomes its own stroke, which is what it is: the nozzle lifted
         between them. It also means Undo removes them one at a time, in the order they were piped —
         the same way undoing any other piping behaves. */
      setStrokeFill(last.id, out.paths.map(pts => ({ ...last, id: undefined, points: pts })), pattern);
    }

    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          {penStyle.stampUrl
            ? 'Drag on the cake and the shape repeats along your line — release to stop. Drag the empty space around it to rotate.'
            : `Drag on the cake to pipe ${mediumLabel.toLowerCase()} — release to stop. Drag the empty space around it to rotate.`}
        </div>

        {/* ── What is on the nozzle ─────────────────────────────────────────────────────────────
            Only in stamp mode, and it earns its space twice over: it NAMES what is about to be
            repeated, and it is the only way back to plain cream. penStyle keeps whatever was last
            put into it, so without this a customer who tried "I'll pipe it myself" and then wanted a
            line of cream would go on stamping shells with no way to say stop. */}
        {penStyle.stampUrl && (
          <div style={{ marginTop: 8, padding: '8px 9px', borderRadius: 9,
                        background: '#F7F5F1', border: '1.5px solid #E3E0DA' }}>
            {/* The name on its OWN line and allowed to wrap. Sharing a row with the buttons squeezed
                it to "Piping …", which told the customer nothing — the one thing this strip exists
                to say is WHAT is on the nozzle. */}
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.35, marginBottom: 7 }}>
              Piping {penStyle.stampName ?? 'a shape'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {/* The way BACK. Choosing "I'll pipe it myself" swaps the piping card for this one, and
                  without this there is no route to the zone tiles, the ring's colour or its size
                  again — the card is still in the stack but the customer has no reason to know that
                  the thing they were just looking at is the thing to reopen. */}
              {stampSourceCard && (
                <button onClick={backToPipingCard}
                  style={{ fontSize: 10, fontWeight: 700, padding: '5px 9px', borderRadius: 7,
                           border: '1.5px solid #999999', background: '#fff', color: '#1a1a1a', cursor: 'pointer',
                           fontFamily: "'Quicksand',sans-serif" }}>
                  ‹ Back to {stampSourceCard.name}
                </button>
              )}
              <button onClick={pipeWithCreamAgain}
                style={{ fontSize: 10, fontWeight: 700, padding: '5px 9px', borderRadius: 7,
                         border: '1.5px solid #999999', background: '#fff', color: '#1a1a1a', cursor: 'pointer',
                         fontFamily: "'Quicksand',sans-serif" }}>
                Cream instead
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>{mediumLabel} colour</div>
        <ColorWheel color={penStyle.color} onChange={c => setPenStyle(ps => ({ ...ps, color: c }))}
          cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== penStyle.color.toLowerCase())} width={152} />

        {/* ⚠️ ONLY WHEN IT CAN ACTUALLY BE FILLED. An open stroke has no inside and a curved wall
            cannot take a straight pass, so the control is absent rather than present-and-dead —
            and the line below says which of the two it is, because "no fill button" with no reason
            reads as a bug. */}
        {canFillLast && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                Fill the shape
              </div>
              <Segmented
                label="Fill the shape you just drew"
                items={Object.entries(FILL_PATTERNS).map(([id, f]) => ({ id, label: f.label }))}
                value={last.fillPattern ?? null}
                onChange={fillLastStroke}
                tone={penStyle.color}
              />
              <div style={{ fontSize: 10, color: '#999', marginTop: 5, lineHeight: 1.45 }}>
                Fills the shape you just drew. Undo takes it back.
              </div>
            </div>
        )}
        {whyNotFill && (
          <div style={{ fontSize: 10, color: '#999', marginTop: 10, lineHeight: 1.45 }}>{whyNotFill}</div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>Adjust</div>
        {/* "Size" and a wider range in stamp mode. The word first: on the pen this IS a thickness —
            how fat the rope is — but on a stamp it is how big the whole shape comes out, and calling
            that thickness invites a customer to look for the shape to get chunkier.
            The range second: the rope's 0.16 ceiling is barely above where a piped shell STARTS
            (0.144), so there was no room to make a border bigger and plenty to make it far too
            small. A stamp gets 0.04–0.34 — roughly a quarter to a little over double a ring's. */}
        {penStyle.stampUrl ? (
          <PenSlider label="Size" value={penStyle.thickness} min={0.04} max={0.34} step={0.005}
            onChange={v => setPenStyle(ps => ({ ...ps, thickness: v }))} fmt={v => v.toFixed(3)} />
        ) : (
          <PenSlider label="Thickness" value={penStyle.thickness} min={0.008} max={0.16} step={0.004} onChange={v => setPenStyle(ps => ({ ...ps, thickness: v }))} fmt={v => v.toFixed(3)} />
        )}
        {/* Softness shapes the swept ROPE and does nothing to a stamped shape — the stamp path never
            reads it. Shown for cream, hidden for a stamp, because a slider that moves and changes
            nothing is worse than one that is missing.

            Spacing replaces it, and it is the control piping actually turns on: how tightly the
            repeats sit. 0.55 is shells crowding each other, 1.4 is a dotted run. It has lived in
            penStyle since the pen was built with nothing to set it. */}
        {penStyle.stampUrl ? (<>
          <PenSlider label="Spacing" value={penStyle.spacing ?? 0.85} min={0.5} max={1.6} step={0.05}
            onChange={v => setPenStyle(ps => ({ ...ps, spacing: v }))} fmt={v => v.toFixed(2)} />
          {/* ── Lean ──────────────────────────────────────────────────────────────────────────────
              A calibrated ring rotation carries a big outward TILT — the shipped shell border is
              -68° — because a rim shell hangs over the cake's edge. Reproduced in the middle of a
              flat top it simply lays the piece down, so hand-piping stands the piece up and starts
              this at zero.
              It is a control rather than a constant because the decomposition behind it is read off
              the renderer, not proven: local X is tangential so a rotation about it is the lean, and
              if a particular model wants some of that back, this is how it gets it. */}
          <PenSlider label="Lean" value={penStyle.stampLean ?? 0} min={-80} max={80} step={2}
            onChange={v => setPenStyle(ps => ({ ...ps, stampLean: v }))} fmt={v => `${v}°`} />
        </>) : (
          <PenSlider label="Softness"  value={penStyle.softness}  min={0}     max={1}    step={0.05}  onChange={v => setPenStyle(ps => ({ ...ps, softness: v }))}  fmt={v => v.toFixed(2)} />
        )}

        {/* ── Auto-correct shape ───────────────────────────────────────────────────────────────
            Nobody draws a clean border with a mouse. A run round the rim comes out wobbling, and the
            wobble is the difference between a piped cake and a dragged mouse — a real baker's hand
            is steadied by the turntable and the cake's own edge, and this is the equivalent.
            It only ever snaps to a circle about the cake's axis or to a straight line, and only when
            the drawing is clearly one of those. A heart, a name, a deliberate squiggle come back
            exactly as drawn — guessing wrong destroys work, so the bar is high and the fallback is
            always "leave it alone". Applied when the stroke is COMMITTED, so what is saved is what
            is meant. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={penStyle.autoShape ?? false}
            onChange={e => setPenStyle(ps => ({ ...ps, autoShape: e.target.checked }))}
            style={{ width: 15, height: 15, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1a1a1a' }}>Auto-correct shape</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: '#b29aa2', lineHeight: 1.35 }}>
              Tidies a rim border into a true circle, and a near-straight run into a straight one.
            </span>
          </span>
        </label>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b8c74', marginTop: 10 }}>
          {design.piping.length} stroke{design.piping.length === 1 ? '' : 's'}
        </div>

        {/* ── Turning the cake while the pen is out ──────────────────────────────────────────────
            Drag-to-rotate still works on empty background, and stops being reachable exactly when it
            matters: with the pen out a drag on the CAKE draws, so reaching the far side means finding
            bare canvas — which on a phone, or with a cake that fills the frame, is barely there.
            A third of a turn a press: enough to bring the other side round in three, small enough to
            keep your bearings. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>
            Turn the cake
          </span>
          {[['↺', -1], ['↻', 1]].map(([glyph, dir]) => (
            <button key={dir} onClick={() => turnCameraRef.current?.(dir * Math.PI / 3)}
              title={dir < 0 ? 'Turn left' : 'Turn right'}
              style={{ width: 34, height: 30, borderRadius: 8, border: '1.5px solid #999999',
                       background: '#fff', color: '#1a1a1a', fontSize: 15, cursor: 'pointer',
                       fontFamily: "'Quicksand',sans-serif", lineHeight: 1 }}>
              {glyph}
            </button>
          ))}
        </div>

        {/* ── Done ────────────────────────────────────────────────────────────────────────────────
            Piping is not one stroke. A baker pipes a border, then a line down the side, then a few
            flourishes on top — and until now the only way to stop was to go and click something
            else, which meant every exit was an accident. Draw mode stays on across as many strokes
            as you like and ends when you SAY it ends.

            It doubles as the answer to "how do I get out of this": with a nozzle for a cursor and
            drags landing cream instead of rotating the cake, a visible way out is not a nicety. */}
        <button onClick={() => selectExclusive(null)}
          style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 8, border: 'none',
                   background: '#2C4433', color: '#fff', fontWeight: 800, fontSize: 12,
                   cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
          Done piping
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={removeStroke} disabled={!design.piping.length}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999', background: '#fff', fontWeight: 700, fontSize: 12,
              color: design.piping.length ? '#1a1a1a' : '#ccc', cursor: design.piping.length ? 'pointer' : 'not-allowed' }}>
            ↶ Undo
          </button>
          <button onClick={clearPiping} disabled={!design.piping.length}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999', background: '#fff', fontWeight: 700, fontSize: 12,
              color: design.piping.length ? '#b56' : '#ccc', cursor: design.piping.length ? 'pointer' : 'not-allowed' }}>
            Clear all
          </button>
        </div>
      </>
    );
  }

  // Letter-blocks editor body.
  function renderBlocksBody() {
    if (!nb) return null;
    // The colours already on this cake, minus the one currently chosen — the same list the cream
    // pen and the writing wheel offer, from the same collector.
    const blockCakeColors = (current) =>
      [...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== String(current).toLowerCase());
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          One cube per letter. Drag any of them on the cake to move it.
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Name</div>
          {/* Capped at 12: past that a run wraps most of the way round a small cake and the letters
              start to collide. The cap is on the INPUT so nobody types a name that cannot be laid. */}
          <input value={nb.text ?? ''} onChange={e => setBlocksText(e.target.value.slice(0, 12))}
            placeholder="EMILY"
            style={{ width: '100%', padding: '8px 10px', fontSize: 14, fontWeight: 700, textTransform: 'uppercase',
              border: '1.5px solid #999999', borderRadius: 8, fontFamily: "'Quicksand',sans-serif", boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Where</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['On the board', 'board'], ['On top', 'top']].map(([label, z]) => (
              <button key={z} onClick={() => { if (nb.zone !== z) setBlocksZone(z); }}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  border: '1.5px solid #999999', background: nb.zone === z ? '#1a1a1a' : '#fff', color: nb.zone === z ? '#fff' : '#1a1a1a' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {/* Size re-lays the run: bigger cubes need more room, and leaving them at the old spacing
              would overlap them. A baker who has arranged blocks by hand should set size first. */}
          <PenSlider label="Block size" value={nb.size ?? NAME_BLOCK_DEFAULTS.size} min={0.16} max={0.5} step={0.01}
            onChange={v => updateNameBlocks(cur => ({ size: v, blocks: layoutBlocks(cur.text, cur.zone, { ...cur, size: v }) }))}
            fmt={v => v.toFixed(2)} />
        </div>

        {/* ColorWheel, like every other colour on the cake — INVARIANTS #3. The first version of
            this card grew its own square swatches plus a native <input type="color">, which is a
            second answer to a question the designer already answers, and it looked like one. The
            wheel also brings what a hand-rolled row does not: colours already ON this cake
            (cakeColors), so a name can be matched to a border without eyedropping it. */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Block colour</div>
        <ColorWheel color={nb.blockColor ?? NAME_BLOCK_DEFAULTS.blockColor}
          onChange={c => updateNameBlocks({ blockColor: c })}
          cakeColors={blockCakeColors(nb.blockColor ?? NAME_BLOCK_DEFAULTS.blockColor)} width={152} />

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Letter colour</div>
        <ColorWheel color={nb.letterColor ?? NAME_BLOCK_DEFAULTS.letterColor}
          onChange={c => updateNameBlocks({ letterColor: c })}
          cakeColors={blockCakeColors(nb.letterColor ?? NAME_BLOCK_DEFAULTS.letterColor)} width={152} />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {/* The way back from an arrangement gone wrong — without retyping the name. */}
          <button onClick={realignBlocks}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999',
              background: '#fff', fontWeight: 700, fontSize: 12, color: '#1a1a1a', cursor: 'pointer' }}>
            Line them up
          </button>
          <button onClick={removeNameBlocks}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999',
              background: '#fff', fontWeight: 700, fontSize: 12, color: '#b56', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </>
    );
  }

  // Cloud editor body — the inline expanded body of ONE cloud's stack card.
  //
  // A customer gets the KIND, the size, how many balls, and the colour. Not the studio's ten: the
  // taper, the variation, the nestle and the bevel are what make a bunch of balls read as fondant at
  // all, and they were tuned once against the references. And no position control — clouds are
  // dragged, several to a cake.
  function renderCloudBody(card) {
    const cl = design.tiers[card.tierIndex]?.clouds?.find(c => c.id === card.id);
    if (!cl) return null;
    const set = changes => updateTierClouds(card.tierIndex, cur =>
      cur.map(c => (c.id === cl.id ? { ...c, ...changes } : c)));

    // The two kinds are different OBJECTS, not one at two sizes — balls pressed together against a
    // single piece cut with a knife — so each tile carries its whole shape, the way the rainbow's
    // tiles do. Rows come with it: a cut piece is rolled out flat, so stacking it would describe
    // something else entirely.
    const KINDS = [
      { key: 'puff', label: 'Puffy', p: { variant: 'puff', rows: 2, taper: 0.2 } },
      // "Flat", not "Cut-out". Cut-out is a MAKER'S word — it describes how the thing is made, and
      // a customer has never thought about a cloud being cut. What they can see is that one is
      // puffy and one is flat, which is the whole difference in one word each.
      { key: 'flat', label: 'Flat', p: { variant: 'flat', rows: 1, taper: 0.45 } },
    ];
    const WHERE = [
      { key: 'top', label: 'On top', p: { surface: 'top', standoff: 0.45 } },
      { key: 'board', label: 'On the board', p: { surface: 'board' } },
      { key: 'side', label: 'On the wall', p: { surface: 'side', variant: 'flat', rows: 1 } },
    ];

    const group = (title, items, isOn, onPick) => (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {items.map(it => (
            <button key={it.key} onClick={() => onPick(it)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
                border: '1.5px solid #999999', background: isOn(it) ? '#1a1a1a' : '#fff',
                color: isOn(it) ? '#fff' : '#1a1a1a' }}>
              {it.label}
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          Drag it on the cake to move it round.
        </div>

        {group('Kind', KINDS, it => (cl.variant ?? 'puff') === it.key, it => set(it.p))}
        {/* A cloud pressed on a wall is a cut piece — a bunch of balls does not press flat — so
            picking the wall picks the kind with it rather than leaving an impossible pair. */}
        {group('Where it goes', WHERE, it => (cl.surface ?? 'top') === it.key, it => set(it.p))}

        {[
          ['Size',         'scale',  0.4, 2.0, 0.05, true],
          ['Balls across', 'lobes',  2,   6,   1,    true],
          ['Width',        'width',  0.2, 0.9, 0.02, true],
          ['Height',       'height', 0.1, 0.5, 0.02, true],
        ].map(([label, key, min, max, step]) => (
          <div key={key} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <input type="range" min={min} max={max} step={step}
              value={cl[key] ?? CLOUD_DEFAULTS[key]}
              onChange={e => set({ [key]: parseFloat(e.target.value) })}
              style={{ width: '100%' }} />
          </div>
        ))}

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Colour</div>
          {/* One colour, not one per ball. A cloud is one piece of fondant however many balls went
              into it — the rainbow's row of swatches is right because its ropes ARE different
              colours, and copying that here would offer a choice nobody makes. */}
          <input type="color" value={cl.color ?? CLOUD_DEFAULTS.color}
            onChange={e => set({ color: e.target.value })}
            style={{ width: 40, height: 28, border: '1px solid #D9D5CE', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button onClick={() => removeCloud(card.tierIndex, cl.id)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999',
              background: '#fff', fontWeight: 700, fontSize: 12, color: '#b56', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </>
    );
  }

  // Rainbow editor body — the inline expanded body of ONE rainbow's stack card.
  //
  // One card per rainbow, like the writing cards and for the same reason: each carries its own
  // arrangement and its own place on the cake, so a single shared card could only ever edit one of
  // them and would silently be the wrong one.
  //
  // WHAT A CUSTOMER GETS, and what they do not.
  //
  // Where it goes, size, how many ropes, how fat, how flat, and the colours. Those are the things a
  // cake legitimately differs BY — a six-rope pastel arch and a three-rope bold one are the same
  // geometry and a different cake.
  //
  // `innerRadius` is held back: the hole under the arch is the one number that decides whether the
  // thing reads as a rainbow at all. A tight hole under fat ropes is what makes the stack reach past
  // the cake; widen it and you get a shallow hoop that can only clear the cake by standing back.
  // That was tuned once against the references and is not a per-cake choice.
  //
  // `spring` is on the WALL only. A foot resting on the cake pins the springing point, so in the
  // three over-the-cake arrangements the slider provably does nothing — measured, not assumed:
  // archY is identical at 0.2 and 1.0 in all three. On the wall it is the control that matters, and
  // it is the only place it is live. A slider that does nothing is worse than an absent one.
  //
  // And no position control: where it stands is dragged, which is the whole reason the handle
  // exists.
  function renderRainbowBody(card) {
    const rb = design.tiers[card.tierIndex]?.rainbows?.find(r => r.id === card.id);
    if (!rb) return null;
    const current = arrangementOf(rb);
    const set = changes => updateTierRainbows(card.tierIndex, cur =>
      cur.map(r => (r.id === rb.id ? { ...r, ...changes } : r)));

    // Is the BOARD what is capping the size, rather than the slider? On a standard board a leaning
    // arch has to shrink to about half to land its falling foot on it, and past that point dragging
    // Size further does nothing at all — 1.0 and 1.8 come out the same size. A slider that stops
    // responding with no explanation is the thing to avoid, so this says so in one line.
    //
    // Absolute heights are not needed: the geometry works from the tier's HEIGHT and RADIUS, so a
    // cake pinned at boardY 0 gives the same answer without re-deriving where the tier sits — which
    // would be a second definition of something CakeCanvas already knows.
    const ct = canvasConfig.tiers ?? [];
    const tierCfg = ct[card.tierIndex];
    const boardCapped = (() => {
      if (!tierCfg) return false;
      const support = rainbowSupportRadius(ct, card.tierIndex, ct[0] ? boardOf(ct[0]) : null);
      const fit = rainbowBands(rb, {
        radius: tierCfg.radius, topY: tierCfg.height, boardY: 0, supportRadius: support,
      }).supportFit;
      return fit < 0.999;
    })();

    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          Drag it on the cake to move it round.
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Where it goes</div>
          {/* "Where it goes", not "Arrangement" — that was the studio's word for it, carried into the
              customer's card without being questioned. A customer is not arranging anything; they are
              picking where the rainbow goes.

              Each tile carries its WHOLE shape, not one flag — picking one that changed only the feet
              left the arch in the middle and the choice looked broken. `scale` is deliberately NOT
              applied: it is the one thing on a tile the customer has already chosen for themselves
              below, and re-imposing it would undo their size every time they tried another shape. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {RAINBOW_ARRANGEMENTS.map(a => (
              <ArrangementTile key={a.key} item={a} on={current?.key === a.key}
                tiers={design.tiers.length} tierIndex={card.tierIndex} size={40}
                onPick={() => {
                  const { scale, ...shape } = arrangementShape(a);
                  set(shape);
                }} />
            ))}
          </div>
        </div>

        {[
          ['Size',       'scale',     0.4,  1.8,  0.05, true],
          ['Ropes',      'bands',     3,    9,    1,    true],
          ['Thickness',  'thickness', 0.04, 0.18, 0.005, true],
          ['Press flat', 'flatten',   0,    0.9,  0.05, true],
          ['Up the wall', 'spring',   0,    1,    0.02, (rb.surface ?? 'top') === 'side'],
        ].filter(([, , , , , show]) => show).map(([label, key, min, max, step]) => (
          <div key={key} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <input type="range" min={min} max={max} step={step}
              value={rb[key] ?? RAINBOW_DEFAULTS[key]}
              onChange={e => set({ [key]: parseFloat(e.target.value) })}
              style={{ width: '100%' }} />
            {key === 'scale' && boardCapped && (
              <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                As big as the board allows — its foot has to land on the board.
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Colours</div>
          {/* One swatch per ROPE, not per stored colour. The generator wraps a short palette round a
              longer stack (`colors[i % colors.length]`), so a 9-rope rainbow drawn from 6 colours has
              three ropes whose colour is not in the list — and a row of six swatches would leave
              them unreachable. Reading through the same wrap shows what is actually on the cake, and
              writing back materialises the wrap so the one you touched is the one that changes. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Array.from({ length: rb.bands ?? RAINBOW_DEFAULTS.bands }, (_, i) => {
              const palette = rb.colors ?? RAINBOW_DEFAULTS.colors;
              return (
                <input key={i} type="color" value={palette[i % palette.length]} aria-label={`Rope ${i + 1}`}
                  onChange={e => {
                    const n = rb.bands ?? RAINBOW_DEFAULTS.bands;
                    const next = Array.from({ length: n }, (_, k) => palette[k % palette.length]);
                    next[i] = e.target.value;
                    set({ colors: next });
                  }}
                  style={{ width: 28, height: 26, border: '1px solid #D9D5CE', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button onClick={() => removeRainbow(card.tierIndex, rb.id)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999',
              background: '#fff', fontWeight: 700, fontSize: 12, color: '#b56', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </>
    );
  }

  // Grass editor body — inline expanded body of its stack card.
  //
  // A baker gets THREE controls, not the studio's ten. Splay, droop, strand count, thickness, length
  // variation and jitter are what make it look like grass at all — they were tuned once in the admin
  // studio and are the same on every cake. Density, height and colour are the ones a cake actually
  // differs by: a putting green is short and dense, a meadow is long and sparse.
  function renderGrassBody() {
    const i = grassTier;
    const g = design.tiers[i]?.grass;
    const bg = design.boardGrass;
    if (!g && !bg) return null;
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          Piped with a grass nozzle — over a tier, around the base, or both.
        </div>

        {/* Two independent placements, not a choice between them: the reference football cake has a
            pitch on top AND tufts ringing the base on the board. */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Where</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['On top', !!g, toggleTopGrass], ['On the board', !!bg, toggleBoardGrass]].map(([label, on, fn]) => (
              <button key={label} onClick={fn}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  border: '1.5px solid #999999', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {bg && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>On the board</div>
            {/* How far the ring reaches across the gap between the cake and the board's edge — a
                fraction, so it means the same on a small round and a sheet. */}
            {/* A continuous ring, or separate clumps around the cake — the volleyball cake's board
                has three, framing the composition rather than encircling it. */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['Ring', false], ['Clumps', true]].map(([label, wantPatches]) => {
                const on = !!bg.patches?.length === wantPatches;
                return (
                  <button key={label}
                    onClick={() => { if (!on) updateBoardGrass({ patches: wantPatches ? [{ u: 0, v: 0.86, r: GRASS_PATCH_R }] : null }); }}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
                      border: '1.5px solid #999999', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a' }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {bg.patches?.length > 0 ? (
              <div style={{ marginBottom: 8 }}>
                {bg.patches.map((p, k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#aaa', width: 12 }}>{k + 1}</span>
                    <input type="range" min={0.15} max={0.9} step={0.02} value={p.r ?? GRASS_PATCH_R}
                      onChange={e => setGrassPatchSize(BOARD_TIER, k, +e.target.value)}
                      onPointerDown={() => setGrassSelected({ tier: BOARD_TIER, idx: k })}
                      style={{ flex: 1 }} />
                    <button onClick={() => removeGrassPatch(BOARD_TIER, k)} title="Remove"
                      style={{ border: 'none', background: 'none', color: '#b56', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  </div>
                ))}
                <button onClick={() => addGrassPatch(true)}
                  style={{ marginTop: 4, padding: '5px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
                    border: '1.5px solid #1a1a1a', background: '#1a1a1a', color: '#fff', fontWeight: 700, fontFamily: 'inherit' }}>
                  + Add clump
                </button>
              </div>
            ) : (
            <PenSlider label="Ring width" value={bg.ringWidth ?? 0.75} min={0.15} max={1} step={0.05}
              onChange={v => updateBoardGrass({ ringWidth: v })} fmt={v => `${Math.round(v * 100)}%`} />)}
            <PenSlider label="Height" value={bg.height ?? GRASS_DEFAULTS.height} min={0.06} max={0.4} step={0.005}
              onChange={v => updateBoardGrass({ height: v })} fmt={v => v.toFixed(2)} />
            <PenSlider label="Density" value={0.24 - (bg.spacing ?? GRASS_DEFAULTS.spacing)} min={0.04} max={0.2} step={0.002}
              onChange={v => updateBoardGrass({ spacing: +(0.24 - v).toFixed(3) })}
              fmt={() => `${Math.round((0.2 - (bg.spacing ?? 0.075)) / 0.16 * 100)}%`} />
          </div>
        )}

        {g && (<>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>On top</div>

        {design.tiers.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Tier</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {design.tiers.map((_, ti) => (
                <button key={ti} onClick={() => moveGrassToTier(ti)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    border: '1.5px solid #999999', background: ti === i ? '#1a1a1a' : '#fff', color: ti === i ? '#fff' : '#1a1a1a' }}>
                  {ti + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Coverage. A band leaves the middle clear so whatever is under the grass still shows —
            the football cake, where the pitch rings a design rather than burying it. Stored as the
            INNER edge because that is what the geometry wants; shown as a width because that is
            what a person is adjusting. */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Coverage</div>
          {/* Three modes, one at a time — a band and a clump answer different questions and mixing
              them on one surface reads as a mistake. Switching sets the other's field to null so the
              geometry never sees two coverage rules at once. */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              ['Whole top', { bandInner: null, patches: null }],
              ['Rim band',  { bandInner: 0.55, patches: null }],
              ['Clumps',    { bandInner: null, patches: [newPatch([])] }],
            ].map(([label, patch]) => {
              const mode = g.patches?.length ? 'Clumps' : g.bandInner != null ? 'Rim band' : 'Whole top';
              const on = mode === label;
              return (
                <button key={label} onClick={() => { if (!on) updateGrass(i, patch); }}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
                    border: '1.5px solid #999999', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a' }}>
                  {label}
                </button>
              );
            })}
          </div>

          {g.patches?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 600, marginBottom: 6 }}>
                Drag a clump on the cake to move it.
              </div>
              {g.patches.map((p, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#aaa', width: 12 }}>{k + 1}</span>
                  <input type="range" min={0.15} max={0.9} step={0.02} value={p.r ?? GRASS_PATCH_R}
                    onChange={e => setGrassPatchSize(i, k, +e.target.value)}
                    onPointerDown={() => setGrassSelected({ tier: i, idx: k })}
                    style={{ flex: 1 }} />
                  <button onClick={() => removeGrassPatch(i, k)} title="Remove"
                    style={{ border: 'none', background: 'none', color: '#b56', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button onClick={() => addGrassPatch(false)}
                style={{ marginTop: 4, padding: '5px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
                  border: '1.5px solid #1a1a1a', background: '#1a1a1a', color: '#fff', fontWeight: 700, fontFamily: 'inherit' }}>
                + Add clump
              </button>
            </div>
          )}
        </div>

        {g.bandInner != null && (
          <div style={{ marginTop: 8 }}>
            <PenSlider label="Band width" value={1 - g.bandInner} min={0.12} max={0.9} step={0.02}
              onChange={v => updateGrass(i, { bandInner: +(1 - v).toFixed(2) })}
              fmt={v => `${Math.round(v * 100)}%`} />
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {/* Density reads as "more grass to the right", so the slider is inverted over spacing —
              spacing is the number the geometry wants, density is the thing a person adjusts. */}
          <PenSlider label="Density" value={0.24 - (g.spacing ?? GRASS_DEFAULTS.spacing)} min={0.04} max={0.2} step={0.002}
            onChange={v => updateGrass(i, { spacing: +(0.24 - v).toFixed(3) })} fmt={() => `${Math.round((0.2 - (g.spacing ?? 0.075)) / 0.16 * 100)}%`} />
          <PenSlider label="Height" value={g.height ?? GRASS_DEFAULTS.height} min={0.06} max={0.4} step={0.005}
            onChange={v => updateGrass(i, { height: v })} fmt={v => v.toFixed(2)} />
          {/* Grass at the rim spilling down the side. A TOP-surface control only: the board ring's
              edge is the board's edge, and tipping tufts over THAT would hang grass off the cake
              board into mid-air. Applies to all three top modes — a clump dragged to the rim drapes
              for the same reason a full lawn does. Defaults to 0, so no existing cake changes and
              the drape is something a baker turns on. */}
          <PenSlider label="Over the edge" value={g.overhang ?? 0} min={0} max={1} step={0.05}
            onChange={v => updateGrass(i, { overhang: v })}
            fmt={v => (v === 0 ? 'none' : `${Math.round(v * 100)}%`)} />
        </div>
        </>)}

        {/* ONE colour for both placements — it is one piping bag, and a lawn that does not match the
            hedge at its foot reads as a mistake rather than a choice. */}
        {/* ColorWheel — INVARIANTS #3. Same defect as the letter-blocks card had, introduced the
            same day: a hand-rolled swatch row is a second colour control, and it reads as one. */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Grass colour</div>
        <ColorWheel color={grassColor} onChange={setGrassColor} width={152}
          cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== grassColor.toLowerCase())} />

        <button onClick={removeGrass}
          style={{ marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999',
            background: '#fff', fontWeight: 700, fontSize: 12, color: '#b56', cursor: 'pointer' }}>
          Remove grass
        </button>
      </>
    );
  }

  // Luster Dust editor body — inline expanded body of its stack card (like the cream pen above).
  function renderDustBody() {
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
          Add a flick, then drag its dot on the cake to position it. Use Direction &amp; Spread to aim.
        </div>

        {design.tiers.length > 1 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>Tier</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {design.tiers.map((t, i) => (
                <button key={i} onClick={() => { setDustTier(i); setDustSel(0); }}
                  style={{ padding: '5px 11px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: dustTier === i ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8',
                    background: dustTier === i ? '#3D5A44' : '#fff', color: dustTier === i ? '#fff' : '#3D5A44' }}>
                  Tier {i + 1}
                </button>
              ))}
            </div>
          </>
        )}

        <button onClick={() => addDustToTier(dustTier)}
          style={{ width: '100%', marginTop: 10, padding: '10px 0', borderRadius: 8, border: 'none', background: '#3D5A44', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add dust flick
        </button>

        {dustSplashes.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Flicks</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dustSplashes.map((sp, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 16, overflow: 'hidden',
                  border: dustSel === i ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8',
                  background: dustSel === i ? '#3D5A44' : '#fff', color: dustSel === i ? '#fff' : '#3D5A44' }}>
                  <button onClick={() => setDustSel(i)} style={{ padding: '5px 6px 5px 11px', border: 'none', background: 'transparent', color: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Flick {i + 1}</button>
                  <button onClick={() => { removeDustSplash(dustTier, i); setDustSel(s => Math.max(0, s - (i <= s ? 1 : 0))); }} style={{ padding: '5px 9px', border: 'none', background: 'transparent', color: 'inherit', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                </span>
              ))}
            </div>

            {dustSplashes[dustSel] && (
              <div style={{ marginTop: 8 }}>
                <PenSlider label="Position"  value={dustSplashes[dustSel].u}      min={0}    max={1}   step={0.01} onChange={v => updateDustSplash(dustTier, dustSel, { u: v })}      fmt={v => v.toFixed(2)} />
                <PenSlider label="Height"    value={dustSplashes[dustSel].v}      min={0}    max={1}   step={0.01} onChange={v => updateDustSplash(dustTier, dustSel, { v })}         fmt={v => v.toFixed(2)} />
                <PenSlider label="Direction" value={dustSplashes[dustSel].dir}    min={0}    max={360} step={5}    onChange={v => updateDustSplash(dustTier, dustSel, { dir: v })}    fmt={v => `${Math.round(v)}°`} />
                <PenSlider label="Spread"    value={dustSplashes[dustSel].spread} min={0.15} max={2}   step={0.05} onChange={v => updateDustSplash(dustTier, dustSel, { spread: v })} fmt={v => v.toFixed(2)} />
              </div>
            )}

            {/* Density / Fleck size / Glow apply to the whole dusting on this tier, not one flick. */}
            <div style={{ marginTop: 8 }}>
              <PenSlider label="Density"    value={design.tiers[dustTier]?.dusting?.density   ?? 2} min={1}   max={8} step={1}   onChange={v => updateDusting(dustTier, { density: v })}   fmt={v => `${Math.round(v)}`} />
              <PenSlider label="Fleck size" value={design.tiers[dustTier]?.dusting?.fleckSize ?? 4} min={1.5} max={9} step={0.5} onChange={v => updateDusting(dustTier, { fleckSize: v })} fmt={v => v.toFixed(1)} />
              <PenSlider label="Glow"       value={design.tiers[dustTier]?.dusting?.glow      ?? 0} min={0}   max={0.6} step={0.05} onChange={v => updateDusting(dustTier, { glow: v })}      fmt={v => v.toFixed(2)} />
            </div>
          </>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Dust colour</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="color" value={dustColor} onChange={e => setAllDustColor(e.target.value)}
            style={{ width: 40, height: 32, padding: 0, border: '1.5px solid #C5D4C8', borderRadius: 8, background: '#fff', cursor: 'pointer', flexShrink: 0 }} />
          {DUST_COLORS.map(d => (
            <button key={d.color} onClick={() => setAllDustColor(d.color)}
              style={{ padding: '5px 11px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: dustColor.toLowerCase() === d.color.toLowerCase() ? '1.5px solid #3D5A44' : '1.5px solid #C5D4C8',
                background: dustColor.toLowerCase() === d.color.toLowerCase() ? '#3D5A44' : '#fff',
                color: dustColor.toLowerCase() === d.color.toLowerCase() ? '#fff' : '#3D5A44' }}>
              {d.label}
            </button>
          ))}
        </div>

        {dustSplashCount > 0 && (
          <button onClick={() => design.tiers.forEach((t, i) => t.dusting && clearDusting(i))}
            style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, border: '1.5px solid #999999', background: '#fff', fontWeight: 700, fontSize: 12, color: '#b56', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear all dust
          </button>
        )}
      </>
    );
  }

  if (!bakerReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5', fontFamily: "'Quicksand', sans-serif" }}>
        <CakeSpinner label="Loading…" />
      </div>
    );
  }

  // Block access if subscription is expired or cancelled. past_due / pending are deliberately
  // ABSENT — they are the dunning grace window (Razorpay is still retrying), and the api gate
  // agrees: entitlements.js BLOCKED_STATUSES excludes them too.
  const blockedStatuses = ['expired', 'cancelled', 'paused'];
  // Plan naming for the gate copy + button. Prefer the display name ("Blaze") — the raw name is
  // lowercase. A baker who has paid always had a plan, so 'previous' is defensive only (a plan we
  // have since retired); in that case we also drop the Resume label and just show the plan list.
  const lapsedPlanName  = bakerData?.subscription_plan_display || bakerData?.subscription_plan || null;
  const lapsedPlanLabel = lapsedPlanName ?? 'previous';
  const canResumeLapsedPlan = !!lapsedPlanName && lapsedGateState(bakerData) !== 'trial';
  if (bakerData && blockedStatuses.includes(bakerData.subscription_status)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F4F8F5', fontFamily: "'Quicksand', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
          <div style={{ color: '#9BB5A2', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <LockIcon />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
            {LAPSED_GATE_COPY[lapsedGateState(bakerData)].title}
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
            {LAPSED_GATE_COPY[lapsedGateState(bakerData)].body(lapsedPlanLabel)}
          </div>
          {/* One action, one surface. BillingPanel already pre-selects the baker's own tier and
              period from its own load (BillingPanel.jsx:324-325), so opening it IS "resume this
              plan" — with the plan list and the GST checkout review right there. Nothing about
              the panel changes; only this label does. Falls back to "View plans" when there is
              no plan name to resume (e.g. a retired plan we no longer sell). */}
          <button
            onClick={() => setBillingPanelOpen(true)}
            style={{
              padding: '14px 32px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
              color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}
          >
            {canResumeLapsedPlan ? `Resume ${lapsedPlanLabel}` : 'View plans'}
          </button>

          {/* ── The way OUT ───────────────────────────────────────────────────────────────────────
              This screen used to offer exactly one action: pay. Everything else — the rail, Settings,
              Privacy & Data — is not rendered once the status is blocked, so the account-deletion
              request lived behind the paywall it is the alternative to.

              That is a DPDP problem, not a UX one. Erasure is a s.12 RIGHT and grievance redressal a
              s.13 one, and a statutory right cannot be conditioned on paying. The API never made that
              mistake: POST /baker/account/delete asks only for auth and the account:delete capability,
              with no entitlement or subscription check, so a lapsed baker's token has always worked.
              The button to call it was the missing part — the same shape as Uploads missing from the
              phone rail, and the uploads picker opening underneath the studio.

              Deliberately quiet: small, secondary, below the primary action. A baker who came here to
              resume should not be steered towards deleting, and one who came to leave should not have
              to email us to do it.

              DELETION ONLY — no download. DPDP has no data-portability right: it was in the 2019 and
              2021 Bills and was dropped before the 2023 Act passed. s.11 gives access to a SUMMARY,
              which the grievance route answers. ("Download my record" inside the panel is the CONSENT
              TRAIL — which documents were accepted and when — not a data export.) */}
          <div style={s.lapsedExit}>
            <button type="button" style={s.lapsedExitLink} onClick={() => setLapsedPrivacyOpen(true)}>
              Delete your account
            </button>
            <span aria-hidden style={{ opacity: 0.45 }}>·</span>
            <a style={s.lapsedExitLink} href={`${legalBase}/grievance`} target="_blank" rel="noreferrer">
              Contact us
            </a>
          </div>

          {/* The SAME PrivacyDataSection the settings menu renders, in a plain Panel rather than the
              whole SettingsPanel — a locked-out baker has no use for colours and storefront copy, and
              showing settings that cannot be saved would be its own small lie. */}
          {lapsedPrivacyOpen && (
            <Panel onClose={() => setLapsedPrivacyOpen(false)} title="Privacy & Data" width={520} flow="block">
              <PrivacyDataSection apiClient={apiClient} />
            </Panel>
          )}

          <BuyCreditsPanel
            open={buyCreditsOpen}
            onClose={() => setBuyCreditsOpen(false)}
            apiClient={apiClient}
            primaryColor={primaryColor}
          />
          <BillingPanel
            open={billingPanelOpen}
            onBuyCredits={() => setBuyCreditsOpen(true)}
            onClose={() => setBillingPanelOpen(false)}
            onSubscriptionChange={refreshBakerProfile}
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
      {/* ── The dunning warning ──────────────────────────────────────────────────────────────────
          FIRST child of `page`, above both the desktop rail and the mobile header, because they
          both live inside this column — one placement, both surfaces, no second copy to drift.
          Renders null unless the status is past_due, so it costs nothing the rest of the time.

          It is here rather than in BillingPanel because the whole problem is that the baker is NOT
          in Billing: they missed the email, everything looks normal, and in about three days
          Razorpay halts and the lock screen appears. A warning only visible to someone who went
          looking for it is not a warning. */}
      <PastDueBanner
        status={bakerData?.subscription_status}
        onOpenBilling={() => setBillingPanelOpen(true)}
      />

      {/* ── First visit, for a CUSTOMER only ─────────────────────────────────────────────────────
          A baker learns this app over weeks and would resent being walked through it; a customer
          gets one visit, on a phone, from a link somebody sent them, and has never seen a cake they
          can turn. `active` is passed rather than read inside, so the who lives here with the rest
          of the mode branching instead of being buried in a tour component.

          Renders null the rest of the time (seen, or not a customer), so it costs nothing. */}
      <DesignTour
        mode={orderMode === 'customer' ? 'customer' : 'baker'}
        // A customer always (their cookie decides inside); a baker only if they have never seen it.
        // Bakers DO get it uninvited on a genuine first run — what they must not get is it again on
        // a second laptop, which is the whole reason the flag moved to a column.
        autoStart={orderMode === 'customer' || tourSeen === false}
        startNonce={tourNonce}
        // Fire-and-forget: the tour is already on screen, so a failed write must do nothing visible.
        // Worst case it is offered once more elsewhere — exactly the old localStorage behaviour.
        onSeen={() => {
          if (orderMode === 'customer' || tourSeen === true) return;
          setTourSeen(true);
          apiClient?.markTourSeen?.()?.catch?.(() => {});
        }}
      />
      {/* scrollbarWidth:'none' covers Firefox; WebKit needs a real rule, which an inline style
          cannot express. The rail is 64px wide — a scrollbar in it is worse than none. */}
      <style>{`@keyframes spattooFadeIn { from { opacity: 0 } to { opacity: 1 } }
        .spattoo-rail-nav::-webkit-scrollbar { display: none; }
        .spattoo-noscrollbar::-webkit-scrollbar { display: none; }
        /* A :hover cannot be expressed inline, and inline styles win — hence !important. */
        .spattoo-rail-menu button:hover { background: rgba(255,255,255,0.11) !important; color: #fff !important; }`}</style>

      {/* ── Mobile header ── */}
      {isMobile && (
        <div style={s.mobileHeader}>
          <div style={s.topLogo}>
            {logoSrc
              ? <img src={logoSrc} alt="" style={s.topLogoImg} />
              : <div style={{ ...s.topLogoText, fontSize: nameFontSize(bakerData?.name ?? '') }}>
                  {bakerData?.name ?? 'My Bakery'}
                </div>
            }
          </div>
          {/* flexShrink: 0 — these are fixed-size tap targets. Without it the cluster is what
              collapses when the name is long, and the credits pill silently squeezes to nothing. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {/* Credits first in the cluster: it is a READOUT, not an action, and it belongs where
                the eye lands before the controls rather than buried past them. */}
            {/* Beside the credits readout, and gated the same way the rest of the baker chrome is.
                Renders nothing at all when the host has not wired fetchNotifications. */}
            {canManageStore && <NotificationBell apiClient={apiClient} onOpenLink={openNotificationLink} />}
            {hasCap('billing:manage') && (
              <CreditsPill apiClient={apiClient} onOpen={() => { setBuyCreditsOpen(true); setSettingsOpen(false); setProfileOpen(false); }} />
            )}
            {/* ── Chef's Desk and Settings are NOT here ──────────────────────────────────────
                They moved into the More sheet. Two 38px buttons plus their gaps were 92px of a
                header that also has to hold the bakery's NAME — which is identity, and the same name
                the baker's customers meet coming in from the storefront, so it is the one thing here
                that must never be cut short. On a 393 phone the name went from 187px of room to 279.

                What stays is what has to be glanceable rather than reachable: notifications, the
                credits readout, and the avatar. Both menus are settings-shaped — visited
                occasionally, on purpose — which is exactly what More is for. */}
            <div style={{ position: 'relative' }} ref={profileRef}>
              <button style={{ ...s.sidebarProfileBtn, background: brandPrimary }}
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
                  {role !== 'customer' && <button style={s.dropdownItem} onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>Change Password</button>}
                  <button style={s.dropdownItem} onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop logo ── */}
      {/* Sits OUT OF FLOW, over the empty top-left of the canvas, deliberately.
          It cannot live in the 64px rail: that caps it at 56px wide and crushes the
          horizontal wordmarks most bakeries use. But it cannot be a header band either
          — the rail is already height-starved (12 items, all flexShrink:0), so spending
          52px of column height on chrome pushes the spatula down and clips its blade.
          Absolute positioning buys the width without spending any height.
          Left offset clears the rail: 40px leftCol padding + 64px rail. */}
      {/* ── The header rule ──────────────────────────────────────────────────────────────────────
          The logo and the bell/credits cluster already sat on one line (both top: 14, both out of
          flow) — a header row in geometry with nothing to say so, which is why the name read as
          stranded on the canvas rather than placed.

          A rule, not a filled bar: it defines the row while leaving the workspace edge-to-edge.

          It starts at the rail's right edge, not at 0. Full width it swallows the spatula's rounded
          cap, because the rail runs to the very top of the page — found by drawing it.

          Out of flow like the two clusters it belongs to, so it costs no layout height: the canvas
          keeps its size and the cake does not move. */}
      {!isMobile && (
        <div style={{ ...s.desktopHeaderRule, top: (pastDue ? PAST_DUE_BAR_H : 0) }} />
      )}

      {!isMobile && (
        // top is offset by the past-due bar when it is showing: this element is out of flow, so it
        // is the ONE thing in `page` that a new first child does not push down. See PAST_DUE_BAR_H.
        <div style={{ ...s.desktopLogo, top: (pastDue ? PAST_DUE_BAR_H : 0) }}>
          {logoSrc
            ? <img src={logoSrc} alt="" style={s.topLogoImg} />
            : <div style={{ ...s.topLogoText, ...s.desktopLogoText }}>{bakerData?.name ?? 'My Bakery'}</div>
          }
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ ...s.main, ...(isMobile ? { flexDirection: 'column' } : {}) }}>
        {codesign.live && codesign.sessionId && !codesignPanelOpen && (
          <button
            onClick={() => setCodesignPanelOpen(true)}
            style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 44,
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999,
              border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.92)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.12)', fontFamily: "'Quicksand',sans-serif",
              fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: codesign.connected ? '#2ecc71' : '#f1c40f' }} />
            Live · {codesign.participants.length} here
          </button>
        )}
        <SessionPanel
          open={codesignPanelOpen}
          onClose={() => setCodesignPanelOpen(false)}
          codesign={codesign}
          onInvite={() => {
            // Invite the customer INTO this live session: attach the current design + the
            // session id, then open the (reused) invite picker in live mode.
            setInviteLiveSessionId(codesign.sessionId);
            setShareDraftDesign({ designSnapshot: buildDesignSnapshot(design), designThumbnailKey: null });
            setCodesignPanelOpen(false);
            setInvitePanelOpen(true);
          }}
        />

        {/* ── Left column: sidebar (the logo moved to the desktop header) ── */}
        {!isMobile && <div style={s.leftCol}>

        {/* ── Sidebar ── */}
        <div style={s.sidebar}>
          <SpatulaFrame />
          <div style={s.sidebarInner}>
          <nav className="spattoo-rail-nav" ref={setRailNavEl} style={s.sidebarNav}>
            {railItems.map(({ id, label, icon, menu }) => {
              const active = railItemActive(id, menu);
              const isNew  = id === 'new';
              const button = (
                <button key={id} style={s.navItem} data-tour={id}
                  onClick={() => openRailItem(id, menu)}>
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
              if (!menu) return button;
              return (
                // escapeClip: this rail scrolls, and a scroll container clips the flyout — see RailSubmenu.
                // Hover opens it here; the mobile bar below passes no hover handlers.
                <RailSubmenu key={id} label={label} items={menu}
                  open={navMenuId === id}
                  containerRef={navMenuId === id ? navMenuRef : null}
                  escapeClip
                  onHoverOpen={() => { setNavMenuId(id); setChefsDeskOpen(false); setSettingsOpen(false); setProfileOpen(false); }}
                  onHoverClose={() => setNavMenuId(o => (o === id ? null : o))}
                  onSelect={selectOrdersMenuItem}>
                  {button}
                </RailSubmenu>
              );
            })}

          </nav>

          <div style={s.sidebarDivider} />

          {/* gap is measured from the nav above — see toolGap. */}
          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: toolGap }}>
            {/* ── Chef's Desk — baker fulfilment tools (Color Guide, Edible Print Studio, …) ────────
                BELOW the divider, with Settings and Profile, and deliberately not inside <nav>.
                The nav scrolls (sidebarNav: overflowY auto) with its scrollbar hidden on purpose — a
                scrollbar in a 64px rail is worse than none. Chef's Desk was the LAST item in it, so
                on a viewport too short for the full rail it sat below the fold with no scrollbar, no
                cut-off item and nothing else to suggest anything was down there. It was not missing;
                it was unreachable, which looks identical. The same MacBook Air height that clipped
                the spatula blade (see sidebarNav) is what clipped this.

                Here it is outside the scroller entirely, so it cannot be scrolled away at any height.
                It also belongs here: this cluster is the persistent TOOLS a baker reaches for
                regardless of what is on the canvas, while nav is DESTINATIONS. Chef's Desk is the
                former, and it is now a peer of Settings in look as well as position — SidebarTooltip
                + RailMenu, the same two shared components, rather than its own dropdown. */}
            {/* Both menus, from the ONE list. Labelled like every item above them: icon-only they
                asked a baker to recognise a crossed-whisk glyph or hover to find out, in a rail where
                nothing else does. They sit below the divider because they are TOOLS rather than
                destinations — a grouping distinction, never a reason to name them differently — and
                outside the scroller, so a short viewport cannot put them below the fold. */}
            {canManageStore && toolMenus.map(menu => {
              const isChefs = menu.id === 'chefsdesk';
              const open = isChefs ? chefsDeskOpen : settingsOpen;
              return (
                <div key={menu.id} style={{ position: 'relative' }} ref={isChefs ? chefsDeskRef : settingsRef}>
                  <button style={s.navItem}
                    onClick={() => {
                      if (isChefs) { setChefsDeskOpen(o => !o); setSettingsOpen(false); }
                      else { setSettingsOpen(o => !o); setChefsDeskOpen(false); }
                      setProfileOpen(false);
                    }}>
                    <span style={{ ...s.sidebarBtn, ...(open ? s.sidebarBtnActive : {}) }}>{menu.icon}</span>
                    <span style={{ ...s.navLabel, ...(open ? { color: '#fff' } : {}) }}>{menu.label}</span>
                  </button>
                  {open && (
                    <RailMenu style={{ top: 'auto', bottom: 0 }}>
                      <div style={s.railDropdownSection}>{menu.label}</div>
                      {menu.items.map(item => (
                        <button key={item.id} style={s.railDropdownItem}
                                onClick={() => { item.open(); setChefsDeskOpen(false); setSettingsOpen(false); }}>
                          {item.label}
                          {item.badge && <span style={s.needsLook} title={item.badge.title}>{item.badge.text}</span>}
                        </button>
                      ))}
                    </RailMenu>
                  )}
                </div>
              );
            })}

            <div style={{ position: 'relative' }} ref={profileRef}>
              <SidebarTooltip label={userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'Profile'}>
                <button
                  style={{ ...s.sidebarProfileBtn, background: brandPrimary }}
                  onClick={() => { setProfileOpen(o => !o); setSettingsOpen(false); }}>
                  {initials}
                </button>
              </SidebarTooltip>
              {profileOpen && (
                <RailMenu style={{ top: 'auto', bottom: 0 }}>
                  <div style={s.railDropdownUserInfo}>
                    <div style={s.railDropdownName}>
                      {userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'My Account'}
                    </div>
                    {userData?.email && <div style={s.railDropdownEmail}>{userData.email}</div>}
                  </div>
                  <div style={s.railDropdownDivider} />
                  {role !== 'customer' && <button style={s.railDropdownItem}
                    onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>
                    Change Password
                  </button>}
                  <button style={s.railDropdownItem}
                    onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>
                    Sign out
                  </button>
                </RailMenu>
              )}
            </div>
          </div>
          </div>{/* end sidebarInner */}
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
              {/* Inside a category the title becomes the way out. One control: the customer went in
                  by tapping a name, so they come back by tapping the same name with an arrow on it. */}
              {activeCategory ? (
                <button
                  onClick={() => setActiveCategory(null)}
                  style={{ ...s.flyoutTitle, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                  <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>‹</span>
                  {activeCategory.name}
                </button>
              ) : (
                /* "Decorations" — never "Elements". `element` is our word for a row in a table;
                   the customer is looking for a decoration to put on a cake, and the rail beside
                   this panel has always called it that. */
                <span style={s.flyoutTitle}>Decorations</span>
              )}
              <button style={s.iconBtn} onClick={() => setElementsOpen(false)}>✕</button>
            </div>

            {/* Search */}
            <input
              value={elemSearch}
              onChange={e => setElemSearch(e.target.value)}
              placeholder="Search decorations…"
              style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #999999', borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box', background: '#ffffff', flexShrink: 0 }}
            />

            <div style={s.flyoutScroll}>
            {elementTypesLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}><CakeSpinner size={20} /></div>
            )}

            {/* ── The category menu ─────────────────────────────────────────────────────────────
                What the panel opens onto. Names and counts only — no element has been fetched at
                this point, which is the entire reason for it: 86 decorations meant 102 KB of JSON
                and 430 KB of thumbnails before the customer had shown interest in any of them.

                Skipped entirely while searching (search is across everything) and, deliberately,
                when no categories exist — an environment without migration 065 falls back to the
                flat list it always had rather than showing an empty panel. */}
            {!!categories.length && !activeCategory && !elemSearch.trim() && !elementTypesLoading && (
              // minmax(84px) rather than 104: the flyout is narrow on a phone, and at 104 it
              // collapses to ONE column — a stack of full-width word-cards, which is the least
              // appealing possible way into a library of pictures. 84 keeps two columns at the
              // narrowest the panel gets and gives three as soon as there is room.
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 10 }}>
                {[...categories, ...(hasCap('element:manage') ? [MY_DECORATIONS] : [])].map(cat => (
                  <button key={cat.id} onClick={() => openCategory(cat)}
                    style={{ ...s.elementCard, padding: 0, cursor: 'pointer', gap: 0, overflow: 'hidden' }}>
                    {/* The picture is the label. Someone hunting for a lion recognises one long
                        before they read the word "Animals", and this is a visual product — a
                        column of text was the one thing the picker should never have been. */}
                    <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#FAFAF8',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {cat.thumbnail_url ? (
                        <img src={cat.thumbnail_url} alt="" loading="lazy" decoding="async"
                             style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, boxSizing: 'border-box' }} />
                      ) : cat.id === MY_DECORATIONS.id ? (
                        // Never gets a photo — see MyDecorationsIcon for why. The dot below is for a
                        // category that simply has not been given one YET, which is a different
                        // thing and should keep looking like an absence.
                        <span style={{ color: '#7d757d' }}><MyDecorationsIcon /></span>
                      ) : (
                        // A category whose elements have no thumbnail yet.
                        <span aria-hidden style={{ fontSize: 20, opacity: 0.28 }}>◍</span>
                      )}
                      {cat.count != null && (
                        <span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,0.9)',
                                       borderRadius: 20, padding: '1px 6px', fontSize: 9, fontWeight: 800, color: '#8a8288' }}>
                          {cat.count}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#444', textAlign: 'center',
                                  lineHeight: 1.2, padding: '5px 4px 7px', width: '100%', boxSizing: 'border-box' }}>
                      {cat.name}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Everything below is the element picker as it was. It is now gated: with categories
                configured it appears only once one is chosen, or while searching. Without them it
                renders immediately, exactly as before. */}
            {(!categories.length || (activeCategory && activeCategory.id !== MY_DECORATIONS.id) || elemSearch.trim()) && <>

            {/* Ring-popup elements — own groups, tap a style to open the popup. */}
            {renderRingPickerCard('Cream Piping', pipingPickerEls)}
            {renderRingPickerCard(dripType?.name ?? 'Chocolate Drip', dripEls)}

            {/* Every other element, in ONE grid. The element_type decides where an element can go
                and how its tile is drawn; it is not a heading a customer should ever read, and a type
                holding nothing is not a section — see ElementGrid. Types are still walked IN ORDER,
                so the grid keeps the arrangement the headings used to imply. */}
            {(() => {
              const items = elementTypes
                .filter(et => et.slug !== 'cream_piping' && et.slug !== 'piping_pattern' && et.slug !== 'drip' && activeElementTypeIds.has(et.id))
                .flatMap(et => {
                  const els =
                    et.slug === ELEMENT_SLUGS.SCATTERED_DECOR ? filterEl(scatteredDecorDb)
                  : et.slug === ELEMENT_SLUGS.PICKS           ? filterEl(picksDb)
                  : et.slug === ELEMENT_SLUGS.IMAGE_TOPPER    ? filterEl(imageTopperDb)
                    // Global elements only — anything with a baker_id is the caller's OWN and lives
                    // in "My decorations" below, so it appears exactly once in the picker.
                  : filterEl((otherElementsDb[et.id] ?? []).filter(el => !el.baker_id));
                  // An image topper is a picture with edges that mean something — fit it whole.
                  // Everything else is a cut-out on transparent, and cropping to the tile reads better.
                  const objectFit = et.slug === ELEMENT_SLUGS.IMAGE_TOPPER ? 'contain' : 'cover';
                  return els.map(el => ({ el, objectFit }));
                });
              return (
                <ElementGrid
                  items={items}
                  onDragStartSticker={(el, x, y) => startStickerDrag(el, x, y)}
                  onElementTap={(el) => tapPlaceElement(el)}
                />
              );
            })()}

            {/* ── My Decorations ────────────────────────────────────────────────────────────────
                The caller's OWN uploaded decorations. This is an OWNERSHIP filter over elements
                already loaded (baker_id is set = mine), NOT a new element type — an uploaded topper
                must stay a topper, or it loses the placement rules its type gives it. The API decides
                what "mine" means: a baker sees their bakery's library, a customer additionally sees
                their own private uploads and never another customer's. */}
            </>}{/* end of the gated element picker */}

            {/* Reached through its own card in the category grid. Rendered here, outside the gated
                picker, because it is an OWNERSHIP filter over elements already loaded rather than an
                element type — an uploaded topper must stay a topper or it loses its placement rules.
                Also still shown when no categories exist, which is the pre-065 layout unchanged. */}
            {!elemSearch.trim() && hasCap('element:manage')
              && (activeCategory?.id === MY_DECORATIONS.id || (!categories.length && !activeCategory)) && (
              <>
                {/* The heading is for the LEGACY layout only. Reached through its own card, the
                    flyout's own title already says "My decorations" in full — printing it again
                    directly underneath said the same words twice in one small panel. Without
                    categories there is no such title (the flyout says "Decorations"), so the
                    section still needs to name itself. */}
                {!categories.length && (
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', margin: '14px 0 8px' }}>
                    My decorations
                  </div>
                )}
                {(() => {
                  // Nothing at all until the catalogue has arrived — NOT the empty message.
                  // "Mine" is the one card with no category_id to narrow on, so it is the only one
                  // that fetches the whole catalogue and therefore the slowest to fill. While it is
                  // in flight `mine` is empty for a reason that has nothing to do with the customer,
                  // and this block used to answer that window with "Nothing here yet" — telling
                  // someone with ten uploads, for as long as the fetch took, that they had none.
                  // The spinner at the top of the panel is already saying the true thing.
                  if (elementTypesLoading) return null;
                  const mine = filterEl(Object.values(otherElementsDb).flat().filter(el => el.baker_id));
                  /* ⚠️ PIECES BELONG HERE TOO. "My decorations" is where somebody looks for the things
                     they made, and a chocolate piece they piped is one of those — it was reachable
                     only from the Uploads panel, which is a different door, so this shelf said
                     "nothing here yet" to a baker who had just drawn two. Shown above the pictures
                     and only when there are any, and tapping one opens the STUDIO with it loaded:
                     a piece needs a where and a how, and those live there. */
                  const myPieces = (savedGarnishes ?? []).filter(g =>
                    !elemSearch.trim() || (g.name ?? '').toLowerCase().includes(elemSearch.trim().toLowerCase()));
                  return (mine.length || myPieces.length) ? (
                    <>
                    {myPieces.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: 8, marginBottom: 10 }}>
                        {myPieces.map(g => (
                          <button key={`g${g.id}`} title={g.name}
                            onClick={() => { setPendingGarnish(g); setGarnishStudio(true); }}
                            style={{ ...s.elementCard, padding: 6, cursor: 'pointer' }}>
                            {g.thumbUrl
                              ? <img src={g.thumbUrl} alt={g.name} style={{ width: '100%', height: 54, objectFit: 'contain' }} />
                              : <div style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#8a8a8a' }}>{g.name}</div>}
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: '#555', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: 8, marginBottom: 10 }}>
                      {mine.map(el => (
                        <button key={el.id} onClick={() => tapPlaceElement(el)} style={{ ...s.elementCard, padding: 6, cursor: 'pointer' }}>
                          <img src={el.thumbnail_url || el.image_url} alt={el.name}
                            style={{ width: '100%', height: 54, objectFit: 'contain' }} />
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#555', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</div>
                        </button>
                      ))}
                    </div>
                    </>
                  ) : (
                    // #9a939a at 11px was the only thing on the screen and could barely be read —
                    // about 2.9:1 against the panel, well under the 4.5:1 a sentence needs. Grey
                    // that pale is the colour of a DISABLED control, and this is the one piece of
                    // text a customer opening an empty shelf has to take in. #5c565c is ~7:1.
                    <div style={{ fontSize: 12, color: '#5c565c', fontWeight: 600, marginBottom: 10, lineHeight: 1.5, maxWidth: 260 }}>
                      Nothing here yet. Upload a picture of a decoration and use it on your cakes.
                    </div>
                  );
                })()}
                {/* "Add your own" and "Uploads" both used to live here. They are gone: Uploads is
                    now a MAIN MENU entry (it is a place you go — your own images — not a kind of
                    decoration), and uploading happens INSIDE it, so a second upload door here would be
                    a second path to drift. This section is the LIBRARY only. */}
              </>
            )}

            {/* ── There is no tools section any more, and that is the point ─────────────────────
                Six code-level cards used to sit at the bottom of this panel: Cream Pen, Luster Dust,
                Grass, Letter Blocks, Texts and Number topper. Every one is a catalogue row now, so
                every one is filed where a customer browses for it — Art, Finishes, Flowers & Leaves,
                Numbers & Letters — instead of loose beneath the shelves.
                They went one at a time, and each was reported before it went. The cards were never
                laziness: a card was the only way in until the thing could be SAVED, and until today
                two of these studios had no Save button at all and a third threw on render for
                seventeen days. There was nothing to file them under.
                Every one is still reached the same way, through PROCEDURAL_TOOLS on its row. What
                went was the second door, never the feature.
                If a future tool needs a card here, it is worth asking first whether it needs a row
                instead. The answer has been "a row" six times running. */}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* Cream Pen (freehand) and Luster Dust editors now live INLINE in the element stack as their
            own cards (renderPenBody / renderDustBody), exactly like the piping and Texts cards — no
            floating popup, no ✕. Dismiss = collapse the card. */}

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
              style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #999999', borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box', background: '#ffffff', flexShrink: 0 }}
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
                    style={{ flex: 1, padding: '3px 6px', border: '1.5px solid #999999', borderRadius: 6, fontSize: 11, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: 10, color: '#aaa' }}>kg+</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* "Suits age", not "Age" — this filters the CATALOGUE by who a design suits
                      (cake_template_attrs.min_age/max_age), and stores nothing about anybody. Bare
                      "Age" read as though the baker were being asked for the child's, which is the
                      same thing the order form's label did and the number topper's before it. */}
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#bbb', letterSpacing: 1.2, textTransform: 'uppercase', minWidth: 46 }}>Suits age</span>
                  <input type="number" min="0" max="120" step="1" placeholder="e.g. 8" value={filterAge} onChange={e => setFilterAge(e.target.value)}
                    style={{ flex: 1, padding: '3px 6px', border: '1.5px solid #999999', borderRadius: 6, fontSize: 11, fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: 10, color: '#aaa' }}>yrs</span>
                </div>
              </div>
            </FilterPanel>

            {templatesLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}><CakeSpinner size={20} /></div>
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
              <div key={t.id} style={{ ...s.templateCard, ...(isMobile ? { flex: '0 0 calc(50% - 5px)', position: 'relative' } : {}) }}
                // Desktop only: touch has no hover, and the two substitutes both break here —
                // long-press fights the panel's own scrolling, and tap already loads the template.
                // Mobile gets the explicit ⤢ button below instead.
                onMouseEnter={isMobile ? undefined : (e) => {
                  const src = thumbSrc(t);
                  if (!src) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  clearTimeout(tplPreviewTimer.current);
                  // A short delay so running the cursor down the list doesn't strobe previews.
                  tplPreviewTimer.current = setTimeout(
                    () => setTplPreview({ src, name: t.name, tiers: t.tier_count, rect }), 180);
                }}
                onMouseLeave={isMobile ? undefined : () => {
                  clearTimeout(tplPreviewTimer.current);
                  setTplPreview(null);
                }}
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
                    resetEditors();
                  }
                }}
              >
                {thumbSrc(t)
                  ? <img src={thumbSrc(t)} alt={t.name} width={180} height={120} loading="lazy" decoding="async" onError={onThumbError} style={{ width: '100%', height: 120, objectFit: 'contain', borderRadius: 8, background: '#FAFAF8' }} />
                  : <div style={s.templateThumbPlaceholder} />
                }
                {/* Mobile's stand-in for hover. An explicit control, not a gesture: tapping the card
                    loads the template, so the preview needs a target of its own. */}
                {isMobile && thumbSrc(t) && (
                  <button
                    type="button"
                    aria-label={`Preview ${t.name}`}
                    style={s.templatePreviewBtn}
                    onClick={(e) => {
                      e.stopPropagation();      // never load the template from this button
                      setTplPreview({ src: thumbSrc(t), name: t.name, tiers: t.tier_count, rect: null });
                    }}
                  >⤢</button>
                )}
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

            {/* Enlarged preview. Portalled to the body because the panel clips its own overflow,
                and anchored beside the card on desktop / centred as a sheet on mobile (rect null). */}
            {tplPreview && createPortal(
              tplPreview.rect
                ? (() => {
                    const size = { w: 320, h: 250 };
                    const { left, top } = previewPosition(
                      tplPreview.rect, size, window.innerWidth, window.innerHeight);
                    return (
                      <div style={{ ...s.templatePreview, left, top, width: size.w }}>
                        <img src={tplPreview.src} alt="" style={s.templatePreviewImg} />
                        <div style={s.templatePreviewCaption}>
                          {tplPreview.name} · {tplPreview.tiers}-tier
                        </div>
                      </div>
                    );
                  })()
                : (
                  <div style={s.templatePreviewBackdrop} onClick={() => setTplPreview(null)}>
                    <div style={{ ...s.templatePreview, position: 'relative', width: 'min(92vw, 420px)' }}
                      onClick={(e) => e.stopPropagation()}>
                      <img src={tplPreview.src} alt="" style={s.templatePreviewImg} />
                      <div style={s.templatePreviewCaption}>
                        {tplPreview.name} · {tplPreview.tiers}-tier
                      </div>
                    </div>
                  </div>
                ),
              document.body,
            )}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Canvas area ── */}
        {/* data-tour: the cake itself is a WebGL canvas with no addressable parts, so the tour
            spotlights this whole area — which is exactly what "drag to spin it" refers to. */}
        <div data-tour="canvas" style={{ ...s.canvasArea, ...(isMobile ? { order: -1, overflow: 'hidden' } : {}) }}>

          {/* Credits, top-right over the canvas — where every tool that meters usage puts them, and
              where a baker looks for "what have I got left" without hunting a sidebar.
              DESKTOP ONLY: mobile already carries it in the header, and a floating pill there would
              cover the cake on the screen with least room to spare.
              Outside the shrinking wrapper below, so opening a side panel slides the cake and
              leaves the readout where it was. */}
          {!isMobile && (hasCap('billing:manage') || canManageStore) && (
            <div style={s.creditsFloat}>
              {/* Bell first: credits is a READOUT and belongs closest to the edge where the eye
                  rests, while the bell is a control that gets pressed. Kept in step with the header
                  cluster above — two placements of the same furniture, the trap Chef's Desk already
                  taught us to watch for. */}
              {canManageStore && <NotificationBell apiClient={apiClient} onOpenLink={openNotificationLink} />}
              {hasCap('billing:manage') && (
                <CreditsPill apiClient={apiClient}
                  onOpen={() => { setBuyCreditsOpen(true); setSettingsOpen(false); setProfileOpen(false); }} />
              )}
            </div>
          )}

          {/* Shrink the live canvas to the left when a side panel is open, so the cake stays fully
              visible beside it (the Canvas is absolute inset:0 of this div). On mobile the element
              stack does NOT shrink the canvas — it's a translucent overlay, so the cake stays
              full-width and centred UNDER the popup (you see it through the frosted cards). */}
          {/* ── The viewport gives way to the edit sheet, rather than hiding behind it ─────────────
              Desktop has always done this on the horizontal axis: the canvas takes `right: 276` when
              the tools panel opens, so the cake sits BESIDE the panel instead of under it. Mobile
              passed 0 and had no vertical equivalent, so the edit sheet simply covered the cake —
              and a colour picker that hides the thing being coloured is not doing its job.

              Insetting the bottom re-frames the 3D view into what is left (the canvas element
              resizes, so the cake re-centres in the strip above the sheet). It is a guarantee rather
              than a mitigation: however tall the sheet is dragged, the cake cannot go behind it.

              Only the edit sheet needs this. The flyout panels are `position: relative` in the column
              and already take their own space. */}
          <div style={{
            position: 'absolute', inset: 0,
            right: toolsOpen ? (isMobile ? 0 : 276) : (elementStackOpen ? (isMobile ? 0 : 220) : 0),
            bottom: isMobile && showRightPanel ? editSheetH : 0,
            transition: 'right 0.18s ease, bottom 0.18s ease',
          }}>
          {/* Darkens everything outside the 9:16 crop so the frame you are about to record is
              obvious without a word of explanation. Behind the canvas box, never over it. */}
          {framing && <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,26,22,0.55)',
                                        pointerEvents: 'none' }} />}
          {/* ⚠️ ALWAYS RENDERED, style toggled — never wrapped conditionally. Giving <CakeCanvas> a
              new parent remounts the R3F root, which throws the scene away and re-downloads every
              topper GLB. The whole preview is a style change on this one box.

              R3F sizes the canvas from its container, so constraining this to 9:16 makes the drawing
              buffer and camera.aspect follow by themselves — no gl.setSize, and what is on screen IS
              what records. The wrapper above already relies on the same behaviour for the edit
              sheet. */}
          <div style={framing
            // ⚠️ The frame has to sit where the PANEL IS NOT. A truthful preview you cannot see is
            // worthless, and the first cut of this put a centred modal straight on top of it.
            //   phone   — the panel is a bottom sheet, so the frame takes the upper half
            //   desktop — the panel is centred, so the frame moves into the free space at the left
            ? (isMobile
                ? { position: 'absolute', top: 8, bottom: 'auto', left: '50%', right: 'auto',
                    transform: 'translateX(-50%)', height: '46%', aspectRatio: frameAspect,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.35)', overflow: 'hidden' }
                // Parked immediately left of the panel, which is ~424px wide and centred in the
                // VIEWPORT. Hence vw and not %: this box is positioned inside the canvas container,
                // whose own 50% sits right of the viewport's by half the tool rail — anchoring on
                // `calc(50% + …)` put the frame 40px underneath the panel on a 1200px window.
                //
                // Width is the smaller of "what is left beside the panel" and "what this much height
                // allows", so the frame shrinks on a narrow window and on a short one, and 9:16 is
                // never the thing that gives. A clamped WIDTH with aspect-ratio would silently
                // letterbox instead — an untruthful preview, which is the one bug this cannot have.
                : { position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    right: 'calc(50vw + 212px)', left: 'auto', bottom: 'auto',
                    width: 'max(160px, min(calc(50vw - 320px), 46vh))',
                    height: 'auto', aspectRatio: frameAspect,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.35)', overflow: 'hidden' })
            : { position: 'absolute', inset: 0 }}
            ref={frameRef}>
          <Suspense fallback={<CakeSpinnerFill label="Loading 3D cake…" />}>
            <CakeCanvas
              // Non-null only while the reel panel is open. Paints the scene's sky and floor one
              // colour and puts the editing furniture away — see CakeScene's filmGround.
              filmGround={framing ? takeGround : null}
              // No sky and no floor — the cake on nothing. Only ever true for a photo.
              filmCutout={framing && photoCutout}
              // A photograph frames the cake that is there; the editor's topper headroom is dead
              // space in it. Reel excluded on purpose — see FitCakeToView.
              filmTight={photoFraming}
              config={canvasConfig}
              selectedGarnishId={selectedGarnishId}
              onGarnishSelect={id => { setSelectedGarnishId(id); selectExclusive({ type: 'garnish', id }); }}
              /* The patch is only the keys the drag changed, so updateGarnish MERGES — anything the
                 customer set (size, standing or lying) survives being moved. */
              onGarnishMove={(id, patch) => updateGarnish(id, patch)}
              autoRotate={creamAutoRotate}
              creamPaint={creamPaint}
              onCreamPaint={handleCreamPaint}
              selectedTier={selectedTier}
              onTierClick={handleTierClick}
              onDeselect={handleDeselect}
              selectedPiping={selectedPiping}
              highlightPipingId={elementStackOpen ? expandedPipingId : null}
              onTopPipingSelect={handleTopPipingSelect}
              onBottomPipingSelect={handleBottomPipingSelect}
              pipingTarget={pipingTarget}
              onPipingStyleSelect={handlePipingStyleSelect}
              onPipingCancel={() => setPipingTarget(null)}
              pipingStyles={[]}
              pipingToolbar={selectedPiping !== null ? buildToolbar(selectedEl) : null}
              onPipingInstanceMove={handlePipingInstanceMove}
              isPipingMovable={isPipingMovable}
              selectedGenerated={
                selectedEl?.type === 'cloud' || selectedEl?.type === 'rainbow'
                  ? { kind: selectedEl.type, id: selectedEl.id }
                  : null}
              /* Clicking the cloud itself selects it — the card opens and its handle appears. Until
                 this, the only way in was the card, and the only way to the card was the stack: you
                 had to find the thing you were already looking at. */
              onCloudClick={(tier, id) => {
                selectExclusive({ type: 'cloud', tierIndex: tier, id });
              }}
              onRainbowClick={(tier, id) => {
                selectExclusive({ type: 'rainbow', tierIndex: tier, id });
              }}
              onCloudMove={handleCloudMove}
              onRainbowMove={handleRainbowMove}
              grassMode={selectedEl?.type === 'grass'}
              grassSelected={grassSelected}
              onGrassMove={handleGrassMove}
              onGrassSelect={(tier, idx) => setGrassSelected({ tier, idx })}
              blocksMode={selectedEl?.type === 'blocks'}
              blocksSelected={blocksSelected}
              onBlockMove={handleBlockMove}
              onBlockSelect={(tier, idx) => setBlocksSelected({ tier, idx })}
              selectedTextId={selectedTextId}
              onTextSelect={handleTextSelect}
              onTextMove={(id, pos) => updateText(id, pos)}
              onTextContentChange={(id, content) => updateText(id, { content })}
              textToolbar={null /* text now edits via the right-side popup, not a floating strip */}
              selectedAgeId={selectedAgeId}
              onAgeSelect={id => { setColorOpen(false); setExpandedPipingId(null); setToolsOpen(false); setElementsOpen(false); selectExclusive({ type: 'age', id }); }}
              onAgeMove={(id, pos) => updateAge(id, pos)}
              onWritingClick={id => { setColorOpen(false); setExpandedPipingId(null); setToolsOpen(false); selectExclusive({ type: 'writing', id }); setElementsOpen(false); }}
              onWritingMove={(id, moves) => updateWriting(id, moves)}
              selectedWritingId={selectedWritingId}
              penDrawMode={selectedEl?.type === 'tool' && selectedEl.tool === 'pen' && !penMove}
              penMoveMode={selectedEl?.type === 'tool' && selectedEl.tool === 'pen' && penMove}
              onMoveStroke={updateStrokePoints}
              penStyle={penStyle}
              onAddStroke={addStroke}
              dustMode={selectedEl?.type === 'tool' && selectedEl.tool === 'luster-dust'}
              dustSelected={{ tier: dustTier, idx: dustSel }}
              onDustMove={(tier, idx, u, v) => updateDustSplash(tier, idx, { u, v })}
              onDustSelect={(tier, idx) => { setDustTier(tier); setDustSel(idx); }}
              foilMode={selectedEl?.type === 'foil'}
              foilSelected={{ tier: foilTier, idx: foilSel }}
              onFoilMove={(tier, idx, u, v) => updateFoilFlake(tier, idx, { u, v })}
              onFoilSelect={(tier, idx) => { setFoilTier(tier); setFoilSel(idx); }}
              selectedStickerIds={selectedStickerIds}
              onStickerSelect={handleStickerSelect}
              onStickerLongPress={handleStickerLongPress}
              onStickerMove={handleStickerMove}
              onGroupMove={handleGroupMove}
              onMoveMany={handleMoveMany}
              stickerToolbar={null}
              stickerResize={stickerResize}
              isStickerMovable={isStickerMovable}
              hitTestRef={hitTestRef}
              snapCameraRef={snapCameraRef}
              turnCameraRef={turnCameraRef}
              takeRef={canRecordReel ? takeRef : null}
              onAngleChange={setPhotoAngle}
              cameraPosition={isMobile ? CAMERA_POSITION_MOBILE : CAMERA_POSITION}
            />
          </Suspense>
          {/* ── The name, as it will be burned in ────────────────────────────────────────────────
              Inside the 9:16 box and nowhere else, so it moves and scales with the frame.

              A DOM overlay rather than something drawn into the scene, because that is the cheap
              honest option: the recorder writes this same line with canvas 2D from the SAME
              fractions in reelCaption.js, so the two agree by construction rather than by anyone
              remembering to keep them in step. What differs is only the rasteriser.

              ⚠️ pointerEvents none. This sits over the canvas, and the baker is still dragging to
              frame the cake underneath it. */}
          {framing && frameH > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0,
              // CAPTION.bottomFrac is to the text's BASELINE, so the box is bottom-aligned there and
              // the line sits on it — matching where fillText puts it with textBaseline 'alphabetic'.
              bottom: `${CAPTION.bottomFrac * 100}%`,
              textAlign: 'center', pointerEvents: 'none',
              fontFamily: CAPTION.family,
              fontWeight: CAPTION.weight,
              fontSize: frameH * CAPTION.sizeFrac,
              letterSpacing: frameH * CAPTION.sizeFrac * CAPTION.trackingFrac,
              lineHeight: 1,
              color: captionColours(takeGround).fill,
              textShadow: `0 0 ${frameH * CAPTION.sizeFrac * 0.5}px ${captionColours(takeGround).halo}`,
            }}>{captionOnFrame}</div>
          )}
          </div>
          </div>

          {/* ONE loader for the whole canvas while any decoration loads (e.g. opening a
              template with many elements) — never one badge per element. */}
          <DecorLoadingOverlay />

          {/* ── Sticker & topper edit popup (DOM overlay — desktop only) ──
              A right-side vertical popup, matching the cream-piping popup so element
              editing is consistent across the designer. */}
          {/* Right-side accordion stack on every viewport — same chrome as the cream-piping
              popup. A bottom sheet was rejected: as the controls grow it expands upward and
              hides the cake, whereas a right-side popup scrolls within a fixed column. */}
          {/* ── Multi-select group bar — shows ONLY in the explicit multi-select gesture
                (ctrl/long-press). A multi-instance card selection (scatter/decorEl/group/pattern)
                sets selectedStickerIds too, but must NOT trip grouping — grouping is opt-in. ── */}
          {multiSelectMode && selectedEl?.type !== 'pattern' && selectedEl?.type !== 'group' && (() => {
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
                  <button style={{ ...s.groupBarBtn, color: '#1a1a1a', borderColor: '#999999' }}
                    onClick={() => {
                      // Group, then open the new group's card so size/ungroup/remove are right there.
                      const gid = groupStickers(ids);
                      setColorOpen(false);
                      setMultiSelectMode(false);
                      setSelectedStickerIds(new Set(ids));
                      setSelectedEl({ type: 'group', groupId: gid });
                    }}>
                    Group
                  </button>
                )}
                {ids.length > 1 && allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#1a1a1a', borderColor: '#999999' }}
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

          {/* Rides above the edit sheet rather than behind it. Pinned to `bottom: 12` of the canvas
              area, it sat inside the sheet's box and showed through the frosting — legible enough to
              read, which is worse than either hiding it or moving it. It still applies while the
              sheet is open: you can rotate the cake to check the colour you just picked. */}
          <div style={{ ...s.rotateHint, ...(isMobile && showRightPanel ? { bottom: editSheetH + 12 } : {}) }}>
            Drag to rotate
          </div>

          {/* ── Number topper edit popup (right-side) — self-contained, not cap-driven ── */}
          {selectedAge && (
            <div style={isMobile ? s.wheelPanelMobile : s.wheelPanel}>
              <div style={s.wheelHeader}>
                <span style={s.wheelTitle}>Number topper</span>
                <button style={s.iconBtn} onClick={() => setSelectedEl(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '2px' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: 0.3, marginBottom: 4 }}>AGE</div>
                  <input
                    type="text" inputMode="numeric" maxLength={3} placeholder="e.g. 30"
                    value={selectedAge.value}
                    onChange={e => updateAge(selectedAge.id, { value: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #C5D4C8', fontSize: 18, fontWeight: 800, color: '#b8860b', textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SizeDial size={selectedAge.size ?? 0.95} min={0.4} max={2} step={0.05} onChange={v => updateAge(selectedAge.id, { size: v })} />
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: '#b29aa2', textTransform: 'uppercase', letterSpacing: 0.5 }}>Size</span>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#888', marginBottom: 4 }}>FINISH</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['gold', 'silver'].map(f => (
                      <button key={f} onClick={() => updateAge(selectedAge.id, { finish: f })}
                        style={{ flex: 1, padding: '6px', borderRadius: 8, border: `1.5px solid ${(selectedAge.finish ?? 'gold') === f ? '#b8860b' : '#ddd'}`, background: (selectedAge.finish ?? 'gold') === f ? '#FBF1D8' : '#fff', fontSize: 11, fontWeight: 700, color: '#444', cursor: 'pointer', textTransform: 'capitalize', fontFamily: "'Quicksand',sans-serif" }}>{f}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button onClick={() => duplicateAge(selectedAge.id)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid #ddd', background: '#fff', fontSize: 11, fontWeight: 700, color: '#444', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>Duplicate</button>
                  <button onClick={() => { removeAge(selectedAge.id); setSelectedEl(null); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid #fcc', background: '#fff', fontSize: 11, fontWeight: 700, color: '#e53935', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Right edit panel — driven by element caps ── */}
          {showRightPanel && (() => {
            /* ── One sheet, one section at a time ────────────────────────────────────────────────
               The panel used to stack colour, gradient, shape and frosting in a single scrolling
               column. On a desktop that is fine — it is a tall column beside the cake. On a phone it
               made a sheet nothing could show honestly: too tall and it covered the cake, short
               enough to spare the cake and its contents were sliced with no sign anything was below.

               Tabs remove the dilemma rather than trading one horn for the other. Each section is
               shown whole, the sheet is exactly as tall as that section needs, and every section is
               one tap away with no back button.

               Desktop renders every section stacked, exactly as before — it has the room, and a tab
               strip beside a cake is a click where there was none. */
            const sections = [];

            if (((caps?.color || caps?.gradient) || hasActiveGroup) && (tierPanelVisible || colorOpen)) {
              // Offer same-material colors so a reused hue renders exactly: tier → other tier colors
              // (matte), any element → other element colors (sheened). The current selection's own
              // color is dropped (no point reoffering it).
              const pool = selectedEl?.type === 'tier' ? collectTierColors(design) : collectElementColors(design);
              const cakeColors = [...new Set(pool)].filter(c => c.toLowerCase() !== currentColor.toLowerCase());
              sections.push({ id: 'colour', label: 'Colour', node: (
                <div ref={colourWheelRef}>
                  <ColorWheel
                    key={`${selectedEl.type}-${selectedEl.index ?? selectedEl.tierIndex ?? selectedEl.id ?? 'x'}-${selectedEl.zone ?? ''}`}
                    color={wheelColor}
                    onChange={handleWheelChange}
                    cakeColors={cakeColors}
                    compact={isMobile}
                  />
                </div>
              ) });
            }

            /* Gradient is its OWN tab, not part of Colour. Measured together they came to 446px on a
               393 phone — over the 60% cap, so the one tab that must never be cut was the one that
               scrolled. Apart, Colour fits whole.

               It is only pushed when it has something to show (`stopsEligible`), so it is never a tab
               a baker taps to find empty — which is the usual argument against splitting it out. */
            if (((caps?.color || caps?.gradient) || hasActiveGroup) && (tierPanelVisible || colorOpen)
                && stopsEligible && !hasActiveGroup) {
              // "Gradient", not "Blend". Blend was a width compromise from when Shape made four tabs;
              // three fit the real word, and the panel inside this tab has always called it a
              // gradient — a tab whose label disagrees with its own contents is a small lie.
              sections.push({ id: 'gradient', label: isGlazeTier ? 'Glaze' : isTierGradient ? 'Colours' : 'Gradient', node: (
                <>
                {/* ⚠️ On the COLOUR axis, not under Style. Style is documented as geometry only and is
                    single-select, so putting stripes there would make "ribbed AND striped" —
                    a real cake — impossible to express. */}
                {isTierGradient && !isGlazeTier && (
                  <div style={s.gradientBlock}>
                    <div style={s.gradientLabel}>How the colour sits</div>
                    <div style={s.treatRow}>
                      {[['solid', 'Solid'], ['ombre', 'Ombre'], ['stripes', 'Stripes']].map(([k, lbl]) => (
                        <button key={k} onClick={() => setTreatment(k)}
                          style={{ ...s.treatBtn, ...(treatment === k ? s.treatBtnOn : null) }}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                )}
                {stripesOn ? (
                  <StripeControls
                    palette={gradStopsView} activeStop={activeStop} pending={gradPending}
                    onSelectStop={selectGradStop} onAddStop={addGradStop} onRemoveStop={removeGradStop}
                    count={tierStripes.count ?? STRIPE_DEFAULTS.count}
                    softness={tierStripes.softness ?? STRIPE_DEFAULTS.softness}
                    wobble={tierStripes.wobble ?? STRIPE_DEFAULTS.wobble}
                    onCountChange={v => setTierStripes(selectedEl.index, { count: v })}
                    onSoftnessChange={v => setTierStripes(selectedEl.index, { softness: v })}
                    onWobbleChange={v => setTierStripes(selectedEl.index, { wobble: v })}
                    presets={STRIPE_PRESETS}
                    onPreset={k => setTierStripes(selectedEl.index, STRIPE_PRESETS[k])}
                  />
                ) : (
                <GradientControls
                  stops={gradStopsView} activeStop={activeStop} mode={gradMode} pending={gradPending}
                  label={isGlazeTier ? 'Glaze colors' : 'Gradient colors'} maxStops={maxStops}
                  onSelectStop={selectGradStop}
                  onAddStop={addGradStop}
                  onRemoveStop={removeGradStop}
                  onModeChange={m => writeGradient(gradStops, m)}
                  // Cake base blends vertically (bottom→top ombre); offer the balance slider so the
                  // customer chooses which colour dominates. A glaze marble has no direction/balance —
                  // a single-entry `modes` hides the toggle, and omitting `balance` hides the slider.
                  modes={isGlazeTier ? ['marble'] : (isTierGradient ? ['vertical'] : undefined)}
                  balance={isGlazeTier ? undefined : (isTierGradient ? gradBalance : undefined)}
                  onBalanceChange={b => writeGradient(gradStops, gradMode, b)}
                />
                )}
                </>
              ) });
            }

            /* Per-tier SHAPE config — a number's digits, a rounded_rect's corner radius — all in ONE
               component, config-driven by the tier's family.

               Only offered when that family HAS a knob. A round cake has none, so the component
               renders empty, and as a tab that meant every ordinary cake carried a "Shape" you could
               tap to find nothing in. There is deliberately no shape SWITCHER here (a shape is chosen
               at "New", not swapped under a design the customer already built), so for most tiers
               there is genuinely nothing to show — and for a number cake this is the only route back
               to the digits, which is why it is conditioned rather than dropped. */
            if (selectedEl?.type === 'tier') {
              if (hasShapeControls(design.tiers[selectedEl.index])) {
                sections.push({ id: 'shape', label: 'Shape', node: (
                  <TierShapeControls
                    tier={design.tiers[selectedEl.index]}
                    index={selectedEl.index}
                    onShapeConfig={setTierShapeConfig}
                    onCornerR={setTierCornerR}
                  />
                ) });
              }

              // Frosting type (material) — buttercream | whipped | fondant | naked, driving the
              // frostings registry — plus the surface technique for the types that texture, and that
              // style's own customer-facing params. All one decision, so one tab.
              const tier  = design.tiers[selectedEl.index];
              const type  = tier?.frostingType ?? 'buttercream';
              const opts  = frostingAllowsStyles(type) ? stylesForFrosting(type) : null;
              const style = opts?.some(o => o.value === tier?.frostingStyle) ? tier.frostingStyle : DEFAULT_STYLE;
              const userParams = opts ? userStyleParams(style) : [];
              sections.push({ id: 'frosting', label: 'Frosting', node: (
                <>
                  <FrostingTypePicker
                    value={type}
                    onChange={t => setTierFrostingType(selectedEl.index, t)}
                  />
                  {opts && (
                    <FrostingStylePicker
                      value={style}
                      options={opts}
                      onChange={st => setTierFrostingStyle(selectedEl.index, st)}
                    />
                  )}
                  {userParams.length > 0 && (
                    <StyleControls
                      params={userParams}
                      values={resolveStyleParams(style, tier?.styleParams)}
                      onChange={(key, value) => setTierStyleParam(selectedEl.index, key, value)}
                    />
                  )}
                </>
              ) });
            }

            // Size — the SAME SizeDial and the SAME bounds helper as the toolbar dial and the canvas
            // resize grips. This was a hand-rolled slider with a hard-coded 0.25–3.0 range that
            // ignored placement_config.scale and a photo frame's cake cap (INVARIANTS #1/#3).
            if (caps?.resize && selectedEl?.type === 'sticker') {
              const sticker = design.stickers.find(s2 => s2.id === selectedEl.id);
              const ctl = sizeControlOf(sticker);
              if (sticker && ctl) {
                sections.push({ id: 'size', label: 'Size', node: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', paddingTop: 4 }}>
                    <SizeDial size={ctl.value} min={ctl.min} max={ctl.max} step={ctl.step}
                      onChange={v => resizeSticker(sticker, v)} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{Math.round(ctl.value * 100)}%</span>
                  </div>
                ) });
              }
            }

            if (!sections.length) return null;
            // A tab that no longer exists (the selection changed under it) falls back to the first,
            // rather than showing an empty sheet.
            const active   = sections.find(x => x.id === editTab) ?? sections[0];
            const showTabs = isMobile && sections.length > 1;

            return (
              <div ref={isMobile ? editSheetRef : null}
                   style={isMobile ? { ...s.wheelPanelMobile, ...(editDragH ? { height: editDragH } : {}) }
                     // When the element edit stack is open on the right, sit the colour wheel to its
                     // LEFT (and above it) instead of overlapping behind it. editPopup is right:10 width:200.
                     : { ...s.wheelPanel, ...(elementStackOpen ? { right: 230, zIndex: 30 } : {}) }}>
                {/* The grip the other two sheets always had and this one did not. It is no longer
                    load-bearing — nothing is hidden behind a drag any more — so it is now what it
                    should always have been: an optional way to make the picker bigger. */}
                {isMobile && (
                  <div style={s.panelHandle}
                       onPointerDown={e => startPanelDrag(e, editSheetH, setEditDragH,
                         EDIT_PANEL_MIN, Math.round(window.innerHeight * 0.88))}>
                    <div style={s.panelHandlePill} />
                  </div>
                )}
                <div style={s.wheelHeader}>
                  <span style={s.wheelTitle}>
                    {selectedEl?.type === 'tier'    ? TIER_LABELS[selectedEl.index]
                    : selectedEl?.type === 'piping'  ? `${TIER_LABELS[selectedEl.tierIndex]} ${selectedEl.zone === 'top' ? 'Top' : 'Base'}`
                    : selectedEl?.type === 'text'    ? 'Text Color'
                    : selectedEl?.type === 'sticker'
                        ? (activeGroupLabel ?? design.stickers.find(s => s.id === selectedEl.id)?.name ?? 'Sticker')
                    : selectedEl?.type === 'decorEl' ? (activeGroupLabel ?? '')
                    : ''}
                  </span>
                  <button style={s.iconBtn} onClick={() => {
                    if (tierPanelVisible) setSelectedEl(null);
                    else { setColorOpen(false); }
                  }}>✕</button>
                </div>

                {showTabs && (
                  <div style={s.editTabs} role="tablist">
                    {sections.map(sec => (
                      <button key={sec.id} role="tab" aria-selected={sec.id === active.id}
                              style={{ ...s.editTab, ...(sec.id === active.id ? s.editTabOn : {}) }}
                              // The drag is an override of THIS view, so switching view drops it and
                              // the next tab sizes to its own content.
                              onClick={() => { setEditTab(sec.id); setEditDragH(null); }}>
                        {sec.label}
                      </button>
                    ))}
                  </div>
                )}

                {isMobile
                  ? <SheetBody key={active.id}>{active.node}</SheetBody>
                  : sections.map(sec => <Fragment key={sec.id}>{sec.node}</Fragment>)}
              </div>
            );
          })()}

          {/* ── Unified element stack: decorations + piping in one accordion ── */}
          {/* The flyout's handle — phone only (see stackShown). It NEVER MOVES: parked on the right
              edge at the vertical middle, where a thumb already rests and clear of both the
              notification bell above and the Actions pill below, while the stack opens to its left
              (STACK_RIGHT_MOBILE leaves the lane). One target in one place that opens and closes.
              Tried the other way first — the handle riding the panel's edge — and it ends up floating
              in the middle of the cake whenever the panel is shorter than the stage, which is most of
              the time: it reads as a stray button rather than the handle of the thing beside it. */}
          {elementStackOpen && isMobile && (
            <button onClick={toggleStackFlyout}
              // Reads the LIST's state, not the panel's: with one card showing, the handle still
              // offers the list, so it must still point outward and still say "show".
              aria-label={stackFlyoutOpen ? 'Hide the elements on this cake' : 'Show the elements on this cake'}
              aria-expanded={stackFlyoutOpen}
              style={s.stackTab}>
              {stackFlyoutOpen ? '▶' : '◀'}
            </button>
          )}

          {elementStackOpen && stackShown && (
            <div ref={pipingPopupRef} className="piping-popup-scroll"
              style={isMobile
                // Mobile: a see-through, narrower overlay so the cake shows THROUGH the stack (the cards
                // carry the fill). Light tint + a small blur (not the heavy 18px frost, which washed the
                // cake out to white). Scroll/maxHeight kept so a long element list still works.
                ? { ...s.editPopup,
                    width: stackHasExpandedCard ? STACK_W_MOBILE_OPEN : STACK_W_MOBILE,
                    right: STACK_RIGHT_MOBILE,
                    /* An open editor needs to be READ, so it takes a solid-enough surface. The
                       see-through treatment is for the list, where the point is that the cake shows
                       through the cards. */
                    background: stackHasExpandedCard ? 'rgba(255,255,255,0.93)' : 'rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }
                : s.editPopup}>
              {/* WebKit scrollbar can't be hidden via inline style — inject the rule once. */}
              <style>{`.piping-popup-scroll::-webkit-scrollbar{width:0;height:0;display:none}`}</style>

              {/* Decoration cards (sticker / topper / text) — expanded one pinned to the top
                  of this group. Clicking the expanded card collapses it; clicking a collapsed
                  card opens it (and collapses any open piping card). */}
              {[...decorationCards]
                .filter(c => !stackSingleCard || isCardSelected(c))
                .sort((a, b) => (isCardSelected(b) ? 1 : 0) - (isCardSelected(a) ? 1 : 0))
                .map(card => {
                  const expanded = isCardSelected(card);
                  return (
                    <div key={card.key} style={stackCardStyle(expanded)}>
                      <div role="button"
                        onClick={() => expanded ? clearAllSelections() : selectDecorationCard(card)}
                        style={stackCardHeaderStyle(expanded)}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #999999', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {card.thumb
                            ? <img src={card.thumb} alt={card.name} width={26} height={26} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 13, fontWeight: 800, color: '#bbb' }}>{card.glyph ?? card.name?.[0]?.toUpperCase() ?? '•'}</span>}
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1a1a1a', flex: 1, minWidth: 0, lineHeight: 1.2, fontFamily: "'Quicksand',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</span>
                        <span style={{ fontSize: 9, color: '#1a1a1a', flexShrink: 0, transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▼</span>
                      </div>
                      {expanded && (
                        <div style={{ padding: '0 9px 9px' }}>
                          {card.type === 'pattern' ? renderPatternBody(card)
                           : card.type === 'group' ? renderGroupBody(card)
                           : card.type === 'scatter' ? renderScatterBody(card)
                           : card.type === 'cluster-place' ? renderClusterPlaceBody(card)
                           : card.type === 'cluster' ? renderClusterBody(card)
                           : card.type === 'foil' ? renderFoilBody(card)
                           : card.type === 'cream' ? renderCreamBody()
                           : card.type === 'cloud' ? renderCloudBody(card)
                           : card.type === 'rainbow' ? renderRainbowBody(card)
                           : card.type === 'grass' ? renderGrassBody()
                           : card.type === 'blocks' ? renderBlocksBody()
                           : card.type === 'garnish' ? renderGarnishBody(card.garnish)
                           : card.type === 'tool' ? (card.tool === 'pen' ? renderPenBody() : renderDustBody())
                           : buildToolbar(selectedEl, 'panel')}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Writing cards (typed cream "Texts") — ONE PER MESSAGE, since each carries its own
                  surface. Its expanded body is the full composer. Like the others each stays until
                  "Remove" deletes that message. An untyped one still gets a card: it is the thing
                  you type into, so it cannot wait for content to exist. */}
              {writings.map(wr => !(stackSingleCard && selectedWritingId !== wr.id) && (() => {
                const expanded = selectedWritingId === wr.id;
                const name = (wr.text && wr.text.trim()) || 'Texts';
                return (
                  <div key={`writing-${wr.id}`} style={stackCardStyle(expanded)}>
                    <div role="button"
                      onClick={() => {
                        if (expanded) { clearAllSelections(); }
                        else { setColorOpen(false); setExpandedPipingId(null); setToolsOpen(false); selectExclusive({ type: 'writing', id: wr.id }); }
                      }}
                      style={stackCardHeaderStyle(expanded)}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #999999', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#bbb' }}>T</span>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1a1a1a', flex: 1, minWidth: 0, lineHeight: 1.2, fontFamily: "'Quicksand',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      <span style={{ fontSize: 9, color: '#1a1a1a', flexShrink: 0, transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▼</span>
                    </div>
                    {expanded && (
                      <div style={{ padding: '0 9px 9px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {renderWritingEditor()}
                      </div>
                    )}
                  </div>
                );
              })())}

              {/* Piping cards — one collapsible card per added piping element. Picking a
                  new element from the left appends a card here; the cake renders all of them
                  stacked. Only the expanded card shows its rim/board controls — pinned to the
                  top of this group, the rest collapse to compact headers below. */}
              {(expandedPipingId
                ? [pipingCards.find(c => c.cardId === expandedPipingId), ...pipingCards.filter(c => c.cardId !== expandedPipingId)].filter(Boolean)
                : pipingCards
              ).filter(c => !stackSingleCard || c.cardId === expandedPipingId)
               .map((card) => {
                const expanded = card.cardId === expandedPipingId;
                // Number instances of the SAME element ("Soft Swirl 1", "Soft Swirl 2", …)
                // so duplicate cards are distinguishable; a lone instance stays unnumbered.
                const sameEl = pipingCards.filter(c => c.id === card.id);
                const title  = sameEl.length > 1 ? `${card.name} ${sameEl.indexOf(card) + 1}` : card.name;
                return (
                <div key={card.cardId} style={stackCardStyle(expanded)}>
                  {/* Card header: thumbnail + element name + expand/collapse arrow.
                      No close button — a layer leaves the cake by unchecking its rings. */}
                  <div role="button"
                    onClick={() => {
                      const opening = expandedPipingId !== card.cardId;
                      setExpandedPipingId(opening ? card.cardId : null);
                      if (opening) { setSelectedEl(null); setSelectedStickerIds(new Set()); setMultiSelectMode(false); }
                    }}
                    style={stackCardHeaderStyle(expanded)}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #999999', background: '#fff', flexShrink: 0 }}>
                      {thumbSrc(card) && <img src={thumbSrc(card)} alt={card.name} width={26} height={26} loading="lazy" decoding="async" onError={onThumbError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1a1a1a', flex: 1, minWidth: 0, lineHeight: 1.2, fontFamily: "'Quicksand',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                    <span style={{ fontSize: 9, color: '#1a1a1a', flexShrink: 0, transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▼</span>
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
              // ⚠️ Always deletable, like every other decoration — see the note on `delete` in the
              // toolbar actions. This read the element's allowed_actions.delete; a piped ring a baker
              // could not remove is the same trap as a topper they could not remove, and leaving this
              // one gated while the others opened would put the inconsistency back in a new place.
              const pipingDeletable = true;
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
                <div style={{ borderTop: '1px solid #999999', paddingTop: 9, fontSize: 9.5, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", lineHeight: 1.45 }}>
                  A rim is fully packed with nested rings — this style is offered on the side instead so they don't overlap.
                </div>
              )}
              {multi && allowsBoard && !yAdjustable && (
                <div style={{ borderTop: '1px solid #999999', paddingTop: 9, fontSize: 9.5, color: '#b29aa2', fontFamily: "'Quicksand',sans-serif", lineHeight: 1.45 }}>
                  Board is on the bottom tier only — upper tiers rest on the rim of the tier below.
                </div>
              )}
              {candidates.map(({ tierIndex, zone, label }) => {
                const isTopZone     = zone === 'rim';
                const applied       = ringPiping(tierIndex, zone);
                // Unapplied rim rings preview at the inward offset they'd nest to once added.
                const nestRO        = (isTopZone && !applied) ? nextRimRadialOffset(tierIndex) : null;
                const p             = applied ?? { color: pipingPopupEl.default_color ?? '#f5e6c8', size: 1, ...pipingPlacementFromConfig(pipingPopupEl.placement_config, isTopZone), ...(nestRO ? { userRadialOffset: nestRO } : {}) };
                const color         = p.color ?? '#f5e6c8';
                const size          = p.size  ?? 1;
                const pc            = pipingPopupEl.placement_config ?? {};
                const isDrip        = !!pc.top_drip;   // chocolate-drip ring → Length + Gloss, not Size
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
                // Round tiers measure a piping offset RADIALLY; every other footprint measures it as an
                // inset from the edge. toCanvasConfig emits `shape` only for a non-round tier, so its mere
                // presence is the test — comparing to 'rect' called a heart's offset "Radial", and would
                // have called every shape authored after it that too.
                const isNonRoundTier = !!canvasConfig.tiers[tierIndex]?.shape;
                return (
                  <div key={`${zone}-${tierIndex}`} style={{ borderTop: '1px solid #999999', paddingTop: 10, paddingBottom: 4 }}>
                    {/* Shared preview tile (same component as the placement chooser). */}
                    <PreviewTile checked={!!applied} label={label}
                      locked={!pipingDeletable}
                      onToggle={() => togglePipingZone(tierIndex, zone, !!applied)}>
                      <PipingPreview zone={zone} glbUrl={previewGlb} color={color} size={size}
                        tiers={canvasConfig.tiers} tierIndex={tierIndex}
                        placement={previewPlacement} arrangement={arrangement} instances={zoneInstances} />
                    </PreviewTile>
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
                      {isDrip ? (<>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <SizeDial size={p.dripLength ?? 1} min={0.4} max={2} step={0.05} onChange={v => handleDripLengthChange(tierIndex, zone, v)} />
                          <span style={cap}>Length</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <SizeDial size={p.dripGloss ?? 0.85} min={0} max={1} step={0.05} onChange={v => handleDripGlossChange(tierIndex, zone, v)} />
                          <span style={cap}>Gloss</span>
                        </div>
                      </>) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <SizeDial size={size} onChange={v => handlePipingSizeChange(tierIndex, zone, v)} />
                          <span style={cap}>Size</span>
                        </div>
                      )}
                    </div>

                    {/* Drip: flood the whole tier top with chocolate (vs. just the rim + drips). */}
                    {isDrip && (
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Quicksand',sans-serif" }}>
                        <input type="checkbox" checked={p.dripFlood ?? false}
                          onChange={e => handleDripFloodChange(tierIndex, zone, e.target.checked)}
                          style={{ accentColor: '#1a1a1a', width: 16, height: 16 }} />
                        Flood top
                      </label>
                    )}

                    {/* Colour picker — the same wheel as tiers, floated as a popup. Portaled to
                        <body> so it escapes the card's narrow, backdrop-blurred scroll container
                        (a backdrop-filter ancestor would otherwise trap a fixed-positioned child).
                        Anchored to the left of the tapped Color dot, clamped to the viewport. */}
                    {pipingColorKey === `${card.cardId}-${zone}-${tierIndex}` && pipingColorAnchor && createPortal(
                      (() => {
                        const PAD = 14;
                        // Wheel shrinks to fit narrow / pinch-zoomed viewports so the popup box
                        // (wheel + padding) never exceeds the screen.
                        const vw = window.innerWidth;
                        const wheelW = Math.max(150, Math.min(216, vw - 2 * PAD - 16));
                        const popupW = wheelW + 2 * PAD;
                        // Placement is AnchoredPopup's job now. It used to be an EST_H = 400 guess
                        // here, and the guess was too small — this popup carries a wheel, a swatch
                        // grid, colours-from-cake and a gradient row — so the bottom fell off the
                        // screen whenever the swatch sat low enough to expose it.
                        // Gradient eligibility is CONFIG only — the piping element's allowed_actions.gradient.
                        // Stops/mode live on the ring layer (p.gradient); `color` is the solid/stop-0 fallback.
                        const gradEligible = !!pipingPopupEl?.allowed_actions?.gradient;
                        const gStops  = p.gradient?.colors?.length ? p.gradient.colors : [color];
                        const gMode   = p.gradient?.mode ?? 'swirl';
                        const gActive = Math.min(gradStop, Math.max(0, gStops.length - 1));
                        const wheelColor = gradEligible ? (gStops[gActive] ?? color) : color;
                        const onWheel = c => {
                          if (!gradEligible) { handlePipingColorChange(tierIndex, zone, c); return; }
                          const next = gStops.slice(); next[gActive] = c;
                          if (next.length < 2) handlePipingColorChange(tierIndex, zone, c);
                          else writePipingGradient(tierIndex, zone, next, gMode);
                        };
                        return (
                          <AnchoredPopup
                            anchor={pipingColorAnchor}
                            width={popupW}
                            style={{ zIndex: 4000, background: '#fff', borderRadius: 16, padding: PAD,
                                     boxShadow: '0 12px 44px rgba(0,0,0,0.24)', border: '1px solid #eadde2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#1a1a1a', textTransform: 'uppercase' }}>{label}</span>
                              <button style={s.iconBtn} onClick={() => setPipingColorKey(null)}>✕</button>
                            </div>
                            <ColorWheel
                              color={wheelColor}
                              onChange={onWheel}
                              width={wheelW}
                              cakeColors={[...new Set(collectElementColors(design))].filter(c => c.toLowerCase() !== color.toLowerCase())}
                            />
                            {gradEligible && (
                              <GradientControls
                                stops={gStops} activeStop={gActive} mode={gMode}
                                onSelectStop={setGradStop}
                                onAddStop={() => { if (gStops.length >= 3) return; const next = [...gStops, gStops[gStops.length - 1]]; writePipingGradient(tierIndex, zone, next, gMode); setGradStop(next.length - 1); }}
                                onRemoveStop={i => { writePipingGradient(tierIndex, zone, gStops.filter((_, idx) => idx !== i), gMode); setGradStop(0); }}
                                onModeChange={m => writePipingGradient(tierIndex, zone, gStops, m)}
                              />
                            )}
                          </AnchoredPopup>
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
                              style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${on ? '#1a1a1a' : '#999999'}`, background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a', cursor: 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif", textTransform: 'capitalize' }}>
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
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1.5px solid #1a1a1a', background: zoneInstances.length >= maxInstances ? '#f0e0e5' : '#1a1a1a', color: zoneInstances.length >= maxInstances ? '#c9a9b3' : '#fff', cursor: zoneInstances.length >= maxInstances ? 'default' : 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif", flexShrink: 0 }}>
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
                                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${rotPct}%`, background: '#1a1a1a', borderRadius: 2 }} />
                                </div>
                                <div style={{ position: 'absolute', left: `${rotPct}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#1a1a1a', pointerEvents: 'none' }} />
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

                    {/* ── Adjust: radial distance + flip + height on one row ── (not for drip rings) */}
                    {!isDrip && (<>
                        <div style={secRow}><span style={secTitle}>Adjust</span><div style={hair} /></div>
                        {/* Each control is its OWN full-width row (label left, stepper right) and
                            wraps internally, so nothing — including Reset — can clip off the edge. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
                          {/* Radial/inset — every ring except a wrap band, which auto-hugs the wall. */}
                          {!p.wrap && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', flexWrap: 'wrap' }}>
                            <span style={{ ...lbl, flex: 1, minWidth: 0 }}>{isNonRoundTier ? 'Inset' : 'Radial'}</span>
                            <button
                              title="Move inward"
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #999999', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              onPointerDown={e => { e.stopPropagation(); handlePipingRadialOffsetChange(tierIndex, zone, +(radial - 0.05).toFixed(2)); }}>−</button>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#444', minWidth: 32, textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}>
                              {radial > 0 ? `+${radial.toFixed(2)}` : radial.toFixed(2)}
                            </span>
                            <button
                              title="Move outward"
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #999999', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
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
                                  style={{ fontSize: 11, padding: '3px 11px', borderRadius: 6, border: `1.5px solid ${active ? '#1a1a1a' : '#999999'}`, background: active ? '#1a1a1a' : '#fff', color: active ? '#fff' : '#1a1a1a', cursor: 'pointer', fontWeight: 700, fontFamily: "'Quicksand',sans-serif" }}>
                                  {active ? '↕ On' : '↕ Off'}
                                </button>
                              </div>
                            );
                          })()}
                          {yAdj && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', flexWrap: 'wrap' }}>
                              <span style={{ ...lbl, flex: 1, minWidth: 0 }}>Height</span>
                              <button
                                style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #999999', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, +(boardY - 0.05).toFixed(2)); }}>−</button>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#444', minWidth: 32, textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}>
                                {boardY > 0 ? `+${boardY.toFixed(2)}` : boardY.toFixed(2)}
                              </span>
                              <button
                                style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #999999', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, +(boardY + 0.05).toFixed(2)); }}>+</button>
                              {boardY !== 0 && (
                                <button
                                  style={{ fontSize: 9, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: "'Quicksand',sans-serif" }}
                                  onPointerDown={e => { e.stopPropagation(); handlePipingBoardYOffsetChange(tierIndex, 0); }}>Reset</button>
                              )}
                            </div>
                          )}
                        </div>
                      </>)}
                  </div>
                );
              })}
              {/* ── Or put it where you like ────────────────────────────────────────────────────
                  Every tile above answers "which BORDER does this ring go round". Between them they
                  cover a rim and a board, which is most of what gets piped and nowhere near all of
                  it — a baker pipes wherever they want, and until now the zone list was the entire
                  vocabulary a customer had.

                  Offered here rather than as its own decoration because it is the SAME shape and the
                  same decision: you are choosing where this piping goes, and "anywhere I draw" is one
                  of the answers. A separate card would have made it a different product.

                  Only when there is a GLB to repeat. A piping pattern that resolves to nothing would
                  put the cake in draw mode and then stamp nothing at all, which reads as the drawing
                  being broken. */}
              {/* ── Gated on the element, not on the designer ─────────────────────────────────
                  `hand_piping` is ticked per element in admin, by whoever calibrated it. Not every
                  piping element survives being repeated along a freehand line: a wrap band is ONE
                  pre-formed ring and a drip is a procedural curtain, both rings by nature, and
                  stamping either along a squiggle produces something nobody would pipe. A shell or
                  a rosette repeats happily.
                  Absent means OFF. An element nobody has considered does not get the feature by
                  default — the alternative is offering it everywhere and finding out on a customer's
                  cake which elements it ruins. */}
              {!!pipingPopupEl.placement_config?.hand_piping
                && !!resolvePipingGlbs(pipingPopupEl).glbUrl && (
                <div style={{ borderTop: '1px solid #999999', paddingTop: 10, marginTop: 2 }}>
                  <button
                    onClick={() => pipeItMyself(pipingPopupEl)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                             padding: '10px 11px', borderRadius: 10, cursor: 'pointer',
                             border: '1.5px solid #999999', background: '#fff',
                             fontFamily: "'Quicksand',sans-serif", textAlign: 'left' }}>
                    {/* A hand-drawn squiggle with beads along it — the line you draw, and this shape
                        repeating down it. The zone tiles are all rings; this one must not look like
                        another ring or it reads as a seventh border. */}
                    <svg width="26" height="18" viewBox="0 0 34 20" fill="none" aria-hidden focusable="false"
                         style={{ flexShrink: 0 }}>
                      <path d="M2 14C6 4 11 4 15 10s9 6 13 -4" stroke="#c9c1b4" strokeWidth="1.6"
                            strokeLinecap="round" strokeDasharray="2.6 2.6" />
                      {[[3.4, 12.4], [8.2, 6.4], [13.2, 8.2], [18.4, 12], [23.6, 11.2], [28.4, 5.2]].map(([cx, cy], i) => (
                        <circle key={i} cx={cx} cy={cy} r="2.4" fill="#f3ece2" stroke="#8a8288" strokeWidth="1.2" />
                      ))}
                    </svg>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1a1a1a' }}>I'll pipe it myself</span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: '#b29aa2', lineHeight: 1.4 }}>
                        Draw anywhere on the cake and this shape repeats along your line.
                      </span>
                    </span>
                  </button>
                </div>
              )}
              {/* Card-level Remove — takes the whole decoration off the cake (every tier × zone), the same
                  action the sticker/cluster/foil/cream cards offer. The per-zone checkboxes above stay as
                  the fine-grained control. Config-gated on allowed_actions.delete; hidden when it isn't
                  on the cake at all (nothing to remove). */}
              {pipingDeletable && candidates.some(c => ringPiping(c.tierIndex, c.zone)) && (
                <div style={{ borderTop: '1px solid #999999', paddingTop: 10, marginTop: 2 }}>
                  <button
                    onPointerDown={e => { e.stopPropagation(); removePipingCard(pipingPopupEl.cardId); }}
                    style={{ fontSize: 11, fontWeight: 700, color: '#e53935', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", padding: 0 }}>
                    Remove
                  </button>
                </div>
              )}
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

      {/* ── Order + actions bar ──────────────────────────────────────────────────────────────────
          Hidden on a phone while the edit sheet is open. Two reasons, and the second is the one that
          mattered: "Create order for customer" and "Share the draft" are order-level acts that
          nobody wants mid-recolour — and sitting six pixels under the sheet, it turned the sheet's
          bottom edge into a floor. A baker seeing a cut-off picker directly above a solid button bar
          reads the whole thing as finished, which is precisely what was reported. */}
      {selectedEl?.type !== 'text' && !(isMobile && showRightPanel) && (
        (hasCap('template:manage') || hasCap('customer:manage')) && isMobile ? (
          /* Baker/staff on mobile: a compact ⋮ actions menu + Share, so the bar doesn't crowd the canvas.
             Customers (no manage caps) fall through to the prominent CTA below. */
          <div style={{ ...s.orderBar, padding: '6px 16px 10px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button
                style={{ ...s.orderBtn, ...brandBtn, width: 'auto', padding: '10px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setActionsMenuOpen(o => !o)}>
                Actions <MoreIcon size={17} />
              </button>
              <ActionSheet open={actionsMenuOpen} onClose={() => setActionsMenuOpen(false)} align="center">
                <button style={SHEET_ITEM} onClick={() => { setActionsMenuOpen(false); handleOrder(); }}>
                  {editingOrder ? 'Update Design' : 'Create order for customer'}
                </button>
                {hasCap('template:manage') && <button style={SHEET_ITEM} onClick={() => { setActionsMenuOpen(false); setSaveModal(true); }}>
                  Save as Template
                </button>}
                {hasCap('customer:manage') && <button style={SHEET_ITEM} onClick={() => { setActionsMenuOpen(false); handleShareDraft(); }}>
                  Share draft to customer
                </button>}
                {/* Beside the other things you do to a FINISHED cake, not in a tools or settings
                    menu — those hold things you configure or things that help you make a cake, and
                    this is neither. See spattoo-docs/plans/reel-for-bakers.md §1b. */}
                {canRecordReel && <button style={{ ...SHEET_ITEM, display: 'flex', alignItems: 'center', gap: 10 }}
                        onClick={() => { setActionsMenuOpen(false); openReelPanel(); }}>
                  <ReelIcon size={17} />
                  Record a reel
                </button>}
                {/* Above the reel, not below it, and gated the same way. A photo is the thing most
                    bakers actually need most days — a reply to "can I see it?" on WhatsApp — where a
                    reel is what they make when they are posting deliberately. Same panel shape, same
                    framing, same name-on-the-frame rule. */}
                {canRecordReel && <button style={{ ...SHEET_ITEM, display: 'flex', alignItems: 'center', gap: 10 }}
                        onClick={() => { setActionsMenuOpen(false); openPhotoPanel(); }}>
                  <CameraIcon size={17} />
                  Take a photo
                </button>}
              </ActionSheet>
            </div>
          </div>
        ) : (
          /* Customer prominent CTA, and the full desktop button row — unchanged. */
          <div style={{ ...s.orderBar, ...(isMobile ? { padding: '6px 16px 10px' } : { maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', justifyContent: 'center' }), display: 'flex', gap: 8 }}>
            <button
              data-tour="quote"
              style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
              onClick={handleOrder}>
              {editingOrder ? 'Update Design' : orderMode === 'customer' ? 'Request a Quote' : 'Order This Cake'}
            </button>
            {hasCap('template:manage') && <button
              style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', opacity: 0.75, ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
              onClick={() => setSaveModal(true)}>
              Save as Template
            </button>}
            {hasCap('customer:manage') && <button
              style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', opacity: 0.75, ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
              onClick={handleShareDraft}>
              Share the draft
            </button>}
            {/* ── ONE "Capture", opening onto the two takes ────────────────────────────────────
                The quietest button in the row, deliberately: every other action here leads to money
                — an order, a customer, a saved template — and this one leads to a file. It earns its
                place next to them because it is the same KIND of act (something you do with a
                finished cake), not because it is as important.

                ⚠️ Which is exactly why it is ONE button and not two. Photo and reel arrived as
                siblings in this row and immediately took two of its five slots, so the quiet corner
                of the bar became its widest thing — "Record a reel" and "Take a photo" side by side
                shouted louder than "Order This Cake". They are the same act at two lengths, so they
                collapse into one name and the choice moves one tap in.

                Reuses ActionSheet, the popover the phone's ⋮ menu already uses — its item styling and
                its click-away overlay live in one place, and a second desktop-only dropdown would be
                the same widget written twice. It opens UPWARD, which is right: this row sits at the
                bottom of the window. */}
            {canRecordReel && (
              <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                <button
                  style={{ ...s.orderBtn, ...brandBtn, width: '100%', whiteSpace: 'nowrap', opacity: 0.6,
                           display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                           ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
                  aria-haspopup="menu" aria-expanded={captureMenuOpen}
                  onClick={() => setCaptureMenuOpen(o => !o)}>
                  <CameraIcon size={15} />
                  Capture
                  {/* The dots say "there is more behind this" without naming either take — a caret
                      would promise a list, and this is a list of two. */}
                  <span aria-hidden style={{ letterSpacing: 1, opacity: 0.75, fontSize: 15, lineHeight: 1 }}>⋯</span>
                </button>
                <ActionSheet open={captureMenuOpen} onClose={() => setCaptureMenuOpen(false)} align="center">
                  <button style={{ ...SHEET_ITEM, display: 'flex', alignItems: 'center', gap: 10 }}
                          onClick={() => { setCaptureMenuOpen(false); openPhotoPanel(); }}>
                    <CameraIcon size={17} />
                    Take a photo
                  </button>
                  <button style={{ ...SHEET_ITEM, display: 'flex', alignItems: 'center', gap: 10 }}
                          onClick={() => { setCaptureMenuOpen(false); openReelPanel(); }}>
                    <ReelIcon size={17} />
                    Record a reel
                  </button>
                </ActionSheet>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Mobile bottom nav ─────────────────────────────────────────────────────────────────────
          A flat strip: four destinations and a More sheet. Both halves come from the SAME railItems
          the desktop rail draws and go through the same openRailItem — the phone used to keep its
          own copy of the list and its own click handler, and the copies drifted until Uploads
          existed on the rail and nowhere on the phone. */}
      {isMobile && (
        <>
          {/* The scrim stops ABOVE the strip rather than covering it. A dimmed nav bar looks
              disabled at the exact moment its most useful job is letting you leave — tapping a
              different destination should switch, not merely dismiss. */}
          {mobileMoreOpen && <div style={s.mobileSheetScrim} onClick={() => setMobileMoreOpen(false)} />}
          {mobileMoreOpen && (
            <div style={s.mobileSheet} role="menu">
              <div style={s.mobileSheetGrip} />
              <div style={s.mobileSheetGrid}>
                {mobileSecondary.map(({ id, icon, label }) => (
                  <button key={id} role="menuitem"
                          style={{ ...s.mobileSheetItem, ...(railItemActive(id) ? s.mobileSheetItemOn : {}) }}
                          onClick={() => { setMobileMoreOpen(false); openRailItem(id); }}>
                    {icon}
                    <span style={s.mobileSheetLabel}>{label}</span>
                  </button>
                ))}
              </div>

              {/* ── Chef's Desk and Settings, arrived from the header ────────────────────────────
                  Rendered FLAT, as rows under a heading, because the sheet has no surface for a
                  submenu — mobileNav.js states that invariant and `strandedMenus` shouts when a
                  nav item breaks it. A button here that opened a dropdown would open nothing.

                  Rows rather than grid tiles: these have no icons of their own, and inventing five
                  glyphs to make them fit a three-across grid would be decoration standing in for
                  meaning. The list is short and the words are the point. */}
              {canManageStore && toolMenus.map(menu => (
                <div key={menu.id} style={s.mobileSheetSection}>
                  <div style={s.mobileSheetSectionTitle}>{menu.label}</div>
                  {menu.items.map(item => (
                    <button key={item.id} role="menuitem" style={s.mobileSheetRow}
                            onClick={() => { setMobileMoreOpen(false); item.open(); }}>
                      {item.label}
                      {item.badge && <span style={s.needsLook} title={item.badge.title}>{item.badge.text}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div style={s.mobileBottomNav}>
            {mobilePrimary.map(({ id, icon, label, short, menu }) => {
              const active = railItemActive(id, menu);
              // The + is a ring rather than a glyph — a different SHAPE for the same item, which is
              // why 'new' stays in railItems instead of being drawn separately.
              const slot = (
                <button style={{ ...s.mobileNavSlot, ...(active ? s.mobileNavSlotOn : {}) }}
                        data-tour={id}
                        onClick={() => openRailItem(id, menu)}>
                  <span style={id === 'new' ? s.mobileNavPlus : s.mobileNavIcon}>
                    {id === 'new' ? <PlusGlyph size={20} /> : icon}
                  </span>
                  <span style={s.mobileNavLabel}>{short ?? label}</span>
                </button>
              );
              // Every slot gets the SAME wrapper, including the ones with no submenu. RailSubmenu
              // supplies one for Orders, and without a matching wrapper elsewhere the buttons were
              // direct flex children sized `1 1 auto` — basis from CONTENT, so "New" came out 47px
              // beside a much wider "Decorations". Equal-width slots are the point of a strip, and
              // the narrowest one is what decides whether the bar clears 44px.
              if (!menu) return <div key={id} style={s.mobileNavSlotWrap}>{slot}</div>;
              // Same RailSubmenu as the desktop rail, anchored UPWARD — this bar is pinned to the
              // bottom of the screen (the Settings menu re-anchors the same way). One submenu
              // component, two anchors.
              return (
                <RailSubmenu key={id} label={label} items={menu}
                  open={navMenuId === id}
                  containerRef={navMenuId === id ? navMenuRef : null}
                  style={s.mobileNavSlotWrap}
                  anchorStyle={{ top: 'auto', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' }}
                  onSelect={selectOrdersMenuItem}>
                  {slot}
                </RailSubmenu>
              );
            })}

            {mobileSecondary.length > 0 && (
              <div style={s.mobileNavSlotWrap}>
                <button style={{ ...s.mobileNavSlot, ...(mobileMoreOpen || mobileSecondaryActive ? s.mobileNavSlotOn : {}) }}
                        aria-expanded={mobileMoreOpen} aria-haspopup="menu"
                        onClick={() => { setMobileMoreOpen(o => !o); setNavMenuId(null); }}>
                  <span style={s.mobileNavIcon}><SpatulaMarkIcon size={20} /></span>
                  <span style={s.mobileNavLabel}>More</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Save as Template modal ── */}
      {saveModal && (
        <Panel onClose={closeSaveModal} title="Save as Template" width={380}>
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
                  style={{ ...s.offeringBtn, borderColor: templateOffering === o ? primaryColor : '#999999', background: templateOffering === o ? hexToRgba(primaryColor, 0.08) : '#fff', color: templateOffering === o ? primaryColor : '#666' }}
                  onClick={() => setTemplateOffering(o)}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>

            {/* ── "Minimum weight", not "Weight" ─────────────────────────────────────────────────
                It read "Weight (kg)" with a placeholder of "e.g. 1.5", and both point at the wrong
                answer: saving a three-tier showpiece, that asks how much THIS cake weighs, so a
                baker types the weight of the thing they just designed. The column then reads as a
                floor, and the storefront refuses every three-tier order under it.
                Empty was honest — floorFor returns 0 and simply does not constrain. A confident
                wrong number is worse, and silently costs orders. So the label asks the question the
                field answers, and the placeholder reads as a floor rather than a typical cake.
                Not "smallest size": size means inches to a baker, and cakes are sold by weight. */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                  Minimum weight (kg){design.tiers.length > 1 ? ' *' : ''}
                </div>
                <input style={{ ...s.modalInput }} type="number" min="0" step="0.5" placeholder="e.g. 2" value={templateWeight} onChange={e => setTemplateWeight(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Suits ages</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input style={{ ...s.modalInput, width: '50%' }} type="number" min="0" step="1" placeholder="Min" value={templateMinAge} onChange={e => setTemplateMinAge(e.target.value)} />
                  <span style={{ color: '#aaa', fontSize: 12 }}>–</span>
                  <input style={{ ...s.modalInput, width: '50%' }} type="number" min="0" step="1" placeholder="Max" value={templateMaxAge} onChange={e => setTemplateMaxAge(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Under the ROW, not under the field — a helper line inside one of two flex columns
                makes them different heights and the inputs stop lining up. Names the CONSEQUENCE
                rather than the field, because "minimum weight" is already clear and what a baker
                needs to know is why it is being asked for. */}
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5, marginTop: -2 }}>
              {design.tiers.length > 1
                ? 'The lightest you can build this at — it stops a customer ordering ' +
                  `${design.tiers.length} tiers at 1kg.`
                : 'Optional. The lightest you can build this at, if it has one.'}
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
            {/* Once it is saved, the Save button has nothing left to do — offering the reel in its
                place is one decision on screen rather than two. "Not now" is a real, equal-weight
                way out: the offer is worth making once and is not worth pressing. */}
            {reelOffer ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.55, marginBottom: 10 }}>
                  Film it turning, ready to post. It takes a few seconds and the video downloads to
                  this device.
                </div>
                <button
                  style={{ ...s.orderBtn, ...brandBtn }}
                  onClick={() => { closeSaveModal(); openReelPanel(); }}
                >
                  Record a reel
                </button>
                <button
                  style={{ ...s.orderBtn, background: 'transparent', color: '#888',
                           border: 'none', marginTop: 4 }}
                  onClick={closeSaveModal}
                >
                  Not now
                </button>
              </div>
            ) : (
              <button
                style={{ ...s.orderBtn, ...brandBtn, marginTop: 14, opacity: saving || !templateName.trim() ? 0.6 : 1 }}
                onClick={handleSaveTemplate}
                disabled={saving || !templateName.trim()}
              >
                {saving ? 'Saving...' : 'Save as Template'}
              </button>
            )}
        </Panel>
      )}

      {/* ── Color Guide modal ── */}
      {colorGuideOpen && (
        <ColorGuide
          onClose={() => setColorGuideOpen(false)}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      )}

      {/* ── Edible Print Studio ── */}
      {printStudioOpen && (
        <EdiblePrintStudio
          apiClient={apiClient}
          elementTypes={elementTypes}
          onClose={() => setPrintStudioOpen(false)}
        />
      )}

      {/* ── Add User modal ── */}
      {addUserModal && <AddUserModal onClose={() => setAddUserModal(false)} brandBtn={brandBtn} apiClient={apiClient} />}

      {/* ── New cake: pick the shape first ── */}
      {shapePickerOpen && (
        <ShapePicker
          shapes={shapeOptions}
          onPick={startNewCake}
          onClose={() => setShapePickerOpen(false)}
        />
      )}

      {/* Upload your own decoration. `tiers` is passed so the zone picker can render the user's own
          artwork ON the actual cake they're designing — the only honest way to explain "a zone".
          On save, reload the catalog so the new decoration appears in My Decorations immediately. */}
      {decorStudioOpen && promoting && (
        <MyDecorationStudio
          apiClient={apiClient}
          tiers={canvasConfig.tiers}
          elementTypes={elementTypes}
          upload={promoting}
          onClose={() => { setDecorStudioOpen(false); setPromoting(null); }}
          onSaved={async () => {
            setDecorStudioOpen(false);
            await loadElementsIfNeeded(true);   // the LIBRARY has a new row — re-read the catalog
            setPromoting(null);
            setElementsOpen(true);              // show them where it landed
          }}
        />
      )}

      {/* Pipe a chocolate garnish. Saving drops the piece straight onto the cake and selects it, so
          the next thing the customer sees is their own piece with its card open — rather than a
          confirmation and a hunt for where it went. */}
      {garnishStudio && (
        <GarnishStudio
          onCancel={() => { setGarnishStudio(false); setPendingGarnish(null); }}
          apiClient={apiClient}
          openWith={pendingGarnish}
          color={garnishColor}
          rope={garnishRope}
          onRopeChange={setGarnishRope}
          /* The ONE colour control, handed in rather than rebuilt — see INVARIANTS #3. */
          colorControl={
            <ColorWheel color={garnishColor} onChange={setGarnishColor} width={152}
              cakeColors={[...new Set(collectElementColors(design))]} />
          }
          onSave={piece => {
            const id = crypto.randomUUID();
            addGarnish({ ...piece, id });
            setSelectedGarnishId(id);
            setGarnishStudio(false);
            setPendingGarnish(null);
          }}
        />
      )}

      {/* Uploads — the uploads themselves. Tap one to put it on the cake (it borrows the placement
          rules of the type flagged default_for_uploads — data, not a hardcoded slug). A baker can also
          release one to his customers here, or take it back. */}
      {(uploadsOpen || framePhotoFor != null) && (
        <UploadsPanel
          apiClient={apiClient}
          elementTypes={elementTypes}
          /* Opening a kept piece hands it to the studio rather than dropping it on the cake: it needs
             a where and a how, and those questions belong on the screen that asks them. */
          onOpenGarnish={g => { setPendingGarnish(g); setUploadsOpen(false); setGarnishStudio(true); }}
          // Choosing FOR A FRAME is a different act from placing on the cake, so the panel is told
          // which one it is and the caller supplies the meaning of a tap. The panel itself has no idea
          // what a photo frame is — no branch, no second grid.
          selectMode={framePhotoFor != null}
          canPromote={orderMode === 'baker' && framePhotoFor == null}
          onSelect={(u) => {
            // Fills THIS frame's slot. Uploads nothing (the image already exists), creates no element,
            // touches no library: a photo in a frame is design content, exactly as private as before.
            // Replacing an image does NOT delete the old upload — it may be in another design, and
            // deleting is an explicit act in Uploads, never a side-effect of changing your mind.
            updateSticker(framePhotoFor, { photoUrl: u.url });
            setFramePhotoFor(null);
          }}
          onPlace={(el) => {
            // Rides the ORDINARY placement path: the upload was made element-shaped, so addSticker
            // treats it like any library element — no parallel code path to drift.
            const zone = el.allowed_zones?.[0];
            if (!zone) return;
            addSticker(el, zone, 0, zoneMode(el.placement_config, zone, 'hug'));
          }}
          onPromote={(u) => { setUploadsOpen(false); setPromoting(u); setDecorStudioOpen(true); }}
          onClose={() => { setUploadsOpen(false); setFramePhotoFor(null); }}
        />
      )}

      {/* ── Change Password modal ── */}
      {changePasswordModal && (
        <ChangePasswordModal
          onClose={() => setChangePasswordModal(false)}
          brandBtn={brandBtn}
          supabase={supabase}
          apiClient={apiClient}
        />
      )}

      {/* ── Flavours panel ── */}
      <FlavoursPanel
        open={flavoursPanelOpen}
        onClose={() => setFlavoursPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />

      {/* Reel options — catalogue authors only. Not mounted at all otherwise, so the panel is not
          a thing every other baker's designer carries around unrendered. */}
      {/* ── The reel's own voice ──────────────────────────────────────────────────────────────────
          Bottom-centre, above everything, because it has to be legible DURING a take — "hold still
          for 4.5 seconds" said after the fact is not an instruction. Safe to sit over the designer:
          the recording captures the canvas, not the screen, so nothing here reaches the file.

          Failures are dismissible and stay put; they carry an instruction (open Chrome, close some
          tabs, convert before posting) that has to still be there when the baker looks up. */}
      {reelMsg && (
        <div
          role="status"
          onClick={() => setReelMsg(null)}
          style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 78,
            zIndex: Z.toast, maxWidth: 'min(440px, calc(100vw - 32px))',
            padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
            background: reelMsg.ok ? '#2C4433' : '#8C2F26', color: '#fff',
            fontSize: 13, fontWeight: 600, lineHeight: 1.5, textAlign: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
          }}>
          {reelMsg.text}
        </div>
      )}

      {canRecordReel && (
        <ReelOptions
          open={reelOptsOpen} busy={reelBusy} isMobile={isMobile}
          // So the panel can disable Record and SAY why, rather than letting a baker film a cake
          // that is still assembling itself.
          loading={decorLoading}
          // The ground is applied LIVE while the panel is open — it flows straight back down as
          // `filmGround`, which paints the scene's sky AND its floor, so the swatch you pick is the
          // colour that records rather than a separate thing we hope agrees.
          onGround={g => setTakeGround(g || DESIGNER_GROUND)}
          brandPrimary={bakerData?.primary_color || null}
          // The tick is offered only to a plan that carries `reel_branding` — for everybody else the
          // line is our mark and there is nothing to choose. See captionText, which enforces the same
          // rule independently of this panel.
          canChooseName={reelBranding}
          bakeryName={bakerData?.name || ''}
          onIncludeName={setReelIncludeName}
          onClose={closeReelPanel}
          maxHeightMobile={takeSheetMaxH}
          onRecord={runReel} />
      )}

      {canRecordReel && (
        <PhotoOptions
          open={photoOptsOpen} busy={photoBusy} isMobile={isMobile}
          loading={decorLoading}
          // Shape drives the preview box, the drawing buffer and the file — see frameAspect.
          onShape={setFrameAspect}
          onGround={g => setTakeGround(g || DESIGNER_GROUND)}
          onCutout={setPhotoCutout}
          onAngle={key => takeRef.current?.setAngle?.(key)}
          onIncludeName={setReelIncludeName}
          // Which preset the camera is ACTUALLY at, so a preset stops being highlighted once the
          // baker drags off it. Reported by the director on every camera move, because the panel
          // cannot see the camera and guessing would make the highlight a claim rather than a fact.
          activeAngle={photoAngle}
          brandPrimary={bakerData?.primary_color || null}
          canChooseName={reelBranding}
          bakeryName={bakerData?.name || ''}
          onClose={closePhotoPanel}
          maxHeightMobile={takeSheetMaxH}
          onCapture={runPhoto} />
      )}

      {/* ── Templates panel (hide/show Spattoo's global templates) ── */}
      <TemplatesPanel
        open={templatesPanelOpen}
        onClose={() => setTemplatesPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />

      {/* ── Billing panel ── */}
      <BuyCreditsPanel
        open={buyCreditsOpen}
        onClose={() => setBuyCreditsOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
      />
      <BillingPanel
        open={billingPanelOpen}
        onBuyCredits={() => setBuyCreditsOpen(true)}
        onClose={() => setBillingPanelOpen(false)}
        onSubscriptionChange={refreshBakerProfile}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />

      {/* ── Settings panel ── */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        // The same share card the sidebar opens — the customiser offers it too, since a baker who
        // has just published is the one person who does not yet know their storefront address.
        onShareStore={onShareStore}
        // The publish review's "Review my flavours". Closes Settings on the way so the baker lands
        // ON the flavour list rather than behind it — the customiser has already closed itself.
        onReviewFlavours={() => { setSettingsPanelOpen(false); setFlavoursPanelOpen(true); }}
        // "Upgrade to publish" on a premium theme preview, and "Upgrade to Blaze" on a paused
        // theme's notice. Straight to billing — by the time a baker has previewed their own shop in
        // a theme and reached for Publish, an explainer screen in between is a step that loses
        // people.
        //
        // NOT gated on `billing:manage`, deliberately: the publish button calls this INSTEAD of
        // publishing, so withholding it would leave a staff member pressing a button that closes
        // the panel and does nothing. A dead control is worse than one that opens a screen they may
        // not be able to act on.
        onUpgrade={() => { setSettingsPanelOpen(false); setBillingPanelOpen(true); }}
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
        initialView={ordersInitialView}
        bakerTimezone={bakerData?.timezone ?? null}
        // For the finished-photo editor's optional mark. Absent = the "add your name" tool is not
        // offered at all, rather than offered and writing nothing.
        bakerName={bakerData?.name ?? null}
        onNewOrderForDate={hasCap('order:manage') ? startOrderForDate : null}
        onEditDesign={(order, opts) => {
          // Locked orders (confirmed onward) open READ-ONLY in the 3D viewer — never
          // loaded into the editor, so the design can't be changed or saved.
          if (opts?.viewOnly) { setViewingOrder(order); setOrdersPanelOpen(false); return; }
          setEditingOrder(order);
          setOrdersPanelOpen(false);
          if (order.design_snapshot) {
            try { loadDesign(order.design_snapshot); } catch (e) { console.error('loadDesign failed', e); }
          }
        }}
        onNewOrder={hasCap('order:manage') ? () => { setOrdersPanelOpen(false); setManualOrderOpen(true); } : null}
        apiClient={apiClient}
        primaryColor={primaryColor}
        homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
        bakerSlug={bakerData?.slug}
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

      {/* ── Invite panel ── */}
      <InvitePanel
        open={invitePanelOpen}
        onClose={() => { setInvitePanelOpen(false); setShareDraftDesign(null); setInviteLiveSessionId(null); }}
        apiClient={apiClient}
        primaryColor={primaryColor}
        attachedDesign={shareDraftDesign}
        liveSessionId={inviteLiveSessionId}
      />

      {/* ── Read-only 3D viewer for locked (confirmed+) orders ── */}
      {viewingOrder && (
        <OrderDesignViewer order={viewingOrder} onClose={() => setViewingOrder(null)} />
      )}

      {/* ── Order modal ── */}
      {orderModalOpen && (
        <OrderModal
          tierCount={design.tiers.length}
          mode={orderMode}
          onClose={() => {
            setOrderModalOpen(false); setEditingOrder(null);
            // Only after a successful customer quote (not a cancel), once the
            // customer dismisses the success screen — host redirects to share.
            if (quoteSubmittedRef.current) { onQuoteRequested?.(quoteSubmittedRef.current); quoteSubmittedRef.current = null; }
          }}
          onSubmit={handleOrderSubmit}
          editingOrder={editingOrder}
          legalBase={legalBase}
          apiClient={apiClient}
          supabase={supabase}
          bakerId={bakerData?.id}
          bakerSlug={bakerData?.slug}
          bakerName={bakerData?.name}
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

      {/* ── New Order (manual) modal — reference photo / no-design order ── */}
      {manualOrderOpen && (
        <OrderModal
          tierCount={1}
          mode="baker"
          manual
          initialDeliveryDate={manualOrderDate}
          onClose={() => { setManualOrderOpen(false); setManualOrderDate(null); }}
          onSubmit={handleManualOrderSubmit}
          apiClient={apiClient}
          supabase={supabase}
          bakerId={bakerData?.id}
          bakerSlug={bakerData?.slug}
          bakerName={bakerData?.name}
          homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
          storeHours={bakerSettings?.store_hours ?? null}
          brandBtn={brandBtn}
          primaryColor={primaryColor}
          legalBase={legalBase}
          onViewOrder={(id) => {
            setManualOrderOpen(false);
            setManualOrderDate(null);
            setNewOrderId(id);
            setOrdersPanelOpen(true);
          }}
        />
      )}


      {/* Off-screen thumbnail canvas — no floor, transparent background */}
      <CakeThumbnailCanvas config={canvasConfig} containerRef={thumbContainerRef} renderNowRef={thumbRenderNowRef} />

      {/* Floating sticker ghost while pointer-dragging from elements panel */}
      {dragGhost && (
        <div style={{
          position: 'fixed',
          left: dragGhost.x - 28, top: dragGhost.y - 28,
          width: 56, height: 56,
          borderRadius: 12,
          background: 'transparent',
          border: dragGhost.canDrop ? '2.5px solid #22c55e' : '2px solid #1a1a1a',
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
// ── Menu surfaces: one shape, two tones ────────────────────────────────────────────────────────
// A flyout menu appears in two places that want opposite colouring: under the MOBILE HEADER, which
// is white, and out of the RAIL, which is a near-black moulded spatula. The rail's menus used the
// white card and read as another application's UI docked onto it.
//
// The obvious fix — a second set of style objects — writes the layout twice, and the two copies
// drift the moment someone nudges a padding. So the SHAPE is written once here and a TONE
// contributes only colour. Adding a third tone is a colour block, not another copy of the metrics.
const MENU_SHAPE = {
  surface:  { position: 'absolute', top: 0, left: 'calc(100% + 8px)', borderRadius: 10,
              minWidth: 160, zIndex: 50, display: 'flex', flexDirection: 'column',
              padding: '6px 0', overflow: 'hidden' },
  section:  { fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              padding: '6px 14px 4px' },
  item:     { background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              padding: '8px 14px', fontSize: 13, fontFamily: "'Quicksand',sans-serif",
              transition: 'background 0.13s, color 0.13s' },
  userInfo: { padding: '10px 14px 8px' },
  name:     { fontSize: 13, fontWeight: 700 },
  email:    { fontSize: 11, marginTop: 2 },
  divider:  { height: 1, margin: '4px 0' },
};

// Colour only. `rail` mirrors the spatula's own surface — its body gradient runs #121214 → #020203,
// lifted a little so the menu reads as an object resting above the rail rather than a hole cut in
// it — and carries the same hairline highlight the silhouette has, plus the rail's text opacities.
const MENU_TONES = {
  light: {
    surface: { background: '#fff', border: '1px solid #999999',
               boxShadow: '0 4px 20px rgba(107,45,66,0.14)' },
    section: '#888', item: '#1a1a1a', itemWeight: 500,
    name: '#1a1a1a', email: '#666', divider: '#999999',
  },
  rail: {
    surface: { background: 'linear-gradient(168deg, #1b1b1f, #0e0e11 70%)',
               border: '1px solid rgba(255,255,255,0.10)',
               boxShadow: '0 16px 44px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)' },
    section: 'rgba(255,255,255,0.38)', item: 'rgba(255,255,255,0.86)', itemWeight: 600,
    name: 'rgba(255,255,255,0.92)', email: 'rgba(255,255,255,0.42)', divider: 'rgba(255,255,255,0.10)',
  },
};

const menuTone = (key) => {
  const t = MENU_TONES[key];
  return {
    surface:  { ...MENU_SHAPE.surface, ...t.surface },
    section:  { ...MENU_SHAPE.section, color: t.section },
    item:     { ...MENU_SHAPE.item, color: t.item, fontWeight: t.itemWeight },
    userInfo: MENU_SHAPE.userInfo,
    name:     { ...MENU_SHAPE.name, color: t.name },
    email:    { ...MENU_SHAPE.email, color: t.email },
    divider:  { ...MENU_SHAPE.divider, background: t.divider },
  };
};

const LIGHT_MENU = menuTone('light');
const RAIL_MENU  = menuTone('rail');

const s = {
  // The lapsed gate's secondary row. Small and low-contrast on purpose: it must be FINDABLE without
  // competing with "Resume" — the point is that leaving is possible, not that it is suggested.
  lapsedExit: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 18, fontSize: 12.5, color: '#9BB5A2', flexWrap: 'wrap',
  },
  lapsedExitLink: {
    background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#6B7280',
    textDecoration: 'underline', cursor: 'pointer',
  },

  page: {
    display:'flex', flexDirection:'column', height:'100vh',
    background:'#f4f4f5', fontFamily:"'Quicksand',sans-serif", overflow:'hidden',
    position:'relative',   // anchors desktopLogo, which is out of flow
  },

  // Left column (sidebar only — the logo lives in desktopHeader). Extra left padding +
  // raised stacking give the spatula blade room to bulge left and overlap the canvas.
  leftCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: `12px 0 12px ${RAIL.padLeft}px`, flexShrink: 0,
    position: 'relative', zIndex: 5,
  },

  // Desktop logo — absolutely positioned so it costs the column no height. See the
  // comment at the render site for why a header band is not an option here.
  // Full-height and centred rather than pinned at top: 14. A logo is any height up to the cap and
  // the text fallback is 18, so a fixed offset put each of them at a different distance from the
  // rule. Centred, every one of them sits in the middle of the row by construction.
  desktopLogo: {
    position: 'absolute', top: 0, left: 120, height: DESKTOP_HEADER_H, zIndex: 6,
    display: 'flex', alignItems: 'center', pointerEvents: 'none',
  },
  desktopHeaderRule: {
    position: 'absolute', left: RAIL.padLeft + RAIL.width, right: 0, height: DESKTOP_HEADER_H,
    borderBottom: '1px solid #e2e0db', zIndex: 5, pointerEvents: 'none',
  },
  // Header logo slot — used by both mobileHeader and desktopHeader. It is deliberately
  // width-auto: baker logos range from square marks to ~6:1 wordmarks, so the height is
  // the only cap that should bind. A fixed width here is what previously reduced wide
  // logos to a hairline.
  // SHRINKABLE, deliberately. This was `flexShrink: 0`, which made the bakery name the one thing in
  // the header that never yields — so "Sweet Sensations Cakes & Bakes" took its full 237px and pushed
  // the controls off the right edge: 34px lost on a 393 phone, 107px on a 320, taking the credits
  // pill and the avatar with them. The ellipsis never fired either, because it was governed by a
  // fixed 260px cap rather than by the space actually left over.
  //
  // The controls are fixed-size targets and the name is elastic text, so the name is what gives.
  // `minWidth: 0` is what lets it: a flex item will not shrink below its content width without it,
  // and the ellipsis would never appear.
  topLogo: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    flexShrink: 1, minWidth: 0, maxWidth: '100%',
  },
  // 40 not 34: off-flow the desktop logo no longer competes with the rail for height, and
  // most uploads carry transparent padding, so a chunk of this box is margin, not mark.
  // Capped at 40 rather than higher because mobileHeader shares this and is only 52 tall.
  topLogoImg: { maxHeight: HEADER_LOGO_MAX_H, maxWidth: 240, objectFit: 'contain', display: 'block' },
  // Fallback when a baker has not uploaded a logo. Sized for a header line, not the
  // old 64px rail box — hence one line with an ellipsis rather than centred wrapping.
  // ⚠️ NEVER TRUNCATED. This is the bakery's identity, and the same name their customers meet coming
  // in from the storefront — half a name is worse than a cramped one. So it wraps rather than
  // ellipsising, and mobileHeader uses minHeight rather than height so a name that needs two lines
  // grows the bar instead of being clipped by it.
  //
  // The font steps down before it wraps (see nameFontSize): on a 320 phone the slot is ~114px and
  // "Sweet Sensations Cakes & Bakes" is 239px at 15px and still 191px at 12px — no font size saves a
  // narrow phone, so wrapping is the only thing that always works. Stepping down first just buys the
  // common case one line instead of two.
  topLogoText: {
    fontWeight: 700, color: '#333',
    lineHeight: 1.2, maxWidth: '100%', fontFamily: "'Quicksand',sans-serif",
    // Break inside a word only if a single word is itself wider than the slot — otherwise wrap at
    // spaces like prose.
    overflowWrap: 'break-word',
  },
  // ── The same name, bigger, on the desktop header ──────────────────────────────────────────────
  // A baker WITHOUT a logo was reading their bakery's name at 15px next to a header row built to
  // hold a 40px mark — so the branded storefronts looked considered and the unbranded ones looked
  // unfinished, for no reason other than which asset they happened to have uploaded.
  //
  // 24 rather than 40: text at its cap height reads larger than a mark of the same box, so matching
  // the number would overpower the row. At 24 with lineHeight 1.2 the line is 29px in a 64px row,
  // which sits with the same weight as the logo it replaces.
  //
  // Desktop only, and NOT folded into topLogoText, because the two rows are not the same problem.
  // The mobile header is 52 tall and shares its width with the bell, the credits pill, Chef's Desk,
  // Settings and the profile — there, a wider name takes room from controls that have nowhere to go.
  // The desktop row has the name at one end and that same cluster ~1100px away at the other.
  desktopLogoText: {
    // Pacifico, the face spattoo-web already self-hosts and describes as "the bakery wordmark only"
    // — which is exactly this job: a bakery's name standing in for a logo it does not have. It reads
    // as a MARK rather than a label, which is the actual gap when nothing has been uploaded.
    //
    // fontWeight 400 explicitly, overriding topLogoText's 700: Pacifico ships a single weight, so
    // 700 would be a browser-synthesised fake bold — a script face smeared thicker, which looks
    // like a rendering fault rather than emphasis.
    //
    // It is NOT preloaded (next/font, preload: false — the storefront faces are theme-conditional
    // and most page views never show one), so a baker with no logo sees the fallback face briefly
    // and then the swap. Accepted rather than fixed: `display: swap` keeps the name readable
    // throughout, it only affects bakers without a logo, and preloading a script face for every user
    // to serve a minority is the worse trade. Change layout.tsx if that ever stops being true.
    fontFamily: "'Pacifico', cursive",
    fontWeight: 400,
    fontSize: 26,
    maxWidth: 420,
    // Desktop keeps the single line it always had. topLogoText dropped nowrap so the PHONE can wrap
    // a long name instead of truncating it; here the slot is absolutely positioned and 64px tall, so
    // a second line of 26px Pacifico would spill over the header rule and onto the canvas.
    // ⚠️ Which means desktop still truncates a very long name at 420px — the same identity problem
    // the phone just stopped having, in a place with four times the room. Left as-is deliberately
    // rather than fixed blind; see the note in plans/, and it wants its own look.
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    /* ⚠️ THE PADDING IS LOAD-BEARING, and the equal negative margins cancel it visually.
     * `overflow: hidden` (needed for the ellipsis above) clips at the CONTENT BOX, and Pacifico's
     * ink does not fit inside a 1.2 line-height box. The padding moves the clip edge out; the
     * negative margin puts the wordmark back exactly where it was, so nothing else in the header
     * moves. Removing either one alone re-breaks it or shifts the mark.
     *
     * ⚠️ THE BOTTOM IS THE ONE THAT MATTERS, and an earlier fix here got the axis wrong.
     * It read `actualBoundingBoxLeft = -1.35` as "ink starts 1.35px left of the origin" and padded
     * the LEFT. The sign says the opposite — positive means ink extends left, so -1.35 means there
     * is no left overhang at all — and the padding did nothing. Measured directly: sweeping
     * padding-left from 10 to 40 produces a byte-identical render, so none of it was ever load
     * bearing. What is clipped is the DESCENDER: Pacifico's lowercase f tails below the baseline and
     * curls left, and at 26px on a 1.2 line-height it was being sheared off flat. That is what
     * "feelings&flavours" shows in production, and what any name containing f/g/j/y shows.
     *
     * 8px is the measured minimum at which the render becomes pixel-identical to the same text with
     * the clip removed entirely; 10 for a little headroom.
     *
     * The left padding is kept — it costs nothing, it is cancelled, and a face/initial with a real
     * negative left side bearing would need it — but it is insurance, not the fix. */
    paddingLeft: 10, marginLeft: -10,
    paddingBottom: 10, marginBottom: -10,
  },

  // Sidebar — spatula-shaped: the SVG silhouette (SpatulaFrame) is drawn behind,
  // this is just the 64px handle-width positioning context. The blade bulges out
  // (overflow visible). Nav + controls live in sidebarInner, above the silhouette.
  sidebar: {
    width: RAIL.width, minWidth: RAIL.width, margin: 0,
    position: 'relative', overflow: 'visible',
    display: 'flex', flexShrink: 0, flex: 1,
    minHeight: 0,             // see sidebarNav — the rail must be allowed to shrink, not grow
  },
  sidebarInner: {
    position: 'relative', zIndex: 1,
    flex: 1, width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    // 96 cleared the cap AND the hang-hole (whose bottom edge was y=71). With the hole gone the
    // clearance is the cap's own bottom at y=38, plus breathing room — worth a whole menu item.
    padding: '48px 0 30px',
    minHeight: 0,             // see sidebarNav — without this the rail grows and the blade is cut
  },
  sidebarDivider: {
    height: 1, width: 32,
    background: 'rgba(255,255,255,0.10)',
    margin: '6px 0', flexShrink: 0,
  },
  // The rail holds ~12 items and they are flexShrink:0, so its intrinsic height is ~823px. A flex
  // item defaults to min-height:auto — it will not shrink below its content — so on any viewport
  // shorter than roughly 847px the whole chain (nav → sidebarInner → sidebar) grew PAST the page,
  // and `page`'s overflow:hidden ate the difference. What it ate was the bottom of the spatula:
  // SpatulaFrame draws its SVG to the sidebar's measured clientHeight, so the blade was rendered
  // below the fold. Reported on a MacBook Air (~760-800px of viewport once Chrome's chrome and the
  // bookmarks bar are gone); invisible on a 27" iMac, which has the height to spare.
  //
  // minHeight:0 lets the chain shrink to what is actually available, and the nav scrolls instead of
  // pushing. space-evenly is kept deliberately — it spreads the items down the blade on a tall
  // screen, and Chrome keeps the first item reachable once it scrolls. If a browser ever strands it
  // above the scroll origin (the classic centred-content-in-a-scroller trap), the fix is auto
  // margins on the first/last child rather than abandoning the spread.
  sidebarNav: {
    flex: 1, width: '100%', minHeight: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'space-evenly',
    // gap = floor spacing; space-evenly spreads items down the blade. Shared with the tools group
    // below the divider, which matches this rail's pitch and must bottom out on the same number.
    padding: '4px 0', gap: RAIL_MIN_GAP,
    overflowY: 'auto', scrollbarWidth: 'none',   // a scrollbar in a 64px rail is worse than none
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
    // 34, not 40: it holds a 20px icon, so 40 was 10px of padding around each one — and multiplied
    // by nine rail items that is more than a whole item's worth of the column. A mouse target, not a
    // thumb one, so the 44px touch floor does not apply here (the phone strip keeps its 44).
    width: 34, height: 34, borderRadius: 11,
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
  // Both tones are derived from MENU_SHAPE above — the metrics exist once.
  dropdown:            LIGHT_MENU.surface,
  dropdownSection:     LIGHT_MENU.section,
  // A quiet amber note on the Flavours entry, not a red dot: nothing is broken, the list simply
  // has not been looked at, and every flavour is on. It clears itself the moment the baker saves.
  needsLook:           { marginLeft: 8, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
                         textTransform: 'uppercase', color: '#7A5A12', background: '#FBF0DA',
                         border: '1px solid #EAD9AE', borderRadius: 10, padding: '1px 6px' },
  dropdownItem:        LIGHT_MENU.item,
  railDropdown:        RAIL_MENU.surface,
  railDropdownSection: RAIL_MENU.section,
  railDropdownItem:    RAIL_MENU.item,
  railDropdownUserInfo: RAIL_MENU.userInfo,
  railDropdownName:    RAIL_MENU.name,
  railDropdownEmail:   RAIL_MENU.email,
  railDropdownDivider: RAIL_MENU.divider,

  dropdownUserInfo: LIGHT_MENU.userInfo,
  dropdownName:    LIGHT_MENU.name,
  dropdownEmail:   LIGHT_MENU.email,
  dropdownDivider: LIGHT_MENU.divider,

  // Main + flyout panels
  main: { flex: 1, display: 'flex', minHeight: 0, position: 'relative' },
  flyout: {
    position: 'absolute', left: RAIL_FLYOUT_LEFT, top: 0, bottom: 0, zIndex: 20,
    width: 200,
    // Frosted/see-through so the cake shows through (esp. on mobile, where it overlays the cake). The
    // low alpha is what actually reveals the cake — 0.97 reads as solid white even with the blur.
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
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

  // Gradient (multi-colour) controls — sits under the colour wheel in the right edit panel
  gradientBlock: {
    width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e5e5',
  },
  // ── Stripes ────────────────────────────────────────────────────────────────────────────────────
  // A preset chip carries a tiny vertical swatch of its own stripes: the label says which cake it
  // is, the swatch says what it looks like, and together they save a tap-to-find-out.
  // Swatch only — the name lives in the tooltip and the aria-label. See the note at its use.
  stripePreset: {
    display: 'flex', alignItems: 'center', padding: 4, lineHeight: 0,
    borderRadius: 7, border: '1.5px solid #d8d8d8', background: '#fff', cursor: 'pointer',
  },
  stripeValue: { fontSize: 11, fontWeight: 700, color: '#666', fontVariantNumeric: 'tabular-nums' },
  stripeHint:  { fontSize: 10.5, color: '#888', lineHeight: 1.45, marginTop: 4, textAlign: 'center' },
  // The treatment picker: Solid / Ombre / Stripes. One row, because they are one choice — a wall is
  // painted one of these ways and never two.
  treatRow: { display: 'flex', gap: 6, width: '100%' },
  treatBtn: {
    flex: 1, padding: '7px 4px', borderRadius: 8, border: '1.5px solid #d8d8d8', background: '#fff',
    cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", fontSize: 12, fontWeight: 700, color: '#666',
  },
  treatBtnOn: { border: '1.5px solid #1a1a1a', background: '#1a1a1a', color: '#fff' },
  gradientLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
    color: '#1a1a1a', textTransform: 'uppercase',
  },
  gradientStops: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
  },
  gradientStopWrap: { position: 'relative', width: 30, height: 30 },
  gradientStop: {
    width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
    boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  },
  gradientStopRemove: {
    position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
    border: '1px solid #999', background: '#fff', color: '#444', fontSize: 11, lineHeight: '14px',
    padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  gradientStopAdd: {
    width: 30, height: 30, borderRadius: '50%', border: '1.5px dashed #999', background: '#fff',
    color: '#666', fontSize: 18, lineHeight: '26px', padding: 0, cursor: 'pointer',
  },
  gradientModes: { display: 'flex', gap: 6, width: '100%', justifyContent: 'center' },
  gradientMode: {
    flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: '6px 4px',
    borderRadius: 8, border: '1.5px solid #999999', background: '#fff', color: '#444',
    cursor: 'pointer', textTransform: 'uppercase',
  },
  gradientModeOn: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  elementCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: '#fff', border: '1.5px solid #999999', borderRadius: 12,
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
  // Enlarged thumbnail. pointerEvents none on desktop so it can never sit between the cursor and
  // the card it belongs to — that would fire mouseleave and make the preview flicker itself away.
  templatePreview: {
    position: 'fixed', zIndex: 320, pointerEvents: 'none',
    background: '#fff', borderRadius: 14, padding: 10,
    boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
  },
  templatePreviewImg: {
    width: '100%', height: 200, objectFit: 'contain',
    borderRadius: 10, background: '#FAFAF8', display: 'block',
  },
  templatePreviewCaption: {
    fontSize: 12, fontWeight: 700, color: '#1a1a1a',
    textAlign: 'center', padding: '8px 4px 2px',
  },
  templatePreviewBackdrop: {
    position: 'fixed', inset: 0, zIndex: 320,
    background: 'rgba(20,16,18,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  templatePreviewBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 8,
    border: 'none', background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
    fontSize: 13, lineHeight: 1, color: '#333', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  templateCard: {
    border: '1.5px solid #999999', borderRadius: 12,
    overflow: 'hidden', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '0 0 8px',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  templateThumbPlaceholder: {
    width: '100%', height: 120,
    background: '#FAFAF8', display: 'flex',
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
    background: '#FAFAF8', border: '1px solid #999999',
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
  // Above the canvas and any panel that slides in beside it, but below modals — a readout should
  // never sit on top of something the baker is reading or dismissing.
  // A ROW. Without display:flex the children are block-level, so a second item (the bell) drops
  // onto its own line under the pill instead of sitting beside it.
  creditsFloat: { position: 'absolute', top: 0, right: 16, height: DESKTOP_HEADER_H, zIndex: 6, display: 'flex', alignItems: 'center', gap: 8 },
  canvasArea: {
    flex:1, position:'relative', minHeight:0,
    // Match the 3D canvas's clear colour so the strip exposed when the piping popup shrinks
    // the canvas (right:184) blends in seamlessly instead of showing a hard "cut" edge.
    background:'#f4f4f5',
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
    /* ⚠️ WITHOUT THESE THE PANEL CLIPS ITS OWN CONTENT AND NOTHING SCROLLS.
     *
     * It is absolutely positioned and vertically centred with no height limit, so a tall selection
     * simply extends past the top and bottom of the window. The app shell around it is
     * overflow:hidden, so the overflow is not scrolled — it is CUT, with no scrollbar and no hint
     * that anything is missing.
     *
     * Measured on an 780px window with a striped tier: 918px of content in a 780px view, and the
     * colour wheel — the control that edits the stripe you just selected — was among the 138px
     * removed. Reported twice, reasonably, as "the colour picker does not appear".
     *
     * This is not a stripes bug. A glaze tier's five marble stops, or any future section, hits the
     * same wall on a short window; stripes were just the first thing tall enough to prove it. */
    maxHeight: 'calc(100vh - 28px)', overflowY: 'auto', overscrollBehavior: 'contain',
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
    background:'#f3f4f6', border:'none', width:28, height:28, borderRadius:'50%',
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
    width:26, height:26, borderRadius:'50%', border:'2.5px solid #999999',
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
    background:'#f3f4f6', border:'none', borderRadius:10,
    padding:'5px 10px', fontSize:13, cursor:'pointer', color:'#333', fontWeight:700,
    flexShrink:0,
  },

  modalInput: {
    border: '1.5px solid #d1d5db', borderRadius: 10, padding: '9px 12px',
    fontSize: 13, fontFamily: "'Quicksand',sans-serif", color: '#222',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  offeringBtn: {
    flex: 1, padding: '7px 0', borderRadius: 10, border: '1.5px solid #999999',
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
    background:'none', border:'1.5px solid #999999', borderRadius:8,
    padding:'4px 10px', fontSize:11, cursor:'pointer',
    fontWeight:700, fontFamily:"'Quicksand',sans-serif",
  },

  zoneToggle: {
    padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
    border: '1.5px solid #999999', background: 'transparent',
    color: '#888', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif",
    transition: 'all 0.12s',
  },
  zoneToggleOn: {
    background: 'rgba(26,26,26,0.12)',
    border: '1.5px solid #1a1a1a',
    color: '#1a1a1a',
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

  // Right-side per-element edit popup (desktop sticker/topper) — same chrome as
  // the piping popup so element editing feels consistent.
  // The flyout handle. Half-rounded on the outer edge so it reads as something to pull rather than a
  // button that happens to be at the edge, and narrow enough that shut, it costs the cake 22px.
  stackTab: {
    position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)',
    width: STACK_TAB_W, height: 56, padding: 0,
    border: 'none', borderRadius: '10px 0 0 10px',
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    boxShadow: '0 2px 10px rgba(107,45,66,0.18)',
    color: '#6b2d42', fontSize: 10, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    // Above the stack itself (20), so the handle stays pressable when the panel is out.
    zIndex: 21,
    pointerEvents: 'auto',
  },
  editPopup: {
    position: 'absolute',
    right: 10, top: 12,
    width: 200, maxHeight: 'min(calc(100% - 24px), calc(100vh - 96px))',
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 16,
    padding: '8px 8px 10px',
    boxShadow: '0 4px 24px rgba(107,45,66,0.18)',
    display: 'flex', flexDirection: 'column', gap: 7,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    zIndex: 20,
    pointerEvents: 'auto',
  },
  editPanelGroups: {
    display: 'flex', flexDirection: 'column',
  },
  editPanelRow: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '7px 0',
    borderBottom: '1px solid #f4eef0',
  },
  editPanelFooter: {
    display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
    padding: '10px 0 2px',
  },
  editPanelLabel: {
    fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: 0.3,
    minWidth: 34,
  },

  // Mobile-specific
  mobileHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    // minHeight, not height: a two-line bakery name has to make the bar taller rather than be cut
    // off by it. Short names — nearly all of them — leave it at exactly 52 as before.
    padding: '6px 16px', minHeight: 52, flexShrink: 0,
    background: '#fff', borderBottom: '1px solid #f0e8ea',
    position: 'relative', zIndex: 10,
  },
  // ── The phone's bottom strip ──────────────────────────────────────────────────────────────────
  // Flat and full-bleed, in the same chrome family as the desktop spatula — the SHAPE goes, the
  // material stays, so the phone does not read as a different product.
  //
  // What the shape was costing is in the note where spatulaBarPath used to live: the icon row had to
  // be inset 60px to clear the silhouette, which held every target under the 44px floor on every
  // phone. Full-bleed, five slots divide the whole width — ~63px on a 320 screen, ~78 on a 393 —
  // and the room left over is what pays for the labels.
  //
  // The safe-area inset is padding rather than height: on a phone with a home indicator the strip
  // grows to sit above it, and on one without it costs nothing.
  mobileBottomNav: {
    flexShrink: 0, display: 'flex', alignItems: 'stretch',
    height: MOBILE_BAR_H, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    boxSizing: 'content-box',
    background: '#0b0b0d', borderTop: '1px solid rgba(255,255,255,0.07)',
    position: 'relative', zIndex: 12,
  },
  // RailSubmenu wraps its child in a positioned div; this makes that wrapper an equal slot so the
  // item carrying a submenu is the same width as the ones that do not.
  mobileNavSlotWrap: { flex: '1 1 0', minWidth: 0, display: 'flex' },
  mobileNavSlot: {
    flex: '1 1 auto', minWidth: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    color: 'rgba(255,255,255,0.5)', fontFamily: "'Quicksand', sans-serif",
    WebkitTapHighlightColor: 'transparent',
  },
  mobileNavSlotOn: { color: '#fff' },
  mobileNavIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24 },
  mobileNavPlus: {
    width: 24, height: 24, borderRadius: '50%', border: '1.6px solid currentColor',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  // Ellipsis rather than wrap: a two-line label makes one slot taller than its neighbours and the
  // whole strip stops looking like a row.
  mobileNavLabel: {
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.2,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
  },

  // ── The More sheet ────────────────────────────────────────────────────────────────────────────
  // Three across, icon over NAME. The sheet is where the room to spell things out actually pays:
  // an icon-only bar asks a baker to learn eight glyphs, and this is the half that stops asking.
  mobileSheetScrim: {
    position: 'absolute', top: 0, left: 0, right: 0,
    bottom: `calc(${MOBILE_BAR_H}px + env(safe-area-inset-bottom, 0px))`,
    background: 'rgba(0,0,0,0.42)', zIndex: 11,
  },
  mobileSheet: {
    position: 'absolute', left: 0, right: 0,
    bottom: `calc(${MOBILE_BAR_H}px + env(safe-area-inset-bottom, 0px))`,
    zIndex: 12, background: '#141416', borderRadius: '18px 18px 0 0', padding: '8px 10px 16px',
    boxShadow: '0 -8px 28px rgba(0,0,0,0.35)',
  },
  mobileSheetGrip: { width: 34, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)', margin: '2px auto 12px' },
  mobileSheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  mobileSheetItem: {
    border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, padding: '12px 4px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minHeight: 68,
    color: 'rgba(255,255,255,0.72)', fontFamily: "'Quicksand', sans-serif",
    WebkitTapHighlightColor: 'transparent',
  },
  mobileSheetItemOn: { background: 'rgba(255,255,255,0.14)', color: '#fff' },
  mobileSheetLabel: { fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.25 },
  flyoutMobile: {
    position: 'relative',
    left: 'auto', top: 'auto', bottom: 'auto',
    width: '100%', flexShrink: 0,
    margin: 0, borderRadius: '20px 20px 0 0',
    zIndex: 1, order: 0,
    boxShadow: '0 -2px 16px rgba(0,0,0,0.10)',
  },
  // Tabs, not a scrolling stack. 44 minimum so the strip is not a row of targets the bar below it
  // would be criticised for.
  editTabs: { display: 'flex', gap: 4, padding: '0 0 10px', flexShrink: 0, width: '100%' },
  editTab: {
    flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '9px 6px', borderRadius: 9, border: 'none',
    background: 'rgba(0,0,0,0.05)', color: '#6b6b6b', fontSize: 12, fontWeight: 700,
    fontFamily: "'Quicksand',sans-serif", cursor: 'pointer',
  },
  // #1a1a1a is what "selected" is throughout this app — the toolbar's active button, the rotation
  // slider, and `gradientModeOn`, which is the control sitting inside the very next tab. The brand
  // green belongs to the storefront and the marketing site; using it here made the tab strip the one
  // green thing in a black chrome.
  editTabOn: { background: '#1a1a1a', color: '#fff' },
  sheetBody: {
    flex: '1 1 auto', minHeight: 0, width: '100%', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
    scrollbarWidth: 'none',
  },
  // Sits OVER the last few pixels of the body, not after it — a marker that took its own row would
  // add height to the thing whose height is the problem.
  // The flattened Chef's Desk / Settings rows. Full-width taps at the 44px floor — the sheet is
  // where there is finally room for that, which is half the reason these two moved here.
  mobileSheetSection: { borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 8, marginTop: 4 },
  mobileSheetSectionTitle: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)', padding: '0 4px 4px',
  },
  mobileSheetRow: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44,
    padding: '0 4px', border: 'none', background: 'none', cursor: 'pointer',
    // The sheet's ground is #141416 — mobileSheetItem's own rgba(255,255,255,0.72), not a dark ink.
    // Typed as #2a2a2a first, which rendered near-black on near-black: legible in the style object
    // and invisible on the phone.
    fontSize: 14.5, fontWeight: 600, color: 'rgba(255,255,255,0.72)', fontFamily: "'Quicksand',sans-serif",
    textAlign: 'left',
  },
  sheetMore: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 32, pointerEvents: 'none',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 1,
    color: '#8a7c70',
    background: 'linear-gradient(to bottom, rgba(255,253,249,0), rgba(255,253,249,0.92))',
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
    // Height comes from the CONTENT of the active tab, capped. A fixed height was the previous
    // attempt and it is what sliced the colour picker in half. The canvas insets by the sheet's
    // MEASURED height (editSheetH), so content-sized, dragged and capped all hold the same promise:
    // the cake is never behind the sheet.
    maxHeight: `${Math.round(EDIT_PANEL_MAX_VH * 100)}%`,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    // Frosted (was near-solid 0.97) to match the element stack — the cake shows through.
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '20px 20px 0 0',
    padding: '14px 16px 24px',
    boxShadow: '0 -4px 24px rgba(107,45,66,0.14)',
    zIndex: 20,
  },
};

// Wrap the designer in a reporting error boundary so a render crash surfaces to
// telemetry (with baker context) and shows a fallback instead of white-screening.
export default function CakeDesigner(props) {
  return (
    <ErrorBoundary screen="CakeDesigner">
      <CakeDesignerInner {...props} />
    </ErrorBoundary>
  );
}
