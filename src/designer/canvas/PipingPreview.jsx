import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TopPipingRing, BottomPipingRing, buildRoundedPrism } from './CakeTier.jsx';
import { tierShape } from '../geometry/surface.js';
import { TIER_RADII, BOTTOM_H, PIPING_FRONT_ANGLE } from '../constants.js';

// Small live 3D preview of how a piping element renders on one cake zone (rim/board),
// in the currently-chosen layout (ring vs single). Reuses the real ring components so
// the preview matches the actual render exactly. Uses the real bottom-tier dimensions
// (radius 1.2 × height 1.45) so placement_config offsets look identical to the cake.
//
// `placement` is the object returned by pipingPlacementFromConfig() for this zone; its
// fields may be null (unset), so we apply the same `??` defaults CakeTier uses.
// Preview-only palette: a dark-chocolate cake so the cream piping reads with strong
// contrast (the real cake uses the user's chosen colors — this is just a legible stand-in).
const PREVIEW_CAKE_COLOR  = '#3A2418';   // dark chocolate brown body
const PREVIEW_CAP_COLOR   = '#46301F';   // slightly lighter chocolate top
const PREVIEW_CREAM_COLOR = '#F5E6C8';   // cream — pops against the dark chocolate
const PREVIEW_BOARD_COLOR = '#E8E4DD';   // light board/drum the cake sits on

