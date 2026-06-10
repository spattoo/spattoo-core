import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { buildPipingStroke, buildPipingHeap } from '../geometry/creamPen.js';
import { creamMaterialProps } from './CakeTier.jsx';
import StampStroke from './StampStroke.jsx';

// ── Cream Pen calibrator ─────────────────────────────────────────────────────
// A small live preview inside the pen popup so you can dial the nozzle / thickness /
// softness / heap-height BEFORE drawing on the cake. Renders the exact same geometry the
// pen produces: a star HEAP (tap output) on the left and a short ROPE (drag output) on the
// right, on a neutral board, slowly turning so the 3D ribs read. The board colour is a
// stand-in; the cream uses your chosen colour.

const BOARD_COLOR = '#ece4db';

// Reposition the camera whenever the rope diameter changes so the samples stay framed at
// any thickness (the geometry scales with thickness, so a fixed camera would clip or shrink).
function CamRig({ dist, targetY }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(dist * 0.34, targetY + dist * 0.52, dist * 0.80);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
  }, [dist, targetY, camera]);
  return null;
}

function Spin({ children, speed = 0.35 }) {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * speed; });
  return <group ref={ref}>{children}</group>;
}

// Stamp preview: one stamp (tap) on the left, a short tiled row (drag) on the right.
function StampSamples({ url, thickness, softness, color, spacing }) {
  const dia = 2 * thickness;
  const spread = Math.max(dia * 1.9, 0.09);
  const L = Math.max(dia * 2.6, 0.14);
  const tap = useMemo(() => ({ kind: 'stamp', point: [0, 0, 0], normal: [0, 1, 0], thickness, seed: 1 }), [thickness]);
  const rope = useMemo(() => ({
    kind: 'stamprope', normal: [0, 1, 0], thickness, spacing, seed: 2,
    points: Array.from({ length: 9 }, (_, i) => [0, thickness, ((i / 8) - 0.5) * 2 * L]),
  }), [thickness, spacing, L]);
  return (
    <Suspense fallback={null}>
      <group position={[-spread, 0, 0]}><StampStroke stroke={tap} url={url} color={color} softness={softness} /></group>
      <group position={[spread, 0, 0]}><StampStroke stroke={rope} url={url} color={color} softness={softness} /></group>
    </Suspense>
  );
}

function Samples({ nozzle, thickness, softness, color, heapHeight }) {
  const dia = 2 * thickness;
  const heapGeo = useMemo(
    () => buildPipingHeap([0, 0, 0], [0, 1, 0], nozzle, thickness, heapHeight),
    [nozzle, thickness, heapHeight],
  );
  // A short, gently curved rope centred on the origin, seated one radius above the board.
  const ropeGeo = useMemo(() => {
    const L = Math.max(dia * 3.2, 0.16);
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [0, thickness, (t - 0.5) * 2 * L];
    });
    return buildPipingStroke(pts, nozzle, thickness);
  }, [nozzle, thickness, dia]);
  const mat = creamMaterialProps(softness, color);
  const spread = Math.max(dia * 1.7, 0.085);
  return (
    <>
      {heapGeo && (
        <mesh geometry={heapGeo} position={[-spread, 0, 0]} castShadow>
          <meshPhysicalMaterial side={THREE.DoubleSide} {...mat} />
        </mesh>
      )}
      {ropeGeo && (
        <mesh geometry={ropeGeo} position={[spread, 0, 0]} castShadow>
          <meshPhysicalMaterial side={THREE.DoubleSide} {...mat} />
        </mesh>
      )}
    </>
  );
}

export default function CreamPenCalibrator({ nozzle, thickness, softness, color, heapHeight, stampUrl, spacing, height = 150 }) {
  const dia = 2 * thickness;
  const dist = Math.max(dia * 9, 0.34);
  const targetY = dia * 0.45;
  const boardR = Math.max(dia * 3.4, 0.16);
  return (
    <div style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#faf6f2', border: '1px solid #f0dce3' }}>
      <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [0, 1, 1] }} style={{ width: '100%', height: '100%' }}>
        <CamRig dist={dist} targetY={targetY} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 9, 6]} intensity={1.3} />
        <directionalLight position={[-3, 3, -3]} intensity={0.4} />
        <Suspense fallback={null}>
          <Environment preset="apartment" />
          <mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[boardR, 48]} />
            <meshStandardMaterial color={BOARD_COLOR} roughness={0.6} metalness={0.05} />
          </mesh>
          <Spin>
            {stampUrl
              ? <StampSamples url={stampUrl} thickness={thickness} softness={softness} color={color} spacing={spacing} />
              : <Samples nozzle={nozzle} thickness={thickness} softness={softness} color={color} heapHeight={heapHeight} />}
          </Spin>
        </Suspense>
      </Canvas>
    </div>
  );
}
