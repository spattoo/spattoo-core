import React, { useMemo, useState, useEffect, useRef } from 'react';
import CustomerStorefront from './CustomerStorefront.jsx';
import { STOREFRONT_TEXT } from './storefrontKit.js';

const TEXT_FIELDS = [
  { key: 'hero_tagline',      label: 'Hero tagline' },
  { key: 'creations_heading', label: 'Gallery heading' },
  { key: 'story_heading',     label: 'Story heading' },
  { key: 'reviews_heading',   label: 'Reviews heading' },
];

// ThemePreview — a full-screen "see it before you pick it" customiser. Renders the REAL
// storefront live in a phone frame using a synthetic baker, lets the baker switch theme and
// tweak brand colours with instant feedback, then Publish (saves theme + colours).
//
// Props:
//   open        bool
//   themes      [{ id, key, name, is_active }]   — from GET /baker/storefront-themes
//   value       { storefront_theme_id, primary_color, accent_color }
//   baker       { name, slug, story, instagram_handle, website_url }  — preview content
//   logoUrl     string?   wordmark/logo to show
//   gallery     []?       sample photos (else the fallback panel shows)
//   onPublish   async ({ storefront_theme_id, primary_color, accent_color }) => void
//   onClose     () => void
export default function ThemePreview({ open, apiClient, themes = [], value, baker = {}, logoUrl = null, onPublish, onUnpublish, onClose }) {
  // Defaults come from the baker's saved branding (value.*); the literals are only a last
  // resort if a baker has no colour on file, and match the storefront's own defaults.
  const [themeId, setThemeId] = useState(value?.storefront_theme_id ?? themes[0]?.id ?? 1);
  const [primary, setPrimary] = useState(value?.primary_color || '#2C4433');
  const [accent,  setAccent]  = useState(value?.accent_color  || '#6B8C74');
  // Portrait: `portraitUrl` is what the preview shows (existing public URL, or a local object
  // URL after picking); `portraitKey` is the R2 key to persist (undefined = unchanged).
  const [portraitUrl, setPortraitUrl] = useState(value?.portrait_url || null);
  const [portraitKey, setPortraitKey] = useState(undefined);
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  // Gallery: [{ id, key, url, caption }] — key is the R2 key to persist (null while uploading).
  const [gallery, setGallery] = useState([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(0);
  // Testimonials: [{ id, quote, author, occasion }]
  const [testimonials, setTestimonials] = useState([]);
  const [testimonialsDirty, setTestimonialsDirty] = useState(false);
  const [published, setPublished] = useState(!!value?.storefront_published);
  const [customizations, setCustomizations] = useState(value?.storefront_customizations || {});
  const [publishing, setPublishing] = useState(false);
  const portraitInputRef = useRef(null);
  const isWide = useIsWide(900);

  useEffect(() => {
    if (!open) return;
    setThemeId(value?.storefront_theme_id ?? themes[0]?.id ?? 1);
    setPrimary(value?.primary_color || '#2C4433');
    setAccent(value?.accent_color || '#6B8C74');
    setPublished(!!value?.storefront_published);
    setCustomizations(value?.storefront_customizations || {});
    setPortraitUrl(value?.portrait_url || null);
    setPortraitKey(undefined);
    setGalleryDirty(false);
    apiClient?.fetchStorefrontPhotos?.()
      .then(r => setGallery((r?.photos || []).map((p, i) => ({ id: p.id || `e${i}`, key: p.key, url: p.url, caption: p.caption || '' }))))
      .catch(() => setGallery([]));
    setTestimonialsDirty(false);
    apiClient?.fetchTestimonials?.()
      .then(r => setTestimonials((r?.testimonials || []).map((t, i) => ({ id: t.id || `e${i}`, quote: t.quote || '', author: t.author || '', occasion: t.occasion || '' }))))
      .catch(() => setTestimonials([]));
  }, [open]);

  const addTestimonial = () => { setTestimonials(t => [...t, { id: `n${Date.now()}`, quote: '', author: '', occasion: '' }]); setTestimonialsDirty(true); };
  const removeTestimonial = id => { setTestimonials(t => t.filter(it => it.id !== id)); setTestimonialsDirty(true); };
  const setTestimonialField = (id, field, v) => { setTestimonials(t => t.map(it => (it.id === id ? { ...it, [field]: v } : it))); setTestimonialsDirty(true); };

  async function addPhotos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !apiClient?.getSignedUploadUrl) return;
    setGalleryDirty(true);
    for (const file of files) {
      const id = `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setGallery(g => [...g, { id, key: null, url: URL.createObjectURL(file), caption: '' }]);
      setUploadingGallery(n => n + 1);
      (async () => {
        try {
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          const filename = `${baker.slug || 'baker'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { url: signed, key } = await apiClient.getSignedUploadUrl('storefront/gallery', filename, file.type);
          await fetch(signed, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          // Persist a DB row immediately so the photo is tracked + manageable (no orphans).
          let dbId = id;
          if (apiClient.addStorefrontPhoto) {
            const row = await apiClient.addStorefrontPhoto(key, '');
            dbId = row?.id ?? id;
          }
          setGallery(g => g.map(it => (it.id === id ? { ...it, id: dbId, key } : it)));
        } catch (err) {
          console.error('Gallery upload failed', err);
        } finally {
          setUploadingGallery(n => n - 1);
        }
      })();
    }
  }
  const removePhoto = id => {
    const item = gallery.find(it => it.id === id);
    setGallery(g => g.filter(it => it.id !== id));
    setGalleryDirty(true);
    // Persisted rows (real DB id, not a temp 'n…') → delete the row + R2 file server-side.
    if (item && item.key && !String(item.id).startsWith('n') && apiClient?.deleteStorefrontPhoto) {
      apiClient.deleteStorefrontPhoto(item.id).catch(e => console.error('Delete photo failed', e));
    }
  };
  const setCaption  = (id, caption) => { setGallery(g => g.map(it => (it.id === id ? { ...it, caption } : it))); setGalleryDirty(true); };

  const galleryForPreview = useMemo(() => gallery.map(g => ({ url: g.url, caption: g.caption })), [gallery]);

  async function pickPortrait(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiClient?.getSignedUploadUrl) return;
    setPortraitUrl(URL.createObjectURL(file));   // instant local preview
    setUploadingPortrait(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filename = `${baker.slug || 'baker'}-${Date.now()}.${ext}`;
      const { url, key } = await apiClient.getSignedUploadUrl('portraits', filename, file.type);
      await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      setPortraitKey(key);                        // persisted on Publish
    } catch (err) {
      console.error('Portrait upload failed', err);
    } finally {
      setUploadingPortrait(false);
    }
  }

  const themeKey = themes.find(t => t.id === themeId)?.key || 'spotlight';

  // Synthetic baker the preview renders from — memoised so the storefront only re-renders
  // when something visible actually changes (not every parent render).
  const previewBaker = useMemo(() => ({
    name: baker.name || 'Your Bakery', slug: baker.slug || 'preview',
    primary_color: primary, accent_color: accent,
    story: baker.story || null, portrait_url: portraitUrl || null,
    instagram_handle: baker.instagram_handle || null, website_url: baker.website_url || null,
    storefront_theme: themeKey, storefront_customizations: customizations,
    testimonials: testimonials.filter(t => t.quote.trim()).map(t => ({ quote: t.quote, author: t.author, occasion: t.occasion })),
  }), [primary, accent, themeKey, portraitUrl, customizations, testimonials, baker.name, baker.slug, baker.story, baker.instagram_handle, baker.website_url]);

  const setText = (k, v) => setCustomizations(c => ({ ...c, [k]: v }));

  if (!open) return null;

  const busy = uploadingPortrait || uploadingGallery > 0;
  const dirty = themeId !== value?.storefront_theme_id || primary !== value?.primary_color
    || accent !== value?.accent_color || portraitKey !== undefined || galleryDirty || testimonialsDirty
    || JSON.stringify(customizations) !== JSON.stringify(value?.storefront_customizations || {});

  async function publish() {
    if (busy) return;   // wait for in-flight uploads to finish
    setPublishing(true);
    try {
      // 1. appearance — theme / colours / portrait (PATCH /baker/profile via host)
      const payload = { storefront_theme_id: themeId, primary_color: primary, accent_color: accent, storefront_customizations: customizations };
      if (portraitKey !== undefined) payload.portrait_key = portraitKey;   // new portrait (or null to clear)
      await onPublish?.(payload);
      // 2. photo captions + order for persisted rows (metadata only; add/remove already saved)
      const persisted = gallery.filter(g => g.key && !String(g.id).startsWith('n'));
      if (apiClient?.updateStorefrontPhotos) {
        await apiClient.updateStorefrontPhotos(persisted.map((g, i) => ({ id: g.id, caption: g.caption || null, sort_order: i })));
      }
      // 3. testimonials (replace the whole set; rows without a quote are dropped server-side)
      if (testimonialsDirty && apiClient?.updateTestimonials) {
        await apiClient.updateTestimonials(testimonials.map(t => ({ quote: t.quote, author: t.author, occasion: t.occasion })));
      }
      // 4. take the storefront live (host flips the flag + tracks state)
      setPublished(true);
      onClose?.();
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    await onUnpublish?.();
    setPublished(false);
  }

  return (
    <div style={s.overlay}>
      <div style={s.topbar}>
        <button type="button" style={s.cancel} onClick={onClose}>← Back</button>
        <div style={s.titleWrap}>
          <span style={s.title}>Customise your storefront</span>
          <span style={{ ...s.statusPill, ...(published ? s.pillLive : s.pillDraft) }}>{published ? '● Live' : 'Draft'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {published && <button type="button" style={s.unpublish} onClick={unpublish}>Unpublish</button>}
          <button type="button" style={{ ...s.publish, background: primary, opacity: (publishing || busy) ? 0.6 : 1 }} disabled={publishing || busy} onClick={publish}>
            {publishing ? 'Publishing…' : busy ? 'Uploading…' : published ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      <div style={{ ...s.body, flexDirection: isWide ? 'row' : 'column' }}>
        {/* controls */}
        <div style={{ ...s.controls, width: isWide ? 300 : 'auto', borderRight: isWide ? '1px solid #E3E8E4' : 'none', borderBottom: isWide ? 'none' : '1px solid #E3E8E4' }}>
          <div style={s.ctrlLabel}>Theme</div>
          <div style={s.themeList}>
            {themes.map(t => {
              const sel = t.id === themeId, off = !t.is_active;
              return (
                <button key={t.id} type="button" disabled={off}
                  onClick={() => setThemeId(t.id)}
                  style={{ ...s.themeBtn, borderColor: sel ? primary : '#D9DED9', borderWidth: sel ? 2 : 1, opacity: off ? 0.5 : 1, cursor: off ? 'default' : 'pointer' }}>
                  <span style={{ fontWeight: 800, color: '#2C4433', fontSize: 13.5 }}>{t.name}</span>
                  {off ? <span style={s.soon}>Soon</span> : sel ? <span style={{ color: primary, fontWeight: 800, fontSize: 12 }}>✓</span> : null}
                </button>
              );
            })}
          </div>

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Brand colours</div>
          <Swatch label="Primary" value={primary} onChange={setPrimary} />
          <Swatch label="Accent"  value={accent}  onChange={setAccent} />

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Your photo</div>
          <label style={s.portraitRow}>
            <div style={s.portraitThumb}>
              {portraitUrl
                ? <img src={portraitUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 11, color: '#9BB5A2', fontWeight: 700 }}>None</span>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>{uploadingPortrait ? 'Uploading…' : portraitUrl ? 'Change photo' : 'Upload photo'}</div>
              <div style={{ fontSize: 11.5, color: '#9BB5A2', marginTop: 2 }}>Shows in “Our story”</div>
            </div>
            <input ref={portraitInputRef} type="file" accept="image/*" onChange={pickPortrait} style={{ display: 'none' }} />
          </label>

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Text</div>
          {TEXT_FIELDS.map(f => (
            <div key={f.key} style={s.textRow}>
              <label style={s.textLabel}>{f.label}</label>
              <input
                value={customizations[f.key] ?? ''}
                placeholder={STOREFRONT_TEXT[f.key]}
                onChange={e => setText(f.key, e.target.value)}
                style={s.textInput}
              />
            </div>
          ))}

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Cake photos</div>
          <div style={s.galleryList}>
            {gallery.map(g => (
              <div key={g.id} style={s.galleryItem}>
                <div style={s.galleryThumb}>
                  <img src={g.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {g.key === null && <div style={s.galleryUploading} />}
                </div>
                <input value={g.caption} onChange={e => setCaption(g.id, e.target.value)} placeholder="Caption (optional)" style={s.galleryCaption} />
                <button type="button" aria-label="Remove" style={s.galleryRemove} onClick={() => removePhoto(g.id)}>×</button>
              </div>
            ))}
          </div>
          <label style={s.addPhotos}>
            <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
            + Add photos
          </label>

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Reviews</div>
          <div style={s.reviewList}>
            {testimonials.map(t => (
              <div key={t.id} style={s.reviewItem}>
                <textarea value={t.quote} placeholder="What the customer said…" rows={2}
                  onChange={e => setTestimonialField(t.id, 'quote', e.target.value)} style={s.reviewQuote} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={t.author} placeholder="Name" onChange={e => setTestimonialField(t.id, 'author', e.target.value)} style={s.reviewMeta} />
                  <input value={t.occasion} placeholder="Occasion" onChange={e => setTestimonialField(t.id, 'occasion', e.target.value)} style={s.reviewMeta} />
                  <button type="button" aria-label="Remove" style={s.galleryRemove} onClick={() => removeTestimonial(t.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" style={s.addPhotos} onClick={addTestimonial}>+ Add review</button>

          <p style={s.hint}>Changes preview live. Hit <b>Publish</b> to make them go live on your storefront.</p>
        </div>

        {/* live preview in a phone frame */}
        <div style={s.stage}>
          <div style={s.phone}>
            <div style={s.phoneScroll}>
              <CustomerStorefront baker={previewBaker} logoUrl={logoUrl} gallery={galleryForPreview} apiBaseUrl="" onStartDesign={() => {}} onEditPortrait={() => portraitInputRef.current?.click()} />
            </div>
          </div>
          {dirty && <div style={s.dirtyTag}>Unpublished changes</div>}
        </div>
      </div>
    </div>
  );
}

function Swatch({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: value, border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }} />
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2C4433' }}>{label}</div>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 96, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #D9DED9', fontSize: 12.5, fontFamily: 'monospace', color: '#2C4433', outline: 'none', marginTop: 3 }} />
      </div>
    </div>
  );
}

function useIsWide(bp = 900) {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth >= bp : true);
  useEffect(() => {
    const f = () => setW(window.innerWidth >= bp);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [bp]);
  return w;
}

const FONT = "'Quicksand', sans-serif";
const s = {
  overlay:  { position: 'fixed', inset: 0, zIndex: 400, background: '#EEF2EF', fontFamily: FONT, display: 'flex', flexDirection: 'column' },
  topbar:   { flexShrink: 0, height: 60, background: '#fff', borderBottom: '1px solid #E3E8E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', gap: 12 },
  cancel:   { background: '#F0F4F1', border: '1px solid #D9DED9', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#2C4433' },
  titleWrap:{ display: 'flex', alignItems: 'center', gap: 10 },
  title:    { fontSize: 15, fontWeight: 800, color: '#2C4433' },
  statusPill:{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  pillLive: { color: '#1B7A4B', background: '#E4F4EA' },
  pillDraft:{ color: '#9A6B16', background: '#FBF0DA' },
  unpublish:{ border: '1px solid #E3D3D3', background: '#fff', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#9A4040' },
  publish:  { border: 'none', borderRadius: 10, padding: '10px 22px', cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 800, color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  body:     { flex: 1, display: 'flex', minHeight: 0 },
  controls: { flexShrink: 0, background: '#fff', padding: '20px 20px 24px', overflowY: 'auto', boxSizing: 'border-box' },
  ctrlLabel:{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2', marginBottom: 10 },
  themeList:{ display: 'flex', flexDirection: 'column', gap: 8 },
  themeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', fontFamily: FONT },
  soon:     { fontSize: 9.5, fontWeight: 800, color: '#9BB5A2', background: '#F0F4F1', padding: '2px 7px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  portraitRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #D9DED9', background: '#fff', cursor: 'pointer' },
  portraitThumb: { width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0F4F1', border: '1px solid #E3E8E4', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  textRow:  { marginTop: 10 },
  textLabel:{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6B8C74', marginBottom: 4 },
  textInput:{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid #D9DED9', fontSize: 13, fontFamily: FONT, color: '#2C4433', outline: 'none', background: '#fff' },
  galleryList: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  galleryItem: { display: 'flex', alignItems: 'center', gap: 8 },
  galleryThumb: { position: 'relative', width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#F0F4F1', border: '1px solid #E3E8E4' },
  galleryUploading: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' },
  galleryCaption: { flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid #D9DED9', fontSize: 12, fontFamily: FONT, color: '#2C4433', outline: 'none' },
  galleryRemove: { flexShrink: 0, width: 26, height: 26, borderRadius: 7, border: '1px solid #E3D3D3', background: '#fff', color: '#C0392B', fontSize: 16, lineHeight: 1, cursor: 'pointer' },
  addPhotos: { display: 'block', width: '100%', textAlign: 'center', marginTop: 10, padding: '10px', borderRadius: 10, border: '1.5px dashed #C5D4C8', background: '#F8FBF9', color: '#2C4433', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT },
  reviewList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  reviewItem: { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, border: '1px solid #E3E8E4', background: '#fff' },
  reviewQuote:{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: '1px solid #D9DED9', fontSize: 12.5, fontFamily: FONT, color: '#2C4433', outline: 'none', resize: 'vertical' },
  reviewMeta: { flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid #D9DED9', fontSize: 12, fontFamily: FONT, color: '#2C4433', outline: 'none' },
  hint:     { fontSize: 12, fontWeight: 500, color: '#6B8C74', lineHeight: 1.55, marginTop: 22 },
  stage:    { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' },
  phone:    { width: 392, maxWidth: '100%', height: 'min(86vh, 780px)', background: '#fff', borderRadius: 30, overflow: 'hidden', boxShadow: '0 24px 70px rgba(40,30,35,0.28)', border: '8px solid #1c1518' },
  phoneScroll: { width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },
  dirtyTag: { position: 'absolute', top: 18, right: 18, background: '#2C4433', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20 },
};
