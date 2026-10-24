import { describe, it, expect } from 'vitest';
import { buildSandGrain, buildSandMound, sandSpan, thinOutward, varyGrainSize, sandTriangleCount,
        sandHeightAt, sandMoundOpts, SAND_MOUND_SEED,
         ZONES_TOP, ZONES_BOARD, SAND_DEFAULTS } from './sand.js';

// A seat ring at a given radius, as grassSeats would hand one over.
const ringAt = (r, n = 400) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: 0, scale: 1 };
});

describe('buildSandGrain — twenty facets, each catching the light differently', () => {
  it('is a twenty-triangle grain whatever the seed', () => {
    for (const seed of [1, 7, 42]) {
      expect(buildSandGrain({ seed }).attributes.position.count / 3).toBe(20);
    }
  });

  // Flat shading is the whole look: a smoothed grain is a pebble, and a drift of pebbles is gravel.
  it('gives every facet its own normal rather than smoothing them together', () => {
    const n = buildSandGrain({ seed: 3 }).attributes.normal;
    const first = [n.getX(0), n.getY(0), n.getZ(0)];
    const second = [n.getX(3), n.getY(3), n.getZ(3)];
    expect(first).not.toEqual(second);
  });

  // toNonIndexed repeats a shared corner once per face; jittering those copies apart would open
  // the grain into loose triangles.
  it('keeps the grain closed — a shared corner moves as one', () => {
    const geo = buildSandGrain({ seed: 5, rough: 0.9 });
    const p = geo.attributes.position;
    const seen = new Map();
    let splits = 0;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)).toFixed(5);
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.sign(v) * Math.abs(v)).join();
      if (seen.has(key) && seen.get(key) !== r) splits++;
      seen.set(key, r);
    }
    expect(splits).toBe(0);
  });

  it('is deterministic, so a drift does not reshuffle between renders', () => {
    const a = buildSandGrain({ seed: 4 }).attributes.position.array;
    const b = buildSandGrain({ seed: 4 }).attributes.position.array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('thinOutward — a drift, not a carpet', () => {
  const opts = { inner: 1, outer: 1.34, falloff: 0.55, seed: 5 };

  it('keeps the bank solid at the wall and lets it peter out at the lip', () => {
    const atWall = thinOutward(ringAt(1.0), opts).length / 400;
    const atLip  = thinOutward(ringAt(1.33), opts).length / 400;
    expect(atWall).toBeGreaterThan(0.95);
    expect(atLip).toBeLessThan(0.7);
    expect(atLip).toBeGreaterThan(0.2);     // stray crumbs, not a hard boundary — that is the look
  });

  it('thins monotonically outward', () => {
    const kept = [1.0, 1.1, 1.2, 1.3].map(r => thinOutward(ringAt(r, 800), opts).length);
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeLessThanOrEqual(kept[i - 1]);
  });

  it('falloff 0 is an even carpet, and leaves the seats untouched', () => {
    const seats = ringAt(1.2);
    expect(thinOutward(seats, { ...opts, falloff: 0 })).toBe(seats);
  });

  it('is deterministic for a seed', () => {
    expect(thinOutward(ringAt(1.2), opts).length).toBe(thinOutward(ringAt(1.2), opts).length);
  });
});

describe('varyGrainSize — sand is not graded', () => {
  const sizes = (v) => varyGrainSize(Array.from({ length: 3000 }, () => ({ scale: 1 })), { sizeVary: v, seed: 9 })
    .map(s => s.scale).sort((a, b) => a - b);

  it('spreads grains over several times their own size', () => {
    const s = sizes(SAND_DEFAULTS.sizeVary);
    expect(s.at(-1) / s[0]).toBeGreaterThan(3);
  });

  // Skewed small: most grains near the bottom of the range, a few crumbs near the top. An even
  // spread reads as gravel, every piece the same order of size.
  it('puts most grains below the midpoint of its range', () => {
    const s = sizes(SAND_DEFAULTS.sizeVary);
    const mid = (s[0] + s.at(-1)) / 2;
    expect(s.filter(v => v < mid).length / s.length).toBeGreaterThan(0.6);
  });

  it('multiplies the seatrather than replacing it, so existing variety survives', () => {
    const seats = [{ scale: 2 }, { scale: 0.5 }];
    const out = varyGrainSize(seats, { sizeVary: 0.5, seed: 1 });
    expect(out[0].scale / 2).toBeCloseTo(out[0].scale / seats[0].scale, 10);
    expect(out.every((s, i) => s.scale !== seats[i].scale)).toBe(true);
  });

  it('sizeVary 0 leaves the seats exactly alone', () => {
    const seats = ringAt(1.1);
    expect(varyGrainSize(seats, { sizeVary: 0 })).toBe(seats);
  });
});

describe('sandTriangleCount', () => {
  it('counts twenty a grain — one draw call however many there are', () => {
    expect(sandTriangleCount(2500)).toBe(50000);
  });
});

// ── The bank ────────────────────────────────────────────────────────────────────────────────────
// Grains alone read as small stones, and no density fixes it: a real grain on a 15cm cake is
// sub-millimetre, so making them individually illegible needs ~65,000 of them. Sand near a cake is
// a continuous mass that only breaks into pieces at its edge — so the mass is a surface.
describe('buildSandMound — the mass, not the crumbs', () => {
  const round = { kind: 'round', radius: 1.2 };
  const ys = g => Array.from(g.attributes.position.array).filter((_, i) => i % 3 === 1);
  const radii = g => {
    const p = g.attributes.position, out = [];
    for (let i = 0; i < p.count; i++) out.push(Math.hypot(p.getX(i), p.getZ(i)));
    return out;
  };

  it('is banked at the wall and runs out to nothing at the lip', () => {
    const g = buildSandMound(round, { seed: 17 });
    const p = g.attributes.position;
    let atWall = 0, atLip = 0;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r < 1.25) atWall = Math.max(atWall, p.getY(i));
      if (r > 1.55) atLip = Math.max(atLip, p.getY(i));
    }
    expect(atWall).toBeGreaterThan(atLip);
    expect(atLip).toBeLessThan(0.02);
  });

  it('never dips below the board', () => {
    expect(ys(buildSandMound(round)).reduce((a, b) => Math.min(a, b), Infinity)).toBeGreaterThanOrEqual(0);
  });

  // A bank that ends on a perfect ring reads as a printed band however good its surface is — the
  // eye finds the arc instantly.
  it('does not end on a circle', () => {
    const r = radii(buildSandMound(round, { edgeBreak: 0.55 })).filter(v => v > 1.28);
    const lo = r.reduce((a, b) => Math.min(a, b), Infinity), hi = r.reduce((a, b) => Math.max(a, b), 0);
    expect(hi - lo).toBeGreaterThan(0.15);
  });

  /* ⚠️ MEASURED PER ANGULAR SECTOR, because a plain radius filter catches several RINGS at once and
     reports the bank's width as if it were edge wander. The question is where the drift ENDS at a
     given bearing, so take the furthest vertex in each sector and compare those. */
  const outerBySector = (g, sectors = 48) => {
    const p = g.attributes.position, max = new Array(sectors).fill(0);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const k = Math.floor(((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * sectors) % sectors;
      max[k] = Math.max(max[k], Math.hypot(x, z));
    }
    return max;
  };

  it('…unless asked to, so the control is real', () => {
    const flat = outerBySector(buildSandMound(round, { edgeBreak: 0 }));
    const wavy = outerBySector(buildSandMound(round, { edgeBreak: 0.55 }));
    const spread = a => Math.max(...a) - Math.min(...a);
    expect(spread(flat)).toBeLessThan(0.02);        // a circle, to within the in-plane wobble
    expect(spread(wavy)).toBeGreaterThan(spread(flat) * 5);
  });

  /* ⚠️ THE SPECKLE IS ADJACENT FACETS DIFFERING. At low frequency every neighbour shares a normal
     and the bank shades as one smooth surface — which is exactly what the first version did, and
     it read as a beige ring. This asserts the thing that was missing, not merely that noise exists. */
  /* ⚠️ THE TWO MESHES ARE DIFFERENCED VERTEX FOR VERTEX, which is the only way to hold the bank's
     own slope still. Two earlier probes failed by measuring the slope instead of the grain: raw
     neighbouring vertices sit on different RINGS, and a "narrow" annulus 0.05 wide still spans four
     of them, so both readings came out identical to three decimal places with the grain turned off.
     Same seed and same ring/segment grid means vertex i corresponds in both, so the difference in Y
     IS the grain's contribution and nothing else. */
  const grainDelta = (amount) => {
    const a = buildSandMound(round, { moundGrain: amount, seed: 17 }).attributes.position;
    const b = buildSandMound(round, { moundGrain: 0, seed: 17 }).attributes.position;
    const d = [];
    for (let i = 0; i < a.count; i++) d.push(a.getY(i) - b.getY(i));
    return d;
  };

  const corr = (d) => {
    const mean = d.reduce((a, v) => a + v, 0) / d.length;
    let cov = 0, varr = 0;
    for (let i = 1; i < d.length; i++) cov += (d[i] - mean) * (d[i - 1] - mean);
    for (const v of d) varr += (v - mean) ** 2;
    return Math.abs(cov / varr);
  };
  const deltaOf = (a, b) => {
    const A = buildSandMound(round, { ...a, seed: 17 }).attributes.position;
    const B = buildSandMound(round, { ...b, seed: 17 }).attributes.position;
    const d = [];
    for (let i = 0; i < A.count; i++) d.push(A.getY(i) - B.getY(i));
    return d;
  };

  /* ⚠️ COMPARED AGAINST THE SWELL, NOT AGAINST A CHOSEN NUMBER. The grain has to be high-frequency
     or flat shading gives every facet the same normal — the beige ring this replaced. A bare
     threshold on the correlation is a number picked to pass, and the first one (0.4) had to be
     argued with the moment the profile changed. `moundNoise` is the deliberately SLOW swell in the
     same mesh, so it is the honest control: whatever the absolute figures, the grain must be far
     less correlated between neighbours than the swell is. */
  it('displaces the surface at FACET scale — unlike the swell, which is slow by design', () => {
    const grain = deltaOf({ moundGrain: 0.85, moundNoise: 0 }, { moundGrain: 0, moundNoise: 0 });
    const swell = deltaOf({ moundGrain: 0, moundNoise: 0.55 }, { moundGrain: 0, moundNoise: 0 });
    expect(Math.max(...grain) - Math.min(...grain)).toBeGreaterThan(0.004);
    expect(corr(grain)).toBeLessThan(corr(swell) * 0.6);
  });

  it('flattens out when the grain is taken off', () => {
    expect(Math.max(...deltaOf({ moundGrain: 0 }, { moundGrain: 0 }).map(Math.abs))).toBe(0);
  });

  it('follows a shape that is not round, via shapeReach', () => {
    const sheet = { kind: 'rect', halfW: 1.35, halfD: 0.95, cornerR: 0.18 };
    const r = radii(buildSandMound(sheet));
    expect(Math.max(...r)).toBeGreaterThan(1.5);     // reaches past the long side
    expect(Math.min(...r)).toBeLessThan(1.1);        // and hugs the short one
  });

  it('is deterministic for a seed', () => {
    const a = Array.from(buildSandMound(round, { seed: 4 }).attributes.position.array);
    const b = Array.from(buildSandMound(round, { seed: 4 }).attributes.position.array);
    expect(a).toEqual(b);
  });
});

// ── Where a drift sits ──────────────────────────────────────────────────────────────────────────
// Sandeep: "sand not only placed on the board, but can also go on the top. size should be
// adjustable." Both are the same mesh over a different radial span.
describe('sandSpan — one generator, two placements', () => {
  it('banks outside the cake on the board, and covers inside it on the top', () => {
    const b = sandSpan(ZONES_BOARD, 0.34);
    expect(b.innerFrac).toBe(1);               // starts at the wall
    expect(b.outerFrac).toBeCloseTo(1.34, 6);
    expect(b.feather).toBe(1);                 // tapers across its whole width — a bank

    const t = sandSpan(ZONES_TOP, 0.62);
    expect(t.innerFrac).toBe(0);               // starts at the middle
    expect(t.outerFrac).toBeCloseTo(0.62, 6);
    expect(t.feather).toBeLessThan(0.5);       // even across the middle, feathered at the rim — a layer
  });

  it('size means the same thing in both: how much sand there is', () => {
    expect(sandSpan(ZONES_BOARD, 0.5).outerFrac).toBeGreaterThan(sandSpan(ZONES_BOARD, 0.2).outerFrac);
    expect(sandSpan(ZONES_TOP, 0.9).outerFrac).toBeGreaterThan(sandSpan(ZONES_TOP, 0.3).outerFrac);
  });
});

describe('buildSandMound — the span is honoured, whichever placement', () => {
  const round = { kind: 'round', radius: 1.2 };
  /* ⚠️ REDUCED AS WE GO, NEVER SPREAD. `Math.max(...radii)` threw "Maximum call stack size
     exceeded" on a full-size top drift — a lattice of 69k vertices is past the argument limit, and
     the failure reads exactly like a geometry fault until you look at the message. */
  const radiiOf = (g) => {
    const p = g.attributes.position;
    let min = Infinity, max = 0;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r < min) min = r;
      if (r > max) max = r;
    }
    return { min, max };
  };

  /* ⚠️ THE EDGE WANDER SCALES THE SPAN, NOT THE RADIUS, and getting that wrong inverted the ring:
     inner at 1.0, outer at 1.34, a 0.45 wander put the outer edge at 0.60 — inside the inner one —
     and the bank rendered as a few stray clumps on an empty board. */
  it('never lets the outer edge fall inside the inner one', () => {
    for (const eb of [0, 0.3, 0.55, 1]) {
      expect(radiiOf(buildSandMound(round, { ...sandSpan(ZONES_BOARD, 0.34), edgeBreak: eb })).min)
        .toBeGreaterThan(1.2 - 0.02);
    }
  });

  /* ⚠️ NO POLE, AND THIS IS THE ACTUAL BUG THE LATTICE EXISTS TO FIX — not a style preference.
     A full-cover top drift rendered with spokes radiating from the middle of the cake. Sandeep,
     after two partial fixes: *"this one little out of sand look. too close spokes i think."* The
     cause is structural: a polar grid ran all 360 of its segments into ONE vertex, so every facet
     near the middle was a radially-aligned sliver and flat shading drew them as wedges. Removing
     the degenerate quads helped, crowding the rings inward helped, and neither cured it, because
     the convergence is the mesh.

     So the regression test is the convergence itself, measured two ways, and both numbers are the
     ones a polar grid fails by two orders of magnitude: how many facets meet at a single point
     (360 at a pole, at most 6 on this lattice) and how stretched the facets near the middle are
     (a sliver's long edge was hundreds of times its short one). */
  it('has no pole for spokes to radiate from', () => {
    const g = buildSandMound(round, { ...sandSpan(ZONES_TOP, 1) });
    const p = g.attributes.position;
    const at = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      at.set(k, (at.get(k) ?? 0) + 1);
    }
    // One entry per triangle CORNER, so a vertex shared by six facets counts six.
    const busiest = [...at.values()].reduce((a, b) => Math.max(a, b), 0);
    expect(busiest).toBeLessThanOrEqual(8);
  });

  it('keeps its facets compact near the middle, where slivers used to converge', () => {
    const g = buildSandMound(round, { ...sandSpan(ZONES_TOP, 1) });
    const p = g.attributes.position;
    let worst = 0;
    for (let t = 0; t < p.count; t += 3) {
      const r = Math.hypot(p.getX(t), p.getZ(t));
      if (r > 0.3) continue;                   // the inner third — where the pole was
      const e = [0, 1, 2].map(i => {
        const a = t + i, b = t + ((i + 1) % 3);
        return Math.hypot(p.getX(a) - p.getX(b), p.getZ(a) - p.getZ(b));
      });
      const lo = Math.min(...e);
      if (lo > 1e-9) worst = Math.max(worst, Math.max(...e) / lo);
    }
    expect(worst).toBeLessThan(4);
  });

  /* ⚠️ EVERY FACE POINTS UP. Snapping a lattice corner onto the drift's edge can move it past its
     neighbours, which reverses the face's winding — and a reversed face's normal points DOWN, so it
     is backface-culled and leaves a hole you can see the board through. 255 of 24,772 came out that
     way before the winding was derived from the in-plane area instead of the loop order. */
  it('never leaves a face pointing down, whichever placement', () => {
    for (const span of [sandSpan(ZONES_BOARD, 0.34), sandSpan(ZONES_TOP, 0.62), sandSpan(ZONES_TOP, 1)]) {
      const n = buildSandMound(round, span).attributes.normal;
      let down = 0;
      for (let i = 0; i < n.count; i += 3) if (n.getY(i) < 0) down++;
      expect(down).toBe(0);
    }
  });

  /* ⚠️ SAND MAY NOT HANG IN THE AIR PAST THE RIM. On the top the wander must only ever pull IN —
     allowed to push out it reached 1.40 on a 1.2 tier at size 1.0. */
  it('keeps a top drift on the cake, even at full size and full edge break', () => {
    for (const eb of [0, 0.55, 1]) {
      expect(radiiOf(buildSandMound(round, { ...sandSpan(ZONES_TOP, 1), edgeBreak: eb })).max)
        .toBeLessThanOrEqual(1.2 + 1e-6);
    }
  });

  it('a top layer is level across its middle, where a bank is not', () => {
    const peak = (g, within) => {
      const p = g.attributes.position;
      let h = 0;
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) < within) h = Math.max(h, p.getY(i));
      return h;
    };
    const top = buildSandMound(round, sandSpan(ZONES_TOP, 0.62));
    const board = buildSandMound(round, sandSpan(ZONES_BOARD, 0.34));
    expect(peak(top, 0.25)).toBeGreaterThan(0.02);     // sand in the middle of the patch
    expect(peak(board, 1.15)).toBe(0);                 // nothing inside the cake's own footprint
  });
});

