import { describe, it, expect } from 'vitest';
import { curveForArc, archTextPath, textPathFor, arcLetter, WARP_SWEEP_AT_ONE, discTextPath, DISC_TEXT_DEFAULTS } from './textPath.js';
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

describe('arcLetter — a CUT letter is turned, not bent', () => {
  it('leaves the middle letter alone', () => {
    const p = arcLetter(0, 2);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.rot).toBeCloseTo(0, 12);
  });

  it('drops the outer letters and turns them away from the crown', () => {
    const r = arcLetter(1, 2), l = arcLetter(-1, 2);
    expect(r.y).toBeLessThan(0);                  // a ∩, so the ends fall
    expect(l.y).toBeCloseTo(r.y, 12);             // symmetric
    expect(r.rot).toBeLessThan(0);                // turned clockwise on the right
    expect(l.rot).toBeCloseTo(-r.rot, 12);
  });

  /* Every letter must land ON the circle the cream's own warp uses, or the two materials would sit
     at different depths on the same arch. */
  it('puts every letter on the circle centred at (0, -radius)', () => {
    for (const x of [-1.4, -0.5, 0, 0.7, 1.9]) {
      const p = arcLetter(x, 2.5);
      expect(Math.hypot(p.x - 0, p.y + 2.5)).toBeCloseTo(2.5, 10);
    }
  });

  it('preserves arc length, so tracking is not stretched by the curve', () => {
    const a = arcLetter(0.6, 3), b = arcLetter(1.2, 3);
    expect(Math.abs(b.rot - a.rot) * 3).toBeCloseTo(0.6, 10);
  });

  it('is a straight line when there is no arc', () => {
    expect(arcLetter(1.3, 0)).toEqual({ x: 1.3, y: 0, rot: 0 });
  });
});

describe('the face a message is pressed onto', () => {
  /* ⚠️ A BAND IS A TUBE. Seating a message on the arch's centre plane buries it inside the fondant
     and only slivers of letter show — which is how it rendered before this existed. */
  it('stands a half-thickness proud of the arch\'s own plane', () => {
    const { thickness, standoff } = rainbowBands(RAINBOW_DEFAULTS, CAKE);
    const p = archTextPath(RAINBOW_DEFAULTS, CAKE);
    expect(p.face).toBeCloseTo(standoff + thickness / 2, 10);
    expect(p.face).toBeGreaterThan(p.standoff);
  });
});

describe('discTextPath — a flat plaque, lying face-up', () => {
  const host = { center: [0.4, 1.2, -0.3], diameter: 1.0, yaw: 0 };

  it('lies flat, so the letters lift along the disc\'s own normal', () => {
    const p = discTextPath(host);
    expect(p.pose).toBe('lay');
    // -90° about X turns the group's local +Z into world +Y. Without it a plaque's letters
    // stand on edge like an arch's — the one thing that cannot be seen from the numbers alone.
    expect(p.rotation[0]).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('sits where the disc sits, never where a slot said', () => {
    expect(discTextPath(host).position).toEqual([0.4, 1.2, -0.3]);
  });

  it('turns with the plaque', () => {
    expect(discTextPath({ ...host, yaw: 1.1 }).rotation[1]).toBeCloseTo(1.1, 6);
  });

  it('keeps a margin of fondant round the word', () => {
    // 1.0 across, so a full-diameter line would touch the rim at both ends and read as crammed.
    const p = discTextPath(host);
    expect(p.maxW).toBeLessThan(host.diameter);
    expect(p.maxW).toBeCloseTo(0.72, 6);
  });

  it('leaves room for a descender below the cap height', () => {
    const p = discTextPath(host);
    expect(p.maxH).toBeGreaterThan(p.capH);   // a plain capH box clips the tail of a 'g'
  });

  it('is straight — a flat face justifies no bend, and a cut word cannot bend', () => {
    expect(discTextPath(host).curve).toBe(0);
  });

  it('scales every measurement with the disc', () => {
    const small = discTextPath({ ...host, diameter: 0.5 });
    const big   = discTextPath({ ...host, diameter: 2.0 });
    expect(big.maxW / small.maxW).toBeCloseTo(4, 6);
    expect(big.capH / small.capH).toBeCloseTo(4, 6);
  });

  it('an explicit undefined in the row does not beat the seed', () => {
    // The same trap ARCH_TEXT_DEFAULTS records: an admin form that writes every key.
    const p = discTextPath(host, { span: undefined, size: undefined });
    expect(p.maxW).toBeCloseTo(0.72, 6);
  });

  it('answers null for a disc it cannot measure, rather than a path at the origin', () => {
    expect(discTextPath({ center: [0, 0, 0], diameter: 0 })).toBe(null);
    expect(discTextPath({ diameter: 1 })).toBe(null);
    expect(discTextPath(null)).toBe(null);
  });

  it('is reachable through textPathFor, which is the only reader', () => {
    const p = textPathFor({ kind: 'disc', size: 0.3 }, host, null);
    expect(p?.kind).toBe('disc');
    expect(p.capH).toBeCloseTo(0.3, 6);
  });
});
