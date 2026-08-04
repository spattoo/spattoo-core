// ── Suggesting a flavour ────────────────────────────────────────────────────────────────────────
// "I can't decide — help me pick", answered with a recommendation AND the reason for it.
//
// ── WHY RULES AND NOT A MODEL ───────────────────────────────────────────────────────────────────
// Not cost — accountability. A suggestion has to be EXPLAINABLE, because the customer is about to
// order a cake for an occasion that matters on the strength of it. "Children's birthdays nearly
// always go chocolate" is a sentence a rule can produce and a person can disagree with. A model
// writes better prose and cannot say where the answer came from, so a bad suggestion becomes
// unauditable. If rules prove too thin, a model is an upgrade rather than a dependency.
//
// ── THE RULES ARE GLOBAL; THE ANSWER IS PER BAKER ───────────────────────────────────────────────
// "A child's birthday goes chocolate" is a fact about people, not about a bakery. Spattoo writes it
// once. But the same rule run over THIS baker's flavours gives a different answer for every baker,
// because they stock different things — per-baker results without per-baker rules, which matters
// because a baker will never author a rule.
//
// ── DIETARY IS A FILTER, NEVER A SCORE ──────────────────────────────────────────────────────────
// If the customer said eggless and this baker cannot make eggless tiramisu, tiramisu is REMOVED —
// not ranked lower. Suggesting something the baker would then have to decline is worse than
// suggesting nothing, and `conflicts_with` already carries the answer per baker.

/**
 * The rule table.
 *
 * `when` is matched against the answers; an absent key means the rule does not care. `prefer` and
 * `avoid` name taste families. `weight` is how strongly it argues. `because` is what the customer
 * is told, and it must read as a reason a person would give — never as a rule id.
 *
 * Data, not code, so a rule can be added without touching the scorer.
 */
export const RULES = [
  {
    id: 'kids-chocolate',
    when: { recipient: 'child' },
    prefer: ['chocolate'], avoid: ['coffee', 'tea'], weight: 3,
    because: 'Children almost always go for chocolate.',
  },
  {
    id: 'kids-fruit-second',
    when: { recipient: 'child' },
    prefer: ['fruit'], weight: 1,
    because: 'A good bet for children who are not chocolate people.',
  },
  {
    id: 'crowd-safe',
    // Was `forWhom: 'crowd'`, which conflated a recipient with an audience size. These three are
    // the cases where the eater is a ROOM rather than a person — the thing the rule always meant.
    when: { recipient: ['colleagues', 'friends', 'family'] },
    prefer: ['classic', 'chocolate', 'caramel'], avoid: ['tea', 'indian'], weight: 2,
    because: 'Feeding a crowd means pleasing people you have never met.',
  },
  {
    id: 'couple-indulgent',
    when: { recipient: 'couple' },
    prefer: ['chocolate', 'nut'], weight: 2,
    because: 'Rich and a little indulgent, which is the point of an anniversary.',
  },
  {
    id: 'wedding-classic',
    when: { occasion: 'wedding' },
    prefer: ['classic', 'fruit'], avoid: ['coffee'], weight: 2,
    because: 'Weddings tend to want something everyone recognises.',
  },
  {
    id: 'adventurous',
    when: { mood: 'different' },
    prefer: ['tea', 'indian', 'nut', 'coffee'], avoid: ['classic'], weight: 3,
    because: 'Less expected, and the one people remember afterwards.',
  },
  {
    id: 'safe-anything',
    when: { mood: 'safe' },
    prefer: ['classic', 'chocolate'], weight: 2,
    because: 'Hard to go wrong with, whoever is eating it.',
  },
];

/** Weight added for a flavour the baker has marked as theirs. A tiebreak, not an argument. */
const SIGNATURE_WEIGHT = 1.5;
/** How strongly `crowd_pleaser` counts when the customer asked for a safe bet. */
const PLEASER_WEIGHT = 2;

