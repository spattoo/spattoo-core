/* ── The room a baker works in, chosen once and kept ─────────────────────────────────────────────
 *
 * The take panels already let a baker dress the studio for a video: a ground colour, a graded
 * backdrop, a grid floor and a back wall. Each take picked its own, every time, and none of it
 * survived the panel closing. Sandeep: *"now the samething we should also give as baker settings.
 * so a baker can customize the studio. we would save these settings and the baker would see theie
 * selected look&feel."*
 *
 * ⚠️ THIS REVERSES "FILMING ONLY", DELIBERATELY AND BY THE PERSON WHO SAID IT. `takeGrid.js` opens
 * with *"can we have the grid lines for the canvas like in the marketing site? (only for the video
 * capture)"* and concludes **"FILMING ONLY, AND THAT IS NOT A PREFERENCE"**, on two grounds: a
 * baker judging a colour should not be looking at graph paper, and a thumbnail with graph paper in
 * it is not the cake they sold.
 *
 * The second is void and was already void when it was written — `CakeThumbnailScene` renders on
 * `alpha: true` with no ground, no background and no floor, so nothing here can reach a thumbnail
 * or any exported picture. The first stands as a DEFAULT and falls as a rule: a baker who turns
 * the grid on has decided, and the one who never opens this screen still gets the plain room.
 * "Presets are allowed, never forced" — this is the same shape, one level up.
 *
 * ⚠️ `ground: null` IS THE DEFAULT AND MEANS "LEAVE IT ALONE". Not a colour that happens to match
 * today's constants — a null, so the editing room goes on being `studioFloorMaterial`'s painted
 * floor and horizon, and a baker who never touches this sees exactly what they saw yesterday. A
 * look is a thing somebody chose, never a thing they were given.
 *
 * ⚠️ IT IS A PREFERENCE, NOT MASTER DATA. CLAUDE.md rule 3 is about values an ADMIN tunes, and the
 * palette this picks from — `TAKE_GROUNDS`, `BACKDROP_LOOKS` — is exactly that and stays where it
 * is. What a person chose out of it is theirs, stored per baker_appuser the way a rail skin is
 * (migration 120, borrowing 060: *"a tour is a fact about a PERSON, not about a bakery"*).
 */

import { BACKDROP_LOOKS, BACKDROP_STRENGTH_DEFAULT } from './reel/takeBackdrop.js';
/* The studio's own ground, so the default look is the room the designer already paints rather than
   a colour that happens to resemble it — the trap `TAKE_GROUNDS` records above its 'studio' entry. */
import { DESIGNER_GROUND } from './constants.js';
import { STRENGTH_DEFAULT as GRID_STRENGTH_DEFAULT, STRENGTH_MIN as GRID_STRENGTH_MIN } from './reel/takeGrid.js';
/* ⚠️ `luminanceOf` IS REUSED, NOT REWRITTEN. It already carries the sRGB coefficients and the note
   about why green dominates; a second copy here would be the same answer twice, and the one that
   drifts. It lives in reelCaption because a caption needed it first. */
import { luminanceOf } from './reel/reelCaption.js';

/** What a baker who has never opened Settings sees: the studio ground, swept, with a grid floor.
 *
 * ⚠️ THIS REVERSES "A LOOK IS A THING SOMEBODY CHOSE" — the second reversal on this file, and by
 * the same person as the first. Sandeep: *"lets make the floor grid lines default. so the default
 * settings (color, floor lines, line strength) shown in the image are default settings."* The note
 * above still describes why the room used to start plain, and it was right at the time; what
 * changed is the judgement that the grid helps a baker place a cake rather than distracts them.
 *
 * ⚠️ THREE FIELDS MOVED, AND ONLY THREE. `ground` to the studio's own colour (`TAKE_GROUNDS`'
 * 'studio' entry, which exists precisely so picking it leaves the scene as it was), `backdrop` to
 * sweep, `grid` on. Both strengths are untouched because the screen he photographed already had
 * them at their defaults — 0.55 and 0.6 — so changing them would have been inventing a number
 * nobody asked for.
 *
 * ⚠️ `gridWall` STAYS OFF. "Back wall" was not selected in that screenshot, and a wall grid behind
 * the cake is a second decision: `takeGrid.js` notes it reads as stripes on wallpaper at this
 * camera height unless somebody wants it. */
