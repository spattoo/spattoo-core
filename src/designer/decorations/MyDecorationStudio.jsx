import { useState, useEffect, useMemo, useRef } from 'react';
import PreviewTile from '../shared/PreviewTile.jsx';
import TopperPreview from '../canvas/TopperPreview.jsx';
import { useImageRegions } from '../shared/color/useImageRegions.js';
import RightsAttestation from '../../legal/RightsAttestation.jsx';
import { ZONE_LABELS } from '../constants.js';

// ── My Decoration Studio — TWO STEPS, ONE SCREEN ─────────────────────────────────────────────────
//
// mode="upload"   → an IMAGE arrives. That is all. It lands in My Assets, private to whoever uploaded
//                   it, and they can put it on their own cake straight away.
// mode="promote"  → a baker RELEASES one of his own images into his library, where his other customers
//                   can use it. This is where BEHAVIOUR is authored: what kind it is, which zones, how
//                   it sits, which colours may be changed.
//
// WHY THE SPLIT. Those questions have no answer at upload time. A customer dropping her daughter's
// photo into a photo-cake frame is not choosing "hug or stand" — the FRAME owns the placement, and
// asking her is asking a question about nothing. The behaviour only becomes meaningful the moment the
// image is offered to OTHER people, which is exactly what promotion is. So the upload path is now two
// taps (pick, name) and every zone/colour control moved to promotion.
//
// ONE component, not two, because the promote step needs precisely the machinery the upload step used
// to own — the zone tiles, the colour regions. Splitting it into two files would duplicate both.
//
// Each part still reuses what already exists:
//
//  1. BACKGROUND REMOVAL — apiClient.removeElementBg(). One chokepoint on the server, so the model
//     behind it can change without touching this screen.
//  2. WHAT KIND IS IT — the offered kinds are element_types with `baker_uploadable`, i.e. DATA. The
//     kind decides where the decoration may go, because the element INHERITS that type's
//     placement_rules. The baker never sees a zone matrix.
//  3. WHERE ON THE CAKE — the honest answer to "what is a zone?" is to SHOW them: each zone tile is a
//     real 3D render of THEIR artwork on a cake in that position (PreviewTile + TopperPreview, the same
//     pair the element popup uses). No diagrams, no jargon.
//  4. COLOURS — extract up to 3 hue regions and let them be recoloured. Crucially we save the ORIGINAL
//     image plus a `recolor` descriptor with their picks as per-region defaults, NOT baked pixels. So
//     the decoration renders in their colours AND stays recolourable in the designer afterwards — this
//     screen's colour editor is a preview of the designer's own control, not a second implementation.
//     "Let others change these colours" writes recolor.locked, for a logo that must not be repainted.
//
//  5. RIGHTS — the baker attests that this is his to share, and the server records it against the
//     exact wording he read (content_attestations, target_type = decoration). Reuses the SAME
//     RightsAttestation component the storefront publish uses: one statement, one unticked-by-default
//     rule, no second copy to drift.
//
// WHY ASK HERE. Promotion is a PUBLICATION: the image lands in the picker every customer of this
// bakery designs from. Cake decorations are overwhelmingly other people's IP — the image a baker wants
// to reuse across cakes is precisely the cartoon character or the brand logo — and Spattoo is an
// intermediary (ToS 6.5), so liability must demonstrably rest with the baker who released it. When a
// rights holder sends a notice naming that image, "our terms say so" is weak; "he ticked THIS sentence
// on THIS date" is not.
//
// This is the third and last consent moment, after the ToS at onboarding and the storefront publish —
// and it stays evidence rather than reflex precisely because it is rare and deliberate. It is NOT
// asked at upload (a private image, seen by nobody else) and NOT on "save as template" (his own
// library, his own invited customers). A tick clicked fifty times is worth nothing.
//
// The server refuses what no licence covers regardless — a CUSTOMER's upload is not the baker's to
// release, tick or no tick (ToS 6.2).

const MAX_REGIONS = 3;      // "show up to 3 existing colours" — the recolour engine takes this as config
const REGION_SAT  = 0.25;   // ignore near-greys: black outlines and white highlights are not "a colour"

