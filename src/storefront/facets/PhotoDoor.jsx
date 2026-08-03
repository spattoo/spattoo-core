import { useEffect, useRef, useState } from 'react';
import { compressImage } from '../../shared/image.js';
import { putPhoto, deletePhoto, getPhoto, photosAvailable } from './photoStore.js';

// ── "I've got a cake photo for reference" ───────────────────────────────────────────────────────
// The door most customers arrive already holding something for: a screenshot from Instagram is how
// this conversation starts on WhatsApp today, and this exists to meet that rather than argue with it.
//
// A photo the BAKER looks at, not one the software understands. Photo → editable 3D is a different
// and much larger thing (see the plan's Out of scope) — it costs credits per attempt and needs a
// confirm-or-correct step, because X-Ray will misread cakes.
//
// ── NOTHING IS UPLOADED HERE ────────────────────────────────────────────────────────────────────
// The files are compressed and kept in the browser until the enquiry is verified and sent. The
// bucket is served publicly, so an anonymous upload endpoint would be free file hosting on a Spattoo
// domain; by uploading on the OTP session instead, every byte that reaches R2 has a proved phone
// number attached to it. photoStore.js holds the blobs; this holds only the previews.

const MAX_PHOTOS = 3;          // matches MAX_ORDER_PHOTOS on the API — a 4th would 400 at submit
const MAX_BYTES = 5 * 1024 * 1024;   // the API's image ceiling; checked here so a picker says so at PICK time

export default function PhotoDoor({ draft, patch, bakerName, slug, onBack }) {
  const photos = draft.design.photos ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [previews, setPreviews] = useState({});   // id -> object URL
  const [storable, setStorable] = useState(true);
  const fileRef = useRef(null);
  // Every object URL this component minted, revoked on unmount. Without it, three photos across a
  // few visits leak a few megabytes of blob into a tab the customer keeps open.
  const urls = useRef([]);

  useEffect(() => {
    // Private browsing and locked-down browsers throw on IndexedDB. Better to say so before somebody
    // picks three photos and finds out at submit — the one moment the failure is most expensive.
    photosAvailable().then(setStorable);
  }, []);

  // Rebuild previews for photos already on the draft (a refresh, or coming back to the door).
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const p of photos) {
        if (previews[p.id]) { next[p.id] = previews[p.id]; continue; }
        const blob = await getPhoto(slug, p.id);
        if (!blob) continue;                       // evicted or cleared — the row below shows it
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        next[p.id] = url;
      }
      if (alive) setPreviews(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map(p => p.id).join(','), slug]);

  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  async function add(files) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of Array.from(files).slice(0, room)) {
        // Compressed BEFORE anything else: it is what makes the upload at submit survive a phone
        // connection, and it is why the ceiling is rarely hit at all.
        const blob = await compressImage(file, { maxEdge: 1600, quality: 0.82 });
        if (blob.size > MAX_BYTES) {
          setError('That photo is too large, even after shrinking. Try a smaller one.');
          continue;
        }
        const id = await putPhoto(slug, blob, file.name);
        added.push({ id, name: file.name });
      }
      if (added.length) patch({ design: { photos: [...photos, ...added], kind: 'photo' } });
    } catch {
      setError('Could not read that photo. Try another one.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';   // so re-picking the same file fires again
    }
  }

  async function remove(id) {
    const rest = photos.filter(p => p.id !== id);
    // `kind` goes back to null when the last photo does, or the design facet would keep showing a
    // tick for a door with nothing behind it.
    patch({ design: { photos: rest, ...(rest.length ? null : { kind: null }) } });
    await deletePhoto(slug, id);
  }

  if (!storable) {
    return (
      <div style={s.wrap}>
        <div style={s.title}>Photos need storage this browser won&rsquo;t give</div>
        <p style={s.body}>
          Private browsing blocks it. Tell {bakerName} about the cake instead — they&rsquo;ll ask for
          the picture when they get in touch.
        </p>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <button type="button" style={s.back} onClick={onBack}>← Back</button>
        <span style={s.hint}>{photos.length}/{MAX_PHOTOS}</span>
      </div>

      <p style={s.body}>
        A screenshot or a photo of a cake you like. {bakerName} will use it as a reference — they
        {' '}will not copy it exactly.
      </p>

      {photos.length > 0 && (
        <div style={s.grid}>
          {photos.map(p => (
            <div key={p.id} style={s.thumb}>
              {previews[p.id]
                ? <img src={previews[p.id]} alt={p.name || 'Reference photo'} style={s.img} />
                /* The blob is gone — evicted, or a different device. Say so rather than showing a
                   broken frame the customer cannot act on. */
                : <div style={s.lost}>Photo no longer on this device</div>}
              <button type="button" style={s.remove} onClick={() => remove(p.id)}
                      aria-label={`Remove ${p.name || 'photo'}`}>✕</button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple
             style={{ display: 'none' }} onChange={e => add(e.target.files)} />

      {photos.length < MAX_PHOTOS && (
        <button type="button" style={s.pick} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Adding…' : photos.length ? 'Add another' : 'Choose a photo'}
        </button>
      )}

      {error && <div style={s.err}>{error}</div>}

      {photos.length > 0 && (
        // Says where the photo IS, because "nothing has been uploaded" is reassuring and true, and
        // because it explains why it might not survive to another device.
        <p style={s.note}>
          Stays on your phone until you send — nothing is uploaded yet.
        </p>
      )}
    </div>
  );
}

const s = {
  wrap:  { display: 'flex', flexDirection: 'column', gap: 10 },
  head:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  hint:  { fontSize: 11.5, fontWeight: 700, color: '#A2968A' },
  title: { fontSize: 14, fontWeight: 800, color: '#2A241F' },
  body:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0 },

  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 },
  thumb: { position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
           border: '1.5px solid #E7DFD5', background: '#F7F2EC' },
  img:   { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  lost:  { padding: 8, fontSize: 10.5, fontWeight: 600, color: '#A2968A', textAlign: 'center',
           display: 'flex', alignItems: 'center', height: '100%' },
  remove:{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
           border: 'none', background: 'rgba(28,24,22,0.6)', color: '#fff', cursor: 'pointer',
           fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  pick:  { padding: '12px 0', borderRadius: 12, border: '1.5px dashed #CFC3B4', background: '#fff',
           font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },
  back:  { background: 'none', border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700,
           color: '#7A6C60', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  note:  { fontSize: 11, color: '#A2968A', fontWeight: 600, margin: 0, lineHeight: 1.5 },
  err:   { fontSize: 12, color: '#C0392B', fontWeight: 700 },
};