export default function PipingPreview({
  zone, glbUrl, color = PREVIEW_CREAM_COLOR, size = 1,
  placement = {}, arrangement = 'ring', instances = null,
  tiers = null, tierIndex = 0,
  autoRotate = false,
}) {
  const isTop  = zone === 'rim';
  // Stack the real tier geometry when provided, so a 2-tier cake previews AS a 2-tier
  // cake with the ring on its actual tier (e.g. the bottom-tier rim sits at the seam the
  // upper tier rests on). Falls back to a single bottom tier when no geometry is passed.
  // Build the stacked tier geometry, keeping each tier's shape so a rectangular cake
  // previews AS a rectangle (rounded-rect prism) instead of always falling back to a
  // cylinder. `shp` is the same descriptor CakeTier feeds its piping rings, so placement
  // along a rect perimeter matches the real cake. Round tiers leave `shp.kind === 'round'`.
  const { placed, totalH } = useMemo(() => {
    const geo = (tiers?.length ? tiers : [{ radius: TIER_RADII[0], height: BOTTOM_H }])
      .map(t => {
        const radius = t?.radius ?? TIER_RADII[0];
        const height = t?.height ?? BOTTOM_H;
        const shp = tierShape({ shape: t?.shape, width: t?.width, depth: t?.depth, radius, cornerR: t?.cornerR });
        const prismGeo = shp.kind === 'rect' ? buildRoundedPrism(shp.halfW, shp.halfD, height, shp.cornerR) : null;
        return { radius, height, shp, prismGeo };
      });
    let acc = 0;
    const placed = geo.map(t => { const baseY = acc; acc += t.height; return { ...t, baseY, topY: baseY + t.height }; });
    return { placed, totalH: acc };
  }, [tiers]);
  const target = placed[Math.min(tierIndex, placed.length - 1)] ?? placed[0];
  const targetShape = target.shp;
  const bottomShape = placed[0].shp;
  const R      = target.radius;     // ring radius = its own tier's radius
  const R0     = placed[0].radius;  // bottom radius drives the board + framing
  const yBase  = target.baseY;
  const topY   = target.topY;
  const radial = placement.extraRadialOffset ?? 0;
  const yOff   = placement.yOffset ?? 0;
  const spacing = placement.spacing ?? 1;
  const swag   = [placement.swagCount ?? 0, placement.swagDepth ?? 0, placement.swagTilt ?? 0.5];
  const inst   = arrangement === 'single'
    ? (instances?.length ? instances : [{ id: 0, angle: PIPING_FRONT_ANGLE }])
    : null;
  const alt = {
    altEnabled:      placement.altEnabled ?? false,
    altGlbUrl:       placement.altGlbUrl ?? null,
    altFlip:         placement.altFlip ?? false,
    altRotation:     placement.altRotation ?? [0, 0, 0],
    altRadialOffset: placement.altRadialOffset ?? 0,
    altYOffset:      placement.altYOffset ?? 0,
    pattern:         placement.pattern ?? 'AB',
  };
  // U-shaped (bend/festoon) fields, forwarded so the popup preview matches the cake.
  const bendProps = {
    bend:      placement.bend ?? false,
    bendRing:  placement.bendRing ?? false,
    festoons:  placement.festoons ?? 6,
    bendDepth: placement.bendDepth ?? 0.4,
    bendTilt:  placement.bendTilt ?? 0,
  };
  // Frame the whole stack and look down on it at ~27° so the ring reads as a ring (not
  // edge-on). camY/camZ ratio sets the tilt — 0.5 ≈ a 63° polar angle, within the clamp
  // below. A small azimuth (≈18°) gives a static 3/4 view; horizontal distance stays camZ
  // so the framing/tilt math is unchanged. No auto-spin so the default angle is stable.
  const targetY = totalH * 0.5;
  const camZ    = Math.max(R0 * 4.7, totalH * 2.4);
  const camY    = targetY + camZ * 0.5;
  const camX    = camZ * 0.309;             // sin(18°)
  const camZView = camZ * 0.951;            // cos(18°)

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true }}
      camera={{ position: [camX, camY, camZView], fov: 32 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 9, 6]} intensity={1.3} />
      <directionalLight position={[-3, 3, -3]} intensity={0.4} />
      <Suspense fallback={null}>
        <Environment preset="apartment" />
        {/* cake board / drum the cake sits on (top flush with the cake base at y=0).
            Matches the bottom tier's footprint: a rect board under a rect cake, else round. */}
        {bottomShape.kind === 'rect' ? (
          <mesh position={[0, -0.04, 0]}>
            <boxGeometry args={[bottomShape.halfW * 2 * 1.28, 0.08, bottomShape.halfD * 2 * 1.28]} />
            <meshStandardMaterial color={PREVIEW_BOARD_COLOR} roughness={0.55} metalness={0.1} />
          </mesh>
        ) : (
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[R0 * 1.32, R0 * 1.32, 0.08, 56]} />
            <meshStandardMaterial color={PREVIEW_BOARD_COLOR} roughness={0.55} metalness={0.1} />
          </mesh>
        )}
        {/* stacked tier bodies. Rect tiers use the rounded-rect prism (flat top, no cap —
            a cap reads as a stray board on a rectangular cake); round tiers keep a thin cap. */}
        {placed.map((t, i) => (
          <group key={i}>
            {t.shp.kind === 'rect' ? (
              <mesh geometry={t.prismGeo} position={[0, t.baseY, 0]}>
                <meshStandardMaterial color={PREVIEW_CAKE_COLOR} roughness={0.85} />
              </mesh>
            ) : (
              <>
                <mesh position={[0, t.baseY + t.height / 2, 0]}>
                  <cylinderGeometry args={[t.radius, t.radius, t.height, 48]} />
                  <meshStandardMaterial color={PREVIEW_CAKE_COLOR} roughness={0.85} />
                </mesh>
                <mesh position={[0, t.topY + 0.005, 0]}>
                  <cylinderGeometry args={[t.radius - 0.01, t.radius - 0.01, 0.01, 48]} />
                  <meshStandardMaterial color={PREVIEW_CAP_COLOR} roughness={0.7} />
                </mesh>
              </>
            )}
          </group>
        ))}
        {isTop ? (
          <TopPipingRing
            topY={topY} radius={R} glbPath={glbUrl} color={color} sizeFactor={size}
            topRotation={placement.rotation ?? [0, 0, 0]}
            extraRadialOffset={radial} yOffset={yOff}
            flipTop={placement.flipTop ?? false} spacing={spacing}
            swagCount={swag[0]} swagDepth={swag[1]} swagTilt={swag[2]}
            arrangement={arrangement} instances={inst} shape={targetShape} {...alt} {...bendProps}
          />
        ) : (
          <BottomPipingRing
            yBase={yBase} radius={R} glbPath={glbUrl} color={color} sizeFactor={size}
            bottomRotation={placement.bottomRotation ?? [0, 0, 0]}
            extraRadialOffset={radial} yOffset={yOff}
            flipBottom={placement.flipBottom ?? true} spacing={spacing}
            swagCount={swag[0]} swagDepth={swag[1]} swagTilt={swag[2]}
            arrangement={arrangement} instances={inst} shape={targetShape} {...alt} {...bendProps}
          />
        )}
      </Suspense>
      {/* Gentle spin so bakers see the piping wraps (or sits at the front) around the cake. */}
      <OrbitControls
        enableZoom={false} enablePan={false} autoRotate={autoRotate} autoRotateSpeed={1.6}
        target={[0, targetY, 0]} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
