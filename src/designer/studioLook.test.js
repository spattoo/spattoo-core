import { describe, it, expect } from 'vitest';
import { STUDIO_LOOK_DEFAULT, normaliseStudioLook, hasStudioLook, studioRoomFrom, takeSeedFrom, studioLookPayload, studioInk } from './studioLook.js';
import { luminanceOf } from './reel/reelCaption.js';
import { BACKDROP_DEFAULT, BACKDROP_STRENGTH_DEFAULT } from './reel/takeBackdrop.js';
import { STRENGTH_DEFAULT as GRID_STRENGTH_DEFAULT, STRENGTH_MIN } from './reel/takeGrid.js';

const DESIGNER_GROUND = '#f2efe9';

describe('normaliseStudioLook — it crosses a wire, so nothing is trusted', () => {
  it('nothing chosen is the plain room, not a colour that looks like it', () => {
    expect(normaliseStudioLook(null).ground).toBe(null);
    expect(normaliseStudioLook(undefined)).toEqual(STUDIO_LOOK_DEFAULT);
    expect(normaliseStudioLook('not an object')).toEqual(STUDIO_LOOK_DEFAULT);
  });

  it('keeps a real choice', () => {
    const l = normaliseStudioLook({ ground: '#2B2B2B', backdrop: 'sweep', backdropStrength: 0.3,
                                    grid: true, gridWall: true, gridStrength: 0.8 });
    expect(l).toEqual({ ground: '#2b2b2b', backdrop: 'sweep', backdropStrength: 0.3,
                        grid: true, gridWall: true, gridStrength: 0.8 });
  });

  it('refuses anything that is not a hex colour', () => {
    for (const bad of ['red', '#abc', '#12345g', '', 0, {}, ['#ffffff']]) {
      expect(normaliseStudioLook({ ground: bad }).ground).toBe(null);
    }
  });

  it('refuses a backdrop nobody offers', () => {
    expect(normaliseStudioLook({ ground: '#ffffff', backdrop: 'hologram' }).backdrop)
      .toBe(BACKDROP_DEFAULT);
  });

  /* ⚠️ ONE BAD FIELD MUST NOT DISCARD THE CHOICE. Falling back wholesale would turn a half-written
     row into "this baker never chose anything", which is the one answer that is certainly wrong. */
  it('falls back field by field, keeping what is good', () => {
    const l = normaliseStudioLook({ ground: '#2b2b2b', backdrop: 'nope', backdropStrength: 'x',
                                    gridStrength: 99 });
    expect(l.ground).toBe('#2b2b2b');
    expect(l.backdrop).toBe(BACKDROP_DEFAULT);
    expect(l.backdropStrength).toBe(BACKDROP_STRENGTH_DEFAULT);
    expect(l.gridStrength).toBe(1);                   // clamped, not discarded
  });

  it('clamps the dials rather than handing NaN to a material', () => {
    expect(normaliseStudioLook({ backdropStrength: -4 }).backdropStrength).toBe(0);
    expect(normaliseStudioLook({ backdropStrength: 4 }).backdropStrength).toBe(1);
    expect(normaliseStudioLook({ gridStrength: 0 }).gridStrength).toBe(STRENGTH_MIN);
    expect(normaliseStudioLook({ gridStrength: NaN }).gridStrength).toBe(GRID_STRENGTH_DEFAULT);
  });

  it('treats a truthy non-true as off, because a toggle is a toggle', () => {
    expect(normaliseStudioLook({ grid: 'yes', gridWall: 1 })).toMatchObject({ grid: false, gridWall: false });
  });
});

describe('hasStudioLook — the ground is the switch', () => {
  it('is off until a ground is chosen', () => {
    expect(hasStudioLook(normaliseStudioLook(null))).toBe(false);
    expect(hasStudioLook(normaliseStudioLook({ grid: true, gridWall: true }))).toBe(false);
    expect(hasStudioLook(normaliseStudioLook({ ground: '#2b2b2b' }))).toBe(true);
  });

  /* A grid with no ground would lie on the editing room's painted floor and cross the very horizon
     join it exists to hide — the worst of both rooms. */
  it('a grid alone does not turn the studio on', () => {
    expect(hasStudioLook({ ground: null, grid: true })).toBe(false);
  });
});

describe('studioRoomFrom — what the canvas is actually handed', () => {
  it('is the plain room when nothing was chosen', () => {
    expect(studioRoomFrom(null)).toEqual({ ...STUDIO_LOOK_DEFAULT, grid: false, gridWall: false });
  });

  /* ⚠️ THE ROW CAN SAY THIS, SO THE RENDERER MUST NOT. Lines on the editing room's painted floor
     would cross the horizon join the cyclorama exists to hide. */
  it('refuses a grid with no ground, however the row got that way', () => {
    const room = studioRoomFrom({ ground: null, grid: true, gridWall: true, gridStrength: 0.9 });
    expect(room.grid).toBe(false);
    expect(room.gridWall).toBe(false);
    expect(room.ground).toBe(null);
  });

  it('passes a real room through untouched', () => {
    const look = { ground: '#2b2b2b', backdrop: 'pool', backdropStrength: 0.5,
                   grid: true, gridWall: false, gridStrength: 0.7 };
    expect(studioRoomFrom(look)).toEqual(look);
  });
});

