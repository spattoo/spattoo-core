// ── Sphere packing ────────────────────────────────────────────────────────────
// Pure 3D geometry for packing balls so they touch without overlapping. Extracted from the (removed)
// faux-ball cluster code as the reusable seed for the config-driven ball-cluster feature: a packer
// places each new ball tangent to existing ones, which is the Apollonius tangency solved here.

// 3-sphere Apollonius: centre of a ball of radius rG that is tangent to spheres P1,P2,P3 (each given
// as a [x,y,z] centre + radius). Returns the topmost (max-y) solution, or null when the three centres
// are collinear / no real solution. Subtract sphere equations pairwise to get two planes, intersect
// for a line, then solve the quadratic for the point on that line lying on sphere-1.
export function apollo3(P1, rP1, P2, rP2, P3, rP3, rG) {
  const R1 = rP1 + rG, R2 = rP2 + rG, R3 = rP3 + rG;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const d12 = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]];
  const d23 = [P3[0] - P2[0], P3[1] - P2[1], P3[2] - P2[2]];
  const n = cross(d12, d23);
  const nn = dot(n, n);
  if (nn < 1e-12) return null;
  const b1 = (R1 * R1 - R2 * R2 + dot(P2, P2) - dot(P1, P1)) / 2;
  const b2 = (R2 * R2 - R3 * R3 + dot(P3, P3) - dot(P2, P2)) / 2;
  const G0 = sc(add(sc(cross(d23, n), b1), sc(cross(n, d12), b2)), 1 / nn);
  const nLen = Math.sqrt(nn);
  const nu = sc(n, 1 / nLen);
  const v = [G0[0] - P1[0], G0[1] - P1[1], G0[2] - P1[2]];
  const bq = 2 * dot(v, nu), cq = dot(v, v) - R1 * R1;
  const disc = bq * bq - 4 * cq;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const C1 = add(G0, sc(nu, (-bq + sq) / 2));
  const C2 = add(G0, sc(nu, (-bq - sq) / 2));
  return C1[1] >= C2[1] ? C1 : C2;
}
