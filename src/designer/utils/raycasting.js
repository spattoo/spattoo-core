import * as THREE from 'three';

/**
 * Build a THREE.Ray from a pointer event and a WebGL renderer's DOM element + camera.
 *
 * @param {PointerEvent|MouseEvent} e   - The DOM pointer / mouse event.
 * @param {HTMLElement}             dom - gl.domElement from useThree().
 * @param {THREE.Camera}            camera - The Three.js camera.
 * @returns {THREE.Ray}
 */
export function buildRay(clientX, clientY, domElement, camera) {
  const rect = domElement.getBoundingClientRect();
  const ndx  = ((clientX - rect.left) / rect.width)  * 2 - 1;
  const ndy  = -((clientY - rect.top)  / rect.height) * 2 + 1;
  const rc   = new THREE.Raycaster();
  rc.setFromCamera({ x: ndx, y: ndy }, camera);
  return rc.ray;
}

export function pointerRay(e, dom, camera) {
  return buildRay(e.clientX, e.clientY, dom, camera);
}

/**
 * Intersect a ray against the front face of a vertical cylinder of the given
 * radius (Y-axis aligned, infinite height).
 *
 * @param {THREE.Ray} ray
 * @param {number}    radius
 * @returns {{ theta: number, y: number } | null}
 *   theta = Math.atan2(x, z) at the hit point, y = world-space Y at hit.
 *   Returns null when the ray misses the cylinder.
 */
export function cylinderHitPoint(ray, radius) {
  const { origin: o, direction: d } = ray;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (o.x * d.x + o.z * d.z);
  const c = o.x * o.x + o.z * o.z - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  return ray.at(t, new THREE.Vector3());
}

export function cylinderHit(ray, radius) {
  const p = cylinderHitPoint(ray, radius);
  return p ? { theta: Math.atan2(p.x, p.z), y: p.y } : null;
}

/**
 * Intersect a ray against a horizontal plane defined by a THREE.Plane.
 * Returns the {x, z} world-space coordinates of the intersection, or null.
 *
 * @param {THREE.Ray}   ray
 * @param {THREE.Plane} plane
 * @returns {{ x: number, z: number } | null}
 */
export function planeHit(ray, plane) {
  const target = new THREE.Vector3();
  return ray.intersectPlane(plane, target) ? { x: target.x, z: target.z } : null;
}

/**
 * The same intersection, keeping Y. `planeHit` drops it because every caller before this one
 * solved against a HORIZONTAL plane, where y is a constant the caller already knows. A free-hand
 * drag solves against a plane facing the CAMERA, so all three coordinates are answers.
 *
 * @param {THREE.Ray}   ray
 * @param {THREE.Plane} plane
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function planePoint(ray, plane) {
  const target = new THREE.Vector3();
  return ray.intersectPlane(plane, target) ? { x: target.x, y: target.y, z: target.z } : null;
}

/* ── The same question, on a cake that is not round ──────────────────────────────────────
 *
 * ⚠️ `cylinderHitPoint` IS THE ONLY ANSWER THIS FILE HAD, and a cylinder is not a heart. Every
 * pointer gesture that lands on a wall — drawing a cream stroke, scraping the icing, and the hand
 * sprinkles being built on top of this — was solved against a circle of the tier's radius, so on a
 * sheet the hand drew where the pointer was not.
 *
 * The wall is sampled into a ring of points (geometry/surface.js `wallSamples`), each carrying its
 * arc length, and the ray is tested against the vertical quad standing on each segment. The nearest
 * hit in front of the camera wins — which is also what makes the BACK of the cake unclickable,
 * exactly as the cylinder's near-root did.
 *
 * It returns `s` as well as the point, so the caller never has to invert the mapping afterwards.
 */
export function wallHitPoint(ray, samples, { baseY = 0, wallH = 1, inflate = 0 } = {}) {
  if (!samples?.pts?.length) return null;
  const { origin: o, direction: d } = ray;
  const pts = samples.pts, n = pts.length;
  let bestT = Infinity, best = null;

  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ax = a.x + a.nx * inflate, az = a.z + a.nz * inflate;
    const bx = b.x + b.nx * inflate, bz = b.z + b.nz * inflate;
    const ex = bx - ax, ez = bz - az;
    // Ray vs the vertical plane through this edge, in plan view: solve for where the ray's
    // horizontal track crosses the segment.
    const den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-12) continue;                       // parallel in plan
    const t = ((ax - o.x) * ez - (az - o.z) * ex) / den;       // along the ray
    if (t <= 0 || t >= bestT) continue;
    const u = Math.abs(ex) > Math.abs(ez)
      ? (o.x + d.x * t - ax) / ex
      : (o.z + d.z * t - az) / ez;                             // along the segment
    if (u < 0 || u > 1) continue;
    const y = o.y + d.y * t;
    if (y < baseY || y > baseY + wallH) continue;              // above the rim or below the board
    bestT = t;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    best = {
      x: o.x + d.x * t, y, z: o.z + d.z * t,
      // Arc length of the hit: the segment's own start plus how far along it we landed. `b.s` wraps
      // to 0 on the last segment, so the length is measured rather than subtracted.
      s: a.s + segLen * u,
    };
  }
  return best;
}
