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
 * ── PLAIN ENGLISH, DELIBERATELY ─────────────────────────────────────────────────────────────────
 * Most customers here read English as a second or third language. So: no idioms ("come into their
 * own", "chocolate people"), no vocabulary that needs decoding ("indulgent", "palate"), and short
 * sentences. These lines ARE the product — a recommendation without a reason is just a name — and a
 * reason that has to be puzzled over builds no trust at all. Warm is fine; clever is not.
 *
 * Data, not code, so a rule can be added without touching the scorer.
 *
 * ── ORDER MATTERS FOR THE REASON, NOT THE SCORE ─────────────────────────────────────────────────
 * Every matching rule adds its weight, so the ranking does not care how they are listed. But the
 * SENTENCE comes from the heaviest rule that argued, and ties break toward whichever is defined
 * first. So the table runs specific → generic: CELEBRATION first (a party type narrows a recipient,
 * so it is the finer statement), then recipient, then occasion, then mood, then season. A customer who has
 * just answered a question should hear the answer to it — "children almost always go for chocolate"
 * is a poor reply to somebody who said the cake is for a teenager, even though the flavour is right.
 */
export const RULES = [
  {
    id: 'first-birthday-mild',
    when: { celebration: 'first_birthday' },
    prefer: ['classic', 'fruit'], avoid: ['coffee', 'tea', 'nut'], weight: 4,
    because: 'A first birthday is usually mild — often the first cake they have ever tasted.',
  },
  {
    id: 'teen-indulgent',
    when: { celebration: 'teen_party' },
    prefer: ['chocolate', 'caramel'], avoid: ['classic'], weight: 3,
    because: 'Teenagers almost always want something rich.',
  },
  {
    id: 'senior-lighter',
    when: { celebration: 'elders' },
    prefer: ['fruit', 'classic', 'indian'], avoid: ['caramel'], weight: 2,
    because: 'Lighter and less sweet, which elders usually prefer.',
  },
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
    because: 'A good second choice if they don’t like chocolate.',
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
    because: 'Rich and a little special, which is the point of an anniversary.',
  },
  {
    id: 'wedding-classic',
    when: { occasion: 'wedding' },
    prefer: ['classic', 'fruit'], avoid: ['coffee'], weight: 2,
    because: 'Weddings usually call for something everyone knows.',
  },
  {
    id: 'corporate-safe',
    when: { occasion: 'corporate' },
    prefer: ['classic', 'chocolate'], avoid: ['indian', 'tea'], weight: 2,
    because: 'An office cake has to please people you have never met.',
  },
  {
    id: 'baby-shower-gentle',
    when: { occasion: 'baby_shower' },
    prefer: ['classic', 'fruit'], avoid: ['coffee'], weight: 2,
    because: 'Gentle and light, and safe for anyone avoiding caffeine.',
  },
  {
    id: 'festival-indian',
    when: { occasion: 'festival' },
    prefer: ['indian', 'nut'], weight: 2,
    because: 'A festival cake should taste like the festival.',
  },
  // ── Mood, last of the real rules ──────────────────────────────────────────────────────────────
  // Deliberately BELOW everything specific. Ties in `reasonFor` go to whichever rule is defined
  // first, and these two are the most generic things the table can say — "hard to go wrong with,
  // whoever is eating it" is true of almost any safe pick. Sitting above the age and occasion rules,
  // this one won the explanation from `senior-lighter` at equal weight, so somebody who had just
  // told us the cake was for an elder got a sentence that could have been written before they
  // answered. The tap has to buy them something.
  {
    id: 'adventurous',
    when: { mood: 'different' },
    prefer: ['tea', 'indian', 'nut', 'coffee'], avoid: ['classic'], weight: 3,
    because: 'Less usual, and the one people remember afterwards.',
  },
  {
    id: 'safe-anything',
    when: { mood: 'safe' },
    prefer: ['classic', 'chocolate'], weight: 2,
    because: 'Hard to go wrong with, whoever is eating it.',
  },

  // ── Season ────────────────────────────────────────────────────────────────────────────────────
  // Weight 1 on purpose: a NUDGE, never a decision. Seasonality is the softest thing here — real
  // enough that mango in May is obviously right, but not something to overturn "it is for a child"
  // with. See seasonFor() for what these mean and what they assume.
  {
    id: 'summer-fresh',
    when: { season: 'summer' },
    prefer: ['fruit'], avoid: ['caramel'], weight: 1,
    because: 'Fruit flavours are best in the heat.',
  },
  {
    id: 'winter-rich',
    when: { season: 'winter' },
    prefer: ['chocolate', 'caramel', 'nut'], weight: 1,
    because: 'The right season for something richer.',
  },
];