// A rule's `when` value may be a LIST, meaning "any of these". Added when `crowd` left the recipient
// vocabulary: "feeding people you have never met" is not one recipient, it is several — colleagues,
// friends, the wider family — and three near-identical rules would have been worse than one.
const matches = (rule, answers) =>
  Object.entries(rule.when).every(([k, v]) =>
    (Array.isArray(v) ? v.includes(answers[k]) : answers[k] === v));

/**
 * Score every flavour this baker offers and return them best-first.
 *
 * Returns `[{ flavour, score, because }]`, where `because` is the sentence from the rule that
 * argued hardest for it — so the reason shown is the reason it actually won, rather than a
 * plausible one picked afterwards.
 *
 * A flavour with no `tasteFamily` scores nothing and never surfaces on rules alone. That is
 * deliberate: nobody has said what it is, and inventing an answer is the one thing this must not
 * do. It can still appear as a fallback below.
 */
export function suggestFlavours(flavours, answers, { dietaryKeys = [] } = {}) {
  const eligible = flavours.filter(f => !conflicts(f, dietaryKeys));

  const scored = eligible.map(f => {
    let score = 0;
    let best = null;   // the rule arguing hardest FOR this flavour

    for (const rule of RULES) {
      if (!matches(rule, answers)) continue;
      if (f.tasteFamily && rule.prefer?.includes(f.tasteFamily)) {
        score += rule.weight;
        if (!best || rule.weight > best.weight) best = rule;
      }
      if (f.tasteFamily && rule.avoid?.includes(f.tasteFamily)) score -= rule.weight;
    }

    // "Safe bet" is a question about the ROOM, not about the flavour's family, so it is scored
    // separately rather than as another rule — otherwise every family would need a duplicate rule.
    if (answers.mood === 'safe'      && f.crowdPleaser === true)  score += PLEASER_WEIGHT;
    if (answers.mood === 'different' && f.crowdPleaser === false) score += PLEASER_WEIGHT;

    if (f.isSignature) score += SIGNATURE_WEIGHT;

    // `signature` is reported separately rather than folded into the sentence, because only the
    // caller knows the baker's name — and because when it was the deciding margin, saying so is
    // the difference between a true reason and the whole reason.
    return { flavour: f, score, because: reasonFor(best, f), signature: !!f.isSignature };
  });

  return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * What to say when nothing scored.
 *
 * Every flavour may be unauthored, or the answers may argue for nothing this baker stocks. The
 * honest fallback is the baker's own signature, then anything at all — and the sentence says which
 * of those it is, so a customer is never told a guess is a recommendation.
 */
export function fallback(flavours, dietaryKeys = []) {
  const eligible = flavours.filter(f => !conflicts(f, dietaryKeys));
  if (!eligible.length) return null;

  const signature = eligible.find(f => f.isSignature);
  if (signature) return { flavour: signature, score: 0, signature: true,
                          because: 'What this kitchen is known for.' };

  const pleaser = eligible.find(f => f.crowdPleaser === true);
  if (pleaser) return { flavour: pleaser, score: 0, signature: false,
                        because: 'A safe bet with most people.' };

  return { flavour: eligible[0], score: 0, signature: false,
           because: 'One to start from — have a look at the rest too.' };
}

// A hard exclusion. `conflicts_with` is what this baker has said they cannot make a flavour AS —
// it is never a claim that the flavour is unsafe, and it is never used to rank.
function conflicts(flavour, dietaryKeys) {
  if (!dietaryKeys.length) return false;
  const declared = (flavour.conflicts_with ?? []).map(c => (typeof c === 'string' ? c : c.key));
  return dietaryKeys.some(k => declared.includes(k));
}

function reasonFor(rule, flavour) {
  if (rule) return rule.because;
  // Scored only on crowd_pleaser or on being the baker's own — say so plainly rather than
  // borrowing a rule's sentence that did not apply.
  if (flavour.isSignature) return 'What this kitchen is known for.';
  return 'A safe bet with most people.';
}
