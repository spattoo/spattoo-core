import * as THREE from 'three';

// ── Extruded footprints — the body geometry every NON-ROUND tier is built from ─
//
// A rounded rectangle (the sheet cake), a glyph (number/letter, holes and all), and any authored
// outline (heart, butterfly, polygon, oval), plus the polygon inset those share.
//
// ⚠️ PURE GEOMETRY, and it lives here rather than in CakeTier.jsx — where it grew — because a
// geometry builder that can only be reached through a React component cannot be reached by another
// geometry builder. The modelled cream wall needs exactly these to cut its own lid to a heart's
// shape, and `creamWall.js` importing `CakeTier.jsx` would be a cycle (CakeTier imports creamWall).
// Nothing here touches React, THREE's renderer or any component state; it never did.

export function buildRoundedPrism(halfW, halfD, height, r) {
  const cr = Math.max(0, Math.min(r, halfW, halfD));
  const s = new THREE.Shape();
  s.moveTo(-halfW + cr, -halfD);
  s.lineTo(halfW - cr, -halfD);
  s.quadraticCurveTo(halfW, -halfD, halfW, -halfD + cr);
  s.lineTo(halfW, halfD - cr);
  s.quadraticCurveTo(halfW, halfD, halfW - cr, halfD);
  s.lineTo(-halfW + cr, halfD);
  s.quadraticCurveTo(-halfW, halfD, -halfW, halfD - cr);
  s.lineTo(-halfW, -halfD + cr);
  s.quadraticCurveTo(-halfW, -halfD, -halfW + cr, -halfD);
  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);   // extrusion axis (Z) → world Y (up)
  return geo;
}

// Cake body for a GLYPH cake (number OR letter): the glyph(s) — THREE.Shape[] with their counters
// attached — extruded straight up, exactly like the sheet's rounded rect. ExtrudeGeometry honours each
// shape's `.holes`, so the counter in 0/4/6/8/9 and A/B/D/O/P/Q/R comes through, and it merges a
// multi-glyph array ("21", "MOM") into one body. Charset-agnostic — one builder for both families.
export function buildGlyphPrism(shapes, height) {
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);   // extrusion axis (Z) → world Y (up)
  return geo;
}

