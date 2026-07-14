import { useEffect, useState, useMemo } from 'react';
import { ACCEPT_IMAGE, validateImageFile, compressImage, imageExt } from '../../shared/image.js';
import { useUploadLimits } from '../../shared/useUploadLimits.js';

// An upload is a picture whose USE is not yet decided — it may be placed as a decoration, or chosen as
// a photo-cake frame photo, which the customer can pinch-zoom into on the cake. So the ceiling sits
// above what she can magnify to, and the aspect ratio is never touched.
const UPLOAD_MAX_EDGE = 2048;
const UPLOAD_QUALITY  = 0.85;

// ── Uploads ─────────────────────────────────────────────────────────────────────────────────────
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
// Three dots — the grip that holds everything you can do to one image. Drawn, not a character: a
// glyph scales with the button and cannot be substituted by a font that lacks it.
function DotsGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {[3.5, 8, 12.5].map(cy => <circle key={cy} cx="8" cy={cy} r="1.4" fill="currentColor" />)}
    </svg>
  );
}

export default function UploadsPanel({ apiClient, elementTypes = [], canPromote = false, selectMode = false, onSelect, onPlace, onPromote, onClose }) {
  const [uploads, setUploads] = useState(null);   // null = loading
  const [busy, setBusy]       = useState(null);
  const [error, setError]     = useState(null);
  const [uploading, setUploading] = useState(false);
  // The grid is a GRID — one tap target per image. Everything you can DO to an image lives behind its
  // own menu, because three stacked buttons under every thumbnail turned the card into mostly chrome
  // and pushed the images themselves off the screen.
  const [menuFor, setMenuFor]     = useState(null);   // upload id whose menu is open
  const [editing, setEditing]     = useState(null);   // the image being edited (its own screen)
  const [confirming, setConfirming] = useState(null); // the image awaiting a delete confirmation
  // The ceiling is the SERVER's (env-tuned), read at runtime — never a copy that could drift from it.
  const { maxImageBytes } = useUploadLimits(apiClient);

  // The type an upload behaves as when placed directly. If admin has flagged none, placement has no
  // rules to inherit — say so plainly rather than guessing a type and putting the image somewhere odd.
  const defaultType = useMemo(
    () => elementTypes.find(t => t.default_for_uploads) ?? null,
    [elementTypes],
  );

  const load = () => apiClient?.fetchUploads?.()
    .then(rows => setUploads(Array.isArray(rows) ? rows : []))
    .catch(e => { setError(e.message || 'Could not load your uploads.'); setUploads([]); });

  useEffect(() => { load(); }, [apiClient]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Upload a new image FROM HERE. This is why the photo-frame popup has one button and not two: the
  // frame asks "which image?", and "a new one" is simply one of the answers. Every photo therefore
  // goes through registration — none can slip in as an untracked R2 object, which is exactly what the
  // old straight-to-frame file input did.
  //
  // No background removal on this path (that is the decoration studio's job, and it is wrong for a
  // photograph — nobody wants their daughter cut out of her own birthday picture).
  async function uploadNew(f) {
    if (!f) return;
    // The REAL gate: `accept` on the input is advisory (it doesn't survive a drag-drop or an "All
    // files" pick), so a HEIC or an SVG is only refused here — with a sentence, rather than uploading
    // an object that renders as nothing. shared/image.js owns the allowlist; there is no second copy.
    const bad = validateImageFile(f, { maxBytes: maxImageBytes });
    if (bad) return setError(bad);
    setUploading(true); setError(null);
    try {
      // Optimize BEFORE it reaches R2 — a phone photo arrives at 4032×3024 and several MB, and until
      // now went up whole. compressImage, NOT normalizeArtwork (the alpha-crop-into-a-square an element's
      // artwork gets): an upload here may end up as a photo-cake FRAME photo, and squaring a birthday
      // photograph would distort the framing its owner chose. 2048 because she can pinch-zoom into a
      // frame photo on the cake, so the ceiling must sit above what she can magnify to. The extension
      // comes from the blob's REAL type — a browser with no WebP encoder gets the original back, and the
      // filename must not lie about that (the signed PUT signs the content type).
      const blob = await compressImage(f, { maxEdge: UPLOAD_MAX_EDGE, quality: UPLOAD_QUALITY });
      const key = await apiClient.uploadElementImage(blob, `${crypto.randomUUID()}.${imageExt(blob)}`);
      const saved = await apiClient.registerUpload({ storage_key: key, name: f.name?.replace(/\.[^.]+$/, '').slice(0, 40) || 'Untitled' });
      // Picking a file WAS the choice — don't make them tap it again in the grid they just left.
      if (selectMode && saved?.url) onSelect?.(saved);
      else await load();
    } catch (e) {
      setError(e.message || 'Could not upload that image.');
    } finally {
      setUploading(false);
    }
  }

  // A tap means "use this". WHAT that means is the caller's business — fill the frame it opened me
  // for, or put it on the cake. The panel does not know what a photo frame is.
  function choose(u) {
    if (selectMode) { onSelect?.(u); return; }
    place(u);
  }

  // Make the upload look like an element, so it rides the ordinary placement path.
  function place(u) {
    if (!defaultType) return setError('Uploads can’t be placed yet — no decoration kind is set up for them.');
    onPlace?.({
      id:               `upload:${u.id}`,
      name:             u.name || 'Untitled',
      image_url:        u.url,
      thumbnail_url:    u.url,
      element_type_id:  defaultType.id,
      allowed_zones:    defaultType.placement_rules?.zones ?? [],
      placement_config: defaultType.placement_rules?.placement ?? {},
      allowed_actions:  defaultType.default_allowed_actions ?? { resize: true, duplicate: true, color: false, delete: true },
    });
    onClose?.();
  }

  // Confirmed in the panel, not through window.confirm: a browser dialog in the middle of a branded
  // app is jarring on a desktop and worse on a phone, and it cannot say WHAT deleting this one costs.
  async function remove(u) {
    setBusy(u.id); setError(null);
    try {
      await apiClient.deleteUpload(u.id);
      setConfirming(null);
      if (editing?.id === u.id) setEditing(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not delete it.');
    } finally {
      setBusy(null);
    }
  }

  // Cut the background out. A TREATMENT of an image, not a step in a wizard — so it lives here, on the
  // image, rather than only at upload. That matters most for a CUSTOMER: she cannot promote, so if
  // cut-out only existed on the promote path her decoration would always carry its background and she
  // would have no way to fix it. Runs server-side on the stored object; the row is updated in place, so
  // every design already using the image picks up the cut version.
  async function cutBg(u) {
    setBusy(u.id); setError(null);
    try {
      const updated = await apiClient.removeUploadBg(u.id);
      // The row is updated in place, so the URL is the same object — bust the cache or the edit screen
      // keeps showing the version WITH its background and the operator thinks nothing happened.
      const fresh = updated?.url ?? u.url;
      if (editing?.id === u.id) setEditing({ ...u, url: `${fresh}${fresh.includes('?') ? '&' : '?'}v=${Date.now()}` });
      await load();
    } catch (e) {
      setError(e.message || 'Could not remove the background.');
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

  // ── Edit one image ────────────────────────────────────────────────────────────────────────────
  // A screen, not a menu of verbs: the operator is working ON the picture, so the picture is the
  // subject and the treatments sit under it. Crop belongs here next. "Use as a decoration" is offered
  // as the natural NEXT step — you almost always want the background gone before you hand it to your
  // customers — while remaining a first-class item in the card's own menu, because it is the one act
  // here with consequences beyond this person and must not hide behind a benign label.
  if (editing) {
    const u = editing;
    const mine = canPromote && u.uploadedBy === 'baker';
    const working = busy === u.id;
    return (
      <div style={S.scrim} onPointerDown={onClose}>
        <div style={S.sheet} onPointerDown={e => e.stopPropagation()}>
          <div style={S.head}>
            <button style={S.back} onClick={() => setEditing(null)} aria-label="Back to uploads">←</button>
            <div style={S.title}>{u.name || 'Untitled'}</div>
            <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div style={S.body}>
            <div style={S.editArt}>
              <img src={u.url} alt={u.name || ''} style={S.editImg} />
            </div>

            {apiClient?.removeUploadBg && (
              <button style={S.editAct} disabled={working} onClick={() => cutBg(u)}>
                {working ? 'Removing the background…' : 'Remove background'}
              </button>
            )}
            <div style={S.hint}>
              Cuts the subject out of the picture. Every cake already using this image picks up the
              cut-out version.
            </div>

            {error && <div style={S.err}>{error}</div>}
          </div>

          {mine && !u.promoted && (
            <div style={S.foot}>
              <button style={S.primary} disabled={working} onClick={() => { setEditing(null); onPromote?.(u); }}>
                Use as a decoration
              </button>
              <div style={{ ...S.hint, textAlign: 'center', marginTop: 6 }}>
                Your customers will be able to put it on their cakes.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.scrim} onPointerDown={onClose}>
      <div style={S.sheet} onPointerDown={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>{selectMode ? 'Choose an image' : 'Uploads'}</div>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Deleting is confirmed HERE, in the panel — and it says what it costs. Withdrawing an image
            you have promoted takes it out of every customer's picker, which is not obvious from the
            word "delete". */}
        {confirming && (
          <div style={S.confirm}>
            <div style={S.confirmText}>
              {confirming.promoted
                ? <>Delete <b>{confirming.name || 'this image'}</b>? It will also leave your decorations, so your customers can no longer use it.</>
                : <>Delete <b>{confirming.name || 'this image'}</b>?</>}
            </div>
            <div style={S.confirmRow}>
              <button style={S.confirmCancel} disabled={busy === confirming.id}
                onClick={() => setConfirming(null)}>Keep it</button>
              <button style={S.confirmDelete} disabled={busy === confirming.id}
                onClick={() => remove(confirming)}>{busy === confirming.id ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        )}

        <div style={S.body}>
          {/* "A new one" is an ANSWER to "which image?", not a rival button elsewhere. Uploading here
              keeps the frame's photo on the same registered path as everything else. */}
          <label style={{ ...S.uploadBtn, ...(uploading ? { opacity: 0.6, cursor: 'default' } : null) }}>
            {uploading ? 'Uploading…' : '+  Upload a new image'}
            <input type="file" accept={ACCEPT_IMAGE} style={{ display: 'none' }} disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; uploadNew(f); }} />
          </label>

          {uploads === null && <div style={S.note}>Loading…</div>}

          {uploads?.length === 0 && (
            <div style={S.empty}>
              Nothing here yet. Anything you upload — a photo for a photo cake, a decoration of your own —
              appears here, and only you can see it.
            </div>
          )}

          {uploads?.length > 0 && (
            <div style={S.grid}>
              {uploads.map(u => {
                const mine = canPromote && u.uploadedBy === 'baker';
                return (
                <div key={u.id} style={S.card}>
                  <div style={S.thumbWrap}>
                    {/* The image IS the button. What a tap MEANS is the caller's business. */}
                    <button style={S.thumbBtn} onClick={() => choose(u)}
                      title={selectMode ? 'Use this image' : 'Put it on the cake'}>
                      <img src={u.url} alt={u.name || ''} style={S.thumb} loading="lazy" />
                    </button>

                    {/* Everything you can DO to this image, behind one grip. Managing images is not what
                        this window is FOR when you came here to fill a frame, so it is absent in
                        selectMode — a trapdoor next to the thing you actually meant to tap. */}
                    {!selectMode && (
                      <button
                        style={S.kebab}
                        aria-label={`Options for ${u.name || 'this image'}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === u.id}
                        onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                      >
                        <DotsGlyph />
                      </button>
                    )}

                    {menuFor === u.id && (
                      <>
                        {/* Tapping anywhere else closes it — a menu you can only dismiss by re-tapping
                            the grip is a trap on a phone. */}
                        <div style={S.menuScrim} onPointerDown={() => setMenuFor(null)} />
                        <div style={S.menu} role="menu">
                          <button style={S.menuItem} role="menuitem"
                            onClick={() => { setMenuFor(null); setEditing(u); }}>Edit</button>

                          {/* Promotion is a BAKER's act, and only on his OWN uploads: a customer's image
                              is not his to offer to other customers (the API refuses it — ToS 6.2).
                              Hiding it on hers is courtesy, not the boundary: the server is. */}
                          {mine && (u.promoted
                            ? <button style={S.menuItem} role="menuitem" disabled={busy === u.id}
                                onClick={() => { setMenuFor(null); unlink(u); }}>Remove from decorations</button>
                            : <button style={S.menuItem} role="menuitem"
                                onClick={() => { setMenuFor(null); onPromote?.(u); }}>Show in my decorations</button>
                          )}

                          <button style={{ ...S.menuItem, ...S.menuDanger }} role="menuitem"
                            onClick={() => { setMenuFor(null); setConfirming(u); }}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={S.name}>{u.name || 'Untitled'}</div>
                  {u.promoted && <div style={S.badge}>In my decorations</div>}
                </div>
                );
              })}
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

  uploadBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', boxSizing: 'border-box', padding: '11px 0', marginBottom: 14, borderRadius: 10, border: '1.5px dashed #cfcdd6', background: '#faf9fb', color: '#444', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' },
  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 },
  card:  { display: 'flex', flexDirection: 'column', gap: 6 },
  thumbWrap: { position: 'relative' },
  thumbBtn: { width: '100%', padding: 0, border: '1.5px solid #e2e0e6', borderRadius: 11, background: '#faf9fb', cursor: 'pointer', overflow: 'hidden', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thumb: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  // 32px of tap target, on a phone, sitting ON the image — big enough to hit with a thumb and small
  // enough not to steal the taps meant for the picture underneath.
  kebab: { position: 'absolute', top: 4, right: 4, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 3px rgba(0,0,0,0.16)', color: '#555', cursor: 'pointer' },
  menuScrim: { position: 'fixed', inset: 0, zIndex: 1 },
  // Spans the CARD, not a fixed width hanging off the grip: a 168px menu anchored to a 130px card in
  // the first column hangs past the sheet's edge and gets clipped — half of "Delete" was missing.
  menu:  { position: 'absolute', top: 38, left: 0, right: 0, zIndex: 2, background: '#fff', borderRadius: 11, border: '1px solid #e8e6ec', boxShadow: '0 8px 24px rgba(20,20,24,0.16)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  menuItem: { padding: '10px 11px', border: 'none', borderBottom: '1px solid #f4f2f6', background: '#fff', color: '#333', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textAlign: 'left', lineHeight: 1.3, cursor: 'pointer' },
  menuDanger: { color: '#C0392B', borderBottom: 'none' },
  name:  { fontSize: 11.5, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.3 },
  badge: { alignSelf: 'center', padding: '2px 8px', borderRadius: 20, background: '#EEF6EE', color: '#2E7D32', fontSize: 9.5, fontWeight: 800 },

  back:  { border: 'none', background: 'none', fontSize: 17, color: '#888', cursor: 'pointer', padding: 0, marginRight: 8, fontFamily: 'inherit' },
  foot:  { padding: 14, borderTop: '1px solid #eee' },
  editArt: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, borderRadius: 12, background: '#faf9fb', border: '1.5px solid #eeecf1', marginBottom: 14, overflow: 'hidden' },
  editImg: { maxWidth: '100%', maxHeight: 260, objectFit: 'contain' },
  editAct: { width: '100%', padding: '12px 0', borderRadius: 10, border: '1.5px solid #ddd', background: '#fff', color: '#333', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  primary: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  hint:  { fontSize: 11, color: '#9a939a', fontWeight: 600, marginTop: 8, lineHeight: 1.45 },

  confirm: { padding: 14, borderBottom: '1px solid #eee', background: '#FFF7F6' },
  confirmText: { fontSize: 12.5, fontWeight: 600, color: '#4a4a4a', lineHeight: 1.5 },
  confirmRow: { display: 'flex', gap: 8, marginTop: 10 },
  confirmCancel: { flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid #ddd', background: '#fff', color: '#444', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  confirmDelete: { flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: '#C0392B', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' },

  note:  { fontSize: 12.5, fontWeight: 700, color: '#8a7a80' },
  empty: { fontSize: 12.5, fontWeight: 600, color: '#8a7a80', lineHeight: 1.5, textAlign: 'center', padding: '28px 12px' },
  err:   { marginTop: 12, padding: '10px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: '#FFF0F0', color: '#C0392B', lineHeight: 1.4 },
};
