import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Text3D, Center } from '@react-three/drei';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { numberTopperPlaceAt } from '../geometry/surface.js';
import { planeHit } from '../utils/raycasting.js';
import { useDragPlacement } from '../hooks/useDragPlacement.js';

const DEG = Math.PI / 180;

// A flat, BEVELLED gold number standing upright on the cake top — the "number candle" look
// (extruded face + chamfered bevel that catches the light), NOT a balloon. Reuses the same Text3D
// beveled engine as the Texts decoration; only the material (warm metallic gold/silver) and the
// upright top-surface placement differ. Dragged on the top plane (grab disables orbit; a no-move
// press = tap → select).
//
// Material: Text3D exposes two material slots — index 0 = front/back faces, index 1 = side+bevel.
// A satin warm-gold face + a slightly darker, shinier side/bevel reads as a metal candle number.
const FINISHES = {
  gold:   { face: '#c9a23f', side: '#a07c2c', emissive: '#2a1c04' },
  silver: { face: '#cdd2d8', side: '#9aa0a8', emissive: '#202428' },
};

/* ── What the number is MADE OF ──────────────────────────────────────────────────────────────────
 *
 * ⚠️ MATERIAL CARRIES THE THICKNESS, because the two are one fact about the object. A laser-cut
 * acrylic topper is a thin sheet with a mirror edge; a fondant one is hand-cut, chunkier and matte.
 * Offering a separate thickness slider would let a baker build a 3mm mirror slab that exists in no
 * bakery. Sandeep asked for both in one breath — *"its too thick. reduce the thickness, or let user
 * control it. and add a new thing, let the user choose the material acrylic vs fondant"* — and the
 * material IS the control.
 * ⚠️ `depth` IS A FRACTION OF THE DIGIT HEIGHT, so it holds at every Size. It was a flat 0.34 of
 * the height for everything, which is what read as too thick: at the default size that is a slab
 * about a third as deep as the number is tall. Acrylic is 0.10 (a sheet), fondant 0.20 (cut by
 * hand). Both are thinner than what shipped, which is the reported complaint.
 * ⚠️ `bevel` SCALES WITH THE DEPTH rather than staying at the old absolute, or a thin acrylic sheet
 * is mostly chamfer and the flat face disappears.
 */
export const AGE_MATERIALS = {
  acrylic: { depth: 0.10, bevel: 0.30, metalness: 0.95, roughness: 0.14,
             clearcoat: 0.9, clearcoatRoughness: 0.06, emissiveIntensity: 0.28 },
  fondant: { depth: 0.20, bevel: 0.16, metalness: 0.05, roughness: 0.78,
             clearcoat: 0.08, clearcoatRoughness: 0.6, emissiveIntensity: 0.10 },
};
export const AGE_MATERIAL_KEYS = Object.keys(AGE_MATERIALS);

export default function AgeNumber({
  age, topY, shape = 'round', shp,
  onClick, onMove, onOrbitEnable, selected = false,
}) {
  const { camera, gl } = useThree();
  const size  = age?.size ?? 0.95;                                   // standing height (world units)
  const value = String(age?.value ?? '').replace(/[^0-9]/g, '');    // digits only
  const fin   = FINISHES[age?.finish] ?? FINISHES.gold;
  const mat   = AGE_MATERIALS[age?.material] ?? AGE_MATERIALS.acrylic;

  // Drag on the cake-top plane → snap inside the surface footprint; shared press/drag/tap behaviour.
  const { grabProps } = useDragPlacement({
    camera, gl, onMove, onClick, onOrbitEnable,
    resolve: (ray) => {
      // The rule lives in geometry/surface.js so the movable contract can ask it questions.
      // Intersecting the plane stays here, because that needs a camera.
      return numberTopperPlaceAt(shp,
        planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY)));
    },
  });

  /* The topper's own terms, published like the edge-seat and foot-seat hooks: "it will not move"
     and "it moves and the write-back is dropped" look identical on screen. */
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    window.__ageTopper = { id: age?.id, value, size,
      offsetX: +(age?.offsetX ?? 0).toFixed(4), offsetZ: +(age?.offsetZ ?? 0).toFixed(4),
      hasOnMove: typeof onMove === 'function' };
  }

  if (!value) return null;

  const yaw = (age.yaw ?? 0) * DEG;
  const ox  = age.offsetX ?? 0;
  const oz  = age.offsetZ ?? 0;

  // Approximate footprint for the grab plane (Text3D is auto-centred by <Center>).
  const numW = value.length * size * 0.7;
  const numH = size * 0.72;   // cap height for helvetiker bold
  /* ⚠️ A FLOOR UNDER THE GRAB TARGET, because the digits ARE the target and a small one is a few
     pixels. The plane was exactly the artwork plus a hair, so at the dial's smallest size (0.4) a
     single digit gives roughly 0.4 x 0.4 world units — unhittable in practice, and reported as
     *"its not movable, though its made movable in admin"*. It was movable; it could not be caught.
     The number renders unchanged — this is the invisible plane in front of it, and a decoration
     that cannot be grabbed is not movable in any sense a baker would recognise (rule 7: if it does
     something, it must look like it does something — and be reachable). */
  const GRAB_MIN = 0.55;
  const grabW = Math.max(numW + size * 0.3, GRAB_MIN);
  const grabH = Math.max(numH + size * 0.3, GRAB_MIN);

  const matProps = (color) => ({
    color, metalness: mat.metalness, roughness: mat.roughness,
    clearcoat: mat.clearcoat, clearcoatRoughness: mat.clearcoatRoughness, envMapIntensity: 1.0,
    emissive: fin.emissive,
    // Selection still lifts it, but from the material's own resting glow — a matte fondant number
    // that flared like polished acrylic when tapped would read as the wrong substance.
    emissiveIntensity: selected ? mat.emissiveIntensity + 0.17 : mat.emissiveIntensity,
  });

  // Stand upright on the top surface: <Center disableY> centres X & Z but keeps the baseline at
  // y=0, so seating the group at topY lands the digits' base on the cake top. yaw spins it.
  return (
    <group position={[ox, topY + 0.01, oz]} rotation={[0, yaw, 0]}>
      <Center disableY>
        <Text3D
          key={`${value}-${age.finish}-${age.material ?? 'acrylic'}`}
          font={helvetikerBold}
          size={size}
          height={size * mat.depth}
          curveSegments={12}
          bevelEnabled
          bevelThickness={size * mat.depth * mat.bevel}
          bevelSize={size * mat.depth * mat.bevel * 0.72}
          bevelOffset={0}
          bevelSegments={6}
        >
          {value}
          <meshPhysicalMaterial attach="material-0" {...matProps(fin.face)} />
          <meshPhysicalMaterial attach="material-1" {...matProps(fin.side)} />
        </Text3D>
      </Center>
      {/* upright grab plane just in front of the number */}
      <mesh position={[0, grabH / 2, size * 0.22]} {...grabProps}>
        <planeGeometry args={[grabW, grabH]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false}
          side={THREE.DoubleSide} /* or it is not a target from behind, and the decoration
          becomes ungrabbable the moment the cake is turned past it */ />
      </mesh>
    </group>
  );
}
