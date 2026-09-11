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
const t = num('t', 0.14);
/* ⚠️ SPACED CLOSER THAN THEIR OWN WIDTH, or the cake shows between them. A star's strokes touch
 * only at their points, so butted exactly they leave a deep V open all the way to the body — which
 * is the gap you can see straight through in the first render of this page. `?lap=` is how much
 * closer than their width they are laid; 0.3 closes it. */
const lap = num('lap', 0.8);
const ropes = Math.max(1, Math.round(num('n', (Math.PI * 2 * (R - t)) / (2 * t / (1 + lap)))));

function creamMaterial() {
  const m = frostingDef('buttercream').material;
  return { roughness: m.roughness, metalness: 0, sheen: m.sheen, sheenRoughness: m.sheenRoughness,
           sheenColor: m.sheenColor, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness };
}

function Tier() {
  const geos = useMemo(() => starStackWall({
    radius: R, height: H - 2 * t, ropes, thickness: t,
    points: num('points', 8), depth: num('depth', 0.55), notch: num('notch', 1),
    slabs: Math.round(num('slabs', 160)), ao: num('ao', 0.8),
    wobble: num('wob', 0.012), turn: num('turn', 0.002),
  }), []);
  /* ⚠️ THE LID REACHES THE CREST AND THE STROKES END UNDER IT. A stroke stops at the rim and shows
   * the tip's own section upward, so left proud it rings the tier with sharp star points — a crown
   * no cake has, and the loudest difference from the photograph. The strokes are shortened by a
   * diameter and dropped, so their ends finish beneath the top. */
  const lid = R - t * 0.55;   // just inside the crest: covers the ends, does not overhang them
  return (
    <group>
      {/* The cake, tangent to the strokes — they stand ON it. */}
      <mesh position={[0, -0.02, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R - 2 * t, R - 2 * t, H + 0.04, 96]} />
        <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
      </mesh>
      <group position={[0, -t, 0]}>
        {geos.map((g, i) => (
          <mesh key={i} geometry={g} castShadow receiveShadow>
            <meshPhysicalMaterial color="#F6EBD8" flatShading vertexColors {...creamMaterial()} />
          </mesh>
        ))}
      </group>
      {/* The top: out to the crest, so it covers the strokes' ends rather than sitting inside them. */}
      <mesh position={[0, H / 2 - t * 0.6, 0]} castShadow>
        <cylinderGeometry args={[lid, lid, t * 0.5, 96]} />
        <meshPhysicalMaterial color="#F6EBD8" {...creamMaterial()} />
      </mesh>
    </group>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#EFEAE3' }}>
    <Canvas camera={{ position: [0, num('cam', 1.7), num('dist', 6.4)], fov: num('fov', 30) }} shadows>
      <SceneEnv />
      <SceneLights shadows />
      <Tier />
      {/* Drag to turn it, scroll to zoom. On by default — a page for judging a shape is not
          worth opening if you cannot walk round it. `?orbit=0` pins the camera for a screenshot. */}
      {q.get('orbit') !== '0' && <OrbitControls enablePan={false} minDistance={2.2} maxDistance={12} />}
    </Canvas>
    <div style={{ position: 'absolute', left: 12, bottom: 10, font: '12px system-ui', color: '#2C4433', opacity: 0.75 }}>
      star piping (stacked) · {ropes} strokes × {num('points', 8)} points · ?n= ?t= ?points= ?depth= ?notch= ?slabs= ?ao= ?wob= ?turn= ?cam= · drag to turn, scroll to zoom
    </div>
  </div>
);
