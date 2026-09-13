import { insertionDepth } from './garnishPiece.js';
import { sideSeatOffset, wallClampY, zoneModes } from '../placement.js';
import { isRoundWall, perimeterAtAngle } from './surface.js';

// ── Where a garnish sits on the cake ─────────────────────────────────────────────────────────────
//
// The piece itself is built by `garnishPiece.js` in its own space: centred on x, resting on y = 0.
// This decides where that space goes on the cake, and it is deliberately the ONLY place that
// decides — see the movable contract's first law, "one place says where it is". The renderer applies
// what this returns and adds nothing of its own.
//
// ⚠️ POLAR, NOT CARTESIAN. Position is an angle round the cake and a distance out from the middle,
// because that is the shape of the surface it sits on: a round tier top. Storing x/z instead means
// every rotation of the cake has to rewrite the stored position, and a piece placed near the rim of
// a 6-inch cake ends up off the edge of an 8-inch one. Angle-and-fraction survives both.
//
// ⚠️ `radius` IS A FRACTION of the tier's radius (0 = the middle, 1 = the rim), for the same reason.
// A garnish placed "near the edge" should still be near the edge when the customer changes the tier
// size — which they do, constantly, and which is the bug this shape of storage prevents.

export const GARNISH_DEFAULTS = {
  /* ⚠️ π/2 IS THE FRONT OF THE CAKE, and a new piece belongs there. Pieces face outward from the
   * middle, so one placed at angle 0 — the right-hand side — arrives EDGE-ON to a customer looking
   * at the front, a sliver they have to rotate the cake to see. The first sight of a piece you just
   * drew should be the piece, not its edge. */
  theta: Math.PI / 2,     // radians round the cake; π/2 faces the default camera
  radius: 0.55,      // fraction of the tier radius, 0 = centre
  yaw: 0,            // the piece's own turn about vertical, on top of facing outward
  mode: 'stand',     // 'stand' | 'lie'
  /* On a WALL (zone 'side'): the piece's centre height as a fraction of the wall, 0 = base, 1 = rim.
     A fraction for the same reason `radius` is one — a tier gets taller and shorter, and a piece
     placed halfway up should stay halfway up. */
  height: 0.5,
  /* Which tier it sits on. Absent means the TOP — see Garnishes.jsx: every piece placed before tiers
     were understood was on the top, and defaulting to zero would move all of them down the cake. */
  tierIndex: null,
  scale: 1,
};

/* How close to the rim a piece may be pushed. A standing garnish has a footprint and a lean; put its
 * anchor exactly on the rim and half of it hangs over air, which reads as an accident rather than a
 * flourish. Kept as a fraction so it scales with the tier. */
const RIM_INSET = 0.88;

export const clampRadius = r => Math.max(0, Math.min(RIM_INSET, r));
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));

// ── Where a garnish MAY go, from config ──────────────────────────────────────────────────────────
//
// ⚠️ THE CHOICES ARE DATA, not two lists typed into the studio and the card. They come from the
// garnish tool's row: `placement_config.chocolate_garnish`, in the shape every other element uses for
// a zone — `{ "top_surface": { "modes": ["stand", "hug"] } }`, first mode the default (PLACEMENT_CONFIG.md
// §2). An admin adds or removes a place, or a pose, in Manage Elements; no deploy.
//
// ⚠️ A BLOCK OF ITS OWN, not the row's top-level zone keys. The row was made in Add Element, which
// writes EVERY zone as `hug` by default — read those and every garnish would silently lose Standing.
// A tool reading its config from a key named after it is the pattern `card_topper` and
// `number_topper` already follow.
//
// ⚠️ SEEDED HERE, overlaid from the row. No block (every row today) keeps the seed; a block that names
// any zone IS the list, so a place left out of it is not offered.
//
// Stored values stay what saved cakes already hold: `zone` top | side | board, `mode` stand | lie.
// Config speaks the shared vocabulary — `hug` is lying flat against a surface — and is mapped here, once.
export const GARNISH_ZONES = [
  { id: 'top',   key: 'top_surface', label: 'On the cake' },
  { id: 'side',  key: 'side',        label: 'On the side' },
  { id: 'board', key: 'board',       label: 'On the board' },
];
const POSE_OF_MODE = { stand: 'stand', hug: 'lie' };

/* A piece on the wall can only lie against it: standing has no meaning on a vertical surface. */
export const GARNISH_PLACEMENT_SEED = {
  top_surface: { modes: ['stand', 'hug'] },
  side:        { modes: ['hug'] },
  board:       { modes: ['stand', 'hug'] },
};

