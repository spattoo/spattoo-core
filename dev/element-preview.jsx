import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ElementPreview from '../src/designer/preview/ElementPreview.jsx';
import { ZONES } from '../src/designer/constants.js';
import { calendarSheet } from '../src/designer/shared/textures/calendarArt.js';

/* ── The admin element preview, without admin ────────────────────────────────────────────────────
 *
 * ElementPreview is the screen an admin uses to look at a decoration before any baker sees it. It
 * lives in spattoo-core (the placement knowledge is the designer's, not admin's) and mounts in
 * spattoo-admin's ManageElements — which means seeing it normally costs an admin login.
 *
 * This is that component against hand-written element rows, so its behaviour can be checked while
 * it is being built: does an element seated in a zone actually appear THERE, does the per-zone mode
 * come from the element rather than a default, does a wider tier change the placement.
 *
 * The rows below are the shapes the API returns, not simplifications — placement_config with the
 * per-zone `mode` object, allowed_zones, allowed_actions. Open /element-preview.html.
 */

// `stand` on the top surface: the ordinary topper. The one that works if anything does.
const TOPPER = {
  id: 'sample-topper',
  name: 'Stand topper (top surface)',
  image_url: '/sample-cake-2.png',
  allowed_zones: [ZONES.TOP_SURFACE],
  placement_config: { r: 3, zones: { [ZONES.TOP_SURFACE]: { mode: 'stand' } } },
  allowed_actions: { resize: true, duplicate: true, color: false, delete: true },
};

// `hug` on the side wall — the mode that reads WRONG if the preview quietly substitutes `stand`,
// which is exactly the class of drift this harness exists to catch.
const WALL_HUG = {
  id: 'sample-hug',
  name: 'Wall hug (side)',
  image_url: '/sample-cake-3.png',
  allowed_zones: [ZONES.SIDE],
  placement_config: { r: 3, hug_fill: 0.7, zones: { [ZONES.SIDE]: { mode: 'hug' } } },
  allowed_actions: { resize: true, duplicate: true, color: false, delete: true },
};

// Two zones, different mode in each. Switching zone must change the pose, not just the position.
const BOTH = {
  id: 'sample-both',
  name: 'Two zones, a mode each',
  image_url: '/sample-cake-1.png',
  allowed_zones: [ZONES.TOP_SURFACE, ZONES.SIDE],
  placement_config: {
    r: 3,
    zones: { [ZONES.TOP_SURFACE]: { mode: 'stand' }, [ZONES.SIDE]: { mode: 'hug' } },
  },
  allowed_actions: { resize: true, duplicate: true, color: true, delete: true },
};

/* ── The two calendars, in the shape CalendarStudio actually SAVES ──────────────────────────────
 * Copied field-for-field off the studio's handleSave rather than reconstructed, because a harness
 * that exercises a shape nothing writes proves nothing at all.
 *
 * ⚠️ `image_url: null` IS THE TEST. Every other row here has artwork; these have none, because a
 * calendar is a recipe and 12 months x 31 dates x 2 layouts is a per-value asset explosion. This is
 * exactly what `StickerFace`'s `if (!imageUrl) return null` used to swallow — the decoration
 * appeared in the picker and then vanished the instant it was placed.
 *
 * ⚠️ `color: false` on purpose: the ink and accent are AUTHORED here, not a customer choice. The
 * customer owns the DATE and nothing else.
 */
const GRID_RECIPE = {
  layout: 'grid', medium: 'printed',
  ink: '#1A1A1A', accent: '#D8342B', paper: '#ffffff',
  ringStyle: 'circle', showDayHeader: true, showMonthName: true,
  rect: { x: 0.5, y: 0.54, w: 0.78, h: 0.56 }, fontScale: 1,
};

const ROUND_RECIPE = {
  layout: 'round', medium: 'piped',
  ink: '#3E2723', accent: '#D8342B', paper: null,
  ringStyle: 'heart', showDayHeader: true, showMonthName: true,
  rect: { x: 0.5, y: 0.54, w: 0.68, h: 0.5 }, fontScale: 1,
};

const CAL_ACTIONS = { resize: true, duplicate: false, color: false, gradient: false, delete: true, move: true, tilt: false };

// Sandeep's second reference: a printed disc reading "October 2025". Paper, so it carries a field.
const CALENDAR_GRID = {
  id: 'sample-calendar-grid',
  name: 'Calendar grid (printed)',
  image_url: null,
  allowed_zones: [ZONES.TOP_SURFACE],
  placement_config: {
    top_surface: 'hug', r: 1,
    // ASKED FOR, never typed — the same call the Calendar Studio makes when it saves.
    sheet: calendarSheet(GRID_RECIPE),
    calendar: GRID_RECIPE,
  },
  allowed_actions: CAL_ACTIONS,
};

