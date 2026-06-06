import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

// ── Extract the single mesh from a per-style GLB ──────────────────────────────
function extractGeo(scene) {
  let geo = null;
  scene.traverse(obj => {
    if (obj.isMesh && !geo) geo = obj.geometry.clone();
  });
  if (!geo) return null;
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  geo.translate(-center.x, -box.min.y, -center.z);
  return { geo, sizeY: size.y };
}

// Bake a shell geometry from a GLB scene: optional flip (180° X + re-anchor to the base)
// and normalise size to ~24% of the tier radius. Returns the geometry plus the scale and
// bounding extents the ring uses for radius/spacing. Shared by version A and the alternate.
function buildShellGeo(scene, flip, radius, sizeFactor) {
  const result = extractGeo(scene);
  if (!result) return null;
  const geo = result.geo;
  if (flip) {
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
  }
  const sc = (radius * 0.24) / result.sizeY * sizeFactor;
  geo.computeBoundingBox();
  const bbSize = new THREE.Vector3(); geo.boundingBox.getSize(bbSize);
  return { geometry: geo, shellScale: sc, bbDepth: bbSize.z, bbWidth: bbSize.x };
}

const DEG = Math.PI / 180;

// Bend a flat piping ring into `swagCount` scalloped drapes (garland/swag look).
// Returns one entry per shell { pos, rotY, tq }:
//   pos  — world position, with the scallop drop baked into y
//   rotY — yaw so the shell faces outward (same as the flat ring)
//   tq   — a quaternion [x,y,z,w] that pitches the shell about the WORLD radial
//          axis to follow the drape's slope. Pitching about the radial axis (not a
//          shell-local axis) is independent of the GLB's internal orientation, so it
//          leans the upright shell along the drape instead of rolling it.
// Shells are spaced by equal arc-length ALONG the draped curve (not the flat circle)
// so they stay touching through the dips. swagDepth/swagTilt are in cake units / 0–1.
// The calibrator (PipingCalibrator.jsx) keeps an identical copy for an exact preview.
function buildSwagRing({ r, baseY, step, swagCount, swagDepth, swagTilt = 0.5 }) {
  const dipAt = a => -swagDepth * (1 - Math.cos(a * swagCount)) / 2;
  // Sample the wavy circle and accumulate arc length.
  const N = 1440;
  const cum = [0];
  let px = r, py = baseY + dipAt(0), pz = 0;
  for (let s = 1; s <= N; s++) {
    const a = (s / N) * Math.PI * 2;
    const cx = Math.cos(a) * r, cy = baseY + dipAt(a), cz = Math.sin(a) * r;
    cum.push(cum[s - 1] + Math.hypot(cx - px, cy - py, cz - pz));
    px = cx; py = cy; pz = cz;
  }
  const total = cum[N];
  const count = Math.max(6, Math.round(total / step));
  const out = [];
  let seg = 0;
  for (let j = 0; j < count; j++) {
    const target = (j / count) * total;            // monotonically increasing
    while (seg < N && cum[seg + 1] < target) seg++;
    const a0 = (seg / N) * Math.PI * 2, a1 = ((seg + 1) / N) * Math.PI * 2;
    const f  = (target - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
    const a  = a0 + (a1 - a0) * f;
    const slope = -(swagDepth * swagCount / 2) * Math.sin(a * swagCount); // d(dip)/d(angle)
    const tilt  = -swagTilt * Math.atan2(slope, r);
    const sh = Math.sin(tilt / 2), ch = Math.cos(tilt / 2);
    // Rotation about world radial axis (cos a, 0, sin a).
    const tq = [Math.cos(a) * sh, 0, Math.sin(a) * sh, ch];
    out.push({ pos: [Math.cos(a) * r, baseY + dipAt(a), Math.sin(a) * r], rotY: a, tq });
  }
  return out;
}

// One piping shell: position + facing on the ring, with X/Z tilt and Y-yaw offset baked in.
function Shell({ pos, rotY, tq, ryGroup, meshRot, geometry, shellScale, color, selected }) {
  return (
    <group position={pos} quaternion={tq}>
      <group rotation={[0, -rotY + Math.PI / 2 + ryGroup, 0]}>
        <mesh geometry={geometry} rotation={meshRot} scale={shellScale} castShadow>
          <meshPhysicalMaterial
            color={color} roughness={0.85}
            sheen={0.4} sheenRoughness={0.9} sheenColor={color}
            emissive={selected ? '#6c47ff' : '#000000'}
            emissiveIntensity={selected ? 0.15 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}

// Render every position, alternating between version A and the alternate B per `pattern`
// (a repeating cycle like "AB" or "AAB"). B uses its own geometry, rotation, and a radial/
// height shift relative to A. When B is absent / not active, every shell is A (unchanged).
function renderShells({ positions, A, B, baseRotation, altRotation, altActive, pattern, dRadialB, dYB, color, selected }) {
  const ryA = baseRotation[1] * DEG, meshA = [baseRotation[0] * DEG, 0, baseRotation[2] * DEG];
  const ryB = altRotation[1] * DEG,  meshB = [altRotation[0] * DEG, 0, altRotation[2] * DEG];
  const L = pattern.length || 1;
  return positions.map((u, i) => {
    const isB = altActive && B && pattern[i % L] === 'B';
    const ver = isB ? B : A;
    let pos = u.pos;
    if (isB && (dRadialB || dYB)) {
      const [px, , pz] = u.pos;
      const len = Math.hypot(px, pz) || 1;
      pos = [px + (px / len) * dRadialB, u.pos[1] + dYB, pz + (pz / len) * dRadialB];
    }
    return (
      <Shell key={u.key ?? i} pos={pos} rotY={u.rotY} tq={u.tq}
        ryGroup={isB ? ryB : ryA} meshRot={isB ? meshB : meshA}
        geometry={ver.geometry} shellScale={ver.shellScale} color={color} selected={selected} />
    );
  });
}

// ── Top piping ring — GLB shells hugging the top edge ─────────────────────────
// Mirrors BottomPipingRing's placement model so the rim is driven entirely by
// placement_config (top_rotation / top_radial_offset / top_y_offset / top_flip),
// just anchored at the top edge instead of the base.
//
// Thin wrapper that bails out BEFORE any hooks run when there's no GLB to load
// (e.g. the "piping pattern" style carries no image/model URL). useGLTF(null)
// throws deep in the loader, so the guard has to live above the hook-bearing Impl.
export function TopPipingRing(props) {
  if (!props.glbPath) return null;
  return <TopPipingRingImpl {...props} />;
}
function TopPipingRingImpl({
  topY, radius, glbPath, color = '#ffffff', sizeFactor = 1,
  topRotation       = [0, 0, 0],
  extraRadialOffset = 0,
  yOffset           = 0,
  flipTop = false,
  spacing = 1,
  swagCount = 0, swagDepth = 0, swagTilt = 0.5,
  arrangement = 'ring', instances = null,
  altEnabled = false, altGlbUrl = null, altFlip = false, altRotation = [0, 0, 0],
  altRadialOffset = 0, altYOffset = 0, pattern = 'AB',
  selected = false, onClick,
}) {
  const { scene }          = useGLTF(glbPath);
  const { scene: sceneAlt } = useGLTF(altGlbUrl || glbPath);

  const A = useMemo(() => buildShellGeo(scene, flipTop, radius, sizeFactor),
    [scene, flipTop, radius, sizeFactor]);
  const B = useMemo(() => (altEnabled ? buildShellGeo(sceneAlt, altFlip, radius, sizeFactor) : null),
    [altEnabled, sceneAlt, altFlip, radius, sizeFactor]);

  const altActive = altEnabled && arrangement !== 'single';

  const positions = useMemo(() => {
    if (!A) return [];
    // Rim sits ON the top surface: pull shells inward so their outer face is flush
    // with the edge rather than overhanging the side like the board does.
    const r    = radius - (A.bbDepth / 2) * A.shellScale + extraRadialOffset;
    const step = A.shellScale * A.bbWidth * 0.9 * sizeFactor * spacing;
    if (arrangement === 'single') {
      const list = instances?.length ? instances : [{ angle: 0 }];
      return list.map(inst => {
        const angle = inst.angle ?? 0;
        return { pos: [Math.cos(angle) * r, topY + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1], key: inst.id };
      });
    }
    if (swagCount > 0 && swagDepth > 0) {
      return buildSwagRing({ r, baseY: topY + yOffset, step, swagCount, swagDepth, swagTilt });
    }
    let count = Math.max(6, Math.round((2 * Math.PI * r) / step));
    // Round up to a whole number of pattern cycles so the alternation closes cleanly.
    if (altActive) { const L = pattern.length || 1; count = Math.max(L, Math.ceil(count / L) * L); }
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { pos: [Math.cos(angle) * r, topY + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1] };
    });
  }, [A, radius, topY, yOffset, sizeFactor, spacing, extraRadialOffset, swagCount, swagDepth, swagTilt, arrangement, instances, altActive, pattern]);

  if (!A) return null;

  return (
    <group onClick={onClick}>
      {renderShells({
        positions, A, B, baseRotation: topRotation, altRotation, altActive, pattern,
        dRadialB: altRadialOffset - extraRadialOffset, dYB: altYOffset - yOffset,
        color, selected,
      })}
    </group>
  );
}

// ── Bottom piping ring — GLB shells hugging the cake base ─────────────────────
// Thin wrapper that bails out BEFORE any hooks run when there's no GLB to load
// (e.g. the "piping pattern" style carries no image/model URL). useGLTF(null)
// throws deep in the loader, so the guard has to live above the hook-bearing Impl.
export function BottomPipingRing(props) {
  if (!props.glbPath) return null;
  return <BottomPipingRingImpl {...props} />;
}
function BottomPipingRingImpl({
  yBase, radius, glbPath, color = '#f5e6c8', sizeFactor = 1,
  bottomRotation    = [0, 0, 0],
  extraRadialOffset = 0,
  yOffset           = 0,
  flipBottom = true,
  spacing = 1,
  swagCount = 0, swagDepth = 0, swagTilt = 0.5,
  arrangement = 'ring', instances = null,
  altEnabled = false, altGlbUrl = null, altFlip = false, altRotation = [0, 0, 0],
  altRadialOffset = 0, altYOffset = 0, pattern = 'AB',
  selected = false, onClick,
}) {
  const { scene }          = useGLTF(glbPath);
  const { scene: sceneAlt } = useGLTF(altGlbUrl || glbPath);

  const A = useMemo(() => buildShellGeo(scene, flipBottom, radius, sizeFactor),
    [scene, flipBottom, radius, sizeFactor]);
  const B = useMemo(() => (altEnabled ? buildShellGeo(sceneAlt, altFlip, radius, sizeFactor) : null),
    [altEnabled, sceneAlt, altFlip, radius, sizeFactor]);

  const altActive = altEnabled && arrangement !== 'single';

  const positions = useMemo(() => {
    if (!A) return [];
    const r    = radius + (A.bbDepth / 2) * A.shellScale + extraRadialOffset;
    const step = A.shellScale * A.bbWidth * 0.9 * sizeFactor * spacing;
    if (arrangement === 'single') {
      const list = instances?.length ? instances : [{ angle: 0 }];
      return list.map(inst => {
        const angle = inst.angle ?? 0;
        return { pos: [Math.cos(angle) * r, yBase + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1], key: inst.id };
      });
    }
    if (swagCount > 0 && swagDepth > 0) {
      return buildSwagRing({ r, baseY: yBase + yOffset, step, swagCount, swagDepth, swagTilt });
    }
    let count = Math.max(6, Math.round((2 * Math.PI * r) / step));
    // Round up to a whole number of pattern cycles so the alternation closes cleanly.
    if (altActive) { const L = pattern.length || 1; count = Math.max(L, Math.ceil(count / L) * L); }
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { pos: [Math.cos(angle) * r, yBase + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1] };
    });
  }, [A, radius, yBase, yOffset, sizeFactor, spacing, extraRadialOffset, swagCount, swagDepth, swagTilt, arrangement, instances, altActive, pattern]);

  if (!A) return null;

  return (
    <group onClick={onClick}>
      {renderShells({
        positions, A, B, baseRotation: bottomRotation, altRotation, altActive, pattern,
        dRadialB: altRadialOffset - extraRadialOffset, dYB: altYOffset - yOffset,
        color, selected,
      })}
    </group>
  );
}

