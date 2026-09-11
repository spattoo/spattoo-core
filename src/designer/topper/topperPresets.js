import { topperSheets } from '../geometry/topperPiece.js';

// ── Card topper presets — a few made toppers, built into the studio ──────────────────────────────
//
// An empty canvas with "add text or a shape" on it tells you what the CONTROLS are and nothing about
// what the thing is for. A baker who has never seen a card topper cannot want one. These are a few
// finished pieces so the studio opens showing what it makes.
//
// ⚠️ A STARTING POINT, NEVER A MENU. Picking one drops its pieces on the canvas and every one of them
// is then an ordinary object — retype the word, recolour it, drag it, delete half of it. Nothing here
// is a mode, and nothing is locked. That is the whole difference between a preset a baker can leave
// and a template that decides for them.
//
// ⚠️ NO `id`s HERE. Ids are minted by the studio as the objects land, so picking the same preset twice
// cannot produce two objects that share an id — which would make selecting one move both.
//
// ⚠️ AND `__block` FACES ONLY. A preset has to draw the instant the studio opens, and a real face is
// fetched. A preset that appeared blank for a moment, or that showed a picture of a font the baker is
// then not given, is worse than one drawn in the face everyone already has.

export const TOPPER_PRESETS = Object.freeze([
  {
    /* The reference this whole studio started from: a cut number standing proud of its own outline.
       ⚠️ THE BAND IS NOT WHITE. A white band on the studio's near-white ground is an outline you have
       to hunt for, so the one preset whose entire job is to show what "offset" MEANS was showing it
       worst. Inverted instead — a white number inside a coloured band — which is the same two colours
       doing the same job, where you can see it. */
    key: 'number',
    label: 'A number with an outline',
    objects: [
      { kind: 'text', text: '10', face: '__block', size: 1.50, x: 0, y: 0,
        colour: '#FFFFFF', offset: 0.10, offsetColour: '#E4572E' },
    ],
  },
  {
    key: 'name-heart',
    label: 'A name on a heart',
    objects: [
      /* ⚠️ A SHAPE'S `size` IS THE BOX THE PLATE IS FITTED AROUND, not the plate's own width — a
         heart big enough to contain a 2.0 square is 4.2 across, wider than the whole stage. Every
         number here was MEASURED (topperPresets.test.js), because reasoning about it produced a
         heart that filled the studio and hung off all four sides. */
      { kind: 'shape', family: 'heart', size: 0.9, x: 0, y: 0,
        colour: '#D94F6E', offset: 0.05, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'Mia', face: '__block', size: 0.58, x: 0, y: -0.02,
        colour: '#FFFFFF', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },
  {
    key: 'number-circle',
    label: 'A number on a circle',
    objects: [
      { kind: 'shape', family: 'circle', size: 1.2, x: 0, y: 0,
        colour: '#F2AEC4', offset: 0.05, offsetColour: '#8E2F45' },
      { kind: 'text', text: '5', face: '__block', size: 0.44, x: 0, y: 0,
        colour: '#FFFFFF', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },
  {
    key: 'name-rect',
    label: 'A name on a rectangle',
    objects: [
      /* ⚠️ `ratio` 2.2, or this is a square. "rect" is the one family that follows the box it is
         fitted around, and a shape's box was always square — so a name plaque came out a lozenge. */
      { kind: 'shape', family: 'rect', size: 0.8, ratio: 2.2, x: 0, y: 0,
        colour: '#6B8E7A', offset: 0.06, offsetColour: '#F7E7CE' },
      /* ⚠️ THE NAME CARRIES ITS OWN BAND TOO, not just the plaque under it. A white name straight
         onto a mid-tone plaque has only its own edge to hold it, and that edge is exactly where the
         two colours are closest in value — the name goes soft at the size a topper is actually seen
         from. A dark outline is what a printed card topper does, and it is the second thing on this
         preset showing what an offset is for: one band on a shape, one on a word. */
      /* ⚠️ THE NAME CARRIES ITS OWN BAND TOO, not just the plaque under it — one band on a shape and
         one on a word, which is also the second thing this preset demonstrates.
         Dark name, WHITE band: a white name on a mid-tone plaque has only its own edge holding it,
         and that edge is where the two colours are closest in value, so it goes soft at the size a
         topper is really seen from. 0.045 rather than thicker or thinner was chosen by looking: much
         below it the letter counters show wedges of the plate through the band, much above it the
         band goes lumpy — `offsetRing` is walking real glyph outlines, not stroking a font. */
      { kind: 'text', text: 'Ava', face: '__block', size: 1.05, x: 0, y: 0,
        colour: '#2C4433', offset: 0.045, offsetColour: '#FFFFFF' },
    ],
  },
  {
    /* A couple cake, and the clearest thing in the rail: every other preset is one piece, and this
       one says without a sentence that a topper can be several. */
    key: 'you-and-me',
    label: 'Two hearts for a couple',
    objects: [
      /* ⚠️ THEY OVERLAP, AND THE ORDER IS WHAT MAKES THAT READ. Set side by side with a gap they are
         two hearts near each other; overlapped, they are a pair — which is the whole point of the
         piece. The front heart's white band is what separates them: without it the two colours meet
         and the join reads as one odd shape rather than one card in front of another.

         ⚠️ EACH WORD FOLLOWS ITS OWN HEART, rather than both hearts then both words. Order is depth,
         so a word listed after both hearts would sit on top of the FRONT one even where it belongs
         to the heart behind — "You" would print across "Me"'s heart in the overlap. */
      { kind: 'shape', family: 'heart', size: 0.48, x: -0.40, y: 0,
        colour: '#D94F6E', offset: 0.05, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'You', face: '__block', size: 0.46, x: -0.46, y: -0.02,
        colour: '#FFFFFF', offset: 0, offsetColour: '#FFFFFF' },
      { kind: 'shape', family: 'heart', size: 0.48, x: 0.40, y: 0,
        colour: '#8E2F45', offset: 0.06, offsetColour: '#FFFFFF' },
      /* "You" is 2.377 wide at height 1 and "Me" is 1.774, so these two sizes are one letter height
         — see the note in the birthday preset. */
      { kind: 'text', text: 'Me', face: '__block', size: 0.343, x: 0.44, y: -0.02,
        colour: '#FFFFFF', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },

  {
    /* ⚠️ THE ONE PRESET WHOSE JOB IS THE MATERIAL, not the layout. Every other preset here shows an
       arrangement — a word on a shape, two hearts, two lines — and a baker who has never opened the
       Card control has no reason to. This says, without a sentence, that a piece can be cut from
       metallic card, and it picks the piece that is ALWAYS cut from it: nobody makes a pair of
       wedding rings in pink card.

       ⚠️ TWO RINGS AND A STONE, EACH ITS OWN OBJECT — not one clever outline. A baker can drag the
       stone, drop it, recolour a single ring, or keep the pair and throw the rest away, which is
       what makes this a starting point rather than a picture. It is also how the studio already
       works, so nothing here needs a mechanism of its own.

       ⚠️ THEY OVERLAP AND THEY DO NOT INTERLOCK, and that is honest rather than a shortcut. A real
       card topper is ONE FLAT PIECE: a band cannot pass over its neighbour at the top and under it
       at the bottom, because there is only one thickness of card. The photographs that show rings
       genuinely threaded are a single cut silhouette, and cutting that is a different thing from
       composing two rings. One in front of the other is what the card does.

       ⚠️ THE STONE BELONGS TO THE FRONT RING. Listed last so it sits on top of the band it is set
       into — listed before it, the ring would print across its own stone. Order is depth here, the
       same rule the couple preset above records. */
    key: 'rings',
    label: 'Two rings for a wedding',
    objects: [
      /* ⚠️ `size` IS THE BOX A SHAPE IS FITTED AROUND, never the shape's own width — the note on the
         heart preset above records what reasoning about this cost. A ring fitted to a 0.81 box comes
         out about 1.15 across, and the pair is measured in topperPresets.test.js rather than
         believed. */
      { kind: 'shape', family: 'ring', size: 0.81, x: 0.39, y: 0,
        colour: '#C9A227', finish: 'card_gold', offset: 0, offsetColour: '#FFFFFF' },
      { kind: 'shape', family: 'ring', size: 0.81, x: -0.39, y: 0,
        colour: '#C9A227', finish: 'card_gold', offset: 0, offsetColour: '#FFFFFF' },
      /* ⚠️ ITS POINT REACHES PAST THE BAND, into the ring's opening. A stone sits IN a setting. Set
         so the point lands ON the band instead, the pavilion's two sloping sides meet the band's
         outer edge either side of it and leave a little V of the ring's HOLE showing between them —
         a notch that reads as a badly drawn join. Crossing the band entirely covers it. */
      { kind: 'shape', family: 'gem', size: 0.26, x: -0.39, y: 0.68,
        colour: '#C9A227', finish: 'card_gold', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },
  {
    /* Two lines, because "Happy Birthday" on one line is a wide thin strip that reads as nothing on a
       round cake top — and two objects is also the honest way to show that a topper is a COMPOSITION
       rather than a single word. */
    key: 'birthday',
    label: 'Happy Birthday',
    objects: [
      /* ⚠️ THE TWO SIZES DIFFER SO THE LETTERS DO NOT. `size` is the word's WIDTH, and the word is
         fitted to it — so giving both lines the same size sets them to the same WIDTH, which makes
         the longer word's letters smaller. "Happy" came out visibly bigger than "Birthday", which
         reads as a mistake rather than a style. 1.54 / 1.15 is their width ratio at a common height
         (4.209 / 3.146), measured rather than nudged by eye. */
      { kind: 'text', text: 'Happy', face: '__block', size: 1.15, x: 0, y: 0.42,
        colour: '#8E2F45', offset: 0.07, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'Birthday', face: '__block', size: 1.54, x: 0, y: -0.42,
        colour: '#8E2F45', offset: 0.07, offsetColour: '#FFFFFF' },
    ],
  },
]);



/* ── The outline of a preset, as flat paths ─────────────────────────────────────────────────────
 *
 * ⚠️ CUT FROM THE SAME CONTOURS THE CAKE IS (INVARIANTS #15). `topperSheets` is the one function that
 * answers "what shape is this topper", and this asks it — so a preset's picture cannot drift from
 * the piece, because there is nothing to drift: the polygons here are the polygons extruded there,
 * in the same order and the same colours.
 *
 * A second WebGL canvas per button was the alternative and is worse in every direction: more
 * contexts on a phone, more scenes to keep lit like the cake, and a preview that could quietly stop
 * matching. Flat paths of the real outlines cannot.
 *
 * It is a PLAN of the piece, not a render — no lighting, no thickness, no shadow. The studio canvas
 * is where the real thing appears the moment one is picked.
 *
 * Plain JS and not JSX on purpose: this is measurable and testable without a browser, and the sizing
 * of every preset was got wrong once by reasoning about it instead. */
export function presetPaths(objects, font) {
  const sheets = topperSheets({ v: 1, objects }, () => font);
  let lo = Infinity, hi = -Infinity, bo = Infinity, to = -Infinity;
  for (const sh of sheets) {
    for (const p of sh.parts) for (const q of p.outer) {
      const x = q.x + (sh.x ?? 0), y = q.y + (sh.y ?? 0);
      if (x < lo) lo = x; if (x > hi) hi = x;
      if (y < bo) bo = y; if (y > to) to = y;
    }
  }
  if (!Number.isFinite(lo) || hi <= lo) return null;

  /* SVG's y grows DOWNWARD and the composer's grows up, so every point is flipped. Getting this
     wrong does not throw — it draws the topper upside down, which on a heart is obvious and on a
     word is just wrong enough to look like a bad font. */
  const ring = (pts, dx, dy) => pts.map((q, i) =>
    `${i ? 'L' : 'M'}${(q.x + dx).toFixed(3)} ${(-(q.y + dy)).toFixed(3)}`).join('') + 'Z';

  const paths = sheets.map((sh, i) => ({
    key: i,
    colour: sh.colour,
    /* ⚠️ THE FINISH TRAVELS WITH THE PATH, or a metallic preset draws as a flat fill of the card's
       own hex — which is MUSTARD, the exact thing metallic gold exists to answer. The icon is a plan
       of the piece and not a render, but "gold" is not a layout fact it can leave out. */
    finish: sh.finish ?? null,
    d: sh.parts.map(p => ring(p.outer, sh.x ?? 0, sh.y ?? 0)
      + (p.holes ?? []).map(h => ring(h, sh.x ?? 0, sh.y ?? 0)).join('')).join(''),
  }));

  const pad = (hi - lo) * 0.06;
  return {
    paths,
    width: hi - lo,
    height: to - bo,
    viewBox: `${lo - pad} ${-to - pad} ${hi - lo + pad * 2} ${to - bo + pad * 2}`,
  };
}
