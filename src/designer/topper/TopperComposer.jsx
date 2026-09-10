import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { HexColorPicker } from 'react-colorful';
import { offsetParts, followsBox} from '../geometry/topperShape.js';
import { topperContours, topperBox, topperSheets, topperStick } from '../geometry/topperPiece.js';
import { outlineOf } from '../geometry/shapes.js';
import { TOPPER_FACES, loadTopperFace } from '../geometry/topperFaces.js';
import { SceneLights, SceneEnv, SceneBackground } from '../canvas/CakeCanvas.jsx';
import SelectionBox from '../canvas/SelectionBox.jsx';
import { DESIGNER_GROUND, SELECTION_COLOR } from '../constants.js';
import { albedoForLight } from '../shared/albedoForLight.js';
import { Panel } from '../../shared/Panel.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { TOPPER_PRESETS, presetPaths } from './topperPresets.js';

/* ── Topper composer ─────────────────────────────────────────────────────────────────────────────
 *
 * A card topper the baker composes: an empty canvas they add text and shapes to, where a control
 * appears only once there is something for it to act on.
 *
 * ⚠️ THE CANVAS IS THE 3D SCENE SEEN FACE ON — it is NOT a separate 2D editor with a 3D preview
 * beside it. Two representations of one object is the drift INVARIANTS #15 exists to stop: the
 * moment a 2D canvas draws a heart and the 3D preview builds one, they are two hearts and only one
 * of them ships. A card topper is FLAT, so face-on 3D and a 2D canvas look identical anyway — and
 * dragging the camera round shows the same objects standing on a cake, with nothing to keep in step.
 *
 * The grid is a scene object behind the work, at the plane the cards sit on, so it reads as a
 * drawing surface without being a second coordinate system.
 *
 * ── WHAT A SAVED TOPPER IS ──────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE OBJECT LIST, NEVER THE BUILT GEOMETRY — the same call `baker_garnishes` made and wrote down:
 * a garnish stores its outlines and REGENERATES its fills, which is stated as the whole reason the
 * fill is not stored. Here the equivalent is that a word is stored as its WORD, not as the contours
 * cut from it: the payload is a hundredth of the size, and a later improvement to `topperShapes` or
 * to `offsetParts` reaches every topper already kept. `v` is the guard on the other side — if a
 * generator ever changes in a way that must NOT reach old pieces, the version says which recipe a
 * payload was drawn for. It costs nothing now and cannot be added cheaply later.
 *
 * ⚠️ AND IT IS NOT A PICTURE. A PNG would come back as a flat sticker: no card thickness, no offset
 * layer standing proud, not recolourable, and it could never be cut. The thumbnail is a THUMBNAIL —
 * the tile in the picker — rendered FROM the objects, so it is a true sample rather than a drawing.
 *
 * ⚠️ STILL TO COME, and named so they are known gaps rather than forgotten ones: placing a kept
 * topper ON the cake needs `design.toppers[]`, a renderer and a movable contract, exactly as
 * `design.garnishes[]` has; and keeping one needs a `baker_toppers` table and route, mirroring
 * `baker_garnishes` — whose own comment argues against sharing a table with something whose columns
 * would be half null. Until the client offers `saveTopper`, the keep button does not appear at all,
 * which is how GarnishStudio behaves when its own save is absent.
 */
const PAYLOAD_VERSION = 1;

const GRID_HALF = 2.2;        // how far the drawing surface extends from the middle
const GRID_STEP = 0.2;
const CARD_THICK = 0.02;

/* Measured for this exact material under the designer's rig — see CardCutoutStudio for the working,
 * and re-measure if the HDRI, SceneLights or the roughness moves (INVARIANTS #16). */
const CARD_LIGHT = Object.freeze([3.193, 2.940, 3.028]);
const asRendered = (hex) => albedoForLight(hex, CARD_LIGHT, { rolloff: 6 });

const blockFont = new FontLoader().parse(helvetikerBold);

/* Every face core offers, plus the block one three ships. Same list as the card cutout studio, and
 * for the same reason: TOPPER_FACES is all scripts, and a number topper wants a block. */
const BLOCK_KEY = '__block';
const FACES = { [BLOCK_KEY]: { label: 'Block' }, ...TOPPER_FACES };

/* The shapes on offer are the families `backingPlate` already understands — the cake's own
 * `OUTLINE_FAMILIES` plus the two analytic ones it samples itself. Listed by key, so a family
 * authored later needs a row here and no new code. */
const SHAPES = [
  { key: 'circle', label: 'Circle' },
  { key: 'rect',   label: 'Panel' },
  { key: 'heart',  label: 'Heart' },
];

/* ⚠️ THE ICON IS THE SHAPE'S OWN OUTLINE, drawn from the same function that builds it. A hand-drawn
 * heart icon beside a generated heart is two hearts, and the icon is the one that lies first — it
 * keeps looking right after the curve behind it has been retuned. */
function ShapeIcon({ family, size = 22 }) {
  const d = useMemo(() => {
    const pts = family === 'heart'
      ? (outlineOf('heart', {}) || []).map(p => ({ x: p.x, y: -p.z }))
      : family === 'rect'
        ? [{ x: -1, y: -0.72 }, { x: 1, y: -0.72 }, { x: 1, y: 0.72 }, { x: -1, y: 0.72 }]
        : Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            return { x: Math.cos(a), y: Math.sin(a) };
          });
    if (!pts.length) return '';
    const k = size / 2.4;
    return pts.map((p, i) => `${i ? 'L' : 'M'} ${(p.x * k).toFixed(2)} ${(-p.y * k).toFixed(2)}`).join(' ') + ' Z';
  }, [family, size]);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/* The drawing surface. Lines, not a textured plane: a grid drawn as geometry stays crisp at any
 * zoom and costs nothing, and it sits just behind the work so a card never z-fights with it. */
