import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { applyGradient } from '../shared/color/gradientMaterial.js';
import { getCreamGrainNormalMap, getWhippedFoamNormalMap } from '../shared/textures/creamWaveTexture.js';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';
import { getRusticNormalMap } from '../shared/textures/rusticTexture.js';
import { getWeaveNormalMap, weaveTiles } from '../shared/textures/weaveStencilTexture.js';
import { makeParticleFinishMaps } from '../shared/textures/particleFinish.js';
import { frostingDef, frostingSupportsGradient, frostingAllowsStyles, DEFAULT_FROSTING, FROSTINGS } from '../frostings.js';
import { styleDef, resolveStyleParams, DEFAULT_STYLE } from '../creamStyles.js';
import { buildStyledWall } from '../geometry/creamWall.js';
import { tierShape, pipingPerimeter, rectEdgeRing, perimeter, circlePerimeter } from '../geometry/surface.js';
import { buildFestoons, buildWrapBand } from '../geometry/festoon.js';
import { buildDripGeometry, buildDripWeb, dripRenderParams } from '../geometry/chocolateDrip.js';
import { buildSecondCreamLayer, buildSecondCreamEdgeLine } from '../geometry/secondCreamLayer.js';
import { makeGoldLeafMaps } from '../shared/textures/goldLeafTexture.js';
import { PIPING_FRONT_ANGLE, TIER_RADII, BEND_ANCHOR_FRAC } from '../constants.js';
import { SHELL_HEIGHT_FRAC, setShellExtents, setFestoonExtents, festoonSig } from './pipingMetrics.js';

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

// ── Cream "softness" → material ───────────────────────────────────────────────
// A single 0–1 control for how the piped cream reads: 0 = glossy/wet icing,
// 1 = matte/whipped. The default 0.7 reproduces the original hardcoded look
// EXACTLY (roughness 0.85, sheen 0.4) so elements saved before this control are
// unchanged. Read from placement_config (bottom_softness / top_softness); absent →
// default. The PipingCalibrator keeps an identical copy so its preview matches.
export const PIPING_SOFTNESS_DEFAULT = 0.7;
export function creamMaterialProps(softness, color) {
  const s = Math.min(1, Math.max(0, softness ?? PIPING_SOFTNESS_DEFAULT));
  return {
    color,
    roughness:      0.5 + 0.5 * s,   // 0.5 wet … 0.85 (default) … 1.0 matte
    sheen:          (0.4 / 0.7) * s, // 0 … 0.4 (default) … ~0.571 velvety
    sheenRoughness: 0.9,
    sheenColor:     color,
  };
}

// ── Chocolate "gloss" → material ──────────────────────────────────────────────
// A single 0–1 control for how wet the ganache reads: 0 = matte set chocolate,
// 1 = glossy wet drip (the default). Drives BOTH roughness and a clearcoat layer
// together (the clearcoat is what sells "wet ganache" vs "plastic"). Mirrors the
// cream "softness" idea but for chocolate. The admin drip studio keeps the same map.
export const DRIP_GLOSS_DEFAULT = 0.85;
export function chocolateMaterialProps(gloss, color) {
  const g = Math.min(1, Math.max(0, gloss ?? DRIP_GLOSS_DEFAULT));
  return {
    color,
    metalness:          0,
    roughness:          0.5 - 0.42 * g,    // 0.5 matte … 0.08 wet
    clearcoat:          0.4 + 0.6 * g,     // 0.4 … 1.0 glassy
    clearcoatRoughness: 0.28 - 0.16 * g,   // 0.28 … 0.12
  };
}

// ── Acrylic gold finish ───────────────────────────────────────────────────────
// A shiny, lacquered gold for writing/toppers — fully metallic with a clearcoat
// layer on top so it reads as a glossy acrylic/resin gold rather than raw metal.
export const GOLD_FINISH_COLOR = '#d4a824';
export function goldMaterialProps(color = GOLD_FINISH_COLOR) {
  return {
    color,
    // Slightly under full-metal so the gold albedo always reads as gold even
    // without a strong environment map (full metalness mirrors the scene and
    // can pick up the cake's pink). A warm emissive base keeps the glow gold.
    metalness:          0.85,
    roughness:          0.25,   // tight, bright highlights
    clearcoat:          1.0,    // the acrylic/lacquer coat
    clearcoatRoughness: 0.06,
    reflectivity:       1.0,
    sheen:              0,
  };
}

// ── Metallic cream finish ─────────────────────────────────────────────────────
// A shiny, pearlescent take on a chosen cream colour — half-metal with a clearcoat
// and a bright sheen so it shimmers like glossy buttercream/lustre dust rather than
// reading as raw metal. Keeps the picked colour as its tint.
export function metallicCreamProps(color) {
  return {
    color,
    metalness:          0.55,
    roughness:          0.18,   // glossy, but softer than the gold/silver metals
    clearcoat:          1.0,
    clearcoatRoughness: 0.08,
    reflectivity:       1.0,
    sheen:              0.6,
    sheenColor:         '#ffffff',
    sheenRoughness:     0.55,
  };
}

