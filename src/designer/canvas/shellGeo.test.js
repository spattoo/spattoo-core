/* These four moved out of CakeTier.jsx so admin's calibrator could import them instead of carrying
 * its own copies. The move shipped a ReferenceError: `buildShellGeo` reads `DEG` to convert the
 * authored tilt, and the constant stayed behind in the file the function left.
 *
 * ⚠️ TWO GATES WERE GREEN WHILE IT WAS BROKEN, and that is the point of this file.
 *   · `check:bindings` matches CALLS (`name(`) and narrow reads (`name.`, `name > n`). `DEG` is
 *     used as `tiltDeg[0] * DEG` — arithmetic — and its call matcher only accepts lowercase-initial
 *     names anyway, so an ALL-CAPS constant in a multiplication is outside its reach entirely.
 *   · admin's `check:smoke` opens all 64 screens and they all opened: `buildShellGeo` only runs
 *     once a GLB is loaded, which no smoke does.
 * A screen that opens is not a screen that works. So this calls the function for real.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildShellGeo, capShellScale, extractGeo, ringBaseY, shellRadialProfile } from './shellGeo.js';

/** The smallest thing that looks like a loaded GLB scene: one mesh with real geometry. */
function fakeScene() {
  const scene = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.4, 1, 0.3);
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
  return scene;
}

describe('shell geometry survives leaving the renderer', () => {
  it('builds a shell without throwing — DEG and friends came with it', () => {
    const out = buildShellGeo(fakeScene(), false, 1.2, 1);
    expect(out).toBeTruthy();
    expect(out.shellScale).toBeGreaterThan(0);
    expect(Number.isFinite(out.worldTopY)).toBe(true);
  });

  /* ⚠️ THE SEAT IGNORES THE TILT ON PURPOSE, AND THIS TEST IS THE CONTRACT WITH ADMIN.
     `PipingCalibrator.jsx` calls buildShellGeo with FOUR arguments — no tilt — while rendering the
     shell tilted. Every row in the catalogue was authored against that. When this function started
     measuring the tilted box (2026-10-08), the designer began seating those rows somewhere admin
     could not reproduce: Sandeep, *"a set of values that are looking good on calibrator are not
     landing the same way on designer"*. A rotation changes how a piece FACES, never where its ring
     sits. If this ever fails, the two surfaces have drifted again. */
  it('seats a shell the same however it is rotated — admin measures it upright', () => {
    const flat = buildShellGeo(fakeScene(), false, 1.2, 1, [0, 0, 0]);
    for (const tilt of [[40, 0, 0], [-90, 0, 0], [-68, -1, 175], [0, 0, 175]]) {
      const t = buildShellGeo(fakeScene(), false, 1.2, 1, tilt);
      expect(t.worldMaxZ).toBeCloseTo(flat.worldMaxZ, 10);
      expect(t.worldMinZ).toBeCloseTo(flat.worldMinZ, 10);
      expect(t.worldBotY).toBeCloseTo(flat.worldBotY, 10);
      expect(t.shellScale).toBeCloseTo(flat.shellScale, 10);
    }
  });

  it('caps the scale against the tier radius — the cap admin had lost', () => {
    const r = 1.2;
    const big = buildShellGeo(fakeScene(), false, r, 8);     // absurd size factor
    const one = buildShellGeo(fakeScene(), false, r, 1);
    // 8x must NOT come out eight times larger: capShellScale is what the calibrator's copy lacked.
    expect(big.shellScale).toBeLessThan(one.shellScale * 8);
  });

  it('capShellScale never returns more than the cap', () => {
    const sc1 = 0.5;
    expect(capShellScale(sc1, 100, 0.3, 1.2)).toBeLessThan(sc1 * 100);
    expect(capShellScale(sc1, 1, 0.3, 1.2)).toBeCloseTo(sc1, 6);
  });

  it('extractGeo returns a geometry for a scene that has one', () => {
    expect(extractGeo(fakeScene())?.geo).toBeTruthy();
  });
});

