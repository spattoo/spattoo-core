import { useState, useEffect, useMemo, useRef } from 'react';
import PreviewTile from '../shared/PreviewTile.jsx';
import TopperPreview from '../canvas/TopperPreview.jsx';
import { useImageRegions } from '../shared/color/useImageRegions.js';
import { ZONE_LABELS } from '../constants.js';

// ── My Decoration Studio ─────────────────────────────────────────────────────────────────────────
// Upload your own decoration and get it onto the cake. Used by BOTH the baker and the customer — the
// screen is identical; the API decides who owns the result (a baker's is shared with their bakery, a
// customer's is private to them).
//
// Four things happen here, and each one reuses machinery that already exists:
//
//  1. BACKGROUND REMOVAL — apiClient.removeElementBg(). One chokepoint on the server, so the model
//     behind it can change without touching this screen.
//  2. WHAT KIND IS IT — the offered kinds are element_types with `baker_uploadable`, i.e. DATA. The
//     kind decides where the decoration may go, because the upload INHERITS that type's
//     placement_rules. The uploader never sees a zone matrix.
//  3. WHERE ON THE CAKE — the honest answer to "what is a zone?" is to SHOW them: each zone tile is a
//     real 3D render of THEIR artwork on a cake in that position (PreviewTile + TopperPreview, the same
//     pair the element popup uses). No diagrams, no jargon.
//  4. COLOURS — extract up to 3 hue regions and let them be recoloured. Crucially we save the ORIGINAL
//     image plus a `recolor` descriptor with their picks as per-region defaults, NOT baked pixels. So
//     the decoration renders in their colours AND stays recolourable in the designer afterwards — this
//     screen's colour editor is a preview of the designer's own control, not a second implementation.
//     "Let others change these colours" writes recolor.locked, for a logo that must not be repainted.

const MAX_REGIONS = 3;      // "show up to 3 existing colours" — the recolour engine takes this as config
const REGION_SAT  = 0.25;   // ignore near-greys: black outlines and white highlights are not "a colour"

export default function MyDecorationStudio({ apiClient, tiers, elementTypes = [], onClose, onSaved }) {
  const [file, setFile]         = useState(null);
  const [srcUrl, setSrcUrl]     = useState(null);   // blob: the image as uploaded
  const [cutUrl, setCutUrl]     = useState(null);   // blob: background removed
  const [useCut, setUseCut]     = useState(true);
  const [cutting, setCutting]   = useState(false);
  const [name, setName]         = useState('');
  const [typeId, setTypeId]     = useState('');
  const [zones, setZones]       = useState([]);     // chosen subset of the type's zones
  const [colors, setColors]     = useState({});     // region index → hex (only what they changed)
  const [locked, setLocked]     = useState(false);  // true = others may NOT recolour it
  const [busy, setBusy]         = useState(null);
  const [error, setError]       = useState(null);
  const [quota, setQuota]       = useState(null);
  const objectUrls = useRef([]);

  // Only the kinds admin has opted in. If none are, say so rather than showing an empty dropdown.
  const kinds = useMemo(() => elementTypes.filter(t => t.baker_uploadable), [elementTypes]);
  const kind  = kinds.find(k => k.id === typeId) ?? null;
  const kindZones = useMemo(() => kind?.placement_rules?.zones ?? [], [kind]);

  // The image the element will actually be made from — what every preview below must show.
  const artUrl = (useCut && cutUrl) ? cutUrl : srcUrl;

  // The colours in that artwork. Same hook the designer's swatch panel uses, so the regions the
  // uploader edits here are EXACTLY the regions a customer will later see swatches for.
  const recolorCfg = useMemo(() => ({ method: 'hue_regions', sat: REGION_SAT, maxRegions: MAX_REGIONS }), []);
  const regions = useImageRegions(artUrl, recolorCfg);

  useEffect(() => () => objectUrls.current.forEach(URL.revokeObjectURL), []);
  useEffect(() => { apiClient?.fetchElementQuota?.().then(setQuota).catch(() => {}); }, [apiClient]);

  // Default the chosen zones to everything the kind allows — the common case is "wherever it fits".
  useEffect(() => { setZones(kindZones); }, [kindZones]);

  const track = (url) => { objectUrls.current.push(url); return url; };

  async function pick(f) {
    if (!f) return;
    setError(null); setColors({}); setCutUrl(null);
    setFile(f);
    setSrcUrl(track(URL.createObjectURL(f)));
    if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40));
    await cutBackground(f);
  }

  async function cutBackground(f) {
    if (!apiClient?.removeElementBg) return;   // host didn't wire it — upload as-is
    setCutting(true);
    try {
      setCutUrl(track(URL.createObjectURL(await apiClient.removeElementBg(f))));
    } catch (e) {
      // Not fatal: the image is still usable as uploaded. Say so instead of blocking the save.
      setError(`Couldn’t remove the background (${e.message}). You can still use the image as it is.`);
      setUseCut(false);
    } finally {
      setCutting(false);
    }
  }

  const toggleZone = (z) => setZones(zs => (zs.includes(z) ? zs.filter(x => x !== z) : [...zs, z]));

  async function save() {
    if (!artUrl || !kind)   return setError('Choose an image and what kind of decoration it is.');
    if (!name.trim())       return setError('Give it a name.');
    if (!zones.length)      return setError('Choose at least one place on the cake.');
    setBusy('Saving…'); setError(null);
    try {
      const blob = await (await fetch(artUrl)).blob();
      const key  = await apiClient.uploadElementImage(blob, `${crypto.randomUUID()}.png`);

      // The colour descriptor. `group_defaults` are index-keyed to match the regions the render half
      // derives — the same extractRegions call, so index N here IS index N there.
      const recolor = regions.length
        ? { ...recolorCfg, group_defaults: colors, locked }
        : null;

      await apiClient.createMyElement({
        name: name.trim(),
        element_type_id: kind.id,
        image_url: key,
        allowed_zones: zones,
        placement_config: recolor ? { recolor } : {},
        file_size: blob.size ?? null,
      });
      onSaved?.();
    } catch (e) {
      // The API's ceiling message is already human — show it as-is rather than wrapping it.
      setError(e.message || 'Could not save the decoration.');
    } finally {
      setBusy(null);
    }
  }

  const full = quota && quota.remaining === 0;

  return (
    <div style={S.scrim} onPointerDown={onClose}>
      <div style={S.sheet} onPointerDown={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>Add your own decoration</div>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          {/* 1 — the image */}
          <label style={S.drop}>
            {artUrl
              ? <img src={artUrl} alt="" style={S.art} />
              : <span style={S.dropHint}>Tap to choose a photo of your decoration</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
          </label>

          {cutting && <div style={S.note}>Removing the background…</div>}
          {srcUrl && cutUrl && !cutting && (
            <label style={S.check}>
              <input type="checkbox" checked={useCut} onChange={() => setUseCut(v => !v)} />
              <span>Remove the background</span>
            </label>
          )}

          {srcUrl && (
            <>
              <div style={S.label}>Name</div>
              <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gold butterfly" />

              {/* 2 — what kind is it (this decides where it can go) */}
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

          {full && <div style={S.warn}>This bakery has reached its limit of uploaded decorations. Remove one to add another.</div>}
          {error && <div style={S.err}>{error}</div>}
        </div>

        <div style={S.foot}>
          <button style={S.save(!artUrl || !kind || !zones.length || !!busy || full)}
            onClick={save} disabled={!artUrl || !kind || !zones.length || !!busy || full}>
            {busy ?? 'Save decoration'}
          </button>
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
