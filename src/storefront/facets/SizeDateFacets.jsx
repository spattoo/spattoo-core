import { useEffect, useState } from 'react';
import { today, OCCASIONS } from './cakeDraft.js';

// ── Size and date ───────────────────────────────────────────────────────────────────────────────
// Both work the same way, and it is worth naming: a constraint learned somewhere ELSE narrows the
// options without answering for the customer.
//
//   a template's minimum weight  → sizes below it are not offered
//   the baker's lead time        → dates inside it are not offered
//
// Neither pre-fills an answer. Learning that a 3-tier cake starts at 3kg is not the same as the
// customer having said "3kg", and silently filling it in would be a wrong answer nobody re-checks —
// the same reason "a crowd at work" is not allowed to answer the size question on the customer's
// behalf. A floor prevents an impossible order; a guess invents a real one.

// Servings per kg. A CONVENTION, not a fact — it depends on how a cake is cut and who is eating —
// so it is stated once here and always spoken as "about".
const SERVINGS_PER_KG = 8;
const WEIGHTS = [0.5, 1, 1.5, 2, 3, 4, 5];

/**
 * The tier ladder, drawn.
 *
 * A stack of outlines rather than the word "two tiers", because the customer is choosing a SHAPE
 * and a shape is something you look at. Each tier narrows as it rises, which is what makes the
 * silhouette read as a cake rather than a bar chart.
 */
function TierGlyph({ tiers, on }) {
  const W = 52, H = 12, GAP = 2, BOARD = 3;
  const height = tiers * (H + GAP) + BOARD + 4;
  const stroke = on ? '#2C4433' : '#B3A79A';
  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} aria-hidden="true"
         style={{ display: 'block' }}>
      {Array.from({ length: tiers }, (_, i) => {
        // Widest at the BOTTOM. Each tier above steps in by a fixed amount, so a 3-tier silhouette
        // tapers visibly rather than reading as a stack of identical bars.
        const stepIn = (tiers - 1 - i) * 7;
        const w = W - 8 - stepIn;
        return (
          <rect key={i} x={(W - w) / 2} y={i * (H + GAP) + 2} width={w} height={H} rx={2.5}
                fill={on ? '#2C4433' : '#FFFDF9'} fillOpacity={on ? 0.14 : 1}
                stroke={stroke} strokeWidth="1.5" />
        );
      })}
      {/* The board. Without it a single tier is just a rectangle; with it, even one reads as a cake. */}
      <rect x={2} y={height - BOARD - 1} width={W - 4} height={BOARD} rx={1.5}
            fill={stroke} opacity={0.55} />
    </svg>
  );
}

/**
 * Size, in two steps: how many people, then what shape.
 *
 * ── WHY SHAPE IS A SECOND QUESTION AND NOT A GUESS ──────────────────────────────────────────────
 * Weight is not purely a function of guest count. A two-tier cake has a STRUCTURAL minimum whatever
 * the headcount — so "about 8 people, 1kg" plus "two tiers" is an order nobody can bake, and until
 * now nothing caught it. Asking the shape is what makes the floor knowable.
 *
 * People first, deliberately: it is the thing the customer already knows. Shape is a question they
 * may never have considered, and asking it first would stall them on the harder one.
 *
 * ── THE FLOOR COMES FROM THE BAKER'S OWN TEMPLATES ──────────────────────────────────────────────
 * Not a hardcoded "2 tiers = 2kg". Every template carries `tier_count` and `min_weight_kg`, so the
 * minimum for a shape is read from cakes this baker actually offers. A baker whose two-tiers start
 * at 1.5kg gets 1.5. With no templates to learn from we show no floor at all rather than invent one
 * — the same rule the suggester follows.
 */
