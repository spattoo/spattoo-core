import { describe, it, expect } from 'vitest';
import {
  REQUIRED_TAG_CATEGORIES, missingRequiredCategories, requiredTagMessage, ageRangeProblem,
} from './tagRequirements.js';

/* ── What a template must say about itself ───────────────────────────────────────────────────────
 *
 * The rule exists because UNSET DOES NOT MEAN "SUITS NOBODY" — it means UNFILTERED. A template with
 * no age range answers every age query and one with no gender answers every gender query, and
 * nothing distinguishes "suits everyone" from "nobody filled this in". Requiring the field makes
 * those two different answers.
 *
 * The vocabulary below is the real one from migration 113: `girls`, `boys` and `anyone`. The third
 * is what makes the requirement answerable — with only two, a cake that is not gendered leaves an
 * author ticking both, ticking one falsely, or being blocked.
 */

// Shaped as `GET /tags` returns them, which is what both callers pass in.
const TAGS = [
  { id: 'g1', slug: 'girls',    name: 'Girls',    category: 'gender' },
  { id: 'g2', slug: 'boys',     name: 'Boys',     category: 'gender' },
  { id: 'g3', slug: 'anyone',   name: 'Anyone',   category: 'gender' },
  { id: 'o1', slug: 'birthday', name: 'Birthday', category: 'occasion' },
  { id: 'e1', slug: 'sorry',    name: 'Sorry',    category: 'emotion' },
];

describe('which required categories are unanswered', () => {
  it('reports gender when the author ticked nothing in it', () => {
    expect(missingRequiredCategories(TAGS, new Set())).toEqual(['gender']);
  });

  it('is satisfied by any ONE value, including "anyone"', () => {
    for (const id of ['g1', 'g2', 'g3']) {
      expect(missingRequiredCategories(TAGS, new Set([id]))).toEqual([]);
    }
  });

  /* Ticking every other category is not an answer to this one — the whole point is that a template
     filed under Birthday and nothing else still answers every gender query. */
  it('is not satisfied by tags from other categories', () => {
    expect(missingRequiredCategories(TAGS, new Set(['o1', 'e1']))).toEqual(['gender']);
  });

  /* ⚠️ THE LOAD-BEARING GUARD. A host whose vocabulary has no gender rows — a fresh environment, a
     failed fetch, an API older than migration 113 — would otherwise be unable to save a template at
     all, blocked by a message naming chips that are not on screen. Same shape as the
     `filterTags.length > 0 &&` guard the chip section already carries. */
  it('does not require a category the vocabulary does not offer', () => {
    const noGender = TAGS.filter(t => t.category !== 'gender');
    expect(missingRequiredCategories(noGender, new Set())).toEqual([]);
  });

  it('takes a Set or any iterable, because the two callers hold ids differently', () => {
    expect(missingRequiredCategories(TAGS, ['g1'])).toEqual([]);
    expect(missingRequiredCategories(TAGS, new Set(['g1']))).toEqual([]);
  });

  it('survives an absent vocabulary and an absent selection', () => {
    expect(missingRequiredCategories(undefined, undefined)).toEqual([]);
    expect(missingRequiredCategories(null, null)).toEqual([]);
  });

  it('only gender is required — a short list on purpose', () => {
    // A required field whose honest answer is the same most of the time teaches people to click
    // past it, so every addition here has to earn its place.
    expect(REQUIRED_TAG_CATEGORIES).toEqual(['gender']);
  });
});

describe('the sentence shown for what is missing', () => {
  it('says nothing when nothing is missing', () => {
    expect(requiredTagMessage([])).toBe(null);
    expect(requiredTagMessage(undefined)).toBe(null);
  });

  /* Names the CHOICES, not the field. "Gender is required" tells an author what the form wants;
     this tells them what to answer. */
  it('names the values an author can pick', () => {
    expect(requiredTagMessage(['gender'])).toBe('Choose who this cake suits — Girls, Boys or Anyone.');
  });

  it('falls back readably for a category it has no wording for', () => {
    expect(requiredTagMessage(['some_new_category'])).toBe('Choose some new category.');
  });
});

describe('the age range', () => {
  /* ⚠️ BLANK IS NOT ALLOWED AND THERE IS NO DEFAULT. Sandeep: "if it matches 1-100, then the author
     say that." A pre-filled 1–100 would mean "everyone" without anybody deciding it, which turns a
     field carrying signal into one carrying a default — the same as having no field. */
  it('rejects blank, either end', () => {
    expect(ageRangeProblem('', '')).toMatch(/say which ages/i);
    expect(ageRangeProblem('1', '')).toMatch(/say which ages/i);
    expect(ageRangeProblem('', '100')).toMatch(/say which ages/i);
    expect(ageRangeProblem(null, null)).toMatch(/say which ages/i);
    expect(ageRangeProblem(undefined, undefined)).toMatch(/say which ages/i);
  });

  it('accepts the honest "suits everybody" — stated, not defaulted', () => {
    expect(ageRangeProblem('1', '100')).toBe(null);
  });

  it('accepts a real range, and the inputs hand it strings', () => {
    expect(ageRangeProblem('2', '12')).toBe(null);
    expect(ageRangeProblem(2, 12)).toBe(null);
  });

  it('accepts a single year, where min equals max', () => {
    expect(ageRangeProblem('4', '4')).toBe(null);
  });

  it('rejects a range that runs backwards', () => {
    expect(ageRangeProblem('12', '2')).toMatch(/youngest/i);
  });

  it('rejects anything that is not a whole number', () => {
    expect(ageRangeProblem('abc', '12')).toMatch(/whole numbers/i);
    expect(ageRangeProblem('2', 'x')).toMatch(/whole numbers/i);
  });

  /* 0 is falsy, and a blank check written as `!minAge` would reject it. A cake suiting a newborn is
     a real thing to author. */
  it('treats 0 as a number, not as blank', () => {
    expect(ageRangeProblem(0, 1)).toBe(null);
    expect(ageRangeProblem('0', '1')).toBe(null);
  });
});
