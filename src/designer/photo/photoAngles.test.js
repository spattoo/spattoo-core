import { describe, it, expect } from 'vitest';
import { PHOTO_ANGLES, DEFAULT_ANGLE, angleByKey, anglePosition, angleAt } from './photoAngles.js';

const T = { x: 0, y: 1.55, z: 0 };
const radiusOf = p => Math.hypot(p.x - T.x, p.y - T.y, p.z - T.z);

describe('the angles on offer', () => {
  it('defaults to three-quarter — the only one that shows front, side and top at once', () => {
    expect(DEFAULT_ANGLE).toBe('three-quarter');
    expect(angleByKey(undefined).key).toBe('three-quarter');
    expect(angleByKey('nonsense').key).toBe('three-quarter');
  });

  it('offers no view of the BACK of a cake', () => {
    // The back is the join, the smudge and the side the baker iced last. Offering it guarantees
    // somebody eventually photographs one by accident.
    for (const a of PHOTO_ANGLES) {
      const wrapped = ((a.theta % 360) + 360) % 360;
      expect(wrapped < 100 || wrapped > 260, `${a.key} at ${a.theta}°`).toBe(true);
    }
  });

  it('never looks up at a cake from underneath', () => {
    // phi > 90 is below the subject. A cake photographed from below is a photograph of a board.
    for (const a of PHOTO_ANGLES) expect(a.phi, a.key).toBeLessThanOrEqual(90);
  });

  it('every angle carries a reason a baker can act on', () => {
    for (const a of PHOTO_ANGLES) {
      expect(a.label, a.key).toBeTruthy();
      expect(a.hint, a.key).toBeTruthy();
    }
  });
});

describe('anglePosition', () => {
  it('⚠️ KEEPS THE RADIUS — a preset walks around the cake, it does not re-zoom', () => {
    // Tapping an angle after pinching in must keep the framing the baker chose. A preset that also
    // reset the distance would undo half their work every time they tried the other side.
    for (const a of PHOTO_ANGLES) {
      expect(radiusOf(anglePosition(T, 6.2, a.theta, a.phi)), a.key).toBeCloseTo(6.2, 6);
    }
  });

  it('puts the front angle in front of the cake, on +Z', () => {
    // +Z is the designer's front — the axis FrontMarker sits on.
    const p = anglePosition(T, 5, 0, 90);
    expect(p.z).toBeCloseTo(5, 6);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(T.y, 6);
  });

  it('puts the side angle to the side, and above above', () => {
    const side = anglePosition(T, 5, 90, 90);
    expect(side.x).toBeCloseTo(5, 6);
    expect(side.z).toBeCloseTo(0, 6);

    const above = anglePosition(T, 5, 0, 26);
    expect(above.y).toBeGreaterThan(T.y + 4);      // well over the cake
  });

  it('orbits the TARGET, not the world origin', () => {
    const off = { x: 3, y: 2, z: -1 };
    expect(radiusOf({ ...anglePosition(off, 4, 38, 72) })).not.toBeCloseTo(4, 1);  // sanity: T ≠ off
    const p = anglePosition(off, 4, 38, 72);
    expect(Math.hypot(p.x - off.x, p.y - off.y, p.z - off.z)).toBeCloseTo(4, 6);
  });

  it('⚠️ clamps off the poles rather than degenerating the view', () => {
    // At phi 0 the up-vector and the view direction are parallel, the view matrix degenerates, and
    // the picture flips or goes blank depending on the driver.
    const top = anglePosition(T, 5, 0, 0);
    expect(top.y).toBeLessThan(T.y + 5);            // pulled off the pole
    expect(Math.hypot(top.x, top.z)).toBeGreaterThan(0.1);
    expect(radiusOf(top)).toBeCloseTo(5, 6);        // and still at the right distance
  });

  it('survives junk rather than returning NaN', () => {
    const p = anglePosition(null, 0, undefined, undefined);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  });
});

describe('angleAt', () => {
  it('recognises the camera sitting on a preset', () => {
    for (const a of PHOTO_ANGLES) {
      expect(angleAt(T, anglePosition(T, 5, a.theta, a.phi)), a.key).toBe(a.key);
    }
  });

  it('⚠️ goes null once the baker has dragged away', () => {
    // A preset that stays lit after a drag claims the shot is the one it names. The whole promise
    // here is that the preview is the truth.
    expect(angleAt(T, anglePosition(T, 5, 150, 60))).toBe(null);
  });

  it('tolerates a nudge, so reaching for a swatch does not blank the row', () => {
    const a = PHOTO_ANGLES[1];
    expect(angleAt(T, anglePosition(T, 5, a.theta + 3, a.phi - 2))).toBe(a.key);
  });

  it('wraps around 360° rather than treating 359° and 1° as far apart', () => {
    expect(angleAt(T, anglePosition(T, 5, 358, 78))).toBe('front');
  });

  it('does not throw on a camera sitting exactly on the target', () => {
    expect(angleAt(T, { ...T })).toBe(null);
  });
});
