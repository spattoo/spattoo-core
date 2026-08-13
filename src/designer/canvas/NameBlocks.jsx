import { useMemo } from 'react';
import { RoundedBox, Text3D, Center } from '@react-three/drei';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { nameBlockLayout, NAME_BLOCK_DEFAULTS } from '../geometry/nameBlocks.js';

// ── A name spelled in fondant blocks ──────────────────────────────────────────
// Built from parts the canvas already has: RoundedBox (the board mesh uses it) for a cube nothing
// like sharp-edged, and Text3D with helvetiker bold — the same extruded-letter path AgeNumber's
// standing number and the glyph-shaped tiers use.
//
// ── THE LETTER IS RAISED, NOT PRINTED ───────────────────────────────────────────
// It is a separate solid standing PROUD of the face, because that is what the real thing is: a
// cutter-pressed fondant letter stuck on a cube. A texture would go flat the moment the cake turns,
// and these are usually seen from the side.
//
// One block per character; a space holds its place and draws nothing (see nameBlockLayout). A name
// is a handful of cubes, so each is its own mesh — instancing would buy nothing and would forbid
// the per-block letter that is the entire point.

function Block({ char, size, chamfer, letterScale, letterDepth, blockColor, letterColor }) {
  return (
    <>
      <RoundedBox args={[size, size, size]} radius={size * chamfer} smoothness={4} castShadow receiveShadow>
        {/* Fondant: matte, faintly waxy. Any shine and it reads as a plastic toy brick. */}
        <meshStandardMaterial color={blockColor} roughness={0.62} metalness={0} />
      </RoundedBox>
      {/* Seated ON the front face and extruding outward. `disableZ` keeps Center from pulling the
          letter's depth back through the face — it centres the glyph in X and Y only, which is what
          "centred on the face" means; centring Z as well would bury half the letter in the cube. */}
      <group position={[0, 0, size / 2]}>
        <Center disableZ>
          <Text3D
            font={helvetikerBold}
            size={size * letterScale}
            height={size * letterDepth}
            curveSegments={6}
            bevelEnabled
            bevelSize={size * 0.012}
            bevelThickness={size * 0.012}
            bevelSegments={2}
          >
            {char}
            <meshStandardMaterial color={letterColor} roughness={0.55} metalness={0} />
          </Text3D>
        </Center>
      </group>
    </>
  );
}

export default function NameBlocks({
  // Either a `text` to lay out on the spot (the studio, previews), or `blocks` — explicit
  // placements a baker has arranged. The designer passes blocks, because once one has been dragged
  // there is no run to re-derive: the arrangement IS the data.
  blocks: explicitBlocks = null, surfaceRadius = 1.8,
  text = '', zone = 'board', radius = 1.5, angle = 0, y = 0.1,
  offsetX = 0, offsetZ = 0,
  size = NAME_BLOCK_DEFAULTS.size,
  gap = NAME_BLOCK_DEFAULTS.gap,
  chamfer = NAME_BLOCK_DEFAULTS.chamfer,
  letterScale = NAME_BLOCK_DEFAULTS.letterScale,
  letterDepth = NAME_BLOCK_DEFAULTS.letterDepth,
  blockColor = NAME_BLOCK_DEFAULTS.blockColor,
  letterColor = NAME_BLOCK_DEFAULTS.letterColor,
  onStats,
}) {
  const blocks = useMemo(() => {
    // Explicit placements arrive in polar (u, v) — the currency the drag handles speak — so they are
    // resolved to world x/z here rather than stored that way. A cake that changes size then keeps
    // its arrangement proportionally instead of leaving blocks stranded off the board.
    if (explicitBlocks) {
      return explicitBlocks.map(b => ({
        char: b.char,
        x: b.v * surfaceRadius * Math.sin(b.u * Math.PI * 2),
        z: b.v * surfaceRadius * Math.cos(b.u * Math.PI * 2),
        yaw: b.yaw ?? 0,
      }));
    }
    return nameBlockLayout({ text, zone, radius, angle, size, gap, offsetX, offsetZ });
  }, [explicitBlocks, surfaceRadius, text, zone, radius, angle, size, gap, offsetX, offsetZ]);
  onStats?.({ blocks: blocks.length });
  if (!blocks.length) return null;

  return (
    <group>
      {blocks.map((b, i) => (
        // Seated so the cube RESTS on the surface rather than being centred in it — RoundedBox is
        // centred on its origin, so the lift is half an edge.
        <group key={`${b.char}-${i}`} position={[b.x, y + size / 2, b.z]} rotation={[0, b.yaw, 0]}>
          <Block char={b.char} size={size} chamfer={chamfer} letterScale={letterScale}
            letterDepth={letterDepth} blockColor={blockColor} letterColor={letterColor} />
        </group>
      ))}
    </group>
  );
}
