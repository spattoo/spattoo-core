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
export function cylinderHit(ray, radius) {
  const { origin: o, direction: d } = ray;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (o.x * d.x + o.z * d.z);
  const c = o.x * o.x + o.z * o.z - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const p = ray.at(t, new THREE.Vector3());
  return { theta: Math.atan2(p.x, p.z), y: p.y };
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
