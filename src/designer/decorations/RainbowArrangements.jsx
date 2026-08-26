// ── The rainbow arrangements, and the tiles that choose them ─────────────────────────────────────
// THE source of truth for what arrangements exist, shared by the customer's edit card and the admin
// studio (INVARIANTS #3). It was written in the studio first and belongs here now that a customer
// picks from it: two copies of this list is a studio tuned to one shape and a cake showing another.
//
// Each tile carries its WHOLE shape, not one flag. That is the lesson from the round where picking
// "over, falling right" from a centred arrangement changed the feet and moved nothing — the arch
// stayed in the middle and the choice looked broken. `surface`, the feet, the spring, the scale and
// the offset all travel together, because they are one decision.
//
// Both leaning tiles use the SAME positive offset: `offsetX` is measured toward the side the rainbow
// falls, so "falling left" mirrors without a second number.
//
// Position is NOT here. Where a rainbow stands is dragged, and an arrangement that carried a
// position would drag a customer's rainbow back to the middle every time they changed its shape.
// `offsetX` is the exception and is not a position: it is how far the arch straddles along its own
// plane, which is what makes it lean at all.

// The stack as the ICONS draw it, flattened to a 40×46 box. Heights and widths taper the way the
// real tiers do, so a 3-tier icon reads as a 3-tier cake and not as a wedding cake drawn by someone
// who has not seen one.
const BOARD_Y = 41;

export function iconTiers(tiers) {
  const boxes = [];
  let base = BOARD_Y;
  for (let i = 0; i < tiers; i++) {
    const w = 24 - i * 5.5;
    const h = tiers === 1 ? 19 : (tiers === 2 ? 13 - i * 2 : 11 - i * 1.5);
    boxes.push({ x: 20 - w / 2, w, cx: 20, base, top: base - h });
    base -= h;
  }
  return boxes;
}

// The two feet of a LEANING arch: one resting on the tier, one hanging past its edge. Defined by
// where the feet go rather than by a radius, because a radius that suits the top tier of a stack
// runs the bottom tier's arch off the side of a 40-wide icon — which is what a radius did.
// `dir` is +1 falling right, -1 falling left.
function leanFeet(t, dir) {
  const rest = t.cx + dir * (t.w * 0.5 - t.w * 0.28);
  const fall = t.cx + dir * Math.min(t.w * 0.5 + 5, 17);
  return dir > 0 ? [rest, fall] : [fall, rest];
}

