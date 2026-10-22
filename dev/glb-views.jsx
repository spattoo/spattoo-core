import { createRoot } from 'react-dom/client';
import './scene.js';
import { Canvas } from '@react-three/fiber';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';

/* ── ONE DECORATION, THE ANGLES A MAKER WOULD NEED ──────────────────────────────────────────────
 *
 * The build guide is generated from ONE flat-on thumbnail. decorationPolicy.js already admits what
 * that costs — "they are barely visible from the one angle we send" — and the mermaid tail is the
 * case that makes it obvious: its whole character is a set of ridges radiating from the base, and
 * head-on under even light they are nearly invisible. The model then writes "press lines for a
 * textured look", because that is genuinely all the picture shows it.
 *
 * ⚠️ THE RELIEF IS IN THE ASSET. This is a GLB; the folds are geometry. A three-quarter view shows
 * ridges that vanish head-on, and a grazing one shows how deep they cut. Nothing is invented — this
 * only photographs what we already own.
 *
 * ⚠️ AND IT DID NOT FIX THE GUIDE, which is why this page is a viewer rather than a pipeline. The
 * obvious diagnosis was that the model cannot SEE the folds, so these three views were generated
 * and sent to the build-guide prompt instead of the one thumbnail. Over four runs each that moved a
 * ridge-forming step from 2/4 to 3/4 and made the measurable numbers slightly WORSE — inside the
 * noise, for a change that would have cost a capture surface in admin and new plumbing through the
 * API. What fixed it was asking the prompt for a count, a direction and a depth (api
 * build-guide-v5). The pictures were never the bottleneck. Kept because "what does this GLB
 * actually look like, from angles the thumbnail does not show" is a question worth being able to
 * ask about any element.
 *
 * ⚠️ THE PRODUCTION RIG, AND ONLY THE CAMERA MOVES. The first cut of this page built its own lamps
 * — a hard key almost parallel to the surface, which is the textbook way to read relief — and
 * `check:harness-scene` refused it. That gate is right and its reasoning applies here: a page that
 * invents a rig is a page whose conclusions do not transfer to the product, and "it only renders
 * one element" is the exemption it explicitly rules out. It constrains the LIGHTS and the
 * ENVIRONMENT, not the viewpoint — so the question this page asks is whether a three-quarter and a
 * grazing camera reveal the folds under the light every cake is already lit by. If they do, a
 * bespoke rig was never needed. If they do not, that is evidence for building this where a capture
 * surface belongs (admin, beside the GLB thumbnail capture) rather than for weakening a gate.
 *
 *   ?url=    the GLB
 *   ?view=   front | raking | grazing      (one per capture, so each is a clean square)
 *   ?bg=     background (default white — the model is told to ignore it)
 */
const q = new URLSearchParams(location.search);
const URL_ = q.get('url') || '/cdn/elements/files/3D/53464a8c-4284-4e81-ab1a-5ca05a27f367.glb';
const VIEW = q.get('view') || 'front';

// camera position (unit sphere, scaled later) and the key light's direction.
const VIEWS = {
  front:   [0, 0, 1],            // what we send today: flat on
  raking:  [0.45, 0.75, 0.9],    // three-quarter from above — ridges catch the key across their length
  grazing: [0.92, 0.12, 0.42],   // low and across, so fold DEPTH reads as silhouette, not shading
};

function Model() {
  const { scene } = useGLTF(URL_);
  const { obj, s, c } = useMemo(() => {
    const o = scene.clone(true);
    o.updateMatrixWorld(true);
    // Plain matte white: colour is a distraction in a shape reference, and a mid grey under a
    // raking light is the classic way to read a surface.
    o.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: '#dcdcdc', roughness: 0.85, metalness: 0 }); });
    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3(); box.getSize(size);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    const k = 1 / Math.max(size.x, size.y, size.z, 1e-4);
    return { obj: o, s: k, c: [-ctr.x * k, -ctr.y * k, -ctr.z * k] };
  }, [scene]);
  return <group position={c} scale={s}><primitive object={obj} /></group>;
}

const cam = VIEWS[VIEW] ?? VIEWS.front;
createRoot(document.getElementById('root')).render(
  <div style={{ position: 'fixed', inset: 0, background: q.get('bg') || '#ffffff' }}>
    <Canvas camera={{ position: cam.map(n => n * 2.1), fov: 32 }}
            gl={{ preserveDrawingBuffer: true }}>
      <SceneEnv />
      <SceneLights />
      <Suspense fallback={null}><Model /></Suspense>
    </Canvas>
  </div>,
);