/* ── The authored range must reach the pixels ────────────────────────────────────────────────────
 *
 * ⚠️ THIS SUITE EXISTS BECAUSE A GATE WENT GREEN OVER THE FAULT IT WAS WRITTEN FOR. An admin
 * authored `scale: { min: 1, max: 5 }` on the Rosette; the dial honoured it and travelled to 5.00;
 * the render was byte-identical to 2.00 — 0 changed pixels of 252,000. `capShellScale` had thrown
 * the number away. Sandeep: *"what is the point we have scale configuration?"*
 *
 * `check:element-size` passed, and when the same fault was planted a second time it passed again,
 * printing "no default size is hard-coded". Its three rules all match a SYNTAX — a dial row with
 * literal bounds, a `<SizeDial>` with no `min=`, a `size: 0.3` seed. Those are the three shapes the
 * bug had already taken on the three days it was caught. The law is "a value an admin authors
 * reaches the pixels unchanged", and no spelling-based rule can state it: the fourth occurrence
 * only has to be written differently to walk through.
 *
 * So these assert BEHAVIOUR. They call the real function and compare what comes out. A fifth
 * variant — a different constant, a different file, a different name — fails them anyway, because
 * what they measure is whether the two ends of the authored range still differ.
 */
describe('an authored size range is live end to end', () => {
  /* The real Rosette's proportions, which is the whole reason this suite exists. Measured from
     Rose-swirl-2-optimized.glb: extent [1.890, 0.903, 1.901], thin axis Y. `extractGeo` bakes a
     +90° X turn, so the renderer sees height 1.901 and radial depth 0.903 — a wide, shallow disc,
     which is exactly the shape that hits a depth-based ceiling early. */
  const rosetteScene = () => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(1.890, 0.903, 1.901), new THREE.MeshStandardMaterial()));
    return s;
  };

  it('a row that authors a ceiling gets the range it authored — the Rosette case', () => {
    const r = 0.35;                       // a real tier radius
    const cfg = { max_depth: 0.6 };       // the admin raises the rail deliberately
    const lo = buildShellGeo(rosetteScene(), false, r, 1, [0, 0, 0], cfg);
    const hi = buildShellGeo(rosetteScene(), false, r, 5, [0, 0, 0], cfg);
    // 1 → 5 must not render the same cake. This is the assertion the pixels failed.
    expect(hi.shellScale).toBeGreaterThan(lo.shellScale * 1.5);
  });

  it('the ceiling is READ FROM THE ROW, not from a constant in the renderer', () => {
    const r = 0.35;
    const tight = capShellScale(0.044, 5, 0.903, r, { max_depth: 0.16 });
    const loose = capShellScale(0.044, 5, 0.903, r, { max_depth: 0.80 });
    expect(loose).toBeGreaterThan(tight);
  });

  it('a row that authors nothing keeps the old rail exactly — no saved cake moves', () => {
    const r = 0.35, sc1 = 0.044, depth = 0.903;
    // The historical expression, inlined: this is what every existing row rendered at before.
    const before = Math.min(sc1 * 5, Math.max(sc1 * 1.15, (r * 0.16) / depth));
    expect(capShellScale(sc1, 5, depth, r)).toBeCloseTo(before, 10);
    expect(capShellScale(sc1, 5, depth, r, {})).toBeCloseTo(before, 10);
    expect(capShellScale(sc1, 5, depth, r, null)).toBeCloseTo(before, 10);
  });

  /* The cap measures the UPRIGHT depth, for the same compatibility reason as the seat: a size that
     looked right in the calibrator must render at that size on the cake, and the calibrator has
     never fed the cap a tilted box. */
  it('the cap measures the upright depth, as the calibrator does', () => {
    const r = 0.35;
    const upright = buildShellGeo(rosetteScene(), false, r, 5, [0, 0, 0]);
    const laidFlat = buildShellGeo(rosetteScene(), false, r, 5, [-90, 0, 0]);
    expect(laidFlat.shellScale).toBeCloseTo(upright.shellScale, 10);
  });
});

