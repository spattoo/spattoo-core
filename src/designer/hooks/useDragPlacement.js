import { useRef } from 'react';
import { pointerRay } from '../utils/raycasting.js';

// ── Drag-to-place interaction for top/side cake decorations ─────────────────────────────────────
// The shared press/drag/tap behaviour behind AgeNumber and CreamWriting (and mirrors the sticker
// draggables): pressing the invisible grab mesh disables orbit and captures the pointer; movement
// past a small threshold becomes a drag — each frame builds a pointer ray and hands it to the
// caller's `resolve(ray, ev)`, which maps it to a placement patch (or null to skip); a no-move
// press is a tap → `onClick`. The ONLY thing that varies between decorations is `resolve` (which
// surface the ray hits and which coords it writes); everything else — orbit suspend, the 5px drag
// threshold, pointer-capture, listener wiring, and the `grabProps` for the grab mesh — lives here.
//
// Returns { grabProps, pressedRef }: spread `grabProps` on the invisible grab mesh; `pressedRef`
// is shared so the leave-handler doesn't re-enable orbit mid-drag.
export function useDragPlacement({ gl, camera, onMove, onClick, onOrbitEnable, resolve }) {
  const pressedRef = useRef(false);
  const hoverRef = useRef(false);

  // ⚠️ THE CURSOR IS THE ONLY RESTING AFFORDANCE A DECORATION ON THE CANVAS HAS (root CLAUDE.md
  // rule 7, "if it does something, it must look like it does something"). A cloud, a rainbow and a
  // balloon are meshes in a 3D scene — there is no border to press and no row to highlight, so with
  // the arrow left unchanged the whole cake reads as scenery and nobody learns the parts are live.
  // It belongs HERE and not on the balloon: every draggable decoration comes through this hook, so
  // one copy gives all of them the affordance and none of them can quietly lose it. `pointer` on
  // hover because a tap opens the card; `grabbing` while pressed because a drag moves it.
  const setCursor = v => { const el = gl?.domElement; if (el) el.style.cursor = v; };

  const onDown = e => {
    e.stopPropagation();
    pressedRef.current = true;
    onOrbitEnable?.(false);
    setCursor('grabbing');
    try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    let didDrag = false;
    const start = { x: e.clientX, y: e.clientY };
    const canvas = gl.domElement;
    function move(ev) {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (dx * dx + dy * dy > 25) didDrag = true;
      if (!didDrag || !onMove) return;
      const ray = pointerRay(ev, canvas, camera);
      const patch = resolve(ray, ev);
      if (patch) onMove(patch);
    }
    function up(ev) {
      pressedRef.current = false;
      onOrbitEnable?.(true);
      // Back to the hover cursor if the pointer is still over the mesh, and to the page's own if
      // the drag carried it off — a release elsewhere fires no leave event to tidy up after it.
      setCursor(hoverRef.current ? 'pointer' : '');
      if (!didDrag && onClick) onClick(ev);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    }
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  };

  const grabProps = {
    userData: { isStickerHitPlane: true },
    onPointerEnter: e => { e.stopPropagation(); hoverRef.current = true; onOrbitEnable?.(false); setCursor('pointer'); },
    onPointerLeave: e => {
      e.stopPropagation(); hoverRef.current = false;
      if (!pressedRef.current) { onOrbitEnable?.(true); setCursor(''); }
    },
    onPointerDown: onDown,
    onClick: e => e.stopPropagation(),
  };

  return { grabProps, pressedRef };
}
