import { useMemo } from 'react';
import { composeCalendar, resolveCalendarCfg } from '../shared/textures/calendarArt.js';
import { INK } from '../../shared/tokens.js';

// ── The shape a calendar is drawn as, chosen by looking at it ────────────────────────────────────
//
// Sandeep: *"round or grid should be an option, not a separate control"* — and not two catalogue rows
// either: *"user would not understand it. its an internal setting which user would know only after
// looking into the control."* So the shapes live inside the calendar's own control, and the way to
// choose between them is to see them.
//
// ⚠️ IT DRAWS THE OPTION, IT DOES NOT NAME IT — which is the lesson this codebase already paid for.
// The Pose row was removed because the placement tiles beside it said the same thing better: *"the
// tiles win because they are strictly more informative: each one RENDERS the pose. A text toggle
// cannot do that."* A Grid/Round toggle would be that same mistake in a new place. `ArrangementTile`
// (rainbows) is the precedent being followed here.
//
// ⚠️ AND IT DRAWS THE CUSTOMER'S OWN DATE, not a sample. The tile is a preview of what THIS cake will
// carry, so the ringed day is theirs — the difference between "here are two shapes" and "here is your
// cake, twice". It costs nothing: a calendar is drawn from three integers.
//
// ⚠️ LAYOUT IS THE CALLER'S JOB. `ArrangementTile` carries a note that a shared component must not own
// its callers' layout preferences, because pushing one card's decision into a shared component is how
// a shared component ends up owning them all. Same rule here: no flex, no shrink, no margins.

/* Small enough to sit two-up in a control row, big enough that the grid reads as a grid rather than
   as grey texture. Matches the 40-46 the rainbow tiles use in the same kind of row. */
const TILE_PX = 46;

/**
 * One shape a calendar offers, drawn.
 *
 * @param {'grid'|'round'} layout   the shape this tile stands for
 * @param {object} calendar         the recipe (`placement_config.calendar`)
 * @param {{year,month,day}} date   the customer's date, so the tile previews THEIR cake
 * @param {boolean} on              is this the chosen shape
 * @param {() => void} onPick
 */
export function CalendarLayoutTile({ layout, calendar, date, on, onPick, size = TILE_PX }) {
  // Redrawn only when the shape, the recipe or the date actually changes — not on every render of a
  // card the customer is dragging a dial on. `composeCalendar` rasterises a whole month each call.
  const src = useMemo(() => {
    try {
      return composeCalendar(size * 4, date, resolveCalendarCfg(calendar, layout)).toDataURL('image/png');
    } catch (_) {
      // A tile that cannot draw shows nothing rather than a broken image: the other shape is still
      // pickable, and a calendar that cannot be drawn at all is a bigger problem than this control.
      return null;
    }
  }, [layout, calendar, date, size]);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      title={LABELS[layout] ?? layout}
      style={{
        border: `1.5px solid ${on ? INK : '#E3E0DA'}`,
        background: on ? '#F4F7F4' : '#fff',
        borderRadius: 10, padding: '5px 3px 3px', cursor: 'pointer',
        width: size + 28, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 2, fontFamily: 'inherit',
      }}
    >
      {/* The cake's own surface behind it, because `paper: null` draws on the cake and a piped
          calendar on a white tile would read as a printed one. */}
      <div style={{
        width: size, height: size, borderRadius: 6, overflow: 'hidden',
        background: '#F3EDE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
      </div>
      <span style={{ fontSize: 9, lineHeight: 1.2, color: '#5B6B60', textAlign: 'center' }}>
        {LABELS[layout] ?? layout}
      </span>
    </button>
  );
}

/* Named for what a customer sees on the cake, not for the key. "Round" is the disc that fits a round
   cake top; "Grid" is the rectangular month. The admin-facing labels in CalendarStudio say more
   because an operator is choosing what to OFFER, not what to have. */
const LABELS = { grid: 'Grid', round: 'Round' };

export default CalendarLayoutTile;
