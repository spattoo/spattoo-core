import { createRoot } from 'react-dom/client';
import { useMemo, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './scene.js';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { buildTopCavity, CAVITY_DEFAULTS } from '../src/designer/geometry/topCavity.js';

/* ── A dished cake top with a raised cream lip ───────────────────────────────────────────────────
 *
 * Sandeep, with two reference photographs: *"top edge of the cake has a cavity. there is cream
 * elevation at the edges... for a existing cake shape, baker would choose that top cavity, then it
 * should build that cavity with same cream color."*
 *
 * ⚠️ THE QUESTION THE PICTURE HAS TO ANSWER is whether it reads as CREAM SCRAPED UP or as an edge
 * cut away. The profile has a crest with a fall on both sides for exactly that reason, and whether
 * the numbers behind it are right is not something a test can say.
 *
 * ⚠️ AND IT IS THE SAME COLOUR AS THE TIER, WHICH IS NOT A DETAIL. This is not a decoration sitting
 * on a cake; it is the cake's own cream, pushed about. One material, taken from the tier, or the
 * ring reads as a separate object balanced on the rim.
 *
 *   /top-cavity.html                     a round tier, the defaults
 *   /top-cavity.html?shape=rect          a sheet cake — the same ring, walked round a rectangle
 *   /top-cavity.html?lip=0&dish=0.05     dish only: does the edge still read?
 *   /top-cavity.html?dish=0&lip=0.09     lip only: a bowl rim with a flat floor
 *   /top-cavity.html?crest=0.6           the ridge pushed inward, away from the very edge
 *   /top-cavity.html?off=1               no cavity at all, the control case
 *   /top-cavity.html?wobble=0            the machined torus this started as — the control for the
 *                                        thing that matters most, and the one to keep looking at
 *   /top-cavity.html?swells=6            fewer, slower passes of the scraper
 *   /top-cavity.html?seed=3              a different cake with the same settings
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const HEIGHT = 1.0;
const SHAPE = q.get('shape') === 'rect'
  ? { kind: 'rect', halfW: 1.25, halfD: 0.85, cornerR: 0.22 }
  : { kind: 'round', radius: 1.1 };

/* The cake's own cream. One colour for the tier and the cavity — see above. */
const CREAM = q.get('cream') ?? '#b9c8e8';

function Tier() {
  const cfg = {
    lip:   num('lip',   CAVITY_DEFAULTS.lip),
    dish:  num('dish',  CAVITY_DEFAULTS.dish),
    width: num('width', CAVITY_DEFAULTS.width),
    crest: num('crest', CAVITY_DEFAULTS.crest),
    wobble: num('wobble', CAVITY_DEFAULTS.wobble),
    swells: num('swells', CAVITY_DEFAULTS.swells),
    seed:   num('seed',   CAVITY_DEFAULTS.seed),
  };
  const cavity = useMemo(
    () => (q.get('off') === '1' ? null : buildTopCavity(SHAPE, HEIGHT, cfg)),
    [cfg.lip, cfg.dish, cfg.width, cfg.crest, cfg.wobble, cfg.swells, cfg.seed],
  );
  useEffect(() => () => cavity?.dispose(), [cavity]);

  const body = useMemo(() => (SHAPE.kind === 'rect'
    ? new THREE.BoxGeometry(SHAPE.halfW * 2, HEIGHT, SHAPE.halfD * 2).translate(0, HEIGHT / 2, 0)
    : new THREE.CylinderGeometry(SHAPE.radius, SHAPE.radius, HEIGHT, 160).translate(0, HEIGHT / 2, 0)), []);

  /* ⚠️ ONE MATERIAL DESCRIPTOR, TWO MESHES. Two `meshStandardMaterial` tags with the same props are
     two materials, and they drift the moment either is tuned — which is the whole failure mode this
     is meant to avoid, a ring that reads as a separate object. */
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.82, metalness: 0 }), []);

  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      {cavity && <mesh geometry={cavity} material={mat} position={[0, HEIGHT, 0]} castShadow receiveShadow />}
    </group>
  );
}

function App() {
  /* ⚠️ LOOKING DOWN, because the subject is the TOP. The first camera here sat at eye level and
     photographed the wall: the ridge showed as a hairline against the sky and the dish not at all,
     which is a picture of the wrong thing. `?cam=` sweeps the height — a dished top reads
     differently from every angle and one of them is the one a customer sees.

     (Written as a JSX comment inside `return (`, which is not a thing: a {} container has to sit
     inside an element. Vite said so in one line and the page served a 500 until it moved here.) */
  return (
    <Canvas shadows camera={{ position: [0, num('cam', 2.5), num('dist', 3.3)], fov: 32 }} style={{ height: '100%' }}>
      <SceneLights />
      <SceneEnv />
      <Tier />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#efe9e2" roughness={1} />
      </mesh>
      <OrbitControls target={[0, 0.7, 0]} />
    </Canvas>
  );
}

createRoot(document.getElementById('root')).render(<App />);
