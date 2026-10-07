import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import SelectionBox from './SelectionBox.jsx';
import { albedoForLight } from '../shared/albedoForLight.js';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';
import {
  buildBalloon, BALLOON_DEFAULTS, BALLOON_PLACEMENT_DEFAULTS, balloonPlacement,
} from '../geometry/balloon.js';

/* ── A fondant balloon on a pick ─────────────────────────────────────────────────────────────────
 *
 * The geometry comes from geometry/balloon.js, which the admin studio also calls — one generator,
 * so what is tuned at /elements/balloon is what a customer gets (INVARIANTS #15).
 *
 * ⚠️ IT DRAWS NO STICK. The pick is authored per element on the Manage Elements row
 * (`elementStick.js` → `topperStick`), with its own bury depth, built exactly so it would not live
 * inside individual decorations. Two answers to "how long is the stick" is how a baker buries it to
 * one depth on one screen and another depth on the other. `float` lifts the balloon off the lid;
 * the thing holding it up there is the row's.
 */

// Grain size: world units per repeat of the shared fondant map. The same 0.18 the cloud, the
// rainbow and the GLB path use — a balloon subtly smoother than the cloud beside it reads as a
// different material, which is the whole reason this texture is shared.
const FONDANT_TILE = 0.18;

/* ⚠️ MEASURED FOR THIS SURFACE, and the measurement is the only reason this number is allowed to
 * be the cloud's. Every surface in the scene receives a different amount of light (INVARIANTS #16),
 * so a balloon floating above the lid on a pick had no business borrowing a number solved for a
 * cloud lying on the cake — that would be a guess wearing a measurement's clothes.
 *
 * So it was taken: `SURFACE=balloon node scripts/measure-surface-colour.mjs`, which needed
 * `?balloon=1` adding to dev/garnish-on-cake.jsx and a row in that script's SURFACES table.
 * With this light in place a mid-grey #808080 renders 127,127,126 — drift −1,−1,−2, which is as
 * close as the recipe's two-measurement interpolation ever gets, so no second pass was needed.
 *
 * The rolloff was judged the way the recipe says — across the colours bakers actually pick, never
 * on grey. At 2.0: mean error 11.6 per channel, worst channel 39 (blush −21,−8,−16; teal
 * +39,−8,−2; rose −14,+2,0; green +19,−7,+23; chocolate 0,+6,+12; ivory −16,−12,−3). That sits on
 * top of the numbers cream was tuned to (11.4 mean, 38 worst), so 2.0 stands here too.
 *
 * ⚠️ Re-measure after any change to the HDRI, the scene intensity, the lamps, or this surface's own
 * roughness — the agreement with the cloud is a measured coincidence, not a shared constant. */
const BALLOON_REFERENCE_LIGHT = [2.219, 1.793, 1.505];
const BALLOON_ROLLOFF = 2.0;

// Clearance between the body and its selection cue, in the balloon's LOCAL units (the body is 1
// tall), so it scales with the balloon instead of crowding a small one and swamping a large one.
const BOX_PAD = 0.1;

