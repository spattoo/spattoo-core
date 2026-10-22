import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import StampStroke from '../src/designer/canvas/StampStroke.jsx';
import { useGLTF } from '@react-three/drei';
import { creamMaterialProps } from '../src/designer/geometry/creamMaterial.js';
import { extractGeo } from '../src/designer/canvas/shellGeo.js';
import * as THREE from 'three';

/* ── ONE STAMP, EVERY SURFACE NORMAL ────────────────────────────────────────────────────────────
 *
 * Reported on a cricket-… no, on a rosette: hand-piping a shape onto the SIDE WALL draws something
 * with an extra slab on it, while the same shape ringed round a rim or piped on the top is clean.
 * `stampTransforms` builds its whole basis from `stroke.normal`, so the side wall differs from the
 * top by exactly that one vector — and nothing else in the pen's path changes.
 *
 * So: the same GLB, the same stroke, the same scale, drawn once per normal. Top-surface up first,
 * then four horizontal normals (the side wall from each direction), then two in between. If the
 * fault tracks the normal it shows up as a row; if it does not, the normal is innocent and the
 * difference is somewhere else in the pen.
 *
 *   ?url=    the GLB to stamp (defaults to the catalogue's Rosette)
 *   ?rope=1  draw a short stamprope instead of a single stamp
 *   ?t=      rope thickness (the stamp is sized from it)
 */
const q = new URLSearchParams(location.search);
const URL_ = q.get('url') || '/cdn/elements/files/3D/ac2b157c-7af5-4df6-8ea0-10e2c48ae487.glb';
const t = Number(q.get('t') ?? 0.07);
const ROPE = q.get('rope') === '1';

const CASES = [
  ['top  [0,1,0]',    [0, 1, 0]],
  ['side [0,0,1]',    [0, 0, 1]],
  ['side [1,0,0]',    [1, 0, 0]],
  ['side [0,0,-1]',   [0, 0, -1]],
  ['side [-1,0,0]',   [-1, 0, 0]],
  ['45°  [0,.7,.7]',  [0, 0.707, 0.707]],
  ['down [0,-1,0]',   [0, -1, 0]],
];

function One({ normal, x }) {
  const stroke = ROPE
    ? { kind: 'stamprope', normal, thickness: t, spacing: 0.85, seed: 2,
        points: Array.from({ length: 5 }, (_, i) => [x, t, ((i / 4) - 0.5) * 0.25]) }
    : { kind: 'stamp', point: [x, 0, 0], normal, thickness: t, seed: 1 };
  return <StampStroke stroke={stroke} url={URL_} color="#ffffff" softness={0.5} />;
}

/* ── The SAME GLB, three ways ──────────────────────────────────────────────────────────────────
 * RAW      what the loader delivers, drawn through its own node transforms — nothing cloned,
 *          nothing written to. This is the shape the GLB actually contains.
 * EXTRACT  what extractGeo() hands the ring AND the pen: a CLONE of the first mesh's geometry,
 *          with a rotation and a translation written through it per vertex.
 * STAMP    the pen's full output, which is EXTRACT placed by stampTransforms.
 *
 * A meshopt GLB delivers interleaved, normalised attributes — festoon.js's bakeStrip says in its
 * own comment that cloning those and writing to the clone scrambles the geometry. If that is what
 * is happening, RAW is clean and EXTRACT is not, and the normal never came into it. */
function Raw({ x }) {
  const { scene } = useGLTF(URL_);
  /* ⚠️ FRAMED FROM ITS OWN BOX, not a guessed scale. This GLB's units are the Sketchfab ones — node
     1 alone carries a 0.01 scale — so any fixed number either fills the screen or vanishes. Box3
     .setFromObject walks the node transforms, which is the whole point of this panel: it is the
     shape the loader delivers, with nothing cloned and nothing written to. */
  const { obj, s, c } = useMemo(() => {
    const o = scene.clone(true);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3(); box.getSize(size);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    const k = 0.18 / Math.max(size.y, 1e-4);
    return { obj: o, s: k, c: [-ctr.x * k, -box.min.y * k, -ctr.z * k] };
  }, [scene]);
  return <group position={[x + c[0], c[1], c[2]]} scale={s}><primitive object={obj} /></group>;
}

function Extracted({ x }) {
  const { scene } = useGLTF(URL_);
  const geo = extractGeo(scene)?.geo;
  if (!geo) return null;
  const size = new THREE.Vector3();
  geo.computeBoundingBox(); geo.boundingBox.getSize(size);
  const s = 0.18 / Math.max(size.y, 1e-4);
  return (
    <mesh geometry={geo} position={[x, 0, 0]} scale={s}>
      <meshPhysicalMaterial {...creamMaterialProps(0.5, '#ffffff')} />
    </mesh>
  );
}

if (q.get('compare') === '1') {
  createRoot(document.getElementById('root')).render(
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas camera={{ position: [0, 0.22, 0.75], fov: 40 }} shadows>
        <SceneEnv />
        <SceneLights />
        <Suspense fallback={null}>
          <Raw x={-0.22} />
          <Extracted x={0} />
          <group position={[0.22, 0, 0]}>
            <StampStroke stroke={{ kind:'stamp', point:[0,0,0], normal:[0,1,0], thickness:t, seed:1 }}
              url={URL_} color="#ffffff" softness={0.5} />
          </group>
        </Suspense>
        <OrbitControls />
      </Canvas>
      <div style={{ position:'absolute', left:0, right:0, bottom:8, display:'flex',
                    font:'12px system-ui', color:'#333', textAlign:'center' }}>
        <div style={{flex:1}}>RAW — as the GLB contains it</div>
        <div style={{flex:1}}>extractGeo() — ring AND pen</div>
        <div style={{flex:1}}>StampStroke — the pen</div>
      </div>
    </div>,
  );
} else createRoot(document.getElementById('root')).render(
  <div style={{ position: 'fixed', inset: 0 }}>
    <Canvas camera={{ position: [0, 0.45, 1.25], fov: 40 }} shadows>
      <SceneEnv />
      <SceneLights />
      <Suspense fallback={null}>
        {CASES.map(([, n], i) => <One key={i} normal={n} x={(i - (CASES.length - 1) / 2) * 0.26} />)}
      </Suspense>
      <OrbitControls />
    </Canvas>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex',
                  font: '11px system-ui', color: '#333', textAlign: 'center' }}>
      {CASES.map(([label], i) => <div key={i} style={{ flex: 1 }}>{label}</div>)}
    </div>
  </div>,
);
