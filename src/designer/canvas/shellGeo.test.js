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
import { buildShellGeo, capShellScale, extractGeo } from './shellGeo.js';

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

  it('applies the authored TILT, which is the line that needed DEG', () => {
    const flat = buildShellGeo(fakeScene(), false, 1.2, 1, [0, 0, 0]);
    const tilted = buildShellGeo(fakeScene(), false, 1.2, 1, [40, 0, 0]);
    // A tilted shell reaches differently in Z than an upright one; if DEG were missing this throws,
    // and if the tilt were ignored these would be equal.
    expect(tilted.worldMaxZ).not.toBeCloseTo(flat.worldMaxZ, 6);
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
