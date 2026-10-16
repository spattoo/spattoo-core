import { describe, it, expect } from 'vitest';
import { curveForArc, archTextPath, textPathFor, WARP_SWEEP_AT_ONE } from './textPath.js';
import { RAINBOW_DEFAULTS, rainbowBands } from './rainbow.js';

const CAKE = { radius: 1.2, topY: 1.5, boardY: 0 };

describe('curveForArc — the mapping into warpArc\'s amount', () => {
  /* ⚠️ warpArc does `theta = |k| * 2.2` and then `R = W / theta`, so its amount is a SWEEP, not a
     radius. These pin the inverse, because reading it as a radius renders text that looks almost
     right and tracks nothing. */
  it('asks for the angle the text subtends, not its radius', () => {
    // half a radian of text on any circle is the same amount of bend
    expect(curveForArc(1, 2)).toBeCloseTo(-0.5 / WARP_SWEEP_AT_ONE, 10);
    expect(curveForArc(2, 4)).toBeCloseTo(-0.5 / WARP_SWEEP_AT_ONE, 10);
    expect(curveForArc(10, 20)).toBeCloseTo(-0.5 / WARP_SWEEP_AT_ONE, 10);
  });

  it('bends more on a tighter arch and less on a wider one', () => {
    // -ve throughout (a ∩, not a ∪), so 'more bend' is further from zero
    expect(Math.abs(curveForArc(1, 1))).toBeGreaterThan(Math.abs(curveForArc(1, 3)));
    expect(curveForArc(1, 1)).toBeLessThan(0);
  });

  it('is flat when there is no text or no arch, and never past warpArc\'s range', () => {
    expect(curveForArc(0, 2)).toBe(0);
    expect(curveForArc(1, 0)).toBe(0);
    expect(Math.abs(curveForArc(100, 0.1))).toBeLessThanOrEqual(1);
  });
});