// ── Acrylic silver finish ─────────────────────────────────────────────────────
// Same lacquered-metal treatment as gold, in a cool silver. The neutral albedo
// reads as silver even without a strong env map; emissive is handled by the caller.
export const SILVER_FINISH_COLOR = '#cdd2d8';
export function silverMaterialProps(color = SILVER_FINISH_COLOR) {
  return {
    color,
    metalness:          0.9,
    roughness:          0.22,
    clearcoat:          1.0,
    clearcoatRoughness: 0.06,
    reflectivity:       1.0,
    sheen:              0,
  };
}

// Cream piping must hug the cake, not float off it. The shell's radial depth (how far it
// reaches off the wall) is limited dynamically to a fraction of the tier radius — so a
// smaller tier gets a tighter limit. Past the limit, raising the size slider no longer
// enlarges the shell, which is what keeps the cream from leaving the cake.
const PIPING_MAX_DEPTH_FRAC = 0.16;

// How far (as a fraction of the tier radius) the radial control may push the BOARD border
// OUTWARD past its default (inner face on the wall) before it's capped — keeps it attached to
// the cake rather than drifting onto the board. Inward travel is unrestricted.
const PIPING_RADIAL_PLAY = 0.4;

// Default height of a WRAP band (a pre-formed ring wrapped round the wall), as a fraction of
// the tier radius. The band's thickness follows from the ring's own cross-section aspect; the
// size control scales both. Tuned so a size-1 band reads like a proper cream band on the wall.
const PIPING_WRAP_HEIGHT_FRAC = 0.4;

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

// Local-space bbox of a geometry, in the frame the gradient shader reads (the `position`
// attribute). Null when there's no gradient so non-gradient piping skips the work.
function geomBBox(geometry, gradient) {
  if (!gradient || !geometry) return null;
  geometry.computeBoundingBox?.();
  const bb = geometry.boundingBox;
  if (!bb) return null;
  const size = new THREE.Vector3(); bb.getSize(size);
  const center = new THREE.Vector3(); bb.getCenter(center);
  return { min: bb.min.clone(), size, center };
}

// One cream mesh (a shell, festoon, or wrap band). The cream material is config-driven: a single
// solid colour by default, or a multi-colour blend when the ring carries a `gradient` — applied via
// the SHARED gradientMaterial helper (same one stickers use), so there is no piping-specific
// gradient code. Gradient blends per-mesh in the geometry's local frame (each dollop is two-tone,
// like a two-colour piping bag).
function CreamMesh({ geometry, rotation, scale, color, softness, gradient, selected, castShadow = true }) {
  const matRef = useRef(null);
  const bbox = useMemo(() => geomBBox(geometry, gradient), [geometry, gradient]);
  useEffect(() => { if (matRef.current) applyGradient(matRef.current, gradient, bbox); }, [gradient, bbox]);
  return (
    <mesh geometry={geometry} rotation={rotation} scale={scale} castShadow={castShadow}>
      <meshPhysicalMaterial ref={matRef}
        {...creamMaterialProps(softness, color)}
        emissive={selected ? color : '#000000'}
        emissiveIntensity={selected ? 0.15 : 0}
      />
    </mesh>
  );
}

// One piping shell: position + facing on the ring, with X/Z tilt and Y-yaw offset baked in.
function Shell({ pos, rotY, tq, ryGroup, meshRot, geometry, shellScale, color, softness, gradient, selected }) {
  return (
    <group position={pos} quaternion={tq}>
      <group rotation={[0, -rotY + Math.PI / 2 + ryGroup, 0]}>
        <CreamMesh geometry={geometry} rotation={meshRot} scale={shellScale}
          color={color} softness={softness} gradient={gradient} selected={selected} />
      </group>
    </group>
  );
}

// Render every position, alternating between version A and the alternate B per `pattern`
// (a repeating cycle like "AB" or "AAB"). B uses its own geometry, rotation, and a radial/
// height shift relative to A. When B is absent / not active, every shell is A (unchanged).
function renderShells({ positions, A, B, baseRotation, altRotation, altActive, pattern, dRadialB, dYB, color, softness, gradient, selected }) {
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
        geometry={ver.geometry} shellScale={ver.shellScale} color={color} softness={softness} gradient={gradient} selected={selected} />
    );
  });
}

// Render the bent-strip festoons (U-shaped swags). Each entry is a pre-bent BufferGeometry
// from buildFestoons(); we just paint them in the ring's colour with the same cream material.
function renderFestoons({ festoonGeos, color, softness, gradient, selected }) {
  return festoonGeos.map((g, i) => (
    <CreamMesh key={i} geometry={g} color={color} softness={softness} gradient={gradient} selected={selected} />
  ));
}

// The tier WALL perimeter a wrap band follows: a circle for round, the rounded-rect for sheet.
// `shape` is the tierShape descriptor (null → round). The band hugs this, lifted by yOffset.
function wallPerimeter(shape, radius) {
  return shape?.kind === 'rect' ? perimeter(shape) : circlePerimeter(radius);
}