// ── "I'll give a hint" ──────────────────────────────────────────────────────────────────────────
// The suggester asks about the OCCASION and the AUDIENCE. It never asked about TASTE, which is the
// most direct evidence there is: what somebody already likes beats anything we can infer from a
// party. And a familiar treat is far easier to answer than a taste family — "do they like Biscoff"
// lands instantly where "do they prefer caramel or coffee" does not.
//
// ── MATCHED BY NAME FIRST, FAMILY ONLY AS A FALLBACK ────────────────────────────────────────────
// The first draft of this mapped every hint down to one of the eight families, and it was wrong in
// the way that mattered: BISCOFF IS NOT CARAMEL. It is speculoos — a spiced caramelised biscuit —
// and a customer who says Biscoff and is handed salted caramel has been given a different thing.
// The same goes for Ferrero and Rasmalai. These are not families; they ARE flavours, and flattening
// them into a family throws away the one specific thing the customer just told us.
//
// So a hint looks for the flavour BY NAME on this baker's own list first. If Super&bake makes
// Biscoff, the answer is Biscoff — the strongest and most honest recommendation this thing can
// produce. Only when there is no match does it fall back to the nearest family, and it says a
// DIFFERENT sentence when it does, because "the closest thing they make" is a weaker claim than
// "they make it" and must not be dressed as the same.
//
// ── THE LIST SPANS ALL EIGHT FAMILIES ───────────────────────────────────────────────────────────
// Deliberately, including `indian` and `tea`. A list of Western confectionery would mean a baker's
// Rasmalai or Masala Chai could never be reached through this door — quietly steering every
// customer away from exactly the flavours that make an Indian bakery distinctive.
//
// `match` is tried against the flavour's name, case-insensitively, as a substring. Substring rather
// than exact because bakers name things "Belgian Dark Chocolate" and "Biscoff Crunch", and a hint
// that only fired on a perfect string would almost never fire at all.
export const HINTS = [
  { key: 'dairy_milk',   emoji: '🍫', label: 'Dairy Milk',
    match: ['dairy milk', 'milk chocolate'],            prefer: ['chocolate'] },
  { key: 'biscoff',      emoji: '🍪', label: 'Biscoff',
    match: ['biscoff', 'lotus', 'speculoos'],           prefer: ['caramel'] },
  { key: 'ferrero',      emoji: '🌰', label: 'Ferrero',
    match: ['ferrero', 'hazelnut', 'nutella', 'praline'], prefer: ['nut', 'chocolate'] },
  { key: 'kitkat',       emoji: '🍬', label: 'KitKat',
    match: ['kitkat', 'kit kat'],                       prefer: ['chocolate'] },
  { key: 'lemon_tart',   emoji: '🍋', label: 'Lemon Tart',
    match: ['lemon'],                                   prefer: ['fruit', 'classic'] },
  { key: 'cappuccino',   emoji: '☕', label: 'Cappuccino',
    match: ['cappuccino', 'coffee', 'mocha', 'latte', 'espresso'], prefer: ['coffee'] },
  { key: 'butterscotch', emoji: '🍨', label: 'Butterscotch Ice Cream',
    match: ['butterscotch'],                            prefer: ['caramel'] },
  { key: 'strawberry',   emoji: '🍓', label: 'Strawberry Milkshake',
    match: ['strawberry'],                              prefer: ['fruit'] },
  { key: 'vanilla',      emoji: '🍦', label: 'Vanilla Ice Cream',
    match: ['vanilla'],                                 prefer: ['classic'] },
  { key: 'rasmalai',     emoji: '🍮', label: 'Rasmalai',
    match: ['rasmalai', 'ras malai', 'rabri'],          prefer: ['indian'] },
  // ⚠️ NOT 'matcha', and not 'earl grey'. Both are the `tea` family and neither tastes remotely
  // like masala chai — matching them produced "they already like Masala Chai, and this is it" over
  // a Matcha cake. That is the Biscoff mistake again: `match` is about the TASTE, never the family.
  // A genuinely different flavour in the same family belongs in the fallback, which says so.
  { key: 'masala_chai',  emoji: '🫖', label: 'Masala Chai',
    match: ['masala chai', 'chai'],                     prefer: ['tea'] },
];

