import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SceneLoader } from '../designer/canvas/CakeSpinner.jsx';

// HeroCake3D — the storefront hero cake, ported from the spattoo.com marketing hero
// (spattoo-web/components/SpaceGrid.tsx): a tall single-tier cylinder with a soft canvas
// "patch" texture on a gold metallic board, premium environment lighting, rotating slowly.
// Coloured from the baker's brand (the marketing site used a fixed teal); the GLB topper + arced
// name from that scene are asset-dependent marketing flourishes and are intentionally omitted.
// Self-contained — imports nothing it mutates from designer/.

const RADIUS = 1.1;
const HEIGHT = 2.2;

function lighten(hex, t) {
  const c = (hex || '#2C4433').replace('#', '');
  const n = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const m = x => Math.max(0, Math.min(255, Math.round(x + (255 - x) * t)));
  return [m(r), m(g), m(b)];
}

// A soft, hand-iced look: the brand colour with a few lighter radial "patches" baked into a
// canvas texture — exactly the technique the marketing hero uses (just brand-driven).
function usePatchTexture(primary) {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, size, size);
    const lt = lighten(primary, 0.5);   // highlight patches
    const dk = lighten(primary, -0.28); // shadow patches (negative t = darken)
    // Spread distinct light + dark patches around the full circumference so the cake's
    // surface clearly varies as it rotates (a smooth single tone would look static).
    const patches = [
      { x: 0.08, y: 0.30, r: 0.26, a: 0.42, c: lt },
      { x: 0.24, y: 0.66, r: 0.20, a: 0.34, c: dk },
      { x: 0.40, y: 0.22, r: 0.24, a: 0.40, c: lt },
      { x: 0.55, y: 0.58, r: 0.22, a: 0.30, c: dk },
      { x: 0.70, y: 0.34, r: 0.26, a: 0.42, c: lt },
      { x: 0.86, y: 0.64, r: 0.20, a: 0.32, c: dk },
    ];
    for (const p of patches) {
      const cx = p.x * size, cy = p.y * size, r = p.r * size;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${p.c[0]}, ${p.c[1]}, ${p.c[2]}, ${p.a})`);
      grad.addColorStop(1, `rgba(${p.c[0]}, ${p.c[1]}, ${p.c[2]}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, [primary]);
}

function Cake({ primary, reduced, spin }) {
  const root = useRef();
  const patch = usePatchTexture(primary);
  useFrame(({ clock }) => {
    if (root.current && !reduced) root.current.rotation.y = clock.getElapsedTime() * spin;
  });
  return (
    <group ref={root}>
      {/* gold metallic cake board */}
      <mesh position={[0, -0.65, 0]} receiveShadow>
        <cylinderGeometry args={[RADIUS + 0.5, RADIUS + 0.5, 0.05, 128]} />
        <meshStandardMaterial color="#c8a84b" roughness={0.4} metalness={0.95} />
      </mesh>
      {/* single tall tier, brand-coloured with the soft patch texture */}
      <group position={[0, -0.6 + HEIGHT / 2, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT, 64]} />
          <meshStandardMaterial map={patch} roughness={0.95} metalness={0} />
        </mesh>
      </group>
    </group>
  );
}

export default function HeroCake3D({ primary = '#2C4433', accent = '#6B8C74', height = 420, mood = 'dark', spin = 0.4 }) {
  // Client-only: skip WebGL during SSR / first paint (spattoo-web is Next.js).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
    []
  );
  if (!mounted) return <div style={{ height }} />;

  // Pull back + look down so the whole cake and its gold board read as a centred centrepiece
  // with dark margins above/below for the overlaid headline + CTA (not a cropped column).
  const targetY = 0.55;
  return (
    <div style={{ width: '100%', height }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 3.8, 8.4], fov: 30 }}
        onCreated={({ camera }) => camera.lookAt(0, targetY, 0)}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={mood === 'dark' ? 1.4 : 1.1} />
        <directionalLight position={[5, 10, 6]} intensity={1.3} />
        <directionalLight position={[-5, 6, 3]} intensity={0.9} />
        <pointLight position={[3, 2, 4]} intensity={0.6} color="#ffffff" />
        <Suspense fallback={<SceneLoader size={22} />}>
          <Environment preset="apartment" />
          <Cake primary={primary} reduced={reduced} spin={spin} />
        </Suspense>
      </Canvas>
    </div>
  );
}
