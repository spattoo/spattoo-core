import { describe, it, expect } from 'vitest';
import { projectPoint, previewSegments, PREVIEW_CAMERA } from './studioPreview.js';
import { GRID, WALL, gridLineCount } from './reel/takeGrid.js';
import { CAMERA_POSITION } from './constants.js';

const W = 260, H = 150;

describe('projectPoint — a pinhole at the designer’s own eye', () => {
  it('looks at the origin, so the origin lands dead centre', () => {
    const [x, y] = projectPoint([0, 0, 0], W, H);
    expect(x).toBeCloseTo(W / 2, 6);
    expect(y).toBeCloseTo(H / 2, 6);
  });

  it('puts +x to the right and +y up', () => {
    const [rx] = projectPoint([1, 0, 0], W, H);
    const [, uy] = projectPoint([0, 1, 0], W, H);
    expect(rx).toBeGreaterThan(W / 2);
    expect(uy).toBeLessThan(H / 2);                 // screen y grows downward
  });

  /* Further away is smaller — the one property that makes a flat drawing read as a floor. */
  it('converges with distance', () => {
    const near = projectPoint([1, 0, 4], W, H)[0] - W / 2;
    const far = projectPoint([1, 0, -4], W, H)[0] - W / 2;
    expect(Math.abs(far)).toBeLessThan(Math.abs(near));
  });

  it('refuses a point behind the eye rather than drawing it mirrored', () => {
    expect(projectPoint([0, 0, CAMERA_POSITION[2] + 5], W, H)).toBe(null);
  });

  it('uses the designer’s resting camera, not one of its own', () => {
    expect(PREVIEW_CAMERA.eye).toBe(CAMERA_POSITION);
  });
});

describe('previewSegments — the scene’s own lines, projected', () => {
  it('draws nothing when nothing is on', () => {
    expect(previewSegments({ w: W, h: H })).toEqual({ floor: [], wall: [] });
  });

  it('draws the floor the scene draws, line for line', () => {
    const { floor, wall } = previewSegments({ floor: true, w: W, h: H });
    expect(wall).toEqual([]);
    /* Every line is in front of this camera, so none is dropped — which also means a future
       change to GRID.extent reaches this box without anybody remembering it should. */
    expect(floor).toHaveLength(gridLineCount(GRID));
  });

  it('draws the wall only when asked', () => {
    const { floor, wall } = previewSegments({ wall: true, w: W, h: H });
    expect(floor).toEqual([]);
    expect(wall.length).toBeGreaterThan(0);
  });

  /* ⚠️ THE WALL STANDS AT `WALL.distance`, AND THIS PINS THE BUG THAT PUT IT SOMEWHERE ELSE. The
     first version placed it at `(GRID.extent / 2) * WALL_RELATIVE` — an OPACITY constant used as a
     distance — which drew it through the middle of the floor and looked entirely plausible. The
     scene's own note: "it stands on the far edge of the floor grid, so the two meet in a corner
     rather than one hovering in front of the other." */
  it('stands the wall on the floor’s far edge, not inside it', () => {
    const { wall } = previewSegments({ wall: true, w: W, h: H });
    const foot = projectPoint([0, 0, -WALL.distance], W, H);
    const lowest = Math.max(...wall.map(([, y1, , y2]) => Math.max(y1, y2)));
    // The bottom of the wall is the floor's far edge: nothing in it is drawn below that line.
    expect(lowest).toBeCloseTo(foot[1], 4);
    // And it really is the far edge, not a wall halfway across the floor.
    const farEdge = projectPoint([0, 0, -GRID.extent / 2], W, H);
    expect(foot[1]).toBeCloseTo(farEdge[1], 6);
  });

  it('is empty rather than NaN when it has no box to draw in', () => {
    expect(previewSegments({ floor: true, wall: true, w: 0, h: 0 })).toEqual({ floor: [], wall: [] });
  });
});
