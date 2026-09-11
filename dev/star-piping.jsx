import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { starStackWall } from '../src/designer/geometry/starStack.js';
import { frostingDef } from '../src/designer/frostings.js';

/* STAR PIPING, STACKED — a whole tier of it.
 *
 * The stroke `dev/one-stroke.html?stack=` shows on its own, repeated all the way round a cake.
 * Every number is a query parameter, so the thing can be judged and tuned in the browser instead of
 * through a round of edits:
 *
 *   ?n=        strokes round the tier        ?points=   points on the star
 *   ?t=        stroke radius                 ?depth=    how far the V cuts in
 *   ?notch=    the V's angular width         ?slabs=    flat stars in each stroke
 *   ?ao=       crease shading                ?wob= ?turn=  slab-to-slab size and twist
 *   ?cam=      camera height                 ?orbit=1   drag it round
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => Number(q.get(k) ?? d);
const R = 1.35, H = 1.5;
const t = num('t', 0.16);
const ropes = Math.max(1, Math.round(num('n', Math.round((Math.PI * 2 * (R - t)) / (2 * t * 0.75)))));

function creamMaterial() {
  const m = frostingDef('buttercream').material;
  return { roughness: m.roughness, metalness: 0, sheen: m.sheen, sheenRoughness: m.sheenRoughness,
           sheenColor: m.sheenColor, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness };
}

function Tier() {
  const geos = useMemo(() => starStackWall({
    radius: R, height: H, ropes, thickness: t,
    points: num('points', 8), depth: num('depth', 0.55), notch: num('notch', 1),
    slabs: Math.round(num('slabs', 160)), ao: num('ao', 0.8),
    wobble: num('wob', 0.012), turn: num('turn', 0.002),
  }), []);
  return (
    <group>
      {/* The cake, tangent to the strokes — they stand ON it. */}
      <mesh position={[0, -0.02, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R - 2 * t, R - 2 * t, H + 0.04, 96]} />
        <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
      </mesh>
      {/* The lid, out to where the cake's side is. */}
      <mesh position={[0, H / 2 + 0.02, 0]} castShadow>
        <cylinderGeometry args={[R - 2 * t, R - 2 * t, 0.04, 96]} />
        <meshPhysicalMaterial color="#F6EBD8" {...creamMaterial()} />
      </mesh>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshPhysicalMaterial color="#F6EBD8" flatShading vertexColors {...creamMaterial()} />
        </mesh>
      ))}
    </group>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#EFEAE3' }}>
    <Canvas camera={{ position: [0, num('cam', 1.7), num('dist', 6.4)], fov: num('fov', 30) }} shadows>
      <SceneEnv />
      <SceneLights shadows />
      <Tier />
      {q.get('orbit') === '1' && <OrbitControls />}
    </Canvas>
    <div style={{ position: 'absolute', left: 12, bottom: 10, font: '12px system-ui', color: '#2C4433', opacity: 0.75 }}>
      star piping (stacked) · {ropes} strokes × {num('points', 8)} points · ?n= ?t= ?points= ?depth= ?notch= ?slabs= ?ao= ?wob= ?turn= ?cam= ?orbit=1
    </div>
  </div>
);
