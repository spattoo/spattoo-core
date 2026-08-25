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

// ── The edit bag has TWO ends, and they must name the same things ────────────────────────────────
// CakeScene builds `edit={{ … }}` and CakeContent destructures it. Nothing connects the two lists,
// so adding a key to one and not the other is a silent mistake — silent because it survives every
// check that exists: the file parses, the bundle builds, and `foo?.()` looks defensive while being
// a ReferenceError on an unbound name.
//
// That has now happened twice. The second time it shipped: a selection box was added to the shared
// renderer with its prop declared on the wrong component, and every template carrying a rainbow or a
// cloud crashed with "selectedGenerated is not defined". A build cannot catch it, because both ends
// are valid JavaScript on their own — only their DISAGREEMENT is the bug.
describe('the edit bag agrees at both ends', () => {
  // The `edit={{ … }}` literal CakeScene passes down.
  const passed = (() => {
    const at = SOURCE.indexOf('edit={{');
    const body = SOURCE.slice(at + 7, SOURCE.indexOf('}}', at));
    return new Set(body
      .split(/[,\n]/)
      .map(line => line.replace(/\/\/.*/, '').trim())
      .filter(Boolean)
      // `a: b` passes b under the name a; the NAME is what the other end destructures.
      .map(entry => entry.split(':')[0].trim())
      .filter(name => /^[A-Za-z_$][\w$]*$/.test(name)));
  })();

  // What CakeContent pulls back out of it.
  const taken = (() => {
    const body = bodyOf('CakeContent');
    // Anchored on the destructure that ENDS in `= edit` — CakeContent also unpacks `config` and
    // `scene`, and the first `const {` in the body is one of those.
    const end = body.indexOf('} = edit');
    const chunk = body.slice(body.lastIndexOf('const {', end), end);
    return new Set(chunk
      .split(/[,\n]/)
      .map(line => line.replace(/\/\/.*/, '').trim())
      .filter(Boolean)
      // `a: b` renames on the way out — `a` is the key, and that is what must have been passed.
      .map(entry => entry.split(/[:=]/)[0].replace('const {', '').trim())
      .filter(name => /^[A-Za-z_$][\w$]*$/.test(name)));
  })();

  it('passes something for everything it takes', () => {
    const missing = [...taken].filter(k => !passed.has(k));
    expect(missing, `CakeContent destructures ${missing.join(', ')} from edit, but CakeScene never puts it there — `
      + 'a ReferenceError the moment that branch renders').toEqual([]);
  });

  it('is GIVEN everything it passes', () => {
    // The third way this can break, and the one that shipped a crash: CakeScene puts a name into
    // `edit` that CakeScene itself was never given. Both ends of the bag agree, so the test above is
    // happy — and the reference throws the moment the scene renders.
    //
    // A whole-file check cannot see this either: the name IS declared in the file, on a different
    // component. Only the signature can say.
    const sig = (() => {
      const at = SOURCE.indexOf('function CakeScene({');
      return SOURCE.slice(at, SOURCE.indexOf('}) {', at));
    })();
    const given = new Set(sig
      .split(/[,\n]/)
      .map(l => l.replace(/\/\/.*/, '').split(/[=:]/)[0].replace('function CakeScene({', '').trim())
      .filter(n => /^[A-Za-z_$][\w$]*$/.test(n)));

    // A name can also be MADE inside the scene rather than handed to it — `gestureOnStickerRef` is a
    // useRef in the body. Either counts; the fault is a name that exists in neither.
    const body = bodyOf('CakeScene');
    for (const m of body.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) given.add(m[1]);

    const missing = [...passed].filter(k => !given.has(k));
    expect(missing, `CakeScene passes ${missing.join(', ')} into edit, but its own signature does not `
      + 'declare them — a ReferenceError as soon as the scene renders').toEqual([]);
  });

  it('takes everything it passes', () => {
    // The other direction is a weaker fault — a prop nobody reads is dead weight, not a crash — but
    // it is the same drift, and it is how one end quietly stops matching the other.
    const unread = [...passed].filter(k => !taken.has(k));
    expect(unread, `CakeScene passes ${unread.join(', ')} in edit, but CakeContent never reads it`)
      .toEqual([]);
  });
});