// Cake body for ANY authored footprint (heart, butterfly, hexagon…): the shape's own outline swept up,
// with the top edge rolled over by `fillet` — the same rounded rim the round path gets from the
// frosting's `edge: {kind:'round'}` (that is where the fillet comes from; it is not a per-shape knob).
//
// Built by hand rather than with THREE.ExtrudeGeometry, for two reasons that both showed up on a cake:
//   • UVs. ExtrudeGeometry derives side-wall UVs from WORLD coordinates, not an unwrap, so the
//     buttercream grain landed in overlapping patches — one of which read as a shiny rectangular strip
//     down the wall. Here `u` is ARC LENGTH around the outline and `v` is height: the honest unwrap, and
//     the same coordinate side-decor placement uses.
//   • Normals. Each wall segment is its own quad with its own outward normal, so a hexagon keeps crisp
//     corners while a 160-segment heart still reads smooth. Averaging normals around the ring (what
//     computeVertexNormals would do) would round a hexagon's corners off.
export function buildOutlinePrism(outline, height, fillet = 0) {
  const n = outline.length;
  const f = Math.max(0, Math.min(fillet, height * 0.45));
  const STEPS = f > 1e-4 ? 6 : 0;               // quarter-arc segments in the rolled rim

  // Each ring is the outline inset by `inset`, sitting at `y`, with its wall normal tilted by `slope`
  // (0 = vertical wall, π/2 = facing straight up at the top of the roll).
  const rings = [{ inset: 0, y: 0, slope: 0 }, { inset: 0, y: height - f, slope: 0 }];
  for (let i = 1; i <= STEPS; i++) {
    const a = (i / STEPS) * (Math.PI / 2);
    rings.push({ inset: f * (1 - Math.cos(a)), y: height - f + f * Math.sin(a), slope: a });
  }
  const ringPts = rings.map(r => (r.inset > 1e-6 ? insetPolygon(outline, r.inset) : outline));

  // Arc length around the base outline → the wall's u.
  const uAt = [0];
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    uAt.push(uAt[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perim = uAt[n] || 1;

  const pos = [], nor = [], uv = [];
  const push = (p, y, nx, ny, nz, u, v) => {
    pos.push(p.x, y, p.z); nor.push(nx, ny, nz); uv.push(u, v);
  };

  // ── Wall + rolled rim: one quad per (segment × ring gap) ─────────────────────
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = outline[i], b = outline[j];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;                 // outward normal of THIS segment (CCW winding)
    const u0 = uAt[i] / perim, u1 = uAt[i + 1] / perim;

    for (let r = 0; r < rings.length - 1; r++) {
      const lo = rings[r], hi = rings[r + 1];
      const lp = ringPts[r], hp = ringPts[r + 1];
      const cl = Math.cos(lo.slope), sl = Math.sin(lo.slope);
      const ch = Math.cos(hi.slope), sh = Math.sin(hi.slope);
      const vl = lo.y / height, vh = hi.y / height;

      // Two triangles: (lo_i, hi_j, lo_j) and (lo_i, hi_i, hi_j).
      //
      // The vertex ORDER is what the GPU culls on — the `normal` attribute above only lights the face,
      // it cannot make a back-facing triangle visible. The outline is wound CCW in the (x, z) plane, and
      // sweeping that order upward produces triangles whose winding normal points INWARD: the body was
      // built inside-out, so FrontSide culling removed every near face and you saw through the cake to
      // the inner surface of the far wall. Walking the quad the other way round puts the winding where
      // the normals always claimed it was.
      push(lp[i], lo.y, nx * cl, sl, nz * cl, u0, vl);
      push(hp[j], hi.y, nx * ch, sh, nz * ch, u1, vh);
      push(lp[j], lo.y, nx * cl, sl, nz * cl, u1, vl);

      push(lp[i], lo.y, nx * cl, sl, nz * cl, u0, vl);
      push(hp[i], hi.y, nx * ch, sh, nz * ch, u0, vh);
      push(hp[j], hi.y, nx * ch, sh, nz * ch, u1, vh);
    }
  }

  // ── Caps ─────────────────────────────────────────────────────────────────────
  // Own vertices, own flat normals — sharing them with the wall would average the two and bevel the
  // silhouette. The top cap is the innermost ring (the rim has already rolled inward by `f`).
  const cap = (pts, y, up) => {
    const contour = pts.map(p => new THREE.Vector2(p.x, p.z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const ny = up ? 1 : -1;
    for (const t of faces) {
      // triangulateShape winds CCW in the flat (x, z) contour it was handed; laid back into a y-up world
      // that faces DOWN, so it is the TOP cap that needs reversing and the base that takes it as-is. The
      // reverse of this was the same inside-out error the wall had: the lid faced into the cake.
      const tri = up ? [t[0], t[2], t[1]] : t;
      for (const k of tri) {
        const p = pts[k];
        push(p, y, 0, ny, 0, 0.5 + p.x * 0.5, 0.5 + p.z * 0.5);
      }
    }
  };
  cap(ringPts[ringPts.length - 1], height, true);
  cap(outline, 0, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// The outline pulled INWARD by `d`, each vertex moving along the bisector of its two edge normals. Used
// for the rolled rim. A true polygon offset would also dissolve edges that collapse — but `d` here is a
// rim fillet (a few percent of the cake), so a bisector step is exact enough and cannot self-intersect
// at that scale.
export function insetPolygon(pts, d) {
  const n = pts.length;
  const seg = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    seg.push({ nx: dz / len, nz: -dx / len });           // outward
  }
  return pts.map((p, i) => {
    const prev = seg[(i - 1 + n) % n], next = seg[i];
    const sx = prev.nx + next.nx, sz = prev.nz + next.nz;
    const len = Math.hypot(sx, sz);
    // A near-cusp: the two edge normals oppose, so there IS no inward direction. Leave the vertex where
    // it is rather than sending it somewhere arbitrary — an arbitrary answer is what crossed the rim
    // over itself and left an X on the cake. (Outlines round their own cusps; this is the backstop.)
    if (len < 0.2) return { ...p };
    const nx = sx / len, nz = sz / len;
    // Step along the bisector far enough that both EDGES move in by d (1/cos of the half-angle), capped
    // so a sharp corner can't shoot the vertex across the shape.
    const cos = Math.max(0.5, nx * next.nx + nz * next.nz);
    return { x: p.x - nx * (d / cos), z: p.z - nz * (d / cos) };
  });
}

// Fondant-draped ROUND tier: a solid of revolution whose top edge is a rounded fillet (the fondant
// sheet folds over the rim instead of a sharp 90° tin edge). Profile is revolved around Y, spanning
// y ∈ [0, height]: flat bottom disk → straight wall → quarter-arc top edge → flat top disk. `fillet`
// is the edge radius in world units. Replaces the cylinder+lid for round fondant tiers; the single
// mesh means the vertical gradient and grain flow over the rounded edge with no separate cap.