describe('buildSandMound — a disc has a centre, not a ring of zero radius', () => {
  const round = { kind: 'round', radius: 1.2 };
  const degenerates = (g) => {
    const p = g.attributes.position;
    const d = (a, b) => Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b));
    let n = 0;
    for (let i = 0; i < p.count; i += 3) if (d(i, i + 1) < 1e-6 || d(i + 1, i + 2) < 1e-6 || d(i, i + 2) < 1e-6) n++;
    return n;
  };

  /* ⚠️ Every vertex of ring 0 sits on the origin when the span starts at zero, so the first band of
     quads has two coincident corners each. They render as slivers radiating from the middle — on a
     full-size top drift, plainly visible as spokes converging at the centre of the cake. */
  it('emits no degenerate triangles at the centre of a top drift', () => {
    for (const size of [0.3, 0.62, 1]) {
      expect(degenerates(buildSandMound(round, sandSpan(ZONES_TOP, size)))).toBe(0);
    }
  });

  it('a board ring has no centre to fan, and is unaffected', () => {
    expect(degenerates(buildSandMound(round, sandSpan(ZONES_BOARD, 0.34)))).toBe(0);
  });
});

/* ── What has to SIT on the sand ─────────────────────────────────────────────────────────────────
 * Sandeep: *"when another element like shell, or other sea elements can be placed on the sand."*
 * A shell is seated by asking how high the drift stands under it, so that number has to describe
 * THE MESH — not a second opinion about it (INVARIANTS #15: a preview and the thing previewed ask
 * one function). These tests are the guard on that agreement.
 */