export function SizeFacet({ draft, patch, close, api }) {
  // A template already answered both questions, so this facet only has to respect them.
  const fromDesign = draft.design.minWeightKg ?? 0;
  const [templates, setTemplates] = useState(null);
  const [step, setStep] = useState('people');

  useEffect(() => {
    let alive = true;
    api?.fetchStorefrontTemplates?.()
      .then(t => alive && setTemplates(Array.isArray(t) ? t : []))
      .catch(() => alive && setTemplates([]));
    return () => { alive = false; };
  }, [api]);

  // Smallest weight this baker actually makes at each tier count. Read, never assumed.
  /**
   * The smallest weight this baker actually makes at a given tier count.
   *
   * A template with NO min_weight_kg is unconstrained — the baker has not said it needs a minimum,
   * so it can be made at any size on the ladder. That makes it a 0, not a row to skip.
   *
   * ⚠️ It skipped them, which inverted the answer. Super&bake has several one-tier templates and
   * exactly one — "kpop" — carrying a minimum of 1kg. Dropping the others left `[1]`, so the floor
   * came out at 1kg and the 0.5kg option vanished: one design's constraint applied to every
   * one-tier cake the baker makes. A floor has to be the SMALLEST thing they can do, not the
   * smallest thing anybody bothered to write down.
   */
  const floorFor = (tiers) => {
    const at = (templates ?? []).filter(t => (t.tier_count ?? 1) === tiers);
    if (!at.length) return 0;
    const mins = at.map(t => (typeof t.attrs?.min_weight_kg === 'number' ? t.attrs.min_weight_kg : 0));
    return Math.min(...mins);
  };

  // The shapes this baker actually makes, from the tier counts their templates use — NOT from
  // which of them happen to have a min_weight_kg.
  //
  // ⚠️ This was `[1,2,3].filter(n => n === 1 || floorFor(n) > 0)`, which conflated two questions:
  // "does this baker make two-tier cakes?" and "do we know the minimum weight for one?". A baker
  // with two-tier templates but no min_weight_kg set — which is most of them, since nothing forces
  // that field — offered only "one tier", so the shape step was skipped and the question could not
  // be reached at all. Offer the shape; show the floor only when it is known.
  const tierOptions = (() => {
    const counts = [...new Set((templates ?? []).map(t => Number(t.tier_count) || 1))]
      .filter(n => n >= 1 && n <= 6).sort((a, b) => a - b);
    return counts.length ? counts : [1];
  })();
  const chosenTiers = draft.size.tierCount ?? null;
  const floor = Math.max(fromDesign, chosenTiers ? floorFor(chosenTiers) : 0);
  const offered = WEIGHTS.filter(w => w >= floor);

  // ── Step 2: the shape ───────────────────────────────────────────────────────────────────────────
  if (step === 'shape') {
    return (
      <>
        <div style={s.hint}>How should it be built?</div>
        <div style={s.tierRow}>
          {tierOptions.map(n => {
            const on = chosenTiers === n;
            const min = floorFor(n);
            return (
              <button key={n} type="button" aria-pressed={on}
                      style={{ ...s.tierOpt, ...(on ? s.optOn : null) }}
                      onClick={() => {
                        // Bumping the weight to the floor is the whole point of asking: a shape the
                        // chosen size cannot carry is the order this facet exists to prevent.
                        const w = draft.size.weightKg;
                        const next = { tierCount: n };
                        if (min > 0 && (w == null || w < min)) {
                          next.weightKg = min;
                          next.servings = Math.round(min * SERVINGS_PER_KG);
                        }
                        patch({ size: next });
                        // The tiers are also how many flavours the cake can have.
                        patch({ __tierCount: n });
                        close();
                      }}>
                <TierGlyph tiers={n} on={on} />
                <span style={s.tierLabel}>{n === 1 ? 'One tier' : `${n} tiers`}</span>
                {min > 0 && <span style={s.optSmall}>from {min}kg</span>}
              </button>
            );
          })}
        </div>
        <button type="button" style={s.back} onClick={() => setStep('people')}>← How many people</button>
      </>
    );
  }

  // ── Step 1: the people ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Customers think in people and bakers think in kilograms. If the storefront does not do
          this translation the customer asks on WhatsApp, and the facet has saved nothing. */}
      <div style={s.hint}>Roughly how many people is it feeding?</div>

      <div style={s.grid}>
        {offered.map(w => {
          const on = draft.size.weightKg === w;
          return (
            <button key={w} type="button" aria-pressed={on}
                    style={{ ...s.opt, ...(on ? s.optOn : null) }}
                    onClick={() => {
                      // Both are kept. Servings is what they said; weight is what the baker works
                      // in. Throwing away either makes the other unrecoverable.
                      patch({ size: { weightKg: w, servings: Math.round(w * SERVINGS_PER_KG) } });
                      // Straight on to the shape — unless a template already settled it, in which
                      // case asking would be the "never ask twice" rule broken.
                      if (fromDesign > 0 || tierOptions.length < 2) close();
                      else setStep('shape');
                    }}>
              <span style={s.optBig}>about {Math.round(w * SERVINGS_PER_KG)}</span>
              <span style={s.optSmall}>people · {w}kg</span>
            </button>
          );
        })}
      </div>

      {floor > 0 && (
        <div style={s.note}>
          {fromDesign > 0
            ? `The design you picked starts at ${floor}kg, so smaller sizes are not shown.`
            : `A ${chosenTiers}-tier cake starts at ${floor}kg here, so smaller sizes are not shown.`}
        </div>
      )}
    </>
  );
}

