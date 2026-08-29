import { useState, useRef, useMemo, useEffect, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildPipingStroke, buildPipingHeap } from '../geometry/creamPen.js';
import { snapStroke } from '../geometry/strokeSnap.js';
import { translateStroke, distanceToStroke } from '../geometry/strokeMove.js';
import { buildRay } from '../utils/raycasting.js';
import { mediumOf } from '../geometry/pipingMedia.js';
import StampStroke from './StampStroke.jsx';
import { LoadingPing } from './loadingRegistry.js';

// ── Cream Pen (freehand piping) ──────────────────────────────────────────────
// Renders the committed freehand strokes (design.piping) and, while drawMode is on,
// captures new ones: transparent "catcher" meshes overlay each tier (and the board) so
// a drag on the cake lays a stroke. Each pointer hit is SEATED — offset along the surface
// normal by the rope radius — so the cream rests on the cake; the seated points are what
// we store and what the geometry sweeps through.
//
// Capture uses the RAW DOM pointermove with getCoalescedEvents() — not R3F's hover-gated
// onPointerMove, which fires too sparsely on fast drags and left gaps in the rope. Each
// coalesced sample is raycast against the catchers, so a quick flick still yields a dense,
// continuous stroke.
//
// Orbit: the catchers are tagged `isPenCatcher`; CakeScene's capture-phase pointerdown
// handler reads that tag and disables rotate when you press on the cake (so you draw) and
// leaves it on for empty space (so you rotate). The pen itself doesn't touch orbit.

function StrokeMesh({ kind, points, point, normal, nozzle, color, thickness, softness, heapHeight, medium }) {
  const geo = useMemo(
    () => (kind === 'heap'
      ? buildPipingHeap(point, normal, nozzle, thickness, heapHeight)
      : buildPipingStroke(points, nozzle, thickness)),
    [kind, points, point, normal, nozzle, thickness, heapHeight],
  );
  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow>
      {/* DoubleSide keeps the fan caps lit regardless of winding (cream is opaque) */}
      {/* Cream or chocolate — the table answers it, so there is no branch here and a third medium
          is a row rather than an edit. A stroke saved before media existed has no `medium` and
          falls back to cream, which is what it was piped as. */}
      <meshPhysicalMaterial side={THREE.DoubleSide} {...mediumOf(medium).material({ softness }, color)} />
    </mesh>
  );
}

const CatcherMat = () => <meshBasicMaterial transparent opacity={0} depthWrite={false} />;