// ── Both weights sit ABOVE the rule table, and that is the point ──────────────────────────────────
// A hint is the customer telling us what they like. Every rule is us INFERRING from a party they
// described. An inference must not overturn evidence.
//
// The fallback started at 3 and did exactly that: for "the family" plus a Masala Chai hint, the
// `crowd-safe` rule AVOIDS tea (−2) and a signature adds 1.5, so the answer came back Red Velvet
// with a reason that never mentioned the hint. The customer had named a taste and been told about
// feeding a crowd.
//
// So the family fallback (5) survives one rule's avoid and still beats the heaviest rule that
// argues, and the name match (8) is untouchable. A hint should always be visible in the answer —
// if it is not, the door was decorative.
const HINT_NAME_WEIGHT   = 8;
const HINT_FAMILY_WEIGHT = 5;

const hintFor = (key) => HINTS.find(h => h.key === key) ?? null;
const nameMatches = (flavour, hint) => {
  const n = (flavour.name ?? '').toLowerCase();
  return hint.match.some(m => n.includes(m));
};

/**
 * Which season a delivery MONTH falls in, for the Indian calendar this product serves.
 *
 * Taken from the DELIVERY date, not today — a cake ordered in January for an April party is an
 * April cake, and scoring it on the month somebody happened to be browsing would be wrong in the
 * one case seasonality is worth anything.
 *
 * ⚠️ ASSUMPTION, written down so it can be argued with: one map for the whole country, which is
 * plainly wrong for somewhere with a different climate. It is here rather than per-region because a
 * per-region table is right and nobody will fill it in — and because at weight 1 being wrong costs a
 * nudge, not a recommendation. Revisit when there are enough bakers for a region to disagree.
 *
 * `month` is 1-12.
 */
export function seasonFor(month) {
  if (month >= 3 && month <= 6)  return 'summer';    // Mar-Jun, the hot months
  if (month >= 7 && month <= 9)  return 'monsoon';   // Jul-Sep — no rule keys on it yet, and that
                                                     // is honest: nothing about it changes a flavour
  return 'winter';                                   // Oct-Feb, the cool + festival season
}

