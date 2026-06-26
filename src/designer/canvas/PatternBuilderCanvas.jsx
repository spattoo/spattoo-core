import { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SafeEnvironment } from './TextureErrorBoundary.jsx';
import * as THREE from 'three';
import CakeTier from './CakeTier.jsx';
import {
  TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP,
  CAMERA_POSITION, CAMERA_FOV,
  SELECTION_COLOR, CAKE_TOP_CAP_H,
} from '../constants.js';

// ── Tier geometry constants (exported so admin can use them) ──────────────────
export const ALL_TIER_GEOM = (() => {
  const geoms = [];
  let yBase = BOTTOM_BASE;
  for (let i = 0; i < TIER_RADII.length; i++) {
    const height = BOTTOM_H - i * TIER_HEIGHT_STEP;
    const topY   = yBase + height;
    geoms.push({ radius: TIER_RADII[i], yBase, height, topY });
    yBase = topY;
  }
  return geoms;
})();

// ── Placement position helpers ────────────────────────────────────────────────

function gapPosition(p, topY, radius, all, upperGeom = null) {
  const pa = all.find(x => x.id === p.parentA);
  const pb = all.find(x => x.id === p.parentB);
  if (!pa || !pb) return new THREE.Vector3(0, topY + CAKE_TOP_CAP_H + p.r, 0);

  const posA = placementPosition(pa, topY, radius, all, upperGeom);
  const posB = placementPosition(pb, topY, radius, all, upperGeom);

  const dA  = p.r + pa.r;
  const dB  = p.r + pb.r;
  const d   = posA.distanceTo(posB);

  if (d < 0.0001 || d > dA + dB + 0.001) {
    return posA.clone().lerp(posB, 0.5);
  }

  const tA     = (d * d + dA * dA - dB * dB) / (2 * d);
  const perpR  = Math.sqrt(Math.max(0, dA * dA - tA * tA));
  const ab     = posB.clone().sub(posA).normalize();
  const foot   = posA.clone().addScaledVector(ab, tA);

  // Build two orthogonal vectors perpendicular to AB
  const worldUp = new THREE.Vector3(0, 1, 0);
  let v1 = new THREE.Vector3().crossVectors(ab, worldUp);
  if (v1.lengthSq() < 0.0001) v1.set(1, 0, 0);
  v1.normalize();
  const v2 = new THREE.Vector3().crossVectors(ab, v1).normalize();

  // gapAngle=0 → highest Y (resting on top of both balls)
  const baseAngle = Math.atan2(v2.y, v1.y);
  const angle     = baseAngle + (p.gapAngle ?? 0);

  const pos = foot.clone()
    .addScaledVector(v1, perpR * Math.cos(angle))
    .addScaledVector(v2, perpR * Math.sin(angle))
    .add(new THREE.Vector3(0, p.heightOffset ?? 0, 0));

  // Keep ball above the base plate
  pos.y = Math.max(BOTTOM_BASE + p.r, pos.y);

  const rXZ = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

  if (rXZ < radius) {
    // Inside the cylinder's XZ footprint — ball must sit above the cake top face (incl. cap)
    pos.y = Math.max(topY + CAKE_TOP_CAP_H + p.r, pos.y);
  } else if (pos.y < topY && pos.y > BOTTOM_BASE) {
    // At cake-body height and outside the footprint — must not clip the side wall
    if (rXZ < radius + p.r) {
      const scale = (radius + p.r) / rXZ;
      pos.x *= scale;
      pos.z *= scale;
    }
  }

  // Prevent the ball from penetrating the upper tier's cylinder
  if (upperGeom) {
    const rXZ2 = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (rXZ2 < upperGeom.radius + p.r) {
      if (rXZ2 > 0.001) {
        const scale = (upperGeom.radius + p.r) / rXZ2;
        pos.x *= scale;
        pos.z *= scale;
      } else {
        pos.x = upperGeom.radius + p.r;
      }
    }
  }

  return pos;
}

