import { useEffect, useState } from 'react';
import PhotoDoor from './PhotoDoor.jsx';

// ── The design facet ────────────────────────────────────────────────────────────────────────────
// Three doors onto the same field. The customer picks the one they recognise themselves in, and
// each writes `design` on the shared draft — so nothing downstream has to know which was used
// except where the shapes genuinely differ (a template and the designer yield a real design, a
// photo yields a reference the baker still has to read).
//
// Templates are FIRST, and not because they are proof of anything. A template is a design somebody
// authored — often Spattoo, from the global library — and it says the baker is willing and able to
// make it, never that they ever have. It leads because it is the only door that produces something
// COMPLETE: the system already knows its tiers, shape and decorations, so it can reach a quote with
// nothing read or guessed. A photo is a request that must be interpreted, by X-Ray or by the baker
// squinting at it, and that is a credit or a round-trip.

const DOORS = [
  { kind: 'template', label: "I'm in a hurry — show me some cakes you can make" },
  { kind: 'photo',    label: "I've got a cake photo for reference" },
  { kind: 'designed', label: "I'm feeling creative — let me build it myself in 3D" },
];

export default function DesignFacet({ draft, patch, close, api, bakerName, slug, setTierCount, onStartDesign }) {
  // null = the three doors. Opening one replaces them; there is no step counter, because there are
  // no steps — a door is a way in, not a stage.
  const [door, setDoor] = useState(null);

  if (door === 'template') {
    return <TemplateGallery api={api} bakerName={bakerName} onBack={() => setDoor(null)}
                            selectedId={draft.design.templateId}
                            onPick={(t) => {
                              patch({ design: { kind: 'template', templateId: t.id,
                                                templateName: t.name, thumbnailUrl: t.thumbnail_url,
                                                // Free — the template carries it, so the order can
                                                // record a shape without asking anyone.
                                                shape: t.shape ?? null,
                                                photoKeys: [], snapshot: null,
                                                // The size facet uses this as a floor, never as an
                                                // answer — see SizeDateFacets.
                                                minWeightKg: t.attrs?.min_weight_kg ?? null } });
                              // The template knows how many tiers it has, so the flavour facet
                              // never has to ask — `never ask twice`, across facets. A fact one
                              // of them learned belongs to the cake, not to whoever found it.
                              // The template answers the size facet's shape question outright, so
                              // it is written to the CAKE rather than left for the customer to
                              // re-answer — "never ask twice", across facets.
                              if (t.tier_count) {
                                setTierCount(t.tier_count);
                                patch({ size: { tierCount: t.tier_count } });
                              }
                              close();
                            }} />;
  }

  if (door === 'photo') {
    return <PhotoDoor draft={draft} patch={patch} bakerName={bakerName} slug={slug}
                      onBack={() => setDoor(null)} />;
  }

  if (door) {
    return (
      <div style={s.soon}>
        <div style={s.soonTitle}>Not quite ready</div>
        <p style={s.soonBody}>
          This way in is still being built. Pick a cake below for now, or send a photo and tell
          {' '}{bakerName} what you are after — they will take it from there.
        </p>
        <button type="button" style={s.back} onClick={() => setDoor(null)}>← Back</button>
      </div>
    );
  }

  return (
    <>
      {DOORS.map(d => (
        <button key={d.kind} type="button" style={s.door}
                onClick={() => {
                  // ⚠️ The designer door said "Not quite ready" and that was a REGRESSION, not an
                  // unbuilt feature. The 3D designer exists and the host has always handled
                  // onStartDesign by routing to it — the hero CTA used to call it directly, and
                  // putting the chooser in front replaced that call with `setShowFacets(true)`. So a
                  // walk-up visitor lost the route while an invited customer kept it, and the
                  // marketing site went on selling "your customers design their cake in 3D".
                  //
                  // Navigating on the CLICK, not from render: calling it while rendering is a side
                  // effect in render and fires twice under StrictMode.
                  if (d.kind === 'designed' && onStartDesign) { onStartDesign(); return; }
                  setDoor(d.kind);
                }}>
          <span style={s.doorLabel}>{d.label}</span>
          {draft.design.kind === d.kind && <span style={s.doorTick}>✓</span>}
        </button>
      ))}
    </>
  );
}

// ── The gallery ─────────────────────────────────────────────────────────────────────────────────
// Thumbnails and names, nothing else. The full design snapshot is not fetched here and the public
// route does not serve it: it is what a browsing customer least needs and a competitor most wants.
// Whoever actually starts from one asks for it by id.

function TemplateGallery({ api, bakerName, onBack, onPick, selectedId }) {
  const [state, setState] = useState({ loading: true, templates: [], error: null });

  useEffect(() => {
    let alive = true;
    api.fetchStorefrontTemplates()
      .then(list => alive && setState({ loading: false, templates: list ?? [], error: null }))
      .catch(e => alive && setState({ loading: false, templates: [], error: e.message }));
    return () => { alive = false; };
  }, [api]);

  if (state.loading) return <div style={s.note}>Fetching cakes…</div>;

  if (state.error) {
    return (
      <div style={s.note}>
        <div>Could not load these just now.</div>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
      </div>
    );
  }

  // A baker with nothing to show must not get an empty grid and no explanation. This is a real
  // state — a new baker who has excluded the global library and not yet made their own.
  if (!state.templates.length) {
    return (
      <div style={s.note}>
        <div>{bakerName} hasn&rsquo;t put any cakes up yet.</div>
        <p style={s.soonBody}>Try one of the other ways in — a photo, or design one yourself.</p>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <>
      <div style={s.galleryHead}>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
        {/* Capability, never authorship or a past bake — see plans/storefront-facets.md. */}
        <span style={s.galleryHint}>Cakes {bakerName} can make</span>
      </div>

      <div style={s.grid}>
        {state.templates.map(t => (
          <button key={t.id} type="button" onClick={() => onPick(t)}
                  style={{ ...s.card, ...(t.id === selectedId ? s.cardOn : null) }}
                  aria-pressed={t.id === selectedId}>
            <div style={s.thumbWrap}>
              {t.thumbnail_url
                ? <img src={t.thumbnail_url} alt="" loading="lazy" style={s.thumb} />
                : <div style={s.noThumb} aria-hidden="true">🎂</div>}
            </div>
            <span style={s.cardName}>{t.name}</span>
            {t.tier_count > 1 && <span style={s.cardMeta}>{t.tier_count} tiers</span>}
          </button>
        ))}
      </div>
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

  galleryHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  galleryHint: { fontSize: 11.5, fontWeight: 700, color: '#A2968A' },
  back: { border: 'none', background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: '#7A6C60', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', gap: 5, padding: 8, cursor: 'pointer',
          borderRadius: 12, border: '1.5px solid #EDE5DB', background: '#fff', font: 'inherit' },
  cardOn: { borderColor: '#2C4433', boxShadow: '0 0 0 2px rgba(44,68,51,0.12)' },
  thumbWrap: { aspectRatio: '1 / 1', borderRadius: 9, background: '#FAF6F0', overflow: 'hidden',
               display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thumb:   { width: '100%', height: '100%', objectFit: 'contain' },
  noThumb: { fontSize: 26, opacity: 0.35 },
  cardName: { fontSize: 12, fontWeight: 700, color: '#2A241F', lineHeight: 1.3, textAlign: 'center' },
  cardMeta: { fontSize: 10.5, fontWeight: 600, color: '#A2968A', textAlign: 'center' },

  note: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600,
          color: '#7A6C60' },
  soon: { display: 'flex', flexDirection: 'column', gap: 8 },
  soonTitle: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  soonBody:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },
};