const poseLabel = (zone, pose) => (pose === 'stand' ? 'Standing'
  : zone === 'side' ? 'Flat against the side' : 'Lying flat');

/** block — `placement_config.chocolate_garnish`, or null. → { zones: [{ id, key, label, modes: [{ id, label }] }], authored } */
export function garnishPlacementOptions(block) {
  const authored = !!block && typeof block === 'object' && GARNISH_ZONES.some(z => block[z.key] != null);
  const source = authored ? block : GARNISH_PLACEMENT_SEED;
  const zones = GARNISH_ZONES.map(z => {
    const poses = zoneModes(source, z.key).map(m => POSE_OF_MODE[m]).filter(Boolean);
    const modes = [...new Set(poses)].map(id => ({ id, label: poseLabel(z.id, id) }));
    return modes.length ? { ...z, modes } : null;
  }).filter(Boolean);
  // An authored block that names nothing a garnish can do is a mistake, not "place it nowhere".
  if (!zones.length) return authored ? { ...garnishPlacementOptions(null), authored: false } : { zones: [], authored };
  return { zones, authored };
}

/* A zone and pose the options actually allow — the ONE place a pick, a zone switch and a stale saved
   value are all validated, so none of them can place a piece somewhere the element no longer offers. */
export function garnishSeat(options, zone, mode) {
  const zones = options?.zones ?? [];
  const z = zones.find(x => x.id === zone) ?? zones[0];
  if (!z) return { zone, mode };
  const m = z.modes.find(x => x.id === mode) ?? z.modes[0];
  return { zone: z.id, mode: m.id };
}

/* How a placed piece is described to the baker who has to make it — the printed X-ray sheet and the
   screen read this one sentence, so they cannot describe the same piece two ways. */
export function garnishWhere(g) {
  if (g?.zone === 'side') return 'On the side of the tier, pressed flat against it';
  return `${g?.zone === 'board' ? 'On the board' : 'On the top tier'}, ${g?.mode === 'stand' ? 'standing up' : 'lying flat'}`;
}

/**
 * params  { theta, radius, yaw, mode, scale }
 * cake    { radius, topY, boardY }
 * piece   { w, h, sink } — the built piece's size, so a standing one can be buried the right depth.
 *          `sink` is an EXPLICIT bury in world units, for a piece that carries its own answer: a card
 *          topper on a stick is pushed in as far as the baker said, not by a fraction of its height.
 *          Absent — which is every garnish — keeps the computed depth, so nothing else moves.
 *
 * Returns everything the renderer needs and nothing it has to compute:
 *   position  [x, y, z] for the piece's own origin (bottom-centre)
 *   rotation  [rx, ry, rz]
 *   anchors   the footprint corners in world space — what the movable contract measures
 */