// Sandeep's first reference: a piped freehand month with the date circled in red gel — and his
// follow-up, "ring also - with grid lines only. but inside a circle outline". `paper: null` is how a
// calendar says it has no field: the gel goes straight onto the cake's own surface.
const CALENDAR_ROUND = {
  id: 'sample-calendar-round',
  name: 'Calendar round (piped)',
  image_url: null,
  allowed_zones: [ZONES.TOP_SURFACE],
  placement_config: {
    top_surface: 'hug', r: 1,
    // ASKED FOR, never typed — the same call the Calendar Studio makes when it saves.
    sheet: calendarSheet(ROUND_RECIPE),
    calendar: ROUND_RECIPE,
  },
  allowed_actions: CAL_ACTIONS,
};

const ELEMENTS = [TOPPER, WALL_HUG, BOTH, CALENDAR_GRID, CALENDAR_ROUND];

function Harness() {
  const [el, setEl] = useState(ELEMENTS[0]);
  const [zone, setZone] = useState(null);
  const [tierCount, setTierCount] = useState(1);
  const [tierIndex, setTierIndex] = useState(0);

  const zones = el.allowed_zones ?? [];
  const pick = (e) => { setEl(e); setZone(null); setTierIndex(0); };

  return (
    <div style={s.page}>
      <div style={s.bar}>
        <b style={{ fontSize: 13, color: '#2A241F' }}>Element preview</b>
        <span style={s.sep} />
        <span style={s.label}>Element</span>
        {ELEMENTS.map(e => (
          <button key={e.id} onClick={() => pick(e)} style={{ ...s.chip, ...(el.id === e.id ? s.on : {}) }}>
            {e.name}
          </button>
        ))}
        <span style={s.sep} />
        <span style={s.label}>Zone</span>
        {zones.map(z => (
          <button key={z} onClick={() => setZone(z)}
                  style={{ ...s.chip, ...((zone ?? zones[0]) === z ? s.on : {}) }}>{z}</button>
        ))}
        <span style={s.sep} />
        <span style={s.label}>Tiers</span>
        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => { setTierCount(n); setTierIndex(Math.min(tierIndex, n - 1)); }}
                  style={{ ...s.chip, ...(tierCount === n ? s.on : {}) }}>{n}</button>
        ))}
        <span style={s.label}>on tier</span>
        {Array.from({ length: tierCount }, (_, i) => (
          <button key={i} onClick={() => setTierIndex(i)}
                  style={{ ...s.chip, ...(tierIndex === i ? s.on : {}) }}>{i}</button>
        ))}
      </div>

      <div style={s.stage}>
        <div style={s.frame}>
          <ElementPreview element={el} zone={zone} tierCount={tierCount} tierIndex={tierIndex} />
        </div>
        <div style={s.readout}>
          <Row k="element" v={el.name} />
          <Row k="zone" v={zone ?? `${zones[0]} (default)`} />
          <Row k="mode" v={el.placement_config?.zones?.[zone ?? zones[0]]?.mode ?? 'stand (fallback)'} />
          <Row k="tier" v={`${tierIndex} of ${tierCount}`} />
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7A6C60', padding: '3px 0' }}>
    <span>{k}</span><b style={{ color: '#111' }}>{v}</b>
  </div>
);

const s = {
  page: { minHeight: '100%', background: '#edeae3', fontFamily: "'Quicksand',sans-serif" },
  bar: {
    position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '10px 18px', background: '#fff', borderBottom: '1px solid #e0dbd2', marginBottom: 26,
  },
  sep: { width: 1, height: 18, background: '#e0dbd2', margin: '0 6px' },
  label: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8d8378' },
  // All-longhand: mixing `border` here with `borderColor` in `on` makes React warn on every
  // re-render, because it cannot reconcile a shorthand against a longhand for the same value.
  chip: {
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd6cb',
    background: '#fff', color: '#5f574e', borderRadius: 999,
    padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif",
  },
  on: { background: '#1a1a1a', borderColor: '#1a1a1a', color: '#fff' },
  stage: { display: 'flex', gap: 26, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap', padding: '0 18px 40px' },
  frame: { width: 420, height: 420, background: '#f4f2ee', borderRadius: 16, border: '1px solid #e0dbd2', overflow: 'hidden' },
  readout: { width: 260, padding: '12px 14px', background: '#fff', border: '1px solid #e0dbd2', borderRadius: 10 },
};

createRoot(document.getElementById('root')).render(<Harness />);