export const STUDIO_LOOK_DEFAULT = Object.freeze({
  ground: DESIGNER_GROUND,
  backdrop: 'sweep',
  backdropStrength: BACKDROP_STRENGTH_DEFAULT,
  grid: true,
  gridWall: false,
  gridStrength: GRID_STRENGTH_DEFAULT,
});

const BACKDROP_KEYS = new Set(BACKDROP_LOOKS.map(l => l.key));
const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (v, lo, hi, fallback) =>
  (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/**
 * Whatever came back from the server, as a look this code can render.
 *
 * ⚠️ EVERY FIELD IS CHECKED, BECAUSE THIS CROSSES A WIRE. It is a jsonb column: an older client, a
 * hand-edited row or a half-written save can put anything in it, and a bad value here does not
 * throw — it paints the room a colour nobody chose, or hands `NaN` to a material. Each field falls
 * back to the default on its own, so one bad key cannot discard a look the baker did choose.
 */
export function normaliseStudioLook(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  /* ⚠️ "NEVER CHOSE" AND "CHOSE NONE" ARE DIFFERENT ANSWERS, and telling them apart is the whole of
     what makes a default possible here. Both used to collapse to null, so `ground` and `grid`
     ignored STUDIO_LOOK_DEFAULT entirely — changing the constant alone would have moved nothing.
     A MISSING key takes the default; a key that is present and empty is a decision and wins. So a
     baker who picks None keeps the plain room, and one who has never opened Settings gets the grid.
     ⚠️ Which makes `studioLookPayload` load-bearing: it has to write these keys EXPLICITLY, or a
     saved "None" comes back as "never chose" and the room they turned off returns. */
  const ground = typeof r.ground === 'string' && HEX.test(r.ground.trim())
    ? r.ground.trim().toLowerCase()
    : ('ground' in r ? null : STUDIO_LOOK_DEFAULT.ground);
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  return {
    ground,
    backdrop: BACKDROP_KEYS.has(r.backdrop) ? r.backdrop : STUDIO_LOOK_DEFAULT.backdrop,
    backdropStrength: clamp(r.backdropStrength, 0, 1, STUDIO_LOOK_DEFAULT.backdropStrength),
    grid: bool(r.grid, STUDIO_LOOK_DEFAULT.grid),
    gridWall: bool(r.gridWall, STUDIO_LOOK_DEFAULT.gridWall),
    gridStrength: clamp(r.gridStrength, GRID_STRENGTH_MIN, 1, STUDIO_LOOK_DEFAULT.gridStrength),
  };
}

/**
 * Has the baker actually dressed the studio?
 *
 * ⚠️ THE GROUND IS THE SWITCH, AND THE GRID RIDES ON IT. A grid with no ground would be lines on
 * the editing room's painted floor, crossing the horizon join they exist to hide — the worst of
 * both rooms. So the swatch is what turns the studio on; everything else dresses it once it is.
 */
export function hasStudioLook(look) {
  return !!look?.ground;
}

/**
 * The look as a ROOM the canvas can be handed: what to paint, and what to draw on it.
 *
 * ⚠️ THE GRID CANNOT OUTLIVE THE GROUND, AND THAT IS ENFORCED HERE RATHER THAN ASKED FOR. A grid
 * with no ground is lines on the editing room's painted floor, crossing the very horizon join the
 * cyclorama exists to hide — the worst of both rooms. The settings screen hides the chips until a
 * swatch is picked, but a stored row can still hold `grid: true, ground: null` (an older save, a
 * baker who cleared the ground), and a rule that lives only in a form is a rule that holds only
 * while somebody is looking at the form.
 */
export function studioRoomFrom(look) {
  const l = normaliseStudioLook(look);
  /* ⚠️ `ground: null` HAS TO BE SPELLED OUT. Spreading the default was right while its ground WAS
     null; now that the default dresses the room, spreading it here handed a ground back to the one
     baker who had just turned the ground off — the plain room with a ground in it. Caught by the
     test, not by reading. */
  if (!hasStudioLook(l)) {
    return { ...STUDIO_LOOK_DEFAULT, ground: null, grid: false, gridWall: false };
  }
  return l;
}

/**
 * The look as the take panels' own starting values.
 *
 * ⚠️ A SEED, NOT A BINDING. A take still has its own controls and they still move freely — this is
 * only where they start, so a baker who has dressed their studio does not re-dress it before every
 * video. `fallbackGround` is what the panel used before any of this (the designer's own ground),
 * kept for the baker who has chosen nothing.
 */
export function takeSeedFrom(look, fallbackGround) {
  const l = normaliseStudioLook(look);
  if (!hasStudioLook(l)) {
    return {
      ground: fallbackGround,
      backdrop: STUDIO_LOOK_DEFAULT.backdrop,
      backdropStrength: STUDIO_LOOK_DEFAULT.backdropStrength,
      // The take's own long-standing defaults — both grid surfaces on, because the video wants them.
      grid: true,
      gridWall: true,
      gridStrength: STUDIO_LOOK_DEFAULT.gridStrength,
    };
  }
  return {
    ground: l.ground,
    backdrop: l.backdrop,
    backdropStrength: l.backdropStrength,
    grid: l.grid,
    gridWall: l.gridWall,
    gridStrength: l.gridStrength,
  };
}

/* ── The two labels that sit ON the ground ───────────────────────────────────────────────────────
 *
 * The FRONT marker (`#8a7a66`, 3D text lying on the floor) and the "Drag to rotate" hint (`#999`)
 * were both tuned against the pale editing floor — the marker's own note records being asked to go
 * "a step darker" on `#e5e2de`. On a dark ground the marker disappears outright, which is how this
 * was found: rendering the thing, not reading it.
 *
 * ⚠️ DERIVED, NOT AUTHORED PER GROUND, and that is a decision worth defending because the rail
 * skins went the other way — every skin carries its own `ink` and a gate measures the ratio,
 * because a 9px label on a mid-oak handle came out at 2.61:1 while every gate stayed green. The
 * difference is what is at stake: those are the app's own navigation labels, and these are two
 * pieces of guidance that a baker reads once and then stops seeing. A derived pair that is
 * occasionally a little low beats a palette somebody has to remember to extend.
 *
 * ⚠️ AND NEITHER IS PURE BLACK OR WHITE. Same reasoning as `captionColours`, which this mirrors:
 * white on near-black glares, black on cream reads as pasted on. Both sit in the warm family the
 * marker already uses, so a baker who turns the studio on does not get a different-looking app.
 */
export function studioInk(ground) {
  if (!ground) return null;                       // the plain room keeps the colours it was tuned with
  return luminanceOf(ground) > 0.55
    ? { marker: '#8a7a66', hint: '#999', chrome: '#333333' }   // a light ground: as it has always been
    : { marker: '#bda98c', hint: '#8f8d88', chrome: '#F3F0EB' };
}

/* ⚠️ `chrome` IS THE HEADER ROW, AND IT IS WHY THE BAND COULD GO. Sandeep: *"removing the white
 * banner for the baker name. lets merge that with studio."* That band was painted over the top of
 * the canvas precisely so the bakery name and the bell would keep a ground to sit on — the note at
 * its render site weighed re-inking against painting, and chose painting because it was THREE
 * surfaces to get right rather than one.
 *
 * It is two now. The credits pill carries its own background and already switches by threshold, so
 * only the name and the bell are bare on the scene, and one more field here is cheaper than a strip
 * of chrome across the studio. Measured on the bell's own bounding box at 1000px: on `#2b2b2b` the
 * band gave 6.43:1 and its removal dropped the bell to 2.01:1, below the 3:1 an icon needs. Inked,
 * it is back above it — which is the whole reason this field exists rather than the band.
 *
 * ⚠️ SAME THRESHOLD AS THE MARKER, DELIBERATELY. One reading of "is this a dark room" for every
 * piece of ink in the studio, or a mid-grey ground flips the marker and not the header and nobody
 * can see why. */

/** What goes over the wire on a save — only the fields the server stores, already normalised. */
export function studioLookPayload(look) {
  const l = normaliseStudioLook(look);
  /* ⚠️ `ground: null` IS WRITTEN, NOT OMITTED. It is how "I turned the studio off" survives a
     reload now that a missing key means "give me the default" — omit it and the next load hands
     them back the very room they switched off. */
  return l.ground ? l : { ...STUDIO_LOOK_DEFAULT, ground: null };
}
