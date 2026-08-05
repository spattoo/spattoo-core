import { useEffect, useState } from 'react';
import { Slice } from './CakeVisual.jsx';
import { suggestFlavours, fallback, seasonFor, eligibleFlavours } from './suggestFlavour.js';
import { OCCASIONS } from './cakeDraft.js';

// ── The flavour facet ───────────────────────────────────────────────────────────────────────────
// Two doors: know what you want, or don't.
//
// The list is drawn as SLICES, not names in a dropdown. A flavour is a thing you taste, and the
// only view that shows it is the cross-section — which is exactly why flavours were given sponge
// and filling colours (spattoo-api migration 038). A <select> of 26 words is the boring form this
// facet exists to replace, and "Belgian Dark" tells somebody nothing they can picture.
//
// ── PER TIER, BECAUSE A CAKE CAN BE ─────────────────────────────────────────────────────────────
// A tiered cake can be a different flavour on each layer, and the order payload has carried that
// shape since long before this screen existed. The tier count usually arrives from the DESIGN facet
// — a template knows how many tiers it has — so this rarely has to ask, and when there is only one
// tier the whole idea stays invisible.

export default function FlavourFacet({ draft, patch, close, api, bakerName, setPreview }) {
  const [door, setDoor] = useState(null);
  const [state, setState] = useState({ loading: true, flavours: [], error: null });
  // Which layer is being chosen. Only ever seen on a tiered cake.
  const [tier, setTier] = useState(0);

  useEffect(() => {
    let alive = true;
    api.fetchStorefrontFlavours()
      .then(list => alive && setState({ loading: false, flavours: list ?? [], error: null }))
      .catch(e => alive && setState({ loading: false, flavours: [], error: e.message }));
    return () => { alive = false; };
  }, [api]);

  if (door === 'suggest') {
    return <Suggester draft={draft} patch={patch} close={close} bakerName={bakerName}
                      flavours={state.flavours} loading={state.loading}
                      setPreview={setPreview}
                      onBack={() => setDoor(null)} />;
  }

  if (door !== 'browse') {
    return (
      <>
        <button type="button" onClick={() => setDoor('browse')} style={s.door}>
          <span style={s.doorLabel}>I know my flavour</span>
          {draft.flavours.some(f => f.name.trim()) && <span style={s.doorTick}>✓</span>}
        </button>
        <button type="button" onClick={() => setDoor('suggest')} style={s.door}>
          <span style={s.doorLabel}>I can&rsquo;t decide — help me pick</span>
        </button>
      </>
    );
  }

  if (state.loading) return <div style={s.note}>Fetching flavours…</div>;

  if (state.error || !state.flavours.length) {
    return (
      <div style={s.note}>
        <div>{state.error ? 'Could not load these just now.' : `${bakerName} hasn't listed any flavours yet.`}</div>
        <button type="button" style={s.back} onClick={() => setDoor(null)}>← Back</button>
      </div>
    );
  }

  const multi = draft.flavours.length > 1;
  const chosenId = draft.flavours[tier]?.flavourId ?? null;

  const pick = (f) => {
    patch({
      flavours: draft.flavours.map((t, i) =>
        i === tier
          // The colours ride along on the DRAFT so the stage can draw the right slice — the draft
          // is UI state and may carry whatever the UI needs. They do not reach the baker:
          // toOrderPayload picks the four fields an order has, which is exactly why that boundary
          // exists rather than trusting every door to send a tidy object.
          ? { tier: i, name: f.name, flavourId: f.id, source: f.source ?? 'global',
              spongeColor: f.spongeColor ?? null, fillingColor: f.fillingColor ?? null }
          : t),
    });
    // On a single-tier cake, choosing IS finishing. On a tiered one it is not, so the facet stays
    // open — closing after each layer would make a three-tier cake a three-trip errand.
    if (!multi) close();
  };

  return (
    <>
      <div style={s.head}>
        <button type="button" style={s.back} onClick={() => setDoor(null)}>← Back</button>
        {multi && <span style={s.hint}>A flavour for each layer</span>}
      </div>

      {/* Only on a tiered cake. Bottom first, because that is how a cake is built and how the
          person eating it will describe it. */}
      {multi && (
        <div style={s.tiers}>
          {draft.flavours.map((t, i) => (
            <button key={i} type="button" onClick={() => setTier(i)}
                    aria-pressed={i === tier}
                    style={{ ...s.tierBtn, ...(i === tier ? s.tierOn : null) }}>
              {i === 0 ? 'Bottom' : i === draft.flavours.length - 1 ? 'Top' : `Layer ${i + 1}`}
              {t.name ? ` · ${t.name}` : ''}
            </button>
          ))}
        </div>
      )}

      <FlavourGrid flavours={state.flavours} chosenId={chosenId} onPick={pick} />

      {multi && (
        <button type="button" style={s.done} onClick={close}>Done</button>
      )}
    </>
  );
}

