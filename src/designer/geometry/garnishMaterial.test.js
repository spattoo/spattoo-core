import { describe, it, expect } from 'vitest';
import { asRendered, materialBase, garnishMaterialProps } from './garnishMaterial.js';

const rgb = css => (css.match(/\d+/g) ?? []).map(Number);

// ── The studio and the cake must agree about a colour ────────────────────────────────────────────
//
// ⚠️ A FLAT FILL AND A LIT MATERIAL CANNOT AGREE BY COINCIDENCE. Tuning one towards the other was
// tried twice and drifted twice — a teal piece previewed in the studio arrived on the cake as pale
// mint. One function decides now, and both sides ask it.
describe('what a colour looks like once rendered', () => {
  it('lightens towards white, because a clearcoat reflects the room', () => {
    const [r, g, b] = rgb(asRendered('#0d6e5e'));
    expect(r).toBeGreaterThan(0x0d);
    expect(g).toBeGreaterThan(0x6e * 0.9);
    expect(b).toBeGreaterThan(0x5e * 0.9);
  });

  /* ⚠️ AND IT MUST STAY THE SAME COLOUR. Washing it out is the bug; this has to move it towards what
     the cake shows without turning teal into mint — the hue is what a baker chose. */
  it('keeps the hue', () => {
    const src = [0x0d, 0x6e, 0x5e];
    const out = rgb(asRendered('#0d6e5e'));
    const hue = ([r, g, b]) => Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
    expect(Math.abs(hue(out) - hue(src))).toBeLessThan(0.25);
  });

  /* ⚠️ IT MOVES WITH THE MATERIAL. Both terms come from the numbers the material is built from, so a
     change to one is a change to the other — which is the whole point of sharing the function. */
  it('follows Shine, in the same direction the material does', () => {
    const dull = rgb(asRendered('#4A2C1B', 0));
    const wet = rgb(asRendered('#4A2C1B', 1));
    expect(wet[0]).toBeGreaterThan(dull[0]);
    expect(garnishMaterialProps({ gloss: 1 }).clearcoat)
      .toBeGreaterThan(garnishMaterialProps({ gloss: 0 }).clearcoat);
  });

  it('leaves a colour it cannot read alone rather than guessing', () => {
    expect(asRendered('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
    expect(asRendered(null)).toBeTruthy();
  });

  /* ⚠️ THE CORRECTION GOES IN THE MATERIAL, NOT THE SWATCH. Washing the studio out until it matched
     a bad render made the two agree about a colour nobody asked for. Handing the renderer a
     pre-compensated base means what comes OUT is the colour that was chosen. */
  it('round-trips: the base it hands the renderer comes back as the chosen colour', () => {
    for (const c of ['#C4626B', '#4A2C1B', '#EFE3CE']) {
      const back = rgb(asRendered(materialBase(c)));
      const want = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
      for (let k = 0; k < 3; k++) expect(Math.abs(back[k] - want[k])).toBeLessThan(2);
    }
  });

  /* ⚠️ EXCEPT WHERE THE PHYSICS CANNOT REACH, and the limit is asserted rather than described. A
     channel darker than the white the renderer adds would need a negative base; it holds at zero and
     the piece comes back a little lighter than asked — 7 of 255 on the red of a dark teal, which is
     invisible. What matters is that it never overshoots the other way and never silently pretends. */
  it('clamps upward, never past the colour asked for', () => {
    const back = rgb(asRendered(materialBase('#0d6e5e')));
    const want = [0x0d, 0x6e, 0x5e];
    for (let k = 0; k < 3; k++) {
      expect(back[k]).toBeGreaterThanOrEqual(want[k] - 1);
      expect(back[k] - want[k]).toBeLessThan(12);
    }
  });

  it('clamps rather than pretending, where the physics cannot reach', () => {
    // Near-black under a strong sheen would need a negative base; it holds at zero and says so by
    // simply being a little lighter than asked.
    const [r] = rgb(materialBase('#000000', 1));
    expect(r).toBe(0);
  });

  /* A white-chocolate piece must not clip to flat white — the lightening is bounded. */
  it('does not blow out a pale chocolate', () => {
    const [r, g, b] = rgb(asRendered('#EFE3CE'));
    expect(Math.min(r, g, b)).toBeLessThan(255);
  });
});