/* ── A tilted piece is seated by its own reach, not by half its box ──────────────────────────────
 *
 * `extractGeo` centres the geometry on X/Z and seats it at min Y, so the origin is at the piece's
 * BASE. `-half` puts the outer face at the rim only while the piece is symmetric about that origin
 * in Z, which a tilt destroys: rotate −90° about X and the body swings entirely to one side,
 * spanning Z −1.90…0 instead of −0.45…+0.45. The seat then pushes it a further half-depth inward,
 * and the ring lands well inside the rim with pink showing between it and the edge. Sandeep, with
 * the screenshot: *"why is it not on the rim? why inside"*
 *
 * Seating on the piece's own reach is right in both cases and identical when untilted.
 */
describe('a ring seats on the shell it actually renders', () => {
  const disc = () => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(1.890, 0.903, 1.901), new THREE.MeshStandardMaterial()));
    return s;
  };

  it('untilted, the outer reach IS half the depth — so nothing already placed moves', () => {
    const A = buildShellGeo(disc(), false, 0.35, 1, [0, 0, 0]);
    expect(A.worldMaxZ).toBeCloseTo((A.worldMaxZ - A.worldMinZ) / 2, 10);
  });

  /* ⚠️ AND IT STAYS HALF THE DEPTH WHEN TILTED, which is what keeps a rotated row where its author
     put it. Measuring the tilted reach pulled the catalogue's rotated rings inward — on the Classic
     Shell Border at [-68, -1, 175], by 21% of the tier radius. An element that wants to sit further
     in says so with `top_radial_offset`. */
  it('tilted, it is STILL half the depth — a rotation is not a radial decision', () => {
    const flat = buildShellGeo(disc(), false, 0.35, 1, [0, 0, 0]);
    const A = buildShellGeo(disc(), false, 0.35, 1, [-90, 0, 0]);
    expect(A.worldMaxZ).toBeCloseTo((A.worldMaxZ - A.worldMinZ) / 2, 10);
    expect(A.worldMaxZ).toBeCloseTo(flat.worldMaxZ, 10);
  });
});

/* ── A tilted shell rests ON the surface, not half inside it ─────────────────────────────────────
 *
 * The vertical twin of the radial seat above, and found the same way — by Sandeep looking at a
 * render: *"it was rendering correct element only, but might be burried into cake"*. He was right.
 *
 * `extractGeo` seats the geometry at min Y, so an untilted shell spans Y 0..h and placing its
 * ORIGIN on the cake top is the same as placing its BASE there. A tilt breaks that: laid face-up
 * with -90° about X the rosette spans Y -0.45..+0.45, so half of it is below its own origin and
 * sinks into the lid. You see the top half of each rose, which reads as splayed petals rather than
 * a rose — and reads as the wrong element rather than a seating bug.
 *
 * `buildShellGeo` has published `worldBotY` for exactly this since it was written ("vertical
 * reach … how far the shell actually reaches above/below its anchor"). Nothing used it to seat.
 * `DecorationShells` got this fix in 47723762; the cream path never did, so the two render paths
 * disagreed about where a tilted ring sits.
 */
