import { batchTotals, stickyFor, formatKg, EGG_LABEL } from './dayBoard.js';

/* ── A day, pinned up ────────────────────────────────────────────────────────────────────────────
 *
 * The calendar cell says how many cakes are due. This says what they are — and, at the top, what
 * has to be BAKED, which is the part nothing else in the product answers.
 *
 * ── THE TOTALS ARE THE FEATURE ──────────────────────────────────────────────────────────────────
 * Every card here is a subset of a row the orders list already shows, one tap away. If this were
 * only the cards it would be a prettier preview and not much else. The batch lines are the reason
 * it exists: a baker plans in bowls, not in orders, and "3.5 kg of vanilla without egg" is a
 * sentence they can act on that no other screen can currently produce.
 *
 * ── DELIBERATELY NOT STATIONERY ─────────────────────────────────────────────────────────────────
 * "Sticky notes" describes the LAYOUT — small cards, glanced at rather than read. It is not a brief
 * to draw paper. No texture, no tape, no pushpins, no handwriting face, and above all no random
 * rotation: the eye re-orienting at every card is precisely the cost that would undo the glance
 * this exists to give. It also stays inside the Orders UI's monochrome language rather than
 * becoming the one screen that looks like a different product.
 *
 * The single exception is "Not known", which is amber. That is not decoration and not a status
 * hue — it is the one thing on the board that needs a person to go and ask, days before it matters.
 */

const CARD_CAP = 6;   // past this it stops being a glance and becomes the list it links to

const EGG_TONE = {
  eggless: { fg: '#3D5A44', bg: '#EDF2EE', bd: '#D6E2DA' },
  egg:     { fg: '#5e5e5e', bg: '#F2F0EB', bd: '#E2DED5' },
  unknown: { fg: '#8A5A1E', bg: '#FDF3E3', bd: '#F0DCB8' },
};

function EggPill({ egg }) {
  const t = EGG_TONE[egg] ?? EGG_TONE.unknown;
  return (
    <span style={{
      alignSelf: 'flex-start', borderRadius: 6, padding: '2px 7px',
      fontSize: 10, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap',
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
    }}>{EGG_LABEL[egg]}</span>
  );
}

/* One order, at four fields. Anything more and the glance becomes reading — the list is one tap
 * away and holds the whole order. */
function Sticky({ s }) {
  const weight = formatKg(s.weight);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '9px 10px', borderRadius: 10, minWidth: 0,
      background: '#fff', border: '1px solid #E8E4DC',
      boxShadow: '0 1px 2px rgba(26,26,26,0.05)',
    }}>
      <EggPill egg={s.egg} />
      <span style={{
        fontSize: 13, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.25,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{s.name}</span>
      <span style={{ fontSize: 11.5, color: '#6b6b6b', lineHeight: 1.35 }}>
        {[weight, s.flavours.join(', ') || null].filter(Boolean).join(' · ') || 'No details yet'}
      </span>
    </div>
  );
}

export default function DayBoard({
  dateLabel, orders = [], loading = false, error = null, onViewOrders, isMobile = false,
}) {
  const batches = batchTotals(orders);
  const stickies = orders.map(stickyFor);
  const shown = stickies.slice(0, CARD_CAP);
  const hidden = stickies.length - shown.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1a1a1a' }}>{dateLabel}</div>

      {loading && <div style={{ fontSize: 12, color: '#8a8a8a' }}>Loading the day…</div>}
      {error && <div style={{ fontSize: 12, color: '#991B1B' }}>{error}</div>}

      {!loading && !error && !orders.length && (
        <div style={{ fontSize: 12, color: '#8a8a8a' }}>Nothing due this day.</div>
      )}

      {/* ── What to bake ───────────────────────────────────────────────────────────────────────
          One line per (flavour × egg), because those are the two things that decide what can share
          a bowl. Weight is omitted rather than guessed when no order in the row carries one. */}
      {!!batches.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: '#8a8a8a',
                        textTransform: 'uppercase' }}>To bake</div>
          {batches.map(b => (
            <div key={`${b.flavour}-${b.egg}`}
                 style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12,
                          color: b.egg === 'unknown' ? '#8A5A1E' : '#3a3a3a' }}>
              <span style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden',
                             textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.flavour}</span>
              <span style={{ color: '#8a8a8a', whiteSpace: 'nowrap' }}>{EGG_LABEL[b.egg]}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {/* "~" earns its place: an estimated split is what somebody weighs flour against,
                    and "about" is a different promise from "this much". */}
                {b.kg == null ? '—' : `${b.estimated ? '~' : ''}${formatKg(b.kg)}`}
              </span>
              {/* Cakes, then tiers only when they differ. A single-tier row saying "1 cake · 1
                  tier" is noise; a one-cake row that needs two tins is not. */}
              <span style={{ color: '#a0a0a0', whiteSpace: 'nowrap', fontSize: 11 }}>
                {b.cakes} {b.cakes === 1 ? 'cake' : 'cakes'}
                {b.tiers > b.cakes && ` · ${b.tiers} tiers`}
              </span>
            </div>
          ))}
          {batches.some(b => b.egg === 'unknown') && (
            <div style={{ fontSize: 11, color: '#8A5A1E', marginTop: 2 }}>
              Ask before you bake — nobody was asked about egg on these.
            </div>
          )}
        </div>
      )}

      {!!shown.length && (
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, minmax(0, 1fr))',
        }}>
          {shown.map(s => <Sticky key={s.id} s={s} />)}
        </div>
      )}

      {hidden > 0 && (
        <div style={{ fontSize: 11.5, color: '#8a8a8a' }}>
          +{hidden} more — open the list to see {hidden === 1 ? 'it' : 'them'}.
        </div>
      )}

      <button
        onClick={onViewOrders}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
          border: 'none', background: '#1a1a1a', color: '#fff',
          fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
        }}>
        View orders
      </button>
    </div>
  );
}
