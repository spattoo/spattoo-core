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
                            /* ── A PHOTOGRAPH IS ORDERED, NOT OPENED ──────────────────────────────
                             * Sandeep: "on tap- show the picture big with a 'Request quote' button
                             * (customer view)."
                             *
                             * A photo has no design (migration 116's CHECK), so it cannot fill the
                             * design slot the way a template does. It fills the REFERENCE slot
                             * instead — `kind: 'photo'`, the same kind the photo door produces —
                             * and its R2 key travels as `photoKeys`, which `toOrderPayload` sends
                             * as `referenceKeys`. The API mirrors the first reference key into
                             * `design_thumbnail_url`, so the baker sees the actual cake in their
                             * Orders list, in the email, everywhere.
                             *
                             * ⚠️ NO `tier_count` IS WRITTEN. A photo's is null on purpose — nobody
                             * counted the tiers in a photograph — and passing it to `setTierCount`
                             * would seed the flavour facet with a guess the customer never made.
                             *
                             * ⚠️ AND NO SNAPSHOT, so `validateOrderBody` treats this as an enquiry
                             * rather than a cake order, which is exactly right: the baker has to
                             * read the picture and quote it. That is the path Sandeep named —
                             * "it should take the same existing path (reference image) order path". */
                            onPickPhoto={(t) => {
                              patch({ design: { kind: 'photo', templateId: t.id,
                                                templateName: t.name, thumbnailUrl: t.thumbnail_url,
                                                shape: null, photos: [],
                                                photoKeys: t.thumbnail_key ? [t.thumbnail_key] : [],
                                                snapshot: null,
                                                minWeightKg: t.attrs?.min_weight_kg ?? null } });
                              close();
                            }}
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
// Thumbnails, nothing else — not even a name. Sandeep, settling this for the designer's catalogue
// first: "we can actually skip showing the name. its difficult to name a lot of templates. thumbnail
// speaks. just the way canva app does." The storefront showed the same label failing the same way —
// three cards in one screenshot read Football — so it was width spent on a word that distinguished
// nothing. The name is still in the DOM as the picture's `alt`; see the card.
// The full design snapshot is not fetched here and the public
// route does not serve it: it is what a browsing customer least needs and a competitor most wants.
// Whoever actually starts from one asks for it by id.

