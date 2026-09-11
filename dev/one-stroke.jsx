import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildPipingStroke } from '../src/designer/geometry/creamPen.js';
import { ropeSection, pipedBodyRadius, pipedParams } from '../src/designer/geometry/creamWall.js';
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
const P = pipedParams({ nozzle: noz, width: Number(q.get('width') || 0.5) });
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
function starSlabShape(points, depth) {
  const shape = new THREE.Shape();
  for (let k = 0; k < 2 * points; k++) {
    const a = (k * Math.PI) / points, r = (k % 2 === 0) ? 1 : 1 - depth;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function StarStack({ points, depth, n, height, thickness, wobble, turn, roll, x = 0, z = 0 }) {
  const geos = useMemo(() => {
    const shape = starSlabShape(points, depth);
    const slab = height / n;
    return Array.from({ length: n }, (_, i) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);                                  // lay the star flat, extrude upward
      const wob = 1 + wobble * (Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.13 + 1.7) * 0.4);
      g.scale(thickness * wob, 1, thickness * wob);
      g.rotateY(roll + i * turn);            // a POINT faces the viewer, and the stack turns a hair as it rises
      g.translate(x, -height / 2 + i * slab, z);
      return g;
    });
  }, [points, depth, n, height, thickness, wobble, turn, roll, x, z]);
  return geos.map((g, i) => (
    <mesh key={i} geometry={g} castShadow receiveShadow><meshPhysicalMaterial color="#F6EBD8" {...creamMaterial()} /></mesh>
  ));
}

function creamMaterial() {
  const m = frostingDef('buttercream').material;
  return { roughness: m.roughness, metalness: 0, sheen: m.sheen, sheenRoughness: m.sheenRoughness,
           sheenColor: m.sheenColor, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness };
}

/* `?n=` strokes, centred on the camera's side of the cake and spaced the way the wall spaces them. */
function strokeAngles() {
  const n = Math.max(1, Math.round(Number(q.get('n') || 1)));
  const step = (Math.PI * 2) / ropeSection(R, P).ropes;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
}

function Stroke({ x = 0, z = 0, roll: r }) {
  const pts = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(x, 1.0 - i * 0.5, z));
  const geo = buildPipingStroke(pts, noz, t, { speedWidth: 0, tailDias: 0, twistTurnsPerDia: 0 }, null, r);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow><meshPhysicalMaterial color="#F6EBD8" {...creamMaterial()} /></mesh>;
}

/* The cake under it, placed by `pipedBodyRadius` — the same call the wall makes. At press 0 the
 * stroke is TANGENT to this cylinder: its inner edge is the cake's side. */
function Cake() {
  const rBody = pipedBodyRadius(R, P);
  return (
    <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[rBody, rBody, 2.6, 96]} />
      <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
    </mesh>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#fff' }}>
    <Canvas camera={onCake ? { position: [5.0, 0.3, 0.9], fov: 34 } : { position: [0, 0, 4.2], fov: 32 }} shadows>
      <SceneEnv />
      <SceneLights shadows />
      {stack ? (
        <StarStack points={Number(q.get('points') || 5)} depth={Number(q.get('depth') || 0.55)}
          n={stack} height={2.0} thickness={t}
          wobble={Number(q.get('wob') ?? 0.012)} turn={Number(q.get('turn') ?? 0.002)}
          roll={Number(q.get('roll') ?? Math.PI / 2)} />
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