describe('takeSeedFrom — where a take STARTS', () => {
  it('a baker who chose nothing gets the take defaults, grid and all', () => {
    const seed = takeSeedFrom(null, DESIGNER_GROUND);
    expect(seed).toEqual({
      ground: DESIGNER_GROUND, backdrop: BACKDROP_DEFAULT,
      backdropStrength: BACKDROP_STRENGTH_DEFAULT,
      grid: true, gridWall: true, gridStrength: GRID_STRENGTH_DEFAULT,
    });
  });

  it('a baker who dressed their studio films in it', () => {
    const look = { ground: '#2b2b2b', backdrop: 'duo', backdropStrength: 0.2,
                   grid: false, gridWall: true, gridStrength: 0.6 };
    expect(takeSeedFrom(look, DESIGNER_GROUND)).toEqual(look);
  });

  /* ⚠️ A GRID TURNED OFF IN SETTINGS STAYS OFF WHEN FILMING. The take's own default is both
     surfaces on; carrying that over a deliberate "no" would be the app overruling a choice the
     baker made on purpose. */
  it('carries a deliberate OFF into the take, rather than the take default', () => {
    const seed = takeSeedFrom({ ground: '#ffffff', grid: false, gridWall: false }, DESIGNER_GROUND);
    expect(seed.grid).toBe(false);
    expect(seed.gridWall).toBe(false);
  });

  it('normalises on the way, so a bad row cannot seed a take with nonsense', () => {
    const seed = takeSeedFrom({ ground: '#ffffff', backdropStrength: 'x' }, DESIGNER_GROUND);
    expect(seed.backdropStrength).toBe(BACKDROP_STRENGTH_DEFAULT);
  });
});

describe('studioLookPayload — what is saved', () => {
  it('sends a normalised look', () => {
    expect(studioLookPayload({ ground: '#ABCDEF', backdrop: 'sweep' }))
      .toMatchObject({ ground: '#abcdef', backdrop: 'sweep' });
  });

  it('clearing the ground saves the default, not a half-cleared row', () => {
    const p = studioLookPayload({ ground: null, grid: true, gridWall: true });
    expect(p).toEqual({ ...STUDIO_LOOK_DEFAULT, ground: null });
  });
});

/* ── The ink the header row reads off ────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS IS WHAT REPLACED A STRIP OF CHROME ACROSS THE STUDIO. The desktop header used to be
 * painted over the top of the canvas so the bakery name and the bell had a ground to sit on.
 * Sandeep: *"removing the white banner for the baker name. lets merge that with studio."* With the
 * band gone those two are bare on whatever the baker chose, so they ink off it instead — and if
 * this ever returns the wrong end of the scale, the name and the bell disappear into the wall and
 * no test anywhere else would notice.
 */
describe('the header row inks off the studio ground', () => {
  it('gives nothing at all for a baker who has chosen no studio', () => {
    expect(studioInk(null)).toBeNull();
    expect(studioInk(undefined)).toBeNull();
    expect(studioInk('')).toBeNull();
  });

  it('is dark ink on a light room and pale ink on a dark one', () => {
    const light = studioInk('#fbf3e7').chrome;
    const dark = studioInk('#2b2b2b').chrome;
    expect(luminanceOf(light), 'dark ink on a light ground').toBeLessThan(0.3);
    expect(luminanceOf(dark), 'pale ink on a dark ground').toBeGreaterThan(0.7);
  });

  /* ⚠️ MEASURED, NOT ASSUMED. The band gave the bell 6.43:1 on #2b2b2b and its removal dropped it
     to 2.01:1 — below the 3:1 an icon needs. Whatever this ink is, it has to clear that bar on the
     grounds a baker can actually pick, or removing the band was a regression wearing a comment. */
  it('clears 3:1 against the ground it was chosen for', () => {
    /* ⚠️ NOT `luminanceOf` — IT IS A THRESHOLD, NOT A CONTRAST. `luminanceOf` weights the sRGB
       values straight, with no gamma linearisation, which is fine for "is this room light or
       dark" and wrong for a ratio: it understates every one of them. Asked with it, a perfectly
       legible pale ink on the mid green #6b8f7e reported 1.72:1 and this test failed on correct
       code. Contrast is defined on LINEARISED luminance, so that is what is computed here. */
    const linear = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(v => v / 255)
        .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [linear(a), linear(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const ground of ['#fbf3e7', '#2b2b2b', '#ffffff', '#000000', '#6b8f7e', '#c8b8a2']) {
      expect(contrast(studioInk(ground).chrome, ground),
             `the header must stay legible on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });

  /* One reading of "is this a dark room" for every piece of ink in the studio: a ground that flips
     the marker must flip the header too, or a mid grey leaves one inked for a room the other is
     not in. */
  it('switches at the same point the floor marker does', () => {
    for (const ground of ['#fbf3e7', '#2b2b2b', '#8c8c8c', '#909090']) {
      const ink = studioInk(ground);
      expect(luminanceOf(ink.chrome) > 0.5).toBe(luminanceOf(ink.marker) > 0.5);
    }
  });
});
