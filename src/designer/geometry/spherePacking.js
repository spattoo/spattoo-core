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

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Evenly-spread unit directions on a sphere (Fibonacci lattice) — the candidate growth directions for
// a new ball off a placed one. Deterministic (no RNG), so packing is reproducible/testable.
function sphereDirs(n) {
  const dirs = [], golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;            // -1..1
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    dirs.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
  }
  return dirs;
}
const PACK_DIRS = sphereDirs(64);

// Greedy 3D pack of mixed-size balls into ONE compact clump that RESTS ON THE CAKE and may spill over
// the rim and down the side wall (Phase-B reqs #3–#6). Every ball after the seed TOUCHES >=1 placed
// ball, NONE overlap each other, and NONE penetrate the cake — so the clump reads as one group draped
// on the cake. Pure + deterministic.
//
//   count — total number of balls
//   radii — the mix of radii (world units); radii[0] is the seed (biggest first reads best)
//   cake  — round cylinder the clump rests on: { R, topY, baseY, ax, az } (anchor ax,az on the top,
//           in cake-centre coords). A flat top with no reachable rim = a large R.
//
// Returns [{ x, y, z, r }] in cake-centre WORLD coords (y = ball-centre height). The clump grows as a
// compact mound (candidates scored by distance to the centroid); the cake-clearance constraint lets
// it drape over the rim/side once it reaches the edge. Candidates per new ball: tangent to a placed
// ball along sampled sphere directions, plus tangent to three placed balls (apollo3).
export function packCluster({ count, radii, cake }) {
  const EPS = 1e-4;
  if (!count || count < 1 || !radii?.length || !cake) return [];
  const { R, topY, baseY = -Infinity, ax = 0, az = 0 } = cake;
  // Signed distance from a point to the cake's REST surface (top cap ∪ side wall ∪ rim circle):
  // >0 outside (free), ~0 resting on it, <0 inside the cake body (a ball there would be buried).
  const clearance = (c) => {
    const rho = Math.hypot(c[0], c[2]);
    if (c[1] >= topY) return rho <= R ? c[1] - topY : Math.hypot(rho - R, c[1] - topY);
    return rho - R;                                  // below the top: outside the wall (>0) or inside (<0)
  };
  const balls = [{ c: [ax, topY + radii[0], az], r: radii[0] }];   // seed resting on the top at the anchor
  const overlapsAny = (c, r) => balls.some(b => dist3(c, b.c) < b.r + r - EPS);
  const valid = (c, r) => clearance(c) >= r - EPS && c[1] - r >= baseY - EPS && !overlapsAny(c, r);

  for (let i = 1; i < count; i++) {
    const r = radii[i % radii.length];
    const n = balls.length;
    const centroid = [
      balls.reduce((a, b) => a + b.c[0], 0) / n,
      balls.reduce((a, b) => a + b.c[1], 0) / n,
      balls.reduce((a, b) => a + b.c[2], 0) / n,
    ];
    let best = null, bestScore = Infinity;
    const consider = (c) => {                        // candidates are constructed tangent to a ball → touch >=1
      if (!c || !valid(c, r)) return;
      const score = dist3(c, centroid);              // tightest to the centroid wins → compact mound
      if (score < bestScore) { bestScore = score; best = c; }
    };
    // (a) tangent to a placed ball, grown along sampled sphere directions (covers up / out / over the
    //     rim / down the side); the clearance test keeps it on the cake, not buried in it.
    for (const b of balls)
      for (const d of PACK_DIRS)
        consider([b.c[0] + d[0] * (b.r + r), b.c[1] + d[1] * (b.r + r), b.c[2] + d[2] * (b.r + r)]);
    // (b) nestled in a pocket: tangent to three placed balls (apollo3)
    for (let p = 0; p < balls.length; p++)
      for (let q = p + 1; q < balls.length; q++)
        for (let s = q + 1; s < balls.length; s++)
          consider(apollo3(balls[p].c, balls[p].r, balls[q].c, balls[q].r, balls[s].c, balls[s].r, r));

    if (!best) break;   // nowhere valid to place (degenerate inputs)
    balls.push({ c: best, r });
  }
  return balls.map(b => ({ x: b.c[0], y: b.c[1], z: b.c[2], r: b.r }));
}
