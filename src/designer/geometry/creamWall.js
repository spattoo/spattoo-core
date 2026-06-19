import * as THREE from 'three';
import { displaceCreamWaveCylinder } from '../shared/textures/creamWaveTexture.js';

// ── Styled cream walls — geometry strategies for the frosting STYLE axis ───────
//
// `buildStyledWall(wall, radius, height)` returns a tier-body BufferGeometry for a textured cream
// finish, or `null` for 'smooth' (the caller then uses the plain cylinder + lid path, unchanged).
// Each non-smooth style is a radial DISPLACEMENT of a dense cylinder's SIDE wall (caps stay flat),
// so the texture genuinely projects and breaks the silhouette — a normal map can't. Amplitudes scale
// with `radius` so the relief stays a constant fraction of the cake across tier sizes.

const TAU = Math.PI * 2;

// Side tessellation dense enough to resolve the displacement without faceting. `heightSeg` matters
// most for WAVE's thin proud lines — too coarse and the lines break up; the wave case asks for more.
function denseCylinder(radius, height, radial = 220, heightSeg = 140) {
  return new THREE.CylinderGeometry(radius, radius, height, radial, heightSeg);
}

// Displace only side vertices (|normal.y| small) radially by fn(u,v); recompute normals so the
// shading is real. u = angle (−π..π, seamless), v = 0..1 up the wall.
function displaceSide(geo, fn) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;          // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x);
    const v = (p.y - yMin) / yH;
    const sc = (r + fn(u, v)) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// SWIRL — helical corrugation: ridges that wrap diagonally up the cake (a piped-rope swirl). `lobes`
// ridges around, `twist` turns up the height. Integer lobes keep the seam at ±π continuous. `amp` is
// a coefficient of radius (so the relief stays proportional across tiers).
function displaceSwirl(geo, radius, { amp, lobes, twist }) {
  const a = amp * radius;
  return displaceSide(geo, (u, v) => a * Math.sin(lobes * u + twist * v * TAU));
}

// Displace a dense cylinder's SIDE by sampling an image height FIELD (bilinear, wrapping both axes),
// with a rim fade so the top/bottom edges relax to the wall (no spikes) and caps stay flat. For
// photo/stamp-derived rustic finishes. `relief` is in world units; `repeatX/Y` tile the field.
export function displaceByHeightField(geo, field, { repeatX = 1, repeatY = 1, relief = 0.08, rimFade = 0.1 } = {}) {
  const { height, w, h } = field;
  const sample = (u, v) => {
    const fx = ((((u * repeatX) % 1) + 1) % 1) * w;
    const fy = ((((v * repeatY) % 1) + 1) % 1) * h;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
    const tx = fx - x0, ty = fy - y0;
    const a = height[y0 * w + x0], b = height[y0 * w + x1], c = height[y1 * w + x0], d = height[y1 * w + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;                 // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x) / TAU + 0.5;
    const v = (p.y - yMin) / yH;
    const mask = ss(0, rimFade, v) * ss(0, rimFade, 1 - v);   // relax displacement at the rims
    const sc = (r + relief * sample(u, v) * mask) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// `params` is the resolved style param set (defaults ← authored overrides) from creamStyles.js.
// `relief`/`amp` are coefficients of radius; the rest map straight onto the field/strategy.
export function buildStyledWall(wall, radius, height, params = {}) {
  if (!wall || wall === 'smooth') return null;          // smooth → caller uses the plain cylinder
  switch (wall) {
    case 'wave': {
      // The admin-approved cream-wave field; schema defaults match its approved params. `relief` is a
      // coefficient of radius (admin tuned on a radius-1 cylinder); mesh height-segs scale with bands.
      const ridges = params.ridges ?? 6;
      const heightSeg = Math.min(440, Math.max(200, ridges * 50));
      const geo = denseCylinder(radius, height, 256, heightSeg);
      return displaceCreamWaveCylinder(geo, {
        relief: (params.relief ?? 0.06) * radius,
        ridges, lobes: params.lobes ?? 2, waveAmp: params.waveAmp ?? 0.35,
        ribbonW: params.ribbonW ?? 0.05, falloff: params.falloff ?? 0.4,
      });
    }
    case 'swirl':  return displaceSwirl(denseCylinder(radius, height, 220, 160), radius,
      { amp: params.amp ?? 0.045, lobes: params.lobes ?? 9, twist: params.twist ?? 3.0 });
    default:       return denseCylinder(radius, height);
  }
}