// ── Piped rosette — spiral TubeGeometry ──────────────────────────────────────
function PipedRosette({ position, color, scale = 1 }) {
  const geometry = useMemo(() => {
    const points = [];
    const loops = 2.6;
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * loops * Math.PI * 2;
      const r = (1 - t * 0.68) * 0.13 * scale;
      const y = t * 0.10 * scale;
      points.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.022 * scale, 7, false);
  }, [scale]);

  return (
    <mesh geometry={geometry} position={position} castShadow>
      <meshStandardMaterial color={color} roughness={0.62} />
    </mesh>
  );
}

function PipedTop({ topY, radius, color }) {
  const spots = useMemo(() => {
    const ringR = radius * 0.6;
    const count = Math.max(5, Math.round(radius * 5.5));
    const result = [{ x: 0, z: 0, scale: 1.0 }];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      result.push({ x: Math.cos(angle) * ringR, z: Math.sin(angle) * ringR, scale: 0.76 });
    }
    return result;
  }, [radius]);

  return (
    <group>
      {spots.map((s, i) => (
        <PipedRosette key={i} position={[s.x, topY + 0.01, s.z]} color={color} scale={s.scale} />
      ))}
    </group>
  );
}

const SPONGE_COLORS = {
  vanilla:      '#f0d98a',
  chocolate:    '#4a2210',
  redvelvet:    '#8b1a1a',
  butterscotch: '#c8860a',
};

