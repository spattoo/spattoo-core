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

export function SizeFacet({ draft, patch, close }) {
  // Set by whichever door learned it. A wedding template cannot be made at half a kilo, and
  // offering it would produce an enquiry the baker has to decline.
  const floor = draft.design.minWeightKg ?? 0;
  const offered = WEIGHTS.filter(w => w >= floor);

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
                      close();
                    }}>
              <span style={s.optBig}>about {Math.round(w * SERVINGS_PER_KG)}</span>
              <span style={s.optSmall}>people · {w}kg</span>
            </button>
          );
        })}
      </div>

      {floor > 0 && (
        <div style={s.note}>
          The design you picked starts at {floor}kg, so smaller sizes are not shown.
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

  note: { fontSize: 11.5, fontWeight: 600, color: '#A2968A', lineHeight: 1.5 },
  bad:  { fontSize: 12, fontWeight: 700, color: '#C0392B' },

  done:    { marginTop: 8, padding: '13px 0', borderRadius: 12, border: 'none', background: '#2C4433',
             color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  doneOff: { background: '#E3DBD1', color: '#A2968A', cursor: 'default' },
};
