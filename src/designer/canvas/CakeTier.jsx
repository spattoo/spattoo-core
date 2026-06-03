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

const DEG = Math.PI / 180;

// ── Top piping ring — GLB shells instanced around the top edge ────────────────
function TopPipingRing({ topY, radius, glbPath, color = '#ffffff', sizeFactor = 1, rotationOffset = [0,0,0], selected = false, onClick }) {
  const { scene } = useGLTF(glbPath);

  const { geometry, shellScale } = useMemo(() => {
    const result = extractGeo(scene);
    if (!result) return { geometry: null, shellScale: 1 };
    return { geometry: result.geo, shellScale: (radius * 0.24) / result.sizeY * sizeFactor };
  }, [scene, radius, sizeFactor]);

  const positions = useMemo(() => {
    const spacingFactor = 0.28 * sizeFactor;
    const count = Math.max(8, Math.round((2 * Math.PI * radius) / (radius * spacingFactor)));
    const r = radius * 0.86;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { pos: [Math.cos(angle) * r, topY, Math.sin(angle) * r], rotY: angle };
    });
  }, [radius, topY, sizeFactor]);

  if (!geometry) return null;

  return (
    <group onClick={onClick}>
      {positions.map((u, i) => (
        <group key={i} position={u.pos} rotation={[0, u.rotY, 0]}>
          <mesh geometry={geometry}
            rotation={[rotationOffset[0] * DEG, rotationOffset[1] * DEG, rotationOffset[2] * DEG]}
            scale={shellScale} castShadow>
            <meshPhysicalMaterial
              color={color} roughness={0.85}
              sheen={0.4} sheenRoughness={0.9} sheenColor={color}
              emissive={selected ? '#6c47ff' : '#000000'}
              emissiveIntensity={selected ? 0.15 : 0}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Bottom piping ring — GLB shells hugging the cake base ─────────────────────
function BottomPipingRing({ yBase, radius, glbPath, color = '#f5e6c8', sizeFactor = 1, rotationOffset = [0,0,0], selected = false, onClick }) {
  const { scene } = useGLTF(glbPath);

  const { geometry, shellScale, positions } = useMemo(() => {
    const result = extractGeo(scene);
    if (!result) return { geometry: null, shellScale: 1, positions: [] };
    const sc = (radius * 0.24) / result.sizeY * sizeFactor;
    const step  = radius * 0.28 * sizeFactor;
    const count = Math.max(6, Math.round((2 * Math.PI * radius) / step));
    const r = radius * 1.01;                  // pressed against cake wall
    const y = yBase + sc * 0.5;              // lifted so element stands at base
    const pts = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { pos: [Math.cos(angle) * r, y, Math.sin(angle) * r], rotY: angle };
    });
    return { geometry: result.geo, shellScale: sc, positions: pts };
  }, [scene, radius, yBase, sizeFactor]);

  if (!geometry) return null;

  return (
    <group onClick={onClick}>
      {positions.map((u, i) => (
        <group key={i} position={u.pos} rotation={[0, u.rotY, 0]}>
          <mesh geometry={geometry}
            rotation={[rotationOffset[0] * DEG, rotationOffset[1] * DEG, rotationOffset[2] * DEG]}
            scale={shellScale} castShadow>
            <meshPhysicalMaterial
              color={color} roughness={0.85}
              sheen={0.4} sheenRoughness={0.9} sheenColor={color}
              emissive={selected ? '#6c47ff' : '#000000'}
              emissiveIntensity={selected ? 0.15 : 0}
            />
          </mesh>
        </group>
      ))}
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
            rotationOffset={topPiping.rotation ?? [0,0,0]}
            selected={topPipingSelected} onClick={e => { e.stopPropagation(); onTopPipingClick?.(e); }} />
        )}
        {bottomPiping && (
          <BottomPipingRing yBase={yBase} radius={radius} glbPath={bottomPiping.glbUrl} color={bottomPiping.color}
            sizeFactor={bottomPiping.size ?? 1}
            rotationOffset={bottomPiping.rotation ?? [0,0,0]}
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
          selected={topPipingSelected} onClick={e => { e.stopPropagation(); onTopPipingClick?.(e); }} />
      )}
      {bottomPiping && (
        <BottomPipingRing yBase={yBase} radius={radius} glbPath={bottomPiping.glbUrl} color={bottomPiping.color}
          sizeFactor={bottomPiping.size ?? 1}
          selected={bottomPipingSelected} onClick={e => { e.stopPropagation(); onBottomPipingClick?.(e); }} />
      )}
    </group>
  );
}
