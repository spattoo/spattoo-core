import { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SELECTION_COLOR } from '../constants.js';
import { clampSizeValue } from '../placement.js';

// Corner grips on a selected element's SelectionBox — drag one to resize, like a design tool.
//
// They sit at the corners of the border, which traces the HIT PLANE, so a grip is always where the
// customer sees the element's clickable edge — never floating off a tight silhouette.
//
// CONSTANT APPARENT SIZE. A grip drawn at a fixed world size shrinks to an untappable dot when the
// camera pulls back or the element is small, and bakers and customers are on phones. Each frame we
// re-derive the world radius that subtends a fixed fraction of the viewport at this element's
// distance, then divide out the element's own scale (grips live inside the scaled group). So the
// grip holds its size on screen whatever the zoom or the element's scale.
//
// It is depth-tested like the border, so a grip on the far side of the cake hides behind it — an
// Html overlay would float over the frosting and disagree with the border it belongs to.
//
// RESIZE IS CENTRE-ANCHORED: the element's position IS its centre (x/z on top, theta/y on a wall),
// so it grows symmetrically and never drifts. Dragging scales by the ratio of the pointer's distance
// from that centre, in screen space — the same math the original handle used, but clamped through
// `clampSizeValue` so a drag can never reach a size the SizeDial refuses. It never decides WHAT to
// write: the parent's `onResize` owns whether that's `scale`, `hugMul`, a whole multi-selection or a
// re-settled cluster ball. No element type, slug or zone reaches this component.

// Grip radius as a fraction of the VIEWPORT HEIGHT — so on a ~900px-tall canvas the white disc is
// ~10px across and the ring ~13px, in the register of a design tool's grips. Keep it a hair smaller
// than feels right on desktop: the grip must mark the corner, not cover the element beside it.
const SCREEN_FRAC = 0.0042;
// Outline radius in grip radii, so the visible purple band is (RING − 1) of the fill radius. A thick
// band reads as a button rather than a handle.
const RING        = 1.3;
// Invisible tap target, in grip radii. It is deliberately much wider than the drawn disc — thumbs are
// bigger than cursors, and this is expressed relative to the disc, so shrinking SCREEN_FRAC would
// otherwise shrink the target with it — raise TOUCH to hold the target's size when you shrink the
// disc. ~5.8 × 0.0042 ≈ 2.4% of viewport height ≈ a 41px circle.
const TOUCH       = 5.8;
const LIFT        = 0.009;   // clear of the border's own line (SelectionBox lifts by 0.006)
// Ceiling on the ring's OUTER DIAMETER as a fraction of the border's shorter side. Constant
// screen-size alone is not enough: a grip holding its pixel size around an element that is itself
// only a fraction of the viewport swallows that element (measured — a leaf whose border spanned 12.8%
// of the viewport got grips 28% as wide as the border). Below this size the grip gives up its constant
// size and shrinks with the element, so it always reads as a corner mark, never as a lid on top of it.
const BOX_CAP     = 0.28;

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

// The decorative discs must stay out of EVERY raycast — CakeCanvas probes the whole scene for the
// sticker hit plane (`isStickerHitPlane`), and `raycast={null}` would make three call null there.
const noRaycast = () => null;

export default function ResizeHandles({ width, height, z = 0, value, bounds, onResize, onOrbitEnable }) {
  const { camera, gl } = useThree();
  const rootRef = useRef();
  // The drawn disc may shrink below its constant screen size (BOX_CAP) so it never dominates a small
  // element — but the TAP TARGET must not shrink with it, or the grip becomes hard to hit exactly
  // when it is smallest. They scale independently.
  const discRefs  = [useRef(), useRef(), useRef(), useRef()];
  const touchRefs = [useRef(), useRef(), useRef(), useRef()];

  // Native listeners are attached once per drag and close over their render's props; read the live
  // ones through a ref so a resize started before a prop change still writes the right value.
  const live = useRef({ value, bounds, onResize });
  live.current = { value, bounds, onResize };

  const wp = useMemo(() => new THREE.Vector3(), []);
  const ws = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const root = rootRef.current;
    if (!root || !camera.isPerspectiveCamera) return;
    root.getWorldPosition(wp);
    root.getWorldScale(ws);
    const dist = camera.position.distanceTo(wp);
    // World height the viewport spans at this distance → a radius that is always SCREEN_FRAC of it.
    // Divide out the element's own scale, since the grips live inside its scaled group.
    const viewH = 2 * dist * Math.tan((camera.fov * Math.PI / 180) / 2);
    const constant = (SCREEN_FRAC * viewH) / Math.max(Math.abs(ws.x), 1e-6);
    // …but never let the drawn disc dominate the element it marks (see BOX_CAP). Both terms are
    // already in local units, so the cap needs no world scale.
    const capped = (BOX_CAP * Math.min(width, height)) / (2 * RING);
    const drawn = Math.min(constant, capped);
    for (let i = 0; i < 4; i++) {
      discRefs[i].current?.scale.setScalar(drawn);
      touchRefs[i].current?.scale.setScalar(constant);
    }
  });

  function beginResize(e) {
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    onOrbitEnable?.(false);

    // The element's centre, in screen pixels — the anchor the drag measures against.
    root.getWorldPosition(wp);
    const rect = gl.domElement.getBoundingClientRect();
    ndc.copy(wp).project(camera);
    const cxPx = (ndc.x + 1) / 2 * rect.width + rect.left;
    const cyPx = (-ndc.y + 1) / 2 * rect.height + rect.top;

    const d0 = Math.hypot(e.clientX - cxPx, e.clientY - cyPx);
    const v0 = live.current.value;
    // Grabbed (almost) on the centre: the ratio would explode. Ignore rather than fling the element.
    if (!(d0 > 2) || !(v0 > 0)) { onOrbitEnable?.(true); return; }

    const canvas = gl.domElement;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    const onPointerMove = ev => {
      const d = Math.hypot(ev.clientX - cxPx, ev.clientY - cyPx);
      const { onResize: cb, bounds: bd } = live.current;
      cb?.(clampSizeValue(v0 * d / d0, bd));
    };
    const onPointerUp = () => {
      onOrbitEnable?.(true);
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  return (
    <group ref={rootRef}>
      {CORNERS.map(([sx, sy], i) => (
        <group key={i} position={[sx * width / 2, sy * height / 2, z + LIFT]}>
          {/* Tap target — invisible, wider than the disc so a thumb lands on it, and held at a
              constant screen size even when the disc shrinks to fit a small element. */}
          <group ref={touchRefs[i]}>
            <mesh
              onPointerDown={beginResize}
              onClick={e => e.stopPropagation()}
              onPointerEnter={e => { e.stopPropagation(); onOrbitEnable?.(false); }}
            >
              <circleGeometry args={[TOUCH, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
          <group ref={discRefs[i]}>
            <mesh position={[0, 0, 0.001]} renderOrder={2} raycast={noRaycast}>
              <circleGeometry args={[RING, 24]} />
              <meshBasicMaterial color={SELECTION_COLOR} toneMapped={false} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 0.002]} renderOrder={3} raycast={noRaycast}>
              <circleGeometry args={[1, 24]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