export function garnishPlacement(params, cake, piece = { w: 0.6, h: 0.5 }) {
  const p = { ...GARNISH_DEFAULTS, ...params };
  if (p.zone === 'side') return wallPlacement(p, cake, piece);
  const r = clampRadius(p.radius) * cake.radius;
  const x = Math.cos(p.theta) * r;
  const z = Math.sin(p.theta) * r;
  const rope = Math.max(0.004, (piece.h ?? 0.5) * 0.03);

  /* ⚠️ FACING OUTWARD IS THE DEFAULT, and `yaw` is added ON TOP of it rather than replacing it. A
   * standing garnish is meant to be seen: square-on from where the customer is looking, which for a
   * piece at angle θ means turning to face away from the middle. Storing an absolute yaw instead
   * means every piece has to be re-aimed by hand after it is moved round the cake. */
  /* ⚠️ IT KEEPS FACING THE FRONT; IT DOES NOT AIM ITSELF. The piece is built in the XY plane, so its
   * face already looks along +Z — the way the customer is looking — and a yaw of 0 is front-on.
   *
   * It used to turn to face outward from the middle (π/2 − θ), which is defensible on paper and wrong
   * in the hand: dragging a piece round the cake SPUN it, so the thing being positioned kept changing
   * which way it pointed while you positioned it. Most pieces are meant to be seen from the front, and
   * the ones that are not are a deliberate choice — which is what `yaw` is for. Aiming automatically
   * took that choice away and charged for it with a moving target. */
  const facing = 0;

  const scaled = { w: (piece.w ?? 0.6) * p.scale, h: (piece.h ?? 0.5) * p.scale };

  if (p.mode === 'stand') {
    return {
      /* ⚠️ SEATED BY THE BOTTOM OF WHAT GOES IN, which for a stick is the stick's END and not the
         card's edge. `sink` is how deep that end goes; seating by the card instead and letting the
         stick dangle would make "how far into the cake" change nothing anybody can see. */
      position: [x, cake.topY - (Number.isFinite(piece.sink) ? piece.sink : insertionDepth(scaled.h, rope)), z],
      rotation: [0, facing + p.yaw, 0],
      anchors: footprint(x, z, scaled.w, 0, facing + p.yaw, cake.topY, scaled.h),
    };
  }
  /* Lying flat: the piece's own "up" becomes the surface normal, and it rests ON the surface by a
     rope's radius rather than half-sunk in it.

     ⚠️ AND IT MUST BE CENTRED ON ITS ANCHOR, WHICH IT WAS NOT. The geometry has a BOTTOM-CENTRE
     origin — right for a standing piece, which has to turn about the point where it meets the cake.
     Laid flat, that same origin puts the anchor at the piece's EDGE: the mesh extends its whole
     height away from where the design says it is. `footprint` below has always described a rectangle
     CENTRED on (x, z), so the mesh and the contract disagreed about where the piece was — the rim
     clamp kept the anchor on the cake while the piece itself hung off it, and a piece far enough out
     simply vanished over the edge. A small piece near the middle looked fine, which is why this
     survived: two pieces rendered correctly and the third was gone.

     Where does it extend? With Euler order XYZ the world vector is Rx·Ry·Rz·v, so the piece's local
     +Y goes Rz(yaw) → (−sin, cos, 0), then Rx(−90°) → (−sin yaw, 0, −cos yaw). Stepping the anchor
     back by half a height along that direction puts the piece's middle on (x, z), which is what
     everything else already assumed. */
  const half = scaled.h / 2;
  const yaw = facing + p.yaw;
  return {
    position: [x + half * Math.sin(yaw), cake.topY + rope, z + half * Math.cos(yaw)],
    rotation: [-Math.PI / 2, 0, yaw],
    anchors: footprint(x, z, scaled.w, scaled.h, yaw, cake.topY, 0),
  };
}

// ── Pressed flat against a tier wall ─────────────────────────────────────────────────────────────
//
// cake  { radius, baseY, height, shape?, clearance? } — `shape` from tierShape (absent = round), and
//       `clearance(yBottom, yTop)` the renderer's answer to "how far out must something spanning this
//       clear the piping on this tier" (INVARIANTS #3b). A function rather than the bands themselves so
//       this file stays free of the renderer's GLB-measuring modules; absent means a bare wall.
// piece { w, h, d } — the RENDERED size (the build already applied the piece's scale).
//
// Returns position/rotation for the group, `wall` for the vertex wrap (garnishWall.js), and anchors.
function wallPlacement(p, cake, piece) {
  const w = piece.w ?? 0.6, h = piece.h ?? 0.5, d = piece.d ?? 0;
  const spin = p.yaw ?? 0;
  // A turned piece reaches further up/down (and less along the wall) than an upright one.
  const c = Math.abs(Math.cos(spin)), sn = Math.abs(Math.sin(spin));
  const halfV = (sn * w + c * h) / 2;
  const baseY = cake.baseY ?? 0, wallH = cake.height ?? 1;
  /* The wall keeps the whole piece: its centre is clamped so neither edge leaves the band between the
     base and the rim — the same helper, and the same rule, a side sticker is held by. */
  const y = wallClampY(baseY + clamp01(p.height) * wallH, baseY, wallH, halfV, halfV);
  const clear = typeof cake.clearance === 'function' ? cake.clearance(y - halfV, y + halfV) : 0;
  /* Seated by its BACK: the wall gap every side decoration uses, half the piece's thickness so its
     back face rather than its middle meets the wall, and whatever piping it has to ride over. */
  const off = sideSeatOffset(cake.radius) + d / 2 + clear;

  let x, z, faceYaw, bend;
  if (!cake.shape || isRoundWall(cake.shape)) {
    const r = cake.radius + off;
    x = Math.cos(p.theta) * r;
    z = Math.sin(p.theta) * r;
    /* Facing OUTWARD. The piece looks along +Z; a Y-turn of φ sends that to (sin φ, cos φ), which is
       the outward direction (cos θ, sin θ) when φ = π/2 − θ. On a wall this is not a style choice as it
       was on the top — a piece facing anywhere else would stick out of the cake. */
    faceYaw = Math.PI / 2 - p.theta;
    bend = r;
  } else {
    // A sheet or outline wall: flat against the face the angle points at, no bend.
    const pl = perimeterAtAngle(cake.shape, p.theta, off);
    x = pl.x; z = pl.z; faceYaw = pl.yaw; bend = 0;
  }
  return {
    position: [x, y, z],
    rotation: [0, faceYaw, 0],
    wall: { height: h, spin, radius: bend },
    anchors: wallCorners(x, y, z, faceYaw, w, h, spin),
  };
}

