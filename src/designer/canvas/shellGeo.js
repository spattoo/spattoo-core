import * as THREE from 'three';
import { isRoundWall, perimeter, circlePerimeter } from '../geometry/surface.js';
import { SHELL_HEIGHT_FRAC } from './pipingMetrics.js';

/* ⚠️ MOVED WITH THE FUNCTION THAT NEEDS IT. `buildShellGeo` reads `DEG` to turn the authored tilt
 * from degrees into radians; when these four functions came out of CakeTier.jsx the constant stayed
 * behind, and the calibrator threw "DEG is not defined" the moment a GLB was loaded. A moved
 * function takes its constants with it. */
const DEG = Math.PI / 180;

// Cream piping must hug the cake, not float off it. The shell's radial depth (how far it
// reaches off the wall) is limited dynamically to a fraction of the tier radius — so a
// smaller tier gets a tighter limit. Past the limit, raising the size slider no longer
// enlarges the shell, which is what keeps the cream from leaving the cake.
//
// ⚠️ THE DEFAULT ONLY. This was the whole ceiling, read from nowhere, and it silently overrode
// every `scale.max` an admin ever typed: the Rosette authored `{ min: 1, max: 5 }`, the dial
// travelled to 5.00, and the render was byte-identical to 2.00 — 0 changed pixels of 252,000,
// because the cap bound at 1.40 and nothing anywhere said so. Sandeep: *"what is the point we
// have scale configuration?"* It is a real rail — it is why a shell cannot be dragged off a small
// tier — so it stays, as the value a row gets when it asks for nothing. `placement_config
// .max_depth` overrides it per element (CLAUDE.md rule 3: every tunable value is DB-overlaid).
/* ⚠️ 0.30, RAISED FROM 0.16 — THE OLD VALUE WAS BELOW THE SHELLS WE SHIP. At a tier radius of 1.2 a
   normally-proportioned shell (as deep as it is tall) renders 0.230 deep at size 1 against a 0.192
   ceiling, so the authored shell was ALREADY over the cap and the `Math.max` floor below was the
   only thing in play — which pinned every Size dial at +15% however far the row let it travel.
   Reported as *"why size control is not working for piping?"* with the card reading 3.25.
   The rail itself is real and stays: it is what stops a shell being grown off a small tier. */
const PIPING_MAX_DEPTH_FRAC = 0.30;

// The radial ceiling this row actually authorised, as a fraction of the tier radius.
function maxDepthFrac(placementConfig) {
  const v = placementConfig?.max_depth;
  return typeof v === 'number' && v > 0 ? v : PIPING_MAX_DEPTH_FRAC;
}

/* ── Piping shell geometry — pure, and deliberately NOT in CakeTier.jsx ──────────────────────────
 *
 * These four were module-private inside the tier renderer. Admin's Piping Calibrator needed them —
 * it had reimplemented them instead, and the copies drifted (its buildShellGeo took no radius, so
 * it never capped a shell against the tier and showed sizes the cake will never render).
 *
 * ⚠️ THEY LIVE HERE RATHER THAN BEING EXPORTED FROM CakeTier.jsx, and the reason is a gate rather
 * than taste. Exporting from that file puts a module that CAN LIGHT A SCENE on the package's public
 * surface, and `check:env-map` fails it: a host mounting it would silently get drei's 1.4MB preset
 * HDR instead of the environment cakes ship under. The honest fix is for the pure maths to stop
 * living in a renderer, not for the gate to grow an exception — adding one because your own change
 * tripped it is how a gate dies.
 */

