import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SafeEnvironment } from '../canvas/TextureErrorBoundary.jsx';
import { envProps } from '../canvas/envMap.js';
import { buildGarnishGeometry } from '../geometry/garnishPiece.js';
import { buildPanelGeometry, panelsFrom } from '../geometry/garnishPanel.js';
import { garnishMaterialProps } from '../geometry/garnishMaterial.js';

// ── The piece, in chocolate ──────────────────────────────────────────────────────────────────────
//
// ⚠️ THE PLATE HAS NO MATERIAL, AND THAT IS NOT FIXABLE WITH MATERIAL SETTINGS. The studio draws with
// a flat 2D stroke on a canvas: there is no light, no reflection and no depth, so the piece read dull
// beside the same piece on the cake and every judgement made here — how dark, how glossy, how thick —
// was a guess. Raising the gloss was attempted twice and made it worse, because the problem was never
// the numbers.
//
// So this shows the REAL geometry with the REAL material, from `garnishMaterial.js`, which the cake
// uses too. If they ever look different, that is a bug in one of them rather than a preview being
// approximately right.
//
// ⚠️ IT SITS BESIDE THE PLATE, NOT UNDER IT — INVARIANTS #11. A preview you have to scroll to in
// order to compare against the thing you are drawing is not a preview; you would be holding one of
// them in your head, which is the whole problem it exists to solve.

export default function GarnishPreview({ strokes, kind, color, rope, plate, gloss, isMobile }) {
  const built = useMemo(() => {
    const paths = strokes.flatMap(s => [s.path, ...(s.fills ?? [])]).filter(p => p?.length > 1);
    if (!paths.length) return null;

    /* One geometry per colour, in one shared frame — the same rule the cake follows, and for the
       same reason: built separately each part centres on itself and a white shape drawn in the
       corner of a dark one lands on top of it. */
    const groups = new Map();
    for (const s of strokes) {
      const c = s.color ?? color;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(s);
    }

    const make = (group, frame) => {
      if (kind === 'cut') {
        const rings = group.filter(s => s.ring).map(s => s.ring);
        const [panel] = panelsFrom(rings);
        return panel ? buildPanelGeometry([panel.outline, ...panel.holes], { scale: 1.6 / plate, frame }) : null;
      }
      const gp = group.flatMap(s => [s.path, ...(s.fills ?? [])]).filter(p => p?.length > 1);
      return gp.length
        ? buildGarnishGeometry(gp, { rope, plateSize: plate, worldSize: 1.6, frame })
        : null;
    };

    const entries = [...groups.entries()];
    const raw = entries.map(([, g]) => make(g)).filter(Boolean);
    if (!raw.length) return null;
    const frame = new THREE.Box3();
    for (const r of raw) frame.union(r.bounds);

    return entries
      .map(([c, g]) => { const r = make(g, frame); return r && { geometry: r.geometry, color: c }; })
      .filter(Boolean);
  }, [strokes, kind, color, rope, plate]);

  const side = isMobile ? '100%' : 200;

  return (
    <div style={{ width: side, height: isMobile ? 190 : 200, borderRadius: 14,
                  border: '1px solid #E3DFD8', overflow: 'hidden', background: '#F7F4EF' }}>
      {built ? (
        <Canvas camera={{ position: [0, 0.35, 2.5], fov: 30 }} dpr={[1, 2]} shadows={false}>
          <Suspense fallback={null}>
            {/* The cake's own environment, so the reflections are the ones the piece will actually
                catch rather than a lighting rig invented for this panel. */}
            <SafeEnvironment {...envProps()} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[2, 3, 2]} intensity={1.1} />
            {/* ⚠️ BARELY TILTED, AND THAT IS THE WHOLE JUDGEMENT. Tipped back 69° to catch the light,
                a triangle foreshortens into a rounded blob — so the panel stopped answering "how will
                this look" and started asking "what is this?". The point of comparison is the
                MATERIAL, and the shape must stay recognisably the one on the plate above it or the
                two cannot be compared at all. 15° is enough for the highlight to run along a rope
                and little enough to leave the outline honest. */}
            <group rotation={[-Math.PI / 12, 0, 0]} position={[0, -0.05, 0]}>
              {built.map((p, i) => (
                <mesh key={i} geometry={p.geometry}>
                  <meshPhysicalMaterial side={THREE.DoubleSide}
                    {...garnishMaterialProps({ gloss, color: p.color })} />
                </mesh>
              ))}
            </group>
          </Suspense>
        </Canvas>
      ) : (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 14,
                      textAlign: 'center', fontSize: 11.5, color: '#9a9a9a', lineHeight: 1.5 }}>
          Draw something and it will appear here in chocolate.
        </div>
      )}
    </div>
  );
}