export function placementPosition(p, topY, radius, all = [], upperGeom = null) {
  if (p.surface === 'gap') return gapPosition(p, topY, radius, all, upperGeom);

  if (p.surface === 'top') {
    const rdRaw = radius - (p.rdInset ?? 0.08);
    // Clamp so ball doesn't penetrate the upper tier's cylinder
    const upperRadius = upperGeom ? upperGeom.radius : 0;
    const rd = Math.max(upperRadius + p.r, rdRaw);
    // Raise by the top-cap height so the ball rests on the cap, not inside it
    return new THREE.Vector3(
      rd * Math.sin(p.thetaOffset ?? 0),
      topY + CAKE_TOP_CAP_H + p.r,
      rd * Math.cos(p.thetaOffset ?? 0),
    );
  }
  // side
  const rd = radius + p.r;
  return new THREE.Vector3(
    rd * Math.sin(p.thetaOffset ?? 0),
    topY - (p.yFromTop ?? p.r),
    rd * Math.cos(p.thetaOffset ?? 0),
  );
}

export function getOverlappingIds(placements, topY, radius, upperGeom = null) {
  const ids = new Set();
  const pos = placements.map(p => placementPosition(p, topY, radius, placements, upperGeom));
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (pos[i].distanceTo(pos[j]) < placements[i].r + placements[j].r) {
        ids.add(placements[i].id);
        ids.add(placements[j].id);
      }
    }
  }
  return ids;
}

// ── Raycasting helpers ────────────────────────────────────────────────────────

function buildRay(clientX, clientY, domElement, camera) {
  const rect = domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((clientX - rect.left)  / rect.width)  *  2 - 1,
    ((clientY - rect.top)   / rect.height) * -2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  return ray.ray;
}

function hitTop(ray, topY) {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY);
  const hit   = new THREE.Vector3();
  if (!ray.intersectPlane(plane, hit)) return null;
  return hit;
}

function hitSide(ray, topY, baseY, radius) {
  const ox = ray.origin.x, oz = ray.origin.z;
  const dx = ray.direction.x, dz = ray.direction.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  // Only use the near (smaller t) intersection — the far side is occluded from
  // the camera and would make the ball appear to be inside the cake.
  const t = (-b - sqrtD) / (2 * a);
  if (t < 0) return null;
  const y = ray.origin.y + t * ray.direction.y;
  if (y >= baseY && y <= topY) {
    const x = ox + t * dx, z = oz + t * dz;
    return { theta: Math.atan2(x, z), y };
  }
  return null;
}

// ── Single sphere placement ───────────────────────────────────────────────────

function SpherePlacement({ placement, topY, radius, upperGeom = null, all, selected, overlapping, onPointerDown }) {
  const pos = useMemo(
    () => placementPosition(placement, topY, radius, all, upperGeom),
    [placement, topY, radius, all, upperGeom],
  );

  const emissive = overlapping ? '#ff2222' : selected ? (placement.color ?? '#D4AF37') : '#000000';
  const emissiveIntensity = overlapping ? 0.4 : selected ? 0.25 : 0;

  const pick = useMemo(() => {
    if (placement.surface !== 'gap') return null;
    const r        = placement.r;
    const VISIBLE  = 0.18;
    const totalLen = r + VISIBLE;

    const rXZ = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

    // Choose leg direction:
    // - Above the tier top with no upper tier (or well inside the upper tier's radius):
    //   leg points straight down into the tier top.
    // - In the annular ring zone (above top, at/beyond the upper tier's outer wall):
    //   leg tilts radially inward so it inserts into the upper tier's side.
    // - At side height: leg already points radially inward (existing behaviour).
    let dir;
    if (pos.y > topY && (!upperGeom || rXZ < upperGeom.radius - 0.05)) {
      dir = new THREE.Vector3(0, -1, 0);
    } else if (rXZ > 0.001) {
      dir = new THREE.Vector3(-pos.x / rXZ, 0, -pos.z / rXZ);
    } else {
      dir = new THREE.Vector3(0, -1, 0);
    }

    const center = pos.clone().addScaledVector(dir, totalLen / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir,
    );
    return { center, q, totalLen };
  }, [placement, pos, topY, upperGeom]);

  return (
    <>
      <mesh
        position={pos}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(placement.id); }}
      >
        <sphereGeometry args={[placement.r, 24, 24]} />
        <meshStandardMaterial
          color={placement.color ?? '#D4AF37'}
          metalness={0.88}
          roughness={0.15}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {pick && (
        <mesh position={pick.center} quaternion={pick.q}>
          <cylinderGeometry args={[0.022, 0.022, pick.totalLen, 8]} />
          <meshStandardMaterial
            color={placement.color ?? '#D4AF37'}
            metalness={0.92}
            roughness={0.08}
          />
        </mesh>
      )}
    </>
  );
}