export const RAINBOW_ARRANGEMENTS = [
  { key: 'fall-right', surface: 'top', label: 'Over, falling right',
    params: { footLeft: 'top', footRight: 'board', spring: 1, offsetX: 0.71, standoff: 0,
              scale: 1, flatten: 0 },
    draw: (t, floor) => {
      const [a, b] = leanFeet(t, 1);
      const r = (b - a) / 2;
      return <path d={`M${a} ${t.top} A${r} ${r} 0 0 1 ${b} ${t.top} L${b} ${floor}`} />;
    } },
  { key: 'fall-left', surface: 'top', label: 'Over, falling left',
    params: { footLeft: 'board', footRight: 'top', spring: 1, offsetX: 0.71, standoff: 0,
              scale: 1, flatten: 0 },
    draw: (t, floor) => {
      const [a, b] = leanFeet(t, -1);
      const r = (b - a) / 2;
      return <path d={`M${a} ${floor} L${a} ${t.top} A${r} ${r} 0 0 1 ${b} ${t.top}`} />;
    } },
  // spring 1, NOT above it. Past 1 the springing point rises above the cake top and the arch grows
  // LEGS to reach it — it stood on 0.38 of stilt, floating clear of the cake it was supposed to be
  // sitting on. At 1 the springing point is pinned to the feet, so the arc rests straight on the
  // surface. scale 0.75 puts the feet inside the rim and the arch about 61% of the cake's height,
  // which is the proportion in the references.
  { key: 'on-top', surface: 'top', label: 'Sitting on top',
    params: { footLeft: 'top', footRight: 'top', spring: 1, offsetX: 0, standoff: 0,
              scale: 0.75, flatten: 0 },
    draw: t => {
      const r = t.w * 0.34;
      return <path d={`M${t.cx - r} ${t.top} A${r} ${r} 0 0 1 ${t.cx + r} ${t.top}`} />;
    } },
  // The scrolled one: the same arch, with the ends rolled up instead of reaching for anything. Its
  // own tile rather than a tick-box beside the others, because to a customer it is a DIFFERENT
  // rainbow — the thing they point at in a photo — and the tiles are what they point at here.
  //
  // Left foot on the cake, right end curled, which is the reference: the plain side tucks behind a
  // cloud and the curled side is the whole look.
  // spring 1.16, not 1. The arch springs a little ABOVE the cake top, which is what gives the stack
  // of curls room to stand on the cake rather than starting inside it. Dialled in against the
  // reference rather than derived — 1 puts the springing point exactly on the surface, and the
  // lowest coil then has nowhere to sit.
  { key: 'curled', surface: 'top', label: 'Curled ends',
    params: { footLeft: 'top', footRight: 'curl', spring: 1.16, offsetX: 0, standoff: 0,
              scale: 0.75, flatten: 0 },
    draw: t => {
      const r = t.w * 0.30;
      // Walked, like the geometry walks it, so the icon is the object rather than a guess at it.
      // SVG's y points DOWN, which is the only difference.
      const seg = [];
      let th = Math.PI / 2, px = t.cx + r, py = t.top, rad = r * 0.42;
      const steps = 20, dth = (Math.PI * 2 * 1.2) / steps;
      for (let i = 0; i < steps; i++) {
        rad = Math.max(r * 0.09, rad * 0.90);
        th -= dth;
        px += Math.cos(th) * rad * dth;
        py += Math.sin(th) * rad * dth;
        seg.push(`L${px.toFixed(1)} ${py.toFixed(1)}`);
      }
      return <path d={`M${t.cx - r} ${t.top} A${r} ${r} 0 0 1 ${t.cx + r} ${t.top}${seg.join('')}`} />;
    } },
  // The wall one with its ends rolled up. The geometry needed nothing: the coils are built in the
  // flat frame like the rest of the band and `wrapToWall` bends them round the tier with it, so they
  // hug the cake at the same distance the ropes do — measured at 1.278 from the axis on a tier of
  // 1.2, which is the radius plus half a rope plus `proud`.
  //
  // Its stack rests on the BOARD rather than the cake top, and that falls out of the construction
  // too: the chain rests its first coil on whatever the rainbow's other end stands on.
  { key: 'wall-curled', surface: 'side', label: 'On the wall, curled',
    params: { footLeft: 'board', footRight: 'curl', spring: 0.18, offsetX: 0, standoff: 0,
              theta: -0.09, proud: 0.02, scale: 0.75, flatten: 0,
              bands: 6, innerRadius: 0.30, thickness: 0.12 },
    draw: t => {
      const r = Math.min(t.w * 0.30, (t.base - t.top) * 0.75);
      const y = t.base - 1;
      const seg = [];
      let th = Math.PI / 2, px = t.cx + r, py = y, rad = r * 0.34;
      const steps = 16, dth = (Math.PI * 2 * 1.1) / steps;
      for (let i = 0; i < steps; i++) {
        rad = Math.max(r * 0.10, rad * 0.90);
        th -= dth;
        px += Math.cos(th) * rad * dth;
        py += Math.sin(th) * rad * dth;
        seg.push(`L${px.toFixed(1)} ${py.toFixed(1)}`);
      }
      return <path d={`M${t.cx - r} ${y} A${r} ${r} 0 0 1 ${t.cx + r} ${y}${seg.join('')}`} />;
    } },
  // ONE wall tile, not two. The pair that was here differed only in HEIGHT — ends on the board
  // versus floating partway up — and the spring already moves it between them. A chooser offering
  // two points on a slider as though they were different shapes is a chooser with a wasted tile.
  // Every number was dialled in by hand and handed over as "take this as the default", so it is
  // transcribed rather than derived. Two are things nobody would guess: flatten is ZERO (round ropes
  // read better on a wall than pressed ribbons, whatever the photos suggest), and the arch is turned
  // slightly off dead-centre, which stops it looking like a diagram.
  { key: 'wall', surface: 'side', label: 'On the wall',
    params: { footLeft: 'board', footRight: 'board', spring: 0.18, offsetX: 0, standoff: 0,
              theta: -0.09, proud: 0.02, scale: 0.75, flatten: 0,
              bands: 6, innerRadius: 0.30, thickness: 0.12 },
    draw: t => {
      const r = Math.min(t.w * 0.30, (t.base - t.top) * 0.75);
      return <path d={`M${t.cx - r} ${t.base - 1} A${r} ${r} 0 0 1 ${t.cx + r} ${t.base - 1}`} />;
    } },
];

