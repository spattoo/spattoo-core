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

// Per-ball radii for a cluster of `count`, following the size MIX: exactly ONE largest (the seed),
// then ~SECOND/THIRD/SMALL fractions of the rest so ALL FOUR sizes stay well-represented as the
// cluster grows (rather than the smallest swamping it). Returned DESCENDING so the packer places big
// balls FIRST — they take the base/surface — and the small ones last (pockets / on top). `sizes` is
// the tier list [largest, 2nd, 3rd, small] (descending); shorter lists reuse the last tier.
export const CLUSTER_SECOND_FRAC = 0.22;
export const CLUSTER_THIRD_FRAC  = 0.33;
export const CLUSTER_TOP_FRAC    = 0.18;   // fraction placed in on-top pockets (smallest, laid LAST)

// Evenly intersperse tiers of differing counts into one flat sequence (largest-remainder spread): at
// each step take the tier most "behind" its share. Deterministic, so the mix is reproducible — and
// avoids the strict big→small order that made the smallest balls pile together spatially.
function interleaveTiers(tiers) {
  const out = [], acc = tiers.map(() => 0);
  const total = tiers.reduce((s, t) => s + Math.max(0, t.count), 0);
  for (let i = 0; i < total; i++) {
    let best = -1, bestRatio = Infinity;
    tiers.forEach((t, j) => {
      if (acc[j] >= t.count) return;
      const ratio = acc[j] / t.count;
      if (ratio < bestRatio) { bestRatio = ratio; best = j; }
    });
    if (best < 0) break;
    out.push(tiers[best].size); acc[best]++;
  }
  return out;
}
export function clusterRadii(count, sizes) {
  if (!count || count < 1 || !sizes?.length) return [];
  const t = i => sizes[Math.min(i, sizes.length - 1)];
  if (count === 1) return [t(0)];
  const rest = count - 1;                               // everything after the single largest
  const n2 = Math.round(rest * CLUSTER_SECOND_FRAC);
  const n3 = Math.round(rest * CLUSTER_THIRD_FRAC);
  const nSmall = rest - n2 - n3;
  const nPocket = Math.min(Math.round(rest * CLUSTER_TOP_FRAC), Math.max(0, nSmall));   // smallest, on top, LAST
  // Seed first; the surface tiers (2nd/3rd/surface-smalls) INTERLEAVED so sizes alternate spatially;
  // then the pocket smalls last (so the packer's on-top phase gets the smallest balls).
  const surface = interleaveTiers([
    { size: t(1), count: n2 },
    { size: t(2), count: n3 },
    { size: t(3), count: nSmall - nPocket },
  ]);
  return [t(0), ...surface, ...Array(nPocket).fill(t(3))].slice(0, count);
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
  const TOP_FRAC = CLUSTER_TOP_FRAC;   // ~this fraction ride on top (pockets); must match clusterRadii's tail
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

// Two circles (centre x0,z0 r0 / x1,z1 r1) → their two intersection points, or null if they don't meet
// (too far apart, one inside the other, or concentric). Used for in-plane pocket seating.
export function circleIntersect(x0, z0, r0, x1, z1, r1) {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const mx = x0 + (a * dx) / d, mz = z0 + (a * dz) / d;
  const ox = -(dz / d) * h, oz = (dx / d) * h;
  return { x1: mx + ox, z1: mz + oz, x2: mx - ox, z2: mz - oz };
}

// In-plane (x/z) POCKET seat for a ball of radius r dropped near others, all resting on the same flat
// surface (each centre at surfaceY + its own radius). Two such balls of radii a,b touch when their
// in-plane distance = 2·√(a·b) (3D tangency at differing heights). Returns {x,z} nestled tangent to the
// 1–2 nearest neighbours toward the drop point (px,pz), or null when none is near enough to snap (so
// the caller keeps free placement). `neighbors` = [{x,z,r}]. `band` = how close (× r) counts as "near".
export function pocketSeat2D(px, pz, r, neighbors, band = 0.6) {
  const ns = neighbors ?? [];
  const touch = nr => 2 * Math.sqrt(r * nr);                       // in-plane tangency distance
  const maxJump = 2 * r;                                           // a snap must stay NEAR the cursor —
  //                                                                 never teleport to the far tangency point.
  const drop = (x, z) => Math.hypot(x - px, z - pz);
  // A seat is valid only if it stays by the cursor AND penetrates nothing (dist ≥ tangency for all).
  const ok = (x, z) => drop(x, z) <= maxJump && ns.every(n => Math.hypot(x - n.x, z - n.z) >= touch(n.r) - 1e-3);
  const near = ns
    .map(n => ({ n, t: touch(n.r), d: Math.hypot(px - n.x, pz - n.z) }))
    .filter(o => o.d < o.t + band * r)                             // within a snap band of contact
    .sort((a, b) => Math.abs(a.d - a.t) - Math.abs(b.d - b.t));    // closest to its tangency ring first
  if (!near.length) return null;
  // Pocket: tangent to a close PAIR (nearest pairs first); take ONLY the solution nearest the cursor that
  // also clears the maxJump + no-penetration test — so we nestle on the side the user is dragging from.
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const sol = circleIntersect(near[i].n.x, near[i].n.z, near[i].t, near[j].n.x, near[j].n.z, near[j].t);
      if (!sol) continue;
      const c = drop(sol.x1, sol.z1) <= drop(sol.x2, sol.z2) ? { x: sol.x1, z: sol.z1 } : { x: sol.x2, z: sol.z2 };
      if (ok(c.x, c.z)) return c;
    }
  }
  // No clear pocket: rest tangent to the single nearest, toward the drop — only if near + non-penetrating.
  const { n, t } = near[0];
  const ux = px - n.x, uz = pz - n.z, m = Math.hypot(ux, uz) || 1;
  const one = { x: n.x + (ux / m) * t, z: n.z + (uz / m) * t };
  return ok(one.x, one.z) ? one : null;                            // else null → caller keeps free/de-overlap
}
