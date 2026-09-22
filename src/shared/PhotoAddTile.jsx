// ── "Add a photo" — the square dashed tile, in one place ─────────────────────────────────────────
//
// Three screens let someone add an image and all three looked different:
//
//   New Order            a 72px dashed SQUARE with a + and "Add", sitting in the row of thumbnails
//   Storefront design    a full-width dashed BAR under the grid, "Choose a photo"
//   My Decorations       a full-width dashed BAR above the grid, "+ Upload a new image"
//
// Sandeep, on the storefront one: *"upload control looks more like a button … make it look like the
// one in order creation."*
//
// ⚠️ THE SQUARE IS NOT A STYLE PREFERENCE, IT IS THE HONEST SHAPE. What this control produces is a
// picture, and it produces one that will sit exactly where the tile sits, at that size, beside the
// ones already there. A full-width bar says "perform an action"; a tile the same size and shape as
// its neighbours says "another one goes here", which is the thing actually about to happen. It also
// makes the empty state legible without a sentence — one dashed square among real thumbnails reads
// as a gap to fill.
//
// A `<label>` wrapping a hidden `<input type="file">`, not a button that clicks a ref: the label IS
// the control, so it is keyboard reachable and announced as a file input without any of our own
// handling. `htmlFor` is not needed while the input is a child.
//
// ⚠️ THE CALLER PLACES IT, and the two callers differ on purpose. New Order and the storefront put
// it LAST, after the photos, because both cap at three and "add another" belongs after what you
// have. My Decorations puts it FIRST, because that library grows without limit and a control at the
// end of two hundred uploads is a control nobody finds.

import { useRef } from 'react';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * @param {string}   color     the surface's own accent — this control is themed by its host, so the
 *                             storefront wears the baker's palette and the app wears its own.
 * @param {number|string} size  a px edge for a fixed square, or '100%' to fill one grid cell
 *                             (then it takes a 1:1 aspect ratio, like the thumbnails it sits among).
 * @param {boolean}  busy      an upload is in flight; the tile says so and stops taking more.
 * @param {string}   label     what it adds — "Add", "Upload". Kept short: it sits under a "+".
 * @param {boolean}  multiple  whether one press may choose several files.
 * @param {(FileList) => void} onFiles
 */
export function PhotoAddTile({
  color = '#2C2A26', size = 72, busy = false, label = 'Add',
  multiple = true, accept = ACCEPT, onFiles, disabled = false,
}) {
  const ref = useRef(null);
  const off = busy || disabled;

  return (
    <label
      style={{
        /* ⚠️ A NUMBER IS A FIXED SQUARE; '100%' IS A GRID CELL. Height cannot be a percentage here —
           there is nothing to be a percentage OF inside an auto-fill track — so the cell case uses
           aspect-ratio instead, which is what the thumbnails beside it already use. Getting this
           wrong collapses the tile to zero height, and it collapses silently. */
        width: size,
        ...(typeof size === 'number' ? { height: size } : { aspectRatio: '1' }),
        borderRadius: 12,
        border: `1.5px dashed ${off ? '#CFC7BD' : color}`,
        // The faintest wash of the accent, so the tile reads as an empty SLOT rather than as a
        // bordered box floating on the page. 5% survives on both the app's paper and a baker's
        // storefront, whatever colour they chose.
        background: off ? '#F5F3F0' : `${color}0D`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 3, cursor: off ? 'default' : 'pointer',
        color: off ? '#9A948C' : color, fontSize: 11, fontWeight: 700,
        textAlign: 'center', lineHeight: 1.2, boxSizing: 'border-box', flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      {busy ? 'Adding…' : label}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={off}
        style={{ display: 'none' }}
        onChange={(e) => {
          onFiles?.(e.target.files);
          // ⚠️ CLEARED, OR THE SAME FILE CANNOT BE CHOSEN TWICE. Picking a photo, removing it and
          // picking it again fires no change event while the input still holds that value.
          e.target.value = '';
        }}
      />
    </label>
  );
}
