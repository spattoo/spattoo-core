import { useEffect, useState } from 'react';
import { Slice } from './CakeVisual.jsx';
import { suggestFlavours, fallback, seasonFor } from './suggestFlavour.js';
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

export default function FlavourFacet({ draft, patch, close, api, bakerName }) {
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

      <div style={s.grid}>
        {state.flavours.map(f => (
          <button key={f.id} type="button" onClick={() => pick(f)}
                  aria-pressed={f.id === chosenId}
                  style={{ ...s.card, ...(f.id === chosenId ? s.cardOn : null) }}>
            <Slice sponge={f.spongeColor} filling={f.fillingColor} height={72} />
            <span style={s.name}>{f.name}</span>
          </button>
        ))}
      </div>

      {multi && (
        <button type="button" style={s.done} onClick={close}>Done</button>
      )}
    </>
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
  // ── Age ────────────────────────────────────────────────────────────────────────────────────────
  // Asked HERE and nowhere else. The details facet used to ask it, which was wrong twice over: the
  // customer was answering a recommender's question while trying to enquire about a price, and
  // everyone paid the toll whether or not they wanted a suggestion. Here it is asked only of people
  // who chose "help me pick", and only when it can change the answer.
  //
  // `when` is what keeps that honest — an age band means nothing for a couple, the family, friends
  // or the office, so it is not asked. The options narrow to the recipient for the same reason:
  // offering "Turning 1" to someone buying for a grown-up is noise, and the range that matters for a
  // child (one year old versus sixteen) is a different range entirely.
  {
    key: 'ageBand',
    title: 'Roughly how old?',
    when: a => a.recipient === 'child' || a.recipient === 'adult',
    options: a => (a.recipient === 'child'
      ? [['first_birthday', 'Turning 1'], ['toddler', 'A toddler'],
         ['child', 'A child'], ['teen', 'A teenager']]
      : [['adult', 'A grown-up'], ['senior', 'An elder']]),
  },
  // The same list the details facet uses — they write the same field, so offering different sets
  // would let the answer depend on which screen happened to ask.
  { key: 'occasion', title: "What's the occasion?", options: OCCASIONS },
  { key: 'mood',     title: 'Play it safe, or something different?', options: [
      ['safe', 'Safe bet'], ['different', 'Something different']] },
];

function Suggester({ draft, patch, close, bakerName, flavours, loading, onBack }) {
  // `mood` is the suggester's own question and belongs to nobody else, so it stays local. The other
  // two are facts about the CAKE and are seeded from the draft — see `never ask twice`.
  const [answers, setAnswers] = useState({
    recipient: draft.details.recipient || undefined,
    occasion: draft.details.occasion || undefined,
  });
  const [rejected, setRejected] = useState([]);   // ids the customer has waved away

  // Unanswered AND relevant. A question whose `when` does not hold is skipped entirely rather than
  // shown greyed — the form shrinking as you go is the clearest signal this thing is paying
  // attention, and it is the opposite of a wizard's fixed steps.
  const pending = QUESTIONS.filter(q => !answers[q.key] && (!q.when || q.when(answers)));

  if (loading) return <div style={s.note}>Thinking…</div>;

  if (pending.length) {
    const q = pending[0];
    return (
      <div style={s.qWrap}>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
        <div style={s.qTitle}>{q.title}</div>
        <div style={s.qOpts}>
          {(typeof q.options === 'function' ? q.options(answers) : q.options).map(([value, label]) => (
            <button key={value} type="button" style={s.qOpt}
                    onClick={() => {
                      setAnswers(a => ({ ...a, [q.key]: value }));
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

  // Everything the CAKE already knows is scored, not just what this suggester asked. The age band
  // came from the details facet and the season from the delivery date the customer picked — asking
  // again would break "never ask twice", and not using them would waste answers already given.
  const scored = suggestFlavours(flavours, {
    ...answers,
    ageBand: draft.details.ageBand || undefined,
    // The DELIVERY month, not this one: a January order for an April party is an April cake.
    season: draft.details.deliveryDate
      ? seasonFor(Number(draft.details.deliveryDate.split('-')[1]))
      : undefined,
  }, { dietaryKeys: draft.details.dietaryKeys });

  const ranked = scored.filter(r => !rejected.includes(r.flavour.id));
  const pick = ranked[0] ?? (rejected.length ? null : fallback(flavours, draft.details.dietaryKeys));
  // The runners-up. Three total is the most a customer will actually weigh; beyond that a
  // recommendation becomes a list, which is the thing they opened this door to avoid.
  const alsoGood = ranked.slice(1, 3);

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
        <button type="button" style={s.back} onClick={onBack}>← Back to the flavours</button>
      </div>
    );
  }

  const f = pick.flavour;

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
      <button type="button" style={s.back} onClick={onBack}>← Back</button>
      <Slice sponge={f.spongeColor} filling={f.fillingColor} height={104} />
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
      {/* ── The runners-up ────────────────────────────────────────────────────────────────────────
          Shown because "here is THE flavour" overstates what a rules engine knows. Ranked, each with
          its OWN reason, and deliberately no percentage: a match score computed from hand-written
          weights would dress editorial judgement as measurement. See plans/order-signals.md. */}
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
                </button>
              );
            });
          })()}
        </div>
      )}

      <div style={s.resultActions}>
        <button type="button" style={s.yes}
                onClick={() => pickFlavour(f)}>
          Yes, that one
        </button>
        <button type="button" style={s.another} onClick={() => setRejected(r => [...r, f.id])}>
          Show me another
        </button>
      </div>
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

  also:     { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 4 },
  alsoHead: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
              color: '#B3A79A' },
  alsoRow:  { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 11, border: '1.5px solid #E7DFD5',
              background: '#fff', font: 'inherit', cursor: 'pointer' },
  alsoText: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  alsoName: { fontSize: 13, fontWeight: 700, color: '#2A241F' },
  alsoWhy:  { fontSize: 11, color: '#7A6C60', lineHeight: 1.4 },

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
  resultName: { fontSize: 19, fontWeight: 800, color: '#2A241F' },
  resultWhy:  { fontSize: 13, color: '#7A6C60', lineHeight: 1.55, margin: 0, maxWidth: 320 },
  resultActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  yes:     { padding: '12px 22px', borderRadius: 12, border: 'none', background: '#2C4433', color: '#fff',
             font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  another: { padding: '12px 18px', borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },

  note: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600, color: '#7A6C60' },
  noteTitle: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  noteBody:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },
};
