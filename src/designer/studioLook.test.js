import { describe, it, expect } from 'vitest';
import {
  STUDIO_LOOK_DEFAULT, normaliseStudioLook, hasStudioLook, studioRoomFrom, takeSeedFrom,
  studioLookPayload,
} from './studioLook.js';
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
