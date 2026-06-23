import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TopPipingRing, BottomPipingRing } from './CakeTier.jsx';
import { PIPING_FRONT_ANGLE } from '../constants.js';
import { buildPreviewTiers, PreviewCakeMeshes } from './previewCake.jsx';
import { SceneLoader } from './CakeSpinner.jsx';

// Small live 3D preview of how a piping element renders on one cake zone (rim/board),
// in the currently-chosen layout (ring vs single). Reuses the real ring components so
// the preview matches the actual render exactly. The mini-cake scaffold (tier geometry,
// board, bodies, palette) is shared with TopperPreview via previewCake.jsx.
//
// `placement` is the object returned by pipingPlacementFromConfig() for this zone; its
// fields may be null (unset), so we apply the same `??` defaults CakeTier uses.
const PREVIEW_CREAM_COLOR = '#F5E6C8';   // cream — pops against the dark chocolate stand-in

export default function PipingPreview({
  zone, glbUrl, color = PREVIEW_CREAM_COLOR, size = 1,
  placement = {}, arrangement = 'ring', instances = null,
  tiers = null, tierIndex = 0,
  autoRotate = false,
}) {
  const isTop  = zone === 'rim';
  // Stack the real tier geometry when provided, so a 2-tier cake previews AS a 2-tier cake
  // with the ring on its actual tier. Shared with TopperPreview (see previewCake.jsx).
  const { placed, totalH } = useMemo(() => buildPreviewTiers(tiers), [tiers]);
  const target = placed[Math.min(tierIndex, placed.length - 1)] ?? placed[0];
  const targetShape = target.shp;
  const R      = target.radius;     // ring radius = its own tier's radius
  const R0     = placed[0].radius;  // bottom radius drives the board + framing
  const yBase  = target.baseY;
  const topY   = target.topY;
  const radial = placement.extraRadialOffset ?? 0;
  const yOff   = placement.yOffset ?? 0;
  const spacing = placement.spacing ?? 1;
  const softness = placement.softness ?? undefined;   // undefined → ring uses PIPING_SOFTNESS_DEFAULT
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
    wrap:      placement.wrap ?? false,
  };
  // Chocolate-drip fields, forwarded so the popup preview matches the cake (rim only).
  const dripProps = {
    drip:       placement.drip ?? false,
    dripConfig: placement.dripConfig ?? null,
    dripGloss:  placement.dripGloss ?? undefined,
    dripLength: placement.dripLength ?? undefined,
    dripFlood:  placement.dripFlood ?? false,
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
      <Suspense fallback={<SceneLoader size={20} />}>
        <Environment preset="apartment" />
        <PreviewCakeMeshes placed={placed} />
        {isTop ? (
          <TopPipingRing
            topY={topY} radius={R} glbPath={glbUrl} color={color} sizeFactor={size} softness={softness}
            topRotation={placement.rotation ?? [0, 0, 0]}
            extraRadialOffset={radial} yOffset={yOff}
            flipTop={placement.flipTop ?? false} spacing={spacing}
            swagCount={swag[0]} swagDepth={swag[1]} swagTilt={swag[2]}
            arrangement={arrangement} instances={inst} shape={targetShape} {...alt} {...bendProps} {...dripProps}
          />
        ) : (
          <BottomPipingRing
            yBase={yBase} radius={R} glbPath={glbUrl} color={color} sizeFactor={size} softness={softness}
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
