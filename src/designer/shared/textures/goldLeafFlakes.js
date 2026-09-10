import { makeGoldLeafMaps } from './goldLeafTexture.js';
import { gray } from './finishCanvas.js';

// ── Gold leaf FLAKES — hand-applied edible gold-leaf shards (the "food foil" finish) ──
//
// Bakers tear a sheet of edible leaf into small irregular shards and press them flat onto the cake,
// each piece a different torn shape, scattered or swept in a diagonal. Unlike luster dust (a fine
// metallic SPRAY of round specks) this is a SCATTER of larger torn shards that lie flat and SHINE.
// Same compositing model as dust: each shard is stamped into the tier-wall material maps so it reads
// as real gold METAL over the matte cake (metalness/roughness baked ABSOLUTE so dust + foil can share
// one material). A shard's interior crinkle reuses the approved gold-foil texture (makeGoldLeafMaps),
// not a re-derived one. Developed in the admin Gold Leaf Studio. Ships in two finishes — gold/silver.

/* ⚠️ TWO OF THESE WERE MEASURED WRONG AND ONE OF THEM NEVER DID ANYTHING. Reported dull from the app
 * on 2026-09-09 — flat pale patches beside a gold BOARD that reads plainly metallic in the same
 * frame. Measured with `scripts/measure-foil-shine.mjs`, which reads the swing between a shard's
 * brightest and darkest pixel, because that swing IS the reflection and a flat mean cannot tell
 * matte paint from mirror gold:
 *
 *     metalness 0.6, glow 0.35  (shipped)   contrast 0.114   colour 91    mean 209
 *     metalness 0.9, glow 0                 contrast 0.226   colour 108   mean 168
 *     the gold board, same frame                     0.463
 *
 * `glow` was the larger error and it was working directly against its own purpose. Emissive is
 * ADDITIVE and view-INDEPENDENT: it lifts every pixel of a shard by the same amount, so it raises the
 * mean and flattens the variation. It was there to make the foil "luminous" and what it actually did
 * was erase the reflection — the one thing that reads as metal. Zero, and the gold albedo carries the
 * brightness instead.
 *
 * `metalness` was 0.6 to keep "the gold albedo bright". Measured, that reasoning is backwards: at 0.9
 * the shards hold MORE colour (chroma 108 against 91), not less, and stop looking like a wash of sky.
 *
 * ⚠️ CONFIRMED ON A REAL CAKE, 2026-09-10, and that step nearly went the other way. Judged on the
 * harness — flat pink, three oversized shards — the OLD look was preferred: the richer gold read as
 * heavy there. On an actual baker's cake, a pink→lilac gradient with small scattered flakes, it
 * reads as gold leaf and the old one reads as pale paper. Same numbers, opposite verdicts, because
 * a fixture with big shards on a flat ground is not the thing being decided. A harness proves a
 * MECHANISM; it does not settle a LOOK. Take the look to a real cake before changing a default back.
 *
 * ⚠️ `env` IS INERT AND ALWAYS HAS BEEN — see the note below. It is kept only so a shard's finish row
 * still round-trips through admin unchanged; nothing reads it. Do not tune it. */
