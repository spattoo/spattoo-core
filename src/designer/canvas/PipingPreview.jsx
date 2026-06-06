import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TopPipingRing, BottomPipingRing } from './CakeTier.jsx';
import { TIER_RADII, BOTTOM_H, PIPING_FRONT_ANGLE } from '../constants.js';

// Small live 3D preview of how a piping element renders on one cake zone (rim/board),
// in the currently-chosen layout (ring vs single). Reuses the real ring components so
// the preview matches the actual render exactly. Uses the real bottom-tier dimensions
// (radius 1.2 × height 1.45) so placement_config offsets look identical to the cake.
//
// `placement` is the object returned by pipingPlacementFromConfig() for this zone; its
// fields may be null (unset), so we apply the same `??` defaults CakeTier uses.
// Preview-only palette: a neutral light-grey cake so the cream piping reads clearly
// (the real cake uses the user's chosen colors — this is just a legible stand-in).
const PREVIEW_CAKE_COLOR  = '#E6E5EA';   // light grey body
const PREVIEW_CAP_COLOR   = '#EFEEF2';   // slightly lighter top
const PREVIEW_CREAM_COLOR = '#EE9A5C';   // warm peach cream — pops against the grey
const PREVIEW_BOARD_COLOR = '#CFCDD6';   // cake board/drum the cake sits on

export default function PipingPreview({
  zone, glbUrl, color = PREVIEW_CREAM_COLOR, size = 1,
  placement = {}, arrangement = 'ring', instances = null,
  autoRotate = true,
}) {
  const isTop  = zone === 'rim';
  const R      = TIER_RADII[0];
  const H      = BOTTOM_H;
  const yBase  = 0;
  const topY   = H;
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

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true }}
      // Pull back so the cake fills ~75% of the frame — leaves margin so the full ring
      // of loops stays in view instead of being cropped at the edges.
      camera={{ position: [0, H * 0.95, R * 4.7], fov: 32 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 9, 6]} intensity={1.3} />
      <directionalLight position={[-3, 3, -3]} intensity={0.4} />
      <Suspense fallback={null}>
        <Environment preset="apartment" />
        {/* cake board / drum the cake sits on (top flush with the cake base at y=0) */}
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[R * 1.32, R * 1.32, 0.08, 56]} />
          <meshStandardMaterial color={PREVIEW_BOARD_COLOR} roughness={0.55} metalness={0.1} />
        </mesh>
        {/* mini cake body */}
        <mesh position={[0, H / 2, 0]}>
          <cylinderGeometry args={[R, R, H, 48]} />
          <meshStandardMaterial color={PREVIEW_CAKE_COLOR} roughness={0.85} />
        </mesh>
        <mesh position={[0, H + 0.005, 0]}>
          <cylinderGeometry args={[R - 0.01, R - 0.01, 0.01, 48]} />
          <meshStandardMaterial color={PREVIEW_CAP_COLOR} roughness={0.7} />
        </mesh>
        {isTop ? (
          <TopPipingRing
            topY={topY} radius={R} glbPath={glbUrl} color={color} sizeFactor={size}
            topRotation={placement.rotation ?? [0, 0, 0]}
            extraRadialOffset={radial} yOffset={yOff}
            flipTop={placement.flipTop ?? false} spacing={spacing}
            swagCount={swag[0]} swagDepth={swag[1]} swagTilt={swag[2]}
            arrangement={arrangement} instances={inst} {...alt}
          />
        ) : (
          <BottomPipingRing
            yBase={yBase} radius={R} glbPath={glbUrl} color={color} sizeFactor={size}
            bottomRotation={placement.bottomRotation ?? [0, 0, 0]}
            extraRadialOffset={radial} yOffset={yOff}
            flipBottom={placement.flipBottom ?? true} spacing={spacing}
            swagCount={swag[0]} swagDepth={swag[1]} swagTilt={swag[2]}
            arrangement={arrangement} instances={inst} {...alt}
          />
        )}
      </Suspense>
      {/* Gentle spin so bakers see the piping wraps (or sits at the front) around the cake. */}
      <OrbitControls
        enableZoom={false} enablePan={false} autoRotate={autoRotate} autoRotateSpeed={1.6}
        target={[0, H / 2, 0]} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
