import { describe, it, expect } from 'vitest';
import { buildSteps, supportingPart, piecesAtStep } from './fondantSteps.js';
import { PRESETS, defaultPart } from './fondantParts.js';

const P = (id, pos, size, extra = {}) => ({ ...defaultPart('ball', id), pos, size, ...extra });

/* The claim this module makes is that the PARTS LIST IS THE RECIPE — no second source, nothing
 * authored, nothing that can drift from the figure. These protect the two things that would
 * quietly make a guide wrong rather than absent, which is the worse failure: a baker follows a
 * confident instruction to the wrong place.
 */

describe('which piece it is pressed onto', () => {
  // ⚠️ Found with the same contact maths that PLACED the piece, never guessed from names. A
  // hand-written "press it onto the head" goes silently wrong the first time somebody moves an ear.
  it('names the piece actually holding it up', () => {
    const body = P('body', [0, 0.4, 0], [0.4, 0.4, 0.4]);
    const head = P('head', [0, 1.0, 0], [0.3, 0.3, 0.3]);
    const ear  = P('ear',  [0.2, 1.3, 0], [0.1, 0.1, 0.1]);
    expect(supportingPart(ear, [body, head])?.id).toBe('head');
  });

  it('is null for the piece that sits on the board', () => {
    expect(supportingPart(P('body', [0, 0.4, 0], [0.4, 0.4, 0.4]), [])).toBe(null);
  });

  // A piece standing beside the figure rests on the board, not on its neighbour.
  it('is null when nothing is underneath it', () => {
    const body = P('body', [0, 0.4, 0], [0.4, 0.4, 0.4]);
    expect(supportingPart(P('aside', [5, 0.2, 0], [0.2, 0.2, 0.2]), [body])).toBe(null);
  });
});

describe('the steps', () => {
  const steps = buildSteps(PRESETS.bear.parts());

  it('is one step per STORED piece, not per drawn one', () => {
    // A mirrored pair is one action at a bench. Two steps would have the baker make an ear, then
    // make the same ear again.
    expect(steps).toHaveLength(PRESETS.bear.parts().length);
    expect(steps.every(s => s.of === steps.length)).toBe(true);
  });

  it('accumulates — each step carries the figure as it stands after it', () => {
    expect(steps[0].upto).toHaveLength(1);
    expect(steps.at(-1).upto).toHaveLength(steps.length);
    // And the drawn count grows past the stored count once a pair appears.
    expect(piecesAtStep(steps, steps.length - 1)).toBeGreaterThan(steps.length);
  });

  it('starts with the body, sized against the cake', () => {
    expect(steps[0].title).toBe('body');
    expect(steps[0].instruction).toMatch(/against the cake/i);
  });

  // ⚠️ Absolute sizes are useless at a bench. Everything is judged against the body, which is the
  // one piece with an outside reference.
  it('sizes every later piece against the body', () => {
    // Every bucket, including the smallest — eyes and a nose are where a relative scale is needed
    // most, and the first cut left exactly those with nothing to judge them by.
    for (const s of steps.slice(1)) expect(s.instruction).toMatch(/the body/);
  });

  it('tells the baker what to press each piece onto', () => {
    expect(steps.find(s => s.title === 'ears').instruction).toMatch(/Press them onto the head/);
    expect(steps.find(s => s.title === 'nose').instruction).toMatch(/Press it onto the muzzle/);
  });

  /* ⚠️ THE BUG THIS EXISTS FOR. The first version asked which earlier piece would CATCH this one if
     it fell, and took the highest answer — so an arm sitting beside the body at chest height was
     reported as resting on an EAR, because an ear high on the head would indeed catch it from
     above. The guide then told a baker, in confident English, to press the arms onto the ear.
     Every attachment is checked here, because one wrong one is worse than no guide at all. */
  it('attaches every piece where it actually touches', () => {
    expect(steps.map(s => `${s.title}→${s.onId ?? 'board'}`)).toEqual([
      'body→board', 'head→body', 'muzzle→head', 'nose→muzzle',
      'eyes→head', 'ears→head', 'arms→body', 'legs→body',
    ]);
  });

  it('says "two" for a mirrored pair and names it as a plural', () => {
    const ear = steps.find(s => s.title === 'ears');
    expect(ear.pair).toBe(true);
    expect(ear.instruction).toMatch(/^Roll two/);
  });

  it('says "it", not "them", for a single piece', () => {
    const nose = steps.find(s => s.title === 'nose');
    expect(nose.pair).toBe(false);
    expect(nose.instruction).toMatch(/Press it onto/);
  });

  // A generated id names a SHAPE, not a body part — "Add the ball-3" is not an instruction.
  it('falls back to the shape name for an unnamed piece', () => {
    const s = buildSteps([P('body', [0, 0.4, 0], [0.4, 0.4, 0.4]), P('ball-3', [0, 0.9, 0], [0.1, 0.1, 0.1])]);
    expect(s[1].title).toBe('ball');
    expect(s[1].instruction).not.toMatch(/ball-3/);
  });

  it('skips a shape it does not know rather than describing one', () => {
    expect(buildSteps([{ ...P('x', [0, 0, 0], [1, 1, 1]), shape: 'sphere' }])).toEqual([]);
    expect(buildSteps(null)).toEqual([]);
    expect(buildSteps([])).toEqual([]);
  });
});
