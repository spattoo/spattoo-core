import { finishCanvasSize, mkCtx, ctxTexture, gray } from './finishCanvas.js';
import { stampDustFlecks, LUSTER_DUST_DEFAULTS } from './lusterDust.js';
import { stampFoilFlakes, GOLD_LEAF_DEFAULTS } from './goldLeafFlakes.js';

// ── Unified particle-finish compositor ────────────────────────────────────────
// A tier wall can carry luster dust AND gold leaf at once, but a material has ONE map slot per channel
// — so both finishes must bake into ONE set of maps. This composites them: the base fills carry the
// cake's own colour + surface metalness/roughness (so non-finish wall is untouched), then dust specks
// and gold-leaf shards stamp ABSOLUTE metalness/roughness greys on top. The material binds these with
// metalness/roughness SCALARS = 1, so each particle keeps its own metalness/roughness regardless of the
// other finish. (Luster dust's per-fleck look is reproduced exactly: its old white-metalness +
// sparkle-roughness maps, multiplied by the old scalars, equal these absolute greys.)
export function makeParticleFinishMaps({
  radius = 1, height = 2.2, baseColor = '#ffffff', surfRoughness = 0.68, surfMetalness = 0,
  dusting = null, foil = null,
}) {
  const { WU, Wc, Hc } = finishCanvasSize(radius, height);
  const alb = mkCtx(baseColor, Wc, Hc);
  const met = mkCtx(gray(surfMetalness), Wc, Hc);
  const rou = mkCtx(gray(surfRoughness), Wc, Hc);
  const emi = mkCtx('#000000', Wc, Hc);
  const nrm = mkCtx('#8080ff', Wc, Hc);

  if (dusting?.splashes?.length) {
    const d = { ...LUSTER_DUST_DEFAULTS, ...dusting };
    stampDustFlecks({
      alb, met, rou, emi, nrm, Wc, Hc, WU, radius, height,
      dustColor: d.dustColor, density: d.density, fleckSize: d.fleckSize, sizeVar: d.sizeVar,
      sparkle: d.sparkle, glitter: d.glitter, falloff: d.falloff, scatter: d.scatter,
      directionality: d.directionality, splashes: dusting.splashes, seed: 1337,
      // Absolute greys that reproduce the old (scalar metalness × white) and (scalar roughness × sparkle).
      metalFill: gray(d.metalness ?? 0.2),
      roughFill: gray(surfRoughness * (d.sparkle ?? 0.36)),
    });
  }
  if (foil?.flakes?.length) {
    const fin = { ...GOLD_LEAF_DEFAULTS, ...(foil.finish ?? {}) };
    stampFoilFlakes({
      alb, met, rou, Wc, Hc, height,
      leafColor: foil.color ?? '#e6be4a',
      metalness: fin.metalness, roughness: fin.roughness, sizeScale: fin.sizeScale, raggedness: fin.raggedness,
      flakes: foil.flakes, seed: 99,
    });
  }

  return {
    map: ctxTexture(alb, true), metalnessMap: ctxTexture(met), roughnessMap: ctxTexture(rou),
    emissiveMap: ctxTexture(emi, true), normalMap: ctxTexture(nrm),
  };
}
