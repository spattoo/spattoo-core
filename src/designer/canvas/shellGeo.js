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
const PIPING_MAX_DEPTH_FRAC = 0.16;

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
  // worldTopY/BotY → vertical reach; worldMaxZ/MinZ → radial reach (local z = the radial axis
  // the renderer places along), both AFTER the tilt, so the editor's clamps match the pixels.
  return {
    geometry: geo, shellScale: sc, bbDepth: bbSize.z, bbWidth: bbSize.x,
    worldTopY: wbox.max.y, worldBotY: wbox.min.y,
    worldMaxZ: wbox.max.z, worldMinZ: wbox.min.z,
  };
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
  const maxSc = Math.max(sc1 * 1.15, (radius * maxDepthFrac(placementConfig)) / bbDepthZ);
  return Math.min(sc1 * sizeFactor, maxSc);
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
