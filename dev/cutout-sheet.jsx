import { createRoot } from 'react-dom/client';
import CutoutSheet from '../src/chefsdesk/CutoutSheet.jsx';
import { calendarSourcesFor } from '../src/chefsdesk/a4/calendarSource.js';

/* ── The order's "Print & cut-outs" sheet, without an order ──────────────────────────────────────
 *
 * Reaching this screen normally costs a baker login, an order with a saved design, and the X-Ray
 * panel — which is a long way to go to find out whether a calendar prints the customer's date.
 *
 * ⚠️ AND THE ANSWER USED TO BE NO, SILENTLY. `CutoutModal` builds its sheet from the CATALOGUE, not
 * the design (a snapshot carries element IDs and placement, not image URLs), and `elementSources`
 * fell back to `element.thumbnail_url` — which the Calendar Studio bakes from a SAMPLE date. So the
 * sheet printed a real, plausible calendar showing a date nobody chose. Nothing failed; the wrong
 * date simply went to the kitchen.
 *
 * So this fixture is built to catch exactly that, and each row earns its place:
 *
 *   TWO calendars, DIFFERENT dates  — a birthday and an anniversary on one cake. If they are ever
 *                                     keyed by `elementId` (as XrayDecorationSteps' elementRows
 *                                     still does) one date prints twice and the other vanishes.
 *   The calendar's CATALOGUE ROW    — passed in `elements`, where it would be traced. It must NOT
 *                                     produce a card: `elementSources` refuses it, and CutoutModal
 *                                     filters it, so a sample date can never reach paper.
 *   An ordinary decoration          — so the traced path still runs beside the drawn one, and a
 *                                     fixture of nothing but calendars cannot certify a sheet that
 *                                     has quietly stopped tracing images.
 *
 * Open /cutout-sheet.html.
 */

const CAL_GRID = {
  layout: 'grid', medium: 'printed',
  ink: '#1A1A1A', accent: '#D8342B', paper: '#ffffff',
  ringStyle: 'circle', showDayHeader: true, showMonthName: true,
};

const CAL_ROUND = {
  layout: 'round', medium: 'piped',
  ink: '#3E2723', accent: '#D8342B', paper: null,
  ringStyle: 'heart', showDayHeader: true, showMonthName: true,
};

/* Snapshot-shaped: this is what `resolveXraySpec(order).design` hands CutoutModal, and the DATE
   lives here on the placement — never on the element. */
const DESIGN = {
  stickers: [
    { id: 's1', elementId: 'el-cal', name: 'Month calendar', imageUrl: null,
      zone: 'top_surface', tierIndex: 0, x: 0, z: 0, scale: 6,
      calendar: CAL_GRID, calendarValues: { year: 2026, month: 12, day: 25 } },
    { id: 's2', elementId: 'el-cal', name: 'Anniversary calendar', imageUrl: null,
      zone: 'top_surface', tierIndex: 0, x: 0.2, z: 0.2, scale: 6,
      calendar: CAL_ROUND, calendarValues: { year: 2027, month: 3, day: 14 } },
    { id: 's3', elementId: 'el-lion', name: 'Lion', imageUrl: '/sample-cake-1.png',
      zone: 'side', tierIndex: 0, x: 0, z: 0, scale: 1 },
  ],
};

/* Catalogue-shaped, as `fetchElements` returns them. The calendar row carries a thumbnail baked
   from a SAMPLE date — the exact thing that must never be printed. */
const ELEMENTS = [
  { id: 'el-lion', name: 'Lion', image_url: '/sample-cake-1.png', thumbnail_url: null,
    placement_config: { r: 1, side: 'hug' } },
  { id: 'el-cal', name: 'Month calendar', image_url: null,
    thumbnail_url: '/sample-cake-2.png',            // stands in for the sample-date bake
    placement_config: { top_surface: 'hug', r: 1, calendar: CAL_GRID } },
];

/* The same two lines CutoutModal runs: calendars come from the DESIGN, and the calendar's catalogue
   row is dropped from the traced list so the sheet's "could not be prepared" count stays honest. */
const extraSources = calendarSourcesFor(DESIGN);
const elements = ELEMENTS.filter(e => !e.placement_config?.calendar);

createRoot(document.getElementById('root')).render(
  <CutoutSheet elements={elements} extraSources={extraSources} title="Fixture cake" />,
);
