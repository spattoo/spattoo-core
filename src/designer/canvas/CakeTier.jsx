import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tierShape, pipingPerimeter, rectEdgeRing } from '../geometry/surface.js';
import { buildFestoons } from '../geometry/festoon.js';
import { PIPING_FRONT_ANGLE, TIER_RADII, BEND_ANCHOR_FRAC } from '../constants.js';
import { SHELL_HEIGHT_FRAC, setShellExtents } from './pipingMetrics.js';

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
function buildShellGeo(scene, flip, radius, sizeFactor, tiltDeg = [0, 0, 0]) {
  const result = extractGeo(scene);
  if (!result) return null;
  const geo = result.geo;
  if (flip) {
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
  }
  geo.computeBoundingBox();
  const bbSize = new THREE.Vector3(); geo.boundingBox.getSize(bbSize);
  // Height-normalised base scale (upright shell ≈ SHELL_HEIGHT_FRAC of the tier radius
  // tall) × the user's size.
  const sc1 = (radius * SHELL_HEIGHT_FRAC) / result.sizeY;
  const sc  = capShellScale(sc1, sizeFactor, bbSize.z, radius);
  // True rendered vertical reach: transform the shell's bounding box by the same scale and
  // tilt (meshRot X/Z — the renderer's yaw about Y and swag don't change Y extent) the Shell
  // mesh applies, so worldTopY/worldBotY are how far the shell actually reaches above/below
  // its anchor. This is what makes "top edge touches the rim" exact for tilted shells.
  const m = new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(tiltDeg[0] * DEG, 0, tiltDeg[2] * DEG))
    .multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
  const wbox = geo.boundingBox.clone().applyMatrix4(m);
  // worldTopY/BotY → vertical reach; worldMaxZ/MinZ → radial reach (local z = the radial axis
  // the renderer places along), both AFTER the tilt, so the editor's clamps match the pixels.
  return {
    geometry: geo, shellScale: sc, bbDepth: bbSize.z, bbWidth: bbSize.x,
    worldTopY: wbox.max.y, worldBotY: wbox.min.y,
    worldMaxZ: wbox.max.z, worldMinZ: wbox.min.z,
  };
}

const DEG = Math.PI / 180;

// Cream piping must hug the cake, not float off it. The shell's radial depth (how far it
// reaches off the wall) is limited dynamically to a fraction of the tier radius — so a
// smaller tier gets a tighter limit. Past the limit, raising the size slider no longer
// enlarges the shell, which is what keeps the cream from leaving the cake.
const PIPING_MAX_DEPTH_FRAC = 0.16;

// How far (as a fraction of the tier radius) the radial control may push the BOARD border
// OUTWARD past its default (inner face on the wall) before it's capped — keeps it attached to
// the cake rather than drifting onto the board. Inward travel is unrestricted.
const PIPING_RADIAL_PLAY = 0.4;

// Cap the user-scaled shell scale so its rendered radial depth (bbDepthZ × scale) never
// exceeds PIPING_MAX_DEPTH_FRAC of the tier radius. The max() floor keeps a little growth
// headroom even when the size-1.0 shell is already deep, so the slider is never fully dead.
function capShellScale(sc1, sizeFactor, bbDepthZ, radius) {
  const maxSc = Math.max(sc1 * 1.15, (radius * PIPING_MAX_DEPTH_FRAC) / bbDepthZ);
  return Math.min(sc1 * sizeFactor, maxSc);
}

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