// Render a single pre-formed RING GLB as ONE band wrapping the wall (no repetition).
function renderWrap({ wrapGeo, color, softness, gradient, selected }) {
  return (
    <CreamMesh geometry={wrapGeo} color={color} softness={softness} gradient={gradient} selected={selected} />
  );
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
  // A drip layer is a procedural ganache ring (no GLB) — dispatch to its own branch BEFORE any
  // useGLTF runs. This is a config-driven branch on the ring entry (like festoon/wrap inside the
  // GLB impl), NOT a per-element-type renderer.
  if (props.drip) return (
    <TopDripRing topY={props.topY} radius={props.radius} color={props.color}
      gloss={props.dripGloss} lengthMul={props.dripLength} flood={props.dripFlood} config={props.dripConfig}
      selected={props.selected} onClick={props.onClick} />
  );
  if (!props.glbPath) return null;
  return <TopPipingRingImpl {...props} />;
}

// ── Top chocolate-drip ring — procedural ganache draped over the rim ──────────
// The drip geometry (web arches + runs) is built from the tier's REAL radius+topY so it scales to any
// tier. The rolled rim bead is a torus the consumer adds with the same material (matching the admin
// drip studio). Customer controls: colour, gloss, length (a multiplier on the authored base run).
export function TopDripRing({ topY, radius, color = '#3a2117', gloss = DRIP_GLOSS_DEFAULT,
  lengthMul = 1, flood = false, config = null, selected = false, onClick }) {
  // ONE derivation of the scaled params + startDrop/lip — shared with the relief sampler (chocolateDrip.js).
  const cfgKey = JSON.stringify(config ?? {});
  const { params, startDrop, lipR, s } = useMemo(
    () => dripRenderParams(config, radius, lengthMul), [cfgKey, radius, lengthMul]);
  const dripsGeo = useMemo(() => buildDripGeometry({ R: radius, topY, startDrop, ...params }), [radius, topY, startDrop, params]);
  const webGeo   = useMemo(() => buildDripWeb({ R: radius, topY, ...params }), [radius, topY, params]);
  const mat = chocolateMaterialProps(gloss, color);
  const emissive = selected ? color : '#000000', emissiveIntensity = selected ? 0.15 : 0;
  const floodH = 0.03 * s;
  return (
    <group onClick={onClick}>
      {/* optional top flood — a thin chocolate pool covering the tier top inside the rim */}
      {flood && (
        <mesh position={[0, topY + floodH / 2, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, floodH, 96]} />
          <meshPhysicalMaterial {...mat} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      )}
      {/* rolled rim bead at the very edge */}
      <mesh position={[0, topY, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[radius, lipR, 16, 128]} />
        <meshPhysicalMaterial {...mat} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh geometry={webGeo} castShadow>
        <meshPhysicalMaterial {...mat} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh geometry={dripsGeo} castShadow>
        <meshPhysicalMaterial {...mat} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
    </group>
  );
}
function TopPipingRingImpl({
  topY, radius, glbPath, color = '#ffffff', sizeFactor = 1,
  softness = PIPING_SOFTNESS_DEFAULT, gradient = null,
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
  wrap = false, wrapTilt = 0, wrapSize = 1,
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

  // Wrap elements: a pre-formed ring re-routed onto the tier wall as ONE band (round or rect).
  const wrapGeo = useMemo(() => {
    if (!wrap || !scene) return null;
    return buildWrapBand(scene, {
      perim: wallPerimeter(shape, radius), anchorY: topY + yOffset,
      heightFrac: PIPING_WRAP_HEIGHT_FRAC, sizeFactor: sizeFactor * wrapSize, radius,
      outset: 0.01 + extraRadialOffset, tilt: wrapTilt * DEG,
    });
  }, [wrap, scene, shape, radius, topY, yOffset, sizeFactor, wrapSize, extraRadialOffset, wrapTilt]);

  if (!A && !festoonGeos && !wrapGeo) return null;

  return (
    <group onClick={onClick}>
      {wrapGeo
        ? renderWrap({ wrapGeo, color, softness, gradient, selected })
        : festoonGeos
        ? renderFestoons({ festoonGeos, color, softness, gradient, selected })
        : renderShells({
            positions, A, B, baseRotation: topRotation, altRotation, altActive, pattern,
            dRadialB: altRadialOffset - extraRadialOffset, dYB: altYOffset - yOffset,
            color, softness, gradient, selected,
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
  softness = PIPING_SOFTNESS_DEFAULT, gradient = null,
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
  wrap = false, wrapTilt = 0, wrapSize = 1,
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

  // Publish the swag's TRUE vertical reach (its bent bounding box, as radius fractions) so the
  // editor can lift it to rest its actual cream — not the centreline — on the border below it.
  // attachY is baked into the geometry, so reaches are measured relative to it.
  useEffect(() => {
    if (!festoonGeos?.length || !radius) return;
    const anchorY = yBase + yOffset;
    let minY = Infinity, maxY = -Infinity;
    festoonGeos.forEach(g => {
      g.computeBoundingBox?.();
      if (g.boundingBox) { minY = Math.min(minY, g.boundingBox.min.y); maxY = Math.max(maxY, g.boundingBox.max.y); }
    });
    if (minY < maxY) setFestoonExtents(glbPath, festoonSig({ size: sizeFactor, bendDepth, festoons, bendRing, bendTilt }), {
      bellyFrac: (anchorY - minY) / radius, topFrac: (maxY - anchorY) / radius,
    });
  }, [festoonGeos, yBase, yOffset, radius, glbPath, sizeFactor, bendDepth, festoons, bendRing, bendTilt]);

  // Wrap elements: a pre-formed ring re-routed onto the tier wall as ONE band (round or rect),
  // riding up the wall by yOffset. Hugs the wall whatever the cake size or shape.
  const wrapGeo = useMemo(() => {
    if (!wrap || !scene) return null;
    return buildWrapBand(scene, {
      perim: wallPerimeter(shape, radius), anchorY: yBase + yOffset,
      heightFrac: PIPING_WRAP_HEIGHT_FRAC, sizeFactor: sizeFactor * wrapSize, radius,
      outset: 0.01 + extraRadialOffset, tilt: wrapTilt * DEG,
    });
  }, [wrap, scene, shape, radius, yBase, yOffset, sizeFactor, wrapSize, extraRadialOffset, wrapTilt]);

  if (!A && !festoonGeos && !wrapGeo) return null;

  return (
    <group onClick={onClick}>
      {wrapGeo
        ? renderWrap({ wrapGeo, color, softness, gradient, selected })
        : festoonGeos
        ? renderFestoons({ festoonGeos, color, softness, gradient, selected })
        : renderShells({
            positions, A, B, baseRotation: bottomRotation, altRotation, altActive, pattern,
            dRadialB: altRadialOffset - extraRadialOffset, dYB: altYOffset - yOffset,
            color, softness, gradient, selected,
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

// Per frosting TYPE (material) — distinct, realistic physical-material descriptors. The three
// Frosting material descriptors, edge profiles and capabilities are DATA in the frostings registry.
// Here we resolve only the part that must be code: the `grain` KEY → a normal-map generator.
const GRAIN_GENERATORS = {
  cream:   getCreamGrainNormalMap,
  foam:    getWhippedFoamNormalMap,
  fondant: getFondantNormalMap,
};

// Tiling micro-grain normal map for the wall, cloned per (grain, repeat) so each material owns its
// own wrap/repeat without mutating the shared cached texture. `aroundLen`/`upLen` are the wall's
// world extents so the grain cell stays a constant physical size across tier sizes.
const GRAIN_TILES_PER_UNIT = 16;
const _grainCache = new Map();
function grainNormalMap(grain, aroundLen, upLen, density = 1) {
  const rx = Math.max(4, Math.round(aroundLen * GRAIN_TILES_PER_UNIT * density));
  const ry = Math.max(3, Math.round(upLen   * GRAIN_TILES_PER_UNIT * density));
  const key = `${grain}:${rx}:${ry}`;
  if (_grainCache.has(key)) return _grainCache.get(key);
  const base = (GRAIN_GENERATORS[grain] ?? getCreamGrainNormalMap)();
  const tex = base.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  _grainCache.set(key, tex);
  return tex;
}

// Style surface normal maps (the data↔code seam for normal-map finishes like rustic). Cloned + tiled
// per (key, repeat) so each tier owns its wrap/repeat. `density` (from the style's scale param) tiles
// the stroke pattern more/less finely; tiles scale with the wall extent for a constant physical size.
// Each finish: how to TILE its normal map across the wall, a SIG of the params that change the bake
// (so the cache rebuilds only when needed), and the BUILD. Registry-driven — a new normal-map finish
// is one entry, no render-path branching. Weave tiles by `weaveTiles` (the SAME count its real-relief
// displacement uses) so the baked lines land exactly on the displaced grooves instead of ghosting.
const SURFACE_MAP_GENERATORS = {
  rustic: {
    tiles: ({ aroundLen, upLen, density }) =>
      [Math.max(1, Math.round(aroundLen * 0.9 * density)), Math.max(1, Math.round(upLen * 1.3 * density))],
    sig: () => 'rustic',
    build: () => getRusticNormalMap(),
  },
  weave: {
    tiles: ({ radius, height, params }) => { const { around, up } = weaveTiles(radius, height, params.tile ?? 0.8); return [around, up]; },
    sig: ({ params }) => `weave:${params.grooves ?? 5}:${params.width ?? 0.5}:${params.border ?? 0}:${params.grain ?? 0.12}`,
    build: ({ params }) => getWeaveNormalMap({ grooves: params.grooves ?? 5, width: params.width ?? 0.5, border: params.border ?? 0, grain: params.grain ?? 0.12 }),
  },
};
function surfaceNormalMap(key, ctx) {
  const def = SURFACE_MAP_GENERATORS[key];
  if (!def) return null;
  const [rx, ry] = def.tiles(ctx);
  const cacheKey = `surf:${def.sig(ctx)}:${rx}:${ry}`;
  if (_grainCache.has(cacheKey)) return _grainCache.get(cacheKey);
  const tex = def.build(ctx).clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  _grainCache.set(cacheKey, tex);
  return tex;
}

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

// Fondant-draped ROUND tier: a solid of revolution whose top edge is a rounded fillet (the fondant
// sheet folds over the rim instead of a sharp 90° tin edge). Profile is revolved around Y, spanning
// y ∈ [0, height]: flat bottom disk → straight wall → quarter-arc top edge → flat top disk. `fillet`
// is the edge radius in world units. Replaces the cylinder+lid for round fondant tiers; the single
// mesh means the vertical gradient and grain flow over the rounded edge with no separate cap.
function buildRoundedTopCylinder(radius, height, fillet, radial = 64) {
  const r = Math.max(0, Math.min(fillet, radius * 0.9, height * 0.5));
  const pts = [
    new THREE.Vector2(0, 0),               // bottom centre (closes the base)
    new THREE.Vector2(radius, 0),          // bottom outer edge
    new THREE.Vector2(radius, height - r), // up the wall to where the fillet starts
  ];
  const ARC = 10;
  for (let i = 1; i <= ARC; i++) {         // quarter-arc rim, centre (radius−r, height−r)
    const a = (i / ARC) * (Math.PI / 2);
    pts.push(new THREE.Vector2((radius - r) + r * Math.cos(a), (height - r) + r * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(0, height));  // top centre (closes the top)
  return new THREE.LatheGeometry(pts, radial);
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

// Cake-body mesh whose material carries the optional tier gradient. Mirrors CreamMesh: a ref'd
// MeshStandardMaterial driven through the ONE shared `applyGradient` helper off the geometry's
// LOCAL bounding box, so the ombre blends in the body's own frame (bottom→top for vertical) and
// there is no tier-specific shader. `gradient` null ⇒ plain solid colour, exactly as before.
// `geoSig` changes whenever the geometry's size changes (tier resize) so the bbox is recomputed.
// `surf` = a frosting material descriptor (roughness/sheen/clearcoat/grain…). `grainExtent` = [aroundLen,
// upLen] world extents of the wall so the micro-grain tiles at a constant physical size. The material
// is MeshPhysical so sheen + clearcoat read; applyGradient is documented to leave those untouched.
// `overrideNormalMap` (with `overrideNormalScale`) lets a normal-map STYLE (rustic) replace the type's
// cream grain on this tier — the surface texture then comes from the style, not the type's material.
function TierBody({ position, color, surf, grainExtent, overrideNormalMap = null, overrideNormalScale = 1,
                    gradient, geoSig, dusting = null, foil = null, finishMaps = null, children, castShadow = true, receiveShadow = false }) {
  const meshRef = useRef();
  const matRef  = useRef();
  const finishOnRef = useRef(false);
  const grainMap = useMemo(
    () => (surf?.grain && grainExtent ? grainNormalMap(surf.grain, grainExtent[0], grainExtent[1], surf.grainDensity) : null),
    [surf?.grain, grainExtent?.[0], grainExtent?.[1], surf?.grainDensity],
  );
  const normalMap = overrideNormalMap ?? grainMap;
  const normalScale = overrideNormalMap ? overrideNormalScale : (surf?.grainStrength ?? 0.5);
  useEffect(() => {
    if (!matRef.current) return;
    let bb = null;
    const geo = meshRef.current?.geometry;
    if (gradient && geo) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const size = new THREE.Vector3();   geo.boundingBox.getSize(size);
      const center = new THREE.Vector3(); geo.boundingBox.getCenter(center);
      bb = { min: geo.boundingBox.min.clone(), size, center };
    }
    applyGradient(matRef.current, gradient, bb);
  }, [gradient, geoSig]);
  // Adding/removing the dust maps on an EXISTING material needs a shader recompile, else three keeps
  // the old program (compiled without the map defines) and silently ignores emissiveMap/metalnessMap/
  // roughnessMap — the flecks never show and only the flat emissive colour leaks through.
  // Recompile the shader ONLY when finish maps appear/disappear (the map defines change). Doing it on
  // every finishMaps change recompiled the shader each drag frame — that was the drag "glue". Content
  // updates (swapping the canvas texture while dragging) need no recompile, just a texture re-upload.
  useEffect(() => {
    if (!matRef.current) return;
    const on = !!finishMaps;
    if (on !== finishOnRef.current) { matRef.current.needsUpdate = true; finishOnRef.current = on; }
  }, [finishMaps]);
  // Particle finishes (luster dust + gold leaf) bake into ONE wall-map set (`finishMaps`). The albedo
  // MAP carries the base colour + dust flecks + gold shards (so `color` goes white and the map drives
  // it). metalness/roughness are baked ABSOLUTE into the maps, so the material scalars are 1 and each
  // particle keeps its own metalness/roughness (dust ≠ foil) over the untouched matte base (base map =
  // base colour, base metalness = surf.metalness, base roughness = surf.roughness → the wall keeps its
  // frosting look). Gold/dust colour comes from the particle's surface colour, never emission, so it
  // reads on ANY base. `emissive` stays an optional faint dust glow. Gold leaf bumps envMapIntensity so
  // the metal shards reflect the room (the "shine"). The grain/style normal stays. (Map binding requires
  // the needsUpdate recompile above.)
  return (
    <mesh ref={meshRef} position={position} castShadow={castShadow} receiveShadow={receiveShadow}>
      {children}
      <meshPhysicalMaterial ref={matRef} color={finishMaps ? '#ffffff' : color}
        map={finishMaps?.map ?? null}
        roughness={finishMaps ? 1 : (surf?.roughness ?? 0.68)}
        metalness={finishMaps ? 1 : (surf?.metalness ?? 0)}
        metalnessMap={finishMaps?.metalnessMap ?? null}
        roughnessMap={finishMaps?.roughnessMap ?? null}
        emissive={finishMaps ? (foil ? (foil.color ?? '#000000') : (dusting?.dustColor ?? '#000000')) : '#000000'}
        emissiveMap={finishMaps?.emissiveMap ?? null}
        emissiveIntensity={finishMaps ? (foil ? (foil.finish?.glow ?? 0.35) : (dusting?.glow ?? 0)) : 0}
        sheen={surf?.sheen ?? 0} sheenRoughness={surf?.sheenRoughness ?? 0.6} sheenColor={surf?.sheenColor ?? '#ffffff'}
        clearcoat={finishMaps ? 1 : (surf?.clearcoat ?? 0)}
        clearcoatMap={finishMaps?.metalnessMap ?? null}
        clearcoatRoughness={finishMaps ? 0.12 : (surf?.clearcoatRoughness ?? 0.5)}
        envMapIntensity={finishMaps && foil ? (foil.finish?.env ?? 4.5) : (surf?.envMapIntensity ?? 0.5)}
        normalMap={normalMap ?? null}
        normalScale={[normalScale, normalScale]} />
    </mesh>
  );
}

// ── Second cream layer ────────────────────────────────────────────────────────
// A stack of raised two-tone bands on the tier wall, each with a customer-drawn torn
// edge h(θ) and optional gold-leaf trim. Bands are REAL geometry (offset shell + ledge
// lip) — the raised lip is the whole look. Round tiers only (the geometry is cylindrical).
const SECOND_CREAM_STACK_STEP = 0.04;                       // radial gap per stacked band
const SECOND_CREAM_GRAIN_SCALE = new THREE.Vector2(0.35, 0.35);
const SECOND_CREAM_GOLD_NORMAL_SCALE = new THREE.Vector2(0.7, 0.7);

// One band. `order` pushes it radially proud of lower layers so the lips stack without
// z-fighting; it wears the same cream grain as the wall, plus optional gold-leaf trim.
function SecondCreamBand({ layer, radius, yBase, height, grain }) {
  const order = layer.order ?? 0;
  const baseR = radius + order * SECOND_CREAM_STACK_STEP;
  const { color, edge, lift, fillSide, noise, seed } = layer;
  const gold = layer.gold ?? {};

  const bandGeo = useMemo(
    () => buildSecondCreamLayer({ R: baseR, y0: yBase, wallH: height, lift, edge, fillSide, noise, seed }),
    [baseR, yBase, height, lift, fillSide, noise, seed, edge],
  );
  const goldGeo = useMemo(
    () => (gold.on ? buildSecondCreamEdgeLine({ R: baseR, y0: yBase, wallH: height, lift, edge, noise, seed }) : null),
    [gold.on, baseR, yBase, height, lift, noise, seed, edge],
  );
  const goldMaps = useMemo(() => (gold.on ? makeGoldLeafMaps({ seed }) : null), [gold.on, seed]);

  return (
    <group>
      <mesh geometry={bandGeo} castShadow>
        <meshPhysicalMaterial {...creamMaterialProps(0.85, color)}
          normalMap={grain} normalScale={SECOND_CREAM_GRAIN_SCALE} side={THREE.DoubleSide} />
      </mesh>
      {gold.on && goldMaps && (
        <mesh geometry={goldGeo}>
          {/* Matte foil, not the acrylic gold finish — the texture supplies the torn crinkle/glint. */}
          <meshStandardMaterial color={gold.color ?? '#c89b3c'}
            map={goldMaps.map} normalMap={goldMaps.normalMap} normalScale={SECOND_CREAM_GOLD_NORMAL_SCALE}
            metalness={0.9} roughness={0.42} envMapIntensity={1.6}
            transparent={false} alphaTest={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// All second-cream bands on a (round) tier. The grain matches the wall's (constant
// physical cell size across tier sizes) so the bands read as the SAME buttercream.
function SecondCreamLayers({ layers, radius, yBase, height, grainKey, grainDensity }) {
  const grain = useMemo(
    () => grainNormalMap(grainKey, 2 * Math.PI * radius, height, grainDensity),
    [grainKey, radius, height, grainDensity],
  );
  if (!layers?.length) return null;
  return layers.map((layer, idx) => (
    <SecondCreamBand key={layer.layerId ?? idx} layer={layer} radius={radius} yBase={yBase} height={height} grain={grain} />
  ));
}

export default function CakeTier({
  radius, height, color, yBase,
  gradient = null,
  shape = 'round', width, depth, cornerR,
  frostingType = 'buttercream',
  frostingStyle = DEFAULT_STYLE,
  styleParams = null,
  dusting = null,
  foil = null,
  flavour = 'vanilla',
  selected = false,
  // New: arrays of stacked piping layers per zone. Legacy single topPiping/bottomPiping
  // props are still accepted (admin/template tools) and normalised into the arrays below.
  topPipings = null,
  bottomPipings = null,
  topPiping = null,
  bottomPiping = null,
  creamLayers = null,   // raised two-tone bands (second cream layer) — round tiers only

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
  // Finish definition (data) → material descriptor, edge profile, capabilities. naked has no
  // `material` (it renders its own way), so fall back to the default for the unused body material.
  const fdef = frostingDef(frostingType);
  const mat = fdef.material ?? FROSTINGS[DEFAULT_FROSTING].material;
  const roundEdge = fdef.edge?.kind === 'round' ? fdef.edge : null;
  // Gradient is a cream technique only — ignore any (dormant) gradient on a finish that doesn't
  // support it (fondant/naked), so it always renders solid. The data is kept; just not rendered.
  const effGradient = frostingSupportsGradient(frostingType) ? gradient : null;
  // Vertical gradient runs bottom→top, so the top lid takes the last (top-most) stop; solid colour
  // otherwise. Mirrors the shader, which maps gt=1 (the cake top) to the final stop.
  const gradColors = effGradient?.colors?.filter(Boolean) ?? [];
  const capColor   = gradColors.length >= 2 ? gradColors[gradColors.length - 1] : color;
  const shp = useMemo(() => tierShape({ shape, width, depth, radius, cornerR }), [shape, width, depth, radius, cornerR]);
  const isRect = shp.kind === 'rect';
  const prismGeo = useMemo(
    () => isRect ? buildRoundedPrism(shp.halfW, shp.halfD, height, shp.cornerR) : null,
    [isRect, shp, height],
  );
  // Round fondant tiers get a draped, rounded-edge body (config-driven via the finish's
  // `edge: { kind:'round', frac }`). Other round tiers stay a plain cylinder + lid. null ⇒ cylinder.
  const roundedGeo = useMemo(
    () => (!isRect && roundEdge)
      ? buildRoundedTopCylinder(radius, height, roundEdge.frac * Math.min(radius, height))
      : null,
    [isRect, roundEdge?.frac, radius, height],
  );
  // Cream STYLE → a displaced wall (wave/swirl/rustic). Only for finishes that texture (cream, not
  // fondant) and round tiers; an unsupported/unknown style falls back to smooth (null → plain wall).
  // Resolved params (schema defaults ← tier overrides) feed the geometry; memo keyed on their values.
  const wallKey = frostingAllowsStyles(frostingType) ? styleDef(frostingStyle).wall : 'smooth';
  const styleVals = resolveStyleParams(frostingStyle, styleParams);
  const styleSig = JSON.stringify(styleVals);
  const styledGeo = useMemo(
    () => (!isRect && !roundEdge) ? buildStyledWall(wallKey, radius, height, styleVals) : null,
    // styleVals is recreated each render; styleSig captures its values for the memo. eslint-disable-next-line
    [isRect, roundEdge, wallKey, radius, height, styleSig],
  );
  // Normal-map STYLE (rustic): a surface texture on the plain wall instead of geometry. Built when the
  // style declares a surfaceMap; `depth` → normalScale, `scale` → tiling density.
  const surfaceMapKey = frostingAllowsStyles(frostingType) ? styleDef(frostingStyle).surfaceMap : null;
  const styleNormalMap = useMemo(
    () => (surfaceMapKey && !isRect)
      ? surfaceNormalMap(surfaceMapKey, {
          aroundLen: 2 * Math.PI * radius, upLen: height, density: (styleVals.scale ?? 9) / 9,
          radius, height, params: styleVals,
        })
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surfaceMapKey, isRect, radius, height, styleSig],
  );
  const styleNormalScale = styleVals.depth ?? 1;

  // Particle finishes (luster dust + gold leaf) — composite the tier's splash points and foil flakes
  // into ONE wall material map set (round tiers only; the cylinder UV is what the u,v address). Rebuilt
  // only when a finish config changes.
  const finishSig = `${dusting ? JSON.stringify(dusting) : ''}|${foil ? JSON.stringify(foil) : ''}`;
  const finishRef = useRef(null);   // reused canvases/textures across rebuilds (drag/add stay cheap)
  const finishMaps = useMemo(() => {
    if (isRect || !(dusting?.splashes?.length || foil?.flakes?.length)) { finishRef.current = null; return null; }
    finishRef.current = makeParticleFinishMaps({
      radius, height, baseColor: color, surfRoughness: mat.roughness ?? 0.68, surfMetalness: mat.metalness ?? 0,
      dusting, foil, reuse: finishRef.current,
    });
    return finishRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRect, radius, height, color, mat.roughness, mat.metalness, finishSig]);

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
      gradient={p.gradient ?? null}
      sizeFactor={p.size ?? 1} softness={p.softness ?? PIPING_SOFTNESS_DEFAULT}
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
      wrap={p.wrap ?? false} wrapTilt={p.wrapTilt ?? 0} wrapSize={p.wrapSize ?? 1}
      drip={p.drip ?? false} dripConfig={p.dripConfig ?? null}
      dripGloss={p.dripGloss ?? DRIP_GLOSS_DEFAULT} dripLength={p.dripLength ?? 1} dripFlood={p.dripFlood ?? false}
      selected={highlightPipingId != null ? p.cardId === highlightPipingId : topPipingSelected}
      onClick={e => { e.stopPropagation(); onTopPipingClick?.(e, p.layerId); }} />
  ));

  // Festoon anchor = a fraction of the wall + the offset BAKED when the swag was added (which
  // already cleared whatever borders existed then — see nextFestoonYOffset in CakeDesigner). It
  // does NOT react to layers added later, so an existing swag never jumps when something new is
  // placed; instead the new layer stacks around the swag's reported band.
  const renderBottoms = () => bottoms.map((p, idx) => (
    <BottomPipingRing key={p.layerId ?? `b${idx}`} yBase={yBase} radius={radius} glbPath={p.glbUrl} color={p.color}
      gradient={p.gradient ?? null}
      sizeFactor={p.size ?? 1} softness={p.softness ?? PIPING_SOFTNESS_DEFAULT}
      bottomRotation={p.bottomRotation ?? [0,0,0]}
      extraRadialOffset={(p.extraRadialOffset ?? 0) + (p.userRadialOffset ?? 0)}
      yOffset={p.bend
        ? height * BEND_ANCHOR_FRAC + (p.userYOffset ?? 0)   // festoon: wall anchor + baked/nudged offset
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
      wrap={p.wrap ?? false} wrapTilt={p.wrapTilt ?? 0} wrapSize={p.wrapSize ?? 1}
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
        <TierBody position={[0, yBase, 0]} color={color} surf={mat}
          grainExtent={[2 * (shp.halfW + shp.halfD), height]}
          gradient={effGradient} geoSig={prismGeo?.uuid} castShadow receiveShadow>
          <primitive object={prismGeo} attach="geometry" />
        </TierBody>
      ) : roundedGeo ? (
        // Fondant-draped round tier: one rounded-edge solid (spans y ∈ [0,height]), positioned at
        // the base. No separate lid — the gradient/grain flow over the rounded rim continuously.
        <TierBody position={[0, yBase, 0]} color={color} surf={mat}
          grainExtent={[2 * Math.PI * radius, height]} dusting={dusting} foil={foil} finishMaps={finishMaps}
          gradient={effGradient} geoSig={roundedGeo.uuid} castShadow receiveShadow>
          <primitive object={roundedGeo} attach="geometry" />
        </TierBody>
      ) : styledGeo ? (
        // Cream STYLE wall (wave/swirl/rustic): a displaced cylinder, one centred mesh (caps flat),
        // no separate lid — the texture and gradient flow over the whole wall.
        <TierBody position={[0, centerY, 0]} color={color} surf={mat}
          grainExtent={[2 * Math.PI * radius, height]} dusting={dusting} foil={foil} finishMaps={finishMaps}
          gradient={effGradient} geoSig={styledGeo.uuid} castShadow receiveShadow>
          {/* key on the geometry uuid: <primitive> won't re-attach a swapped `object` without it, so
              changing the STYLE params (Depth/Waviness…) rebuilds styledGeo but the mesh kept the old one. */}
          <primitive key={styledGeo.uuid} object={styledGeo} attach="geometry" />
        </TierBody>
      ) : (
        <>
          <TierBody position={[0, centerY, 0]} color={color} surf={mat}
            grainExtent={[2 * Math.PI * radius, height]} dusting={dusting} foil={foil} finishMaps={finishMaps}
            overrideNormalMap={styleNormalMap} overrideNormalScale={styleNormalScale}
            gradient={effGradient} geoSig={`r${radius}h${height}`} castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, height, 64]} />
          </TierBody>
          {/* Top lid: a thin disk that reads as the cake's flat top. Under a vertical gradient its
              own 0.02-tall frame can't show the blend, so it takes the top (last) stop's colour. */}
          <mesh position={[0, topY + 0.01, 0]} castShadow>
            <cylinderGeometry args={[radius - 0.01, radius - 0.01, 0.02, 64]} />
            <meshStandardMaterial color={capColor} roughness={mat.roughness - 0.08} />
          </mesh>
        </>
      )}
      {!isRect && (
        <SecondCreamLayers layers={creamLayers ?? []} radius={radius} yBase={yBase} height={height}
          grainKey={mat.grain} grainDensity={mat.grainDensity} />
      )}
      {renderTops()}
      {renderBottoms()}
    </group>
  );
}
