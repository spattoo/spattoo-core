import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Moving a border up the wall: one answer, two ways of asking ─────────────────────────────────
 *
 * A ring, a swag and a wrap band go all the way round, so there is no piece to place and no angle to
 * write — which is why `useSinglePieceDrag` skips them, and why for a long time the ONLY way to move
 * one was the card's Height stepper: a ±0.05 button beside a number. Reported as wanting to slide it
 * on the cake instead, and the reason is plain — the baker is looking at the cake, and the answer
 * they want is where their finger is.
 *
 * ⚠️ WHAT MUST NOT HAPPEN IS THE TWO DISAGREEING. A drag that clamped itself would let a baker push a
 * border somewhere the ± buttons refuse to, and the same cake would then have two answers to "how far
 * can this go". `festoon.js`'s neighbour already records this class of mistake, and the note above
 * `boardYoBounds` in CakeDesigner asks for exactly one definition (INVARIANTS #3). So both paths end
 * at `setBoardAnchor`, and these are the assertions that keep them there.
 *
 * Source assertions, because what is being pinned is the WIRING — which function each path calls —
 * and the clamp arithmetic itself already has real tests in geometry/boardBands.test.js.
 */
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const designer = read('./CakeDesigner.jsx');
const tier     = read('./canvas/CakeTier.jsx');
const canvas   = read('./canvas/CakeCanvas.jsx');

describe('the Height stepper and the on-cake drag are the same move', () => {
  it('both go through setBoardAnchor, which is the only place that clamps', () => {
    expect(designer).toMatch(/function setBoardAnchor\(tierIndex, cur, desiredYo\)/);
    // The stepper: a nudge from wherever the layer's anchor already is.
    expect(designer).toMatch(/function handlePipingBoardYOffsetChange[\s\S]{0,400}?setBoardAnchor\(tierIndex, cur, boardAnchorBase\(cur, tierIndex\) \+ v\)/);
    // The drag: an absolute height, straight off the wall. No delta arithmetic to round differently.
    expect(designer).toMatch(/function handlePipingLayerHeight[\s\S]{0,300}?setBoardAnchor\(tierIndex, cur, wallY\)/);
  });

  /* ⚠️ A bend measures from a fraction of the wall and a discrete shell from its own configured
     offset — two different origins, and the one thing most likely to be duplicated and then drift. */
  it('asks one function where a layer\'s anchor is measured from', () => {
    expect(designer).toMatch(/function boardAnchorBase\(cur, tierIndex\)[\s\S]{0,120}?BEND_ANCHOR_FRAC/);
    /* ⚠️ It was FOUR copies of the same sentence — pipingBand, nextFestoonYOffset, the drag preview
       and the Height control — and the on-cake drag was about to be the fifth. Two matches left: the
       import, and the one place that reads it. (A third is this rule's own comment, which is stripped
       before counting so the prose about the fix cannot satisfy the check for it.) */
    const code = designer.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code.match(/BEND_ANCHOR_FRAC/g)).toHaveLength(2);
  });

  it('clamps a bend to the wall and a shell to its neighbours, still in that one place', () => {
    const body = /function setBoardAnchor[\s\S]*?\n  \}/.exec(designer)[0];
    expect(body).toMatch(/cur\.bend/);
    expect(body).toMatch(/boardYoBounds\(cur, tierIndex\)/);
    expect(body).toMatch(/clampYo/);
  });
});

describe('the gesture', () => {
  /* Vertical only. A ring has no angle to write, and letting the pointer drag it sideways would
     write nothing while looking like it should — worse than not offering it. */
  it('hits the WALL, so the height follows the pointer rather than a plane it started on', () => {
    const hook = /function useLayerHeightDrag[\s\S]*?\n\}/.exec(tier)[0];
    expect(hook).toMatch(/wallHit\(/);
    expect(hook).not.toMatch(/planeHit\(/);
    expect(hook).toMatch(/onMoveHeight\(hit\.y - wall\.baseY \+ grabOff\)/);   // tier-local, the anchor's own frame
  });

  /* ⚠️ INVARIANTS #10 LAW 5 — `handleAt` and `dragTo` are exact inverses, which in a gesture means
     what you grabbed stays under the pointer. The first cut wrote the pointer's own height as the
     anchor, and a garland is grabbed by a BEAD while its anchor is somewhere else entirely: the
     layer leapt by however far those two happened to be apart, then followed correctly. Nothing
     errors, the suite passed, and it is only visible if you press one and watch the first frame.
     Measured ONCE, on the first move that counts as a drag, because the anchor moves as the drag
     proceeds and re-reading it every frame would cancel the correction out. */
  it('keeps what you grabbed under the pointer, instead of jumping the anchor to it', () => {
    const hook = /function useLayerHeightDrag[\s\S]*?\n\}/.exec(tier)[0];
    expect(hook).toMatch(/let grabOff = null;/);
    expect(hook).toMatch(/if \(grabOff == null\) grabOff = anchorY - \(hit\.y - wall\.baseY\);/);
    // Inside the pointerdown, so a fresh press re-measures: the anchor has moved since the last one.
    expect(/function \(e\)|return \(e\) => \{[\s\S]*?let grabOff = null;/.test(hook)).toBe(true);
  });

  /* ⚠️ THE TWO HALVES THAT MUST TRAVEL TOGETHER. r3f bubbles the press up the group, so one handler
     covers a ring of forty shells — but OrbitControls is suspended by a CAPTURE-phase raycast that
     reads `isPipingHandle` off whatever the ray actually hit, which is a mesh. With only the group
     handler the press rotates the cake and the drag never starts; with only the mark just one shell
     would be grabbable. Both were needed for the single-piece drag too; this is the same lesson. */
  it('marks the meshes as well as taking the press on the group', () => {
    expect(tier).toMatch(/onPointerDown: heightDrag/);
    expect(tier).toMatch(/const grab = heightDrag \? PIPING_HANDLE_DATA : null/);
    for (const carrier of [/renderWrap\(\{[^)]*userData: grab/, /renderFestoons\(\{[^)]*userData: grab/,
                           /renderShells\(\{[\s\S]{0,300}?userData: grab/, /forceHandle=\{!!heightDrag\}/]) {
      expect(tier).toMatch(carrier);
    }
    expect(canvas).toMatch(/h\.object\.userData\.isPipingHandle/);
  });

  /* Only where the piece rides a wall. A rim ring sits ON the top edge, and lifting it would leave it
     in mid-air — the same reason the single-piece drag sends no height for the rim. */
  it('is offered on the side/board zone and not on the rim', () => {
    expect(tier).toMatch(/onMoveHeight=\{onPipingLayerHeight \? \(wallY\) => onPipingLayerHeight\(p\.layerId, wallY\)/);
    const rimRing = tier.slice(tier.indexOf('// ── Top piping ring'), tier.indexOf('// ── Bottom piping ring'));
    expect(rimRing).not.toMatch(/useLayerHeightDrag/);
  });

  /* It is the second way, not the only one — but a gesture nobody is told about is one nobody finds,
     which is how this arrived as a complaint about the stepper rather than about the drag. */
  it('says so on the card', () => {
    expect(designer).toMatch(/Or drag it up and down the cake\./);
  });
});
