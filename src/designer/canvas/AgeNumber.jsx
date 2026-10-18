import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Text3D, Center } from '@react-three/drei';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { numberTopperPlaceAt } from '../geometry/surface.js';
import { planeHit } from '../utils/raycasting.js';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { getFondantNormalMap, applyBoxUVs } from '../shared/textures/fondantTexture.js';

const DEG = Math.PI / 180;

// A flat, BEVELLED gold number standing upright on the cake top — the "number candle" look
// (extruded face + chamfered bevel that catches the light), NOT a balloon. Reuses the same Text3D
// beveled engine as the Texts decoration; only the material (warm metallic gold/silver) and the
// upright top-surface placement differ. Dragged on the top plane (grab disables orbit; a no-move
// press = tap → select).
//
// Material: Text3D exposes two material slots — index 0 = front/back faces, index 1 = side+bevel.
// A satin warm-gold face + a slightly darker, shinier side/bevel reads as a metal candle number.
/* The two quick picks. They are COLOURS, not modes — the wheel below can reach anything, and these
   are the two a number topper is most often ordered in. */
const FINISHES = {
  gold:   { face: '#c9a23f' },
  silver: { face: '#cdd2d8' },
};
// The presets as plain colours, for the card: the two buttons and the wheel write the same field.
export const AGE_FINISH_COLORS = Object.fromEntries(
  Object.entries(FINISHES).map(([k, v]) => [k, v.face]));

/* Multiply a hex towards black. Used for the cut edge and the emissive floor, so BOTH follow
   whatever colour is chosen rather than being authored per finish — a custom pink with a fixed
   brown edge is the bug this replaces. */