// ── The interactive Three.js scene ────────────────────────────────────────────

function BuilderScene({
  placements, selectedId, onSelectPlacement,
  onCakeTopClick, onCakeSideClick, onDragPlacement,
  tierCount = 1, activeTierIdx = 0,
  draggingNewBall, onDropNewBall,
}) {
  const { gl, camera } = useThree();
  const dragId   = useRef(null);
  const isDrag   = useRef(false);
  const orbitRef = useRef(null);

  const [previewPlacement, setPreviewPlacement] = useState(null);
  const previewDataRef    = useRef(null);
  const onDropNewBallRef  = useRef(onDropNewBall);
  const placementsRef     = useRef(placements);
  const activeTierIdxRef  = useRef(activeTierIdx);
  const tierCountRef      = useRef(tierCount);
  onDropNewBallRef.current  = onDropNewBall;
  placementsRef.current     = placements;
  activeTierIdxRef.current  = activeTierIdx;
  tierCountRef.current      = tierCount;

  // Overlap detection per tier
  const overlappingIds = useMemo(() => {
    const ids = new Set();
    for (let i = 0; i < tierCount; i++) {
      const geom      = ALL_TIER_GEOM[i];
      const tierBalls = placements.filter(p => (p.tierId ?? 0) === i);
      const upperGeom = (i + 1 < tierCount) ? ALL_TIER_GEOM[i + 1] : null;
      getOverlappingIds(tierBalls, geom.topY, geom.radius, upperGeom).forEach(id => ids.add(id));
    }
    return ids;
  }, [placements, tierCount]);

  // Existing ball drag
  useEffect(() => {
    const dom = gl.domElement;

    function onMove(e) {
      if (!dragId.current) return;
      isDrag.current = true;
      const ray = buildRay(e.clientX, e.clientY, dom, camera);
      const p   = placements.find(pl => pl.id === dragId.current);
      if (!p) return;

      // Use ball's own tier geometry for raycasting
      const geom   = ALL_TIER_GEOM[p.tierId ?? 0];
      const topY   = geom.topY;
      const radius = geom.radius;
      const baseY  = geom.yBase;

      if (p.surface === 'gap') {
        const tierBalls = placements.filter(x => x.surface !== 'gap' && (x.tierId ?? 0) === (p.tierId ?? 0));
        if (tierBalls.length < 2) return;

        const gapUpperGeom = (p.tierId ?? 0) + 1 < tierCountRef.current
          ? ALL_TIER_GEOM[(p.tierId ?? 0) + 1] : null;

        let bestA = null, bestB = null, bestDist = Infinity;
        for (let i = 0; i < tierBalls.length; i++) {
          for (let j = i + 1; j < tierBalls.length; j++) {
            const pa = tierBalls[i], pb = tierBalls[j];
            const posA = placementPosition(pa, topY, radius, placements, gapUpperGeom);
            const posB = placementPosition(pb, topY, radius, placements, gapUpperGeom);
            const dA = p.r + pa.r, dB = p.r + pb.r;
            const d  = posA.distanceTo(posB);
            if (d < 0.0001 || d > dA + dB + 0.001) continue;
            const tA   = (d * d + dA * dA - dB * dB) / (2 * d);
            const ab   = posB.clone().sub(posA).normalize();
            const foot = posA.clone().addScaledVector(ab, tA);
            const toFoot = foot.clone().sub(ray.origin);
            const t      = Math.max(0, toFoot.dot(ray.direction));
            const dist   = foot.distanceTo(ray.origin.clone().addScaledVector(ray.direction, t));
            if (dist < bestDist) { bestDist = dist; bestA = pa; bestB = pb; }
          }
        }
        if (!bestA || !bestB) return;

        const posA = placementPosition(bestA, topY, radius, placements, gapUpperGeom);
        const posB = placementPosition(bestB, topY, radius, placements, gapUpperGeom);
        const dA   = p.r + bestA.r, dB = p.r + bestB.r;
        const d    = posA.distanceTo(posB);
        const tA   = (d * d + dA * dA - dB * dB) / (2 * d);
        const ab   = posB.clone().sub(posA).normalize();
        const foot = posA.clone().addScaledVector(ab, tA);
        const worldUp = new THREE.Vector3(0, 1, 0);
        let v1 = new THREE.Vector3().crossVectors(ab, worldUp);
        if (v1.lengthSq() < 0.0001) v1.set(1, 0, 0);
        v1.normalize();
        const v2       = new THREE.Vector3().crossVectors(ab, v1).normalize();
        const plane    = new THREE.Plane().setFromNormalAndCoplanarPoint(ab, foot);
        const hitPoint = new THREE.Vector3();
        if (!ray.intersectPlane(plane, hitPoint)) return;
        const local     = hitPoint.clone().sub(foot);
        const baseAngle = Math.atan2(v2.y, v1.y);
        const newAngle  = Math.atan2(local.dot(v2), local.dot(v1)) - baseAngle;
        onDragPlacement(dragId.current, { parentA: bestA.id, parentB: bestB.id, gapAngle: newAngle });
        return;
      }

      if (p.surface === 'top') {
        const hit = hitTop(ray, topY);
        if (!hit) return;
        const theta      = Math.atan2(hit.x, hit.z);
        const rd         = Math.sqrt(hit.x * hit.x + hit.z * hit.z);
        const uGeom      = (p.tierId ?? 0) + 1 < tierCountRef.current
          ? ALL_TIER_GEOM[(p.tierId ?? 0) + 1] : null;
        const uRadius    = uGeom ? uGeom.radius : 0;
        const maxRdInset = Math.max(0, radius - uRadius - p.r);
        const rdInset    = Math.min(maxRdInset, Math.max(0, radius - rd));
        onDragPlacement(dragId.current, { thetaOffset: theta, rdInset });
      } else {
        const hit = hitSide(ray, topY, baseY, radius);
        if (!hit) return;
        const cakeH    = topY - baseY;
        const yFromTop = Math.max(0, Math.min(cakeH - p.r, topY - hit.y));
        onDragPlacement(dragId.current, { thetaOffset: hit.theta, yFromTop });
      }
    }

    function onUp() {
      dragId.current = null;
      isDrag.current = false;
      if (orbitRef.current) orbitRef.current.enabled = true;
    }

    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup',   onUp);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup',   onUp);
    };
  }, [gl, camera, placements, onDragPlacement]);

  // ── New-ball drag from sidebar ───────────────────────────────────────────────
  useEffect(() => {
    if (!draggingNewBall) {
      setPreviewPlacement(null);
      previewDataRef.current = null;
      if (orbitRef.current) orbitRef.current.enabled = true;
      return;
    }
    if (orbitRef.current) orbitRef.current.enabled = false;

    const PREVIEW_R = 0.12;

    function onMove(e) {
      const ray      = buildRay(e.clientX, e.clientY, gl.domElement, camera);
      const all      = placementsRef.current;
      const numTiers = tierCountRef.current;

      // Raycast against every tier to find which one the cursor is over.
      // Pick the tier whose hit point is closest along the ray (front-most).
      let bestTierIdx = -1;
      let bestHitDist = Infinity;

      for (let i = 0; i < numTiers; i++) {
        const { radius, topY, yBase: baseY } = ALL_TIER_GEOM[i];

        // Top hit: only valid outside the upper tier's footprint (annular ring region)
        const upperRadius = (i + 1 < numTiers) ? ALL_TIER_GEOM[i + 1].radius : 0;
        const topHit = hitTop(ray, topY);
        if (topHit) {
          const dist2D = Math.sqrt(topHit.x * topHit.x + topHit.z * topHit.z);
          if (dist2D <= radius + PREVIEW_R && dist2D >= upperRadius + PREVIEW_R) {
            const d = new THREE.Vector3().subVectors(topHit, ray.origin).dot(ray.direction);
            if (d > 0 && d < bestHitDist) { bestHitDist = d; bestTierIdx = i; }
          }
        }

        // Side hit: exclude within PREVIEW_R of yBase (ball must clear the shelf).
        const sideHit = hitSide(ray, topY, baseY, radius);
        if (sideHit && sideHit.y >= baseY + PREVIEW_R) {
          const hx = radius * Math.sin(sideHit.theta);
          const hz = radius * Math.cos(sideHit.theta);
          const d  = new THREE.Vector3(hx, sideHit.y, hz).sub(ray.origin).dot(ray.direction);
          if (d > 0 && d < bestHitDist) { bestHitDist = d; bestTierIdx = i; }
        }
      }

      if (bestTierIdx === -1) {
        previewDataRef.current = null;
        setPreviewPlacement(null);
        return;
      }

      const { radius, topY, yBase: baseY } = ALL_TIER_GEOM[bestTierIdx];
      const nonGap    = all.filter(x => x.surface !== 'gap' && (x.tierId ?? 0) === bestTierIdx);
      const prevUpperGeom = bestTierIdx + 1 < numTiers ? ALL_TIER_GEOM[bestTierIdx + 1] : null;

      // Returns true if any other tier cylinder blocks the camera→pos segment,
      // meaning the ball would appear to be inside the cake from the viewer's POV.
      function isBehindCake(pos, skipIdx) {
        const dx = pos.x - camera.position.x;
        const dy = pos.y - camera.position.y;
        const dz = pos.z - camera.position.z;
        const tBall = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (tBall < 0.01) return false;
        const nx = dx / tBall, ny = dy / tBall, nz = dz / tBall;
        for (let i = 0; i < numTiers; i++) {
          if (i === skipIdx) continue;
          const g = ALL_TIER_GEOM[i];
          const ox = camera.position.x, oz = camera.position.z;
          const a = nx * nx + nz * nz;
          if (a < 1e-6) continue;
          const b2 = 2 * (ox * nx + oz * nz);
          const c2 = ox * ox + oz * oz - g.radius * g.radius;
          const disc = b2 * b2 - 4 * a * c2;
          if (disc < 0) continue;
          const sqrtD = Math.sqrt(disc);
          for (const t of [(-b2 - sqrtD) / (2 * a), (-b2 + sqrtD) / (2 * a)]) {
            if (t < 0.01 || t > tBall - 0.01) continue;
            const y = camera.position.y + t * ny;
            if (y > g.yBase && y < g.topY) return true;
          }
        }
        return false;
      }

      // 1. Gap detection
      if (nonGap.length >= 2) {
        let bestGap = null, bestDist = Infinity;
        for (let i = 0; i < nonGap.length; i++) {
          for (let j = i + 1; j < nonGap.length; j++) {
            const pa = nonGap[i], pb = nonGap[j];
            const posA = placementPosition(pa, topY, radius, all, prevUpperGeom);
            const posB = placementPosition(pb, topY, radius, all, prevUpperGeom);
            const dA = PREVIEW_R + pa.r, dB = PREVIEW_R + pb.r;
            const d  = posA.distanceTo(posB);
            if (d < 0.0001 || d > dA + dB + 0.001) continue;

            const tA    = (d * d + dA * dA - dB * dB) / (2 * d);
            const perpR = Math.sqrt(Math.max(0, dA * dA - tA * tA));
            const ab    = posB.clone().sub(posA).normalize();
            const foot  = posA.clone().addScaledVector(ab, tA);

            const gapPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(ab, foot);
            const hitPt    = new THREE.Vector3();
            if (!ray.intersectPlane(gapPlane, hitPt)) continue;

            const distToFoot = hitPt.distanceTo(foot);
            if (distToFoot < perpR * 2.0 && distToFoot < bestDist) {
              const worldUp = new THREE.Vector3(0, 1, 0);
              let v1 = new THREE.Vector3().crossVectors(ab, worldUp);
              if (v1.lengthSq() < 0.0001) v1.set(1, 0, 0);
              v1.normalize();
              const v2        = new THREE.Vector3().crossVectors(ab, v1).normalize();
              const local     = hitPt.clone().sub(foot);
              const baseAngle = Math.atan2(v2.y, v1.y);
              const gapAngle  = Math.atan2(local.dot(v2), local.dot(v1)) - baseAngle;
              bestDist = distToFoot;
              bestGap  = { surface: 'gap', parentA: pa.id, parentB: pb.id, gapAngle, tierId: bestTierIdx };
            }
          }
        }
        if (bestGap) {
          previewDataRef.current = bestGap;
          setPreviewPlacement({ ...bestGap, id: '__preview__', type: 'sphere', r: PREVIEW_R, color: '#D4AF37' });
          return;
        }
      }

      // 2. Top surface
      // theta comes from hitSide (near-side only) to avoid placing the ball on the
      // back face of the tier. rdInset comes from hitTop dist2D, which is the same
      // regardless of near/far side and tells us how close to center the cursor is.
      const topHit = hitTop(ray, topY);
      if (topHit) {
        const dist = Math.sqrt(topHit.x * topHit.x + topHit.z * topHit.z);
        if (dist <= radius + PREVIEW_R) {
          const upperTierRadius = (bestTierIdx + 1 < numTiers) ? ALL_TIER_GEOM[bestTierIdx + 1].radius : 0;
          const maxRdInset = Math.max(0, radius - upperTierRadius - PREVIEW_R * 2);
          const rdInset = Math.min(Math.max(0, radius - dist), maxRdInset);
          // Near-side theta: extend the height range so we always get a cylinder hit.
          const nearHit = hitSide(ray, topY + 1000, baseY - 1000, radius);
          const thetaOffset = nearHit ? nearHit.theta : Math.atan2(topHit.x, topHit.z);
          const rd = radius - rdInset;
          const data = { surface: 'top', thetaOffset, rdInset, tierId: bestTierIdx };
          previewDataRef.current = data;
          setPreviewPlacement({ ...data, id: '__preview__', type: 'sphere', r: PREVIEW_R, color: '#D4AF37' });
          return;
        }
      }

      // 3. Side surface — guard the bottom edge so the ball clears the shelf.
      const sideHit = hitSide(ray, topY, baseY, radius);
      if (sideHit && sideHit.y >= baseY + PREVIEW_R) {
        const cakeH = topY - baseY;
        const yFromTop = Math.max(0, Math.min(cakeH - PREVIEW_R, topY - sideHit.y));
        const rd = radius + PREVIEW_R;
        const pos3d = new THREE.Vector3(rd * Math.sin(sideHit.theta), topY - yFromTop, rd * Math.cos(sideHit.theta));
        if (!isBehindCake(pos3d, bestTierIdx)) {
          const data = { surface: 'side', thetaOffset: sideHit.theta, yFromTop, tierId: bestTierIdx };
          previewDataRef.current = data;
          setPreviewPlacement({ ...data, id: '__preview__', type: 'sphere', r: PREVIEW_R, color: '#D4AF37' });
          return;
        }
      }

      previewDataRef.current = null;
      setPreviewPlacement(null);
    }

    function onUp() {
      const data = previewDataRef.current;
      if (data) onDropNewBallRef.current?.(data);
      previewDataRef.current = null;
      setPreviewPlacement(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingNewBall, gl, camera]);

  function handleSpherePointerDown(id) {
    dragId.current = id;
    isDrag.current = false;
    if (orbitRef.current) orbitRef.current.enabled = false;
    onSelectPlacement(id);
  }

  const activeGeom = ALL_TIER_GEOM[activeTierIdx];

  // Base plate radius = largest tier's radius + overhang
  const basePlateRadius = ALL_TIER_GEOM[0].radius + 0.6;

  return (
    <>
      <color attach="background" args={['#f4f4f5']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 14, 8]} intensity={1.5} castShadow />
      <directionalLight position={[-4, 4, -4]} intensity={0.4} />
      <SafeEnvironment preset="apartment" backgroundBlurriness={1} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={e => e.stopPropagation()}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#fce8d5" roughness={0.85} />
      </mesh>

      {/* Gold base plate */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[basePlateRadius, basePlateRadius, 0.1, 64]} />
        <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
      </mesh>

      {/* All cake tiers */}
      {Array.from({ length: tierCount }, (_, i) => {
        const geom = ALL_TIER_GEOM[i];
        return (
          <CakeTier
            key={i}
            radius={geom.radius}
            height={geom.height}
            color="#f5b8c8"
            yBase={geom.yBase}
            frostingType="buttercream"
            selected={false}
            topPiping={null}
            bottomPiping={null}
            topPipingSelected={false}
            bottomPipingSelected={false}
            onTopPipingClick={() => {}}
            onBottomPipingClick={() => {}}
            onClick={() => {}}
          />
        );
      })}

      {/* Click catchers — one set per tier; clicking any tier adds a ball to that tier */}
      {Array.from({ length: tierCount }, (_, i) => {
        const geom = ALL_TIER_GEOM[i];
        return (
          <group key={i}>
            {/* Top disc */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, geom.topY + 0.001, 0]}
              onClick={e => {
                e.stopPropagation();
                if (isDrag.current) return;
                const pt = e.point;
                onCakeTopClick?.({ thetaOffset: Math.atan2(pt.x, pt.z), tierId: i });
              }}
            >
              <circleGeometry args={[geom.radius * 0.98, 64]} />
              <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>

            {/* Side cylinder */}
            <mesh
              position={[0, (geom.topY + geom.yBase) / 2, 0]}
              onClick={e => {
                e.stopPropagation();
                if (isDrag.current) return;
                const pt = e.point;
                onCakeSideClick?.({
                  thetaOffset: Math.atan2(pt.x, pt.z),
                  yFromTop:    Math.max(0, geom.topY - pt.y),
                  tierId:      i,
                });
              }}
            >
              <cylinderGeometry args={[geom.radius, geom.radius, geom.topY - geom.yBase, 64, 1, true]} />
              <meshBasicMaterial transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>
          </group>
        );
      })}

      {/* Placements — each ball uses its own tier's geometry */}
      {placements.map(p => {
        const tierId    = p.tierId ?? 0;
        const geom      = ALL_TIER_GEOM[tierId];
        const tierBalls = placements.filter(x => (x.tierId ?? 0) === tierId);
        const upperGeom = tierId + 1 < tierCount ? ALL_TIER_GEOM[tierId + 1] : null;
        return (
          <SpherePlacement
            key={p.id}
            placement={p}
            topY={geom.topY}
            radius={geom.radius}
            upperGeom={upperGeom}
            all={tierBalls}
            selected={selectedId === p.id}
            overlapping={overlappingIds.has(p.id)}
            onPointerDown={handleSpherePointerDown}
          />
        );
      })}

      {/* Ghost preview for new-ball drag */}
      {previewPlacement && (() => {
        const tierIdx   = previewPlacement.tierId ?? activeTierIdx;
        const geom      = ALL_TIER_GEOM[tierIdx] ?? ALL_TIER_GEOM[0];
        const tierBalls = placementsRef.current.filter(x => (x.tierId ?? 0) === tierIdx);
        const upperGeom = tierIdx + 1 < tierCountRef.current ? ALL_TIER_GEOM[tierIdx + 1] : null;
        const pos = placementPosition(previewPlacement, geom.topY, geom.radius, tierBalls, upperGeom);
        return (
          <mesh position={pos}>
            <sphereGeometry args={[previewPlacement.r, 24, 24]} />
            <meshStandardMaterial
              color="#D4AF37"
              metalness={0.88}
              roughness={0.15}
              transparent
              opacity={0.55}
            />
          </mesh>
        );
      })()}

      <OrbitControls
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 2, 0]}
      />
    </>
  );
}

// ── Exported canvas ───────────────────────────────────────────────────────────

export default function PatternBuilderCanvas({
  placements = [],
  selectedId  = null,
  onSelectPlacement,
  onCakeTopClick,
  onCakeSideClick,
  onDragPlacement,
  draggingNewBall = false,
  onDropNewBall,
  tierCount    = 1,
  activeTierIdx = 0,
}) {
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <BuilderScene
        placements={placements}
        selectedId={selectedId}
        onSelectPlacement={onSelectPlacement}
        onCakeTopClick={onCakeTopClick}
        onCakeSideClick={onCakeSideClick}
        onDragPlacement={onDragPlacement}
        draggingNewBall={draggingNewBall}
        onDropNewBall={onDropNewBall}
        tierCount={tierCount}
        activeTierIdx={activeTierIdx}
      />
    </Canvas>
  );
}