export default function FondantBalloon({
  params = {},
  cake,                      // { radius, topY, boardY }
  roughness = 0.8,           // fondant: matte, with just enough sheen to read as sugar not chalk
  metalness = 0,
  fondant = true,
  selected = false,          // draws the selection cue INSIDE this component's own transform
}) {
  const p = { ...BALLOON_DEFAULTS, ...BALLOON_PLACEMENT_DEFAULTS, ...params };
  const place = useMemo(() => balloonPlacement(p, cake ?? {}), [JSON.stringify(p), JSON.stringify(cake)]);

  const geo = useMemo(() => buildBalloon(p), [
    p.width, p.belly, p.neck, p.knot, p.collar, p.crown, p.segments, p.radial, p.height,
  ]);
  useEffect(() => () => geo?.dispose(), [geo]);

  /* The grain repeat is built from the CIRCUMFERENCE, not the diameter — the lathe's u runs all the
     way round and its v from the knot to the apex. Getting that wrong is what made the first
     fondant cloud look like embossed fabric, and it is just as wrong on a balloon. */
  const grain = useMemo(() => {
    if (!fondant) return null;
    const r = (p.width * p.height) / 2;
    const t = getFondantNormalMap().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, (2 * Math.PI * r) / FONDANT_TILE), Math.max(1, p.height / FONDANT_TILE));
    t.needsUpdate = true;
    return t;
  }, [p.width, p.height, fondant]);
  useEffect(() => () => grain?.dispose(), [grain]);

  const scale = (p.scale ?? 1) * (cake?.radius ?? 1) * 0.55;
  // How much pick is showing: lid to the balloon's base, in world units.
  const stickLen = Math.max(0, place.position[1] - place.footY);
  const stickR   = ((p.stickWidth ?? 0.012) * (cake?.radius ?? 1)) / scale;

  return (
    /* ⚠️ THE LEAN IS OUTSIDE THE YAW, and that is what makes four arrows mean four directions.
       This was one group, `rotation={[0, theta, tilt]}` — and with three's XYZ order that composes
       as Ry(theta)·Rz(tilt), so the lean was applied in the balloon's own frame and THEN swung
       round by where it sits on the cake. A balloon at the front leaned along world X, one at the
       side along world Z. Fine for a single authored number; incoherent for a control, where "left"
       has to stay left wherever the balloon is. The lean now sits above the yaw, in cake space, and
       the yaw below it only decides which way the body faces — which on a surface of revolution is
       the grain and the knot. */
    <group position={place.position} rotation={[place.tiltAngle, 0, place.rollAngle]} scale={scale}>
      <group rotation={[0, p.theta ?? 0, 0]}>
      {/* ⚠️ THE PICK, DRAWN HERE. The element-stick row property is for STICKERS — it is read off
          `sticker.stick` in that render path, which a procedural decoration never enters. A balloon
          without this floats in mid-air, which is exactly what shipped before Sandeep saw it.

          Inside the tilted group on purpose: a leaning balloon leans ON its pick, so the rod turns
          with it. Its length is the float, so "how high it rides" and "how much stick is showing"
          cannot disagree — divided by the group's scale because the group is already scaled. */}
      {p.stick !== false && stickLen > 1e-3 && (
        <mesh position={[0, -stickLen / (2 * scale), 0]} castShadow>
          <cylinderGeometry args={[stickR, stickR, stickLen / scale, 10]} />
          <meshStandardMaterial color={p.stickColor ?? '#D8C9A6'} roughness={0.6} metalness={0} />
        </mesh>
      )}
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial
          color={albedoForLight(p.color ?? '#F4EFE6', BALLOON_REFERENCE_LIGHT, { rolloff: BALLOON_ROLLOFF })}
          roughness={roughness}
          metalness={metalness}
          normalMap={grain ?? null}
          // normalScale 1.5 matches the cloud, the rainbow and the GLB path — at the shipped 0.5 the
          // grain was too faint to see, which is recorded in all of those and is just as true here.
          normalScale={grain ? new THREE.Vector2(1.5, 1.5) : undefined}
        />
      </mesh>
      </group>
      {/* ⚠️ THE CUE IS DRAWN HERE, INSIDE THE LEAN — which is what SelectionBox's own note asks for:
          "a sibling of whatever rendered the element — so it inherits that element's position,
          facing, tilt and scale for free". The balloon's box used to be built in CakeCanvas,
          OUTSIDE this group, from the placement position alone. Upright that reads as a snug box;
          leaning, the balloon walks straight out of a cue that stays bolt upright, which is law 4
          ("what you can grab is what you can see") breaking in front of the customer. It was only
          ever a little wrong because the one Lean axis reached ±23°; at the shared ±70° it is
          obvious. Drawn here it cannot drift, and `check:movable` rule 3 — no SelectionBox group
          carrying its own rotation — is satisfied by construction rather than by care.

          Local units: the geometry spans y 0..1 and ±width/2, and this group already carries the
          scale, so the box is authored in the balloon's own numbers and never re-derives them. */}
      {selected && (
        <SelectionBox
          width={(p.width ?? BALLOON_DEFAULTS.width) + BOX_PAD}
          depth={(p.width ?? BALLOON_DEFAULTS.width) + BOX_PAD}
          height={(p.height ?? BALLOON_DEFAULTS.height) + BOX_PAD}
          centerY={((p.height ?? BALLOON_DEFAULTS.height) + BOX_PAD) / 2}
        />
      )}
    </group>
  );
}
