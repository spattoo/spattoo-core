import { describe, it, expect } from 'vitest';
import { spinPose, spinTotal, SPIN_DEFAULTS, SPIN_PHASES, TOP_POLAR, TURN_RATE } from './spinTake.js';

const START = Math.PI / 3;          // a plausible resting angle for the designer's camera
const D = SPIN_DEFAULTS;
/* ⚠️ BOUNDARIES DERIVED, NEVER TYPED. These were written against 6/4/3/1 and every one of them had
   to be rewritten the day the shot became 6/1/2/1 — a test that pins the defaults tests the
   defaults, not the behaviour. */
const AT = {
  turnEnd: D.turn,
  riseEnd: D.turn + D.rise,
  topEnd:  D.turn + D.rise + D.top,
  end:     spinTotal(D),
};

describe('the hero spin runs the four phases it is given', () => {
  it('lasts exactly as long as its phases add up to', () => {
    expect(spinTotal(SPIN_DEFAULTS)).toBe(10);      // 6 turning + 1 lifting + 2 on top + 1 back
    expect(spinTotal({ turn: 3, rise: 2, top: 1, back: 1 })).toBe(7);
  });

  it('turns level, without lifting', () => {
    for (const t of [0, 1, 3, AT.turnEnd - 0.1]) {
      expect(spinPose(t, SPIN_DEFAULTS, START).polar).toBeCloseTo(START, 9);
    }
  });

  /* ⚠️ THE TURNTABLE'S OWN PACE, NOT A TIDY REVOLUTION. The first version turned exactly once over
     `turn` seconds — neat arithmetic, and twelve and a half times too fast: OrbitControls at
     `autoRotateSpeed={0.8}` takes SEVENTY FIVE seconds for one lap, so six seconds is about 29°.
     Sandeep: *"you increased the speed. earlier speed was good."* The rate is read off the
     controls' own formula, so a three upgrade that changes it shows up here. */
  it('turns at the speed the turntable always did', () => {
    expect(Math.abs(Math.PI * 2 / TURN_RATE)).toBeCloseTo(75, 6);   // seconds per revolution
    expect(spinPose(0, SPIN_DEFAULTS, START).azimuth).toBeCloseTo(0, 9);
    for (const t of [1, 3, AT.turnEnd]) {
      expect(spinPose(t, SPIN_DEFAULTS, START).azimuth).toBeCloseTo(TURN_RATE * t, 9);
    }
  });

  /* ⚠️ THE SAME WAY ROUND AS autoRotate. `_rotateLeft` SUBTRACTS from theta, so the turntable
     decreases it; the first version added, and the cake turned the other way. Sandeep: *"your
     turning the opposite direction now. it should move from left to right."* */
  it('turns the same way the turntable does', () => {
    expect(TURN_RATE).toBeLessThan(0);
    const a1 = spinPose(1, SPIN_DEFAULTS, START).azimuth;
    const a2 = spinPose(2, SPIN_DEFAULTS, START).azimuth;
    expect(a2).toBeLessThan(a1);
  });

  it('holds the azimuth through the rise and the hold, then unwinds it', () => {
    const turned = TURN_RATE * SPIN_DEFAULTS.turn;
    for (const t of [AT.turnEnd, AT.riseEnd, AT.topEnd - 0.01]) {
      expect(spinPose(t, SPIN_DEFAULTS, START).azimuth).toBeCloseTo(turned, 9);
    }
    // ...and it is genuinely on its way back during the settle, not snapping at the end.
    const mid = spinPose(AT.topEnd + SPIN_DEFAULTS.back / 2, SPIN_DEFAULTS, START).azimuth;
    expect(mid).toBeGreaterThan(turned);
    expect(mid).toBeLessThan(0);
  });

  /* ⚠️ IT UNWINDS TO THE NEAREST WHOLE REVOLUTION, NOT TO ZERO. At six seconds that is the same
     thing — 29° out, 29° back. On a turn long enough to lap, unwinding to zero would spool the cake
     backwards through every revolution it had just made. */
  it('settles to a whole revolution, however long the turn ran', () => {
    for (const turn of [6, 40, 75, 120]) {
      const plan = { ...SPIN_DEFAULTS, turn };
      const { azimuth } = spinPose(spinTotal(plan), plan, START);
      const laps = azimuth / (Math.PI * 2);
      expect(Math.abs(laps - Math.round(laps)), `turn ${turn}s ended mid-revolution`).toBeLessThan(1e-9);
      // Never more than half a turn of unwinding to do.
      expect(Math.abs(azimuth - TURN_RATE * turn)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('lifts to the top over the rise, then holds there', () => {
    expect(spinPose(AT.riseEnd, SPIN_DEFAULTS, START).polar).toBeCloseTo(TOP_POLAR, 6);
    for (const t of [AT.riseEnd, (AT.riseEnd + AT.topEnd) / 2, AT.topEnd - 0.01]) {
      expect(spinPose(t, SPIN_DEFAULTS, START).polar).toBeCloseTo(TOP_POLAR, 6);
    }
    // And it is genuinely on the way up in between, not stepping at the boundary.
    const mid = spinPose(AT.turnEnd + D.rise / 2, SPIN_DEFAULTS, START).polar;
    expect(mid).toBeLessThan(START);
    expect(mid).toBeGreaterThan(TOP_POLAR);
  });

  /* The whole point of the last phase: the take can be cut into anything because it ends where it
     began. A pose that drifts makes every cut after it a jump. */
  it('finishes exactly where it started', () => {
    const end = spinPose(AT.end, SPIN_DEFAULTS, START);
    expect(end.polar).toBeCloseTo(START, 9);
    expect(end.done).toBe(true);
    // And just before the end it is nearly there, rather than snapping on the last frame.
    expect(spinPose(AT.end - 0.1, SPIN_DEFAULTS, START).polar).toBeGreaterThan(START * 0.9);
  });

  /* ⚠️ EASED AT BOTH ENDS OF A MOVE. A linear lift arrives at the top and stops dead, which reads
     as a missed keyframe. Asserted as a property — the move is slower at its ends than its middle —
     rather than by pinning the curve, so smoothstep can be replaced by something better. */
  it('starts and ends its lift gently', () => {
    const p = (t) => spinPose(t, SPIN_DEFAULTS, START).polar;
    const step = D.rise / 10;
    const firstTenth  = Math.abs(p(AT.turnEnd + step) - p(AT.turnEnd));
    const middleTenth = Math.abs(p(AT.turnEnd + D.rise * 0.55) - p(AT.turnEnd + D.rise * 0.45));
    const lastTenth   = Math.abs(p(AT.riseEnd) - p(AT.riseEnd - step));
    expect(middleTenth).toBeGreaterThan(firstTenth * 2);
    expect(middleTenth).toBeGreaterThan(lastTenth * 2);
  });

  it('never dips below the angle it was given, however the phases are set', () => {
    for (const plan of [SPIN_DEFAULTS, { turn: 1, rise: 1, top: 1, back: 1 }, { turn: 9, rise: 0.5, top: 0.5, back: 3 }]) {
      for (let t = 0; t <= spinTotal(plan); t += 0.1) {
        const { polar } = spinPose(t, plan, START);
        expect(polar).toBeLessThanOrEqual(START + 1e-9);
        expect(polar).toBeGreaterThanOrEqual(TOP_POLAR - 1e-9);
      }
    }
  });

  /* ⚠️ A PHASE SET TO ZERO MUST BE SKIPPED, NOT DIVIDED BY. The panel lets every duration go to 0 —
     somebody who wants a plain turntable sets rise, top and back to nothing — and `afterTurn /
     d.rise` is 0/0 there. NaN in a camera angle is a black screen, and nothing says why. */
  it('survives a phase of zero without producing NaN', () => {
    for (const plan of [
      { turn: 0, rise: 4, top: 3, back: 1 },
      { turn: 6, rise: 0, top: 3, back: 1 },
      { turn: 6, rise: 4, top: 0, back: 1 },
      { turn: 6, rise: 4, top: 3, back: 0 },
      { turn: 0, rise: 0, top: 0, back: 0 },
    ]) {
      for (let t = 0; t <= Math.max(1, spinTotal(plan)); t += 0.25) {
        const { azimuth, polar } = spinPose(t, plan, START);
        expect(Number.isFinite(azimuth), `azimuth at ${t} of ${JSON.stringify(plan)}`).toBe(true);
        expect(Number.isFinite(polar), `polar at ${t} of ${JSON.stringify(plan)}`).toBe(true);
      }
    }
  });

  /* The take lifts from wherever the baker left the cake, rather than snapping to an angle of ours
     first — so a cake already viewed from low down rises from low down. */
  it('lifts from the angle it was handed, not from one of ours', () => {
    for (const start of [0.5, 1.0, Math.PI / 2.1]) {
      expect(spinPose(0, SPIN_DEFAULTS, start).polar).toBeCloseTo(start, 9);
      expect(spinPose(AT.end, SPIN_DEFAULTS, start).polar).toBeCloseTo(start, 9);
    }
  });

  /* A camera already ABOVE the top angle must not be driven DOWNWARD by the "rise" — the phase is
     named for what it does, and a take that sinks on a top-down cake is the opposite of the shot. */
  it('does not push a camera that is already overhead back down', () => {
    const start = 0.05;                        // already nearer the pole than TOP_POLAR
    for (let t = 0; t <= 14; t += 0.5) {
      expect(spinPose(t, SPIN_DEFAULTS, start).polar).toBeLessThanOrEqual(start + 1e-9);
    }
  });

  it('names its phases once, so the total and the pose cannot disagree', () => {
    expect(SPIN_PHASES).toEqual(['turn', 'rise', 'top', 'back']);
    expect(Object.keys(SPIN_DEFAULTS).sort()).toEqual([...SPIN_PHASES].sort());
  });
});
