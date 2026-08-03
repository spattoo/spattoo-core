import { useEffect, useState } from 'react';
import { Slice } from './CakeVisual.jsx';

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
    return (
      <div style={s.note}>
        <div style={s.noteTitle}>Not quite ready</div>
        <p style={s.noteBody}>
          Picking one for you is still being built. Have a look at what {bakerName} bakes for now —
          there is a slice of each, so you can see what you are getting.
        </p>
        <button type="button" style={s.back} onClick={() => setDoor(null)}>← Back</button>
      </div>
    );
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

  note: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600, color: '#7A6C60' },
  noteTitle: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  noteBody:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },
};
