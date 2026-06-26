import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildRay } from '../utils/raycasting.js';

// ── Particle-finish placement handles (luster dust + gold leaf) ───────────────────────────────
// In a finish's edit mode each placed point (a dust splash / a leaf flake) shows a draggable dot ON the
// cake at its origin, so the customer sees exactly where it lands and nudges it directly (clicking bare
// wall still edits the tier — we do NOT make the whole wall a placement target). Dragging raycasts an
// invisible catcher to read the new (u,v).
//
// A point's `surface` ('side' | 'top_surface') decides BOTH which catcher reads its drag and where its
// handle sits, mirroring the bake (particleFinish):
//  • side — open-cylinder catcher; THREE's cylinder UV gives (u=angle/2π, v=height-frac). Handle at
//    x=R·sinθ, z=R·cosθ, y=baseY+v·height.
//  • top  — flat disk catcher at the lid; (u,v) is read polar from the hit point (angle, radial-frac).
//    Handle at x=v·R·sinθ, z=v·R·cosθ, y=topY — the same map the top decal stamps with, so handle and
//    shard stay locked. Tiers are centred on the cake axis (x=z=0), so the hit point IS the local point.
// Round tiers only (rect UV differs). Generic over the finish: `getPoints` reads the per-tier point
// list; the `catcherFlag`/`handleFlag` userData keys keep dust and foil handles distinct so each can
// suspend orbit on its own drag.

const TAU = Math.PI * 2;

export default function FinishHandles({
  tierData = [], getPoints, selected = null, onMove, onSelect,
  catcherFlag = 'isFinishCatcher', handleFlag = 'isFinishHandle',
  // NOTE — default is NO visible marker. A particle finish (dust, foil, and any
  // FUTURE finish) is grabbed via the invisible sphere at its origin; we do NOT
  // draw a coloured dot on the cake, because that dot reads as part of the design
  // and gets baked into the order thumbnail (the "green dot" bug). Only opt into a
  // marker (showMarker) for a finish that has NO visible particle of its own AND
  // accept it won't appear in renders. Keeping the default false means new finishes
  // can't reintroduce the stray dot.
  color = '#ffffff', selColor = '#3D5A44', dotScale = 1, showMarker = false,
}) {
  const { gl, camera, scene } = useThree();
  const rc = useRef(new THREE.Raycaster());
  const drag = useRef(null);   // { tier, idx, surface } while dragging a handle
  const pendingMove = useRef(null);   // latest pointer pos, applied once per frame (coalesced)
  const rafId = useRef(0);

  // Read (u,v) under the pointer from the catcher of the wanted surface. Side reads the cylinder UV;
  // top converts the world hit point to polar (angle/2π, radial-frac) — the inverse of the bake map.
  const uvAt = (clientX, clientY, wantSurface) => {
    const ray = buildRay(clientX, clientY, gl.domElement, camera);
    rc.current.set(ray.origin, ray.direction);
    const hit = rc.current.intersectObjects(scene.children, true).find(h =>
      h.object.userData?.[catcherFlag] && (!wantSurface || (h.object.userData.surface ?? 'side') === wantSurface));
    if (!hit) return null;
    const ud = hit.object.userData;
    const surface = ud.surface ?? 'side';
    if (surface === 'top_surface') {
      const R = ud.radius || 1;
      const lx = hit.point.x, lz = hit.point.z;
      const u = (Math.atan2(lx, lz) / TAU + 1) % 1;
      // Clamp to the visible ring [innerFrac, ~rim] so a flake can't be dragged under the upper tier.
      const v = Math.min(0.985, Math.max(ud.innerFrac ?? 0, Math.sqrt(lx * lx + lz * lz) / R));
      return { u, v, tier: ud.tierIndex, surface };
    }
    return hit.uv ? { u: hit.uv.x, v: hit.uv.y, tier: ud.tierIndex, surface } : null;
  };

  const onDown = (e, tier, idx, surface) => {
    e.stopPropagation();
    try { gl.domElement.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    drag.current = { tier, idx, surface };
    onSelect?.(tier, idx);
  };

  useEffect(() => {
    const el = gl.domElement;
    // Coalesce moves: each rebuild regenerates the wall texture, so apply at most ONE move per frame
    // (the latest pointer pos) instead of one per pointermove event — kills the drag "glue".
    const flush = () => {
      rafId.current = 0;
      const p = pendingMove.current;
      if (!p || !drag.current) return;
      const hit = uvAt(p.x, p.y, drag.current.surface);
      if (hit && hit.tier === drag.current.tier) onMove?.(drag.current.tier, drag.current.idx, hit.u, hit.v);
    };
    const move = ev => {
      if (!drag.current) return;
      pendingMove.current = { x: ev.clientX, y: ev.clientY };
      if (!rafId.current) rafId.current = requestAnimationFrame(flush);
    };
    const up = () => { drag.current = null; pendingMove.current = null; if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; } };
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (rafId.current) cancelAnimationFrame(rafId.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene, onMove]);

  return (
    <>
      {tierData.map((t, ti) => {
        const points = getPoints(t);
        if ((t.shape ?? 'round') === 'rect' || !points?.length) return null;
        const R = t.radius, cy = t.baseY, topY = t.baseY + t.height;
        const hasTop = points.some(p => (p.surface ?? 'side') === 'top_surface');
        return (
          <group key={ti}>
            {/* invisible open-cylinder wall catcher — raycast target for side drags */}
            <mesh position={[0, cy + t.height / 2, 0]} userData={{ [catcherFlag]: true, surface: 'side', tierIndex: ti }}>
              <cylinderGeometry args={[R * 1.012, R * 1.012, t.height, 96, 1, true]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {/* invisible flat-disk catcher at the lid — raycast target for top-surface drags. Only when
                this tier has top flakes (a disk over every tier would block the wall catcher otherwise). */}
            {hasTop && (
              <mesh position={[0, topY + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}
                userData={{ [catcherFlag]: true, surface: 'top_surface', tierIndex: ti, radius: R, innerFrac: t.topInnerFrac ?? 0 }}>
                <circleGeometry args={[R * 1.012, 64]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            )}
            {points.map((p, si) => {
              const surface = p.surface ?? 'side';
              const ang = p.u * TAU;
              const pos = surface === 'top_surface'
                ? [p.v * R * Math.sin(ang), topY + 0.04, p.v * R * Math.cos(ang)]
                : [R * 1.02 * Math.sin(ang), cy + p.v * t.height, R * 1.02 * Math.cos(ang)];
              const isSel = selected && selected.tier === ti && selected.idx === si;
              return (
                <group key={si} position={pos}>
                  {/* Large INVISIBLE grab target — easy to click without covering the decoration. */}
                  <mesh userData={{ [handleFlag]: true }} onPointerDown={e => onDown(e, ti, si, surface)}>
                    <sphereGeometry args={[0.1, 12, 12]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  {/* Visible marker — only when the finish has no visible particle of its own (dust). Foil
                      shards are visible, so they show no marker; you grab the shard directly. */}
                  {showMarker && (
                    <>
                      <mesh>
                        <sphereGeometry args={[(isSel ? 0.03 : 0.022) * dotScale, 16, 16]} />
                        <meshBasicMaterial color={isSel ? selColor : color} />
                      </mesh>
                      <mesh>
                        <sphereGeometry args={[(isSel ? 0.04 : 0.03) * dotScale, 16, 16]} />
                        <meshBasicMaterial color="#1a1a1a" transparent opacity={0.3} depthWrite={false} side={THREE.BackSide} />
                      </mesh>
                    </>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