export default function CreamPen({ piping = [], drawMode = false, moveMode = false, penStyle, tierData = [], board, onAddStroke, onMoveStroke }) {
  const { gl, camera, scene } = useThree();
  const [live, setLive] = useState([]);          // Vector3[] — seated centerline of the in-progress stroke
  const activeRef = useRef(null);                // { tierIndex } while drawing, else null
  // { id, from, original } while sliding a placed stroke. Separate from activeRef because the two
  // gestures are different: drawing accumulates points, moving replays one stroke from its ORIGINAL
  // position each frame — replaying from the live one would compound every mouse-move into a drift.
  const moveRef   = useRef(null);
  const pipingRef = useRef(piping);
  pipingRef.current = piping;
  const styleRef  = useRef(penStyle);
  styleRef.current = penStyle;
  const rc = useRef(new THREE.Raycaster());

  // Raycast a screen point against the catcher meshes; return the surface hit lifted along
  // its normal by the rope radius (so the cream rests on the surface) plus that normal (for
  // star heaps, which extrude up it), or null if off-cake.
  const seatAt = (clientX, clientY) => {
    const ray = buildRay(clientX, clientY, gl.domElement, camera);
    rc.current.set(ray.origin, ray.direction);
    const hit = rc.current.intersectObjects(scene.children, true)
      .find(h => h.object.userData?.isPenCatcher);
    if (!hit) return null;
    const n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    return { p: hit.point.clone().addScaledVector(n, styleRef.current?.thickness ?? 0.03), n };
  };

  // R3F pointerdown on a catcher starts the stroke (and gives us the tier + surface normal it
  // began on — the normal is the heap's extrusion axis if this turns out to be a tap).
  const start = (e, tierIndex) => {
    e.stopPropagation();
    try { gl.domElement.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    const s = seatAt(e.clientX, e.clientY);

    // ── Sliding a placed stroke ────────────────────────────────────────────────────────────────
    // The nearest stroke to the press wins, which is what a finger means by "that one", and only
    // within a grab radius — a press on bare cake with the nearest line half a cake away is not a
    // grab of it. The radius scales with the stroke's own thickness so a fat border is as easy to
    // catch as a fine one.
    if (moveMode) {
      if (!s) return;
      const hit = [-1, null];
      let best = Infinity;
      for (const st of pipingRef.current) {
        const pts = st.points ?? (st.point ? [st.point] : null);
        if (!pts) continue;
        const d = distanceToStroke(pts, s.p.toArray());
        const reach = Math.max(0.12, (st.thickness ?? 0.03) * 3);
        if (d < best && d < reach) { best = d; hit[0] = d; hit[1] = st; }
      }
      if (hit[1]) moveRef.current = { id: hit[1].id, from: s.p.toArray(), original: hit[1].points };
      return;
    }

    activeRef.current = { tierIndex, normal: s ? s.n : null };
    setLive(s ? [s.p] : []);
  };

  // Raw-DOM move + commit. Coalesced events give every intermediate position, so fast
  // drags stay continuous instead of breaking into disconnected beads.
  useEffect(() => {
    if (!drawMode && !moveMode) return;
    const el = gl.domElement;

    const onMove = ev => {
      if (moveRef.current) {
        const m = moveRef.current;
        const s = seatAt(ev.clientX, ev.clientY);
        if (!s) return;
        const st = pipingRef.current.find(x => x.id === m.id);
        // Replayed from the ORIGINAL points every frame, never from the live ones — accumulating
        // would turn every intermediate pointermove into another displacement.
        onMoveStroke?.(m.id, translateStroke(m.original, m.from, s.p.toArray(), {
          normal: st?.normal ?? [0, 1, 0], axis: [0, 0],
        }));
        return;
      }
      if (!activeRef.current) return;
      const samples = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
      const evs = (samples && samples.length) ? samples : [ev];
      const minGap = Math.max(0.006, (styleRef.current?.thickness ?? 0.03) * 0.5);
      setLive(prev => {
        const next = prev.slice();
        for (const pe of evs) {
          const s = seatAt(pe.clientX, pe.clientY);
          if (!s) continue;
          if (!activeRef.current.normal) activeRef.current.normal = s.n;  // capture normal if start missed
          if (!next.length || s.p.distanceTo(next[next.length - 1]) >= minGap) next.push(s.p);
        }
        return next;
      });
    };

    const onUp = () => {
      if (moveRef.current) { moveRef.current = null; return; }
      if (!activeRef.current) return;
      const { tierIndex, normal } = activeRef.current;
      activeRef.current = null;
      setLive(pts => {
        if (pts.length) {
          const s = styleRef.current;
          const round = p => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)];
          const nrm = normal ? [+normal.x.toFixed(4), +normal.y.toFixed(4), +normal.z.toFixed(4)] : null;
          // Path length: a near-stationary press is a pipe-and-lift tap (one heap/stamp); an
          // actual drag is a rope (swept) or a tiled row of stamps.
          let len = 0;
          for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
          const isTap = len < (s.thickness ?? 0.03) * 1.2;
          /* ⚠️ `medium` IS PERSISTED WITH THE STROKE. It is a property of what was piped, not of the
             pen's current setting — without it, saving a chocolate line and reloading would render
             it as buttercream, because the pen might be back on cream by then. */
          const base = { nozzle: s.nozzle, color: s.color, thickness: s.thickness, softness: s.softness,
                         medium: s.medium, tierIndex };
          // ── Auto-correct ─────────────────────────────────────────────────────────────────
          // Applied ONCE, here, to the points that get stored — not at render time. A stroke has to
          // redraw identically forever, and a tidy-up that ran on every render would re-tidy an
          // already-tidy line and could drift. What is saved is what was meant.
          //
          // Taps are exempt: a single dab has no shape to correct, and `snapStroke` would be reading
          // hand-jitter as intent.
          let pts2 = pts.map(round);
          if (s.autoShape && !isTap) {
            const snapped = snapStroke(pts2, { normal: nrm ?? [0, 1, 0], axis: [0, 0] });
            pts2 = snapped.points;
          }
          if (s.stampId && s.stampUrl && (nrm || !isTap)) {
            // GLB stamp mode: tap → one stamp, drag → a row of stamps along the path.
            const seed = Math.floor(Math.random() * 1e6);
            // `regular` travels ON THE STROKE, not read from penStyle at render time. A stroke has to
            // redraw identically after a reload, and penStyle is live UI state that will have moved
            // on — a border piped in stamp mode would come back jittered because the pen was back on
            // cream by then. Same reason the points are stored rather than recomputed.
            const stamp = { ...base, stampId: s.stampId, glbUrl: s.stampUrl, seed, regular: !!s.stampRegular,
                            rotation: s.stampRotation ?? null, lean: s.stampLean ?? 0,
                            // Carried for the X-Ray report: a hand-piped run is the SAME element as
                            // its ring, and the sheet has to be able to name it.
                            stampName: s.stampName ?? null };
            if (isTap) onAddStroke?.({ kind: 'stamp', ...stamp, point: round(pts[0]), normal: nrm });
            else onAddStroke?.({ kind: 'stamprope', ...stamp, points: pts2, normal: nrm || [0, 1, 0], spacing: s.spacing ?? 0.85 });
          } else if (isTap && nrm) {
            onAddStroke?.({ kind: 'heap', ...base, heapHeight: s.heapHeight, point: round(pts[0]), normal: nrm });
          } else {
            onAddStroke?.({ ...base, points: pts2 });
          }
        }
        return [];
      });
    };

    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      // Put it back rather than clearing it — the canvas sets its own cursor for dragging and
      // rotating, and blanking it here would leave the cake with a default arrow after every visit
      // to the pen.
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drawMode, moveMode, gl, camera, scene, onAddStroke, onMoveStroke]);

  // ── The pointer has to SAY you can draw ────────────────────────────────────────────────────────
  // Draw mode changed nothing about the canvas: same arrow, same cake, and the only clue was a line
  // of text in a panel on the other side of the screen. Somebody who has just chosen "I'll pipe it
  // myself" is looking AT THE CAKE, where an arrow means "drag me to rotate" — which is what the
  // cake does every other second of the session.
  //
  // ITS OWN EFFECT, and that is the point. It lived in the capture effect above, which depends on
  // `onAddStroke` — a fresh function on every render of the designer. So committing a stroke
  // re-rendered the parent, tore this down and rebuilt it, and the cursor blinked out on release:
  // exactly "once I stop holding, the piping cursor is gone". Nothing here depends on anything that
  // changes while drawing, so it is set once when draw mode opens and restored when it closes.
  //
  // A nozzle, drawn inline, with its TIP as the hotspot (the last two numbers) so the cream comes
  // out where the point is rather than at the corner of a 26px box. `crosshair` is the fallback for
  // anything that will not take an SVG cursor; both beat the arrow, which is actively misleading.
  useEffect(() => {
    if (!drawMode && !moveMode) return;
    const el = gl.domElement;
    // Move mode says so with the OS's own move cursor rather than a second drawn glyph: it is a
    // gesture every pointer already understands, and a nozzle there would promise drawing.
    if (moveMode) {
      const prevMove = el.style.cursor;
      el.style.cursor = 'move';
      return () => { el.style.cursor = prevMove; };
    }
    const nozzle = encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">'
      + '<path d="M6 3.2 L15.4 3.2 L11.6 13.4 L9.8 13.4 Z" fill="#ffffff" stroke="#2b2b2b" stroke-width="1.5" stroke-linejoin="round"/>'
      + '<circle cx="10.7" cy="16.4" r="2.1" fill="#ffffff" stroke="#2b2b2b" stroke-width="1.4"/>'
      + '</svg>');
    const prev = el.style.cursor;
    el.style.cursor = `url("data:image/svg+xml,${nozzle}") 10 18, crosshair`;
    // Put it BACK rather than clearing it — the canvas sets its own cursor for dragging and
    // rotating, and blanking it here would leave the cake with a default arrow after every visit.
    return () => { el.style.cursor = prev; };
  }, [drawMode, moveMode, gl]);

  // Leaving draw mode mid-stroke drops the in-progress stroke.
  useEffect(() => { if (!drawMode) { activeRef.current = null; setLive([]); } }, [drawMode]);
  useEffect(() => { if (!moveMode) moveRef.current = null; }, [moveMode]);

  return (
    <>
      {piping.map((s, i) => ((s.kind === 'stamp' || s.kind === 'stamprope')
        ? <Suspense key={s.id ?? i} fallback={<LoadingPing />}><StampStroke stroke={s} /></Suspense>
        : <StrokeMesh key={s.id ?? i} {...s} />))}

      {/* Live preview: swept rope/heap only. In stamp mode the stamps appear on release
          (loading + tiling a GLB every pointermove would stutter the drag).

          ⚠️ It takes `medium` too, or a chocolate line is piped looking like buttercream and turns
          dark the instant you let go. */}
      {drawMode && live.length > 0 && penStyle && !penStyle.stampId && (
        <StrokeMesh points={live} nozzle={penStyle.nozzle} color={penStyle.color}
          thickness={penStyle.thickness} softness={penStyle.softness} medium={penStyle.medium} />
      )}

      {(drawMode || moveMode) && tierData.map((t, i) => {
        const isRect = (t.shape ?? 'round') === 'rect';
        return (
          <mesh key={i} position={[0, t.baseY + t.height / 2, 0]} userData={{ isPenCatcher: true }}
            onPointerDown={e => start(e, i)}>
            {isRect
              ? <boxGeometry args={[t.width, t.height, t.depth]} />
              : <cylinderGeometry args={[t.radius, t.radius, t.height, 96]} />}
            <CatcherMat />
          </mesh>
        );
      })}

      {drawMode && board && (
        <mesh position={[0, board.y, 0]} userData={{ isPenCatcher: true }}
          onPointerDown={e => start(e, null)}>
          {board.shape === 'rect'
            ? <boxGeometry args={[board.width, 0.1, board.depth]} />
            : <cylinderGeometry args={[board.radius, board.radius, 0.1, 96]} />}
          <CatcherMat />
        </mesh>
      )}
    </>
  );
}