function shade(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return hex;
  const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, '0')).join('')}`;
}

/* ── What the number is MADE OF ──────────────────────────────────────────────────────────────────
 *
 * ⚠️ MATERIAL CARRIES THE THICKNESS, because the two are one fact about the object. A laser-cut
 * acrylic topper is a thin sheet with a mirror edge; a fondant one is hand-cut, chunkier and matte.
 * Sandeep asked for both in one breath — *"its too thick. reduce the thickness, or let user control
 * it"* — and the first pass answered only the first half, with numbers that were still far too deep.
 * ⚠️ **THE MATERIAL SETS THE RANGE; THE BAKER MOVES INSIDE IT.** That is how both halves are true
 * at once. A free slider would let someone build a 3mm mirror slab in fondant or a 2cm acrylic
 * block, neither of which exists in a bakery; a fixed depth ignores a direct request. So each
 * material carries `depth` (what it is by default), `depthMin` and `depthMax` (what that substance
 * can plausibly be), and `age.slab` is clamped into that window.
 * ⚠️ **`slab`, NOT `thickness` — the obvious name is TAKEN AND DEAD.** `addAge` has always seeded
 * `thickness: 0.085`, a tube RADIUS from the cream-sweep number candle this replaced; nothing has
 * read it since, but it is written into every saved design. Taking the name over silently gave
 * every fresh number 0.085 (and every acrylic one its 0.08 ceiling, clamped) and would have
 * back-dated the same depth onto every cake already saved. This file's own card had the identical
 * collision once before — it *"wrote `thickness` while the acrylic builder reads `sheet`, so it
 * moved a number nothing consumed"*. A field being unread does not make its name free.
 * ⚠️ `depth` IS A FRACTION OF THE DIGIT HEIGHT, so it holds at every Size.
 * ⚠️ **MEASURED AGAINST THE STROKE, NOT AGAINST THE HEIGHT — that is the error the first pass
 * made.** A fraction of the digit height sounds thin at 0.22 until you measure the thing a reader
 * actually compares it with: the stroke of a `1` in this font is 0.242 of its height, so a 0.22
 * slab is 0.91x the stroke width — a square column, which is exactly why it still read as thick
 * after being "reduced". Grounded in the real objects instead: a fondant number is rolled to about
 * 5mm and stands 8-10cm (~0.06 of its height), laser-cut acrylic is a 3mm sheet (~0.035). Those
 * are the defaults now; the old 0.10/0.22 were three to four times too deep.
 * ⚠️ `bevel` SCALES WITH THE DEPTH rather than staying at the old absolute, or a thin acrylic sheet
 * is mostly chamfer and the flat face disappears.
 */
export const AGE_MATERIALS = {
  /* ⚠️ THE EDGE IS HALF OF WHAT THE MATERIAL IS. Acrylic is sawn and polished: a shallow chamfer
     over few segments, so the corner stays crisp and catches a hard line of light. Fondant is
     rolled and cut by hand and has no sharp edge anywhere — *"fondant should not have sharp
     edges"* — so its bevel takes nearly half the depth over enough segments to read as a ROUNDED
     roll rather than a chamfer. Same geometry, two different objects.
     ⚠️ `grain` IS THE SHARED FONDANT NORMAL MAP, the one every other fondant decoration already
     wears (`useSharedFondantTexture` → getFondantNormalMap). Without it a matte gold number is
     just unlit acrylic: *"it does not have fondant texture"*. Matte alone is not a substance. */
  acrylic: { depth: 0.035, depthMin: 0.02, depthMax: 0.08, bevel: 0.28, bevelSegments: 3,  grain: false, edgeShade: 0.78,
             metalness: 0.95, roughness: 0.14,
             clearcoat: 0.9, clearcoatRoughness: 0.06, emissiveIntensity: 0.28 },
  /* ⚠️ `edgeShade: 1` — THE EDGE IS THE SAME COLOUR AS THE FACE, and anything else draws a border.
     Text3D's second material slot is side AND bevel, so a darker edge colour wraps however much of
     the front silhouette the bevel occupies. On acrylic that is a 3-segment chamfer and reads as a
     polished cut edge; on fondant the bevel is nearly half the depth over 14 segments, so the same
     darker colour became a thick outline drawn round the digit — reported as *"why there is a
     border like thing for number 2"*, and introduced by the rounding that fixed the sharp edges.
     A fondant number is cut from ONE sheet and is one colour all the way through. */
  fondant: { depth: 0.06, depthMin: 0.035, depthMax: 0.13, bevel: 0.46, bevelSegments: 14, grain: true, edgeShade: 1,
             metalness: 0.0,  roughness: 0.92,
             clearcoat: 0.0, clearcoatRoughness: 0.9, emissiveIntensity: 0.06 },
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
  /* ⚠️ CLAMPED INTO THE MATERIAL'S OWN WINDOW, every frame — not just when the slider moves.
     Switching acrylic -> fondant carries a `thickness` chosen under the old range, and an
     unclamped read would render a fondant number at an acrylic sheet's depth. */
  const depthFrac = Math.min(mat.depthMax, Math.max(mat.depthMin, age?.slab ?? mat.depth));
  const slabDepth = size * depthFrac;
  /* An authored colour wins over the preset, so the wheel can reach anything and Gold/Silver stay
     one tap away. Edge and emissive are DERIVED from it — see `shade`. */
  const face  = age?.color ?? fin.face;
  const side  = mat.edgeShade >= 1 ? face : shade(face, mat.edgeShade);
  const glow  = shade(face, 0.16);

  /* ⚠️ THE GRAIN GOES ON AFTER THE GEOMETRY EXISTS, because Text3D builds it. The same two steps
     the sticker path runs for `useSharedFondantTexture`: box-UV the extrusion (it has no UVs of its
     own worth using) and hang the shared normal map on both material slots — face and side+bevel —
     or the roll reads as fondant and the flat face stays plastic.
     ⚠️ KEYED ON WHAT REBUILDS THE MESH. Text3D remounts on value/size/material, so the geometry
     this ran against can be replaced underneath it; the deps list every input that does so. */
  const textRef = useRef(null);
  useEffect(() => {
    const m = textRef.current;
    if (!m?.geometry || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!mat.grain) {
      mats.forEach(nm => { if (nm.normalMap) { nm.normalMap = null; nm.needsUpdate = true; } });
      return;
    }
    applyBoxUVs(m.geometry, 0.11);                 // finer than a sticker's 0.18: a digit is small
    const normal = getFondantNormalMap();
    mats.forEach(nm => {
      nm.normalMap = normal;
      nm.normalScale = new THREE.Vector2(1.1, 1.1);
      nm.needsUpdate = true;
    });
    /* ⚠️ REPORTED FROM INSIDE THE EFFECT, not from the render. A render-time read of
       `textRef.current` runs BEFORE this has applied anything, so it answers "no grain" on the very
       frame that is about to add it — a probe that cannot see the thing it is probing. Same trap as
       every other check-after-the-conclusion in this codebase. */
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      window.__ageGrain = { applied: mats.map(nm => !!nm.normalMap), uv: !!m.geometry.attributes.uv };
    }
  }, [value, size, mat, depthFrac, age?.finish, age?.color]);

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
      hasOnMove: typeof onMove === 'function',
      material: age?.material ?? 'acrylic',
      finish: age?.finish ?? 'gold', face, side,
      slab: +depthFrac.toFixed(4), depth: +slabDepth.toFixed(4) };
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
    emissive: glow,
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
          ref={textRef}
          key={`${value}-${age.finish}-${age.material ?? 'acrylic'}`}
          font={helvetikerBold}
          size={size}
          height={slabDepth}
          curveSegments={12}
          bevelEnabled
          bevelThickness={slabDepth * mat.bevel}
          bevelSize={slabDepth * mat.bevel * 0.72}
          bevelOffset={0}
          bevelSegments={mat.bevelSegments}
        >
          {value}
          <meshPhysicalMaterial attach="material-0" {...matProps(face)} />
          <meshPhysicalMaterial attach="material-1" {...matProps(side)} />
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
