import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildPipingStroke, NOZZLE_BY_KEY, DEFAULT_NOZZLE } from '../src/designer/geometry/creamPen.js';
import { ropeSection, pipedBodyRadius, pipedParams, buildStyledWall, buildStyledTop } from '../src/designer/geometry/creamWall.js';
import { styleDef, CREAM_STYLES } from '../src/designer/creamStyles.js';
import { frostingDef } from '../src/designer/frostings.js';

/* ONE vertical stroke, on its own, lit the way the cake is.
 *
 * ⚠️ THE PAGE THAT SHOULD HAVE EXISTED FIRST. The piped cream wall went through nine rounds of "that
 * is not what a star nozzle leaves", every one of them judged on a whole tier — where a stroke is a
 * few pixels wide and every fault looks like every other fault. A tip's output is one stroke. Judge
 * one stroke.
 *
 * `?noz=` picks the tip (any key in creamPen's NOZZLES), `?t=` its radius, `?roll=` turns it.
 * `?cake=1` puts the same stroke on a cake's SIDE, placed by the wall's own maths — so what a tip
 * leaves and where the wall puts it can be looked at together or apart.
 */
const q = new URLSearchParams(location.search);
const noz = q.get('noz') || 'star5';
const onCake = q.get('cake') === '1';
const R = 1.35;                                     // tier radius when the stroke is shown on a cake
const P = pipedParams({ nozzle: noz, width: Number(q.get('width') || 0.5), overlap: Number(q.get('ov') ?? 0.85) });
// On a cake the stroke is the size the wall would make it; on its own it is sized to fill the frame.
const t = Number(q.get('t') || (onCake ? ropeSection(R, P).w : 0.16));
/* ⚠️ The camera sits on +z and the sweep's frame puts the profile's local x on world x, so a POINT
 * only faces the viewer at a quarter turn. On a cake this is the SAME roll the wall applies to every
 * stroke (its own angle), which is what keeps the tip presenting the same face all the way round. */
const roll = Number(q.get('roll') ?? Math.PI / 2);
const stack = Number(q.get('stack') || 0);   // ?stack=N — N flat stars, laid one on another

/* ⚠️ A STACK OF FLAT STARS — the construction Sandeep described, built literally rather than
 * approximated by a sweep. Cut a sharp star out of card, lay it on the floor, and keep laying more
 * on top: that stack IS a piped stroke. `?stack=N` builds exactly that, N thin star SLABS, so the
 * structure can be looked at instead of argued about. Each slab is the same sharp star polygon —
 * no rounding, no relaxing, no gaussian slots — and they are stacked with a whisper of turn and
 * size between them, which is the only thing a hand adds.
 */
/* ⚠️ `notch` IS THE ANGLE OF THE V, AND IT IS NOT THE DEPTH. Deepening a star narrows its valleys,
 * but it does so by thinning the whole stroke — the inner radius falls and the silhouette comes in
 * with it. What a piped line has is a NARROW V between BROAD points: the cut occupies a small
 * fraction of each point's share of the circle, and the rest of that share stays out at full radius.
 * So the point is an ARC at r = 1 and the V is a wedge cut into the gap between two of them.
 *
 * `notch` is that wedge's angular width as a fraction of one point's span. Small = a narrow slot
 * between fat lobes; 1 = the classic star polygon, where the cut starts the moment the last one ends.
 */
function starSlabShape(points, depth, notch = 0.42, per = 7) {
  const shape = new THREE.Shape();
  const span = (Math.PI * 2) / points, half = span / 2, nw = notch * half;
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  let first = true;
  for (let k = 0; k < points; k++) {
    const c = k * span;
    for (let j = 0; j <= per; j++) {            // the point: an arc at full radius
      const [x, y] = at(c - half + nw + (2 * (half - nw)) * (j / per), 1);
      if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
    }
    const [vx, vy] = at(c + half, 1 - depth);   // the V, cut into the gap
    shape.lineTo(vx, vy);
  }
  shape.closePath();
  return shape;
}

