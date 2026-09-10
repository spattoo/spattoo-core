import { useMemo } from 'react';
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
    key: 'number',
    label: 'A number',
    objects: [
      { kind: 'text', text: '10', face: '__block', size: 1.3, x: 0, y: 0,
        colour: '#E4572E', offset: 0.09, offsetColour: '#FFFFFF' },
    ],
  },
  {
    key: 'name-heart',
    label: 'A name on a heart',
    objects: [
      { kind: 'shape', family: 'heart', size: 2.0, x: 0, y: 0,
        colour: '#D94F6E', offset: 0.05, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'Mia', face: '__block', size: 0.62, x: 0, y: -0.05,
        colour: '#FFFFFF', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },
  {
    key: 'name-circle',
    label: 'A name on a circle',
    objects: [
      { kind: 'shape', family: 'circle', size: 1.9, x: 0, y: 0,
        colour: '#F2AEC4', offset: 0.05, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'Sara', face: '__block', size: 0.55, x: 0, y: 0,
        colour: '#4A2C1B', offset: 0, offsetColour: '#FFFFFF' },
    ],
  },
  {
    /* Two lines, because "Happy Birthday" on one line is a wide thin strip that reads as nothing on a
       round cake top — and two objects is also the honest way to show that a topper is a COMPOSITION
       rather than a single word. */
    key: 'birthday',
    label: 'Happy Birthday',
    objects: [
      { kind: 'text', text: 'Happy', face: '__block', size: 0.72, x: 0, y: 0.42,
        colour: '#8E2F45', offset: 0.07, offsetColour: '#FFFFFF' },
      { kind: 'text', text: 'Birthday', face: '__block', size: 0.72, x: 0, y: -0.42,
        colour: '#8E2F45', offset: 0.07, offsetColour: '#FFFFFF' },
    ],
  },
]);

/* ── The little picture on a preset button ──────────────────────────────────────────────────────
 *
 * ⚠️ IT IS DRAWN FROM THE SAME CONTOURS THE CAKE IS CUT FROM (INVARIANTS #15). `topperSheets` is the
 * one function that answers "what shape is this topper", and this asks it — so the picture cannot
 * drift from the piece, because there is nothing to drift: the polygons drawn here are the polygons
 * extruded there, in the same order and the same colours.
 *
 * A second WebGL canvas per button was the other option and is worse in every direction: four more
 * contexts on a phone, four more scenes to keep lit like the cake, and a preview that could quietly
 * stop matching. Flat SVG of the real outlines cannot.
 *
 * It does not try to be a render — no lighting, no thickness, no shadow. It is a plan of the piece,
 * and the canvas behind it is where the real thing appears the moment one is picked.
 */
export function PresetIcon({ objects, font, size = 46 }) {
  const built = useMemo(() => {
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
      d: sh.parts.map(p => ring(p.outer, sh.x ?? 0, sh.y ?? 0)
        + (p.holes ?? []).map(h => ring(h, sh.x ?? 0, sh.y ?? 0)).join('')).join(''),
    }));

    const pad = (hi - lo) * 0.06;
    return {
      paths,
      viewBox: `${lo - pad} ${-to - pad} ${hi - lo + pad * 2} ${to - bo + pad * 2}`,
    };
  }, [objects, font]);

  if (!built) return null;
  return (
    <svg viewBox={built.viewBox} width={size} height={size}
      style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {built.paths.map(p => (
        // evenodd, so a hole in a letter — the middle of an O — stays a hole.
        <path key={p.key} d={p.d} fill={p.colour} fillRule="evenodd" />
      ))}
    </svg>
  );
}
