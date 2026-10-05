import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { creamMaterialProps } from '../src/designer/geometry/creamMaterial.js';
import { buildBrushStrokeOnWall } from '../src/designer/geometry/brushStrokeOnCake.js';
import { brushStroke } from '../src/designer/geometry/brushStroke.js';
import { buildPanelsGeometry } from '../src/designer/geometry/garnishPanel.js';
import { garnishMaterialProps } from '../src/designer/geometry/garnishMaterial.js';

/* ── Can a customer tell these apart? ────────────────────────────────────────────────────────────
 *
 * Sandeep: *"place cream brush stroke and a chocolate garnish brush side by side and give me
 * screenshot."* The two share a GESTURE and nothing else, and the only honest way to answer whether
 * they read differently is to put them on one cake under one light.
 *
 * ⚠️ WHAT THIS PAGE MEASURED, 2026-10-05: the chocolate piece has NO surface texture and cannot be
 * given any that reads. `brushStroke` generates striations and `buildPanelsGeometry` extrudes only
 * the outline, so they never reach 3D — and adding them does not help. Measured: subdividing the
 * front cap and displacing it works (444 verts to 4,179, relief half the panel's thickness, which is
 * physically right for a smear) and is INVISIBLE. Forced to seven times that depth it is barely
 * perceptible, and would make a 3 mm panel corrugated.
 *
 * The reason is deliberate and documented in garnishMaterial.js: a garnish has clearcoat, environment
 * and specular switched OFF so its colour stays the chocolate's colour, and that file says in as many
 * words that what remains *"is not here. It has to happen where the scene environment is applied."*
 * Shallow relief on a surface with no reflection has nothing to catch. Tested fairly — coloured white
 * chocolate rather than dark, and tilted into the key light — and it stays flat either way.
 *
 * So the 9x vertex cost was reverted rather than shipped. The striations go in the day the garnish
 * lighting question is answered, and not before.
 *
 * ⚠️ BOTH ARE THE REAL GENERATORS, NOT APPROXIMATIONS OF THEM. The chocolate piece is
 * `brushStroke` → `buildPanelsGeometry` → `garnishMaterialProps`, which is exactly what the garnish
 * studio saves and the cake renders; the cream one is `buildBrushStrokeOnWall` →
 * `creamMaterialProps`. A hand-rolled stand-in for either would be a picture of my own assumptions.
 */
const R = 1, TIER_H = 1.25, BOARD_R = 1.5, BOARD_H = 0.07;
/* ⚠️ COLOURED WHITE CHOCOLATE, NOT DARK. The studio's own note: *"coloured white chocolate spooned
   onto acetate"* — the brushstroke cakes are pastels. Comparing a near-black piece against a pink
   cream stroke stacks the deck: a dark surface shows almost no shading whatever its relief. */
const CHOC = +(new URLSearchParams(location.search).get('dark') ?? 0) ? '#5A3A22' : '#7FB5DE';
const CREAM = '#E8788F';

/* The chocolate piece: pulled flat on acetate, set, peeled, and STOOD UP leaning on the cake. */
function ChocolatePiece() {
  const geo = useMemo(() => {
    const spine = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      spine.push([120 + t * 18, 330 - t * 300]);         // studio pixels, y down
    }
    const br = brushStroke(spine, { width: 150, seed: 6 });
    // ⚠️ `{ geometry, size, bounds }`, not a bare geometry — it seats the piece on y = 0 for the
    //    caller, which is why it has to hand back where the bottom ended up.
    return br && buildPanelsGeometry([br.outline], { scale: 0.9 / 420 });
  }, []);
  if (!geo?.geometry) return null;
  /* ⚠️ WHERE A CHOCOLATE PIECE ACTUALLY GOES, which my first comparison got wrong and Sandeep said
     so: *"they still look mostly same."* Stood against the wall it is a coloured shape beside
     another coloured shape. A set, peeled piece is PUSHED INTO the cake top and stands proud of it —
     `garnishTransform`'s 'stand' mode — so it breaks the skyline, shows the cut edge of its own
     slab, and throws a shadow across the lid. That is the difference; placing it flat against the
     wall hid every bit of it. */
  return (
    <mesh geometry={geo.geometry} position={[-0.42, BOARD_H + TIER_H - 0.03, 0.18]}
      rotation={[-0.16, 0.5, 0.07]} castShadow receiveShadow>
      <meshPhysicalMaterial {...garnishMaterialProps({ medium: 'chocolate', gloss: 0.8, color: CHOC })} />
    </mesh>
  );
}

/* The cream stroke: painted ON the wall, wet, and left where it was pulled. */
function CreamStroke() {
  const geo = useMemo(() => {
    const path = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      path.push([0.055 + 0.012 * t, 0.10 + 0.62 * t + Math.sin(Math.PI * t) * 0.01]);
    }
    return buildBrushStrokeOnWall({ R, baseY: BOARD_H, wallH: TIER_H, path, width: 0.34, weight: 1, seed: 6 });
  }, []);
  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshPhysicalMaterial side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1}
        polygonOffsetUnits={-1} {...creamMaterialProps(0.7, CREAM)} />
    </mesh>
  );
}

function App() {
  return (
    <Canvas shadows camera={{ position: [-0.3, 1.9, 4.3], fov: 38 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
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
      <ChocolatePiece />
      <CreamStroke />
      <OrbitControls target={[0, BOARD_H + TIER_H * 0.72, 0]} enablePan={false} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')).render(<App />);