// Bake a shell geometry from a GLB scene: optional flip (180° X + re-anchor to the base)
// and normalise size to ~24% of the tier radius. Returns the geometry plus the scale and
// bounding extents the ring uses for radius/spacing. Shared by version A and the alternate.
export function buildShellGeo(scene, flip, radius, sizeFactor, tiltDeg = [0, 0, 0], placementConfig = null) {
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
  /* ⚠️ THE CAP MEASURES THE TILTED DEPTH — the third site of the same untilted-measurement bug,
     after the decoration ring's seat height and the rings' radial seat. `bbSize.z` is the shell's
     reach BEFORE the authored rotation; laid face-up with -90° about X this disc reaches its full
     1.901 radially rather than its 0.903 standing depth, so a cap fed the upright figure permits
     an overhang of more than twice what it is there to allow. Rotating the box costs one matrix
     and is exact; for an untilted shell it IS `bbSize.z`, so no existing row moves. */
  const rotM = new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(tiltDeg[0] * DEG, 0, tiltDeg[2] * DEG));
  const rbox = geo.boundingBox.clone().applyMatrix4(rotM);
  const sc   = capShellScale(sc1, sizeFactor, rbox.max.z - rbox.min.z, radius, placementConfig);
  // True rendered vertical reach: transform the shell's bounding box by the same scale and
  // tilt (meshRot X/Z — the renderer's yaw about Y and swag don't change Y extent) the Shell
  // mesh applies, so worldTopY/worldBotY are how far the shell actually reaches above/below
  // its anchor. This is what makes "top edge touches the rim" exact for tilted shells.
  const m = rotM.clone().multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
  const wbox = geo.boundingBox.clone().applyMatrix4(m);
  const radialProfile = shellRadialProfile(geo, m, wbox);
  // worldTopY/BotY → vertical reach; worldMaxZ/MinZ → radial reach (local z = the radial axis
  // the renderer places along), both AFTER the tilt, so the editor's clamps match the pixels.
  return {
    geometry: geo, shellScale: sc, bbDepth: bbSize.z, bbWidth: bbSize.x,
    /* What the Size dial may actually offer on this shell — computed HERE, where the tilted depth
       the cap measures is already in hand, rather than re-derived by whoever draws the control. */
    maxSize: maxShellSize(sc1, rbox.max.z - rbox.min.z, radius, placementConfig),
    worldTopY: wbox.max.y, worldBotY: wbox.min.y,
    worldMaxZ: wbox.max.z, worldMinZ: wbox.min.z,
    radialProfile,
  };
}

/* How tall the shell is ACROSS its radial band — PROFILE_SAMPLES heights, inner edge to outer.
 *
 * ⚠️ A RING IS A DOME, NOT A SHELF, AND TREATING IT AS ONE PUT SPRINKLES IN A CIRCLE. Anything
 * resting on a rim ring needs to know the height at ITS radius, not the ring's maximum. Measured on
 * the catalogue Rosette after its authored -85° tilt: the crest sits at 100% in the middle of the
 * band and falls to 42% at the inner edge and 33% at the outer. A single height for the whole
 * annulus therefore floats by up to 0.374 — two thirds of the shell's own height — and scattered
 * pieces only touch along one radius. Sandeep, looking at exactly that: *"why the sprinkles forming
 * a circle on the cream layer. it should be random."*
 *
 * ⚠️ MEASURED HERE, where the tilt and the scale are already resolved. `m` is the same matrix
 * worldTopY/worldMaxZ come from, so the profile cannot describe a differently-posed shell than the
 * extents beside it — which is the class of bug that produced the two wrong cuts before this one.
 *
 * MAX per slice, not mean: something resting on cream sits on the highest cream under it.
 */
const PROFILE_SAMPLES = 16;

export function shellRadialProfile(geo, m, wbox) {
  const pos = geo.attributes?.position;
  const span = wbox.max.z - wbox.min.z;
  if (!pos || !(span > 1e-9)) return null;
  const out = new Float32Array(PROFILE_SAMPLES).fill(-Infinity);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    let k = Math.floor(((v.z - wbox.min.z) / span) * PROFILE_SAMPLES);
    if (k < 0) k = 0; else if (k >= PROFILE_SAMPLES) k = PROFILE_SAMPLES - 1;
    if (v.y > out[k]) out[k] = v.y;
  }
  /* An empty slice — a shell with a gap across its depth — takes its neighbour rather than
     -Infinity, so an interpolation across it can never return a hole. */
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    if (out[k] !== -Infinity) continue;
    let a = k - 1; while (a >= 0 && out[a] === -Infinity) a--;
    let b = k + 1; while (b < PROFILE_SAMPLES && out[b] === -Infinity) b++;
    out[k] = a >= 0 ? out[a] : (b < PROFILE_SAMPLES ? out[b] : wbox.max.y);
  }
  return out;
}

