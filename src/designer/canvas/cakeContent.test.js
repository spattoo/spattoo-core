// ── The capture draws the same cake as the editor ───────────────────────────────────────────────
// A template's thumbnail once came back with a bald top: the cake had piped grass, the picture did
// not. The cause was never the grass — it was that the capture had its OWN copy of the scene, so
// every element type added after that copy was written (grass, letter blocks, second-cream layers,
// 3D text) existed on one and not the other, and nothing failed to say so.
//
// So this suite guards the shape of the fix rather than any one element:
//   1. Both surfaces render the SAME component (CakeContent) — no second copy of the scene.
//   2. Every field toCanvasConfig puts on a design is READ by that component — a new element type
//      that nobody renders fails here, at the moment it is added, instead of on a saved thumbnail.
//
// It reads the source rather than rendering it: CakeCanvas is three.js/R3F, which needs a WebGL
// context this suite has no business booting. A source check is the cheap, honest version of the
// question "is anything on the cake missing from the picture?".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCanvasConfig } from '../hooks/useCakeDesign.js';

const SOURCE = readFileSync(new URL('./CakeCanvas.jsx', import.meta.url), 'utf8');

// The body of a top-level `function NAME(` … up to its closing brace in column 0. Crude, and exactly
// right for this file: every component here is a top-level declaration indented inside.
function bodyOf(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  expect(start, `${name} should be a top-level function in CakeCanvas.jsx`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\n}\n', start);
  return SOURCE.slice(start, end);
}

describe('one renderer for the cake (INVARIANTS #2)', () => {
  it('the editor draws the cake with CakeContent', () => {
    expect(bodyOf('CakeScene')).toContain('<CakeContent');
  });

  it('the capture draws the cake with the same CakeContent', () => {
    expect(bodyOf('CakeThumbnailScene')).toContain('<CakeContent');
  });

  it('the capture has no element renderers of its own to fall behind with', () => {
    const capture = bodyOf('CakeThumbnailScene');
    for (const own of ['<CakeTier', '<StickerFace', '<GrassPatch', '<NameBlocks', '<CreamWriting', '<AgeNumber']) {
      expect(capture, `${own} belongs in CakeContent, not in a second copy of the scene`).not.toContain(own);
    }
  });
});

describe('every field of a design reaches the renderer', () => {
  // One tier with nothing authored on it: toCanvasConfig fills in every field it knows about, which
  // is precisely the list of things a cake can carry.
  const config = toCanvasConfig({ tiers: [{}] });
  // The cake's contents are read across the shared renderer AND the scene resolver that feeds it.
  const rendered = bodyOf('resolveCakeScene') + bodyOf('CakeContent');

  for (const key of Object.keys(config)) {
    it(`design.${key} is read by CakeContent`, () => {
      expect(rendered, `nothing renders design.${key} — it would be invisible in every thumbnail`)
        .toContain(key);
    });
  }

  for (const key of Object.keys(config.tiers[0])) {
    it(`tier.${key} is read by CakeContent`, () => {
      expect(rendered, `nothing renders tier.${key} — it would be invisible in every thumbnail`)
        .toContain(key);
    });
  }
});
