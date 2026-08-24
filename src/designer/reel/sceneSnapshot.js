/* ── Everything recording changes, saved and put back in one place ───────────────────────────────
 *
 * Recording mutates the live scene: the drawing buffer is resized to 1080×1920, the camera's aspect
 * and position are driven, the ground is swapped, orbit controls are switched off. All of it has to
 * go back — a reel that leaves the designer at a different size, or looking at a different colour, is
 * a bug the baker meets ten minutes later in a completely different feature and never connects.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO BLOCKS OF CODE ─────────────────────────────────────────────
 * It used to be a `before = {…}` object and a `finally` block that undid it, fifty lines apart and
 * kept in step by hand. That works until somebody adds a fifth thing they change and forgets its
 * undo — and then the designer is subtly wrong after every recording, with nothing pointing at the
 * reel as the cause.
 *
 * Here each aspect's READ and WRITE sit on the same line as each other. Adding something you mutate
 * means adding one entry, and an entry that only knows how to read does not compile into anything
 * useful. The restore is generated, not maintained.
 *
 * No three.js import: everything is duck-typed through the objects handed in, so this is testable
 * without a renderer, and the tests below run in plain node.
 */

// Each entry: how to read the current value, and how to put a value back. Order matters only for
// `size`, which must be restored before aspect is recomputed downstream — so it is written first.
const ASPECTS = [
  {
    key: 'size',
    // ⚠️ getSize() writes into the object you hand it by CALLING target.set(w, h) — it wants a
    // Vector2, not a bare {}. Passing an empty object throws "target.set is not a function", and it
    // throws EVERY time, so this was never going to work in a browser. It shipped because the test
    // stub wrote t.x/t.y directly instead of imitating the real API; the stub now requires .set, so
    // the same mistake fails the test rather than the app.
    //
    // A shim rather than THREE.Vector2, to keep this module free of three and testable in node.
    read:  ({ gl }) => (gl ? (() => {
      const v = { set(x, y) { this.x = x; this.y = y; return this; } };
      gl.getSize(v);
      return { x: v.x, y: v.y };
    })() : null),
    write: ({ gl }, v) => { if (gl && v) gl.setSize(v.x, v.y, false); },
  },
  {
    key: 'pixelRatio',
    read:  ({ gl }) => gl?.getPixelRatio?.() ?? null,
    write: ({ gl }, v) => { if (gl && v != null) gl.setPixelRatio(v); },
  },
  {
    // The scene's clear colour — what the ground swatches change. `background` may be a Color, a
    // Texture, or null (meaning "transparent, the page shows through"), and null is a value that
    // must be restorable rather than treated as absent.
    key: 'background',
    read:  ({ scene }) => (scene ? { value: scene.background ?? null } : null),
    write: ({ scene }, v) => { if (scene && v) scene.background = v.value; },
  },
  {
    key: 'cameraPosition',
    read:  ({ camera }) => (camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null),
    write: ({ camera }, v) => { if (camera && v) camera.position.set(v.x, v.y, v.z); },
  },
  {
    key: 'cameraAspect',
    read:  ({ camera }) => camera?.aspect ?? null,
    write: ({ camera }, v) => { if (camera && v != null) camera.aspect = v; },
  },
  {
    key: 'autoRotate',
    read:  ({ controls }) => controls?.autoRotate ?? null,
    write: ({ controls }, v) => { if (controls && v != null) controls.autoRotate = v; },
  },
  {
    key: 'controlsEnabled',
    read:  ({ controls }) => controls?.enabled ?? null,
    write: ({ controls }, v) => { if (controls && v != null) controls.enabled = v; },
  },
];

/* Snapshot the scene. Returns { values, restore } — call restore() in a `finally`, always, even on a
 * throw: a half-restored camera is a designer that looks broken with no clue why.
 *
 * restore() is idempotent. The panel restores when it closes and the recorder restores when a take
 * ends, and those brackets overlap; restoring twice must be harmless rather than something callers
 * have to reason about.
 */
export function snapshotScene(ctx) {
  const values = {};
  for (const a of ASPECTS) values[a.key] = a.read(ctx);

  return {
    values,
    restore() {
      for (const a of ASPECTS) a.write(ctx, values[a.key]);
      // After the camera's aspect changes, the projection matrix is stale until it is told.
      ctx.camera?.updateProjectionMatrix?.();
      // And OrbitControls caches the camera's spherical position; without this it snaps back to
      // wherever it thought the camera was the moment the next drag starts.
      ctx.controls?.update?.();
    },
  };
}

// Exported for the test, and so a reader can see the full list without scrolling the module.
export const SNAPSHOT_KEYS = ASPECTS.map(a => a.key);