/* Where a ring's shells actually sit, given the surface they anchor to.
 *
 * ⚠️ ONE DEFINITION, BECAUSE FOUR CALLERS MUST AGREE. The rim ring, the board ring and each one's
 * single-piece DRAG all compute this anchor, and #10 law 5 requires `handleAt` and `dragTo` to be
 * exact inverses — four inline subtractions is four chances for the grab point to drift off the
 * cream.
 *
 * `extractGeo` seats a shell at min Y, so an untilted one spans Y 0..h and its origin IS its base:
 * `worldBotY` is 0 and this returns the anchor untouched, which is what keeps every ring already on
 * a saved cake exactly where it is. A tilt breaks the equivalence — laid face-up with -90° about X
 * a rosette spans Y -0.45..+0.45, half of it below its own origin — and the shell sinks into the
 * lid by that much. You then see the top half of each rose, which reads as a different element
 * rather than as a seating bug. Sandeep, from the render: *"it was rendering correct element only,
 * but might be burried into cake"*.
 *
 * `DecorationShells` got this in 47723762 (`seatMinY`); the cream path did not, so the two render
 * paths disagreed about where a tilted ring sits.
 */
/* ── Where a ring's shells SIT, vertically ───────────────────────────────────────────────────────
 *
 * The shell's ORIGIN goes on the surface. `extractGeo` seats geometry at min Y, so for an upright
 * shell that is its base, which is what everyone means by "resting on the rim".
 *
 * ⚠️ IT USED TO SUBTRACT `worldBotY` — the post-tilt lowest point — AND THAT IS WHAT MADE A TILTED
 * RING FLOAT. `PipingCalibrator.jsx` seats on `anchorY + yOffset` and nothing else, so the lift was
 * a number admin could never show. Measured on Classic Shell Border: at `top_rotation [-68,_,175]`
 * the cake put the origin 0.2915 above where the calibrator put it — 20% of the tier radius. The
 * ring hung in the air, and Sandeep recalibrated the row to `[-102,_,0]` to chase it: the gap only
 * narrowed to 0.2227, because `top_y_offset` is ADDED before the lift and so can never cancel it.
 * *"classic shell is still floating."*
 *
 * ⚠️ THE TRADE IS DELIBERATE AND IT IS THE RIGHT WAY ROUND. A shell rotated past upright has
 * geometry below its own origin, and that part now dips below the rim. That is a per-element
 * matter, and `top_y_offset` fixes it — WHICH IS THE POINT: the calibrator seats the same way, so
 * what an admin dials there is what the cake does. Lifting every tilted ring by its own bounding
 * box instead was a rule nobody could see, tune, or override.
 *
 * The radial seat follows the same principle — see the note in CakeTier beside `seatHalfDepth`. */
export function ringBaseY(anchorY) {
  return anchorY;
}

// Cap the user-scaled shell scale so its rendered radial depth (bbDepthZ × scale) never exceeds
// the row's authored ceiling — `placement_config.max_depth`, defaulting to PIPING_MAX_DEPTH_FRAC —
// as a fraction of the tier radius. The max() floor keeps a little growth headroom even when the
// size-1.0 shell is already deep, so the slider is never fully dead.
//
// ⚠️ `placementConfig` IS THE POINT OF THIS FUNCTION'S FIFTH ARGUMENT. Omit it and the behaviour is
// byte-identical to before — that is deliberate, so no cake anyone has already approved moves — but
// a row that needs a deeper shell can now say so instead of being silently clipped.
export function capShellScale(sc1, sizeFactor, bbDepthZ, radius, placementConfig = null) {
  return sc1 * Math.min(sizeFactor, maxShellSize(sc1, bbDepthZ, radius, placementConfig));
}

/* The largest Size a row can actually DELIVER on this shell — the cap expressed in the dial's own
 * units, so the control can be bounded by it instead of advertising travel the renderer throws
 * away. A dial whose top two thirds do nothing is a dead control (INVARIANTS #11), and the whole
 * point of #8 is that a control means what its name says.
 *
 * ⚠️ IT IS RADIUS-INDEPENDENT, which is why one number serves every tier. `sc1` is proportional to
 * the radius and so is the depth ceiling, so the ratio cancels: max(1.15, max_depth·height /
 * (SHELL_HEIGHT_FRAC·depth)). The radius is still taken as an argument because the two terms are
 * written the way the cap computes them, and a "simplification" that drops it is how the dial and
 * the renderer would start disagreeing again.
 *
 * ⚠️ ONE FUNCTION, called by the cap itself — not a second copy of the arithmetic. That is the
 * mistake this bug is made of: the card computed the range from the row and the renderer computed
 * a different ceiling, and neither knew about the other. */
