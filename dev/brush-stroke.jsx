import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { buildBrushStrokeOnWall, buildBrushStrokeOnFlat, paintBrushColors, brushGesture, makeBrushBed,
         BRUSH_ON_CAKE_DEFAULTS as D } from '../src/designer/geometry/brushStrokeOnCake.js';
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
/* ?gap — how far apart the strokes sit, in turns. Below the stroke's own width they OVERLAP, which
   is the thing to look at: a brushed cake is strokes laid across each other, not stripes. */
const GAP = +(P.get('gap') ?? 0.052);
/* ⚠️ THE DEFAULTS COME FROM THE GEOMETRY, NOT FROM A COPY HERE. Written as literals, this page kept
   serving the OLD lift after the real default was raised — so the render I was judging was the
   harness's opinion rather than the module's, which is the whole thing a harness must not do. */
const LIFT = +(P.get('lift') ?? D.lift);
const ACROSS = +(P.get('across') ?? D.across);
const SWEEP = +(P.get('sweep') ?? 0.012);
const CLIMB = +(P.get('climb') ?? 0.52);
/* The relief knobs, so a sweep varies the ONE thing it is asking about. Same rule as ?lift — read
   from the module when the URL is silent, never re-stated here. */
const RIDGE = +(P.get('ridge') ?? D.ridge);
const GRAIN = +(P.get('grain') ?? D.grain);
const LANES = +(P.get('lanes') ?? D.lanes);
const ROWS  = +(P.get('rows')  ?? D.rows);
const SEAM  = +(P.get('seam')  ?? D.seam);
const LIP   = +(P.get('lip')   ?? D.lip);
const SKON  = +(P.get('skirtOn') ?? D.skirtOn);
/* ?top=1 — the SAME stroke laid on the cake top instead of the wall. A cream stroke goes on both,
   hugging either, and buildBrushStrokeOnFlat had never been looked at. */
const TOP = P.has('top');
const COLORS = ['#F6DCE2', '#8EC5E8', '#F4C542', '#E8788F', '#B79CE0', '#3FAE8E'];

/* ⚠️ A BRUSHSTROKE ON A CAKE RUNS UP THE WALL, NOT ROUND IT. My first cut swept each stroke
   horizontally AND spaced them horizontally, so they fought for the same circumference and most of
   them ended up round the back. Every reference cake is the same: short vertical pulls, side by
   side, because that is the way a hand moves against a tier you are turning. */
const path = (at, seed) => brushGesture({ at, seed, sweep: SWEEP, climb: CLIMB });

/* On the top, the gesture is drawn in units of R from the axis rather than round-and-up. */
function topPath(k) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    // Deliberately past the rim at the far end, so the drape is what this page shows.
    out.push([-0.72 + 2.05 * t, -0.52 + k * 0.26 + Math.sin(Math.PI * t) * 0.07]);
  }
  return out;
}

const CAKE_COLOR = '#FBF8F3';

/* One bed for the whole wall: each stroke reads the cream already laid and rides on it, then stamps
   itself in for the next. Rebuilt whenever the set of strokes changes, so order stays honest. */
/* ?nobed — the CONTROL. Without it every stroke sits on the wall whatever is already there, so the
   one underneath comes back up through the one on top: thin slivers of the wrong colour running the
   length of the overlap, which is the artefact this whole mechanism exists to answer. Keep it
   reachable; a fix with no way to see the fault is a fix nobody can check. */
const BED = P.has('nobed') ? null : makeBrushBed({ R, wallH: TIER_H });

function Stroke({ at, weight, color, seed, idx }) {
  const geo = useMemo(() => (TOP
    ? buildBrushStrokeOnFlat({ R, y: BOARD_H + TIER_H, path: topPath(idx), width: WIDTH, weight, seed, lift: LIFT, across: ACROSS, layer: idx })
    : buildBrushStrokeOnWall({ R, baseY: BOARD_H, wallH: TIER_H, path: path(at, seed), width: WIDTH, weight, seed, lift: LIFT, across: ACROSS, ridge: RIDGE, grain: GRAIN, lanes: LANES, rows: ROWS, seam: SEAM, lip: LIP, skirtOn: SKON, bed: BED })
  ), [at, weight, seed, idx]);
  /* Thin where the knife ran dry, so the cake shows through — the thing the reference photo has and
     a flat colour never will. */
  useMemo(() => geo && paintBrushColors(geo, color, CAKE_COLOR), [geo, color]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      {/* DoubleSide because a painted layer's winding depends on which way the stroke happens to
          run — the same call CreamPen makes for cream. polygonOffset because the thinnest film sits
          almost on the wall, and over a long grazing sweep the depth buffer loses: the wall punches
          through in stripes, which is what "breaking at extreme sweep" was. */}
      <meshPhysicalMaterial side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1}
        polygonOffsetUnits={-1} {...creamMaterialProps(0.7, color)} color="#ffffff" vertexColors />
    </mesh>
  );
}

function App() {
  return (
    <Canvas shadows camera={{ position: TOP ? [2.6, 2.0, 2.6] : [0, 1.4, 4.0], fov: 38 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#eceaf3']} />
      {/* ⚠️ `shadows` IS NOT DECORATION HERE — RELIEF IS THE WHOLE SUBJECT OF THIS PAGE. SceneLights
          defaults it OFF and the live designer mounts `<SceneLights shadows />`, so every brushstroke
          render judged on this page had been lit unlike the cake it authors for (INVARIANTS #17).
          It is not what made the strokes read flat, but a page about height that throws away the
          cue for height has no business being the one we decide on. */}
      {/* ⚠️ AND A SHADOW CANNOT CARRY THE SEAM, WHICH IS WORTH KNOWING BEFORE REACHING FOR ONE. A
          probe key light with a 4-pixel-per-millimetre shadow camera — a 4096 map over a 4-unit
          frustum against three's default 512 over ten — made no visible difference at an overlap.
          SceneLights' key is nearly overhead, so what a stroke standing off its neighbour casts, it
          casts onto itself. The step has to be read from SHADING, which is why the fix was the
          stroke's own edge having a height rather than anything in the rig. */}
      <SceneLights shadows />
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
        <Stroke key={i} idx={i} at={(i - (WEIGHTS.length - 1) / 2) * GAP} weight={w} color={COLORS[i % COLORS.length]} seed={SEED + i * 7} />
      ))}
      <OrbitControls target={[0, BOARD_H + TIER_H * 0.5, 0]} enablePan={false} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')).render(<App />);