// Place ONE single-mode shell on a perimeter. The instance `angle` is read as a fraction
// of the way round (relative to the cake front), so the existing front-relative angle
// sliders keep working on rectangles.
function perimeterSinglePos({ perim, off, baseY, angle }) {
  const f = ((((angle - PIPING_FRONT_ANGLE) / (2 * Math.PI)) % 1) + 1) % 1;
  const p = perim.at(f * perim.length);
  return { pos: [p.x + off * p.nx, baseY, p.z + off * p.nz], rotY: Math.atan2(p.nz, p.nx), tq: [0, 0, 0, 1] };
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

// Render the bent-strip festoons (U-shaped swags). Each entry is a pre-bent BufferGeometry
// from buildFestoons(); we just paint them in the ring's colour with the same cream material.
function renderFestoons({ festoonGeos, color, selected }) {
  return festoonGeos.map((g, i) => (
    <mesh key={i} geometry={g} castShadow>
      <meshPhysicalMaterial
        color={color} roughness={0.85}
        sheen={0.4} sheenRoughness={0.9} sheenColor={color}
        emissive={selected ? '#6c47ff' : '#000000'}
        emissiveIntensity={selected ? 0.15 : 0}
      />
    </mesh>
  ));
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
  shape = null,
  bend = false, bendRing = false, festoons = 6, bendDepth = 0.4, bendTilt = 0,
  selected = false, onClick,
}) {
  const { scene }          = useGLTF(glbPath);
  const { scene: sceneAlt } = useGLTF(altGlbUrl || glbPath);

  const tr0 = topRotation?.[0] ?? 0, tr2 = topRotation?.[2] ?? 0;
  const A = useMemo(() => buildShellGeo(scene, flipTop, radius, sizeFactor, [tr0, 0, tr2]),
    [scene, flipTop, radius, sizeFactor, tr0, tr2]);
  const B = useMemo(() => (altEnabled ? buildShellGeo(sceneAlt, altFlip, radius, sizeFactor) : null),
    [altEnabled, sceneAlt, altFlip, radius, sizeFactor]);

  // Publish this rim shell's exact post-tilt radial reach (relative to the rim edge, as radius
  // fractions) so the editor's radial control stops the ring precisely when its outer/inner edge
  // touches a neighbouring ring or the rim — matching the rendered pixels, not the raw bbox.
  useEffect(() => {
    if (A && glbPath && radius) {
      const halfRaw = (A.bbDepth * A.shellScale) / 2;   // the render's positioning `half`
      setShellExtents(glbPath, flipTop, sizeFactor, {
        topFrac: A.worldTopY / radius, botFrac: A.worldBotY / radius,
        radialOutFrac: (A.worldMaxZ - halfRaw) / radius,
        radialInFrac:  (A.worldMinZ - halfRaw) / radius,
      });
    }
  }, [A, glbPath, flipTop, sizeFactor, radius]);

  const altActive = altEnabled && arrangement !== 'single';

  const positions = useMemo(() => {
    if (!A) return [];
    // Rim sits ON the top surface: pull shells inward so their outer face is flush
    // with the edge. extraRadialOffset (incl. the user's radial control) may pull the
    // cream inward, but never push it past the edge — clamp the outer face to the rim.
    const half = (A.bbDepth / 2) * A.shellScale;
    const off  = Math.min(-half + extraRadialOffset, -half);   // outer face ≤ cake edge
    const r    = radius + off;
    const step = A.shellScale * A.bbWidth * 0.9 * spacing;   // tracks rendered shell width (scale already capped)
    // Rectangular (sheet) cakes walk a rounded-rect perimeter; round cakes keep the circle.
    const perim = shape?.kind === 'rect' ? pipingPerimeter(shape) : null;
    if (arrangement === 'single') {
      const list = instances?.length ? instances : [{ angle: 0 }];
      return list.map(inst => {
        const angle = inst.angle ?? 0;
        if (perim) return { ...perimeterSinglePos({ perim, off, baseY: topY + yOffset, angle }), key: inst.id };
        return { pos: [Math.cos(angle) * r, topY + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1], key: inst.id };
      });
    }
    if (perim) {
      return rectEdgeRing(shape, off, step, topY + yOffset);
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
  }, [A, radius, topY, yOffset, sizeFactor, spacing, extraRadialOffset, swagCount, swagDepth, swagTilt, arrangement, instances, altActive, pattern, shape]);

  // U-shaped (bend) elements: bend the whole strip into festoons draped from the rim edge,
  // instead of repeating a discrete shell. Round cakes only (rect falls through to shells).
  const festoonGeos = useMemo(() => {
    if (!bend || !scene || shape?.kind === 'rect') return null;
    // flip:false to match the calibrator's bend preview, which always bends the un-flipped
    // strip (the flip toggle/bottom_flip applies to discrete shells, not festoons).
    // The cross-section scales with radius automatically (uscale); scale the absolute drop
    // (bendDepth, tuned at the standard tier radius) by the same ratio so the whole swag
    // shrinks to fit a smaller tier instead of dropping a fixed amount.
    return buildFestoons(scene, {
      flip: false, festoons, depth: bendDepth * (radius / TIER_RADII[0]), tilt: bendTilt * DEG,
      attachY: topY + yOffset, radius: radius + extraRadialOffset,
      spread: bendRing ? 1.0 : 0.96, sizeFactor,
    });
  }, [bend, scene, shape, festoons, bendDepth, bendTilt, topY, yOffset, radius, extraRadialOffset, bendRing, sizeFactor]);

  if (!A && !festoonGeos) return null;

  return (
    <group onClick={onClick}>
      {festoonGeos
        ? renderFestoons({ festoonGeos, color, selected })
        : renderShells({
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
  shape = null,
  bend = false, bendRing = false, festoons = 6, bendDepth = 0.4, bendTilt = 0,
  selected = false, onClick,
}) {
  const { scene }          = useGLTF(glbPath);
  const { scene: sceneAlt } = useGLTF(altGlbUrl || glbPath);

  const br0 = bottomRotation?.[0] ?? 0, br2 = bottomRotation?.[2] ?? 0;
  const A = useMemo(() => buildShellGeo(scene, flipBottom, radius, sizeFactor, [br0, 0, br2]),
    [scene, flipBottom, radius, sizeFactor, br0, br2]);
  const B = useMemo(() => (altEnabled ? buildShellGeo(sceneAlt, altFlip, radius, sizeFactor) : null),
    [altEnabled, sceneAlt, altFlip, radius, sizeFactor]);

  // Publish this shell's exact rendered extents (as radius fractions) for the editor's clamps:
  // vertical reach for the Height clamp, post-tilt radial reach for the radial clamp — so the
  // contact tests are precise instead of guessed.
  useEffect(() => {
    if (A && glbPath && radius) {
      const halfRaw = (A.bbDepth * A.shellScale) / 2;
      setShellExtents(glbPath, flipBottom, sizeFactor, {
        topFrac: A.worldTopY / radius, botFrac: A.worldBotY / radius,
        radialOutFrac: (A.worldMaxZ - halfRaw) / radius,
        radialInFrac:  (A.worldMinZ - halfRaw) / radius,
      });
    }
  }, [A, glbPath, flipBottom, sizeFactor, radius]);

  const altActive = altEnabled && arrangement !== 'single';

  const positions = useMemo(() => {
    if (!A) return [];
    // Board: inner face sits on the wall by default, so growing the size pushes the cream
    // OUTWARD (and up), never into the cake. The radial control (extraRadialOffset) shifts it
    // in/out; outward travel is capped at PIPING_RADIAL_PLAY of the radius so the border stays
    // attached rather than drifting onto the board. Inward travel is unrestricted.
    const half = (A.bbDepth / 2) * A.shellScale;
    const off  = half + Math.min(extraRadialOffset, radius * PIPING_RADIAL_PLAY);
    const r    = radius + off;
    const step = A.shellScale * A.bbWidth * 0.9 * spacing;   // tracks rendered shell width (scale already capped)
    const perim = shape?.kind === 'rect' ? pipingPerimeter(shape) : null;
    if (arrangement === 'single') {
      const list = instances?.length ? instances : [{ angle: 0 }];
      return list.map(inst => {
        const angle = inst.angle ?? 0;
        if (perim) return { ...perimeterSinglePos({ perim, off, baseY: yBase + yOffset, angle }), key: inst.id };
        return { pos: [Math.cos(angle) * r, yBase + yOffset, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1], key: inst.id };
      });
    }
    if (perim) {
      return rectEdgeRing(shape, off, step, yBase + yOffset);
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
  }, [A, radius, yBase, yOffset, sizeFactor, spacing, extraRadialOffset, swagCount, swagDepth, swagTilt, arrangement, instances, altActive, pattern, shape]);

  // U-shaped (bend) elements: bend the whole strip into festoons draped on the wall from the
  // base, instead of repeating a discrete shell. Round cakes only (rect falls through).
  const festoonGeos = useMemo(() => {
    if (!bend || !scene || shape?.kind === 'rect') return null;
    // flip:false to match the calibrator's bend preview, which always bends the un-flipped
    // strip (the flip toggle/bottom_flip applies to discrete shells, not festoons).
    // The cross-section scales with radius automatically (uscale); scale the absolute drop
    // (bendDepth, tuned at the standard tier radius) by the same ratio so the whole swag
    // shrinks to fit a smaller tier instead of dropping a fixed amount.
    return buildFestoons(scene, {
      flip: false, festoons, depth: bendDepth * (radius / TIER_RADII[0]), tilt: bendTilt * DEG,
      attachY: yBase + yOffset, radius: radius + extraRadialOffset,
      spread: bendRing ? 1.0 : 0.96, sizeFactor,
    });
  }, [bend, scene, shape, festoons, bendDepth, bendTilt, yBase, yOffset, radius, extraRadialOffset, bendRing, sizeFactor]);

  if (!A && !festoonGeos) return null;

  return (
    <group onClick={onClick}>
      {festoonGeos
        ? renderFestoons({ festoonGeos, color, selected })
        : renderShells({
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

function NakedLayers({ shp, yBase, height, flavour }) {
  const spongeColor = SPONGE_COLORS[flavour] || '#f0d98a';
  const layers  = 3;
  const spongeH = (height * 0.62) / layers;
  const creamH  = (height * 0.38) / (layers - 1);
  const isRect = shp.kind === 'rect';

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
          {isRect
            ? <boxGeometry args={[shp.halfW * 2, layer.h, shp.halfD * 2]} />
            : <cylinderGeometry args={[shp.radius, shp.radius, layer.h, 64]} />}
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

// Cake body for a sheet cake: a rounded-RECTANGLE cross-section extruded straight up.
// Only the 4 vertical corners are rounded (radius r); the top and bottom stay flat and the
// footprint keeps its full width×depth — unlike drei RoundedBox, which rounds every edge
// (pillowing the top and shrinking the faces). Spans y ∈ [0, height]. cr=0 → sharp box.
export function buildRoundedPrism(halfW, halfD, height, r) {
  const cr = Math.max(0, Math.min(r, halfW, halfD));
  const s = new THREE.Shape();
  s.moveTo(-halfW + cr, -halfD);
  s.lineTo(halfW - cr, -halfD);
  s.quadraticCurveTo(halfW, -halfD, halfW, -halfD + cr);
  s.lineTo(halfW, halfD - cr);
  s.quadraticCurveTo(halfW, halfD, halfW - cr, halfD);
  s.lineTo(-halfW + cr, halfD);
  s.quadraticCurveTo(-halfW, halfD, -halfW, halfD - cr);
  s.lineTo(-halfW, -halfD + cr);
  s.quadraticCurveTo(-halfW, -halfD, -halfW + cr, -halfD);
  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);   // extrusion axis (Z) → world Y (up)
  return geo;
}

// ── Selection outline ─────────────────────────────────────────────────────────
function SelectionOutline({ shp, yBase, height }) {
  const geometry = useMemo(() => {
    const base = shp.kind === 'rect'
      ? new THREE.BoxGeometry(shp.halfW * 2 + 0.05, height + 0.05, shp.halfD * 2 + 0.05)
      : new THREE.CylinderGeometry(shp.radius + 0.05, shp.radius + 0.05, height + 0.05, 20);
    return new THREE.EdgesGeometry(base);
  }, [shp, height]);

  return (
    <lineSegments position={[0, yBase + height / 2, 0]} geometry={geometry}>
      <lineBasicMaterial color="#6c47ff" linewidth={2} />
    </lineSegments>
  );
}

export default function CakeTier({
  radius, height, color, yBase,
  shape = 'round', width, depth, cornerR,
  frostingType = 'buttercream',
  flavour = 'vanilla',
  selected = false,
  // New: arrays of stacked piping layers per zone. Legacy single topPiping/bottomPiping
  // props are still accepted (admin/template tools) and normalised into the arrays below.
  topPipings = null,
  bottomPipings = null,
  topPiping = null,
  bottomPiping = null,
  // Element id of the piping whose card is expanded — every ring of that element is
  // highlighted on the cake. Legacy single-piping callers fall back to the booleans.
  highlightPipingId = null,
  topPipingSelected = false,
  bottomPipingSelected = false,
  onTopPipingClick,
  onBottomPipingClick,
  onClick,
}) {
  const topY    = yBase + height;
  const centerY = yBase + height / 2;
  const mat = FROSTING_MAT[frostingType] ?? FROSTING_MAT.buttercream;
  const shp = useMemo(() => tierShape({ shape, width, depth, radius, cornerR }), [shape, width, depth, radius, cornerR]);
  const isRect = shp.kind === 'rect';
  const prismGeo = useMemo(
    () => isRect ? buildRoundedPrism(shp.halfW, shp.halfD, height, shp.cornerR) : null,
    [isRect, shp, height],
  );

  const tops    = topPipings    ?? (topPiping    ? [topPiping]    : []);
  const bottoms = bottomPipings ?? (bottomPiping ? [bottomPiping] : []);

  function handleClick(e) {
    e.stopPropagation();
    if (tops.length && e.point.y > topY - height * 0.25) {
      onTopPipingClick?.(e, tops[0].layerId);
    } else if (bottoms.length && e.point.y < yBase + height * 0.25) {
      onBottomPipingClick?.(e, bottoms[0].layerId);
    } else {
      onClick?.(e);
    }
  }

  // One <TopPipingRing>/<BottomPipingRing> per stacked layer. A layer is "selected"
  // by its layerId; legacy single-piping callers fall back to the boolean flags.
  const renderTops = () => tops.map((p, idx) => (
    <TopPipingRing key={p.layerId ?? `t${idx}`} topY={topY} radius={radius} glbPath={p.glbUrl} color={p.color}
      sizeFactor={p.size ?? 1}
      topRotation={p.rotation ?? [0,0,0]}
      extraRadialOffset={(p.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0)}
      yOffset={(p.yOffset ?? 0) + (p.userYOffset ?? 0)}
      flipTop={p.userFlipTop !== undefined ? p.userFlipTop : (p.flipTop ?? false)}
      spacing={p.spacing ?? 1}
      swagCount={p.swagCount ?? 0} swagDepth={p.swagDepth ?? 0} swagTilt={p.swagTilt ?? 0.5}
      arrangement={p.arrangement ?? 'ring'} instances={p.instances ?? null}
      altEnabled={p.altEnabled ?? false} altGlbUrl={p.altGlbUrl ?? null}
      altFlip={p.altFlip ?? false} altRotation={p.altRotation ?? [0,0,0]}
      altRadialOffset={p.altRadialOffset ?? 0} altYOffset={(p.altYOffset ?? 0) + (p.userYOffset ?? 0)}
      pattern={p.pattern ?? 'AB'} shape={shp}
      bend={p.bend ?? false} bendRing={p.bendRing ?? false}
      festoons={p.festoons ?? 6} bendDepth={p.bendDepth ?? 0.4} bendTilt={p.bendTilt ?? 0}
      selected={highlightPipingId != null ? p.cardId === highlightPipingId : topPipingSelected}
      onClick={e => { e.stopPropagation(); onTopPipingClick?.(e, p.layerId); }} />
  ));

  // Festoon anchor = a fraction of the wall + the offset committed when it was added (which
  // already cleared the borders that existed then). It does NOT react to layers added later, so
  // an existing swag never jumps when something new is placed — new layers stack around IT.
  const renderBottoms = () => bottoms.map((p, idx) => (
    <BottomPipingRing key={p.layerId ?? `b${idx}`} yBase={yBase} radius={radius} glbPath={p.glbUrl} color={p.color}
      sizeFactor={p.size ?? 1}
      bottomRotation={p.bottomRotation ?? [0,0,0]}
      extraRadialOffset={(p.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0)}
      yOffset={p.bend
        ? height * BEND_ANCHOR_FRAC + (p.userYOffset ?? 0)   // festoon: wall anchor + committed nudge
        : (p.yOffset ?? 0) + (p.userYOffset ?? 0)}
      flipBottom={p.userFlipBottom !== undefined ? p.userFlipBottom : (p.flipBottom ?? true)}
      spacing={p.spacing ?? 1}
      swagCount={p.swagCount ?? 0} swagDepth={p.swagDepth ?? 0} swagTilt={p.swagTilt ?? 0.5}
      arrangement={p.arrangement ?? 'ring'} instances={p.instances ?? null}
      altEnabled={p.altEnabled ?? false} altGlbUrl={p.altGlbUrl ?? null}
      altFlip={p.altFlip ?? false} altRotation={p.altRotation ?? [0,0,0]}
      altRadialOffset={p.altRadialOffset ?? 0} altYOffset={(p.altYOffset ?? 0) + (p.userYOffset ?? 0)}
      pattern={p.pattern ?? 'AB'} shape={shp}
      bend={p.bend ?? false} bendRing={p.bendRing ?? false}
      festoons={p.festoons ?? 6} bendDepth={p.bendDepth ?? 0.4} bendTilt={p.bendTilt ?? 0}
      selected={highlightPipingId != null ? p.cardId === highlightPipingId : bottomPipingSelected}
      onClick={e => { e.stopPropagation(); onBottomPipingClick?.(e, p.layerId); }} />
  ));

  if (frostingType === 'naked') {
    return (
      <group onClick={handleClick}>
        {selected && <SelectionOutline shp={shp} yBase={yBase} height={height} />}
        <NakedLayers shp={shp} yBase={yBase} height={height} flavour={flavour} />
        {!isRect && (
          <mesh position={[0, topY + 0.01, 0]}>
            <cylinderGeometry args={[radius - 0.01, radius - 0.01, 0.02, 64]} />
            <meshStandardMaterial color="#fffdf5" roughness={0.5} />
          </mesh>
        )}
        {renderTops()}
        {renderBottoms()}
      </group>
    );
  }

  return (
    <group onClick={handleClick}>
      {selected && <SelectionOutline shp={shp} yBase={yBase} height={height} />}
      {isRect ? (
        // Rounded-rect prism: flat top, only the vertical corners rounded, full footprint.
        // No separate top cap (a cap reads as a stray "board" on a rectangular cake).
        <mesh geometry={prismGeo} position={[0, yBase, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, centerY, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, height, 64]} />
            <meshStandardMaterial color={color} roughness={mat.roughness} metalness={mat.metalness} />
          </mesh>
          <mesh position={[0, topY + 0.01, 0]} castShadow>
            <cylinderGeometry args={[radius - 0.01, radius - 0.01, 0.02, 64]} />
            <meshStandardMaterial color={color} roughness={mat.roughness - 0.08} />
          </mesh>
        </>
      )}
      {renderTops()}
      {renderBottoms()}
    </group>
  );
}
