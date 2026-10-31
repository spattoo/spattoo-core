import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  generationSteps, stepAnswered, blankSteps, canAdvance, firstUnanswered,
} from './generationSteps.js';

// Two questions shaped like the API's rows (Admin → Elements → Generation Questions authors them).
const QUESTIONS = [
  { key: 'medium', label: 'Made of', kind: 'choice', options: [{ key: 'fondant', label: 'Fondant' }] },
  { key: 'look',   label: 'How should it look', kind: 'text' },
];
const keys = (steps) => steps.map(s => s.key);

describe('the steps are derived from the questions, never listed', () => {
  it('puts the subject first and the review last, with a step per question between', () => {
    expect(keys(generationSteps({ questions: QUESTIONS })))
      .toEqual(['__subject', 'medium', 'look', '__review']);
  });

  it('grows a step when a question is added, with no code change', () => {
    const three = [...QUESTIONS, { key: 'size', label: 'How big', kind: 'choice', options: [] }];
    expect(generationSteps({ questions: three })).toHaveLength(5);
    expect(keys(generationSteps({ questions: three }))).toContain('size');
  });

  it('still works when the API returns nothing at all', () => {
    // A failed fetch must leave a usable wizard, not a blank screen: a baker can describe the thing
    // and generate. The questions narrow a prompt that already works without them.
    expect(keys(generationSteps({}))).toEqual(['__subject', '__review']);
    expect(keys(generationSteps({ questions: null }))).toEqual(['__subject', '__review']);
  });

  it('keeps the order the API gave, because that is sort_order', () => {
    const reversed = [...QUESTIONS].reverse();
    expect(keys(generationSteps({ questions: reversed })))
      .toEqual(['__subject', 'look', 'medium', '__review']);
  });

  it('skips a half-authored row rather than rendering an unanswerable step', () => {
    const broken = [{ key: 'ok', label: 'Fine' }, { key: 'nolabel' }, { label: 'no key' }];
    expect(keys(generationSteps({ questions: broken }))).toEqual(['__subject', 'ok', '__review']);
  });

  // ⚠️ THE RULE THIS FILE EXISTS FOR. A hardcoded step list is the drift check:prompt-vocab already
  // guards one file down — the questions in the database, their number in code.
  it('names no question of its own', () => {
    const src = readFileSync(new URL('./generationSteps.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    // ⚠️ WORD BOUNDARIES, NOT `toContain`. The first version of this test failed on `recolourable`
    // because it contains "colour" — a substring match flags the one output key this file is
    // legitimately allowed to name. A gate that cries wolf on correct code gets deleted.
    for (const word of ['medium', 'fondant', 'look', 'pose', 'sitting', 'colour', 'size']) {
      expect(src.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });
});

describe('naming parts is only asked when the parts come back', () => {
  it('asks on the recolourable path', () => {
    expect(keys(generationSteps({ questions: QUESTIONS, output: 'recolourable' })))
      .toEqual(['__subject', 'medium', 'look', '__parts', '__review']);
  });

  it('does not ask on the ready-to-use path, where the answer would be ignored', () => {
    // Ready-to-use arrives as one fused mesh with the colour baked into a texture atlas. Asking a
    // baker to name parts we will not hand back teaches them to click through the wizard.
    expect(keys(generationSteps({ questions: QUESTIONS, output: 'ready' }))).not.toContain('__parts');
  });
});

describe('answered, blank and advancing', () => {
  const steps = generationSteps({ questions: QUESTIONS, output: 'recolourable' });
  const [subject, medium, look, parts, review] = steps;

  it('reads an answer off the right place for each kind', () => {
    expect(stepAnswered(subject, { subject: 'a bear' })).toBe(true);
    expect(stepAnswered(medium, { answers: { medium: 'fondant' } })).toBe(true);
    expect(stepAnswered(parts, { partWords: 'bow, ears' })).toBe(true);
    expect(stepAnswered(review, {})).toBe(true);     // nothing to answer
  });

  it('treats whitespace as unanswered', () => {
    // The realistic version of this is a baker clearing the box and leaving a space behind.
    expect(stepAnswered(subject, { subject: '   ' })).toBe(false);
    expect(stepAnswered(medium, { answers: { medium: '  ' } })).toBe(false);
  });

  it('names every blank step, and never the review', () => {
    expect(keys(blankSteps(steps, { subject: 'a bear' }))).toEqual(['medium', 'look', '__parts']);
    expect(keys(blankSteps(steps, {}))).not.toContain('__review');
  });

  it('blocks only on the subject — everything else may be skipped on purpose', () => {
    expect(canAdvance(subject, { subject: '' })).toBe(false);
    expect(canAdvance(subject, { subject: 'a bear' })).toBe(true);
    for (const s of [medium, look, parts, review]) expect(canAdvance(s, {})).toBe(true);
  });

  it('resumes at the first thing not yet said', () => {
    expect(firstUnanswered(steps, {})).toBe(0);
    expect(firstUnanswered(steps, { subject: 'a bear' })).toBe(1);
    expect(firstUnanswered(steps, { subject: 'a bear', answers: { medium: 'fondant', look: 'fluffy' },
                                    partWords: 'bow' })).toBe(steps.length - 1);
  });
});
