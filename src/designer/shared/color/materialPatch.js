/* ── ONE owner of a material's onBeforeCompile and customProgramCacheKey ─────────────────────────
 *
 * ⚠️ THREE MODULES USED TO EACH WRITE THESE TWO FIELDS AS IF THEY WERE THE ONLY WRITER, and
 * `TierBody` calls all three on the SAME material, in order: gradient, stripes, glaze. Each one's
 * teardown put the field back the way IT remembered, so whichever ran last silently undid the work
 * of the ones before it.
 *
 * Sandeep, on a cake loaded from the library: *"when i tried to change the color 1 of the tier its
 * not changing"*, and — the measurement that settled it — *"once i saw the issue balance dial did
 * not work"*. Balance is a plain uniform. A uniform that changes nothing means the gradient snippet
 * was not in the compiled program at all.
 *
 * Reproduced with no GPU involved, three ways:
 *
 *   • a STRIPED cake then a gradient cake — `applyStripes`'s teardown restores the
 *     `onBeforeCompile` it saved on the way in, which is the one from BEFORE the gradient was
 *     applied in the same frame. The gradient is erased moments after being set.
 *   • a GLAZED cake then a gradient cake — `applyGlaze`'s teardown assigns `() => {}` outright,
 *     erasing the gradient the same way.
 *   • and both teardowns set a CONSTANT cache key (`'grad:off'`, `'glaze:off'`), so every material
 *     in that state asks three.js for the same program. `gradientMaterial` already carries the note
 *     about what that costs: the program binds whichever material compiled FIRST, and the others
 *     render that one's colours. Which is a stale cake's colours on the new cake's wall.
 *
 * So the two fields get a single owner. Each effect registers a named PATCH; this composes the live
 * set into one `onBeforeCompile` and one cache key. No module writes the fields any more, so there
 * is nothing left to clobber.
 *
 * ⚠️ THE KEY ALWAYS CARRIES `mat.uuid`. That is not decoration — it is the whole reason two tiers
 * cannot share a program, and the constant keys above are what this replaces.
 *
 * ⚠️ AND IT ONLY ASKS FOR A RECOMPILE WHEN THE SHADER TEXT WOULD CHANGE. Patches mutate their
 * uniform objects in place, so dragging a colour or the balance dial must not rebuild a program —
 * `stripeMaterial` records what that feels like ("chewing through treacle"). The signature covers
 * which patches are live and each one's `variant` (the masked/unmasked snippet choice), never a
 * value.
 */

/* Paint order, and it is the order the snippets write `diffuseColor`: later wins the pixel. It
   matches what the three modules did between them before — a tier carrying both a gradient and
   stripes renders as stripes, and a glaze beats both. Every snippet re-emits its own
   `#include <…>` token, which is what lets them chain at all. */
export const PATCH_ORDER = Object.freeze(['gradient', 'stripes', 'glaze']);

/** What the compiled program depends on: which patches are live, and which snippet each chose. */
export function patchSignature(bag) {
  const live = PATCH_ORDER.filter(s => bag?.[s]).map(s => `${s}:${bag[s].variant ?? ''}`);
  return live.length ? live.join('+') : 'none';
}

/**
 * Register (or clear) one named patch on a material.
 *
 * `patch` is `{ inject(shader, renderer), uniforms?, variant? }`, or null to remove it.
 *   inject   — does the string replacements; must re-emit the `#include` it replaces
 *   uniforms — the bag to merge into `shader.uniforms`; held by identity so `.value` writes land
 *   variant  — anything that changes the snippet TEXT, so the cache key can carry it
 */
export function setMaterialPatch(mat, slot, patch) {
  if (!mat) return;
  if (!PATCH_ORDER.includes(slot)) throw new Error(`unknown material patch slot: ${slot}`);
  const bag = mat.userData.__spatPatches ?? (mat.userData.__spatPatches = {});
  const before = patchSignature(bag);
  if (patch) bag[slot] = patch; else delete bag[slot];
  const after = patchSignature(bag);

  /* ⚠️ READS THE LIVE BAG RATHER THAN CLOSING OVER IT, so a patch registered after this function
     ran is still injected by the program compiled later. */
  mat.onBeforeCompile = (shader, renderer) => {
    const live = mat.userData.__spatPatches ?? {};
    for (const s of PATCH_ORDER) {
      const p = live[s];
      if (!p) continue;
      if (p.uniforms) Object.assign(shader.uniforms, p.uniforms);
      p.inject(shader, renderer);
    }
  };
  mat.customProgramCacheKey = () => `spat:${mat.uuid}:${patchSignature(mat.userData.__spatPatches)}`;

  // Only the set of snippets forces a rebuild; values ride the uniforms.
  if (before !== after) mat.needsUpdate = true;
}

/** Is this slot currently patched? For callers that keep their own fast path. */
export function hasMaterialPatch(mat, slot) {
  return !!mat?.userData?.__spatPatches?.[slot];
}
