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

/* ── The board is the cake's, not the tier's ─────────────────────────────────────────────────────
 *
 * A cloud lives in `tier.clouds[]` and is handed its tier's numbers. `boardY` used to be passed as
 * `tier.baseY` — which IS the board for tier 0, and is the lid of the tier below for every tier
 * above it. So a second-tier cloud sent to "On the board" was laid on the join between the tiers.
 * Sandeep: "when pluffy cloud is chooses 'on the board', it stays on the middle."
 *
 * ⚠️ A GEOMETRY UNIT TEST CANNOT SEE THIS. `cloudBaseY('board', …)` returned `boardY` then and
 * returns it now — it was right all along, given the right number. The fault was entirely in what
 * the caller handed it, and the caller is JSX. So it is asserted here, where this suite already
 * reads the source for exactly that kind of question.
 */
describe('a cloud is given the cake board, not its own tier base', () => {
  // The JSX that renders the clouds belonging to one tier.
  const cloudBlock = (() => {
    const start = SOURCE.indexOf('(tier.clouds ?? []).map(');
    expect(start, 'the per-tier cloud block should exist in CakeCanvas.jsx').toBeGreaterThan(-1);
    return SOURCE.slice(start, SOURCE.indexOf('(tier.balloons ?? []).map(', start));
  })();

  it('passes the board constant, never the tier base, as boardY', () => {
    expect(cloudBlock).toMatch(/boardY:\s*board \? BOARD_TOP_Y : tier\.baseY/);
    // The old spelling. A tier's base is only the board on the bottom tier.
    expect(cloudBlock).not.toMatch(/boardY:\s*tier\.baseY\s*[,}]/);
  });

  it('still passes the tier base separately, as the foot of that tier wall', () => {
    // Without this a wall cloud on an upper tier would stand on the board and rise the whole cake.
    expect(cloudBlock).toMatch(/baseY:\s*tier\.baseY/);
  });

  it('names the board height rather than repeating 0.1', () => {
    expect(SOURCE).toMatch(/BOARD_TOP_Y/);
    // The board mesh's own thickness defines that height; it must not be written out again.
    expect(SOURCE).not.toMatch(/args=\{\[board\.width, 0\.1, board\.depth\]\}/);
  });
});

/* ── A decoration ring can be tilted, not only yawed ─────────────────────────────────────────────
 *
 * `placement_config.top_rotation` is a THREE-vector, and the element-finish ring path
 * (`DecorationShells` — the one that keeps a GLB's own materials, selected by
 * `ring_finish: "element"`) read only `[1]`. So an admin could yaw a rosette round its own axis and
 * could not tilt it at all, and the two numbers that would have laid it face-up did nothing.
 *
 * That is what "I set top_rotation to 0,0,0 and the designer still renders it wrong" meant: zeroing
 * the Y changed the only component that was ever applied, and the ones that mattered were never
 * read. The cream shell path has always honoured all three.
 *
 * ⚠️ ASSERTED ON THE SOURCE, deliberately. A render proof needs a GLB with a visible "up", and the
 * harness ships a bead — symmetric enough that yaw and tilt look identical on it, which is exactly
 * how this survived. This suite already reads the source for questions of that shape.
 */
describe('a decoration ring honours all three rotation axes', () => {
  // DecorationShells lives in CakeTier.jsx, not CakeCanvas.jsx — bodyOf() reads the latter.
  const TIER = readFileSync(new URL('./CakeTier.jsx', import.meta.url), 'utf8');
  const start = TIER.indexOf('function DecorationShells(');
  const body = TIER.slice(start, TIER.indexOf('\n}\n', start));

  it('reads the X and Z components, not just Y', () => {
    expect(body).toMatch(/baseRotation\?\.\[0\]/);
    expect(body).toMatch(/baseRotation\?\.\[2\]/);
  });

  it('still yaws by Y', () => {
    expect(body).toMatch(/baseRotation\?\.\[1\]/);
  });

  /* ⚠️ THE TILT MUST NOT JOIN THE YAW EXPRESSION. Applied as its own inner group, every decoration
     ring already on a saved cake keeps the orientation it has; folded into the group rotation, the
     composition changes and they all move. */
  it('applies the tilt inside the yawed group, leaving existing rings put', () => {
    expect(body).toMatch(/rotation=\{\[0, \(u\.rotY \?\? 0\) \+ ry, 0\]\}/);
    expect(body).toMatch(/<group rotation=\{tilt\}>/);
  });
});

/* ── A tilted decoration ring sits ON the surface ────────────────────────────────────────────────
 *
 * The seat subtracts the model's lowest point so its base rests on the cake. `minY` is measured
 * UPRIGHT, which was correct while the only freedom was yaw — a yaw cannot change a height. The
 * tilt added in the same session could, and the ring floated: laying a rosette face-up with -90°
 * about X moves its lowest point from the bottom of a 1.9-tall model to the bottom of a 0.4-deep
 * one, so subtracting the upright figure lifted it by the difference. On the real model that was
 * (0.952 - 0.202) x shellScale of clear air, which is what Sandeep photographed.
 */
describe('a tilted decoration ring is seated after the tilt', () => {
  const TIER = readFileSync(new URL('./CakeTier.jsx', import.meta.url), 'utf8');
  const start = TIER.indexOf('function DecorationShells(');
  const body = TIER.slice(start, TIER.indexOf('\n}\n', start));

  it('measures the seat from the TILTED bounds, not the authored minY', () => {
    expect(body).toMatch(/setFromObject\(scene\)\.applyMatrix4/);
    expect(body).toMatch(/position=\{\[u\.pos\[0\], u\.pos\[1\] - seatMinY \* shellScale/);
    // The untilted figure must not be what positions the shell any more.
    expect(body).not.toMatch(/u\.pos\[1\] - minY \* shellScale/);
  });

  /* ⚠️ AN UNTILTED ELEMENT MUST KEEP THE MEASURED minY EXACTLY. Recomputing for everything would
     move every decoration ring already on a saved cake by whatever the two measurements disagree
     about — a silent change to work customers have already approved. */
  it('short-circuits to the authored minY when there is no tilt', () => {
    expect(body).toMatch(/if \(!scene \|\| \(!tilt\[0\] && !tilt\[2\]\)\) return minY;/);
  });
});
