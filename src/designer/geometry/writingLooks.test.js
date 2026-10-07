import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { acrylicCfg, cutAssembly } from './acrylicConfig.js';

/* ── A third Look is a ROW, and every control asks `cut` rather than "is it acrylic" ─────────────
 *
 * Sandeep: "we need to add one more option next to 'Piped cream' and 'Acrylic' which is going to be
 * 'Fondant'. Fondant letters can go on both side,top and board. on top, fondant letters can hug or
 * stand."
 *
 * ⚠️ THE TRAP THIS PINS. Every control on the Texts card that read `w.style !== 'acrylic'` MEANT
 * "piped cream only" — Curve, Line gap, Thickness, the Draw row, the Colour/Gold/Silver trio. Left
 * alone, each would have switched itself back on for fondant: a Curve dial on a shape cut with a
 * cutter, a Thickness slider writing a field the cut builder never reads. They are not a style test,
 * they are a `cut` test, and nothing but a source assertion can hold that distinction — the suite
 * never mounts CakeDesigner.
 */
const designer = readFileSync(new URL('../CakeDesigner.jsx', import.meta.url), 'utf8');
const canvas   = readFileSync(new URL('../canvas/CakeCanvas.jsx', import.meta.url), 'utf8');
const word     = readFileSync(new URL('../canvas/AcrylicWord.jsx', import.meta.url), 'utf8');
const writing  = readFileSync(new URL('../canvas/AcrylicWriting.jsx', import.meta.url), 'utf8');