describe('sandHeightAt — the number a shell is seated on', () => {
  const shape = { kind: 'round', radius: 1.2 };
  const opts = { ...sandSpan(ZONES_TOP, 1), region: { kind: 'round', size: 0.8 } };

  it('agrees with the mesh it describes', () => {
    const at = sandHeightAt(shape, opts);
    const p = buildSandMound(shape, opts).attributes.position;
    /* ⚠️ A TOLERANCE OF THE GRAIN, NOT OF ZERO, and the reason is not slack. A mesh vertex is
       stored where the in-plane wobble left it, while its HEIGHT was taken before that nudge — so
       querying the sampler at the stored position lands a few thousandths away in a noise field
       that is deliberately fine. The bank is what must match; the speckle is allowed to differ by
       its own amplitude. */
    const grain = SAND_DEFAULTS.rise * SAND_DEFAULTS.moundGrain;
    let worst = 0;
    for (let i = 0; i < p.count; i += 29) {
      worst = Math.max(worst, Math.abs(at(p.getX(i), p.getZ(i)) - p.getY(i)));
    }
    expect(worst).toBeLessThan(grain);
  });

  it('stands a shell up in the drift and leaves one outside it on the cake', () => {
    const at = sandHeightAt(shape, opts);
    expect(at(0, 0)).toBeGreaterThan(SAND_DEFAULTS.rise * 0.5);
    // Past the region's own edge there is no sand, so nothing is lifted.
    expect(at(1.15, 0)).toBe(0);
  });

  /* ⚠️ THE EXACT CENTRE OF A ROUND TIER IS A REAL EDGE CASE, not a theoretical one. `snapToRim`
     normalises (x, z) to get a bearing, and at the origin that is 0/0 — it returned the origin
     itself, so the middle of the cake measured as though it were ON the rim and a shell placed dead
     centre sat at zero height while the sand around it stood proud. */
  it('does not drop a shell through the sand at the exact middle of the cake', () => {
    const at = sandHeightAt(shape, opts);
    expect(at(0, 0)).toBeGreaterThan(at(0.0001, 0.0001) * 0.8);
  });

  /* ⚠️ THE SEED OFFSET IS THE TRAP. `SandBed` renders the mound with `seed + SAND_MOUND_SEED` so
     the bank and the crumbs do not share a noise field. A caller that built the sampler from the
     bare seed would get the right shape with the wrong lumps — and shells would float over one
     dune and sink into another, with nothing to point at. */
  it('describes the drift SandBed actually renders, seed offset and all', () => {
    const made = sandMoundOpts({ span: sandSpan(ZONES_TOP, 1), rise: SAND_DEFAULTS.rise,
      moundNoise: SAND_DEFAULTS.moundNoise, moundGrain: SAND_DEFAULTS.moundGrain,
      edgeBreak: SAND_DEFAULTS.edgeBreak, region: { kind: 'round', size: 0.8 }, seed: 11 });
    expect(made.seed).toBe(11 + SAND_MOUND_SEED);
    const grain = SAND_DEFAULTS.rise * SAND_DEFAULTS.moundGrain;
    const p = buildSandMound(shape, made).attributes.position;
    const right = sandHeightAt(shape, made);
    const wrong = sandHeightAt(shape, { ...made, seed: 11 });
    let worstRight = 0, worstWrong = 0;
    for (let i = 0; i < p.count; i += 29) {
      worstRight = Math.max(worstRight, Math.abs(right(p.getX(i), p.getZ(i)) - p.getY(i)));
      worstWrong = Math.max(worstWrong, Math.abs(wrong(p.getX(i), p.getZ(i)) - p.getY(i)));
    }
    expect(worstRight).toBeLessThan(grain);
    expect(worstWrong).toBeGreaterThan(worstRight);
  });
});