// ── The grid of slices ──────────────────────────────────────────────────────────────────────────
// Both doors end up here. "I know my flavour" opens it directly; "help me pick" opens it under the
// recommendation, as the rest of the range. Shared so the two can never drift into looking like
// different products — a customer who takes the second door and expands the list should be looking
// at exactly what the first door would have shown them.
function FlavourGrid({ flavours, chosenId = null, onPick }) {
  return (
    <div style={s.grid}>
      {flavours.map(f => (
        <button key={f.id} type="button" onClick={() => onPick(f)}
                aria-pressed={f.id === chosenId}
                style={{ ...s.card, ...(f.id === chosenId ? s.cardOn : null) }}>
          <Slice sponge={f.spongeColor} filling={f.fillingColor} height={72} />
          <span style={s.name}>{f.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── "I can't decide — help me pick" ─────────────────────────────────────────────────────────────
// Two or three short questions, then a real recommendation with the reason it won.
//
// It SKIPS anything already known. If the date facet was told this is a birthday, that question is
// not asked again — and the answers it does collect are written to the cake, so the details facet
// will not ask either. The form shrinks as you go, which is the clearest signal a customer gets
// that the thing is paying attention.
const QUESTIONS = [
  { key: 'recipient', title: "Who's it for?", options: [
      ['child', 'A little one'],   ['adult', 'A grown-up'],
      ['couple', 'A couple'],      ['family', 'The family'],
      ['friends', 'Friends'],      ['colleagues', 'The office']] },
  // ── The celebration ────────────────────────────────────────────────────────────────────────────
  // Asked HERE and nowhere else — only of people who chose "help me pick", and only when it can
  // change the answer.
  //
  // ⚠️ This asked "Roughly how old?" and stored an age band. That was an attribute of a PERSON,
  // usually a child and usually not the one answering — which put it at odds with our own Privacy
  // Policy §10 and inside what DPDP Section 9 governs. The recommender never needed the person: a
  // first birthday is a milder cake because of the OCCASION, not because of the guest. So it asks
  // what kind of party it is, and every rule argues exactly as well. See migration 046.
  //
  // It also reads better — somebody knows what party they are throwing without estimating an age.
  //
  // `when` keeps it honest: a party type means nothing for a couple, the family, friends or the
  // office, so it is not asked at all.
  {
    key: 'celebration',
    title: 'What kind of celebration?',
    when: a => a.recipient === 'child' || a.recipient === 'adult',
    options: a => (a.recipient === 'child'
      ? [['first_birthday', 'A first birthday'], ['kids_party', "A children's party"],
         ['teen_party', "A teenager's party"]]
      : [['grown_ups', 'A grown-ups’ celebration'], ['elders', 'A celebration for elders']]),
  },
  // The same list the details facet uses — they write the same field, so offering different sets
  // would let the answer depend on which screen happened to ask.
  { key: 'occasion', title: "What's the occasion?", options: OCCASIONS },
  { key: 'mood',     title: 'Play it safe, or something different?', options: [
      ['safe', 'Safe bet'], ['different', 'Something different']] },
];

function Suggester({ draft, patch, close, bakerName, flavours, loading, onBack, setPreview }) {
  // `mood` is the suggester's own question and belongs to nobody else, so it stays local. The other
  // two are facts about the CAKE and are seeded from the draft — see `never ask twice`.
  const [answers, setAnswers] = useState({
    recipient: draft.details.recipient || undefined,
    occasion: draft.details.occasion || undefined,
  });
  const [rejected, setRejected] = useState([]);   // ids the customer has waved away
  // ── The back stack ────────────────────────────────────────────────────────────────────────────
  // Which questions THIS screen asked, in order. Without it "← Back" left the suggester entirely,
  // and there was no way back to an answer at all: answers are written to the DRAFT, and `pending`
  // skips anything already answered, so leaving and re-entering skipped the same questions again.
  // Occasion and recipient were unreachable for good; only `mood` could be changed, and only
  // because it is the one answer kept locally. Reported as "back button does not take me there".
  //
  // Only what this screen asked. A question seeded from the draft — the date facet already set the
  // occasion — is not on the stack, so Back steps past it and leaves. Undoing another facet's
  // answer from in here would be reaching into a screen the customer is not looking at.
  const [asked, setAsked] = useState([]);
  // Whether the rest of the baker's range is open. Up here with the others and NOT beside the
  // markup that uses it: three early returns sit between, and a hook below any of them is the
  // React #310 this facet's sibling already shipped once. `check:hooks` now fails the build for it.
  const [showAll, setShowAll] = useState(false);

  // Unanswered AND relevant. A question whose `when` does not hold is skipped entirely rather than
  // shown greyed — the form shrinking as you go is the clearest signal this thing is paying
  // attention, and it is the opposite of a wizard's fixed steps.
  const pending = QUESTIONS.filter(q => !answers[q.key] && (!q.when || q.when(answers)));

  // ── Scored ABOVE the early returns, so the preview effect can be a top-level hook ─────────────
  // Everything the CAKE already knows is scored, not just what this suggester asked. The
  // celebration came from the details facet and the season from the delivery date the customer
  // picked — asking again would break "never ask twice", and not using them would waste answers
  // already given.
  //
  // Guarded on `answered` rather than moved back below the returns: a hook may not sit under an
  // early return (React #310, which this facet's sibling shipped once), so the choice is to compute
  // here or not to preview at all. Scoring an empty list while the questions are still being asked
  // is a few comparisons on an array this size.
  const answered = !loading && !pending.length;
  const scored = answered ? suggestFlavours(flavours, {
    ...answers,
    celebration: draft.details.celebration || undefined,
    // The DELIVERY month, not this one: a January order for an April party is an April cake.
    season: draft.details.deliveryDate
      ? seasonFor(Number(draft.details.deliveryDate.split('-')[1]))
      : undefined,
  }, { dietaryKeys: draft.details.dietaryKeys }) : [];

  const ranked = scored.filter(r => !rejected.includes(r.flavour.id));
  const pick = answered
    ? (ranked[0] ?? (rejected.length ? null : fallback(flavours, draft.details.dietaryKeys)))
    : null;
  // The runners-up. Three total is the most a customer will actually weigh; beyond that a
  // recommendation becomes a list, which is the thing they opened this door to avoid.
  const alsoGood = ranked.slice(1, 3);

  // ── The pinned cake becomes the recommendation ────────────────────────────────────────────────
  // The suggester used to draw its own slice, so the screen carried TWO cakes in different
  // flavours — the customer's current pick pinned above, the recommendation below. Now there is one
  // cake and it is the one being discussed.
  //
  // Keyed on the flavour ID, NOT the flavour object: `suggestFlavours` builds fresh objects every
  // render, so an object dependency would set state → re-render → new object → set state again,
  // forever. The id is stable for as long as the recommendation is.
  useEffect(() => {
    setPreview?.(pick?.flavour ?? null);
    return () => setPreview?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.flavour?.id, setPreview]);

  // Pops the last question this screen asked and re-opens it. With nothing left to undo it leaves
  // the suggester, so Back never becomes a button that does nothing.
  //
  // Clears the answer from the DRAFT as well as from here. Half-undoing would be worse than not
  // undoing: the question would re-open while the details facet still held the old value, and
  // whichever screen was read second would be believed.
  const goBack = () => {
    if (!asked.length) return onBack();
    const last = asked[asked.length - 1];
    setAsked(a => a.slice(0, -1));
    setAnswers(a => ({ ...a, [last]: undefined }));
    if (last !== 'mood') patch({ details: { [last]: '' } });   // `mood` is ours alone
    // A changed answer is a changed question, so flavours waved away under the old one come back.
    // Keeping them hidden would let a rejection from a different question quietly shape the result.
    setRejected([]);
  };

  if (loading) return <div style={s.note}>Thinking…</div>;

  if (pending.length) {
    const q = pending[0];
    return (
      <div style={s.qWrap}>
        <button type="button" style={s.back} onClick={goBack}>← Back</button>
        <div style={s.qTitle}>{q.title}</div>
        <div style={s.qOpts}>
          {(typeof q.options === 'function' ? q.options(answers) : q.options).map(([value, label]) => (
            <button key={value} type="button" style={s.qOpt}
                    onClick={() => {
                      setAnswers(a => ({ ...a, [q.key]: value }));
                      setAsked(a => [...a, q.key]);
                      // Written to the CAKE, not kept here — the suggester asked because it needed
                      // to, but the answer is the cake's and the details facet must not ask again.
                      if (q.key !== 'mood') patch({ details: { [q.key]: value } });
                    }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Nothing survived. Say so plainly and still let them through — the one thing this must never do
  // is invent a suggestion to avoid an empty screen.
  if (!pick) {
    const dietary = draft.details.dietaryKeys.length;
    return (
      <div style={s.note}>
        <div style={s.noteTitle}>{dietary ? 'Ah — none of these fit' : 'Nothing leaps out'}</div>
        <p style={s.noteBody}>
          {bakerName} may still be able to help. Tell them what you are after and they will come
          back to you.
        </p>
        {/* Changing an answer is the thing most likely to help here, so Back steps into the
            questions rather than out of the suggester — leaving is what the sentence above already
            offers. */}
        <button type="button" style={s.back} onClick={goBack}>
          {asked.length ? '← Change an answer' : '← Back to the flavours'}
        </button>
      </div>
    );
  }

  const f = pick.flavour;

  // ── Is there actually a next one? ─────────────────────────────────────────────────────────────
  // The button used to be offered unconditionally, which made it a promise this could not keep: with
  // one scoring flavour, rejecting it empties `ranked`, `pick` falls to null and the customer lands
  // on "Nothing leaps out" — having asked for another and been shown an empty room. Naming it "the
  // next closest" makes the promise explicit, so it is only offered when there IS one.
  const hasNext = ranked.length > 1;

  // ── The rest of the range ─────────────────────────────────────────────────────────────────────
  // Everything this baker makes that is not already on screen. `suggestFlavours` returns only
  // score > 0, so a baker with twenty-six flavours and three that score had twenty-three with no
  // route to them at all — the recommendation was a dead end unless you backed out to a door
  // labelled "I know my flavour", which is the opposite of what you just said.
  //
  // eligibleFlavours, NOT the raw list: the dietary exclusion is a hard filter, and showing MORE is
  // not a reason to relax it. A rejected flavour DOES come back here, because this section is a
  // statement of fact about the range rather than a recommendation.
  const onScreen = new Set([f.id, ...alsoGood.map(r => r.flavour.id)]);
  const rest = eligibleFlavours(flavours, draft.details.dietaryKeys)
    .filter(x => !onScreen.has(x.id));

  // Both the top pick and a runner-up write the same thing. Extracted the moment there were two
  // callers, rather than after they had drifted.
  const pickFlavour = (flavour) => {
    patch({ flavours: draft.flavours.map((t, i) => i === 0
      ? { tier: 0, name: flavour.name, flavourId: flavour.id, source: flavour.source ?? 'global',
          spongeColor: flavour.spongeColor ?? null, fillingColor: flavour.fillingColor ?? null }
      : t) });
    close();
  };

  return (
    <div style={s.result}>
      <button type="button" style={s.back} onClick={goBack}>
        {asked.length ? '← Change an answer' : '← Back'}
      </button>
      {/* Named, so the recommendation announces itself as one. Without it the screen opened on a
          slice and a name with no more standing than the cards below it — which is how a customer's
          eye reached the runners-up first and read THEM as the answer. */}
      <div style={s.pickTag}>Our pick for you</div>
      <div style={s.resultName}>{f.name}</div>
      {/* The sentence from the rule that actually argued for it — not a plausible one chosen
          afterwards. That is the whole reason this is rules and not a model. */}
      <p style={s.resultWhy}>
        {pick.because}
        {/* Said out loud when it applies, because on a close call the baker's own pick is often the
            deciding margin — and a reason that leaves out what decided it is only half true.
            "Recommends", not "is known for": the baker starred it, and nothing here has seen a
            single order. Plain English deliberately — see suggestFlavour.js. */}
        {pick.signature && ` ${bakerName} recommends this one.`}
      </p>
      {/* ── The actions sit AGAINST the recommendation, above the alternatives ────────────────────
          They used to come after the runners-up, and that put two full-width bordered cards between
          "Black Forest" and the button meant to accept it. Two things went wrong, both reported:

            * "Yes, that one" is a phrase that POINTS, and its referent was two cards away, past two
              other flavour names. Nothing on screen said which one "that" was.
            * The runners-up looked like the actions. They were the only button-shaped things above
              the fold, so the eye landed on them first and read them as the choice — the actual
              recommendation reading as a heading over somebody else's options.

          So the primary action is adjacent to the thing it acts on, and it NAMES it: "Choose Black
          Forest" needs no referent at all and survives being scrolled away from. */}
      <div style={s.resultActions}>
        <button type="button" style={s.yes} onClick={() => pickFlavour(f)}>
          Choose {f.name}
        </button>
        {/* "Show me another" read as a shuffle — as though the next one came out of a hat. It never
            did: `ranked` is sorted by score, so the next is the next-best argued case. Saying so
            turns a random-feeling button into the one thing a ranked list is good for, and it is a
            claim about ORDER, not a percentage — see the note on runners-up below. */}
        {hasNext && (
          <button type="button" style={s.another} onClick={() => setRejected(r => [...r, f.id])}>
            Next closest match
          </button>
        )}
      </div>

      {/* ── The runners-up ────────────────────────────────────────────────────────────────────────
          Shown because "here is THE flavour" overstates what a rules engine knows. Ranked, each with
          its OWN reason, and deliberately no percentage: a match score computed from hand-written
          weights would dress editorial judgement as measurement. See plans/order-signals.md.

          Styled DOWN to sit below the decision rather than compete with it — see s.alsoRow. */}
      {alsoGood.length > 0 && (
        <div style={s.also}>
          <div style={s.alsoHead}>Also worth a look</div>
          {(() => {
            // One rule often argues for several families at once — "a first birthday is usually
            // mild" prefers classic AND fruit — so the same sentence can win for two flavours.
            // Printing it twice reads as a bug, and writing a different sentence for the second
            // would be inventing a reason it did not have. So it is said once; the rest stand on
            // their name.
            const said = new Set([pick.because]);
            return alsoGood.map(r => {
              const fresh = r.because && !said.has(r.because);
              if (fresh) said.add(r.because);
              return (
                <button key={r.flavour.id} type="button" style={s.alsoRow}
                        onClick={() => pickFlavour(r.flavour)}>
                  <Slice sponge={r.flavour.spongeColor} filling={r.flavour.fillingColor} height={40} />
                  <span style={s.alsoText}>
                    <span style={s.alsoName}>{r.flavour.name}</span>
                    {fresh && <span style={s.alsoWhy}>{r.because}</span>}
                  </span>
                  {/* Tapping a row CHOOSES that flavour and closes the facet, which is a large thing
                      to happen with nothing on the row saying so. It looked like a list entry and
                      behaved like a submit. The word is small and muted on purpose — enough to make
                      the row's behaviour honest, not enough to compete with the decision above. */}
                  <span style={s.alsoPick}>Choose</span>
                </button>
              );
            });
          })()}
        </div>
      )}

      {rest.length > 0 && (
        <div style={s.rest}>
          {showAll ? (
            <>
              <div style={s.alsoHead}>Everything else {bakerName} makes</div>
              <FlavourGrid flavours={rest} onPick={pickFlavour} />
            </>
          ) : (
            // Collapsed by default, and that is not timidity: this customer opened this door because
            // a wall of names was too much to weigh. Handing all of them straight back would undo
            // the thing they asked for. One tap is not a dead end; a wall is not a recommendation.
            <button type="button" style={s.restBtn} onClick={() => setShowAll(true)}>
              {bakerName} makes {rest.length} more — see {rest.length === 1 ? 'it' : 'them all'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  door: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'left', cursor: 'pointer', padding: '15px 17px',
    borderRadius: 13, border: '1.5px solid #E7DFD5', background: '#fff', font: 'inherit',
  },
  doorLabel: { fontSize: 14.5, fontWeight: 700, color: '#2A241F', lineHeight: 1.35 },
  doorTick:  { fontWeight: 800, color: '#2C4433' },

  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hint: { fontSize: 11.5, fontWeight: 700, color: '#A2968A' },
  back: { border: 'none', background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: '#7A6C60', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' },

  also:     { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 10 },
  alsoHead: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
              color: '#B3A79A' },
  // ── Deliberately quieter than it was ──────────────────────────────────────────────────────────
  // A white fill and a 1.5px border made these the most button-like things on the screen, so they
  // out-shouted the recommendation they were alternatives TO. Transparent, with a hairline border,
  // they read as a list you may tap rather than the choice you came for.
  alsoRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 11,
              border: '1px solid #EDE5DB', background: 'transparent', font: 'inherit',
              cursor: 'pointer' },
  alsoText: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 },
  alsoPick: { fontSize: 11, fontWeight: 800, color: '#7A9C86', flexShrink: 0 },
  alsoName: { fontSize: 13, fontWeight: 700, color: '#2A241F' },
  alsoWhy:  { fontSize: 11, color: '#7A6C60', lineHeight: 1.4 },

  rest:    { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 10,
             paddingTop: 12, borderTop: '1px solid #EDE5DB', textAlign: 'left' },
  restBtn: { padding: '11px 14px', borderRadius: 11, border: '1.5px dashed #D9CEC1',
             background: 'transparent', font: 'inherit', fontSize: 12.5, fontWeight: 700,
             color: '#7A6C60', cursor: 'pointer', width: '100%' },

  tiers: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tierBtn: { padding: '7px 12px', borderRadius: 20, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 11.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },
  tierOn: { borderColor: '#2C4433', color: '#2C4433', background: '#F4F7F4' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 },
  card: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 6px',
          cursor: 'pointer', borderRadius: 12, border: '1.5px solid #EDE5DB', background: '#fff',
          font: 'inherit' },
  cardOn: { borderColor: '#2C4433', boxShadow: '0 0 0 2px rgba(44,68,51,0.12)' },
  name: { fontSize: 11.5, fontWeight: 700, color: '#2A241F', textAlign: 'center', lineHeight: 1.3 },

  done: { marginTop: 4, padding: '12px 0', borderRadius: 12, border: 'none', background: '#2C4433',
          color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' },

  qWrap:  { display: 'flex', flexDirection: 'column', gap: 12 },
  qTitle: { fontSize: 17, fontWeight: 800, color: '#2A241F', lineHeight: 1.3 },
  qOpts:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 },
  qOpt:   { padding: '14px 12px', borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff',
            font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#2A241F', cursor: 'pointer' },

  result: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
  pickTag: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
             color: '#7A9C86' },
  resultName: { fontSize: 19, fontWeight: 800, color: '#2A241F' },
  resultWhy:  { fontSize: 13, color: '#7A6C60', lineHeight: 1.55, margin: 0, maxWidth: 320 },
  resultActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6,
                   width: '100%' },
  // Grows to fit the flavour's name now that it carries one — a fixed width would clip "Belgian
  // Dark Chocolate Truffle", and a name that does not fit its own button is worse than no name.
  yes:     { flex: '1 1 auto', padding: '12px 20px', borderRadius: 12, border: 'none',
             background: '#2C4433', color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 800,
             cursor: 'pointer', lineHeight: 1.3 },
  another: { padding: '12px 18px', borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },

  note: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600, color: '#7A6C60' },
  noteTitle: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  noteBody:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },
};