function TemplateGallery({ api, bakerName, onBack, onPick, onPickPhoto, selectedId }) {
  const [state, setState] = useState({ loading: true, templates: [], error: null });
  /* The photograph being looked at, large. Null is the grid. Local rather than lifted because
     nothing outside this door needs to know a customer is squinting at a picture. */
  const [photo, setPhoto] = useState(null);

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

  // A baker with nothing to show must not get an empty grid and no explanation.
  //
  // ⚠️ THIS IS NOW THE DEFAULT STATE, NOT A RARE ONE. It used to describe a baker who had switched
  // off the global library and made none of their own — unusual, because everything was offered
  // until excluded. Since the storefront cut over to the opt-IN catalogue (2026-09-28) the polarity
  // is reversed: nothing is offered until the baker adds it, and migration 115 seeded no rows, so
  // EVERY baker lands here until they curate. The copy below is still true and still the right
  // thing to say; what changed is how often a customer will read it.
  if (!state.templates.length) {
    return (
      <div style={s.note}>
        <div>{bakerName} hasn&rsquo;t put any cakes up yet.</div>
        <p style={s.soonBody}>Try one of the other ways in — a photo, or design one yourself.</p>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
      </div>
    );
  }

  /* ── The photograph, large, with the one thing you can do with it ─────────────────────────────
   * Replaces the grid rather than floating over it: this is a phone-first surface, and a lightbox
   * at 375px is a picture with no room for the button that gives it a purpose. Back returns to the
   * grid, so nothing is lost by tapping one.
   *
   * ⚠️ The caption says what it IS. A customer who cannot tell a photograph of finished work from a
   * design they could have opened will read a 3D cake as a promise of that exact cake. */
  if (photo) {
    return (
      <>
        <div style={s.galleryHead}>
          <button type="button" style={s.back} onClick={() => setPhoto(null)}>← Back</button>
          <span style={s.galleryHint}>A cake {bakerName} has made</span>
        </div>

        <div style={s.bigWrap}>
          {photo.thumbnail_url
            ? <img src={photo.thumbnail_url} alt={photo.name} style={s.bigImg} />
            : <div style={s.noThumb} aria-hidden="true">🎂</div>}
        </div>
        <div style={s.bigName}>{photo.name}</div>

        {/* A photograph cannot be priced from its pixels — the baker reads it and answers. So the
            words promise a conversation, not a number. */}
        <p style={s.soonBody}>
          {bakerName} will look at this and send you a price. You can say the size, flavour and date
          next.
        </p>
        <button type="button" style={s.quoteBtn} onClick={() => onPickPhoto?.(photo)}>
          Request quote
        </button>
      </>
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
        {state.templates.map(t => {
          const isPhoto = t.type === 'photo';
          return (
            /* ⚠️ A PHOTO OPENS, A DESIGN PICKS, and the two must not be one gesture. Picking a
               design fills the design slot and closes the facet; a photograph has no design to
               fill it with, so tapping one the same way produced an order carrying nothing — the
               bug that kept photos off this gallery entirely until now. */
            <button key={t.id} type="button"
                    onClick={() => (isPhoto ? setPhoto(t) : onPick(t))}
                    style={{ ...s.card, ...(t.id === selectedId ? s.cardOn : null) }}
                    aria-pressed={t.id === selectedId}>
              <div style={s.thumbWrap}>
                {/* ⚠️ THE NAME IS THE `alt`, AND THAT IS THE WHOLE REASON THIS IS NOT `alt=""`.
                    With the caption gone the picture is all the card has, so an empty alt would
                    leave this button with no accessible name at all — a screen reader would read a
                    grid of "button, button, button". Not drawn, still said. */}
                {t.thumbnail_url
                  ? <img src={t.thumbnail_url} alt={t.name} loading="lazy" style={s.thumb} />
                  : <div style={s.noThumb} aria-hidden="true">🎂</div>}
                {/* Legible BEFORE the tap (rule 7): these two tiles do different things. */}
                {isPhoto && <span style={s.photoTag}>Photo</span>}
                {/* ⚠️ ON the picture now, not under it — the row it used to sit in is gone, and a
                    lone "2 tiers" hanging below some cards and not others was a ragged edge for one
                    word. Top left, mirroring `TemplateGrid`'s badge so the same fact sits in the
                    same corner on both sides of the app (INVARIANTS #14). A photo's `tier_count` is
                    null on purpose, so these two chips can never collide. */}
                {t.tier_count > 1 && <span style={s.tierTag}>{t.tier_count} tiers</span>}
              </div>
            </button>
          );
        })}
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

  /* ⚠️ TWO ON A PHONE, ALWAYS — never three, and never one. A bare `minmax(Npx, 1fr)` cannot say
     that: the column count falls out of N against a width this component does not know, so every N
     is wrong on some phone. Measured in the harness, grid width is the viewport less 76: a 320px
     phone gives 244 and a 430px phone 420. At `minmax(132px, …)` the big phone fits THREE columns —
     which is what shipped, and what "hardly able to see the complete cake" was looking at — while at
     `minmax(170px, …)` the small phone collapses to ONE.
     `min(170px, (100% - gap) / 2)` caps the track's minimum at half the row, so two columns always
     fit however narrow it gets, and the 170 only starts to bind once there is room for a third —
     i.e. on a tablet or a desktop, where a third column is wanted. One expression, no breakpoint,
     and no number that has to be re-guessed per device. */
  grid: { display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, (100% - 10px) / 2), 1fr))' },
  /* ⚠️ THE PICTURE IS THE WHOLE CARD. No caption row, so no padding to inset it and no gap to hold
     one — that is ~16px of width and a whole text row handed back to the cake. `overflow: hidden`
     is what makes the border radius clip the image now that it reaches the edge. */
  card: { display: 'flex', flexDirection: 'column', padding: 0, cursor: 'pointer', overflow: 'hidden',
          borderRadius: 12, border: '1.5px solid #EDE5DB', background: '#fff', font: 'inherit' },
  cardOn: { borderColor: '#2C4433', boxShadow: '0 0 0 2px rgba(44,68,51,0.12)' },
  /* ⚠️ 3:2 BECAUSE THAT IS WHAT A STORED THUMBNAIL ACTUALLY IS, and this box was square. The capture
     does not store the frame it rendered — `captureThumbnailBlob` crops to the cake's alpha bounds
     and grows the rect to `THUMB_ASPECT`, which is 3/2. Measured by running the real `contentBounds`
     + `contentCrop` over six rendered cakes, including a tall one: every single crop came out at
     1.50. A 3:2 picture drawn `contain` in a 1:1 box fits by width and leaves a THIRD of the height
     empty, as equal bands above and below — exactly the dead space reported from the live
     storefront. Matching the box to the picture removes all of it, with nothing cropped and no
     thumbnail re-captured.
     ⚠️ `TemplateGrid` carries the opposite claim — "the stored thumbnails ARE square: the capture
     canvas is a fixed 400x400". The canvas is; the stored crop of it is not, and that grid is
     letterboxing the same third. Corrected there in the comment, not in the layout, because it is
     the designer's catalogue and nobody asked for it to move. */
  thumbWrap: { position: 'relative', aspectRatio: '3 / 2', background: '#FAF6F0',
               overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  photoTag: { position: 'absolute', right: 4, bottom: 4, fontSize: 9, fontWeight: 800,
              letterSpacing: 0.3, color: '#fff', background: 'rgba(42,36,31,0.72)',
              borderRadius: 5, padding: '2px 5px', pointerEvents: 'none' },

  // The enlarged photograph. `contain`, never `cover` — a cropped cake is a different cake.
  bigWrap: { borderRadius: 12, background: '#FAF6F0', overflow: 'hidden', display: 'flex',
             alignItems: 'center', justifyContent: 'center', maxHeight: '52vh' },
  bigImg:  { width: '100%', height: 'auto', maxHeight: '52vh', objectFit: 'contain', display: 'block' },
  bigName: { fontSize: 14.5, fontWeight: 800, color: '#2A241F', marginTop: 10 },
  quoteBtn: { width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: '#2C4433', color: '#fff', font: 'inherit', fontSize: 14.5,
              fontWeight: 800, cursor: 'pointer' },
  thumb:   { width: '100%', height: '100%', objectFit: 'contain' },
  noThumb: { fontSize: 26, opacity: 0.35 },
  tierTag: { position: 'absolute', left: 4, top: 4, fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
             color: '#5A4C40', background: 'rgba(255,255,255,0.92)', border: '1px solid #E7DFD5',
             borderRadius: 5, padding: '2px 5px', pointerEvents: 'none' },

  note: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600,
          color: '#7A6C60' },
  soon: { display: 'flex', flexDirection: 'column', gap: 8 },
  soonTitle: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  soonBody:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },
};
