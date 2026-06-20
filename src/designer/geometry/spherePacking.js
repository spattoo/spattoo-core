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

// Per-ball radii for a cluster of `count`, following the size MIX (rough product rule): exactly ONE
// largest (the seed), ~11% second-largest, ~35% third, the rest smallest. Returned DESCENDING so the
// packer places big balls FIRST — they take the base/surface — and the small ones last (pockets / on
// top). `sizes` is the tier list [largest, 2nd, 3rd, small] (descending); shorter lists reuse the last.
export const CLUSTER_SECOND_FRAC = 0.11;
export const CLUSTER_THIRD_FRAC  = 0.35;
export function clusterRadii(count, sizes) {
  if (!count || count < 1 || !sizes?.length) return [];
  const t = i => sizes[Math.min(i, sizes.length - 1)];
  const seq = [t(0)];                                   // exactly one largest (seed)
  const n2 = Math.round(count * CLUSTER_SECOND_FRAC);
  const n3 = Math.round(count * CLUSTER_THIRD_FRAC);
  for (let i = 0; i < n2 && seq.length < count; i++) seq.push(t(1));
  for (let i = 0; i < n3 && seq.length < count; i++) seq.push(t(2));
  while (seq.length < count) seq.push(t(3));            // the rest: smallest
  return seq.slice(0, count);
}