describe('the Looks are a table', () => {
  it('declares all three, with the surfaces each one is offered on', () => {
    expect(designer).toMatch(/cream:\s*\{ label: 'Piped cream', surfaces: \['top', 'side', 'board'\], cut: false/);
    expect(designer).toMatch(/acrylic:\s*\{ label: 'Acrylic',\s+surfaces: \['top', 'side'\],\s+cut: true/);
    expect(designer).toMatch(/fondant:\s*\{ label: 'Fondant',\s+surfaces: \['top', 'side', 'board'\], cut: true/);
  });

  /* The toggle is built from the table, so a fourth material is a row and not another button. */
  it('the Look toggle is derived from it, not hand-listed', () => {
    expect(designer).toMatch(/Object\.entries\(WRITING_LOOKS\)/);
    expect(designer).not.toMatch(/\[\{ k: 'cream', label: 'Piped cream' \}, \{ k: 'acrylic'/);
  });
});

describe('no control is left asking "is it acrylic"', () => {
  /* ⚠️ THE WHOLE POINT. If any of these comes back, a cream-only control is live on fondant (or a
     cut-only one is missing from it) — the failure is silent and looks like a design decision. */
  it('the card branches on cut, not on the acrylic name', () => {
    expect(designer).not.toMatch(/w\.style !== 'acrylic'/);
    expect(designer).toMatch(/!writingIsCut\(w\.style\)/);
    expect(designer).toMatch(/items=\{\(writingIsCut\(w\.style\)/);
  });

  /* The FINISH block is the one thing that genuinely IS acrylic-only: mirror gold is a material, and
     fondant has no equivalent — it is white paste with gel kneaded through it. */
  it('except the acrylic finishes, which really are acrylic only', () => {
    expect(designer).toMatch(/\{w\.style === 'acrylic' && <>/);
    expect(designer).toMatch(/\{w\.style === 'fondant' && <>/);
  });
});

describe('fondant is the same cut word in another material', () => {
  it('the canvas sends both cut Looks to the cut renderer', () => {
    expect(canvas).toMatch(/w\.style === 'acrylic' \|\| w\.style === 'fondant' \? AcrylicWriting : CreamWriting/);
  });

  /* `medium` picks the material and nothing else — the geometry, fit, poses and legs are shared. A
     separate FondantWord would have copied the build to change a material. */
  it('the word takes a medium rather than a second builder', () => {
    expect(word).toMatch(/medium = 'acrylic'/);
    expect(word).toMatch(/buildSolidWallMaterial\('fondant'/);
    expect(writing).toMatch(/medium=\{writing\.style === 'fondant' \? 'fondant' : 'acrylic'\}/);
  });

  /* ⚠️ HUG IS THE EXISTING `lay` POSE, not a fourth one. Lying face-up on a horizontal surface is
     what the board already does and exactly what hugging the top is. */
  it('hugging the top resolves to the pose the board already uses', () => {
    expect(writing).toMatch(/writing\?\.topPose !== 'stand' \? 'lay' : 'stand'/);
  });

  /* A new surface gets its own measured reference light, or the colour picked is not the colour
     rendered: uncorrected, mid-grey came back 193 against an asked 128. */
  it('and its colour is calibrated for this surface', () => {
    expect(word).toMatch(/FONDANT_REFERENCE_LIGHT = \[3\.033, 2\.813, 2\.791\]/);
    expect(word).toMatch(/albedoForLight\(color \|\| FONDANT_WRITING_COLOR, FONDANT_REFERENCE_LIGHT/);
  });
});

/* ── A cut medium brings its own manufacture, and acrylic's is not lettering ─────────────────────
 *
 * Sandeep: "for fondant, some acrylic options are appearing. like legs and the bridge line. these
 * options should not be available for fondant."
 *
 * ⚠️ WHAT MAKES THIS WORTH PINNING is that all three are easy to read as decisions about the WORD
 * and none of them is. A perspex word is cut from ONE sheet, so it has to hang together (`bridge`
 * drops stems between parts the cutter would otherwise drop), sit on something (`bar`) and push into
 * the icing (`legs`). Fondant is cut letter by letter with a cutter and laid on by hand: no stems,
 * no bar, no prongs, and a standing word resting on its own baseline.
 */
describe('fondant is cut letter by letter, so it has no acrylic hardware', () => {
  const standing = { standing: true };

  it('acrylic standing still gets its bar, bridge and legs', () => {
    const cfg = acrylicCfg({ font: 'great_vibes' }, { ...standing, medium: 'acrylic' });
    expect(cfg.bar).toBe(true);
    expect(cfg.bridge).toBe(true);
    expect(cfg.legs).toBeGreaterThan(0);
  });

  it('fondant standing gets none of them', () => {
    const cfg = acrylicCfg({ font: 'great_vibes' }, { ...standing, medium: 'fondant' });
    expect(cfg.bar).toBe(false);
    expect(cfg.bridge).toBe(false);
    expect(cfg.legs).toBe(0);
  });

  /* ⚠️ THE MEDIUM VETOES RATHER THAN DEFAULTS. These values live on the MESSAGE, so a cake saved as
     acrylic and switched to fondant still carries `legs: 2` — and a `??` would let it ride across
     and leave a prong behind on a material that has none. */
  it('and a message carrying acrylic values cannot drag them across the switch', () => {
    const carried = { font: 'great_vibes', legs: 2, bar: true, bridge: true };
    const cfg = acrylicCfg(carried, { ...standing, medium: 'fondant' });
    expect(cfg.legs).toBe(0);
    expect(cfg.bar).toBe(false);
    expect(cfg.bridge).toBe(false);
  });

  /* The card reads the SAME table the builder does, so a control can never be offered for a thing
     the geometry will not build. */
  it('the card asks that table rather than the pose', () => {
    expect(cutAssembly('fondant').legs).toBe(false);
    expect(cutAssembly('acrylic').legs).toBe(true);
    expect(designer).toMatch(/cutAssembly\(w\.style\)\.legs/);
    expect(designer).not.toMatch(/w\.style === 'fondant' && writingTopPose\(w\) === 'hug'/);
  });

  /* ⚠️ AND `style` HAS TO BE A MEMO DEPENDENCY. The cfg decides all three off the medium, so without
     it a message already on screen keeps its acrylic assembly when the Look changes. */
  it('the renderer rebuilds its cfg when the Look changes', () => {
    expect(writing).toMatch(/medium: writing\.style === 'fondant' \? 'fondant' : 'acrylic'/);
    expect(writing).toMatch(/writing\.legs, writing\.legLen, writing\.bury, writing\.minDetail,[\s\S]{0,400}?writing\.style,/);
  });
});