export default function MyDecorationStudio({ apiClient, tiers, elementTypes = [], upload, onClose, onSaved }) {
  const [name, setName]     = useState(upload?.name ?? '');
  const [typeId, setTypeId] = useState('');
  const [zones, setZones]   = useState([]);     // chosen subset of the type's zones
  const [colors, setColors] = useState({});     // region index → hex (only what they changed)
  const [locked, setLocked] = useState(false);  // true = others may NOT recolour it
  const [busy, setBusy]     = useState(null);
  const [error, setError]   = useState(null);
  // Unticked every time this opens, and never pre-ticked: an attestation is only evidence if it was an
  // affirmative act. (The component itself enforces that; the state simply starts false.)
  const [attested, setAttested] = useState(false);

  // Only the kinds admin has opted in. If none are, say so rather than showing an empty dropdown.
  const kinds = useMemo(() => elementTypes.filter(t => t.baker_uploadable), [elementTypes]);
  const kind  = kinds.find(k => k.id === typeId) ?? null;
  const kindZones = useMemo(() => kind?.placement_rules?.zones ?? [], [kind]);

  // The image is ALREADY uploaded (it came from Uploads), so the artwork is its public URL. There is
  // no file picker here and no background removal: both belong to the image, not to the library, and
  // they live in Uploads — a customer who cannot promote must still be able to cut hers out.
  const artUrl = upload?.url ?? null;

  // The colours in that artwork. Same hook the designer's swatch panel uses, so the regions the baker
  // edits here are EXACTLY the regions a customer will later see swatches for.
  const recolorCfg = useMemo(() => ({ method: 'hue_regions', sat: REGION_SAT, maxRegions: MAX_REGIONS }), []);
  const regions = useImageRegions(artUrl, recolorCfg);

  // Default the chosen zones to everything the kind allows — the common case is "wherever it fits".
  useEffect(() => { setZones(kindZones); }, [kindZones]);

  const toggleZone = (z) => setZones(zs => (zs.includes(z) ? zs.filter(x => x !== z) : [...zs, z]));

  // PROMOTE — release one of MY OWN images into the library, WITH its behaviour. The server refuses a
  // customer's upload here (no licence to re-offer her photo to other customers — ToS 6.2), so the
  // error it returns is already human and is shown as-is.
  async function save() {
    if (!kind)         return setError('Choose what kind of decoration it is.');
    if (!zones.length) return setError('Choose at least one place on the cake.');
    if (!attested)     return setError('Confirm you have the right to share this decoration.');
    setBusy('Adding…'); setError(null);
    try {
      // The colour descriptor. `group_defaults` are index-keyed to match the regions the render half
      // derives — the same extractRegions call, so index N here IS index N there.
      const recolor = regions.length ? { ...recolorCfg, group_defaults: colors, locked } : null;
      await apiClient.promoteUpload(upload.id, {
        name: name.trim() || upload.name,
        element_type_id: kind.id,
        allowed_zones: zones,
        placement_config: recolor ? { recolor } : {},
        // The API refuses the promotion without this, and records it against the wording he read —
        // attest first, then expose (spattoo-api routes/uploads.js).
        rights_attested: true,
      });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'Could not add it to your decorations.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={S.scrim} onPointerDown={onClose}>
      <div style={S.sheet} onPointerDown={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>Show in my decorations</div>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          <div style={S.hint}>
            This image will be available to your customers when they design a cake. You can remove it
            from your decorations at any time.
          </div>

          {/* The image is already uploaded — show it. Replacing it, or cutting its background out, are
              things you do to the IMAGE, in Uploads. Not here. */}
          <div style={S.drop}><img src={artUrl} alt="" style={S.art} /></div>

          {artUrl && (
            <>
              <div style={S.label}>Name</div>
              <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gold butterfly" />

              {/* BEHAVIOUR — what kind it is, where it can go, which colours may change. These
                  questions only have an answer HERE: an image is just an image until it is offered to
                  other people as a decoration. */}
              <div style={S.label}>What kind of decoration is it?</div>
              {kinds.length === 0 ? (
                <div style={S.warn}>No decoration kinds are available for upload yet.</div>
              ) : (
                <div style={S.kinds}>
                  {kinds.map(k => (
                    <button key={k.id} onClick={() => setTypeId(k.id)} style={S.kind(k.id === typeId)}>
                      {k.name}
                    </button>
                  ))}
                </div>
              )}

              {/* 3 — where on the cake. SHOW it, don't name it. */}
              {kind && kindZones.length > 0 && (
                <>
                  <div style={S.label}>Where can it go?</div>
                  <div style={S.hint}>Tick every place you want to be able to put it.</div>
                  <div style={S.zones}>
                    {kindZones.map(z => (
                      <PreviewTile key={z} checked={zones.includes(z)} onToggle={() => toggleZone(z)}
                        label={ZONE_LABELS?.[z] ?? z.replace(/_/g, ' ')} height={120}>
                        <TopperPreview
                          glbUrl={artUrl}
                          tiers={tiers}
                          placement={z}
                          mode={kind.placement_rules?.placement?.[z] ?? 'hug'}
                        />
                      </PreviewTile>
                    ))}
                  </div>
                </>
              )}

              {/* 4 — colours */}
              {regions.length > 0 && (
                <>
                  <div style={S.label}>Colours</div>
                  <div style={S.hint}>
                    Tap a colour to change it. The picture keeps its shading — only the colour moves.
                  </div>
                  <div style={S.swatches}>
                    {regions.map((r, i) => (
                      <label key={i} style={S.swatchWrap}>
                        <span style={{ ...S.swatch, background: colors[i] ?? r.hex }} />
                        <input type="color" value={colors[i] ?? r.hex} style={S.colorInput}
                          onChange={e => setColors(c => ({ ...c, [i]: e.target.value }))} />
                      </label>
                    ))}
                  </div>
                  <label style={S.check}>
                    <input type="checkbox" checked={!locked} onChange={() => setLocked(v => !v)} />
                    <span>Let others change these colours</span>
                  </label>
                  <div style={S.hint}>
                    Turn this off for something that must always look the same — a logo, for instance.
                  </div>
                </>
              )}
            </>
          )}

          {error && <div style={S.err}>{error}</div>}
        </div>

        <div style={S.foot}>
          {/* The rights tick — the LAST thing above the button, because it is what the button means.
              Same component, same wording and same unticked-by-default rule as the storefront publish. */}
          <RightsAttestation
            apiClient={apiClient}
            checked={attested}
            onChange={setAttested}
            disabled={!!busy}
          />

          {/* A kind and at least one zone: without them the element has no behaviour, and the API would
              refuse it anyway. And the tick: the server refuses an unattested promotion. */}
          {(() => {
            const blocked = !artUrl || !!busy || !kind || !zones.length || !attested;
            return (
              <button style={S.save(blocked)} onClick={save} disabled={blocked}>
                {busy ?? 'Show in my decorations'}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const S = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(20,20,24,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, maxHeight: '92vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Quicksand',sans-serif" },
  head:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #eee' },
  title: { fontSize: 15, fontWeight: 800, color: '#1a1a1a' },
  x:     { border: 'none', background: 'none', fontSize: 16, color: '#888', cursor: 'pointer' },
  body:  { padding: 16, overflowY: 'auto', flex: 1 },
  foot:  { padding: 12, borderTop: '1px solid #eee' },

  drop:  { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 170, borderRadius: 12, border: '2px dashed #d5d3da', background: '#faf9fb', cursor: 'pointer', overflow: 'hidden' },
  dropHint: { fontSize: 12.5, fontWeight: 700, color: '#8a7a80', textAlign: 'center', padding: '0 20px' },
  art:   { maxWidth: '100%', maxHeight: 220, objectFit: 'contain' },

  label: { fontSize: 10, fontWeight: 800, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 18, marginBottom: 6 },
  hint:  { fontSize: 11, color: '#9a939a', fontWeight: 600, marginBottom: 8, lineHeight: 1.45 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #ddd', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', boxSizing: 'border-box' },
  check: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#444', cursor: 'pointer' },

  kinds: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  kind:  (on) => ({ padding: '9px 14px', borderRadius: 9, border: `1.5px solid ${on ? '#1a1a1a' : '#ddd'}`, background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#444', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }),

  zones: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 },

  swatches: { display: 'flex', gap: 12 },
  swatchWrap: { position: 'relative', cursor: 'pointer' },
  swatch: { display: 'block', width: 40, height: 40, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.15)' },
  colorInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },

  note:  { fontSize: 12, fontWeight: 700, color: '#6B8C74', marginTop: 10 },
  warn:  { marginTop: 12, padding: '10px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: '#FFF8E6', color: '#8A6D1A' },
  err:   { marginTop: 12, padding: '10px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: '#FFF0F0', color: '#C0392B', lineHeight: 1.4 },
  save:  (d) => ({ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: d ? '#c9c7cf' : '#1a1a1a', color: '#fff', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: d ? 'not-allowed' : 'pointer' }),
};