describe('ringBaseY lifts a tilted shell clear of the surface', () => {
  const disc = () => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(1.890, 0.903, 1.901), new THREE.MeshStandardMaterial()));
    return s;
  };

  it('an untilted shell already sits on its base — the seat is a no-op', () => {
    const A = buildShellGeo(disc(), false, 0.35, 1, [0, 0, 0]);
    expect(A.worldBotY).toBeCloseTo(0, 10);
    expect(ringBaseY(1.23, A)).toBeCloseTo(1.23, 10);   // nothing already placed moves
  });

  /* ⚠️ A TILTED SHELL IS SEATED THE SAME AS AN UPRIGHT ONE — its origin on the surface. Lifting it
     by the tilted box's reach raised every rotated row in the catalogue off the cake (the Classic
     Shell Border rose 19.6% of the tier radius) and admin could not reproduce it. An element that
     genuinely needs lifting says so with `top_y_offset`, which is per-row and does not move anyone
     else's cake. */
  it('a tilted shell seats exactly where an upright one does', () => {
    const A = buildShellGeo(disc(), false, 0.35, 1, [-90, 0, 0]);
    expect(A.worldBotY).toBeCloseTo(0, 10);
    expect(ringBaseY(1.23, A)).toBeCloseTo(1.23, 10);
  });

  it('survives a missing shell — the rings call it before a GLB has loaded', () => {
    expect(ringBaseY(0.5, null)).toBe(0.5);
    expect(ringBaseY(0.5, {})).toBe(0.5);
  });
});

/* ⚠️ A RING IS A DOME ACROSS ITS BAND, AND PRETENDING OTHERWISE PUT SPRINKLES IN A CIRCLE.
 * Measured on the catalogue Rosette after its authored -85° tilt: the crest is 100% in the middle
 * of the radial band and falls to 42% at the inner edge and 33% at the outer — a flat plane at the
 * crest floats by 0.374, two thirds of the shell's own height, so anything resting on it touches
 * only along one radius. Sandeep: *"why the sprinkles forming a circle on the cream layer. it
 * should be random."* */
describe('shellRadialProfile — the height ACROSS a shell, inner edge to outer', () => {
  // A ridge running along X: tallest at z = 0, falling to nothing at z = ±1.
  function ridge() {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const z = -1 + (i / 40) * 2;
      const y = 1 - Math.abs(z);
      pts.push(-0.5, y, z, 0, y, z, 0.5, y, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    g.computeBoundingBox();
    return g;
  }

  const identity = new THREE.Matrix4();

  it('reports the crest in the middle and the fall-off at both edges', () => {
    const g = ridge();
    const prof = shellRadialProfile(g, identity, g.boundingBox);
    expect(prof).toBeTruthy();
    const mid = prof[Math.floor(prof.length / 2)];
    expect(mid).toBeCloseTo(1, 1);                 // crest
    expect(prof[0]).toBeLessThan(0.2);             // inner edge, near nothing
    expect(prof[prof.length - 1]).toBeLessThan(0.2);
    expect(Math.max(...prof)).toBeCloseTo(1, 1);
  });

  /* MAX per slice, not mean: something resting on cream sits on the HIGHEST cream under it. */
  it('takes the tallest point in each slice', () => {
    const g = new THREE.BufferGeometry();
    // two points in the same z slice at different heights
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0.2, -1, 0, 0.9, -1, 0, 0.1, 1,
    ]), 3));
    g.computeBoundingBox();
    const prof = shellRadialProfile(g, identity, g.boundingBox);
    expect(prof[0]).toBeCloseTo(0.9, 6);
  });

  /* ⚠️ MEASURED THROUGH THE SAME MATRIX the extents beside it use, or the profile would describe a
     differently-posed shell — the class of fault that produced two wrong cuts before this. */
  it('is measured through the transform, so a tilt moves it', () => {
    const g = ridge();
    const m = new THREE.Matrix4().makeScale(1, 2, 1);
    const box = g.boundingBox.clone().applyMatrix4(m);
    const prof = shellRadialProfile(g, m, box);
    expect(Math.max(...prof)).toBeCloseTo(2, 1);
  });

  it('is null for geometry with no depth to profile', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    g.computeBoundingBox();
    expect(shellRadialProfile(g, identity, g.boundingBox)).toBeNull();
  });

  it('buildShellGeo carries one, so the renderer can publish it', () => {
    const g = ridge();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
    const A = buildShellGeo(scene, false, 0.35, 1, [0, 0, 0], null);
    expect(A.radialProfile).toBeTruthy();
    expect(A.radialProfile.length).toBeGreaterThan(1);
  });
});
