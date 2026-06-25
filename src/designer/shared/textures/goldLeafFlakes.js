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

export const GOLD_LEAF_DEFAULTS = {
  metalness: 0.55,        // metallic SHEEN, but low enough that the gold albedo still reads bright
  roughness: 0.22,        // low → glossy shine (sells "foil", not matte paint)
  env: 2.0,               // envMapIntensity — how hard it reflects the room
  crinkle: 0.7,           // reserved for a future bound crinkle normal (M4)
  sizeScale: 1.0,         // global flake-size multiplier
  raggedness: 0.55,       // 0 = round blob, 1 = very torn/spiky shard
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

// Stamp every flake (each {u, v, rot, size, seed}) onto the supplied canvas 2D contexts. Albedo = bright
// gold/silver with a gentle foil crinkle (soft fold shadows + bright sparkle); metalness/roughness =
// ABSOLUTE greys on the shard so it goes metal over the matte base.
export function stampFoilFlakes({
  alb, met, rou, Wc, Hc, height = 2.2, leafColor = GOLD_LEAF_COLORS.gold,
  metalness = GOLD_LEAF_DEFAULTS.metalness, roughness = GOLD_LEAF_DEFAULTS.roughness,
  sizeScale = 1, raggedness = GOLD_LEAF_DEFAULTS.raggedness, flakes = [], seed = 99,
}) {
  const pxPerWorld = Hc / height;
  // Shared foil crinkle tile — reuse the approved gold-leaf texture as each shard's interior. Cached by
  // seed at module scope: the crinkle is identical every rebuild, so we must NOT re-run the fbm noise on
  // every drag frame (that made dragging lag). Only the cheap per-flake stamping repeats.
  const foilMap = foilCrinkleTile(seed);
  const metFill = gray(metalness), rouFill = gray(roughness);

  flakes.forEach((f, fi) => {
    const worldRad = 0.2 * (f.size ?? 1) * sizeScale;   // a default shard reads as a torn piece, not a dot
    const radPx = Math.max(3, worldRad * pxPerWorld);
    const cx0 = (f.u ?? 0.5) * Wc;
    const cy = (1 - (f.v ?? 0.5)) * Hc;          // invert Y → flake lands under the tap
    const rot = (f.rot ?? 0) * Math.PI / 180;
    const fseed = ((f.seed ?? 1) * 2654435761 + fi * 40503) >>> 0;
    // Wrap the back seam: a flake near u=0/1 also stamps a copy one circumference over.
    const xs = cx0 < radPx * 2 ? [cx0, cx0 + Wc]
             : cx0 > Wc - radPx * 2 ? [cx0, cx0 - Wc] : [cx0];

    for (const cx of xs) {
      const rng = mulberry((fseed + Math.round(cx)) >>> 0);
      const pts = tornPts(cx, cy, radPx, rot, rng, raggedness);
      const box = [cx - radPx * 1.3, cy - radPx * 1.3, radPx * 2.6, radPx * 2.6];
      const k = (radPx * 3.4) / 256;             // foil tile drawn large enough to cover the shard

      // ALBEDO: bright gold fill + a GENTLE crinkle (soft multiply shadows + screen sparkle).
      alb.save(); trace(alb, pts); alb.clip();
      alb.fillStyle = leafColor; alb.fillRect(...box);
      alb.translate(cx, cy); alb.rotate(rot * 1.7 + fi);
      alb.globalCompositeOperation = 'multiply'; alb.globalAlpha = 0.40;
      alb.drawImage(foilMap, -128 * k, -128 * k, 256 * k, 256 * k);
      alb.globalCompositeOperation = 'screen';   alb.globalAlpha = 0.35;
      alb.drawImage(foilMap, -128 * k, -128 * k, 256 * k, 256 * k);
      alb.restore();

      // METALNESS + ROUGHNESS: absolute greys inside the shard → it goes metal & glossy.
      met.save(); trace(met, pts); met.clip(); met.fillStyle = metFill; met.fillRect(...box); met.restore();
      rou.save(); trace(rou, pts); rou.clip(); rou.fillStyle = rouFill; rou.fillRect(...box); rou.restore();
    }
  });
}
