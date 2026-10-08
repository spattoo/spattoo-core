// ── The cursor over a live thing on the cake ────────────────────────────────────────────────────
//
// A decoration in a 3D scene has no border to press and no row to highlight. With the arrow left
// unchanged the whole cake reads as scenery, and nobody learns which parts answer a click — root
// CLAUDE.md rule 7, "if it does something, it must look like it does something".
//
// It lives here because TWO kinds of thing need it and they are not the same kind. A draggable
// decoration gets it from `useDragPlacement`, which also swaps to `grabbing` while a drag is in
// hand. A click-only treatment — the brushstroke band, which is a finish on the wall rather than an
// object standing on it — has no drag and no hook, and copying four lines into each such mesh is
// how one of them silently loses the affordance.
//
// ⚠️ IT IS SET ON THE CANVAS, NOT ON THE MESH. A WebGL canvas is one DOM element; the meshes inside
// it are not DOM at all, so there is no element to hang a `cursor` style on. Every caller therefore
// writes to the same property, which is exactly why leaving must put it back.

/** Write the cursor on the WebGL canvas. `''` restores whatever the page asks for. */
export function setCanvasCursor(gl, value) {
  const el = gl?.domElement;
  if (el) el.style.cursor = value;
}

/**
 * Hover props for a mesh that answers a CLICK but is never dragged.
 *
 * `stopPropagation` so a mesh in front of another does not leave the one behind it also claiming
 * the pointer — the same reason every other handler on these meshes stops it.
 */
export function hoverCursorProps(gl) {
  return {
    onPointerEnter: (e) => { e.stopPropagation(); setCanvasCursor(gl, 'pointer'); },
    onPointerLeave: (e) => { e.stopPropagation(); setCanvasCursor(gl, ''); },
  };
}
