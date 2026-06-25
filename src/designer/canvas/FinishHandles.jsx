import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildRay } from '../utils/raycasting.js';

// ── Particle-finish placement handles (luster dust + gold leaf) ───────────────────────────────
// In a finish's edit mode each placed point (a dust splash / a leaf flake) shows a draggable dot ON the
// cake at its origin, so the customer sees exactly where it lands and nudges it directly (clicking bare
// wall still edits the tier — we do NOT make the whole wall a placement target). Dragging raycasts an
// invisible wall catcher to read the new uv. The handle's world position is the inverse of THREE's
// cylinder UV: angle = u·2π (x=R·sinθ, z=R·cosθ), y = baseY + v·height — the same (u,v) the finish
// generator uses, so handle and particle stay locked. Round tiers only (rect UV differs). Generic over
// the finish: `getPoints` reads the per-tier point list; the `catcherFlag`/`handleFlag` userData keys
// keep dust and foil handles distinct so each can suspend orbit on its own drag.

const TAU = Math.PI * 2;

export default function FinishHandles({
  tierData = [], getPoints, selected = null, onMove, onSelect,
  catcherFlag = 'isFinishCatcher', handleFlag = 'isFinishHandle',
  color = '#ffffff', selColor = '#3D5A44',
}) {
  const { gl, camera, scene } = useThree();
  const rc = useRef(new THREE.Raycaster());
  const drag = useRef(null);   // { tier, idx } while dragging a handle

  const uvAt = (clientX, clientY) => {
    const ray = buildRay(clientX, clientY, gl.domElement, camera);
    rc.current.set(ray.origin, ray.direction);
    const hit = rc.current.intersectObjects(scene.children, true).find(h => h.object.userData?.[catcherFlag] && h.uv);
    return hit ? { u: hit.uv.x, v: hit.uv.y, tier: hit.object.userData.tierIndex } : null;
  };

  const onDown = (e, tier, idx) => {
    e.stopPropagation();
    try { gl.domElement.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    drag.current = { tier, idx };
    onSelect?.(tier, idx);
  };

  useEffect(() => {
    const el = gl.domElement;
    const move = ev => {
      if (!drag.current) return;
      const hit = uvAt(ev.clientX, ev.clientY);
      if (hit && hit.tier === drag.current.tier) onMove?.(drag.current.tier, drag.current.idx, hit.u, hit.v);
    };
    const up = () => { drag.current = null; };
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene, onMove]);

  return (
    <>
      {tierData.map((t, ti) => {
        const points = getPoints(t);
        if ((t.shape ?? 'round') === 'rect' || !points?.length) return null;
        const R = t.radius, cy = t.baseY;
        return (
          <group key={ti}>
            {/* invisible open-cylinder wall catcher — raycast target for reading uv during a drag */}
            <mesh position={[0, cy + t.height / 2, 0]} userData={{ [catcherFlag]: true, tierIndex: ti }}>
              <cylinderGeometry args={[R * 1.012, R * 1.012, t.height, 96, 1, true]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {points.map((p, si) => {
              const ang = p.u * TAU;
              const pos = [R * 1.02 * Math.sin(ang), cy + p.v * t.height, R * 1.02 * Math.cos(ang)];
              const isSel = selected && selected.tier === ti && selected.idx === si;
              return (
                <group key={si} position={pos}>
                  <mesh userData={{ [handleFlag]: true }} onPointerDown={e => onDown(e, ti, si)}>
                    <sphereGeometry args={[isSel ? 0.055 : 0.045, 16, 16]} />
                    <meshBasicMaterial color={isSel ? selColor : color} />
                  </mesh>
                  {/* dark rim so a light handle reads on a light cake */}
                  <mesh>
                    <sphereGeometry args={[isSel ? 0.066 : 0.055, 16, 16]} />
                    <meshBasicMaterial color="#1a1a1a" transparent opacity={0.35} depthWrite={false} side={THREE.BackSide} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
