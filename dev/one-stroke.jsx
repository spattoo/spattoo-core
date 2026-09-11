import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
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
      {onCake ? <>
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