// Which arrangement a rainbow currently IS.
//
// On the wall the FEET are still not part of the choice — where it sits up the wall is the drag's
// job, and a wall rainbow saved with no feet at all would otherwise match no tile and leave the
// chooser blank. But whether its ends CURL is part of the choice, because that is now two different
// wall tiles. Matching on the surface alone would have highlighted the first of them for both.
const curls = x => x?.footLeft === 'curl' || x?.footRight === 'curl';

export function arrangementOf(rb) {
  return RAINBOW_ARRANGEMENTS.find(a =>
    (rb?.surface ?? 'top') === a.surface
    && curls(rb) === curls(a.params)
    && (a.surface === 'side'
        || (rb?.footLeft === a.params.footLeft && rb?.footRight === a.params.footRight)));
}

/**
 * One tile: a cake in outline with the arrangement drawn against it.
 *
 * The stack and the chosen tier are the same in every tile, so the only difference between them is
 * the rainbow — and one drawing answers "which tier" and "which arrangement" at once, which is how
 * the choice is actually made. Nobody picks "on the wall" and then wonders whose wall.
 */
export function ArrangementTile({ item, on, onPick, tiers = 1, tierIndex = 0, size = 46 }) {
  const boxes = iconTiers(tiers);
  const t = boxes[Math.min(tierIndex, boxes.length - 1)];
  // What a falling foot lands on: the tier below, or the board when there is nothing below.
  const floor = tierIndex === 0 ? BOARD_Y : boxes[tierIndex - 1].top;
  return (
    <button type="button" onClick={onPick} title={item.label} aria-pressed={on}
      style={{ border: `1.5px solid ${on ? '#1a1a1a' : '#E3E0DA'}`, background: on ? '#F4F7F4' : '#fff',
        borderRadius: 10, padding: '5px 3px 3px', cursor: 'pointer', width: size + 28,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: 'inherit' }}>
      <svg viewBox="0 0 40 46" style={{ width: size, height: size * 1.13 }}>
        <ellipse cx="20" cy="42" rx="17" ry="3" fill="#EDE7DA" />
        {boxes.map((b, i) => (
          <rect key={i} x={b.x} y={b.top} width={b.w} height={b.base - b.top} rx="1.5"
                fill={i === tierIndex ? '#FFFFFF' : '#F7F5F1'}
                stroke={i === tierIndex ? '#C9C1B4' : '#DDD8CF'} />
        ))}
        <g fill="none" stroke={on ? '#1a1a1a' : '#B7AEA1'} strokeWidth="2.6" strokeLinecap="round">
          {item.draw(t, floor)}
        </g>
      </svg>
      <span style={{ fontSize: 9, lineHeight: 1.2, color: '#5B6B60', textAlign: 'center' }}>
        {item.label}
      </span>
    </button>
  );
}
