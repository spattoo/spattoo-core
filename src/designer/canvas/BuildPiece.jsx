import { assemblyPose } from '../reel/assemblyTake.js';

/* ── One thing flying in ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE BUILD USED TO ANIMATE STICKERS AND NOTHING ELSE, because the sticker loop is where it was
 * first written and a sticker was the easiest thing to lift. Everything else a baker puts on a cake
 * — the piping rings, the roses (which ARE a piping ring, on an element finish), the gypsophila,
 * the writing, the toppers — is drawn by other components and never saw the pose. Sandeep, filming
 * a rose-ring cake: *"piping elements are not flying. also, few other things like roses in this
 * image are not flying."*
 *
 * So the pose stops being something each renderer applies to itself and becomes a WRAPPER any piece
 * can be put inside. The transform is rigid — a turn about the cake's axis and a translation — so a
 * parent group expresses it exactly, for a GLB, an instanced ring or a line of text alike, with no
 * renderer needing to know the take exists.
 *
 * ⚠️ ALWAYS MOUNTED, AT IDENTITY WHEN NOTHING IS BUILDING. Wrapping only during a take would change
 * the tree shape the moment the take starts and remount every GLB mid-shot — the same trap the
 * sticker wrapper records. A `<group>` at identity costs a matrix nobody looks at.
 *
 * ⚠️ AND IT OWNS THE "NOT YET" CASE. A piece that has not started is not rendered at all rather than
 * faded: a GLB brings its own materials, so fading means reaching into every one of them, where not
 * drawing it is exact and works for anything.
 */
export function BuildPiece({ pose, reach = 1, children }) {
  if (pose && !pose.visible) return null;
  if (!pose) return <group>{children}</group>;

  const { rise, swing, offX, offZ } = pose;
  /* ⚠️ THE OFFSET IS THE GROUP'S OWN POSITION, SO IT IS NOT SWEPT BY THE ROTATION. A child's local
     origin is turned by `rotation`, which is what carries the piece round the cake; the position
     here is applied in the PARENT's frame, so a piece's bearing in stays its own. Rotating the
     offset as well would double-apply the sweep. All four numbers are 0 once it has landed, so the
     take ends on the design exactly as saved. */
  return (
    <group rotation={[0, swing, 0]} position={[offX * reach, rise * reach, offZ * reach]}>
      {children}
    </group>
  );
}

/**
 * The pose-lookup a renderer uses, built once per frame of a build.
 *
 * ⚠️ IDS, NOT ARRAY POSITIONS. A cake's pieces live in a dozen different lists — stickers, the two
 * piping rings per tier, writings, garnishes — so "index 3" means nothing on its own. Each piece
 * names itself (`top:0:layer-7`), the order of that list is the order they were placed, and the
 * index falls out of it. `spread` deals them in that order, which is the honest one: it replays how
 * the cake was actually built.
 */
export function buildLookup(ids, assembly) {
  const order = new Map();
  for (const id of ids) { if (id != null && !order.has(id)) order.set(id, order.size); }
  const count = order.size;
  if (!assembly || count === 0) return { count, poseFor: () => null };
  return {
    count,
    /* `part` is for a piece made of many — a piping ring's shells. The TIMING stays the piece's
       own, so the ring sets off and lands with everything else on the cake; only the direction each
       part comes in on varies, which is what makes the ring FORM in the air instead of arriving
       assembled.
       ⚠️ A NUMBER, AND THE SEED IS DERIVED HERE. The first cut passed the shell's id STRING through
       to `pieceJitter`, which coerces with `Number()` — every shell came out as seed 0, every one
       got the same bearing, and the ring flew in as the same rigid hoop it did before. Mixing the
       piece's own index in keeps two rings on one cake from flying identically. */
    poseFor: (id, part) => {
      const i = order.get(id);
      if (i === undefined) return null;
      const seed = part === undefined ? i : (i * 977 + Math.floor(Number(part) || 0));
      return assemblyPose(i, count, assembly.time, assembly.plan, seed);
    },
  };
}