export function maxShellSize(sc1, bbDepthZ, radius, placementConfig = null) {
  const maxSc = Math.max(sc1 * 1.15, (radius * maxDepthFrac(placementConfig)) / bbDepthZ);
  return maxSc / sc1;
}

// The tier WALL perimeter a wrap band follows: a circle for round, the rounded-rect for sheet.
// `shape` is the tierShape descriptor (null → round). The band hugs this, lifted by yOffset.
export function wallPerimeter(shape, radius) {
  return shape?.kind === 'rect' ? perimeter(shape) : circlePerimeter(radius);
}

// ── Extract the single mesh from a per-style GLB ──────────────────────────────
// ⚠️ EXPORTED because the hand-piping path needs the IDENTICAL preparation, not a similar one.
// StampStroke used to do its own — merge every mesh, centre on X/Z, seat on the raw base — and the
// difference was invisible and fatal: this bakes a +90° X rotation into the geometry before any
// config value is read, so a hand-piped shell was already a quarter turn out before the calibrated
// rotation was applied to it. Three separate attempts to fix that by adjusting the ROTATION failed,
// because the rotation was never the thing that differed. One preparation, one place.
export function extractGeo(scene) {
  let mesh = null;
  scene.traverse(obj => { if (obj.isMesh && !mesh) mesh = obj; });
  if (!mesh) return null;

  /* ⚠️ A FRESH, PLAIN, DE-NORMALISED BUFFER — NEVER `geometry.clone()`. A meshopt-compressed GLB
     (`EXT_meshopt_compression`) delivers its attributes INTERLEAVED and NORMALISED, and this
     function's whole job is to write through them: a +90° turn, then a translate. `clone()` on an
     interleaved attribute shares the underlying InterleavedBuffer with the one `useGLTF` has
     cached, so those per-vertex writes scramble the geometry — and can scramble it for every other
     user of the same model at the same time.

     That is not a theory. festoon.js's `bakeStrip` says the same thing in its own comment and
     builds a plain buffer for exactly this reason; this function had not been told. Reported on the
     catalogue's Rosette: hand-piping it produced the rosette with a skirt of blades hanging off it.
     Rendered three ways side by side (dev/stamp-normal.html?compare=1) the GLB is clean, and the
     blades appear at THIS step — the ring path shows them too, since buildShellGeo calls this.

     Reading each vertex through a Vector3 de-normalises it and hands back plain floats, so how the
     GLB chose to encode itself stops leaking downstream. Only 2 of the 64 active 3D elements are
     meshopt today (Rosette, Draped Ribbon), which is why this went unseen.

     ⚠️ LOCAL SPACE, NOT WORLD — deliberately, and this is the line to re-read if a ring ever moves.
     `bakeStrip` applies `mesh.matrixWorld`; doing that here would be more correct in principle and
     would re-orient every one of the 62 elements whose rings are already calibrated against the
     local frame. For a quantized GLB the node chain carries the de-quantisation as a uniform scale
     and a translation (this file: two opposed 90° X turns that cancel, ×0.01, ×0.84, plus an
     offset), and the centring below plus the callers' height-normalisation cancel exactly that —
     so for the shape that is broken, local and world agree. A meshopt file with a NON-uniform node
     scale would still come out wrong here; none exists in the catalogue, and the honest fix for one
     would be to bake the world matrix and re-calibrate, not to guess now. */
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const geo = new THREE.BufferGeometry();
  const v = new THREE.Vector3();

  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  /* Normals come across too, de-normalised the same way. Piping renders geometry-only with the
     shared cream material, so these are the ONLY thing shading a piped shell — recomputing them
     instead would smooth away the creases that make cream read as cream. */
  const nrm = src.attributes.normal;
  if (nrm) {
    const normals = new Float32Array(nrm.count * 3);
    for (let i = 0; i < nrm.count; i++) {
      v.fromBufferAttribute(nrm, i).normalize();
      normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }
  // The cream material tiles a grain normal map, which needs a UV to sit on.
  const uv = src.attributes.uv;
  if (uv) {
    const uvs = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  // The index is a plain attribute whatever the encoding, so it travels as a clone.
  if (src.index) geo.setIndex(src.index.clone());

  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  geo.translate(-center.x, -box.min.y, -center.z);
  return { geo, sizeY: size.y };
}
