import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/* ── Every piece the build ENUMERATES must also ask for its pose ────────────────────────────────
 *
 * The build take works in two halves that live ~600 lines apart in `CakeCanvas.jsx`:
 *
 *   `buildIds`  pushes an id per piece. That is what gives a piece its SLOT in the running order.
 *   `poseFor`   is what a renderer calls to find out where its piece is in flight.
 *
 * Nothing tied the two together, so a piece could be enumerated and never posed — and five were.
 * It fails in a way that reads as "that decoration does not fly", which is how it was reported:
 * Sandeep, watching a welcome-home cake build, *"clouds and 'welcome home' text are not flying"*.
 * The clouds were a different fault (never enumerated at all); the message was this one.
 *
 * ⚠️ AND IT IS NOT ONLY THAT ONE PIECE. `pieceStart` spreads the schedule across `i / (count - 1)`,
 * and an unconsumed id still counts toward `count`. So a dead slot is a SILENT BEAT in the film and
 * it shifts the timing of every piece behind it. One missing wrapper degrades the whole take, which
 * is why this is a gate rather than a note.
 *
 * Read off the source rather than rendered: the alternative is mounting a canvas per decoration
 * kind, and the thing being asserted is a correspondence between two lists.
 *
 * ⚠️ THE CONSUMER IS NOT ALWAYS IN THE SAME FILE, and a first cut of this gate that only read
 * `CakeCanvas.jsx` called `top`, `bot`, `garnish` and `topper` dead when they are fine. `poseFor`
 * is handed down as the `buildPose` PROP — `CakeTier` poses a piping ring's shells with it,
 * `Garnishes` its own pieces — so the search has to follow it across the canvas folder or it
 * reports the renderers that do the right thing. */
const DIR = new URL('../canvas/', import.meta.url);
/* ⚠️ THE WHOLE FOLDER, not a list of files. A second cut of this named three and still missed
   `Toppers.jsx`; a hard-coded list is a thing that rots quietly the next time a renderer moves. */
const SRC = readdirSync(DIR)
  .filter(f => f.endsWith('.jsx') && !f.endsWith('.test.jsx'))
  .map(f => readFileSync(new URL(f, DIR), 'utf8')).join('\n');

/* The enumeration itself is only ever in CakeCanvas — one list, one place (INVARIANTS #10 law 1). */
const CANVAS = readFileSync(new URL('CakeCanvas.jsx', DIR), 'utf8');

/* ⚠️ COMPARED BY ID SHAPE, NOT BY KIND, AND THE DIFFERENCE IS THE WHOLE GATE. A kind-level check
   passes the moment ONE `grass` is posed — and the board's grass and a tier's grass are two
   different pushes. The first cut of this did exactly that: it went green with
   `{tier.grass && <GrassPatch …>}` still unwrapped, which is the shape of a gate that looks like it
   works. So each id is normalised to its pattern — every `${…}` becomes `*` — and the sets are
   compared as patterns: `grass:*` and `grass:board` are two obligations, not one. */
const shape = (raw) => raw.replace(/\$\{[^}]*\}/g, '*');

/** The id patterns pushed into `buildIds`. */
function enumerated() {
  const block = /const buildIds = useMemo\(\(\) => \{([\s\S]*?)return ids;/.exec(CANVAS);
  if (!block) throw new Error('buildIds block not found — has it been renamed?');
  const out = new Set();
  for (const m of block[1].matchAll(/ids\.push\(`([^`]+)`\)/g)) out.add(shape(m[1]));
  for (const m of block[1].matchAll(/ids\.push\('([^']+)'\)/g))  out.add(m[1]);
  return out;
}

/** The id patterns any renderer asks about, via `poseFor` or the `buildPose` prop. */
function consumed() {
  const out = new Set();
  for (const m of SRC.matchAll(/(?:poseFor|buildPose\??\.?)\(`([^`]+)`/g)) out.add(shape(m[1]));
  for (const m of SRC.matchAll(/(?:poseFor|buildPose\??\.?)\('([^']+)'/g))  out.add(m[1]);
  return out;
}

describe('the build take enumerates and poses the same pieces', () => {
  it('every enumerated kind is consumed by a renderer', () => {
    const dead = [...enumerated()].filter(k => !consumed().has(k)).sort();
    expect(dead, `enumerated into buildIds but never posed — these hold a slot in the running `
      + `order, never arrive, and shift the timing of every piece behind them: ${dead.join(', ')}`)
      .toEqual([]);
  });

  it('every consumed kind is enumerated, so no renderer asks about a piece with no slot', () => {
    const orphan = [...consumed()].filter(k => !enumerated().has(k)).sort();
    expect(orphan, `asked of poseFor but never pushed into buildIds — poseFor returns null, so `
      + `the piece never flies: ${orphan.join(', ')}`).toEqual([]);
  });

  /* ⚠️ THE TWO CHECKS ABOVE CANNOT SEE A PIECE THAT IS IN NEITHER LIST, and that is the fault that
     keeps being reported. They compare two sets against each other, so a decoration nobody
     enumerated has no slot to be missing from and no renderer asking about it — both sets agree,
     perfectly, about a cake that sits still. Every report so far has been this shape: the clouds
     ("clouds and 'welcome home' text are not flying" — the text was the posing fault, the clouds
     were this one), and then the brushwork: *"the cream brush strokes are not flying."*

     There is no way to derive the right answer from the source — "what can a baker put on a cake"
     lives in `useCakeDesign`'s shape and in a dozen renderers — so this is a NAMED LIST, and the
     cost of that is honest: a new kind of decoration has to be added here by hand. It is one line,
     and it is the line that makes the next one of these fail in CI rather than on a baker's film. */
  it('every kind a baker can place is in the running order', () => {
    const e = [...enumerated()], c = [...consumed()];
    const kinds = [
      'top', 'bot',              // piping rings
      'writing', 'text', 'age',  // lettering
      'cloud', 'rainbow', 'balloon',
      'grass', 'gyp', 'sand',
      'garnish', 'topper', 'sticker',
      'brushband', 'brush',      // the wall's brushwork — band, and each hand-drawn stroke
    ];
    for (const kind of kinds) {
      expect(e.some(id => id.startsWith(`${kind}:`)), `${kind} must be enumerated in buildIds`).toBe(true);
      expect(c.some(id => id.startsWith(`${kind}:`)), `${kind} must ask poseFor for its pose`).toBe(true);
    }
  });
});