function NakedLayers({ radius, yBase, height, flavour }) {
  const spongeColor = SPONGE_COLORS[flavour] || '#f0d98a';
  const layers  = 3;
  const spongeH = (height * 0.62) / layers;
  const creamH  = (height * 0.38) / (layers - 1);

  const stack = [];
  let y = yBase;
  for (let i = 0; i < layers; i++) {
    stack.push({ y, h: spongeH, color: spongeColor, rough: 0.88 });
    y += spongeH;
    if (i < layers - 1) {
      stack.push({ y, h: creamH, color: '#fffdf5', rough: 0.50 });
      y += creamH;
    }
  }

  return (
    <group>
      {stack.map((layer, i) => (
        <mesh key={i} position={[0, layer.y + layer.h / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius, layer.h, 64]} />
          <meshStandardMaterial color={layer.color} roughness={layer.rough} />
        </mesh>
      ))}
    </group>
  );
}

const FROSTING_MAT = {
  buttercream: { roughness: 0.68, metalness: 0.00 },
  whipped:     { roughness: 0.82, metalness: 0.00 },
  fondant:     { roughness: 0.08, metalness: 0.03 },
};

// ── Selection outline ─────────────────────────────────────────────────────────
function SelectionOutline({ radius, yBase, height }) {
  const geometry = useMemo(() => {
    const cyl = new THREE.CylinderGeometry(radius + 0.05, radius + 0.05, height + 0.05, 20);
    return new THREE.EdgesGeometry(cyl);
  }, [radius, height]);

  return (
    <lineSegments position={[0, yBase + height / 2, 0]} geometry={geometry}>
      <lineBasicMaterial color="#6c47ff" linewidth={2} />
    </lineSegments>
  );
}