function StarStack({ points, depth, notch, n, height, thickness, wobble, turn, roll, ao, x = 0, z = 0 }) {
  const geos = useMemo(() => {
    const shape = starSlabShape(points, depth, notch);
    const slab = height / n;
    return Array.from({ length: n }, (_, i) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);                                  // lay the star flat, extrude upward
      const wob = 1 + wobble * (Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.13 + 1.7) * 0.4);
      g.scale(thickness * wob, 1, thickness * wob);
      g.rotateY(roll + i * turn);            // a POINT faces the viewer, and the stack turns a hair as it rises
      g.translate(x, -height / 2 + i * slab, z);
      /* ⚠️ THE SAME TWO THINGS THE SWEPT PATH NEEDED, and without them the stack reads as one merged
       * panel exactly as the sweep did. `ExtrudeGeometry` SHARES the vertices at the shape's corners,
       * so `computeVertexNormals` averages the two faces meeting there and rolls every edge over into
       * a smooth shoulder; and the scene's light is nearly a uniform dome, so faces a few degrees
       * apart shade identically unless something darkens the creases. Flat shading gives each face
       * its own normal; the AO is measured from the crease to the crest, the same as the wall's. */
      bakeCreaseAO(g, thickness, ao, x, z);
      return g;
    });
  }, [points, depth, notch, n, height, thickness, wobble, turn, roll, ao, x, z]);
  return geos.map((g, i) => (
    <mesh key={i} geometry={g} castShadow receiveShadow>
      <meshPhysicalMaterial color="#F6EBD8" flatShading vertexColors {...creamMaterial()} /></mesh>
  ));
}

/* ⚠️ `?rough=` / `?sheen=` / `?coat=` OVERRIDE THE CREAM, because a shape can be right and still be
 * invisible. Buttercream ships near-Lambertian (roughness 0.95, sheen 0, clearcoat 0) and under a
 * soft environment a Lambertian surface gives two faces fifteen degrees apart almost the same
 * brightness — so a star's flanks read as ONE merged panel however sharp the geometry between them
 * is. These let the material be ruled in or out without touching the frosting table. */
function creamMaterial() {
  const m = frostingDef('buttercream').material;
  return {
    roughness: Number(q.get('rough') ?? m.roughness), metalness: 0,
    sheen: Number(q.get('sheen') ?? m.sheen), sheenRoughness: m.sheenRoughness, sheenColor: m.sheenColor,
    clearcoat: Number(q.get('coat') ?? m.clearcoat), clearcoatRoughness: m.clearcoatRoughness,
  };
}

/* `?n=` strokes, centred on the camera's side of the cake and spaced the way the wall spaces them. */
function strokeAngles() {
  const n = Math.max(1, Math.round(Number(q.get('n') || 1)));
  const step = (Math.PI * 2) / ropeSection(R, P).ropes;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
}

/* ⚠️ A CREASE IS DARK BECAUSE IT IS OCCLUDED, and nothing in the render was doing occlusion.
 *
 * Measured before reaching for this: sheen, roughness and clearcoat all change the stroke by
 * NOTHING. That is not a surprise once stated — the scene's light is very nearly a uniform dome, and
 * under a uniform dome a surface's brightness barely depends on which way it faces. So two flanks
 * fifteen degrees apart come out the same shade and the star reads as one merged panel, however
 * sharp the geometry between them is. The normals were already right; there was simply no cue.
 *
 * What makes a crease dark in a photograph is that its own walls block most of the sky from it.
 * That is ambient occlusion, and it can be baked straight onto the vertices here: a vertex's depth
 * inside the section is exactly how occluded it is. No texture, no UVs, no post pass.
 *
 * `?ao=` scales it; 0 is the render as it was.
 */
function bakeCreaseAO(geo, thickness, ao, cx = 0, cz = 0) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  /* ⚠️ The range is the CREASE to the CREST, from the tip's own profile — not the geometry's own
   * min and max radius, whose minimum is the end cap's apex sitting on the axis. See creamWall. */
  // For the stack the section is the flat star itself, so its crease sits at 1 − depth.
  const rMin = stack ? 1 - Number(q.get('depth') || 0.55)
    : (() => { let m = 1; for (const [px, py] of (NOZZLE_BY_KEY[noz] ?? NOZZLE_BY_KEY[DEFAULT_NOZZLE]).profile) m = Math.min(m, Math.hypot(px, py)); return m; })();
  const crest = thickness, floor = thickness * rMin, span = Math.max(1e-6, crest - floor);
  for (let i = 0; i < pos.count; i++) {
    const d = (Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) - floor) / span;
    const k = 1 - ao * (1 - Math.min(1, Math.max(0, d)));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function Stroke({ x = 0, z = 0, roll: r }) {
  /* ⚠️ BOTTOM TO TOP. `buildPipingStroke` puts the foot flare at a stroke's START and the lift-off
   * at its END, and on a cake side the fat foot belongs at the board. */
  const pts = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(x, -1.0 + i * 0.5, z));
  const geo = buildPipingStroke(pts, noz, t, { speedWidth: 0, tailDias: 0, twistTurnsPerDia: 0 }, null, r);
  if (!geo) return null;
  bakeCreaseAO(geo, t, Number(q.get('ao') ?? 0.55));
  return <mesh geometry={geo} castShadow receiveShadow>
    <meshPhysicalMaterial color="#F6EBD8" vertexColors {...creamMaterial()} /></mesh>;
}