// Greedy 3D pack of mixed-size balls into ONE clump that CLINGS TO THE CAKE — most balls rest on the
// cake surface (top / rim / side wall), a few nestle in pockets ON TOP of supporting balls — matching
// real gold-ball clusters (Phase-B reqs #3–#6). The two physical rules:
//   • SUPPORT (no floating): every ball must rest on the cake surface OR be CRADLED on >=2 balls that
//     sit below it on opposing sides. A ball merely tangent to one neighbour in mid-air is rejected.
//   • SURFACE-FIRST: a surface rest always beats an on-top pocket, so the clump hugs the cake and only
//     piles up where the surface around it is full (the ~15–20% that ride on top).
// Every non-seed ball also touches >=1 placed ball and none overlap. Pure + deterministic.
//
//   count — total number of balls
//   radii — the mix of radii (world units); radii[0] is the seed (biggest first reads best)
//   cake  — round cylinder: { R, topY, baseY, ax, az, seed }. The seed (big ball) centre is `seed`
//           [x,y,z] if given (anywhere on the cake — top OR side wall), else [ax, topY+r0, az] on the
//           top. A flat top with no reachable rim = a large R.
//
// Returns [{ x, y, z, r }] in cake-centre WORLD coords (y = ball-centre height).
export function packCluster({ count, radii, cake }) {
  const EPS = 1e-4;
  const REST = 1e-2;          // clearance below this ⇒ the ball is resting on the cake surface
  const TOUCH = 1e-2;         // |gap| below this ⇒ two balls touch
  const TOP_FRAC = 0.18;      // ~this fraction of balls ride on top (in pockets); the rest cling to cake
  const PHASE = 1000;         // strong preference for the ball's phase (surface vs pocket); a fallback,
                              // not a hard rule — a top ball with no pocket still takes a surface spot
  const TOP_ANGLES = 28, SIDE_ANGLES = 28;
  if (!count || count < 1 || !radii?.length || !cake) return [];
  const { R, topY, baseY = -Infinity, ax = 0, az = 0, seed } = cake;
  // Signed distance to the cake's rest surface (top cap ∪ side wall ∪ rim circle): >0 outside,
  // ~0 resting on it, <0 buried inside the body.
  const clearance = (c) => {
    const rho = Math.hypot(c[0], c[2]);
    if (c[1] >= topY) return rho <= R ? c[1] - topY : Math.hypot(rho - R, c[1] - topY);
    return rho - R;
  };
  const balls = [{ c: seed ?? [ax, topY + radii[0], az], r: radii[0] }];   // seed resting on the cake (top, or side wall)
  const overlapsAny = (c, r) => balls.some(b => dist3(c, b.c) < b.r + r - EPS);
  const onCake  = (c, r) => clearance(c) <= r + REST;
  const valid   = (c, r) => clearance(c) >= r - REST && c[1] - r >= baseY - EPS && !overlapsAny(c, r);
  // Stable = resting on the cake, OR cradled: >=2 balls below it (centres lower) on opposing horizontal
  // sides, so gravity can't roll it off. (A single side-contact in mid-air is NOT stable.)
  const stable = (c, r) => {
    if (onCake(c, r)) return true;
    const below = balls.filter(b => Math.abs(dist3(c, b.c) - (b.r + r)) < TOUCH && b.c[1] < c[1] - 0.15 * r);
    for (let i = 0; i < below.length; i++)
      for (let j = i + 1; j < below.length; j++) {
        const ax2 = below[i].c[0] - c[0], az2 = below[i].c[2] - c[2];
        const bx2 = below[j].c[0] - c[0], bz2 = below[j].c[2] - c[2];
        if (ax2 * bx2 + az2 * bz2 < 0) return true;   // supports on opposing sides ⇒ cradled
      }
    return false;
  };

  const seedPt = balls[0].c;                         // grow AROUND the big ball (fixed), not a drifting
                                                     // centroid — keeps the clump radially balanced
  const nTop = Math.round((count - 1) * TOP_FRAC);   // last nTop balls (the smallest) ride on top
  for (let i = 1; i < count; i++) {
    const r = radii[i % radii.length];
    const wantsTop = i >= count - nTop;              // surface phase first, then the on-top pocket phase
    let best = null, bestScore = Infinity;
    const consider = (c) => {
      if (!c || !valid(c, r) || !stable(c, r)) return;
      // Surface balls strongly prefer resting on the cake (base); the last ~TOP_FRAC prefer pockets
      // (on top). PHASE is a soft fallback: if a top ball finds no pocket it still takes a surface
      // spot. Distance-to-SEED breaks ties so the clump packs tightly around the big ball, evenly.
      const oc = onCake(c, r);
      const phasePenalty = wantsTop ? (oc ? PHASE : 0) : (oc ? 0 : PHASE);
      const score = phasePenalty + dist3(c, seedPt);
      if (score < bestScore) { bestScore = score; best = c; }
    };
    for (const b of balls) {
      // (a) resting on the TOP cap (centre at y=topY+r), tangent to b
      const dh2 = (b.r + r) ** 2 - (topY + r - b.c[1]) ** 2;
      if (dh2 > 0) {
        const dh = Math.sqrt(dh2);
        for (let a = 0; a < TOP_ANGLES; a++) {
          const th = (a / TOP_ANGLES) * 2 * Math.PI;
          consider([b.c[0] + dh * Math.cos(th), topY + r, b.c[2] + dh * Math.sin(th)]);
        }
      }
      // (b) resting against the SIDE wall (centre at radial R+r), tangent to b — drapes down the side
      const Rr = R + r, basePhi = Math.atan2(b.c[0], b.c[2]);
      for (let a = 0; a < SIDE_ANGLES; a++) {
        const phi = basePhi + (a / SIDE_ANGLES - 0.5) * Math.PI;   // ±90° around b
        const cx = Rr * Math.sin(phi), cz = Rr * Math.cos(phi);
        const yy2 = (b.r + r) ** 2 - (cx - b.c[0]) ** 2 - (cz - b.c[2]) ** 2;
        if (yy2 <= 0) continue;
        const root = Math.sqrt(yy2);
        consider([cx, b.c[1] - root, cz]);            // below b (drape downward)
        consider([cx, b.c[1] + root, cz]);
      }
    }
    // (c) nestled in a pocket: tangent to three placed balls (apollo3) — the on-top minority
    for (let p = 0; p < balls.length; p++)
      for (let q = p + 1; q < balls.length; q++)
        for (let s = q + 1; s < balls.length; s++)
          consider(apollo3(balls[p].c, balls[p].r, balls[q].c, balls[q].r, balls[s].c, balls[s].r, r));

    if (!best) break;   // nowhere valid+stable to place
    balls.push({ c: best, r });
  }
  return balls.map(b => ({ x: b.c[0], y: b.c[1], z: b.c[2], r: b.r }));
}