export function DateFacet({ draft, patch, close, leadTimeDays = 0, bakerName }) {
  // The earliest date this baker will accept. A customer learns it HERE rather than a day later,
  // which is the single worst failure this whole flow can produce.
  const earliest = addDays(today(), leadTimeDays);
  const value = draft.details.deliveryDate;
  const tooSoon = value && value < earliest;

  return (
    <>
      <label style={s.label} htmlFor="sf-date">When do you need it?</label>
      <input
        id="sf-date" type="date" value={value} min={earliest}
        onChange={e => patch({ details: { deliveryDate: e.target.value } })}
        style={{ ...s.input, ...(tooSoon ? s.inputBad : null) }}
      />

      {/* Stated up front, not only after they pick a bad date. Somebody planning for Saturday
          should find out on the way in, not by being refused. */}
      {leadTimeDays > 0 && (
        <div style={s.note}>
          {bakerName} needs at least {leadTimeDays} {leadTimeDays === 1 ? 'day' : 'days'} notice.
        </div>
      )}
      {tooSoon && (
        <div style={s.bad}>That is sooner than {bakerName} can manage — pick a later date.</div>
      )}

      <label style={s.label} htmlFor="sf-occasion">What&rsquo;s the occasion?</label>
      <div style={s.chips}>
        {OCCASIONS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={draft.details.occasion === k}
                  style={{ ...s.chip, ...(draft.details.occasion === k ? s.chipOn : null) }}
                  onClick={() => patch({ details: { occasion: k } })}>
            {label}
          </button>
        ))}
      </div>

      {/* ── What this facet deliberately does NOT ask ───────────────────────────────────────────
          The message on the cake, the number, and the age band. All three were here; all three are
          gone.

          At this moment the customer is asking "can you make it, and what will it cost". Those three
          are PRODUCTION details the baker settles once the design is agreed, and asking for them
          before a price has even been discussed is how a short enquiry turns into a form — the exact
          thing this whole design exists to avoid.

          The baker collects them instead: the number has its own field in the order form, and the
          wording goes in Special instructions. The draft still carries all three, so a future door
          can fill them without re-plumbing the payload. */}

      {/* No name and no phone here. Both are asked on the verification screen, together, because
          that is one question — "who are you and how does {bakerName} reach you" — and splitting it
          across two screens is what made the Send button look dead for a reason nobody could see. */}
      <button type="button" style={{ ...s.done, ...(tooSoon ? s.doneOff : null) }}
              disabled={!!tooSoon} onClick={close}>
        Done
      </button>
    </>
  );
}

/** yyyy-mm-dd, n days on. Built from the parts rather than Date arithmetic so it cannot drift a
 *  day across a timezone the way toISOString does in IST. */
function addDays(iso, n) {
  if (!n) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const s = {
  hint:  { fontSize: 13, fontWeight: 600, color: '#7A6C60' },
  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 9 },
  opt:   { display: 'flex', flexDirection: 'column', gap: 2, padding: '13px 10px', cursor: 'pointer',
           borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff', font: 'inherit' },
  optOn: { borderColor: '#2C4433', boxShadow: '0 0 0 2px rgba(44,68,51,0.12)' },
  optBig:   { fontSize: 15, fontWeight: 800, color: '#2A241F' },
  optSmall: { fontSize: 11, fontWeight: 600, color: '#A2968A' },

  label: { fontSize: 12, fontWeight: 700, color: '#7A6C60', marginTop: 4 },
  input: { padding: '12px 14px', borderRadius: 12, border: '1.5px solid #E7DFD5', font: 'inherit',
           fontSize: 14, color: '#2A241F', boxSizing: 'border-box', width: '100%' },
  inputBad: { borderColor: '#C0392B' },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip:  { padding: '8px 13px', borderRadius: 20, border: '1.5px solid #E7DFD5', background: '#fff',
           font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },
  chipOn: { borderColor: '#2C4433', color: '#2C4433', background: '#F4F7F4' },

  tierRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  tierOpt: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer',
             padding: '14px 18px', borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', minWidth: 92 },
  tierLabel: { fontSize: 13, fontWeight: 700, color: '#2A241F' },
  back:  { alignSelf: 'flex-start', background: 'none', border: 'none', font: 'inherit', fontSize: 12.5,
           fontWeight: 700, color: '#7A6C60', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },

  note: { fontSize: 11.5, fontWeight: 600, color: '#A2968A', lineHeight: 1.5 },
  bad:  { fontSize: 12, fontWeight: 700, color: '#C0392B' },

  done:    { marginTop: 8, padding: '13px 0', borderRadius: 12, border: 'none', background: '#2C4433',
             color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  doneOff: { background: '#E3DBD1', color: '#A2968A', cursor: 'default' },
};