export default function CakeTier({
  radius, height, color, yBase,
  frostingType = 'buttercream',
  flavour = 'vanilla',
  selected = false,
  topPiping = null,
  bottomPiping = null,
  topPipingSelected = false,
  bottomPipingSelected = false,
  onTopPipingClick,
  onBottomPipingClick,
  onClick,
}) {
  const topY    = yBase + height;
  const centerY = yBase + height / 2;
  const mat = FROSTING_MAT[frostingType] ?? FROSTING_MAT.buttercream;

  function handleClick(e) {
    e.stopPropagation();
    if (topPiping && e.point.y > topY - height * 0.25) {
      onTopPipingClick?.(e);
    } else if (bottomPiping && e.point.y < yBase + height * 0.25) {
      onBottomPipingClick?.(e);
    } else {
      onClick?.(e);
    }
  }

  if (frostingType === 'naked') {
    return (
      <group onClick={handleClick}>
        {selected && <SelectionOutline radius={radius} yBase={yBase} height={height} />}
        <NakedLayers radius={radius} yBase={yBase} height={height} flavour={flavour} />
        <mesh position={[0, topY + 0.01, 0]}>
          <cylinderGeometry args={[radius - 0.01, radius - 0.01, 0.02, 64]} />
          <meshStandardMaterial color="#fffdf5" roughness={0.5} />
        </mesh>
        {topPiping && (
          <TopPipingRing topY={topY} radius={radius} glbPath={topPiping.glbUrl} color={topPiping.color}
            sizeFactor={topPiping.size ?? 1}
            topRotation={topPiping.rotation ?? [0,0,0]}
            extraRadialOffset={topPiping.extraRadialOffset ?? 0}
            yOffset={(topPiping.yOffset ?? 0) + (topPiping.userYOffset ?? 0)}
            flipTop={topPiping.userFlipTop !== undefined ? topPiping.userFlipTop : (topPiping.flipTop ?? false)}
            spacing={topPiping.spacing ?? 1}
            swagCount={topPiping.swagCount ?? 0} swagDepth={topPiping.swagDepth ?? 0} swagTilt={topPiping.swagTilt ?? 0.5}
            arrangement={topPiping.arrangement ?? 'ring'} instances={topPiping.instances ?? null}
            altEnabled={topPiping.altEnabled ?? false} altGlbUrl={topPiping.altGlbUrl ?? null}
            altFlip={topPiping.altFlip ?? false} altRotation={topPiping.altRotation ?? [0,0,0]}
            altRadialOffset={topPiping.altRadialOffset ?? 0} altYOffset={(topPiping.altYOffset ?? 0) + (topPiping.userYOffset ?? 0)}
            pattern={topPiping.pattern ?? 'AB'}
            selected={topPipingSelected} onClick={e => { e.stopPropagation(); onTopPipingClick?.(e); }} />
        )}
        {bottomPiping && (
          <BottomPipingRing yBase={yBase} radius={radius} glbPath={bottomPiping.glbUrl} color={bottomPiping.color}
            sizeFactor={bottomPiping.size ?? 1}
            bottomRotation={bottomPiping.bottomRotation ?? [0,0,0]}
            extraRadialOffset={bottomPiping.extraRadialOffset ?? 0}
            yOffset={(bottomPiping.yOffset ?? 0) + (bottomPiping.userYOffset ?? 0)}
            flipBottom={bottomPiping.userFlipBottom !== undefined ? bottomPiping.userFlipBottom : (bottomPiping.flipBottom ?? true)}
            spacing={bottomPiping.spacing ?? 1}
            swagCount={bottomPiping.swagCount ?? 0} swagDepth={bottomPiping.swagDepth ?? 0} swagTilt={bottomPiping.swagTilt ?? 0.5}
            arrangement={bottomPiping.arrangement ?? 'ring'} instances={bottomPiping.instances ?? null}
            altEnabled={bottomPiping.altEnabled ?? false} altGlbUrl={bottomPiping.altGlbUrl ?? null}
            altFlip={bottomPiping.altFlip ?? false} altRotation={bottomPiping.altRotation ?? [0,0,0]}
            altRadialOffset={bottomPiping.altRadialOffset ?? 0} altYOffset={(bottomPiping.altYOffset ?? 0) + (bottomPiping.userYOffset ?? 0)}
            pattern={bottomPiping.pattern ?? 'AB'}
            selected={bottomPipingSelected} onClick={e => { e.stopPropagation(); onBottomPipingClick?.(e); }} />
        )}
      </group>
    );
  }

  return (
    <group onClick={handleClick}>
      {selected && <SelectionOutline radius={radius} yBase={yBase} height={height} />}
      <mesh position={[0, centerY, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 64]} />
        <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
      </mesh>
      <mesh position={[0, topY + 0.01, 0]} castShadow>
        <cylinderGeometry args={[radius - 0.01, radius - 0.01, 0.02, 64]} />
        <meshStandardMaterial color={color} roughness={mat.roughness - 0.08} />
      </mesh>
      {topPiping && (
        <TopPipingRing topY={topY} radius={radius} glbPath={topPiping.glbUrl} color={topPiping.color}
          sizeFactor={topPiping.size ?? 1}
          topRotation={topPiping.rotation ?? [0,0,0]}
          extraRadialOffset={topPiping.extraRadialOffset ?? 0}
          yOffset={(topPiping.yOffset ?? 0) + (topPiping.userYOffset ?? 0)}
          flipTop={topPiping.userFlipTop !== undefined ? topPiping.userFlipTop : (topPiping.flipTop ?? false)}
          spacing={topPiping.spacing ?? 1}
          swagCount={topPiping.swagCount ?? 0} swagDepth={topPiping.swagDepth ?? 0} swagTilt={topPiping.swagTilt ?? 0.5}
          arrangement={topPiping.arrangement ?? 'ring'} instances={topPiping.instances ?? null}
          altEnabled={topPiping.altEnabled ?? false} altGlbUrl={topPiping.altGlbUrl ?? null}
          altFlip={topPiping.altFlip ?? false} altRotation={topPiping.altRotation ?? [0,0,0]}
          altRadialOffset={topPiping.altRadialOffset ?? 0} altYOffset={(topPiping.altYOffset ?? 0) + (topPiping.userYOffset ?? 0)}
          pattern={topPiping.pattern ?? 'AB'}
          selected={topPipingSelected} onClick={e => { e.stopPropagation(); onTopPipingClick?.(e); }} />
      )}
      {bottomPiping && (
        <BottomPipingRing yBase={yBase} radius={radius} glbPath={bottomPiping.glbUrl} color={bottomPiping.color}
          sizeFactor={bottomPiping.size ?? 1}
          bottomRotation={bottomPiping.bottomRotation ?? [0,0,0]}
          extraRadialOffset={bottomPiping.extraRadialOffset ?? 0}
          yOffset={(bottomPiping.yOffset ?? 0) + (bottomPiping.userYOffset ?? 0)}
          flipBottom={bottomPiping.userFlipBottom !== undefined ? bottomPiping.userFlipBottom : (bottomPiping.flipBottom ?? true)}
          spacing={bottomPiping.spacing ?? 1}
          swagCount={bottomPiping.swagCount ?? 0} swagDepth={bottomPiping.swagDepth ?? 0} swagTilt={bottomPiping.swagTilt ?? 0.5}
          arrangement={bottomPiping.arrangement ?? 'ring'} instances={bottomPiping.instances ?? null}
          altEnabled={bottomPiping.altEnabled ?? false} altGlbUrl={bottomPiping.altGlbUrl ?? null}
          altFlip={bottomPiping.altFlip ?? false} altRotation={bottomPiping.altRotation ?? [0,0,0]}
          altRadialOffset={bottomPiping.altRadialOffset ?? 0} altYOffset={(bottomPiping.altYOffset ?? 0) + (bottomPiping.userYOffset ?? 0)}
          pattern={bottomPiping.pattern ?? 'AB'}
          selected={bottomPipingSelected} onClick={e => { e.stopPropagation(); onBottomPipingClick?.(e); }} />
      )}
    </group>
  );
}
