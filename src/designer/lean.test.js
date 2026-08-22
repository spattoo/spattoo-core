// ── Both lean axes are re-seated together ───────────────────────────────────────────────────────
// An element leans on two axes: `tiltAngle` tips it front/back, `rollAngle` tips it left/right (on a
// wall, that second one spins it in the plane of the wall). They are two fields, and every place
// that RE-SEATS an instance has to clear both.
//
// That is a hand-maintained pair, and the failure is silent in the worst way: a lean that survives a
// move to another zone, or a pose flip, means something different where it lands — an element arrives
// tipped over for no reason a customer can trace back to anything they did. `yOffset` had exactly
// this bug before the pose work, and it was found by looking rather than by failing.
//
// So: wherever the source zeroes one axis, the other must be zeroed in the same object. A new
// re-seat path fails here the moment it is written, which is the only moment the fix is cheap.
//
// It reads source text rather than rendering: CakeDesigner is three.js/R3F and wants a WebGL context
// this suite has no business booting. Crude, and it answers the actual question.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const FILES = ['CakeDesigner.jsx', 'hooks/useCakeDesign.js'];

// The object literal a `tiltAngle: 0` sits in — from the nearest `{` before it to the nearest `}`
// after. Good enough for the shape these resets are written in (a flat patch object on one or two
// lines), and it fails loudly rather than silently if that ever stops being true.
function resetsAround(source, index) {
  const open = source.lastIndexOf('{', index);
  const close = source.indexOf('}', index);
  return source.slice(open, close + 1);
}

describe('a re-seat clears both lean axes', () => {
  for (const file of FILES) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

    it(`${file} — every tiltAngle reset clears rollAngle too`, () => {
      const misses = [];
      for (let i = source.indexOf('tiltAngle: 0'); i !== -1; i = source.indexOf('tiltAngle: 0', i + 1)) {
        const patch = resetsAround(source, i);
        if (!/rollAngle:\s*0/.test(patch)) {
          misses.push(`line ${source.slice(0, i).split('\n').length}: ${patch.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
      expect(misses, `these re-seat tiltAngle but leave rollAngle to leak across:\n  ${misses.join('\n  ')}`)
        .toEqual([]);
    });
  }

  // The pair has to EXIST to be checked — if a rename made `tiltAngle: 0` unfindable this suite would
  // pass by matching nothing at all, which is the way a source-scanning guard usually dies.
  it('finds the resets it claims to be guarding', () => {
    const found = FILES.reduce((n, f) => {
      const source = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      return n + source.split('tiltAngle: 0').length - 1;
    }, 0);
    expect(found, 'no tiltAngle resets found — did the field get renamed?').toBeGreaterThanOrEqual(3);
  });
});
