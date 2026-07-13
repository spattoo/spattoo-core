import { useEffect, useState, useMemo } from 'react';

// ── My Assets ────────────────────────────────────────────────────────────────────────────────────
// Every image THIS person has uploaded (baker_uploads). Private: a customer sees her own and nobody
// else's — not another customer's of the same baker, and not the baker's. That is the whole safety
// property of the model, and it is why none of this needs a consent gate.
//
// An upload is USABLE IMMEDIATELY — tap it and it goes on the cake. Promotion is NOT a prerequisite for
// using your own image; it is how a BAKER offers one of his to his customers, and it is the only way an
// image ever becomes visible to anyone else.
//
// PLACING AN UN-PROMOTED UPLOAD. It carries no placement of its own (behaviour is authored at
// promotion), so it borrows the rules of the element type flagged `default_for_uploads` — DATA, found by
// filtering the types the API already sent. No id, no slug, no constant in this file: the answer can
// differ per environment and is changed by flipping a boolean in admin, never a deploy.
//
// The object handed to onPlace is ELEMENT-SHAPED on purpose: addSticker() takes an element, and an
// upload can be made to look like one. So placement rides the SAME path as every library element —
// no parallel "place an upload" code path to drift (INVARIANTS.md).
export default function MyAssetsPanel({ apiClient, elementTypes = [], canPromote = false, onPlace, onPromote, onClose }) {
  const [uploads, setUploads] = useState(null);   // null = loading
  const [busy, setBusy]       = useState(null);
  const [error, setError]     = useState(null);

  // The type an upload behaves as when placed directly. If admin has flagged none, placement has no
  // rules to inherit — say so plainly rather than guessing a type and putting the image somewhere odd.
  const defaultType = useMemo(
    () => elementTypes.find(t => t.default_for_uploads) ?? null,
    [elementTypes],
  );

  const load = () => apiClient?.fetchUploads?.()
    .then(rows => setUploads(Array.isArray(rows) ? rows : []))
    .catch(e => { setError(e.message || 'Could not load your images.'); setUploads([]); });

  useEffect(() => { load(); }, [apiClient]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Make the upload look like an element, so it rides the ordinary placement path.
  function place(u) {
    if (!defaultType) return setError('Uploads can’t be placed yet — no decoration kind is set up for them.');
    onPlace?.({
      id:               `upload:${u.id}`,
      name:             u.name || 'My image',
      image_url:        u.url,
      thumbnail_url:    u.url,
      element_type_id:  defaultType.id,
      allowed_zones:    defaultType.placement_rules?.zones ?? [],
      placement_config: defaultType.placement_rules?.placement ?? {},
      allowed_actions:  defaultType.default_allowed_actions ?? { resize: true, duplicate: true, color: false, delete: true },
    });
    onClose?.();
  }

  async function remove(u) {
    // Deleting an image the baker has promoted also takes it out of every customer's picker (the API
    // cascades via source_upload_id). Say so BEFORE, not after — it is not obvious that removing your
    // own image withdraws it from other people's cakes-in-progress.
    const warn = u.promoted
      ? 'Delete this image? It will also be removed from your decorations, so your customers can no longer use it.'
      : 'Delete this image?';
    if (!window.confirm(warn)) return;
    setBusy(u.id);
    try {
      await apiClient.deleteUpload(u.id);
      await load();
    } catch (e) {
      setError(e.message || 'Could not delete it.');
    } finally {
      setBusy(null);
    }
  }

  async function unlink(u) {
    setBusy(u.id);
    try {
      await apiClient.unlinkUpload(u.id);   // is_active = false on the library copy; the image stays here
      await load();
    } catch (e) {
      setError(e.message || 'Could not remove it from your decorations.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={S.scrim} onPointerDown={onClose}>
      <div style={S.sheet} onPointerDown={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>My images</div>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          {uploads === null && <div style={S.note}>Loading…</div>}

          {uploads?.length === 0 && (
            <div style={S.empty}>
              Nothing here yet. Anything you upload — a photo for a photo cake, a decoration of your own —
              appears here, and only you can see it.
            </div>
          )}

          {uploads?.length > 0 && (
            <div style={S.grid}>
              {uploads.map(u => (
                <div key={u.id} style={S.card}>
                  {/* The image IS the button: tap to put it on the cake. */}
                  <button style={S.thumbBtn} onClick={() => place(u)} title="Put it on the cake">
                    <img src={u.url} alt={u.name || ''} style={S.thumb} loading="lazy" />
                  </button>
                  <div style={S.name}>{u.name || 'My image'}</div>

                  <div style={S.actions}>
                    {/* Promotion is a BAKER's act, and only on his OWN uploads: a customer's image is
                        not his to offer to other customers (the API refuses it — ToS 6.2). Hiding the
                        button on hers is not the security boundary, only the courtesy: the server is. */}
                    {canPromote && u.uploadedBy === 'baker' && (
                      u.promoted
                        ? <button style={S.act} disabled={busy === u.id} onClick={() => unlink(u)}>Remove from decorations</button>
                        : <button style={S.act} disabled={busy === u.id} onClick={() => onPromote?.(u)}>Show in my decorations</button>
                    )}
                    <button style={S.actDanger} disabled={busy === u.id} onClick={() => remove(u)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <div style={S.err}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

const S = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(20,20,24,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '92vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Quicksand',sans-serif" },
  head:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #eee' },
  title: { fontSize: 15, fontWeight: 800, color: '#1a1a1a' },
  x:     { border: 'none', background: 'none', fontSize: 16, color: '#888', cursor: 'pointer' },
  body:  { padding: 16, overflowY: 'auto', flex: 1 },

  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 },
  card:  { display: 'flex', flexDirection: 'column', gap: 6 },
  thumbBtn: { padding: 0, border: '1.5px solid #e2e0e6', borderRadius: 11, background: '#faf9fb', cursor: 'pointer', overflow: 'hidden', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thumb: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  name:  { fontSize: 11.5, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.3 },
  actions: { display: 'flex', flexDirection: 'column', gap: 4 },
  act:   { padding: '6px 8px', borderRadius: 7, border: '1.5px solid #ddd', background: '#fff', color: '#444', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' },
  actDanger: { padding: '6px 8px', borderRadius: 7, border: '1.5px solid #f0d8d8', background: '#fff', color: '#C0392B', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' },

  note:  { fontSize: 12.5, fontWeight: 700, color: '#8a7a80' },
  empty: { fontSize: 12.5, fontWeight: 600, color: '#8a7a80', lineHeight: 1.5, textAlign: 'center', padding: '28px 12px' },
  err:   { marginTop: 12, padding: '10px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: '#FFF0F0', color: '#C0392B', lineHeight: 1.4 },
};
