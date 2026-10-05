import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { buildBrushStrokeOnWall, BRUSH_ON_CAKE_DEFAULTS as D } from '../src/designer/geometry/brushStrokeOnCake.js';
// Both live in CakeCanvas — they ARE what production mounts, which is the whole point of using them.
// creamMaterialProps is THE cream material — the one every piped stroke on every cake already
// uses, with the calibrated albedo and the sheen. A brushstroke is buttercream; it asks the same
// function rather than inventing a second opinion about what cream looks like.
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { creamMaterialProps } from '../src/designer/geometry/creamMaterial.js';

/* ── Brushstrokes painted on a cake wall ─────────────────────────────────────────────────────────
 *
 * The tight loop for the studio of the same name in admin — same geometry, imported, never copied.
 * This page exists to answer one question a slider cannot: does WEIGHT read as a thicker knife, or
 * just as a taller bump? So it shows a row of strokes at rising weight, side by side on one cake,
 * which is the only way to see where "merges with the surface" turns into "stands proud".
 *
 * ?weights=0,0.25,0.5,0.75,1  · ?width=0.3 · ?seed=1
 * Lit by SceneLights/SceneEnv — the designer's own rig, because relief judged under other lights is
 * the wrong relief and relief is the entire subject.
 */
const P = new URLSearchParams(location.search);
const R = 1, TIER_H = 1.25, BOARD_R = 1.5, BOARD_H = 0.07;
const WEIGHTS = (P.get('weights') ?? '0,0.25,0.5,0.75,1').split(',').map(Number);
const WIDTH = +(P.get('width') ?? D.width);
const SEED = +(P.get('seed') ?? 1);
/* ⚠️ THE DEFAULTS COME FROM THE GEOMETRY, NOT FROM A COPY HERE. Written as literals, this page kept
   serving the OLD lift after the real default was raised — so the render I was judging was the
   harness's opinion rather than the module's, which is the whole thing a harness must not do. */
const LIFT = +(P.get('lift') ?? D.lift);
const ACROSS = +(P.get('across') ?? D.across);
const COLORS = ['#F6DCE2', '#8EC5E8', '#F4C542', '#E8788F', '#B79CE0', '#3FAE8E'];

/* ⚠️ A BRUSHSTROKE ON A CAKE RUNS UP THE WALL, NOT ROUND IT. My first cut swept each stroke
   horizontally AND spaced them horizontally, so they fought for the same circumference and most of
   them ended up round the back. Every reference cake is the same: short vertical pulls, side by
   side, because that is the way a hand moves against a tier you are turning. */
function path(at) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    out.push([at + 0.012 * t, 0.16 + 0.52 * t + Math.sin(Math.PI * t) * 0.01]);
  }
  return out;
}

function Stroke({ at, weight, color, seed }) {
  const geo = useMemo(() => buildBrushStrokeOnWall({
    R, baseY: BOARD_H, wallH: TIER_H, path: path(at), width: WIDTH, weight, seed, lift: LIFT, across: ACROSS,
  }), [at, weight, seed]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshPhysicalMaterial {...creamMaterialProps(0.7, color)} />
    </mesh>
  );
}

function App() {
  return (
    <Canvas shadows camera={{ position: [0, 1.4, 4.0], fov: 38 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#eceaf3']} />
      <SceneLights />
      <SceneEnv />
      <mesh position={[0, BOARD_H / 2, 0]} receiveShadow>
        <cylinderGeometry args={[BOARD_R, BOARD_R, BOARD_H, 64]} />
        <meshStandardMaterial color="#EDE7DA" roughness={0.85} />
      </mesh>
      <mesh position={[0, BOARD_H + TIER_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, TIER_H, 96]} />
        <meshStandardMaterial color="#FBF8F3" roughness={0.75} />
      </mesh>
      {WEIGHTS.map((w, i) => (
        <Stroke key={i} at={(i - (WEIGHTS.length - 1) / 2) * 0.052} weight={w} color={COLORS[i % COLORS.length]} seed={SEED + i * 7} />
      ))}
      <OrbitControls target={[0, BOARD_H + TIER_H * 0.5, 0]} enablePan={false} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')).render(<App />);