function Grid() {
  const geo = useMemo(() => {
    const pts = [];
    for (let v = -GRID_HALF; v <= GRID_HALF + 1e-6; v += GRID_STEP) {
      pts.push(-GRID_HALF, v, 0, GRID_HALF, v, 0);
      pts.push(v, -GRID_HALF, 0, v, GRID_HALF, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[0, 0, -0.06]}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color="#D8D8DA" transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      {/* The two middle lines darker, so the centre of the card is findable without counting. */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([
            -GRID_HALF, 0, 0.001, GRID_HALF, 0, 0.001,
            0, -GRID_HALF, 0.001, 0, GRID_HALF, 0.001,
          ]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#B9B9BD" toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/* ── Dragging ────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ AGAINST A FIXED PLANE, never against the object's own surface. `e.point` is where the ray met
 * THIS mesh, and the mesh is the thing being moved — read it every frame and the object chases its
 * own hit point, accelerating away from the pointer. The card plane at z = 0 does not move, so the
 * arithmetic is stable: grab the offset once, subtract it forever.
 *
 * ⚠️ AND THE GRAB OFFSET IS THE WHOLE OF IT. Without it an object jumps so its centre lands under the
 * pointer the instant you touch it — INVARIANTS #10's law that `handleAt` and `dragTo` are exact
 * inverses, in the smallest possible form: where you grabbed is where you are still holding.
 */
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const SNAP = 0.05;             // how near a centre line counts as on it

// Where the pointer's ray meets the card plane, or null if it runs parallel to it.
function planeHit(ray) {
  const p = new THREE.Vector3();
  return ray.intersectPlane(DRAG_PLANE, p) ? p : null;
}

const extrude = (parts, z) => (parts ?? []).map((p) => {
  const shape = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q.x, q.y)));
  shape.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: CARD_THICK, bevelEnabled: false });
  g.translate(0, 0, z - CARD_THICK / 2);
  return g;
});

/* ⚠️ EVERY OBJECT ON ITS OWN LAYER, or they interpenetrate. Coplanar extrusions do not stack — a
 * word laid on a disc at the same z has half its letters INSIDE the disc, so the disc wins wherever
 * it happens to be nearer and the letters show through in patches. It looks like transparency and is
 * actually two solids sharing a plane.
 *
 * A tenth of the card's thickness per layer: enough that the depth test is decisive, small enough
 * that the stack is still one flat card when it is cut. Layer order is also z-order, so "the last
 * thing added is in front" is true rather than accidental. */
const LAYER_Z = CARD_THICK * 0.1;

/* Corner grips on the selection box. Small squares in world units — the working camera is
 * orthographic and fixed, so a world size IS a screen size and there is nothing to compensate for. */
/* ⚠️ A GRIP IS SIZED IN PIXELS, NOT IN THE SHAPE'S UNITS. It used to be 0.075 units, which is
 * whatever the zoom makes it — about 11px on a desktop and 9 on a phone, where a finger is 40. With
 * the size slider gone the grips are the ONLY way to resize, so a grip nobody can hit is a piece
 * nobody can resize. Converted through the camera's own zoom, it stays the same size on screen
 * however far in the view is. */
const HANDLE_PX = 26;

function Piece({ obj, layer, font, selected, editing, onSelect, onMove, onEdit, onChange,
                 onDragStart, showHandles = true }) {
  const { controls, camera } = useThree();
  // Pixels back into the shape's own units. Read at render: the zoom only changes when the stage is
  // resized, which re-renders everything anyway.
  const HANDLE = HANDLE_PX / (camera?.zoom || 190);
  const grab = useRef(null);
  const sizing = useRef(null);

  const begin = (e) => {
    e.stopPropagation();
    /* Shift adds to the selection instead of replacing it — the gesture every editor uses.
     *
     * ⚠️ READ OFF `nativeEvent`, NOT off the R3F event. R3F builds its event by SPREADING the DOM
     * one, and `shiftKey` is a getter on the prototype — a spread copies own properties only, so
     * `e.shiftKey` is silently `undefined` and every shift-click behaves like a plain click. Nothing
     * throws; multi-select simply never happens. */
    const mod = e.nativeEvent ?? e;
    onSelect(obj.id, { add: !!(mod.shiftKey || mod.metaKey || mod.ctrlKey) });
    if (editing) return;                 // a drag would fight the caret
    const hit = planeHit(e.ray);
    if (!hit) return;
    /* ⚠️ THE WHOLE SELECTION'S START POSITIONS ARE SNAPSHOT HERE, not just this piece's. A group
       moves by ONE delta applied to where each member STARTED — the same shape `moveGroupStickers`
       uses. Reading each member's current position every frame instead compounds rounding and, worse,
       lets the snap pull members together until a group collapses onto itself. */
    onDragStart?.(obj.id);
    grab.current = { dx: obj.x - hit.x, dy: obj.y - hit.y };
    // ⚠️ Orbit off for the duration, or one drag both moves the card and swings the camera.
    if (controls) controls.enabled = false;
    e.target.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    if (!grab.current || editing) return;
    e.stopPropagation();
    const hit = planeHit(e.ray);
    if (!hit) return;
    let x = hit.x + grab.current.dx, y = hit.y + grab.current.dy;
    /* ⚠️ Snapped to the MIDDLE only, not to every grid line. Centring a word on a shape is the
     * alignment anyone actually wants, and it is the one the eye catches instantly when it is a
     * pixel out. Snapping to all of them would make the grid a cage — free placement is the normal
     * case and a drawn grid is there to be read, not obeyed. */
    if (Math.abs(x) < SNAP) x = 0;
    if (Math.abs(y) < SNAP) y = 0;
    onMove(obj.id, { x, y });
  };

  const end = (e) => {
    if (!grab.current) return;
    grab.current = null;
    if (controls) controls.enabled = true;
    e.target?.releasePointerCapture?.(e.pointerId);
  };

  /* ── Resizing, from any corner ─────────────────────────────────────────────────────────────────
   *
   * ⚠️ SCALED BY THE RATIO OF DISTANCES FROM THE CENTRE, not by matching the corner to the pointer.
   * The two agree only while the grip is exactly under the finger, and they part company the moment
   * the pointer strays off the diagonal — matching the corner then makes the object lunge. A ratio
   * of "how far out are you now" to "how far out were you when you grabbed" is stable in every
   * direction, and it is the same law as the drag's grab offset (INVARIANTS #10): the thing you took
   * hold of stays where you are holding it.
   *
   * ⚠️ AND IT SCALES ABOUT THE OBJECT'S CENTRE, so the piece grows evenly and its position does not
   * drift. Anchoring the opposite corner is the other convention and needs the object's own bounds
   * to stay fixed while its size changes — which is exactly what a re-cut word does not do. */
  const sizeStart = (e) => {
    e.stopPropagation();
    onSelect(obj.id, { add: false });
    const hit = planeHit(e.ray);
    if (!hit) return;
    const r = Math.hypot(hit.x - obj.x, hit.y - obj.y);
    if (r < 1e-4) return;
    sizing.current = { r, size: obj.size };
    if (controls) controls.enabled = false;
    e.target.setPointerCapture?.(e.pointerId);
  };

  const sizeMove = (e) => {
    if (!sizing.current) return;
    e.stopPropagation();
    const hit = planeHit(e.ray);
    if (!hit) return;
    const r = Math.hypot(hit.x - obj.x, hit.y - obj.y);
    const next = sizing.current.size * (r / sizing.current.r);
    onChange(obj.id, { size: Math.max(0.2, Math.min(3.2, next)) });
  };

  const sizeEnd = (e) => {
    if (!sizing.current) return;
    sizing.current = null;
    if (controls) controls.enabled = true;
    e.target?.releasePointerCapture?.(e.pointerId);
  };

  const parts = useMemo(() => topperContours(obj, font), [obj, font]);

  /* ⚠️ The offset is a PROPERTY OF THE TEXT, not of the screen. It was a slider that existed whether
   * or not there was anything to offset; here it belongs to the object it acts on, so two words on
   * one topper can carry different bands — which the single-object studio could never express. */
  const backParts = useMemo(() => (
    obj.offset > 0 && parts ? offsetParts(parts, obj.offset * obj.size) : null
  ), [obj.kind, obj.offset, obj.size, parts]);

  /* ⚠️ A BAND AND ITS FACE ARE TWO SUB-LAYERS, exactly as `topperSheets` orders them for the cake.
   *
   * The band used to be pushed back a whole CARD_THICK — ten times the gap between layers — so a
   * word's outline sank behind everything under it. On "Ava" the plaque simply swallowed the name's
   * band and the studio showed a plain white word while the CAKE showed the outline correctly: the
   * two disagreed about where a band sits, which is the divergence INVARIANTS #15 exists to stop.
   *
   * Band at 2n, face at 2n+1, so a band is always in front of everything BELOW its object and always
   * behind its own face. The whole stack is still about one card thick. */
  const bandZ = layer * 2 * LAYER_Z;
  const faceZ = (layer * 2 + 1) * LAYER_Z;
  const geos = useMemo(() => extrude(parts, faceZ), [parts, faceZ]);
  const backGeos = useMemo(() => extrude(backParts, bandZ), [backParts, bandZ]);
  useEffect(() => () => { geos.forEach(g => g.dispose()); backGeos.forEach(g => g.dispose()); },
    [geos, backGeos]);

  // The selection border traces the object's own bounds — including its backing, because that is
  // the extent of the thing and what a drag will grab.
  const box = useMemo(() => {
    let lo = Infinity, hi = -Infinity, bo = Infinity, to = -Infinity;
    for (const p of (backParts ?? parts ?? [])) for (const q of p.outer) {
      if (q.x < lo) lo = q.x; if (q.x > hi) hi = q.x;
      if (q.y < bo) bo = q.y; if (q.y > to) to = q.y;
    }
    return Number.isFinite(lo) ? { w: hi - lo, h: to - bo, cx: (lo + hi) / 2, cy: (bo + to) / 2 } : null;
  }, [parts]);

  if (!geos.length || !box) return null;

  return (
    <group position={[obj.x, obj.y, 0]}>
      {backGeos.map((g, i) => (
        <mesh key={`b${i}`} geometry={g} castShadow receiveShadow
          onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <meshStandardMaterial color={asRendered(obj.offsetColour)} roughness={0.86} metalness={0} />
        </mesh>
      ))}
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow
          onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          onDoubleClick={(e) => { if (obj.kind === 'text') { e.stopPropagation(); onEdit(obj.id); } }}>
          <meshStandardMaterial color={asRendered(obj.colour)} roughness={0.86} metalness={0} />
        </mesh>
      ))}
      {/* ⚠️ EDITED WHERE IT IS. The words were also a field in the side panel, which meant typing in
          one place and watching another — and two controls for one value, either of which could be
          the one you reach for. A real <input> is laid over the object rather than keystrokes being
          captured: a caret, selection, undo, IME and a phone keyboard all come free, and none of
          them can be faked by listening for keydown.
          Screen-space rather than `transform`, on purpose — this is an editing affordance, not the
          artwork, so it should stay legible when the card is small or the camera is turned. */}
      {editing && obj.kind === 'text' && (
        <Html center zIndexRange={[40, 0]} style={{ pointerEvents: 'auto' }}>
          <input
            autoFocus
            defaultValue={obj.text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onChange(obj.id, { text: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            onBlur={() => onEdit(null)}
            style={{
              minWidth: 120, textAlign: 'center', padding: '6px 10px', borderRadius: 8,
              border: `2px solid ${SELECTION_COLOR}`, outline: 'none', background: '#fff',
              fontFamily: "'Quicksand', sans-serif", fontSize: 16, fontWeight: 700, color: '#2C3E33',
            }}
          />
        </Html>
      )}
      {selected && (
        <group position={[box.cx, box.cy, 0]}>
          {/* THE selection cue, from core — a border and not a tint, because an emissive highlight is
              additive and corrupts the albedo it is meant to advertise. On a screen for choosing
              colours that is not a small thing. */}
          <SelectionBox width={box.w * 1.06} height={box.h * 1.12} depth={CARD_THICK * 3} />
          {/* A grip on each corner, so the nearest one is always to hand whichever way the piece
              is sitting. All four do the same thing — the scale is about the centre.

              ⚠️ NOT WHILE SEVERAL ARE SELECTED. Resizing one member of a group is not what a grip on
              a group means, and resizing the group is a different piece of work with its own law
              (every member scales about the GROUP's centre, so the spacing between them scales too).
              Grips that did the first while looking like the second would be worse than none. */}
          {showHandles && [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => (
            <mesh key={`${sx}${sy}`}
              position={[sx * box.w * 0.53, sy * box.h * 0.56, CARD_THICK * 2]}
              onPointerDown={sizeStart} onPointerMove={sizeMove}
              onPointerUp={sizeEnd} onPointerCancel={sizeEnd}>
              <planeGeometry args={[HANDLE, HANDLE]} />
              <meshBasicMaterial color={SELECTION_COLOR} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ── The properties of whatever is selected ──────────────────────────────────────────────────────
 *
 * ⚠️ IT ONLY EXISTS WHEN SOMETHING IS SELECTED, and that is the point of the whole rebuild. The card
 * cutout studio showed every control at all times — the offset slider with nothing to offset, the
 * insertion depth with no stick — and a control that cannot act is one the reader has to rule out
 * before finding the one that can (INVARIANTS #12). Here a control's presence IS the answer to
 * "does this apply".
 *
 * ⚠️ And it sits BESIDE the canvas, never over it: the whole reason for the composition model is
 * that you watch the thing change as you change it (INVARIANTS #11).
 */
function Row({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 9 }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#3D5A44', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Slide({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3D5A44' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: '#6B7C70', fontVariantNumeric: 'tabular-nums' }}>
          {fmt ? fmt(value) : value}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#3D5A44' }} />
    </label>
  );
}

function Colour({ label, value, onChange, open, onToggle }) {
  const wrap = useRef(null);
  /* ⚠️ CLOSES ON A CLICK OUTSIDE IT. Opened, the wheel is 130px of panel sitting between the colour
   * and everything below it, and the only way out was to find the same swatch again — so it stayed
   * open and pushed the rest of the controls down the page. Closing on the next click anywhere else
   * is what every picker does and needs no affordance of its own.
   * `mousedown`, not `click`: a click that lands on another control should close this AND reach that
   * control, and waiting for click means the first press is spent shutting the picker. */
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) onToggle(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onToggle]);

  return (
    <div ref={wrap} style={{ marginBottom: 10 }}>
      <button type="button" onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, minHeight: 42,
          padding: '0 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1.5px solid #E2E8E3', background: '#fff' }}>
        <span style={{ width: 19, height: 19, borderRadius: 5, background: value,
          border: '1px solid rgba(0,0,0,0.12)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3D5A44' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8A9A8E' }}>{value}</span>
      </button>
      {open && <HexColorPicker color={value} onChange={onChange}
        style={{ width: '100%', height: 132, marginTop: 8 }} />}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 9,
  border: '1.5px solid #E2E8E3', fontFamily: 'inherit', fontSize: 13.5,
};

function Properties({ obj, onChange, onDelete, grouped = false, onUngroup, embedded = false }) {
  const [wheel, setWheel] = useState(null);
  const set = (patch) => onChange(obj.id, patch);

  return (
    <div className={embedded ? undefined : 'tcProps'}
      style={{ padding: 16, background: '#fff',
        borderLeft: embedded ? 'none' : '1px solid #E8EFE9',
        borderBottom: embedded ? '1px solid #E8EFE9' : 'none' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, color: '#2C3E33' }}>
        {obj.kind === 'text' ? 'Text' : (SHAPES.find(x => x.key === obj.family)?.label ?? 'Shape')}
      </h2>

      {obj.kind === 'text' && (
        <>
          {/* ⚠️ NO "Words" FIELD HERE. It used to be one, which meant typing on the right while
              watching the middle — and two controls for one value, either of which might be the one
              you reach for. The words are edited on the object; this panel is for everything that is
              not the words. */}
          <p style={{ margin: '-4px 0 12px', fontSize: 11, color: '#8A9A8E', lineHeight: 1.4 }}>
            Double-click the text to edit it.
          </p>
          <Row label="Face">
            <select value={obj.face} onChange={e => set({ face: e.target.value })}
              style={{ ...inputStyle, background: '#fff' }}>
              {Object.entries(FACES).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </Row>
        </>
      )}

      {obj.kind === 'shape' && (
        <Row label="Shape">
          <select value={obj.family} onChange={e => set({ family: e.target.value })}
            style={{ ...inputStyle, background: '#fff' }}>
            {SHAPES.map(sh => <option key={sh.key} value={sh.key}>{sh.label}</option>)}
          </select>
        </Row>
      )}

      {/* ⚠️ THERE IS NO SIZE SLIDER. The corner grips already resize the piece, and two controls for
          one value means neither is THE control — you reach for whichever you happen to remember,
          and the panel grows a row that the canvas wanted. The same argument that took the text
          field out of this panel when the words became editable in place. */}

      {/* ⚠️ ONLY WHERE IT DOES SOMETHING, and the geometry is asked rather than the family named. A
          circle stretched to a wide box is an ellipse and a heart is a squashed cartoon, so both
          refuse — offering the control there would be a slider that moves and changes nothing. */}
      {obj.kind === 'shape' && followsBox(obj.family) && (
        <Slide label="How wide" value={obj.ratio ?? 1} min={0.4} max={3.2} step={0.05}
          onChange={v => set({ ratio: v })} fmt={v => `${v.toFixed(2)}x`} />
      )}

      <Colour label="Colour" value={obj.colour} onChange={v => set({ colour: v })}
        open={wheel === 'c'} onToggle={() => setWheel(wheel === 'c' ? null : 'c')} />

      {/* ⚠️ EVERY PIECE CAN HAVE ONE. This was text-only, on the reasoning that a shape is already a
          solid so an outline round it is just a second shape. Both true, and not the same thing: a
          second heart has to be sized and centred by eye, and it comes apart the moment the first is
          moved. The offset colour appears only once there is a band to colour. */}
      <Slide label="Offset" value={obj.offset ?? 0} min={0} max={0.22} step={0.005}
        onChange={v => set({ offset: v })} fmt={v => (v === 0 ? 'none' : v.toFixed(3))} />
      {obj.offset > 0 && (
        <Colour label="Offset colour" value={obj.offsetColour ?? '#FFFFFF'}
          onChange={v => set({ offsetColour: v })}
          open={wheel === 'o'} onToggle={() => setWheel(wheel === 'o' ? null : 'o')} />
      )}

      {/* ⚠️ A GROUPED PIECE SAYS SO HERE. Clicking one selects the whole group, so if you have
          landed on this panel at all you selected it another way — and the question "why does this
          drag its neighbours" needs an answer where you are looking, not in a menu. */}
      {grouped && (
        <button type="button" onClick={onUngroup}
          style={{ width: '100%', marginTop: 4, minHeight: 38, borderRadius: 9, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800, color: '#8A6320',
            background: '#FDF3E7', border: '1.5px solid #F0DCC0' }}>
          Ungroup
        </button>
      )}

      <button type="button" onClick={() => onDelete(obj.id)}
        style={{ width: '100%', marginTop: 10, minHeight: 42, borderRadius: 9, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: '#8A6320',
          background: '#FDF3E7', border: '1.5px solid #F0DCC0' }}>
        Remove
      </button>
    </div>
  );
}

/* `compact` trims the row height for the presets. ⚠️ It exists because the rail RAN OUT: with the
   presets added, the last one sat below the fold on a laptop and the only way to know it was there
   was to scroll a column that gives no sign it scrolls. A hidden example is no example. */
/* ⚠️ A DRAWER, BECAUSE THE PHONE HAS NO ROOM FOR A SHELF. Laid out flat, the shapes and the presets
 * took half the screen before the canvas began — and the canvas is the thing being worked on. Behind
 * one button they cost a row; opened, they cover the canvas only while being chosen, which is the
 * moment nobody is looking at it. */
/* ⚠️ THE CAMERA FITS THE STAGE. Its zoom was a fixed 190, which shows about four units across a
 * desktop's 728px canvas and only 1.8 across a phone's 354 — so the same topper that sat comfortably
 * on one hung off both edges of the other, cut off before it could be judged. A zoom in pixels per
 * unit has to be told how many pixels there are.
 *
 * `VIEW_UNITS` is what the working area always shows, whatever the screen: the presets are about 1.9
 * units across, so three leaves a margin on every side without making them small. */
const VIEW_UNITS = 3.0;
// How much of the stage the phone's control sheet covers. One number, so the sheet's height and the
// camera's idea of what is still visible cannot drift apart.
const SHEET_FRACTION = 0.40;

/* `bottomInset` is the fraction of the stage a sheet is covering.
 *
 * ⚠️ THE CANVAS DOES NOT SHRINK, THE VIEW MOVES. On a phone the controls sit OVER the canvas so the
 * piece stays in sight while it is changed — but "in sight" has to mean in the part still showing,
 * and the topper was being framed dead centre with its bottom half behind the sheet. So the camera
 * fits the UNCOVERED band and lifts the piece into it. Shrinking the canvas instead would tear down
 * and rebuild the WebGL viewport every time a piece is selected. */
function FitCamera({ bottomInset = 0 }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const visible = size.height * (1 - bottomInset);
    const zoom = Math.min(size.width, visible) / VIEW_UNITS;
    if (!(zoom > 0)) return;
    // Lift world-zero to the middle of what is still showing.
    const y = -(size.height * bottomInset) / (2 * zoom);
    if (camera.zoom === zoom && camera.position.y === y) return;
    camera.zoom = zoom;
    camera.position.y = y;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, bottomInset]);
  return null;
}

function PickerButton({ label, count, children, open, onToggle }) {
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 46, padding: '0 12px',
          borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
          color: '#3D5A44', background: open ? '#EFF4F0' : '#fff',
          border: `1.5px solid ${open ? '#3D5A44' : '#E2E8E3'}` }}>
        {label}
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 5,
          display: 'flex', flexWrap: 'wrap', gap: 7, padding: 10, width: 'max-content',
          maxWidth: 'min(78vw, 320px)', borderRadius: 12, background: '#fff',
          border: '1.5px solid #E2E8E3', boxShadow: '0 10px 26px rgba(0,0,0,0.13)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RailButton({ onClick, title, children, wide = false, compact = false }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        width: wide ? '100%' : 46, minHeight: compact ? 38 : 46, borderRadius: 10, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 15, fontWeight: 800, color: '#3D5A44',
        background: '#fff', border: '1.5px solid #E2E8E3',
      }}>
      {children}
    </button>
  );
}

/* ── The shelf tile is a photo of the PIECE, not of the studio ─────────────────────────────────
 *
 * ⚠️ WHAT IS CAPTURED IS THE LIVE CANVAS, so everything drawn to help you WORK would otherwise end up
 * on the shelf: the grid, and the selection box with its handles. Add that a composition drawn small
 * or off to one side stays that way, and the tile is a square of graph paper with a smudge on it at
 * the size a picker card actually is.
 *
 * So the camera is moved onto the pieces and zoomed to fit them for the frame being photographed,
 * and put back straight after. ⚠️ RESTORING MATTERS: this is the working camera and the drag maths
 * reads it — leaving it zoomed would silently change where every later drag lands. */
function ThumbFit({ active, target }) {
  const { camera } = useThree();
  const saved = useRef(null);

  useEffect(() => {
    if (!active) {
      if (saved.current) {
        camera.zoom = saved.current.zoom;
        camera.position.set(...saved.current.pos);
        camera.updateProjectionMatrix();
        saved.current = null;
      }
      return;
    }
    const group = target?.current;
    if (!group) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    saved.current = { zoom: camera.zoom, pos: camera.position.toArray() };
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    // The tile is square, so the SHORTER side is the one that has to hold the piece.
    const visW = (camera.right - camera.left) / camera.zoom;
    const visH = (camera.top - camera.bottom) / camera.zoom;
    const fill = Math.max(size.x, size.y);
    if (!(fill > 0)) return;
    camera.zoom *= (0.8 * Math.min(visW, visH)) / fill;   // 0.8: not jammed against its own edges
    camera.position.set(mid.x, mid.y, camera.position.z);
    camera.updateProjectionMatrix();
  }, [active, camera, target]);

  return null;
}

/* The picture on a preset button: the real outlines, drawn flat. See presetPaths — it is the same
   function the cake's shapes come from, so this cannot drift from what gets made. */
/* The stick as the composer shows it: hanging below the card and tucked up behind it, at negative z
   so the card hides the overlap — which is what attaches it on a real one. */
function StudioStick({ objects, fontOf, stick }) {
  const geo = useMemo(() => {
    if (!stick?.on) return null;
    const box = topperBox({ v: 1, objects }, fontOf);
    const s2 = topperStick(box, stick);
    if (!s2) return null;
    const g = new THREE.CylinderGeometry(s2.radius, s2.radius, s2.len + s2.tuck, 14);
    g.translate(box.cx, (s2.len + s2.tuck) / 2 - s2.len + (box.cy - box.h / 2), -CARD_THICK * 1.6);
    return g;
  }, [objects, fontOf, stick]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={asRendered('#D8BE93')} roughness={0.85} metalness={0} />
    </mesh>
  );
}

function PresetIcon({ objects, font, size = 46 }) {
  const built = useMemo(() => presetPaths(objects, font), [objects, font]);
  if (!built) return null;
  return (
    /* ⚠️ NOT `overflow: visible`. A two-line topper is far wider than it is tall, and letting it
       spill put "Happy Birthday" straight through the button's own label. The default
       preserveAspectRatio already fits a wide piece inside a square box. */
    <svg viewBox={built.viewBox} width={size} height={size}
      style={{ display: 'block', overflow: 'hidden' }} aria-hidden="true">
      {/* evenodd, so a hole in a letter — the middle of an O — stays a hole. */}
      {built.paths.map(p => <path key={p.key} d={p.d} fill={p.colour} fillRule="evenodd" />)}
    </svg>
  );
}

export default function TopperComposer({
  open = true, apiClient = null, openWith = null, preset = null, onSave, onCancel,
}) {
  const isMobile = useNarrow();
  const [objects, setObjects] = useState([]);          // ⚠️ EMPTY. Nothing is on the canvas until asked for.
  /* ⚠️ A LIST, BECAUSE A GROUP HAS TO BE MADE BEFORE IT CAN BE MOVED. One id could express "which
   * piece" but never "these two", so grouping needs the selection itself to hold more than one.
   * `selectedId` below stays as the derived single case, which is what the properties panel wants:
   * the controls for one piece are meaningless spread across three. */
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const dragFrom = useRef(null);
  const [editingId, setEditing] = useState(null);
  /* ⚠️ FLAT IS THE WORKING VIEW; 3D IS A LOOK, and they are two different jobs. Composing needs a
   * surface that does not move: an orbit-able perspective camera means one stray drag skews the grid,
   * turns the selection box into a parallelogram and makes "is this centred" unanswerable. It also
   * means objects at different layers are scaled differently by perspective, so a card in front
   * looks bigger than the same card behind. An ORTHOGRAPHIC camera has neither problem.
   * Seeing it standing on a cake is still worth having, so it is a deliberate switch rather than
   * something a mis-aimed drag does to you. */
  const [view3d, setView3d] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  /* ⚠️ TWO DOORS PRE-FILL THIS CANVAS, AND THEY ARE NOT THE SAME DOOR.
   *
   *   `openWith` — a topper the baker already KEPT, reopened from My Decorations.
   *   `preset`   — a ready-made from the catalogue: a starting point, kept by nobody.
   *
   * Both put objects on the canvas, so it is tempting to make them one prop. They differ on the one
   * thing that matters at the end: keeping. A kept topper must not offer to be kept again, because
   * the row is INSERTED and never updated, so reusing one would save a second copy every time. A
   * preset is the opposite — the baker has kept nothing yet, and a ready-made they edited into their
   * own is exactly the thing worth keeping. One prop would have to pick one behaviour and be wrong
   * about the other half of the time.
   *
   * Either way the objects come back and the geometry is REBUILT from them, which is the whole
   * reason the geometry is not stored. */
  const openFrom = openWith ?? preset;
  useEffect(() => {
    if (!openFrom) return;
    const p = openFrom.payload ?? {};
    setObjects(Array.isArray(p.objects) ? p.objects : []);
    setName(openFrom.name ?? '');
    setStick(p.stick?.on ? { on: true, bury: p.stick.bury ?? 0.5 } : { on: false, bury: 0.5 });
    nextId.current = (p.objects ?? []).reduce((m, o) => Math.max(m, o.id ?? 0), 0) + 1;
  }, [openFrom]);
  const nextId = useRef(1);

  /* ⚠️ FONTS PER OBJECT, loaded once and kept. Two words on one topper can want two faces, so the
   * font cannot be a property of the screen the way it was in the single-word studio. Held in state
   * rather than a ref so arrival re-renders — a ref would load the face and never draw it. */
  const [fonts, setFonts] = useState({ [BLOCK_KEY]: blockFont });
  /* The face for one object, falling back to the block one — the same rule the cake's renderer uses,
     so a face still arriving never means a piece that measures as nothing. */
  const fontOf = useCallback((o) => fonts[o.face] ?? blockFont, [fonts]);
  const wanted = useMemo(
    () => [...new Set(objects.filter(o => o.kind === 'text').map(o => o.face))], [objects]);
  useEffect(() => {
    let alive = true;
    for (const key of wanted) {
      if (fonts[key]) continue;
      loadTopperFace(key).then(f => alive && setFonts(m => (m[key] ? m : { ...m, [key]: f })))
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [wanted, fonts]);

  const add = useCallback((obj) => {
    const id = nextId.current++;
    /* Dropped at the middle, which is where the eye already is. Later objects step down and right so
     * a second one does not land exactly on the first and look like nothing happened. */
    const n = objects.length;
    setObjects(o => [...o, { id, x: n * 0.12, y: -n * 0.12, colour: '#F2AEC4', ...obj }]);
    setSelectedIds([id]);
    /* New text opens for editing with "TEST" selected, so the first keystroke replaces it. Adding a
     * word and then having to discover how to change it is a step nobody wants. */
    if (obj.kind === 'text') setEditing(id);
    return id;
  }, [objects.length]);

  const addText = () => add({
    kind: 'text', text: 'TEST', size: 1.2, face: BLOCK_KEY,
    // A band by default, because a card topper almost always has one and a baker who does not want
    // it can drag it to none — easier than discovering a control that starts at zero.
    offset: 0.06, offsetColour: '#FFFFFF',
  });
  /* Offset starts at nothing: a shape gains an outline because somebody asked for one, never
     because it was added. */
  /* ⚠️ IDS ARE MINTED HERE, not stored on the preset — picking the same one twice would otherwise
     produce two objects sharing an id, and selecting either would move both. Cloned per object too,
     so editing what was just dropped cannot reach back into the frozen preset list. */
  const usePreset = (pre) => {
    const seeded = pre.objects.map(o => ({ ...o, id: nextId.current++ }));
    setObjects(seeded);
    setSelectedIds([]);
    setEditing(null);
  };

  const addShape = (family) => add({
    kind: 'shape', family, size: 1.0, colour: '#E9DFF2', offset: 0, offsetColour: '#FFFFFF',
  });

  const update = useCallback((id, patch) => {
    setObjects(o => o.map(x => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const remove = useCallback((id) => {
    setObjects(o => o.filter(x => x.id !== id));
    setSelectedIds(ids => ids.filter(x => x !== id));
    setEditing(e => (e === id ? null : e));
  }, []);
  const selected = objects.find(o => o.id === selectedId) ?? null;

  /* ── Selecting, with groups ───────────────────────────────────────────────────────────────────
   *
   * ⚠️ CLICKING A GROUPED PIECE SELECTS THE WHOLE GROUP. That is what a group IS — otherwise
   * "grouped" would mean nothing until you happened to shift-click every member again. Shift still
   * reaches past it, so a group can be extended or a member released. */
  const setSelected = useCallback((id, { add = false } = {}) => {
    setSelectedIds(prev => {
      if (id == null) return [];
      const obj = objects.find(o => o.id === id);
      const family = obj?.groupId
        ? objects.filter(o => o.groupId === obj.groupId).map(o => o.id)
        : [id];
      if (!add) return family;
      // Shift on something already selected removes it; on anything else, adds it.
      const has = family.every(f => prev.includes(f));
      return has ? prev.filter(p => !family.includes(p)) : [...new Set([...prev, ...family])];
    });
  }, [objects]);

  /* Snapshot where everything selected STARTED, so a drag applies one delta to all of them rather
     than each member chasing its own pointer maths. `moveGroupStickers`' shape. */
  const beginDrag = useCallback((id) => {
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    dragFrom.current = Object.fromEntries(
      objects.filter(o => ids.includes(o.id)).map(o => [o.id, { x: o.x, y: o.y }]));
  }, [objects, selectedIds]);

  /* ⚠️ THE DELTA COMES FROM THE PIECE BEING DRAGGED, and every other member gets the SAME delta from
   * where IT started. Moving each member to the pointer would pile them on top of one another;
   * re-reading current positions each frame would let the centre-snap drag the whole group into the
   * middle one member at a time. */
  const moveSelected = useCallback((id, next) => {
    const from = dragFrom.current;
    if (!from || !from[id] || Object.keys(from).length < 2) { update(id, next); return; }
    const dx = next.x - from[id].x, dy = next.y - from[id].y;
    setObjects(list => list.map(o => (
      from[o.id] ? { ...o, x: from[o.id].x + dx, y: from[o.id].y + dy } : o)));
  }, [update]);

  /* ── Grouping ─────────────────────────────────────────────────────────────────────────────────
   * A `groupId` on each member, exactly as a sticker cluster does it on the cake. Nothing about the
   * PIECE changes — the geometry never sees it — so a group is purely a statement about what moves
   * together, and ungrouping leaves every object exactly where it was. */
  const groupSelected = useCallback(() => {
    const gid = (crypto.randomUUID?.() ?? `g${Date.now()}`);
    setObjects(list => list.map(o => (selectedIds.includes(o.id) ? { ...o, groupId: gid } : o)));
  }, [selectedIds]);

  const ungroupSelected = useCallback(() => {
    setObjects(list => list.map(o => (selectedIds.includes(o.id) ? { ...o, groupId: null } : o)));
  }, [selectedIds]);

  // Every selected piece belongs to one group, and there are enough of them for that to mean something.
  const selectedObjs = objects.filter(o => selectedIds.includes(o.id));
  const isGrouped = selectedObjs.length > 1
    && selectedObjs.every(o => o.groupId && o.groupId === selectedObjs[0].groupId);

  /* ⚠️ THE OBJECT LIST, and nothing derived from it. See the note at the top: a word is stored as its
   * word, so a later improvement to how words are cut reaches every topper already kept. */
  /* ⚠️ The stick rides at the ROOT and only when it is on, so every topper saved before sticks
     existed is byte-identical and `v` stays 1 — an absent key reads as "no stick". */
  const payloadOf = () => ({ v: PAYLOAD_VERSION, objects, ...(stick.on ? { stick } : {}) });

  const useOnCake = () => onSave?.({ name: name.trim() || 'Card topper', payload: payloadOf() });

  /* The tile is the piece itself, photographed off the working canvas — a true sample rather than an
     illustration. `capturing` has already taken the grid and the selection away and framed it.
     *
     * ⚠️ A SQUARE CROP, because the tile is square. The stage is a wide panel and the picker card is
     * not, so handing the whole canvas over letterboxes it and everything inside shrinks by the
     * aspect ratio — a piece framed to fill 80% of the HEIGHT lands at about half the width of its
     * card. `useElementSave` has the same crop and the same note; the mistake is easy to make twice
     * because nothing about it fails, the tile is just quietly small. The middle square is where
     * ThumbFit has already centred the piece. */
  const thumbnail = () => {
    try {
      const cnv = stageRef.current?.querySelector('canvas');
      if (!cnv) return null;
      const side = Math.min(cnv.width, cnv.height);
      if (side === cnv.width && side === cnv.height) return cnv.toDataURL('image/png');
      const out = document.createElement('canvas');
      out.width = out.height = side;
      out.getContext('2d').drawImage(
        cnv, (cnv.width - side) / 2, (cnv.height - side) / 2, side, side, 0, 0, side, side);
      return out.toDataURL('image/png');
    } catch { return null; }
  };

  async function keepAndUse() {
    setSaving(true);
    /* ⚠️ TWO FRAMES BEFORE THE PHOTOGRAPH. `preserveDrawingBuffer` keeps the LAST frame drawn, so
       asking for the pixels in the same tick captures the studio exactly as it looked before the
       grid went. Two rAFs is one React commit plus one R3F draw. */
    setCapturing(true);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const thumbBase64 = thumbnail();
    setCapturing(false);
    try {
      await apiClient?.saveCardTopper?.({
        name: name.trim() || 'Card topper', payload: payloadOf(), thumbBase64,
      });
    } catch (e) {
      /* ⚠️ A FAILED SAVE STILL PLACES IT. The baker composed it; losing the work because a network
       * call failed would be the worst trade available, and they can save it again from the card
       * later. The same call GarnishStudio makes. */
      console.error('Could not save the card topper to my decorations', e);
    } finally {
      setSaving(false);
      useOnCake();
    }
  }

  /* ⚠️ `openWith`, NOT `openFrom`. A preset still offers saving — see the note above. */
  const canKeep = !!apiClient?.saveCardTopper && !openWith;
  /* ⚠️ ON BY DEFAULT. A baker who composes something good almost always wants it again, so the
   * quieter decision is the one that needs the deliberate act — GarnishStudio's call, kept when the
   * pair of buttons became a button and a tick. */
  const [alsoSave, setAlsoSave] = useState(true);
  const stageRef = useRef(null);
  const piecesRef = useRef(null);
  /* True only for the frames being photographed for the shelf tile — see ThumbFit. */
  const [capturing, setCapturing] = useState(false);
  // Which phone drawer is showing, if any. One at a time: two open cover the canvas entirely.
  const [drawer, setDrawer] = useState(null);
  /* ⚠️ THE STICK BELONGS TO THE WHOLE TOPPER, not to any one piece on it — a card has one stick
   * however many words and shapes are cut into it, so it lives at the payload's root rather than on
   * an object. Off by default: a topper that is laid flat on the cake needs no stick, and one that
   * arrives with a rod nobody asked for is a thing to go and switch off. */
  const [stick, setStick] = useState({ on: false, bury: 0.5 });
  const empty = objects.length === 0;

  const btn = (primary, disabled = false) => ({
    padding: '10px 16px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
    color: primary ? '#fff' : '#3D5A44',
    background: primary ? (disabled ? '#9BB0A2' : '#3D5A44') : '#fff',
    border: primary ? 'none' : '1.5px solid #C5D4C8',
  });

  /* ⚠️ ONE PANEL, PLACED TWICE. Everything that describes the topper being made — the selected
   * piece's controls, a multi-selection's grouping, the stick — is defined once here and then put
   * where the screen has room: a column beside the canvas on a desktop, a sheet OVER it on a phone.
   * Two copies of this markup is how one of them quietly stops matching the other.
   *
   * ⚠️ ONE PIECE GETS ITS PROPERTIES; SEVERAL GET THE ONE THING THAT APPLIES TO SEVERAL. A colour or
   * a size spread across three pieces is three different answers, so those controls are absent
   * rather than guessing which piece you meant — and what IS true of a multi-selection, that it can
   * be grouped, is the only thing offered. */
  const panel = objects.length === 0 ? null : (
    <>

          {/* ⚠️ ONE PIECE GETS ITS PROPERTIES; SEVERAL GET THE ONE THING THAT APPLIES TO SEVERAL. A
              colour or a size spread across three pieces is three different answers, so those
              controls are absent rather than guessing which piece you meant — and what IS true of a
              multi-selection, that it can be grouped, is the only thing offered. */}
          {selectedIds.length > 1 ? (
            <div style={{ padding: 16, borderBottom: '1px solid #E8EFE9' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: '#2C3E33' }}>
                {selectedIds.length} pieces
              </h2>
              <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.5, color: '#5B6B60' }}>
                {isGrouped
                  ? 'These move together. Drag any one of them and the rest follow.'
                  : 'Group them and they move together — drag any one and the rest follow.'}
              </p>
              <button type="button" onClick={isGrouped ? ungroupSelected : groupSelected}
                style={{ width: '100%', minHeight: 42, borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
                  color: isGrouped ? '#8A6320' : '#fff',
                  background: isGrouped ? '#FDF3E7' : '#3D5A44',
                  border: isGrouped ? '1.5px solid #F0DCC0' : 'none' }}>
                {isGrouped ? 'Ungroup' : 'Group'}
              </button>
              <p style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.5, color: '#8A9A8E' }}>
                Hold Shift and tap a piece to add it to the selection, or to drop it.
              </p>
            </div>
          ) : selected ? (
            <Properties obj={selected} onChange={update} onDelete={remove}
              grouped={!!selected.groupId} onUngroup={ungroupSelected} embedded />
          ) : null}

          {/* ⚠️ THE STICK IS THE WHOLE TOPPER'S, so it is not in a selected piece's properties — it
              would appear to belong to whatever you last clicked, and vanish when you clicked away.
              ⚠️ THE DEPTH APPEARS ONLY WITH A STICK: an insertion depth with nothing to insert is
              the exact thing this rebuild was argued against (INVARIANTS #12). */}
          <div style={{ padding: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={stick.on}
                onChange={e => setStick(v => ({ ...v, on: e.target.checked }))}
                style={{ width: 17, height: 17, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5A44' }}>On a stick</span>
            </label>
            {stick.on ? (
              <div style={{ marginTop: 12 }}>
                <Slide label="How far into the cake" value={stick.bury} min={0} max={1} step={0.02}
                  onChange={v => setStick(s2 => ({ ...s2, bury: v }))}
                  fmt={v => (v <= 0.01 ? 'resting on top' : `${Math.round(v * 100)}% of the stick`)} />
                <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.5, color: '#8A9A8E' }}>
                  Taped to the back and running up behind the card, so the join never shows.
                </p>
              </div>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.5, color: '#8A9A8E' }}>
                Without one the card lies flat on the cake.
              </p>
            )}
          </div>
    </>
  );

  return (
    <Panel
      open={open}
      /* ⚠️ Minutes of composing are never lost to a stray tap (INVARIANTS #13). The ✕ and Cancel
         still close — deliberate exits stay one press away. */
      guardUnsaved={!empty}
      title="Card topper studio"
      width={880}
      flow="block"
      isMobile={isMobile}
      onClose={onCancel}
      footer={
        <>
          {/* ⚠️ `alignSelf`, because the footer is a flex row and its default is STRETCH. When the
              tick and the button wrapped onto two lines on a phone, Cancel grew to match them and
              became a tall square. It should be a button whatever is beside it. */}
          <button onClick={onCancel} style={{ ...btn(false), alignSelf: 'center' }}>Cancel</button>
          {/* ⚠️ ONE ACTION, WITH A MODIFIER BESIDE IT — not two buttons that both place the topper.
              Two primaries differing only in a side effect made the baker read both to find the
              difference, and put the longest label in a footer that also holds Cancel: at 375px
              there was nothing left. A tick states what will happen BEFORE it happens and leaves one
              obvious thing to press.

              ⚠️ IT NAMES WHERE IT GOES. This said "Keep it" first, and "keep" does not say WHERE —
              kept on the cake? kept as it is? The shelf is labelled "My decorations" on this same
              screen (`MY_DECORATIONS`), so the tick and the place it lands use one word. That is the
              argument decorationCopy.js makes: if the control pressed and the screen it feeds
              disagree, the baker stops trusting both.

              ⚠️ HIDDEN, NOT UNTICKED, for a topper opened from the shelf — it is already there, and
              saving again writes a SECOND copy every time one is reused, because the row is inserted
              and never updated. */}
          {/* ⚠️ The tick sits BESIDE THE BUTTON IT MODIFIES, not out on its own next to Cancel
              (INVARIANTS #11) — it changes what that button does, so they are one control. The group
              wraps, so on a phone the tick drops onto its own line ABOVE the button rather than
              squeezing it; the footer itself does not wrap. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            flexWrap: 'wrap', gap: 14, alignSelf: 'center' }}>
          {canKeep && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={alsoSave} onChange={e => setAlsoSave(e.target.checked)}
                style={{ width: 17, height: 17, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5A44' }}>
                Save to my decorations
              </span>
            </label>
          )}
          <button onClick={canKeep && alsoSave ? keepAndUse : useOnCake} disabled={empty || saving}
            style={btn(true, empty || saving)}>
            {saving ? 'Saving…' : 'Use it on the cake'}
          </button>
          </div>
        </>
      }
    >
      {/* ⚠️ ONE COLUMN ON A PHONE. Three columns — rail, canvas, properties — is 96 + canvas + 268,
          which has nothing left at 375px. Stacked, the rail becomes a strip across the top and the
          properties a sheet under the canvas, so the CANVAS STAYS VISIBLE while a control is touched
          (INVARIANTS #11): a colour or a size judged with the thing it changes off-screen is judged
          blind. A real media query, because it cannot be written inline. */}
      <div className="tc">
      <style>{`
        .tc { display: flex; height: 62vh; min-height: 340px; overflow: hidden; }
        .tc > .tcRail { flex: 0 0 112px; display: flex; flex-direction: column; gap: 16; overflow-y: auto; }
        .tc > .tcStage { flex: 1; min-width: 0; position: relative; }
        .tc > .tcProps { flex: 0 0 268px; overflow-y: auto; }
        @media (max-width: 820px) {
          .tc { flex-direction: column; height: auto; min-height: 0; overflow: visible; }
          /* ⚠️ A ROW PER SECTION, NOT THREE COLUMNS SIDE BY SIDE. Turned on its side, "Text",
             "Shapes" and "Presets" each kept their own vertical stack — so a T, a column of three
             shapes and a two-wide grid of presets sat abreast and read as one jumbled block with
             three headings floating over it. Stacked, each heading owns the row beneath it. */
          .tc > .tcRail {
            flex: none; flex-direction: column; align-items: stretch; gap: 12px;
            overflow-x: visible; border-right: none; border-bottom: 1px solid #E8EFE9;
          }
          /* The grids flow ACROSS on a phone, and their buttons stop being full-width: a rail button
             asking to fill a desktop COLUMN is asking for one per line once the rail is a row, which
             is not the same wish. (No backticks in here — this is inside a template literal.) */
          .tc .tcGroup { display: flex !important; flex-wrap: wrap; gap: 7px; }
          /* !important because RailButton sets width INLINE when it is asked to fill the rail, and
             an inline style beats a stylesheet rule — without it every button stayed full width and
             the rail became one tall column that pushed the canvas off the screen. */
          .tc .tcGroup > button { width: 46px !important; min-height: 46px !important; flex: none; }
          /* The canvas keeps a definite height of its own — a flex child with nothing to fill
             collapses to nothing, and R3F will not create a renderer for a zero-height box. */
          /* ⚠️ THE CANVAS GETS WHAT IS LEFT, and it is the thing being worked on. It used to be a
             fixed 52vh under a shelf that had already taken half the screen, so the topper was cut
             off by the footer. The toolbar is one row now and the stage fills the rest. */
          .tc > .tcStage { flex: none; height: 46vh; min-height: 300px; }
          .tc > .tcBar {
            flex: none; display: flex; flex-direction: column; gap: 8px; padding: 10px 14px;
            border-bottom: 1px solid #E8EFE9; background: #fff; position: relative; z-index: 6;
          }
          /* A preset button must not be squeezed by a strip narrower than its contents. */
          .tc > .tcBar button { flex: none; }
          .tc > .tcProps { flex: none; border-left: none; border-top: 1px solid #E8EFE9; }
        }
      `}</style>
      {/* ⚠️ TWO SHAPES OF TOOLBAR, because a phone has one axis to spare and a desktop has the
          other. On a desktop the rail is a column and everything can be on show. On a phone the
          same shelf ate half the screen before the canvas began — so shapes and presets go behind
          one button each, and the canvas gets the room. */}
      {isMobile ? (
        <div className="tcBar">
          {/* ⚠️ SHAPES ARE BEHIND A BUTTON; PRESETS ARE NOT — and the difference is what each is FOR.
              A preset is a picture of a finished topper and it is the fastest way to start, so it
              has to be seen to be chosen. A shape is a component you reach for once you are already
              composing, and three of them on show cost a row that the canvas wanted more. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RailButton onClick={() => { setDrawer(null); addText(); }} title="Add text">
              <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1 }}>T</span>
            </RailButton>

            <PickerButton label="Shapes" open={drawer === 'shapes'}
              onToggle={() => setDrawer(d => (d === 'shapes' ? null : 'shapes'))}>
              {SHAPES.map(sh => (
                <RailButton key={sh.key} onClick={() => { setDrawer(null); addShape(sh.key); }}
                  title={`Add ${sh.label.toLowerCase()}`}>
                  <ShapeIcon family={sh.key} />
                </RailButton>
              ))}
            </PickerButton>

            {objects.length > 0 && (
              <button type="button" onClick={() => { setObjects([]); setSelectedIds([]); setDrawer(null); }}
                style={{ marginLeft: 'auto', minHeight: 46, padding: '0 14px', borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800,
                  color: '#8A6320', background: '#FDF3E7', border: '1.5px solid #F0DCC0' }}>
                Clear
              </button>
            )}
          </div>

          {/* Six at 46px fit a 390px phone with room over; `auto` is the guard for a narrower one,
              where scrolling a strip is better than wrapping it into a second block. */}
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
            {TOPPER_PRESETS.map(pre => (
              <RailButton key={pre.key} onClick={() => { setDrawer(null); usePreset(pre); }}
                title={pre.label}>
                <PresetIcon objects={pre.objects} font={blockFont} size={30} />
              </RailButton>
            ))}
          </div>
        </div>
      ) : (
      <div className="tcRail" style={{ padding: 14, borderRight: '1px solid #E8EFE9', background: '#fff' }}>
        <div>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
            textTransform: 'uppercase', color: '#9AA8A0', marginBottom: 7 }}>Text</span>
          {/* A "T" and nothing else. It is the one mark every editor uses for this, so it needs no
              label (INVARIANTS #14) — the accessible name carries the words. */}
          <div className="tcGroup" style={{ display: 'grid' }}>
            <RailButton onClick={addText} title="Add text" wide>
              <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1 }}>T</span>
            </RailButton>
          </div>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
            textTransform: 'uppercase', color: '#9AA8A0', marginBottom: 7 }}>Shapes</span>
          <div className="tcGroup" style={{ display: 'grid', gap: 7 }}>
            {SHAPES.map(sh => (
              <RailButton key={sh.key} onClick={() => addShape(sh.key)} title={`Add ${sh.label.toLowerCase()}`} wide>
                <ShapeIcon family={sh.key} />
              </RailButton>
            ))}
          </div>
        </div>

        {/* ⚠️ IN THE RAIL, WITH THE OTHER THINGS YOU ADD — not on the empty canvas. On the canvas
            they were only reachable while it was empty, so the one baker who most needs an example —
            somebody who added a word, saw it was not what they wanted, and now has no idea what else
            is possible — was the one baker who could not get at them. Here they sit beside "T" and
            the shapes, which is what they are: another way to put something on the canvas.

            ⚠️ A STARTING POINT, NEVER A MENU. Picking one drops its pieces on as ordinary objects —
            retype the word, recolour, drag, delete half of it. Nothing is locked.

            The pictures are cut from the SAME contours the cake is (INVARIANTS #15) — see
            presetPaths. Icon only, like the shapes: the rail is 96px and the name rides on the
            tooltip, which is how every other button here already works (INVARIANTS #14). */}
        <div>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
            textTransform: 'uppercase', color: '#9AA8A0', marginBottom: 7 }}>Presets</span>
          {/* ⚠️ TWO COLUMNS, because six will not stack. One per row put the last pair below the fold
              of a column that gives no sign it scrolls, and a hidden example is not an example — it
              is the reason "Happy Birthday" was left out once already. Paired, six rows become three
              and the rail fits a 1280x720 laptop with room to spare. The rail carries 16px of the
              canvas's width for it, which is a better trade than a preset nobody finds. */}
          <div className="tcGroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {TOPPER_PRESETS.map(pre => (
              <RailButton key={pre.key} onClick={() => usePreset(pre)} title={pre.label} wide compact>
                <PresetIcon objects={pre.objects} font={blockFont} size={30} />
              </RailButton>
            ))}
          </div>
        </div>

        {objects.length > 0 && (
          <button type="button" onClick={() => { setObjects([]); setSelectedIds([]); }}
            style={{ marginTop: 'auto', minHeight: 40, borderRadius: 9, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800, color: '#8A6320',
              background: '#FDF3E7', border: '1.5px solid #F0DCC0' }}>
            Clear
          </button>
        )}
      </div>
      )}

      <div className="tcStage" ref={stageRef}>
        {/* ⚠️ Keyed on the view, because a Canvas takes its camera ON MOUNT ONLY — remounting is the
            honest way to change camera type, and the same call ChocolateDripStudio makes. */}
        <Canvas key={view3d ? '3d' : 'flat'} shadows
          orthographic={!view3d}
          camera={view3d ? { position: [0, -1.6, 4.6], fov: 34 } : { position: [0, 0, 6], zoom: 190 }}
          gl={{ preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0 }}>
          {/* Flat only: the 3D look is a perspective camera and has no zoom to set. */}
          {!view3d && <FitCamera bottomInset={isMobile && panel ? SHEET_FRACTION : 0} />}
          <SceneLights shadows />
          <SceneEnv />
          {/* The designer's own ground, imported rather than chosen, so what is judged here is what a
              cake shows (INVARIANTS #17). */}
          <SceneBackground colour={DESIGNER_GROUND} />
          {/* A working surface, and no part of the piece — so it is not in the tile. */}
          {!capturing && <Grid />}
          {/* A click on nothing clears the selection, which is what every canvas does and what makes
              the border mean "this one" rather than "the last one you touched". */}
          <mesh position={[0, 0, -0.05]} onPointerDown={() => { setSelectedIds([]); setEditing(null); }}>
            <planeGeometry args={[GRID_HALF * 2, GRID_HALF * 2]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          <group ref={piecesRef}>
          {objects.map((o, i) => (
            <Piece key={o.id} obj={o} layer={i} font={fonts[o.face] ?? blockFont}
              selected={!capturing && selectedIds.includes(o.id)}
              editing={!capturing && o.id === editingId}
              showHandles={selectedIds.length === 1}
              onSelect={setSelected} onDragStart={beginDrag}
              onMove={moveSelected} onEdit={setEditing} onChange={update} />
          ))}
          </group>
          <ThumbFit active={capturing} target={piecesRef} />
          {/* ⚠️ SHOWN WHILE COMPOSING, because the stick changes what the topper IS — how tall it
              stands and where the card sits above the cake — and a control whose effect is only
              visible on another screen is one nobody can judge (INVARIANTS #11). It is drawn from
              `topperStick`, the same function the cake asks, so the two cannot disagree about how
              long it is or how much of it goes in. */}
          <StudioStick objects={objects} fontOf={fontOf} stick={stick} />
          {/* Only in the 3D look. While composing there is nothing to orbit: the camera is the one
              thing on this screen that must hold still. */}
          {view3d && <OrbitControls enablePan={false} makeDefault />}
        </Canvas>

        <button type="button" onClick={() => setView3d(v => !v)}
          style={{ position: 'absolute', top: 12, right: 12, minHeight: 34, padding: '0 12px',
            borderRadius: 9, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", fontSize: 11.5,
            fontWeight: 800, color: view3d ? '#fff' : '#3D5A44',
            background: view3d ? '#3D5A44' : 'rgba(255,255,255,0.92)',
            border: '1.5px solid #C5D4C8' }}>
          {view3d ? 'Back to flat' : 'See it in 3D'}
        </button>

        {/* ⚠️ ON THE CANVAS, NOT UNDER IT. On a phone these controls sat below the stage, so
            changing an offset meant scrolling down to the slider, scrolling back up to see what it
            did, and back again — judging a change you cannot see while you make it, which is the
            one thing INVARIANTS #11 exists to stop. Over the canvas the piece stays in view; the
            sheet is capped at two fifths of the stage and scrolls inside itself. */}
        {isMobile && panel && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4,
            maxHeight: `${SHEET_FRACTION * 100}%`, overflowY: 'auto', background: 'rgba(255,255,255,0.97)',
            borderTop: '1px solid #E8EFE9', boxShadow: '0 -8px 22px rgba(0,0,0,0.08)' }}>
            {panel}
          </div>
        )}

        {objects.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 13, color: '#5B6B60', fontFamily: "'Quicksand', sans-serif",
              fontWeight: 700, background: 'rgba(255,255,255,0.82)', padding: '8px 14px',
              borderRadius: 9 }}>
              Pick a preset, or add text or a shape
            </span>
          </div>
        )}
      </div>

      {/* The panel, where a desktop has room for it: a column of its own beside the canvas. */}
      {!isMobile && panel && (
        <div className="tcProps" style={{ background: '#fff', borderLeft: '1px solid #E8EFE9' }}>
          {panel}
        </div>
      )}
    </div>
    </Panel>
  );
}
