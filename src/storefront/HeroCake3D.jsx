import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
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
function usePatchTexture(primary, grid) {
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
      const cy = p.y * size, r = p.r * size;
      // Draw each patch wrapped across the horizontal edges (−size, 0, +size) so a patch
      // near an edge continues across the cylinder's UV seam. Without this, a patch that
      // spills off one side has no match on the other → a visible vertical "split" line.
      for (const dx of [-size, 0, size]) {
        const cx = p.x * size + dx;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(${p.c[0]}, ${p.c[1]}, ${p.c[2]}, ${p.a})`);
        grad.addColorStop(1, `rgba(${p.c[0]}, ${p.c[1]}, ${p.c[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, [primary]);
}

function Cake({ primary }) {
  const patch = usePatchTexture(primary);
  return (
    <group>
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

// StudioGrid — the "3D studio" space the cake sits inside: a floor grid receding to a vanishing
// point + concentric rings around the base. Ported from the marketing hero (SpaceGrid.tsx), tinted
// to the theme and kept low-visibility so it frames the cake without competing with it.
const FLOOR_Y = -0.68;   // just under the gold board (board bottom ≈ -0.675)

function StudioGrid({ color = '#ffffff', opacity = 0.5 }) {
  const lines = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const halfW = 5, zBack = -14, zFront = 3, cell = 0.7;   // deep floor → strong vanishing point
    // Floor (XZ plane at y=0), receding back to the horizon
    for (let z = zBack; z <= zFront + 1e-6; z += cell) verts.push(-halfW, 0, z, halfW, 0, z);
    for (let x = -halfW; x <= halfW + 1e-6; x += cell) verts.push(x, 0, zBack, x, 0, zFront);
    // Right wall — sparse horizontal lines at rising heights, running back to the vanishing point:
    // the radiating "fan" from the marketing hero (NOT a dense grid wall).
    for (const y of [0.5, 1.1, 1.8, 2.6, 3.5, 4.5]) verts.push(halfW, y, zFront, halfW, y, zBack);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }, []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity }), [color, opacity]);
  return (
    <group position={[0, FLOOR_Y, 0]}>
      <lineSegments geometry={lines} material={mat} />
      {/* concentric rings around the cake base — the vanishing-point flourish */}
      {[1.5, 2.4, 3.3, 4.2].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[r, r + 0.012, 96]} />
          <meshBasicMaterial color={color} transparent opacity={Math.max(0.05, opacity - i * 0.09)} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroCake3D({ primary = '#2C4433', accent = '#6B8C74', height = 420, mood = 'dark', spin = 0.4, grid = false, gridColor = '#ffffff', gridOpacity = 0.5 }) {
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
        style={{ width: '100%', height: '100%' }}
      >
        {/* Low ambient + a strong key light gives the cake form and keeps the colour rich. On a
            LIGHT background a pale/ivory cake washes out, so drop the ambient further and lean on a
            single strong key + soft fill for a clear light-to-shadow gradient across the cylinder. */}
        <ambientLight intensity={mood === 'dark' ? 0.45 : 0.22} />
        <directionalLight position={[5, 10, 6]} intensity={mood === 'dark' ? 1.9 : 2.3} castShadow />
        <directionalLight position={[-5, 6, 3]} intensity={mood === 'dark' ? 0.7 : 0.45} />
        <pointLight position={[3, 2, 4]} intensity={0.5} color="#ffffff" />
        {grid && <StudioGrid color={gridColor} opacity={gridOpacity} />}
        <Suspense fallback={<SceneLoader size={22} />}>
          <Environment preset="apartment" />
          <Cake primary={primary} />
        </Suspense>
        {/* Contact shadow grounds the cake so it doesn't look like a floating 2D sticker. Invisible
            on the dark hero (dark-on-dark), visible + grounding on the light band. */}
        <ContactShadows position={[0, -0.72, 0]} opacity={mood === 'dark' ? 0.3 : 0.42} scale={7} blur={2.6} far={4} resolution={512} color="#3a2a2e" />
        {/* Drag to rotate; gentle auto-spin when idle. No zoom/pan — it's a hero, not a viewer. */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={!reduced}
          autoRotateSpeed={1.1}
          target={[0, targetY, 0]}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
          dampingFactor={0.12}
        />
      </Canvas>
    </div>
  );
}
