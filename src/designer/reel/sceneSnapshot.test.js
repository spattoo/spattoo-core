import { describe, it, expect } from 'vitest';
import { snapshotScene, SNAPSHOT_KEYS } from './sceneSnapshot.js';

// Stand-ins for the three.js objects. Duck-typed on purpose — the module imports no three, so the
// whole save/restore contract is testable without a renderer or a browser.
function fakeScene() {
  const camera = {
    position: { x: 0, y: 4.85, z: 6.95, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    aspect: 16 / 9,
    projectionUpdates: 0,
    updateProjectionMatrix() { this.projectionUpdates++; },
  };
  const gl = {
    _size: { x: 1200, y: 800 }, _dpr: 2,
    // Imitates the REAL three.js API: getSize writes by calling target.set(w, h). The previous stub
    // assigned t.x/t.y directly, which let a caller passing a bare {} pass the test and throw in
    // every browser. A stub that is kinder than the real thing tests nothing.
    getSize(t) { return t.set(this._size.x, this._size.y); },
    setSize(x, y) { this._size = { x, y }; },
    getPixelRatio() { return this._dpr; },
    setPixelRatio(v) { this._dpr = v; },
  };
  const scene = { background: '#E8EDE9' };
  const controls = { autoRotate: true, enabled: true, updates: 0, update() { this.updates++; } };
  return { camera, gl, scene, controls };
}

describe('snapshotScene', () => {
  it('puts everything back exactly, however much recording mangled it', () => {
    const ctx = fakeScene();
    const snap = snapshotScene(ctx);

    // What a take does to the scene.
    ctx.gl.setSize(1080, 1920);
    ctx.gl.setPixelRatio(1);
    ctx.scene.background = '#2B2B2B';
    ctx.camera.position.set(3, 9, 1);
    ctx.camera.aspect = 1080 / 1920;
    ctx.controls.autoRotate = false;
    ctx.controls.enabled = false;

    snap.restore();

    expect(ctx.gl._size).toEqual({ x: 1200, y: 800 });
    expect(ctx.gl._dpr).toBe(2);
    expect(ctx.scene.background).toBe('#E8EDE9');
    expect([ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z]).toEqual([0, 4.85, 6.95]);
    expect(ctx.camera.aspect).toBe(16 / 9);
    expect(ctx.controls.autoRotate).toBe(true);
    expect(ctx.controls.enabled).toBe(true);
  });

  it('recomputes the projection and refreshes the controls', () => {
    // Without these the camera keeps a stale projection matrix, and OrbitControls snaps back to
    // where it thought the camera was the moment the next drag starts.
    const ctx = fakeScene();
    const snap = snapshotScene(ctx);
    snap.restore();
    expect(ctx.camera.projectionUpdates).toBeGreaterThan(0);
    expect(ctx.controls.updates).toBeGreaterThan(0);
  });

  it('is idempotent — the panel and the recorder both restore, and their brackets overlap', () => {
    const ctx = fakeScene();
    const snap = snapshotScene(ctx);
    ctx.camera.position.set(9, 9, 9);
    snap.restore();
    snap.restore();
    expect([ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z]).toEqual([0, 4.85, 6.95]);
  });

  it('restores a null background rather than treating it as absent', () => {
    // null means "transparent, the page shows through" — a real value, not a missing one. Treating
    // it as absent would leave the designer painted with whatever ground was last previewed.
    const ctx = fakeScene();
    ctx.scene.background = null;
    const snap = snapshotScene(ctx);
    ctx.scene.background = '#FBF3E7';
    snap.restore();
    expect(ctx.scene.background).toBeNull();
  });

  it('survives a scene with no controls — the canvas mounts before OrbitControls does', () => {
    const ctx = fakeScene();
    ctx.controls = null;
    const snap = snapshotScene(ctx);
    ctx.camera.aspect = 0.5;
    expect(() => snap.restore()).not.toThrow();
    expect(ctx.camera.aspect).toBe(16 / 9);
  });

  it('covers every aspect a take actually mutates', () => {
    // A reminder rather than a assertion about implementation: if recording starts changing
    // something new, it belongs in ASPECTS or it will not be put back.
    expect(SNAPSHOT_KEYS).toEqual([
      'size', 'pixelRatio', 'background',
      'cameraPosition', 'cameraAspect', 'autoRotate', 'controlsEnabled',
    ]);
  });
});
