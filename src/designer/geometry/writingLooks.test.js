import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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