// ── WHAT A SIGNATURE CLAIMS ─────────────────────────────────────────────────────────────────────
// The baker MARKS these; nothing is derived from orders. So the wording is "the baker recommends
// this one" and NOT "what this kitchen is known for" — the second asserts something about reality
// (what people actually order here) that only order history could support, and a star is an
// aspiration as often as a fact. Starring IS recommending, so this says exactly what happened.
//
// Kept in plain English on purpose. Most customers here read English as a second or third language,
// and an earlier attempt at precision — "one the kitchen picks out itself" — was more accurate and
// much harder to read, which is a bad trade in a sentence meant to build trust in a few words.
//
// ── AND WARM ABOUT PEOPLE ───────────────────────────────────────────────────────────────────────
// "Elders", never "older guests". This is a cake for somebody's parent or grandparent, and the word
// should carry the respect that occasion has — which "elders" does in Indian English and "older"
// plainly does not. The DB value stays `senior` because it is an internal identifier nobody reads;
// only the label changes.
//
// When there is enough order volume, the better move is not to DERIVE the flag but to PROPOSE it —
// "you have made this forty times this quarter, star it?" — so it stays the baker's claim, made on
// evidence. See plans/order-signals.md, Phase 4.

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
  const eligible = eligibleFlavours(flavours, dietaryKeys);
  const hint = answers.hint ? hintFor(answers.hint) : null;

  const scored = eligible.map(f => {
    let score = 0;
    let best = null;   // the rule arguing hardest FOR this flavour

    // ── A rule may not VETO what the customer asked for ─────────────────────────────────────────
    // Raising the hint's weight was not enough and was the wrong lever anyway. For "the family"
    // plus a Masala Chai hint, `crowd-safe` AVOIDS tea, so Matcha was pushed below a signature Red
    // Velvet however heavy the hint got — an inference about crowds cancelling a taste the customer
    // had just named.
    //
    // So when the hint backs a flavour, avoid penalties are skipped FOR THAT FLAVOUR. The rules
    // still argue for everything else, and still rank among themselves; they simply do not get to
    // talk somebody out of the thing they said they liked.
    const hintBacks = !!hint &&
      (nameMatches(f, hint) || (f.tasteFamily && hint.prefer.includes(f.tasteFamily)));

    for (const rule of RULES) {
      if (!matches(rule, answers)) continue;
      if (f.tasteFamily && rule.prefer?.includes(f.tasteFamily)) {
        score += rule.weight;
        if (!best || rule.weight > best.weight) best = rule;
      }
      if (!hintBacks && f.tasteFamily && rule.avoid?.includes(f.tasteFamily)) score -= rule.weight;
    }

    // "Safe bet" is a question about the ROOM, not about the flavour's family, so it is scored
    // separately rather than as another rule — otherwise every family would need a duplicate rule.
    if (answers.mood === 'safe'      && f.crowdPleaser === true)  score += PLEASER_WEIGHT;
    if (answers.mood === 'different' && f.crowdPleaser === false) score += PLEASER_WEIGHT;

    if (f.isSignature) score += SIGNATURE_WEIGHT;

    // ── The hint, scored and worded outside the rule table ──────────────────────────────────────
    // Not a RULES row, because a rule matches on a taste FAMILY and this has to look at the
    // flavour's NAME. Handled here so the name case can outrank everything the table can say.
    //
    // The two outcomes get two sentences on purpose. "They already like it, and this is it" is a
    // fact. "The closest thing on this list" is a judgement, and saying the first when only the
    // second is true would be the exact overclaim this whole file exists to avoid.
    let hintWhy = null;
    if (hint) {
      if (nameMatches(f, hint)) {
        score += HINT_NAME_WEIGHT;
        hintWhy = `They already like ${hint.label}, and this is it.`;
      } else if (f.tasteFamily && hint.prefer.includes(f.tasteFamily)) {
        score += HINT_FAMILY_WEIGHT;
        // NO superlative. This read "the closest thing on this list", which is false the moment a
        // name match exists — it appeared on a runner-up while the actual Biscoff sat directly
        // above it. A sentence is attached per FLAVOUR and cannot see what else was ranked, so it
        // must be true of that flavour alone whatever else is on screen.
        hintWhy = `Not ${hint.label}, but along the same lines.`;
      }
    }

    // `signature` is reported separately rather than folded into the sentence, because only the
    // caller knows the baker's name — and because when it was the deciding margin, saying so is
    // the difference between a true reason and the whole reason.
    // The hint OWNS the sentence when it fired. `reasonFor` returns the heaviest rule that argued,
    // and no rule can outrank "they already like this" — a customer who has just named a flavour
    // and is told "children almost always go for chocolate" has been answered by the wrong screen.
    return { flavour: f, score, because: hintWhy ?? reasonFor(best, f), signature: !!f.isSignature };
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
  const eligible = eligibleFlavours(flavours, dietaryKeys);
  if (!eligible.length) return null;

  const signature = eligible.find(f => f.isSignature);
  if (signature) return { flavour: signature, score: 0, signature: true,
                          because: 'The baker recommends this one.' };

  const pleaser = eligible.find(f => f.crowdPleaser === true);
  if (pleaser) return { flavour: pleaser, score: 0, signature: false,
                        because: 'A safe bet with most people.' };

  return { flavour: eligible[0], score: 0, signature: false,
           because: 'A good place to start — do look at the others too.' };
}

/**
 * The flavours this baker can actually make for THIS customer — everything they offer, minus what
 * their dietary answers rule out.
 *
 * Exported because the suggester shows the customer the rest of the range after recommending, and
 * that list has to obey the same exclusion the recommendation does. A full list built from the raw
 * `flavours` array would offer somebody who said eggless a flavour this baker cannot make eggless —
 * the exact thing the header of this file says is worse than suggesting nothing. Showing MORE
 * options is not a reason to relax the one filter that keeps them honest.
 *
 * Two callers here did this filter inline before there was a third. One place to change it.
 */
export function eligibleFlavours(flavours, dietaryKeys = []) {
  return flavours.filter(f => !conflicts(f, dietaryKeys));
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
  if (flavour.isSignature) return 'The baker recommends this one.';
  return 'A safe bet with most people.';
}
