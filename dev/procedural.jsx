import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─── Arch curve: straight legs + semicircular top ───────────────────────────
// Path goes: right leg (up) → semicircle (top) → left leg (down)
// Bottom of legs sits at y=0; arch top at y = legH + radius.
class RainbowArcCurve extends THREE.Curve {
  constructor(radius, legHeight) {
    super();
    this.radius    = radius;
    this.legHeight = legHeight;
  }
  getPoint(t, out = new THREE.Vector3()) {
    const r = this.radius, lh = this.legHeight;
    const arcLen   = Math.PI * r;
    const total    = 2 * lh + arcLen;
    const t1 = lh / total;           // end of right leg
    const t2 = (lh + arcLen) / total; // end of arc

    if (t <= t1) {
      // Straight right leg — goes from (r, 0) up to (r, lh)
      const s = t / t1;
      return out.set(r, lh * s, 0);
    } else if (t <= t2) {
      // Semicircular arc — (r, lh) → top → (-r, lh)
      const angle = Math.PI * ((t - t1) / (t2 - t1));
      return out.set(r * Math.cos(angle), lh + r * Math.sin(angle), 0);
    } else {
      // Straight left leg — goes from (-r, lh) down to (-r, 0)
      const s = (t - t2) / (1 - t2);
      return out.set(-r, lh * (1 - s), 0);
    }
  }
}

// ─── Rainbow parameters ──────────────────────────────────────────────────────
const TUBE_R  = 0.057;
const LEG_H   = 0.30;   // height of the straight vertical section

const BANDS = [
  { color: '#9050C8', r: 0.20 }, // purple  (innermost)
  { color: '#2AAAE0', r: 0.32 }, // blue
  { color: '#30C030', r: 0.44 }, // green
  { color: '#FFE000', r: 0.56 }, // yellow
  { color: '#FF8800', r: 0.68 }, // orange
  { color: '#EE2020', r: 0.80 }, // red     (outermost)
];

// ─── Cloud via ExtrudeGeometry ───────────────────────────────────────────────
function buildCloudShape(bumps) {
  const sorted = [...bumps].sort((a, b) => a.x - b.x);
  const s = new THREE.Shape();
  const left  = sorted[0].x  - sorted[0].r;
  const right = sorted[sorted.length - 1].x + sorted[sorted.length - 1].r;

  // Flat bottom
  s.moveTo(left, -0.04);
  s.lineTo(right, -0.04);
  s.lineTo(right, 0);

  // Smooth bumps right → left
  for (let i = sorted.length - 1; i >= 0; i--) {
    const { x, r } = sorted[i];
    const top = r * 0.85;
    s.bezierCurveTo(x + r, r * 0.4, x + r * 0.5, top, x, top);
    s.bezierCurveTo(x - r * 0.5, top, x - r, r * 0.4, x - r, 0);
  }
  s.lineTo(left, -0.04);
  s.closePath();
  return s;
}

const LEFT_BUMPS  = [{ x: -0.66, r: 0.13 }, { x: -0.50, r: 0.15 }, { x: -0.34, r: 0.11 }];
const RIGHT_BUMPS = LEFT_BUMPS.map(b => ({ x: -b.x, r: b.r }));

const EXTRUDE = {
  depth: 0.10, bevelEnabled: true,
  bevelSize: 0.022, bevelThickness: 0.022, bevelSegments: 10, curveSegments: 32,
};

function Cloud({ bumps }) {
  const shape = useMemo(() => buildCloudShape(bumps), [bumps]);
  return (
    <mesh position={[0, 0, -0.05]}>
      <extrudeGeometry args={[shape, EXTRUDE]} />
      <meshStandardMaterial color="white" roughness={0.92} metalness={0} />
    </mesh>
  );
}

// ─── Band mesh ───────────────────────────────────────────────────────────────
function Band({ color, radius }) {
  const geometry = useMemo(() => {
    const curve = new RainbowArcCurve(radius, LEG_H);
    return new THREE.TubeGeometry(curve, 80, TUBE_R, 20, false);
  }, [radius]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.88} metalness={0} />
    </mesh>
  );
}

// ─── Full topper ─────────────────────────────────────────────────────────────
export function RainbowTopper() {
  return (
    <group>
      {BANDS.map(({ color, r }) => <Band key={r} color={color} radius={r} />)}
      <Cloud bumps={LEFT_BUMPS} />
      <Cloud bumps={RIGHT_BUMPS} />
    </group>
  );
}

// ─── Dev scene ───────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <Canvas camera={{ position: [0, 0.6, 2.8], fov: 40 }} style={{ background: '#f5f2ee', height: '100vh' }}>
    <ambientLight intensity={1.0} />
    <directionalLight position={[2, 5, 4]} intensity={2.2} castShadow />
    <directionalLight position={[-3, 2, -1]} intensity={0.5} />
    <Environment preset="city" />
    <RainbowTopper />
    <OrbitControls />
  </Canvas>
);