export const GOLD_LEAF_DEFAULTS = {
  metalness: 0.9,         // measured: MORE colour than 0.6, not less, and far less washed out
  roughness: 0.16,        // low → glossy shine (sells "foil", not matte paint)
  /* ⚠️ DEAD. three.js overwrites `material.envMapIntensity` with `scene.environmentIntensity` for any
   * material whose own `envMap` is null (WebGLRenderer, the `isMeshStandardMaterial && envMap ===
   * null && scene.environment !== null` branch), and the tier wall's is. Swept 0 → 30 on the real
   * cake: byte-identical renders. The shards are lit at the scene's 1.25 like everything else.
   * ⚠️ Giving the material its own envMap to revive it is NOT the fix and was tried: the shards share
   * the tier's material with the whole cake wall, so it re-lights the cake, and 4.5 — never
   * calibrated, because it never applied — blows the shards to near-white (contrast 0.051). */
  env: 4.5,
  /* ⚠️ NOT WIRED, AND MEASURED NOT TO BE WORTH WIRING. Building the crinkle normal `makeGoldLeafMaps`
   * already returns, compositing it into the wall's normal map under the shards and binding it, moved
   * the contrast from 0.224 to 0.232 — about 3%, for a per-rebuild pattern fill on every drag frame.
   * The reason is the environment, not the amplitude: `lebombo` is an outdoor map and most of its
   * sphere is open sky, so perturbing a normal samples a slightly different part of the same
   * featureless white. A micro-crinkle cannot band what has no bands. The board reads well because
   * its normals swing 90°, not because it is crinkled. Don't rebuild this against this HDRI. */
  crinkle: 0.7,
  sizeScale: 1.0,         // global flake-size multiplier
  raggedness: 0.55,       // 0 = round blob, 1 = very torn/spiky shard
  glow: 0,                // ⚠️ ADDITIVE — it flattens the shard it was meant to light. See above.
};
export const GOLD_LEAF_COLORS = { gold: '#e6be4a', silver: '#cdd2d8' };
export const GOLD_LEAF_NEW_FLAKE = { rot: 0, size: 1, seed: 1 };   // a fresh shard from a tap

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// One torn shard outline around (cx,cy): an n-gon with random per-vertex radius (inward notches → torn
// edge) and angular jitter (→ angular shard, not a circle).
function tornPts(cx, cy, radPx, rot, rng, raggedness) {
  const n = 8 + Math.floor(rng() * 7);              // 8..14 vertices
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const rr = radPx * (1 - raggedness * rng());
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Cache the foil crinkle source canvas by seed — the fbm noise is deterministic per seed, so building
// it once and reusing it keeps dragging (which rebuilds the wall maps each frame) smooth.
let _foilTile = null;
function foilCrinkleTile(seed) {
  if (_foilTile && _foilTile.seed === seed) return _foilTile.canvas;
  const t = makeGoldLeafMaps({ w: 256, h: 256, seed });
  _foilTile = { seed, canvas: t.map.image };
  return _foilTile.canvas;
}

// The side-wall (cylinder unwrap) coordinate mapper: u = angle/2π across the width, v = height
// fraction (inverted so a flake lands under the tap), and a flake near a seam stamps a wrapped copy
// one circumference over. This is the DEFAULT `project` — `makeParticleFinishMaps` passes a polar
// one for the flat top. A `project` is { pxPerWorld, place(f, radPx) -> [[cx,cy], …] } so the torn-
// shard stamping below is identical on every surface; only the (u,v)→pixel map changes.
export function sideWallProject(Wc, Hc, height) {
  return {
    pxPerWorld: Hc / height,
    place(f, radPx) {
      const cx0 = (f.u ?? 0.5) * Wc;
      const cy = (1 - (f.v ?? 0.5)) * Hc;
      const xs = cx0 < radPx * 2 ? [cx0, cx0 + Wc]
               : cx0 > Wc - radPx * 2 ? [cx0, cx0 - Wc] : [cx0];
      return xs.map(cx => [cx, cy]);
    },
  };
}

// Stamp every flake (each {u, v, rot, size, seed}) onto the supplied canvas 2D contexts. Albedo = bright
// gold/silver with a gentle foil crinkle (soft fold shadows + bright sparkle); metalness/roughness =
// ABSOLUTE greys on the shard so it goes metal over the matte base. `project` maps (u,v)→pixels for the
// surface (side wall by default; a polar disk map for the flat top) — the shard art is surface-agnostic.
export function stampFoilFlakes({
  alb, met, rou, emi, Wc, Hc, height = 2.2, leafColor = GOLD_LEAF_COLORS.gold,
  metalness = GOLD_LEAF_DEFAULTS.metalness, roughness = GOLD_LEAF_DEFAULTS.roughness,
  sizeScale = 1, raggedness = GOLD_LEAF_DEFAULTS.raggedness, flakes = [], seed = 99, project = null,
}) {
  const proj = project ?? sideWallProject(Wc, Hc, height);
  const pxPerWorld = proj.pxPerWorld;
  // Shared foil crinkle tile — reuse the approved gold-leaf texture as each shard's interior. Cached by
  // seed at module scope: the crinkle is identical every rebuild, so we must NOT re-run the fbm noise on
  // every drag frame (that made dragging lag). Only the cheap per-flake stamping repeats.
  const foilMap = foilCrinkleTile(seed);
  const metFill = gray(metalness), rouFill = gray(roughness);

  flakes.forEach((f, fi) => {
    const worldRad = 0.4 * (f.size ?? 1) * sizeScale;   // size→world unit; size comes from config r (default scale)
    const radPx = Math.max(3, worldRad * pxPerWorld);
    const rot = (f.rot ?? 0) * Math.PI / 180;
    const fseed = ((f.seed ?? 1) * 2654435761 + fi * 40503) >>> 0;
    // (u,v)→pixel centre(s) for this surface (side wall wraps the seam; top is a single polar point).
    const centers = proj.place(f, radPx);

    for (const [cx, cy] of centers) {
      const rng = mulberry((fseed + Math.round(cx)) >>> 0);
      const pts = tornPts(cx, cy, radPx, rot, rng, raggedness);
      const box = [cx - radPx * 1.3, cy - radPx * 1.3, radPx * 2.6, radPx * 2.6];
      const k = (radPx * 3.4) / 256;             // foil tile drawn large enough to cover the shard

      // ALBEDO: bright gold fill + crinkle from a REPEATING foil pattern at a FIXED density, so the
      // sparkle/shine stays consistent at any shard size (a single stretched tile read flat when large).
      const pat = alb.createPattern(foilMap, 'repeat');
      if (pat?.setTransform) {
        try { pat.setTransform(new DOMMatrix().translate(cx, cy).rotate((rot * 1.7 + fi) * 57.29578).scale(0.42)); } catch { /* older browsers: untransformed tile */ }
      }
      alb.save(); trace(alb, pts); alb.clip();
      alb.fillStyle = leafColor; alb.fillRect(...box);
      if (pat) {
        alb.globalCompositeOperation = 'multiply'; alb.globalAlpha = 0.42; alb.fillStyle = pat; alb.fillRect(...box);
        alb.globalCompositeOperation = 'screen';   alb.globalAlpha = 0.42; alb.fillStyle = pat; alb.fillRect(...box);
      } else {
        alb.translate(cx, cy); alb.rotate(rot * 1.7 + fi);
        alb.globalCompositeOperation = 'multiply'; alb.globalAlpha = 0.40;
        alb.drawImage(foilMap, -128 * k, -128 * k, 256 * k, 256 * k);
      }
      alb.restore();

      // METALNESS + ROUGHNESS: absolute greys inside the shard → it goes metal & glossy.
      met.save(); trace(met, pts); met.clip(); met.fillStyle = metFill; met.fillRect(...box); met.restore();
      rou.save(); trace(rou, pts); rou.clip(); rou.fillStyle = rouFill; rou.fillRect(...box); rou.restore();
      // EMISSIVE MASK: the shard glows (material.emissive tints it gold) → luminous foil.
      if (emi) { emi.save(); trace(emi, pts); emi.clip(); emi.fillStyle = '#ffffff'; emi.fillRect(...box); emi.restore(); }
    }
  });
}
