import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hitVolume } from '../placement.js';

/* ── Can you still grab the decoration once the cake is turned? ──────────────────────────────────
 *
 * The unit tests next door assert WHICH SHAPE hitVolume picks. They cannot catch the bug that
 * produced it, because the bug was never about the shape in isolation — it was about what that
 * shape does to a RAY arriving from somewhere other than straight ahead. So this raycasts.
 *
 * Reported 2026-10-10 against a strawberry and a spiral candle, both placed `stand` on a sheet
 * cake's top surface: *"when the cake is facing front - i can select. when cake is moved towards
 * side like this - it does not get selected"*. A GLB is deliberately not billboarded, so its hit
 * mesh keeps the element's own facing; as a plane it presents no area to a camera on its flank.
 *
 * Both models are built here at their REAL measured proportions (read off the GLBs in dev storage,
 * then normalised the way StickerModel normalises them — longest axis to STICKER_SIZE), so these
 * are the actual pieces that failed, not a shape invented to make the fix look good.
 */

const STICKER_SIZE = 0.28;

// strawberry.glb — 1.745 × 1.998 × 1.503. Chunky: grabbable head-on even before the fix.
const STRAWBERRY = norm(1.745, 1.998, 1.503);
// candle.glb — 0.147 × 2.000 × 0.088. A needle: 7% of its height wide, and the piece that has no
// grabbable angle at all while the target is a plane.
const CANDLE = norm(0.147, 2.000, 0.088);

function norm(x, y, z) {
  const sc = STICKER_SIZE / Math.max(x, y, z);
  return { w: x * sc, h: y * sc, d: z * sc, cy: 0, cz: 0 };
}

// Build the mesh the canvas now mounts for this model: box when it has measured depth, else plane.
function hitMesh(box) {
  const v = hitVolume({ box, width: STICKER_SIZE, height: STICKER_SIZE, centerY: 0 });
  const geo = v.kind === 'box'
    ? new THREE.BoxGeometry(v.width, v.height, v.depth)
    : new THREE.PlaneGeometry(v.width, v.height);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(...v.position);
  mesh.updateMatrixWorld(true);
  return mesh;
}

// The old behaviour, for contrast: a plane regardless of what we measured, FrontSide — because
// `side` sat on <planeGeometry>, where it is a dead prop, so the material defaulted to FrontSide.
function legacyHitPlane() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE),
    new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
  );
  mesh.position.set(0, 0, 0.001);
  mesh.updateMatrixWorld(true);
  return mesh;
}

// Fire a ray at the element's centre from `deg` around it. 0° = the cake facing front (the element's
// own +Z, where everything always worked); 90° = looking along its flank, which is the report.
function hitsFrom(mesh, deg) {
  const r = 3, a = (deg * Math.PI) / 180;
  const origin = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
  const ray = new THREE.Raycaster(origin, origin.clone().negate().normalize());
  return ray.intersectObject(mesh, false).length > 0;
}

describe('a decoration stays grabbable from every camera angle (#10 law 4)', () => {
  for (const [name, box] of [['strawberry', STRAWBERRY], ['spiral candle', CANDLE]]) {
    it(`${name}: the hit volume answers a ray from all round the cake`, () => {
      const mesh = hitMesh(box);
      for (const deg of [0, 30, 45, 60, 85, 90, 95, 120, 150, 180, 240, 270, 315]) {
        expect(hitsFrom(mesh, deg), `${name} missed at ${deg}°`).toBe(true);
      }
    });
  }

  /* ⚠️ THE REGRESSION THIS FILE EXISTS FOR. Pin the old shape's failure explicitly: a reader who
     changes hitVolume back to a plane "because it is simpler" gets told exactly what breaks. */
  it('the old flat plane goes blind side-on — which is the reported fault', () => {
    const legacy = legacyHitPlane();
    expect(hitsFrom(legacy, 0)).toBe(true);      // facing front: selects, as Sandeep saw
    expect(hitsFrom(legacy, 90)).toBe(false);    // edge-on: nothing to hit
    expect(hitsFrom(legacy, 180)).toBe(false);   // and FrontSide killed the whole back half too
  });

  it('a 2D decal keeps the plane, and the material fix makes its back face answer', () => {
    const decal = hitMesh(null);                 // nothing measured → plane
    expect(decal.geometry.type).toBe('PlaneGeometry');
    expect(hitsFrom(decal, 0)).toBe(true);
    expect(hitsFrom(decal, 180)).toBe(true);     // DoubleSide, now that `side` is on the material
  });
});