/* The piece's four corners in the wall's tangent plane — what the contract measures. */
function wallCorners(x, y, z, faceYaw, w, h, spin) {
  const tx = Math.cos(faceYaw), tz = -Math.sin(faceYaw);   // the piece's local +X after facing out
  const c = Math.cos(spin), s = Math.sin(spin);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([a, b]) => {
    const along = a * c - b * s, up = a * s + b * c;
    return { x: x + tx * along, y: y + up, z: z + tz * along };
  });
}

/* The four corners the contract measures. For a standing piece that is a vertical rectangle; for a
 * lying one a horizontal one. Returned as {x,y,z} because that is what the contract's spread and
 * centroid helpers read. */
function footprint(x, z, w, depth, yaw, surfaceY, height) {
  const hw = w / 2, hd = (depth || 0) / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const pts = [];
  for (const [dx, dz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
    pts.push({ x: x + dx * c - dz * s, y: surfaceY, z: z + dx * s + dz * c });
    if (height) pts.push({ x: x + dx * c - dz * s, y: surfaceY + height, z: z + dx * s + dz * c });
  }
  return pts;
}

/**
 * Drag: a target expressed as (u round the cake, v out from the middle), each 0–1, because that is
 * what a pointer on a round surface gives you.
 *
 * ⚠️ IT RETURNS NEW PARAMS, never a mutated copy, and it is the same function the movable contract
 * exercises — so "where the drag puts it" and "where the renderer draws it" cannot drift apart.
 */
export function garnishDragTo(params, cake, u, v) {
  /* ⚠️ RETURNS ONLY THE KEYS IT CHANGES — the caller merges. Not a whole params object, and above
     all not one built on GARNISH_DEFAULTS, which is how the first version was written: a drag then
     also rewrote `scale`, `mode` and `yaw`, so moving a piece you had enlarged, laid flat or turned
     put it silently back to standing, unturned and original size. That is the cloud's old bug in a
     new coat — it SHRANK as it was dragged toward the rim. The movable contract failed this on the
     first run, which is the whole reason it exists. `cloudDragTo` returns a partial for the same
     reason; follow it rather than inventing a second convention. */
  /* On a wall the second freedom is UP the wall, not out from the middle — so `v` is a height. */
  if (params?.zone === 'side') return { theta: u * Math.PI * 2, height: clamp01(v) };
  return { theta: u * Math.PI * 2, radius: clampRadius(v) };
}

// ── A fan: one piece, repeated round an arc ──────────────────────────────────────────────────────
//
// The reference cakes do not place three unrelated garnishes; they place ONE piece several times at
// even angles, which is why the result looks deliberate. A hand-placed arc of five never comes out
// even — the eye catches a two-degree error immediately on a repeated shape — so the arrangement is
// generated rather than nudged.
//
// ⚠️ THE YAW TURNS WITH THE ARC, and this is what separates a fan from a row. Spread only the angle
// round the cake and every copy still faces the same way, so five pieces read as five pieces in a
// line that happens to curve. Turning each one by its own share of the spread makes them splay from
// a common centre, which is the shape a fan actually is.
//
// ⚠️ THE ORIGINAL IS INCLUDED AND MOVES. A fan is symmetric about where the piece already sits, so
// the piece that was there ends up as the MIDDLE of the arc rather than one end of it — otherwise
// asking for five sends the whole arrangement off to one side of where it was aimed.

/**
 * base    the placed garnish being repeated — `{ theta, yaw, … }`
 * count   how many pieces the fan ends up with, including the original (2 or more)
 * spread  the total angle the arc covers, in radians
 *
 * Returns `count` placement patches, in order round the arc.
 */
export function fanPlacements(base, count, spread) {
  const n = Math.max(2, Math.round(count));
  const theta0 = base?.theta ?? 0;
  const yaw0 = base?.yaw ?? 0;
  // Evenly across the arc, centred on where the piece already sits: -spread/2 … +spread/2.
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;     // -0.5 … +0.5
    /* ⚠️ ON A WALL THE ARC DOES NOT SPLAY. There Turn spins a piece within the wall, so splaying would
       make a pinwheel of copies rather than a band of them round the side. */
    if (base?.zone === 'side') return { theta: theta0 + spread * t };
    return { theta: theta0 + spread * t, yaw: yaw0 + spread * t };
  });
}
