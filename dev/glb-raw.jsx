/* ── A GLB on its own, with NOTHING of the designer around it ────────────────────────────────────
 *
 * `glb-raw.html?glb=/_debug.glb`
 *
 * The question this answers is "is the ASSET wrong, or is it wrong once we put it on a cake?" —
 * and nothing else in dev/ can answer it. Every other harness renders through the designer: fit
 * scaling, seating, placement modes, material overrides from placement_config, the scene's own
 * lights and env map. That is the right default, and it is useless here, because it cannot tell a
 * broken model from a model we broke.
 *
 * So: a GLTFLoader and the model's own materials. No StickerModel, no fit scaling to a tier, no
 * finish override from placement_config, no seating and no placement mode. If it looks wrong HERE
 * the file is wrong.
 *
 * ⚠️ THE LIGHT IS THE PRODUCT'S, and that is not a contradiction. `SceneLights` / `SceneEnv` are
 * what a deployed cake mounts, and a page that lit its subject some other way could not be put
 * beside a cake render and compared — the topper's glare hid for weeks on two harnesses that each
 * built their own rig. What this page strips is the designer's GEOMETRY handling, not its light.
 *
 * ⚠️ IT SHOWS BOTH SIDES AND THE WIREFRAME ON REQUEST. `?side=front` forces single-sided rendering,
 * which is how you tell "the panel is missing" from "the panel faces the other way"; `?wire=1`
 * draws the edges, which is how you tell "collapsed to nothing" from "there but unlit".
 */
import { createRoot } from 'react-dom/client';
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { SceneLights, SceneEnv } from '../src/index.js';
import './scene.js';

const P = new URLSearchParams(location.search);
const SRC  = P.get('glb') || '/sample-rosette.glb';
const SIDE = P.get('side') || 'double';
const WIRE = P.get('wire') === '1';

function Model() {
  const { scene } = useGLTF(SRC);
  const prepared = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3(); box.getSize(size);
    const c = new THREE.Vector3(); box.getCenter(c);
    s.position.sub(c);
    const k = 2 / Math.max(size.x, size.y, size.z, 1e-6);
    s.scale.setScalar(k);
    s.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        /* Only the thing being asked about — never a fresh material, or this page would be
           answering a question about ITS materials rather than the file's. */
        if (SIDE === 'front') m.side = THREE.FrontSide;
        if (SIDE === 'back')  m.side = THREE.BackSide;
        m.wireframe = WIRE;
        m.needsUpdate = true;
      });
    });
    /* The same probe the designer exposes (`__sceneMaterials`), so the two can be compared on
       identical terms rather than by eye. A triangle count that differs between a plain load and
       the designer's is the difference being looked for. */
    if (typeof window !== 'undefined') {
      /* ⚠️ WHERE A MODEL NARROWS, which is how you find the part a decoration should be ANCHORED
         by. A satin bow is loops over a knot over tails: the knot is the narrowest slice between
         them, and it is the point that actually touches the cake. Reading it off the mesh beats
         authoring a number per row, and it is unreachable from a script any other way — the GLB is
         Draco-compressed, so there is nothing to measure until a loader has decoded it. */
      window.__rawProfile = (bins = 24) => {
        const out = [];
        s.traverse(o => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          let lo = Infinity, hi = -Infinity;
          for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
          const H = hi - lo || 1;
          const w = Array.from({ length: bins }, () => ({ min: Infinity, max: -Infinity, n: 0 }));
          for (let i = 0; i < pos.count; i++) {
            const k = Math.min(bins - 1, Math.floor(((pos.getY(i) - lo) / H) * bins));
            const x = pos.getX(i), b = w[k];
            if (x < b.min) b.min = x; if (x > b.max) b.max = x; b.n++;
          }
          out.push({ name: o.name || '(unnamed)', lo, hi,
            slices: w.map((b, k) => ({ f: +(((k + 0.5) / bins)).toFixed(3),
                                       width: b.n ? +(b.max - b.min).toFixed(4) : 0 })) });
        });
        return out;
      };
      window.__rawMeshes = () => {
        const out = [];
        s.traverse(o => {
          if (!o.isMesh) return;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          out.push({ name: o.name || '(unnamed)', tris: o.geometry?.index ? o.geometry.index.count / 3 : null,
                     side: m.side, transparent: m.transparent, vertexColors: m.vertexColors });
        });
        return out;
      };
    }
    return s;
  }, [scene]);
  return <primitive object={prepared} />;
}

createRoot(document.getElementById('root')).render(
  <div style={{ position: 'fixed', inset: 0, background: '#f2f0ee' }}>
    <div style={{ position: 'absolute', zIndex: 2, left: 12, top: 10, font: "12px/1.5 system-ui", color: '#555' }}>
      {SRC} · side={SIDE}{WIRE ? ' · wireframe' : ''}
    </div>
    <Canvas camera={{ position: [2.2, 1.6, 2.6], fov: 40 }} gl={{ preserveDrawingBuffer: true }}>
      <SceneLights shadows />
      <SceneEnv />
      <Suspense fallback={null}><Model /></Suspense>
      <Grid args={[8, 8]} cellColor="#d8d2cb" sectionColor="#c6bfb6" position={[0, -1.05, 0]} fadeDistance={14} />
      <OrbitControls />
    </Canvas>
  </div>,
);