/* The cake under it, placed by `pipedBodyRadius` — the same call the wall makes. At press 0 the
 * stroke is TANGENT to this cylinder: its inner edge is the cake's side. */
function Cake() {
  /* ⚠️ In stack mode the cake is sized to the STACK, not to the style's own stroke. `?t=` sets the
   * stack's radius, and a body built for a different width leaves the stroke half sunk into it —
   * which is the one thing this page exists to show is wrong. */
  const rBody = stack ? R - 2 * t : pipedBodyRadius(R, P);
  return (
    <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[rBody, rBody, 2.6, 96]} />
      <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
    </mesh>
  );
}

/* ⚠️ `?style=` RENDERS THE SHIPPING FUNCTION, not a hand-built row of strokes. Everything above
 * places strokes the way this page thinks the wall does; this asks buildStyledWall for the real one,
 * with the row's real params, so a look that passes here is a look the designer will actually draw.
 * A whole day went into a wall judged only through a stand-in. `?style=piped_rope`. */
const styleKey = q.get('style');
function StyledTier() {
  const row = CREAM_STYLES[styleKey] ?? null;
  const H = Number(q.get('h') || 1.2), Rt = Number(q.get('r') || 0.9);
  const vals = useMemo(() => {
    const out = {};
    for (const p of styleDef(styleKey).params ?? []) out[p.key] = p.default;
    out.nozzle = row?.nozzle;
    return out;
  }, []);
  const wall = useMemo(() => buildStyledWall(row?.wall, Rt, H, vals), [vals]);
  const top  = useMemo(() => buildStyledTop(row?.wall, row?.top, Rt, H, vals), [vals]);
  const mat = { color: '#F6EBD8', ...creamMaterial() };
  return <group position={[0, -0.2, 0]}>
    <mesh geometry={wall} castShadow receiveShadow>
      <meshPhysicalMaterial {...mat} vertexColors={!!wall?.getAttribute?.('color')} /></mesh>
    {top && <mesh geometry={top} position={[0, H / 2, 0]} castShadow receiveShadow>
      <meshPhysicalMaterial {...mat} /></mesh>}
  </group>;
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#fff' }}>
    <Canvas camera={styleKey ? { position: [Number(q.get('dist') || 3.4), Number(q.get('eye') || 0.8), 0], fov: Number(q.get('fov') || 34) }
      : onCake ? { position: [Number(q.get('dist') || 5.6), 0.9, 1.4], fov: Number(q.get('fov') || 34) } : { position: [0, 0, 4.2], fov: 32 }} shadows>
      <SceneEnv />
      <SceneLights shadows />
      {styleKey ? <StyledTier /> : stack && onCake ? <>
        {/* The stack, laid ON the cake's side: tangent to it, and rolled so a POINT faces outward —
            the same placement the wall gives a swept stroke. `?n=` repeats it round the tier. */}
        <Cake />
        {strokeAngles().map((a, i) => (
          <StarStack key={i} points={Number(q.get('points') || 5)} depth={Number(q.get('depth') || 0.55)}
            notch={Number(q.get('notch') ?? 0.42)} n={stack} height={2.0} thickness={t}
            wobble={Number(q.get('wob') ?? 0.012)} turn={Number(q.get('turn') ?? 0.002)}
            roll={a} ao={Number(q.get('ao') ?? 0.8)}
            x={(R - t) * Math.cos(a)} z={(R - t) * Math.sin(a)} />
        ))}
      </> : stack ? (
        <StarStack points={Number(q.get('points') || 5)} depth={Number(q.get('depth') || 0.55)}
          notch={Number(q.get('notch') ?? 0.42)}
          n={stack} height={2.0} thickness={t}
          wobble={Number(q.get('wob') ?? 0.012)} turn={Number(q.get('turn') ?? 0.002)}
          roll={Number(q.get('roll') ?? Math.PI / 2)} ao={Number(q.get('ao') ?? 0.8)} />
      ) : onCake ? <>
        <Cake />
        {/* ⚠️ SPACED AND ROLLED BY THE WALL'S OWN NUMBERS. `ropeSection` says how many go round at
            this nozzle width, so `?n=` neighbours land exactly where the tier would put them — the
            point of the page is to see what the tip leaves, not a spacing invented for a demo. */}
        {strokeAngles().map((a, i) => (
          <Stroke key={i} x={(R - t) * Math.cos(a)} z={(R - t) * Math.sin(a)} roll={a} />
        ))}
      </> : <Stroke roll={roll} />}
      {q.get('orbit') === '1' && <OrbitControls />}
    </Canvas>
  </div>
);
