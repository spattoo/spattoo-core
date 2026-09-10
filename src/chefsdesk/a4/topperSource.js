import { topperSheets, topperBox } from '../../designer/geometry/topperPiece.js';
import { loadFacesFor, BLOCK_FACE } from '../../designer/geometry/topperFaces.js';

// ── A card topper on the print sheet ─────────────────────────────────────────────────────────────
//
// A card topper is the one decoration on this sheet that is genuinely MADE of paper, so printing it
// is not a workaround — it is how the thing is produced. The baker prints it on card and cuts it out.
//
// ⚠️ ONE PIECE, WITH THE OFFSET BAKED IN. The band is a separate SHEET in the geometry and it is
// deliberately not a separate item here: what gets printed is the topper as it looks, bands and all,
// and the baker cuts round the outside of it. Splitting it into layers would be describing how a
// two-colour card is assembled, which is a different product from the one they chose by pressing
// print.
//
// ⚠️ IT ASKS `topperSheets`, the same function the cake and the studio ask (INVARIANTS #15). Every
// other source on this sheet has to TRACE an outline out of an image's alpha, because a PNG is all
// it has. A topper is not stored as a picture, so there is nothing to trace and nothing to lose: the
// contours printed here are the contours the cake draws.
//
// ⚠️ AND NOTHING HERE DECIDES A REAL SIZE. `cutoutSource.js` sets out why at length — no saved design
// records one — so the baker sizes it on the sheet, which is the same judgement they already make
// for everything else on it.

/* The source-id prefix, exported so the studio's save and open paths agree on it in one place
   rather than each spelling it out. */
export const TOPPER_PREFIX = 'topper:';


/**
 * What a topper occupies and what it is made of, with no canvas involved — so the shape of a printed
 * topper can be checked without a DOM, which is where every drawing bug here would otherwise hide.
 *
 * @returns {{sheets: Array, box: {w,h,cx,cy}, aspect: number} | null}
 */
export function topperPlan(payload, fontOf) {
  const sheets = topperSheets(payload, fontOf);
  const box = topperBox(payload, fontOf);
  if (!box || !(box.w > 0) || !(box.h > 0) || !sheets.length) return null;
  return { sheets, box, aspect: box.w / box.h };
}

/**
 * Fill a topper into a 2D context, scaled into a box. Pure drawing — no canvas creation, no DOM — so
 * the sheet's live preview and the PDF export share one definition of what a topper LOOKS like.
 * Two renderers would drift, and the one that drifted would be the printed one.
 */
export function fillTopper(ctx, plan, x, y, wPx, hPx) {
  const { sheets, box } = plan;
  const sx = wPx / box.w, sy = hPx / box.h;
  const x0 = box.cx - box.w / 2, y1 = box.cy + box.h / 2;
  // Canvas y grows DOWNWARD and the composer's grows up, so every point is flipped. Getting this
  // wrong does not throw — it prints the topper upside down.
  const px = (qx, dx) => x + ((qx + dx) - x0) * sx;
  const py = (qy, dy) => y + (y1 - (qy + dy)) * sy;

  ctx.save();
  for (const sheet of sheets) {
    ctx.beginPath();
    for (const part of sheet.parts) {
      const ring = (pts) => pts.forEach((q, i) => {
        const cx = px(q.x, sheet.x ?? 0), cy = py(q.y, sheet.y ?? 0);
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ring(part.outer);
      ctx.closePath();
      // A hole is a subpath of the SAME path, filled even-odd — the counter of an "O" is not a
      // separate shape, it is the absence of one.
      for (const h of part.holes ?? []) { ring(h); ctx.closePath(); }
    }
    ctx.fillStyle = sheet.colour || '#FFFFFF';
    ctx.fill('evenodd');
  }
  ctx.restore();
}

/** A tile for the library strip: the topper on its own, drawn at a readable size. */
function previewOf(plan) {
  const LONG = 200;
  const w = plan.aspect >= 1 ? LONG : Math.round(LONG * plan.aspect);
  const h = plan.aspect >= 1 ? Math.round(LONG / plan.aspect) : LONG;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  fillTopper(c.getContext('2d'), plan, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/**
 * The sheet items a card topper offers. One, deliberately — see the note above.
 *
 * `topper` is the payload, carried on the source so a SAVED sheet can redraw it. What is persisted
 * for an image is an `uploadId`; a topper has no upload to point at, and `printSheets.js` stores
 * items exactly as sent, so the payload rides along. That also means a sheet keeps printing what it
 * printed even after the cake it came from is changed — which is what a record of a print job should
 * do.
 *
 * @param {{id: string, name?: string, payload: object}} topper
 * @returns {Promise<Array>} `[print]`, or `[]` when there is nothing on it to draw.
 */
export async function topperSources(topper) {
  const payload = topper?.payload;
  if (!payload) return [];
  const fonts = await loadFacesFor(payload);
  const plan = topperPlan(payload, (o) => fonts[o.face] ?? fonts[BLOCK_FACE]);
  if (!plan) return [];

  return [{
    id: `${TOPPER_PREFIX}${topper.id}`,
    name: topper.name?.trim() || 'Card topper',
    kind: 'print',
    aspect: plan.aspect,
    preview: previewOf(plan),
    topper: payload,
    draw: (ctx, x, y, wPx, hPx) => fillTopper(ctx, plan, x, y, wPx, hPx),
  }];
}