describe('archTextPath — derived from the arch, never authored', () => {
  /* ⚠️ ON the rope, not off it. The first version added half a thickness before the inset, so the
     line always cleared the band — inside the hole or out past the outer one, floating off the
     arch. Reported in one line: "the text going outside the rainbow." */
  it('rides the rope it names, not the air beside it', () => {
    const { bands } = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    expect(archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 'inner' }).radius)
      .toBeCloseTo(bands[0].radius, 10);
    expect(archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 'outer' }).radius)
      .toBeCloseTo(bands[bands.length - 1].radius, 10);
  });

  it('defaults to the middle of the stack, which is where the reference puts it', () => {
    const { bands } = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    const p = archTextPath(RAINBOW_DEFAULTS, CAKE);
    expect(p.radius).toBeGreaterThan(bands[0].radius);
    expect(p.radius).toBeLessThan(bands[bands.length - 1].radius);
  });

  it('nudges off the rope only when the row asks, and in the sign it asks for', () => {
    const { bands, thickness } = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    const out = archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 'outer', inset: 0.5 });
    const inn = archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 'outer', inset: -0.5 });
    expect(out.radius - bands[bands.length - 1].radius).toBeCloseTo(thickness * 0.5, 10);
    expect(inn.radius - bands[bands.length - 1].radius).toBeCloseTo(-thickness * 0.5, 10);
  });

  it('takes a band INDEX too, so a row can name the exact rope', () => {
    const { bands } = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    expect(archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 2 }).radius).toBeCloseTo(bands[2].radius, 10);
    // out of range is clamped rather than crashing on a row somebody mistyped
    expect(archTextPath(RAINBOW_DEFAULTS, CAKE, { band: 99 }).radius)
      .toBeCloseTo(bands[bands.length - 1].radius, 10);
  });

  /* ⚠️ THE WHOLE REASON THIS IS DERIVED. Each of these is a number a baker or an admin can move,
     and an authored slot would be left behind by every one of them. */
  it('follows the arch when the band count changes', () => {
    const { bands: b4 } = rainbowBands({ ...RAINBOW_DEFAULTS, bands: 4 }, CAKE);
    const { bands: b9 } = rainbowBands({ ...RAINBOW_DEFAULTS, bands: 9 }, CAKE);
    // the INNER rope does not move when ropes are added outside it
    expect(archTextPath({ ...RAINBOW_DEFAULTS, bands: 4 }, CAKE, { band: 'inner' }).radius)
      .toBeCloseTo(archTextPath({ ...RAINBOW_DEFAULTS, bands: 9 }, CAKE, { band: 'inner' }).radius, 10);
    // and the MIDDLE of the stack does, which is the whole point of tracking it
    expect(archTextPath({ ...RAINBOW_DEFAULTS, bands: 4 }, CAKE).radius)
      .toBeLessThan(archTextPath({ ...RAINBOW_DEFAULTS, bands: 9 }, CAKE).radius);
    expect(b9[b9.length - 1].radius).toBeGreaterThan(b4[b4.length - 1].radius);
  });

  it('follows the arch when the hole changes — the line moves and resizes', () => {
    const tight = archTextPath({ ...RAINBOW_DEFAULTS, innerRadius: RAINBOW_DEFAULTS.innerRadius * 0.6 }, CAKE);
    const wide  = archTextPath({ ...RAINBOW_DEFAULTS, innerRadius: RAINBOW_DEFAULTS.innerRadius * 1.4 }, CAKE);
    expect(tight.radius).toBeLessThan(wide.radius);
    expect(tight.maxW).toBeLessThan(wide.maxW);           // a tighter hole holds less text
  });

  /* ⚠️ THE BEND IS SCALE-INVARIANT, AND THAT IS THE POINT, not a rounding accident. `maxW` is
     `radius · π · span`, so in `curveForArc(maxW, radius)` the radius CANCELS: text that uses the
     same FRACTION of the sweep subtends the same angle on any circle. The first version of this
     test asserted that a tighter arch bends the text more, which is the intuition and is wrong —
     a tighter arch holds LESS text, bent the same. So the only thing that changes the bend is the
     one number an admin authors for it. */
  it('bends by the share of the sweep the line uses, whatever the arch size', () => {
    const small = archTextPath(RAINBOW_DEFAULTS, { radius: 0.6, topY: 1.5, boardY: 0 });
    const big   = archTextPath(RAINBOW_DEFAULTS, { radius: 3.0, topY: 1.5, boardY: 0 });
    expect(small.curve).toBeCloseTo(big.curve, 12);
    const half = archTextPath(RAINBOW_DEFAULTS, CAKE, { span: 0.3 });
    const most = archTextPath(RAINBOW_DEFAULTS, CAKE, { span: 0.9 });
    expect(Math.abs(half.curve)).toBeLessThan(Math.abs(most.curve));
  });

  it('follows the arch when it is SHRUNK to fit a smaller cake — the silent one', () => {
    /* fitOnTopScale shrinks the whole rainbow rather than moving it. An authored slot would stay
       where it was put and the text would float off the arch, on small cakes only. */
    const big   = archTextPath(RAINBOW_DEFAULTS, { radius: 3.0, topY: 1.5, boardY: 0 });
    const small = archTextPath(RAINBOW_DEFAULTS, { radius: 0.6, topY: 1.5, boardY: 0 });
    expect(small.radius).toBeLessThan(big.radius);
    // the SHAPE is unchanged by a uniform shrink, so the bend is the same
    expect(small.curve).toBeCloseTo(big.curve, 6);
  });

  it('reports the arch centre, so the caller never guesses where to put the line', () => {
    const r = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    const p = archTextPath(RAINBOW_DEFAULTS, CAKE);
    expect(p.centerX).toBeCloseTo(r.centerX, 10);
    expect(p.centerY).toBeCloseTo(r.archY, 10);
    expect(p.standoff).toBeCloseTo(r.standoff, 10);
  });
});

describe('textPathFor — the one reader', () => {
  it('routes on the kind', () => {
    expect(textPathFor({ kind: 'arch' }, RAINBOW_DEFAULTS, CAKE)?.kind).toBe('arch');
  });

  /* An element that takes no text must say so by returning nothing, so the card can offer nothing
     rather than a control that does nothing (INVARIANTS #11). */
  it('says NOTHING rather than guessing, for an element with no text path', () => {
    expect(textPathFor(null, RAINBOW_DEFAULTS, CAKE)).toBeNull();
    expect(textPathFor({}, RAINBOW_DEFAULTS, CAKE)).toBeNull();
    expect(textPathFor({ kind: 'spiral' }, RAINBOW_DEFAULTS, CAKE)).toBeNull();
  });
});
