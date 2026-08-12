import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNarrow } from '../shared/useNarrow.js';
import { UI_FONT } from '../shared/fonts.js';
import CustomerStorefront from './CustomerStorefront.jsx';
import { CakeSpinner } from '../designer/canvas/CakeSpinner.jsx';
import { STOREFRONT_TEXT, FONT_THEMES, resolveSections, newSection } from './storefrontKit.js';
import { TEMPLATES } from './templates.js';
import RightsAttestation from '../legal/RightsAttestation.jsx';
import { Panel, ConfirmPanel } from '../shared/Panel.jsx';

const TEXT_FIELDS = [
  { key: 'hero_tagline',      label: 'Hero tagline' },
  { key: 'hero_subtitle',     label: 'Hero subtitle' },
  { key: 'creations_heading', label: 'Gallery heading' },
  { key: 'story_heading',     label: 'Story heading' },
  { key: 'reviews_heading',   label: 'Reviews heading' },
];

const SECTION_LABELS = { gallery: 'Cake photos', highlight: 'Highlight', story: 'Our story', reviews: 'Reviews' };

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
//   onUpgrade   () => void — open billing. Called instead of publishing when the baker is LOOKING
//               at a premium theme their plan cannot publish.
//   onClose     () => void
export default function ThemePreview({ open, apiClient, themes = [], value, baker = {}, logoUrl = null, appPrimary = '#1a1a1a', appAccent = '#333333', onPublish, onUnpublish, onReviewFlavours, onUpgrade, onClose }) {
  // Defaults come from the baker's saved branding (value.*); the literals are only a last
  // resort if a baker has no colour on file, and match the storefront's own defaults.
  // A baker with no colour on file falls back to the SELECTED template's designed defaults (not a
  // literal) — so a new Spotlight baker's pickers start on its sage palette, matching the storefront.
  const templateDefaultsFor = (id) => TEMPLATES[themes.find(t => t.id === id)?.key || 'spotlight']?.defaults || {};
  const initThemeId = value?.storefront_theme_id ?? themes[0]?.id ?? 1;
  const initDefaults = templateDefaultsFor(initThemeId);
  const [themeId, setThemeId] = useState(initThemeId);
  const [primary, setPrimary] = useState(value?.primary_color || initDefaults.primary || '#2C4433');
  const [accent,  setAccent]  = useState(value?.accent_color  || initDefaults.accent  || '#6B8C74');
  // Portrait: `portraitUrl` is what the preview shows (existing public URL, or a local object
  // URL after picking); `portraitKey` is the R2 key to persist (undefined = unchanged).
  const [portraitUrl, setPortraitUrl] = useState(value?.portrait_url || null);
  const [portraitKey, setPortraitKey] = useState(undefined);
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  // ── Whether this baker may choose a PREMIUM theme (Blaze+) ────────────────────────────────────
  // The gate itself is on the write — PATCH /baker/profile refuses a premium theme without the
  // entitlement, and that is what actually protects it. This only decides whether the card is
  // tappable, so a Flame baker meets a lock instead of a 403 after choosing.
  //
  // Fails CLOSED: a lookup that errors leaves this false, so a premium theme stays locked rather
  // than offering something the save would then reject.
  const [canPremium, setCanPremium] = useState(false);
  // ── The flavour list, checked at PUBLISH ──────────────────────────────────────────────────────
  // null = not looked up yet. `{ curated, offered }` once known.
  //
  // Publish is the moment this matters: a global flavour with no settings row is OFFERED (see
  // spattoo-api lib/flavourList.js), so a baker who has never opened the flavour screen is about to
  // put EVERY flavour Spattoo ships in front of their customers — including ones they do not make.
  // The first customer to ask for one is how they would otherwise find out.
  //
  // Checked here rather than only nudging at first login, because a nudge on day one is dismissed
  // by a baker who has not yet seen a storefront, and three weeks later they publish anyway. This
  // sits on the action that causes the harm.
  const [flavourCheck, setFlavourCheck] = useState(null);
  /** Tiered templates with no minimum weight. 0 = nothing to say. */
  const [tieredNoMin, setTieredNoMin] = useState(0);
  /** The review step, shown before the rights confirm and ONLY when there is something wrong. */
  const [review, setReview] = useState(false);
  // Gallery: [{ id, key, url, caption }] — key is the R2 key to persist (null while uploading).
  const [gallery, setGallery] = useState([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  // Content-rights attestation — asked ONCE, at Publish (the only moment the storefront becomes
  // world-visible), never per photo. Unticked every time the confirm opens: an attestation is only
  // worth something if it was an affirmative act.
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishRights, setPublishRights] = useState(false);
  // The baker's cake-design templates — an authoritative image source for the gallery (baker picks
  // from these OR uploads). Fetched on open; picking snapshots the design's thumbnail as a photo.
  const [designs, setDesigns] = useState([]);
  const [designPicker, setDesignPicker] = useState(null);   // which control opened it: null | 'gallery' | 'hero'
  const [uploadingGallery, setUploadingGallery] = useState(0);
  // Testimonials: [{ id, quote, author, occasion }]
  const [testimonials, setTestimonials] = useState([]);
  const [testimonialsDirty, setTestimonialsDirty] = useState(false);
  const [published, setPublished] = useState(!!value?.storefront_published);
  const [customizations, setCustomizations] = useState(value?.storefront_customizations || {});
  const [publishing, setPublishing] = useState(false);
  const [hlUploading, setHlUploading] = useState(null);   // index of the highlight whose image is uploading
  const [mobileTab, setMobileTab] = useState('preview');   // mobile: 'preview' | 'edit' (preview is the default)
  const [device, setDevice] = useState('mobile');   // preview device frame: 'mobile' | 'desktop' (mobile default)
  const [ready, setReady] = useState(false);   // preview config synced from `value`? (gates the storefront render)
  const portraitInputRef = useRef(null);
  const isWide = useIsWide(900);
  // Measure the preview stage so the DESKTOP frame (rendered at a true 1280px width) can be scaled to
  // fit whatever room the stage has. transform:scale is visual only — it doesn't change clientWidth —
  // so the storefront's ResizeObserver still measures 1280 and picks its real `desktop` layout.
  const [frameAreaRef, stageSize] = useMeasure();

  // Up here with the other hooks, not beside the picker: `if (!open) return null` sits below, and a
  // hook under an early return is the React #310 that check:hooks now blocks.
  // Fetched when the panel opens, not when the confirm does: the confirm must render its warning
  // immediately or not at all. A spinner inside a publish dialog invites the baker to click through
  // it, which is the opposite of what this is for.
  useEffect(() => {
    if (!open || !apiClient?.fetchBakerFlavours) return;
    let alive = true;
    apiClient.fetchBakerFlavours()
      .then(r => {
        if (!alive) return;
        const list = r?.flavours ?? [];
        const offered = list.filter(f => !f.excluded);
        setFlavourCheck({ curated: r?.curated !== false, names: offered.map(f => f.name) });
      })
      // Fails SILENT, not closed. A lookup that errors must not invent a warning about the baker's
      // flavours, and must never be a reason they cannot publish.
      .catch(() => { if (alive) setFlavourCheck({ curated: true, names: [] }); });
    return () => { alive = false; };
  }, [open, apiClient]);

  useEffect(() => {
    if (!open || !apiClient?.fetchEntitlements) return;
    let alive = true;
    apiClient.fetchEntitlements()
      .then(r => { if (alive) setCanPremium(r?.ent?.premium_themes === true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, apiClient]);

  useEffect(() => {
    if (!open) { setReady(false); return; }   // reset so each open shows the loader until synced
    // Sync the pickers from `value`, guarded — a throw here must NEVER leave the preview stuck on the
    // loader (ready would never flip). Any failure is logged, not swallowed silently.
    try {
      const syncId = value?.storefront_theme_id ?? themes[0]?.id ?? 1;
      const syncDefaults = templateDefaultsFor(syncId);
      setThemeId(syncId);
      setPrimary(value?.primary_color || syncDefaults.primary || '#2C4433');
      setAccent(value?.accent_color || syncDefaults.accent || '#6B8C74');
      setPublished(!!value?.storefront_published);
      setCustomizations(value?.storefront_customizations || {});
      setPortraitUrl(value?.portrait_url || null);
      setPortraitKey(undefined);
      setGalleryDirty(false);
      setTestimonialsDirty(false);
    } catch (e) { console.error('[ThemePreview] value sync failed', e); }
    // Render the storefront only AFTER the gallery photos have loaded — otherwise it first paints the
    // no-photos state then swaps once photos arrive. Promise.resolve() so a missing/non-promise
    // fetchStorefrontPhotos can't throw synchronously and strand the gate — ready ALWAYS flips.
    setReady(false);
    Promise.resolve(apiClient?.fetchStorefrontPhotos?.())
      .then(r => setGallery((r?.photos || []).map((p, i) => ({ id: p.id || `e${i}`, key: p.key, url: p.url, caption: p.caption || '' }))))
      .catch(() => setGallery([]))
      .finally(() => setReady(true));
    Promise.resolve(apiClient?.fetchTestimonials?.())
      .then(r => setTestimonials((r?.testimonials || []).map((t, i) => ({ id: t.id || `e${i}`, quote: t.quote || '', author: t.author || '', occasion: t.occasion || '' }))))
      .catch(() => setTestimonials([]));
    // The baker's saved cake designs (with thumbnails) — the "pick from your designs" source.
    Promise.resolve(apiClient?.fetchTemplates?.())
      .then(r => {
        const list = Array.isArray(r) ? r : (r?.templates || []);
        setDesigns(list.filter(t => t && (t.thumbnail_url || t.thumbnail || t.url)));
        // Counted off the WHOLE list, not the thumbnailed subset above: a template without a
        // picture is still a cake a customer can order, and the floor is what stops them ordering
        // a three-tier one at 1kg. See SizeFacet's floorFor — with no minimum it returns 0, so the
        // shape step can never move the weight and the check it exists for never fires.
        setTieredNoMin(list.filter(t =>
          (t?.tier_count ?? 1) > 1 && typeof t?.attrs?.min_weight_kg !== 'number').length);
      })
      .catch(() => setDesigns([]));
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
          const { url: signed, key } = await apiClient.getSignedUploadUrl('storefront/gallery', filename, file.type, file.size);
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
  // Add a gallery photo by SNAPSHOTTING a cake design's thumbnail (Option A — it stays as picked,
  // independent of the design). The server copies the design's thumbnail into the baker's gallery
  // folder + records the row; here we add optimistically and reconcile with the persisted row.
  async function addFromDesign(design) {
    if (!apiClient?.addStorefrontPhotoFromTemplate) return;
    const tempId = `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const thumb = design.thumbnail_url || design.thumbnail || design.url;
    setGallery(g => [...g, { id: tempId, key: null, url: thumb, caption: '' }]);   // key:null → shows the uploading shimmer
    setGalleryDirty(true);
    setUploadingGallery(n => n + 1);
    try {
      const row = await apiClient.addStorefrontPhotoFromTemplate(design.id);
      setGallery(g => g.map(it => (it.id === tempId ? { ...it, id: row?.id ?? tempId, key: row?.key ?? 'design', url: row?.url || thumb } : it)));
    } catch (err) {
      console.error('Add from design failed', err);
      setGallery(g => g.filter(it => it.id !== tempId));   // roll back so a failed add doesn't linger
    } finally {
      setUploadingGallery(n => n - 1);
    }
  }
  // Set the hero cake FROM a design (single value in storefront_customizations, not a photo row): the
  // server snapshots the thumbnail and returns its URL, which we store as hero_design_image.
  async function setHeroFromDesign(design) {
    setDesignPicker(null);
    if (!apiClient?.addStorefrontImageFromTemplate) return;
    try {
      const r = await apiClient.addStorefrontImageFromTemplate(design.id);
      if (r?.url) setText('hero_design_image', r.url);
    } catch (err) {
      console.error('Set hero from design failed', err);
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
      const { url, key } = await apiClient.getSignedUploadUrl('portraits', filename, file.type, file.size);
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

  // Selecting a template SEEDS the colour pickers from that template's DEFAULTS (the starting point
  // the baker tweaks from). Only on an actual switch, so re-clicking the current theme never clobbers
  // the baker's own tweaks. Templates without defaults (e.g. spotlight) keep the baker's brand colours;
  // cta_color resets to the template's hero-text default (or '' = adaptive) so text stays readable.
  // ── Previewing a theme the plan cannot publish ──────────────────────────────────────────────
  //
  // A premium theme used to be untappable, which made it invisible rather than desirable: a lock you
  // cannot look through reads as "not for you", and nobody upgrades for a greyed-out word. So any
  // theme can be SELECTED and previewed, and the plan is enforced where it was always really
  // enforced — at the write. The server already 403s a premium theme without the entitlement
  // (spattoo-api bakers.js), so this is a tease with a real gate behind it, not a client-side rule.
  //
  // ⚠️ PREVIEW MUST NOT PERSIST. The public storefront deliberately does NOT check entitlement when
  // it RENDERS (migration 054 — a baker who downgrades keeps their live shop), so the moment a
  // premium theme_id reached the database for an already-published baker they would have the premium
  // theme in public, for free. Nothing here is saved until they are entitled.
  const themeIsLocked = (id) => {
    const t = themes.find(x => x.id === id);
    return !!(t?.is_premium && !canPremium);
  };
  const lockedPreview = themeIsLocked(themeId);
  // What to send in any save. Never the previewed theme — see publish().
  const savedThemeId = value?.storefront_theme_id ?? themes[0]?.id ?? 1;

  // Their own colours, held while a locked theme borrows the pickers.
  //
  // selectTheme SEEDS the colour pickers from the chosen template's defaults, which is right for a
  // theme you are about to keep and destructive for one you are only looking at: preview Patisserie,
  // go back, and a Flame baker's brand colours are gone with no undo. Snapshotted on the way in and
  // put back on the way out.
  const preLockColours = useRef(null);
  const restoreColours = () => {
    const snap = preLockColours.current;
    if (!snap) return;
    preLockColours.current = null;
    setPrimary(snap.primary); setAccent(snap.accent); setText('cta_color', snap.cta);
  };

  const selectTheme = (id) => {
    if (id === themeId) return;
    // Entering a locked preview: keep their colours. Leaving one: give them back.
    if (themeIsLocked(id) && !preLockColours.current) {
      preLockColours.current = { primary, accent, cta: customizations.cta_color || '' };
    } else if (!themeIsLocked(id)) {
      restoreColours();
    }
    setThemeId(id);
    const def = TEMPLATES[themes.find(t => t.id === id)?.key]?.defaults;
    if (def?.primary) { setPrimary(def.primary); setAccent(def.accent); }
    setText('cta_color', def?.ctaColor || '');
  };

  // Sections lever — normalize to a concrete ordered list, then write the whole array back on edit.
  const sectionList = resolveSections(customizations);
  const setSections = next => setCustomizations(c => ({ ...c, sections: next }));
  const toggleSection = i => setSections(sectionList.map((sec, j) => (j === i ? { ...sec, enabled: !sec.enabled } : sec)));
  const moveSection = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sectionList.length) return;
    const n = [...sectionList];
    [n[i], n[j]] = [n[j], n[i]];
    setSections(n);
  };
  const addSection = (type = 'highlight') => setSections([...sectionList, newSection(type)]);
  const removeSection = i => setSections(sectionList.filter((_, j) => j !== i));
  const setSectionField = (i, field, v) => setSections(sectionList.map((sec, j) => (j === i ? { ...sec, [field]: v } : sec)));
  // Upload a fresh photo for a section (e.g. a Highlight "cake of the week"): PUT to R2, convert to
  // optimised WebP server-side, then store the returned URL in the section's `image`.
  async function uploadSectionImage(i, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiClient?.getSignedUploadUrl) return;
    setHlUploading(i);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filename = `${baker.slug || 'baker'}-hl-${Date.now()}.${ext}`;
      const { url: signed, key, publicUrl } = await apiClient.getSignedUploadUrl('storefront/gallery', filename, file.type, file.size);
      const put = await fetch(signed, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      // Prefer the optimised WebP; if that endpoint errors/absent, fall back to the original so the
      // image still shows (never silently do nothing).
      let finalUrl = publicUrl || null;
      try {
        const r = await apiClient.optimizeStorefrontImage?.(key);
        if (r?.url) finalUrl = r.url;
      } catch (convErr) {
        console.warn('WebP conversion failed; using original image', convErr);
      }
      if (finalUrl) setSectionField(i, 'image', finalUrl);
      else alert('Could not upload the image — please try again.');
    } catch (err) {
      console.error('Highlight image upload failed', err);
      alert('Could not upload the image — please try again.');
    } finally {
      setHlUploading(null);
    }
  }

  // Something to say, or nothing. Both halves are about what a CUSTOMER can do the moment this
  // goes live: order a flavour the baker does not make, or order a tiered cake at a size nobody
  // can build.
  const uncurated  = !!flavourCheck && !flavourCheck.curated && flavourCheck.names.length > 0;
  const needsReview = uncurated || tieredNoMin > 0;

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
      // rights_attested rides along to the host, which hands it to POST /baker/storefront/publish.
      // The API REFUSES to go live without it, and records who vouched (content_attestations).
      // The SAVED theme, never the previewed one. The button above already refuses, so reaching here
      // with a locked preview should be impossible — but this payload also carries colours, sections
      // and the gallery, and a 403 on the theme would reject the whole request and lose edits that
      // had nothing to do with it. Cheap insurance against an expensive, confusing failure.
      const payload = { storefront_theme_id: lockedPreview ? savedThemeId : themeId, primary_color: primary, accent_color: accent, storefront_customizations: customizations, rights_attested: publishRights };
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
      setPublishConfirm(false);
      setPublishRights(false);
      onClose?.();
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    await onUnpublish?.();
    setPublished(false);
  }

  // Phase 3 — the customiser's left panel is a REGISTRY. The current template declares which controls
  // to show, and in what order (TEMPLATES[key].controls → DEFAULT_CONTROLS). Each control is a closure
  // over the state above; the panel renders `templateControls.map(CONTROLS[k])`. Adding a control =
  // a new entry here + the key in a template's `controls`. The Theme selector is always shown.
  const templateControls = TEMPLATES[themeKey]?.controls ?? DEFAULT_CONTROLS;
  const CONTROLS = {
    brandColors: () => (<>
      <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Brand colours</div>
      <Swatch label="Primary" value={primary} onChange={setPrimary} />
      <Swatch label="Accent"  value={accent}  onChange={setAccent} />
      <Swatch label="Hero & button text" value={customizations.cta_color || TEMPLATES[themeKey]?.defaults?.ctaColor || primary} onChange={v => setText('cta_color', v)} />
      <p style={s.hlHint}>Sets the headline, subtitle and button text. Buttons themselves use your band (primary) colour.</p>
    </>),
    hero: () => (<>
      <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Hero cake</div>
      <p style={s.hlHint}>Show one of your templates as the hero, or keep the branded 3D cake.</p>
      <div style={s.heroCtrlRow}>
        <div style={s.heroCtrlThumb}>
          {customizations.hero_design_image
            ? <img src={customizations.hero_design_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={s.heroCtrlNone}>Branded 3D cake</span>}
        </div>
        <div style={s.heroCtrlBtns}>
          {designs.length > 0 && apiClient?.addStorefrontImageFromTemplate && (
            <button type="button" style={s.pickDesigns} onClick={() => setDesignPicker('hero')}>
              Choose from templates
            </button>
          )}
          {customizations.hero_design_image && (
            <button type="button" style={s.heroCtrlClear} onClick={() => setText('hero_design_image', '')}>Use branded cake</button>
          )}
        </div>
      </div>
    </>),
    font: () => (<>
      <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Font</div>
      <div style={s.fontList}>
        {Object.values(FONT_THEMES).map(ft => {
          const sel = (customizations.font_key || 'montserrat') === ft.key;
          return (
            <button key={ft.key} type="button" onClick={() => setText('font_key', ft.key)}
              style={{ ...s.fontBtn, fontFamily: ft.serif, borderColor: sel ? primary : '#D9DED9', borderWidth: sel ? 2 : 1 }}>
              {ft.label}
            </button>
          );
        })}
      </div>
    </>),
    photo: () => (<>
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
    </>),
    text: () => (<>
      <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Text</div>
      {TEXT_FIELDS.map(f => (
        <div key={f.key} style={s.textRow}>
          <label style={s.textLabel}>{f.label}</label>
          <input value={customizations[f.key] ?? ''} placeholder={STOREFRONT_TEXT[f.key]} onChange={e => setText(f.key, e.target.value)} style={s.textInput} />
        </div>
      ))}
    </>),
    sections: () => (<>
      <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Sections</div>
      <p style={s.hlHint}>Turn sections on/off and reorder them. Add one or more <b>Highlight</b> bands (e.g. “This week”) with their own image, text and button.</p>
      <div style={s.sectionMgr}>
        {sectionList.map((sec, i) => (
          <div key={`${sec.type}-${i}`} style={s.sectionCard}>
            <div style={s.sectionRow}>
              <label style={s.sectionToggle}>
                <input type="checkbox" checked={sec.enabled !== false} onChange={() => toggleSection(i)} />
                <span>{sec.type === 'highlight' ? (sec.title?.trim() || 'Highlight') : (SECTION_LABELS[sec.type] || sec.type)}</span>
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)} style={{ ...s.moveBtn, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                <button type="button" aria-label="Move down" disabled={i === sectionList.length - 1} onClick={() => moveSection(i, 1)} style={{ ...s.moveBtn, opacity: i === sectionList.length - 1 ? 0.35 : 1 }}>↓</button>
                {sec.type === 'highlight' && <button type="button" aria-label="Remove section" onClick={() => removeSection(i)} style={s.galleryRemove}>×</button>}
              </div>
            </div>
            {sec.type === 'highlight' && (
              <div style={s.hlEditor}>
                <div style={s.hlEditorCap}>This highlight’s content</div>
                <input value={sec.title || ''} placeholder="Title — e.g. This week: red velvet" onChange={e => setSectionField(i, 'title', e.target.value)} style={s.textInput} />
                <textarea value={sec.blurb || ''} placeholder="Short blurb…" rows={2} onChange={e => setSectionField(i, 'blurb', e.target.value)} style={{ ...s.textInput, resize: 'vertical' }} />
                <label style={s.textLabel}>Image — upload one, or pick from your cake photos</label>
                <div style={s.hlImgRow}>
                  <label style={s.hlUpload} title="Upload a photo">
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadSectionImage(i, e)} />
                    {hlUploading === i ? '…' : '＋'}
                  </label>
                  <button type="button" onClick={() => setSectionField(i, 'image', '')} style={{ ...s.hlImgNone, borderColor: !sec.image ? primary : '#D9DED9' }}>None</button>
                  {sec.image && !gallery.some(g => g.url === sec.image) && (
                    <div style={{ ...s.hlImgThumb, borderColor: primary, borderWidth: 2 }}>
                      <img src={sec.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  {gallery.filter(g => g.url).map(g => (
                    <button key={g.id} type="button" onClick={() => setSectionField(i, 'image', g.url)}
                      style={{ ...s.hlImgThumb, borderColor: sec.image === g.url ? primary : 'transparent', borderWidth: sec.image === g.url ? 2 : 1 }}>
                      <img src={g.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" style={s.addPhotos} onClick={() => addSection('highlight')}>+ Add a Highlight section</button>
    </>),
    gallery: () => (<>
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
      {/* Two ways to add a photo: pick from the baker's real cake designs (authoritative), or upload.
          Shown only when the baker HAS designs to pick from AND the host supports the snapshot endpoint
          (capability gate) — so a host without addStorefrontPhotoFromTemplate never shows a dead button. */}
      {designs.length > 0 && apiClient?.addStorefrontPhotoFromTemplate && (
        <button type="button" style={s.pickDesigns} onClick={() => setDesignPicker('gallery')}>
          Choose from templates
        </button>
      )}
      {/* No attestation here — a photo isn't public until the storefront is. The rights gate is the
          Publish button (see the confirm below). */}
      <label style={s.addPhotos}>
        <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
        + Upload photos
      </label>
    </>),
    reviews: () => (<>
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
    </>),
  };

  // The live storefront node — identical for every device frame (it self-measures its container to
  // choose mobile/tablet/desktop, so ONE instance covers all frames; no per-device render path).
  const storefront = ready
    // A REAL api base, so the chooser shows this baker's actual templates and flavours rather than
    // empty doors. It previously passed '' and the preview silently rendered a storefront whose
    // every server-backed part was missing — which reads as "my flavours are gone", not as "this is
    // only a mock". `preview` then blocks the one thing that must not happen for real: sending an
    // enquiry to the baker's own slug from their own settings screen.
    ? <CustomerStorefront baker={previewBaker} logoUrl={logoUrl} gallery={galleryForPreview}
                          apiBaseUrl={apiClient?.baseUrl ?? ''} preview
                          onStartDesign={() => {}} onEditPortrait={() => portraitInputRef.current?.click()} />
    : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CakeSpinner label="Loading…" /></div>;
  // Desktop frame scale: fit the 1280×834 window into the measured stage (never upscale past 1:1).
  const framePad = device === 'mobile' && !isWide ? 0 : (isWide ? 28 : 14);
  const kFit = (stageSize.width && stageSize.height)
    ? Math.min(1, (stageSize.width - framePad) / DESKTOP_W, (stageSize.height - framePad) / DESKTOP_H)
    : 0.1;

  return (
    <div style={s.overlay}>
      <div style={s.topbar}>
        <button type="button" style={s.cancel} onClick={onClose}>← Back</button>
        <div style={s.titleWrap}>
          {isWide && <span style={s.title}>Customise your storefront</span>}
          <span style={{ ...s.statusPill, ...(published ? s.pillLive : s.pillDraft) }}>{published ? '● Live' : 'Draft'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isWide && published && <button type="button" style={s.unpublish} onClick={unpublish}>Unpublish</button>}
          <button type="button" style={{ ...s.publish, background: `linear-gradient(135deg, ${appPrimary}, ${appAccent})`, opacity: (publishing || busy) ? 0.6 : 1 }} disabled={publishing || busy}
            onClick={() => {
              setPublishRights(false);
              // Silent when there is nothing wrong. A review screen on every colour tweak becomes
              // wallpaper, and wallpaper is what the rights tick two screens later must not become.
              // Appearing only when it has something to say is what makes it worth reading.
              // The tease has done its job by here — straight to billing rather than an explainer
              // with another step in it.
              // Close on the way out, like the flavour-review handoff does: the host owns billing,
              // and a baker should land ON the plans rather than behind the customiser.
              if (lockedPreview) { onClose?.(); onUpgrade?.(); return; }
              if (needsReview) setReview(true); else setPublishConfirm(true);
            }}>
            {publishing ? 'Publishing…' : busy ? 'Uploading…'
              // The button says what it will DO. "Publish" that opens a paywall is a bait; this is
              // the one place the upgrade is named, and it is named at the moment they want the thing.
              : lockedPreview ? 'Upgrade to publish'
              : published ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Theme switcher pinned at the TOP (mobile, preview only) — the frequent action stays in reach,
          no scrolling to a bottom bar. Device toggle + Edit move to a bottom bar (below). */}
      {!isWide && mobileTab === 'preview' && (
        <div style={s.themeTopWrap}>
          <span style={s.themeTopLabel}>Theme</span>
          <ThemePicker layout="row" themes={themes} themeId={themeId} primary={primary} onSelect={selectTheme} canPremium={canPremium} />
        </div>
      )}

      <div style={{ ...s.body, flexDirection: isWide ? 'row' : 'column' }}>
        {/* controls — full screen on mobile (Edit tab), fixed sidebar on desktop */}
        {(isWide || mobileTab === 'edit') && (
        <div style={{ ...s.controls, width: isWide ? 300 : 'auto', flex: isWide ? 'none' : 1, borderRight: isWide ? '1px solid #E3E8E4' : 'none' }}>
          {/* Theme lives with the LIVE preview so switching is instant: the desktop sidebar (preview
              always visible beside it) keeps it here; on mobile it moves to the preview screen's
              bottom bar (see below), so the Edit screen is pure per-theme config — no dead theme list. */}
          {isWide && (<>
            <div style={s.ctrlLabel}>Theme</div>
            <ThemePicker layout="column" themes={themes} themeId={themeId} primary={primary} onSelect={selectTheme} canPremium={canPremium} />
          </>)}

          {/* Phase 3 — the panel is rendered from the template's control list (order matters). */}
          {templateControls.map(k => <React.Fragment key={k}>{CONTROLS[k]?.()}</React.Fragment>)}

          {lockedPreview ? (
            // Says what they are looking at and what it costs, in that order. No modal: a baker who
            // is enjoying a preview should not have to dismiss something to keep enjoying it.
            <p style={s.upsell}>
              You’re previewing <b>{themes.find(t => t.id === themeId)?.name}</b>, a Blaze theme. Look
              around as long as you like — publishing it needs an upgrade, and your live storefront is
              untouched until then.
            </p>
          ) : (
            <p style={s.hint}>Edits show in <b>Preview</b>. Hit <b>{published ? 'Update' : 'Publish'}</b> to make them go live on your storefront.</p>
          )}
          {!isWide && published && <button type="button" style={s.unpublishLink} onClick={unpublish}>Unpublish storefront</button>}
        </div>
        )}

        {/* live preview — a Mobile/Desktop device toggle over the framed storefront. The frame swaps
            from a phone to a scaled 1280px browser window; the storefront itself is unchanged. */}
        {(isWide || mobileTab === 'preview') && (
        <div style={s.stage}>
          {/* Desktop customiser has no tabs row, so the device toggle gets a slim bar here. */}
          {isWide && <div style={s.deviceBar}><DeviceToggle device={device} onChange={setDevice} /></div>}
          {/* Centre on the roomy desktop customiser; top-align on the narrow one so the frame rides up
              under the toggle instead of floating mid-screen. */}
          <div ref={frameAreaRef} style={{ ...s.frameArea, alignItems: isWide ? 'center' : 'flex-start', padding: framePad }}>
            {device === 'desktop' ? (
              // Footprint wrapper = the SCALED size (clips overflow); the 1280-wide window is
              // absolutely placed and scaled into it, so it centres cleanly with no layout push.
              <div style={{ ...s.browserFit, width: DESKTOP_W * kFit, height: DESKTOP_H * kFit }}>
                <div style={{ ...s.browser, transform: `scale(${kFit})`, transformOrigin: 'top left' }}>
                  <div style={s.browserBar}>
                    <span style={{ ...s.browserDot, background: '#ff5f57' }} />
                    <span style={{ ...s.browserDot, background: '#febc2e' }} />
                    <span style={{ ...s.browserDot, background: '#28c840' }} />
                  </div>
                  <div style={s.browserViewport}><div style={s.phoneScroll}>{storefront}</div></div>
                </div>
              </div>
            ) : (
              <div style={isWide ? s.phone : s.phoneMobile}><div style={s.phoneScroll}>{storefront}</div></div>
            )}
            {dirty && <div style={s.dirtyTag}>Unpublished changes</div>}
          </div>
        </div>
        )}
      </div>

      {/* Bottom bar (mobile) — device toggle + Edit. Persistent across preview/edit so the device
          icons are always the way back to the live preview. Themes sit at the top instead. */}
      {!isWide && (
        <div style={s.bottomBar}>
          <DeviceToggle device={mobileTab === 'preview' ? device : null}
            onChange={d => { setDevice(d); setMobileTab('preview'); }} />
          <button type="button" onClick={() => setMobileTab('edit')}
            style={{ ...s.tab, ...(mobileTab === 'edit' ? s.tabActive : {}) }}>
            Edit
          </button>
        </div>
      )}

      {/* ONE design picker, reused by the gallery (multi-add) and the hero (single pick) controls —
          the opener sets the mode, which chooses the action + copy. No second picker. */}
      {designPicker && (
        <Panel
          onClose={() => setDesignPicker(null)}
          title="Your templates"
          subtitle={designPicker === 'hero'
            ? 'Tap a template to show it as your hero cake.'
            : 'Tap a template to add its picture to your gallery. You can add more than one.'}
          width={560}
        >
          <div style={s.pickerGrid}>
            {designs.map(d => {
              const thumb = d.thumbnail_url || d.thumbnail || d.url;
              return (
                <button key={d.id} type="button" style={s.pickerCard} title={d.name || 'design'}
                  onClick={() => (designPicker === 'hero' ? setHeroFromDesign(d) : addFromDesign(d))}>
                  <div style={s.pickerThumb}><img src={thumb} alt={d.name || 'Cake design'} style={s.pickerImg} loading="lazy" /></div>
                  <span style={s.pickerName}>{d.name || 'Cake design'}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ── Publish confirmation — the ONE content-rights gate ──────────────────────────────────
          This is the only moment the storefront becomes visible to the WORLD, and cake themes are
          overwhelmingly third-party IP. Spattoo does not pre-screen, so the baker affirms here that
          they may publish what they are publishing, and the API records it (content_attestations).
          Asked at Publish — never per design save or per photo: a tick clicked fifty times is
          reflex, not evidence. Re-publishing (the "Update" button) re-affirms, which is right —
          the storefront now contains cakes that weren't there last time. */}
      {/* ── Before it goes live ──────────────────────────────────────────────────────────────────
          Two things a baker cannot see from the preview, both about what a CUSTOMER will be able to
          do the moment this is public. Shown only when one of them is actually wrong.

          Informational throughout: no ticks, and Continue is never disabled. A baker who genuinely
          offers every flavour, or who really does build tiered cakes at any size, is not blocked by
          a screen that only knows what it can read. It is a look, not a gate. */}
      {review && (
        <ConfirmPanel
          title="Before it goes live"
          message="Two things customers will be able to do the moment your storefront is public."
          confirmLabel="Looks right — continue"
          onConfirm={() => { setReview(false); setPublishConfirm(true); }}
          onCancel={() => setReview(false)}
          confirmStyle={{ background: `linear-gradient(135deg, ${appPrimary}, ${appAccent})` }}
        >
          {uncurated && (
            <div style={s.reviewBlock}>
              <div style={s.reviewHead}>They can order any of these {flavourCheck.names.length} flavours</div>
              {/* The NAMES, not a count. A baker recognises "Rasmalai" as something they have never
                  made; they cannot recognise "26". That recognition is the entire point of the
                  screen, and a number cannot produce it. */}
              <div style={s.pills}>
                {flavourCheck.names.map(n => <span key={n} style={s.pill}>{n}</span>)}
              </div>
              <p style={s.reviewBody}>
                Every flavour is switched on until you say otherwise. Keep this list up to date —
                you can change it any time in Settings.
              </p>
              {/* Takes them to the FLAVOURS screen, not merely out of here. It used to call
                  onClose alone, which shut the customiser and dropped the baker back on Store
                  Settings — a button labelled "Review my flavours" that reviewed nothing and left
                  them to find it. Reported from the app.
                  The host owns that panel, so it is a callback: this component cannot open a
                  sibling screen and should not learn how. */}
              <button type="button" style={s.reviewBtn}
                      onClick={() => { setReview(false); onClose?.(); onReviewFlavours?.(); }}>
                Review my flavours
              </button>
            </div>
          )}

          {tieredNoMin > 0 && (
            <div style={s.reviewBlock}>
              <div style={s.reviewHead}>
                {tieredNoMin === 1 ? 'One tiered design has' : `${tieredNoMin} tiered designs have`} no
                minimum weight
              </div>
              {/* ⚠️ NO BUTTON HERE, deliberately. There is nowhere to send them: Settings →
                  Templates is an on/off list of SPATTOO's templates and says so itself — "a
                  baker's OWN templates are NOT listed here". A minimum weight can only be set on
                  the save dialog, when a design is saved.
                  So the copy says where it happens instead. A "Review my designs" button that
                  opened a screen which cannot change the thing it names would be the same fault as
                  the flavours button above, one step harder to spot. */}
              <p style={s.reviewBody}>
                Without one, a customer can order a tiered cake at a size it cannot be built at —
                the storefront has nothing to stop them. Open the design and save it again with a
                minimum weight, and it will hold the size for you.
              </p>
            </div>
          )}
        </ConfirmPanel>
      )}

      {publishConfirm && (
        <ConfirmPanel
          title={published ? 'Update your storefront' : 'Publish your storefront'}
          message={published
            ? 'Your changes will go live on your public storefront.'
            : 'Your storefront will go live and anyone with the link can see it.'}
          confirmLabel={publishing ? 'Publishing…' : published ? 'Update' : 'Publish'}
          onConfirm={publish}
          onCancel={() => setPublishConfirm(false)}
          busy={publishing}
          confirmDisabled={!publishRights}
          /* The one button in the app that wears the BAKER's colours rather than the app's, because
             it is the act of putting the baker's own storefront in front of the world. */
          confirmStyle={{ background: `linear-gradient(135deg, ${appPrimary}, ${appAccent})` }}
        >
          {/* The rights attestation is ALONE here, deliberately. It is a legal affirmation, and
              anything stacked around it trains the eye to clear the screen rather than read it —
              this file already argues that "a tick clicked fifty times is reflex, not evidence".
              What a customer will be able to order is a different question, asked on its own screen
              before this one. */}
          <RightsAttestation
            apiClient={apiClient}
            checked={publishRights}
            onChange={setPublishRights}
            primaryColor={primary}
            disabled={publishing}
          />
        </ConfirmPanel>
      )}
    </div>
  );
}


const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function Swatch({ label, value, onChange }) {
  // The colour square IS the picker (native colour input overlaid). The hex box is optional —
  // typed edits commit only when they form a valid #rrggbb (on change/blur/Enter), so typing a code
  // char-by-char never fights the picker or paints an invalid swatch.
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);   // stay in sync when the picker/parent changes it
  const safe = HEX_RE.test(value) ? value : '#000000';
  const commit = v => { const h = v.trim(); if (HEX_RE.test(h)) onChange(h); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} title="Pick a colour">
        <div style={{ width: 44, height: 44, borderRadius: 11, background: safe, border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }} />
        <input type="color" value={safe} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2C4433' }}>{label}</div>
        <input type="text" value={text} spellCheck={false} placeholder="#rrggbb"
          onChange={e => { setText(e.target.value); commit(e.target.value); }}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
          style={{ width: 96, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #D9DED9', fontSize: 12.5, fontFamily: 'monospace', color: '#2C4433', outline: 'none', marginTop: 3 }} />
      </div>
    </div>
  );
}

// Measure an element's content box (via ResizeObserver) — used to scale the desktop preview frame.
function useMeasure() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useRef(null);
  const setRef = useCallback(node => {
    ref.current = node;
    if (node) setSize({ width: node.clientWidth, height: node.clientHeight });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [setRef, size];
}

// The inverse of the shared hook, kept under its own name because "is there room for two columns"
// is what this file actually asks. Equivalent under SSR too: no window means "not narrow", which is
// the `true` default this had.
const useIsWide = (bp = 900) => !useNarrow(bp);

const FONT = UI_FONT;
// Desktop preview frame — a fixed 1280-wide browser window (viewport 800 + a 34px chrome bar). The
// storefront renders at this TRUE width (→ its `desktop` breakpoint) and the whole frame is scaled to
// fit the stage. Config, not a branch: adding a device preset = one row here + a DEVICE_TABS entry.
const DESKTOP_W = 1280, DESKTOP_VP = 800, BROWSER_BAR = 34, DESKTOP_H = DESKTOP_VP + BROWSER_BAR;
const PhoneIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="2" width="10" height="20" rx="2.2" /><line x1="11" y1="18.5" x2="13" y2="18.5" />
  </svg>
);
const MonitorIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const DEVICE_TABS = [['mobile', 'Mobile', PhoneIcon], ['desktop', 'Desktop', MonitorIcon]];

// Compact segmented icon control (phone / monitor) — one instance, placed in the mobile tabs row and
// in the desktop stage bar. Config-driven from DEVICE_TABS; adding a device = one row there.
function DeviceToggle({ device, onChange }) {
  return (
    <div style={s.deviceToggle}>
      {DEVICE_TABS.map(([d, label, Icon]) => (
        <button key={d} type="button" aria-label={`${label} preview`} title={`${label} preview`}
          onClick={() => onChange(d)}
          style={{ ...s.deviceIconBtn, ...(device === d ? s.deviceIconBtnActive : {}) }}>
          <Icon />
        </button>
      ))}
    </div>
  );
}

// Theme selector — ONE component for both placements: a vertical card list in the desktop sidebar
// (layout='column') and a horizontal scrolling chip bar on the mobile preview (layout='row'). Same
// data + selection; only the arrangement differs, so there's no duplicate theme-list logic.
function ThemePicker({ themes, themeId, primary, onSelect, layout = 'column', canPremium = false }) {
  const row = layout === 'row';
  return (
    <div style={row ? s.themeBar : s.themeList}>
      {themes.map(t => {
        const sel = t.id === themeId, off = !t.is_active;
        // Shown to every plan rather than filtered out. A premium theme a Flame baker can see and
        // not choose is an upgrade prompt; one they never knew existed is not — and a list quietly
        // shorter than the pricing page implies is its own confusion.
        // Locked = a plan cannot PUBLISH it. It can still be looked at: the card is tappable and
        // full-strength, and only the badge says Blaze. Disabling it was making the best thing we
        // sell invisible — nobody upgrades for a word they cannot click.
        //
        // `off` (not yet built) is genuinely un-tappable: there is nothing to preview.
        const locked = t.is_premium && !canPremium;
        return (
          <button key={t.id} type="button" disabled={off} onClick={() => onSelect(t.id)}
            title={locked ? 'Preview it — publishing needs Blaze' : undefined}
            style={{ ...(row ? s.themeChip : s.themeBtn), borderColor: sel ? primary : '#D9DED9', borderWidth: sel ? 2 : 1,
              ...(sel && row ? { background: '#F3F7F4' } : {}), opacity: off ? 0.5 : 1, cursor: off ? 'default' : 'pointer' }}>
            <span style={{ fontWeight: 800, color: '#2C4433', fontSize: row ? 13 : 13.5 }}>{t.name}</span>
            {/* "Soon" wins when a theme is both: an inactive theme cannot be chosen on ANY plan, so
                telling a Flame baker to upgrade for it would sell them something that does not
                work yet. */}
            {off ? <span style={s.soon}>Soon</span>
                 : locked ? <span style={s.locked}>Blaze</span>
                 : sel && !row ? <span style={{ color: primary, fontWeight: 800, fontSize: 12 }}>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const s = {
  overlay:  { position: 'fixed', inset: 0, zIndex: 400, background: '#EEF2EF', fontFamily: FONT, display: 'flex', flexDirection: 'column' },
  topbar:   { flexShrink: 0, minHeight: 60, background: '#fff', borderBottom: '1px solid #E3E8E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 10 },
  cancel:   { flexShrink: 0, background: '#F0F4F1', border: '1px solid #D9DED9', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#2C4433', whiteSpace: 'nowrap' },
  titleWrap:{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  title:    { fontSize: 15, fontWeight: 800, color: '#2C4433', whiteSpace: 'nowrap' },
  tab:      { flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: '#F0F4F1', color: '#6B8C74', fontFamily: FONT, fontSize: 13.5, fontWeight: 800, cursor: 'pointer' },
  tabActive:{ background: '#2C4433', color: '#fff' },
  upsell:   { fontSize: 12.5, lineHeight: 1.65, color: '#6B5B2E', background: '#FDF6E3',
              border: '1px solid #EFE2BE', borderRadius: 10, padding: '10px 12px', margin: '14px 0 0' },
  statusPill:{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  pillLive: { color: '#1B7A4B', background: '#E4F4EA' },
  pillDraft:{ color: '#9A6B16', background: '#FBF0DA' },
  unpublish:{ border: '1px solid #E3D3D3', background: '#fff', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#9A4040' },
  // App action button (like Save Settings) — coloured by the APP brand (appPrimary/appAccent props),
  // NOT the baker's storefront theme. Background is applied inline from those props.
  publish:  { flexShrink: 0, border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 800, color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', whiteSpace: 'nowrap' },
  unpublishLink: { display: 'block', width: '100%', marginTop: 14, padding: '11px', borderRadius: 10, border: '1px solid #E3D3D3', background: '#fff', color: '#9A4040', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  body:     { flex: 1, display: 'flex', minHeight: 0 },
  controls: { flexShrink: 0, background: '#fff', padding: '20px 20px 24px', overflowY: 'auto', boxSizing: 'border-box' },
  ctrlLabel:{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2', marginBottom: 10 },
  themeList:{ display: 'flex', flexDirection: 'column', gap: 8 },
  themeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', fontFamily: FONT },
  // Mobile: live theme switcher pinned at the TOP (leading label + horizontal scrolling chips).
  themeTopWrap: { flexShrink: 0, background: '#fff', borderBottom: '1px solid #E3E8E4', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 },
  themeTopLabel: { flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2' },
  themeBar: { display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0, WebkitOverflowScrolling: 'touch' },
  themeChip:{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', fontFamily: FONT, whiteSpace: 'nowrap' },
  // Mobile: persistent bottom bar — device toggle (left) + Edit (right).
  bottomBar:{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fff', borderTop: '1px solid #E3E8E4' },
  // Amber, not red: nothing has gone wrong. It is a "did you mean this?" at the last cheap moment.
  reviewBlock: { marginBottom: 14, padding: '13px 14px', borderRadius: 12,
                 background: '#FBF0DA', border: '1px solid #EAD9AE' },
  reviewHead:  { fontSize: 13.5, fontWeight: 800, color: '#7A5A12' },
  reviewBody:  { fontSize: 12.5, lineHeight: 1.5, color: '#7A6C60', margin: '5px 0 10px' },
  reviewBtn:   { border: '1px solid #D9C79A', background: '#fff', borderRadius: 9,
                 padding: '8px 13px', cursor: 'pointer', fontFamily: FONT, fontSize: 12.5,
                 fontWeight: 700, color: '#7A5A12' },
  // Capped and scrollable: a baker with forty flavours must not push Continue off the screen, and
  // the names are for scanning rather than reading end to end.
  pills:       { display: 'flex', flexWrap: 'wrap', gap: 5, margin: '9px 0 4px',
                 maxHeight: 132, overflowY: 'auto' },
  pill:        { fontSize: 11.5, fontWeight: 700, color: '#7A5A12', background: '#fff',
                 border: '1px solid #EAD9AE', borderRadius: 20, padding: '3px 9px' },

  soon:     { fontSize: 9.5, fontWeight: 800, color: '#9BB5A2', background: '#F0F4F1', padding: '2px 7px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  // Warm rather than grey: this is an invitation to upgrade, not a disabled control. Reads as a
  // plan badge next to "Soon", which is a statement about us and stays neutral.
  locked:   { fontSize: 9.5, fontWeight: 800, color: '#9A6B16', background: '#FBF0DA', padding: '2px 7px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  portraitRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #D9DED9', background: '#fff', cursor: 'pointer' },
  portraitThumb: { width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0F4F1', border: '1px solid #E3E8E4', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fontList: { display: 'flex', flexDirection: 'column', gap: 8 },
  fontBtn:  { padding: '10px 14px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', color: '#2C4433', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  sectionMgr: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionCard: { borderRadius: 9, border: '1px solid #E3E8E4', background: '#fff', overflow: 'hidden' },
  sectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' },
  // Nested content of a Highlight section — a tinted, divided sub-panel so it clearly belongs to the
  // section above it (not a flat run of inputs).
  hlEditor:  { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 14px', background: '#F6FAF7', borderTop: '1px solid #E7EDE8' },
  hlEditorCap: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: '#9BB5A2', marginBottom: 2 },
  sectionToggle: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, color: '#2C4433', cursor: 'pointer' },
  moveBtn:  { width: 28, height: 28, borderRadius: 7, border: '1px solid #D9DED9', background: '#F8FBF9', color: '#2C4433', fontSize: 14, lineHeight: 1, cursor: 'pointer' },
  hlHint:   { fontSize: 11.5, fontWeight: 500, color: '#6B8C74', lineHeight: 1.5, margin: '0 0 10px' },
  hlImgRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  hlUpload: { width: 40, height: 40, borderRadius: 8, border: '1.5px dashed #C5D4C8', background: '#F8FBF9', color: '#2C4433', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hlImgNone:{ height: 40, padding: '0 10px', borderRadius: 8, border: '1.5px solid #D9DED9', background: '#fff', color: '#6B8C74', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  hlImgThumb:{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', padding: 0, border: '1px solid transparent', background: '#F0F4F1', cursor: 'pointer' },
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
  // "Choose from your designs" — the authoritative (solid) action; upload is the dashed secondary one.
  pickDesigns: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 10, padding: '10px', borderRadius: 10, border: 'none', background: '#2C4433', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT },
  // Hero control — current hero preview + pick/clear buttons.
  heroCtrlRow: { display: 'flex', gap: 12, marginTop: 10, alignItems: 'stretch' },
  heroCtrlThumb: { width: 78, flexShrink: 0, borderRadius: 12, border: '1px solid #E3E8E4', background: 'linear-gradient(160deg, #F3F7F4, #E8EFE9)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroCtrlNone: { fontSize: 10.5, fontWeight: 700, color: '#9BB5A2', textAlign: 'center', padding: 4, lineHeight: 1.3 },
  heroCtrlBtns: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  heroCtrlClear: { width: '100%', marginTop: 8, padding: '9px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', color: '#6B8C74', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
  // Design picker modal.
  pickerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, padding: 16, overflowY: 'auto' },
  pickerCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: 0, border: '1px solid #E3E8E4', borderRadius: 12, overflow: 'hidden', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: FONT },
  pickerThumb: { aspectRatio: '1 / 1', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #F3F7F4, #E8EFE9)' },
  pickerImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  pickerName: { fontSize: 12, fontWeight: 700, color: '#2C4433', padding: '0 9px 9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  reviewList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  reviewItem: { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, border: '1px solid #E3E8E4', background: '#fff' },
  reviewQuote:{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: '1px solid #D9DED9', fontSize: 12.5, fontFamily: FONT, color: '#2C4433', outline: 'none', resize: 'vertical' },
  reviewMeta: { flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid #D9DED9', fontSize: 12, fontFamily: FONT, color: '#2C4433', outline: 'none' },
  hint:     { fontSize: 12, fontWeight: 500, color: '#6B8C74', lineHeight: 1.55, marginTop: 22 },
  stage:    { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' },
  // Desktop-only slim bar for the device toggle (mobile shows it inline in the tabs row instead).
  deviceBar:{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '10px 0 2px' },
  // Compact segmented icon control (phone / monitor).
  deviceToggle: { display: 'flex', gap: 4, padding: 4, background: '#fff', border: '1px solid #E3E8E4', borderRadius: 11, flexShrink: 0, alignSelf: 'center' },
  deviceIconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: '#6B8C74', cursor: 'pointer', padding: 0 },
  deviceIconBtnActive: { background: '#2C4433', color: '#fff' },
  frameArea:{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  // Desktop preview: footprint wrapper is the SCALED size and clips; the true-1280 window sits inside.
  browserFit:{ position: 'relative', overflow: 'hidden', flexShrink: 0, borderRadius: 12, boxShadow: '0 24px 70px rgba(40,30,35,0.28)' },
  browser:  { position: 'absolute', top: 0, left: 0, width: DESKTOP_W, height: DESKTOP_H, background: '#fff', overflow: 'hidden', border: '1px solid #d7d7da', display: 'flex', flexDirection: 'column' },
  browserBar:{ flexShrink: 0, height: BROWSER_BAR, background: '#f0f0f2', borderBottom: '1px solid #e2e2e5', display: 'flex', alignItems: 'center', gap: 8, padding: '0 15px' },
  browserDot:{ width: 12, height: 12, borderRadius: '50%', display: 'inline-block' },
  browserViewport: { flex: 1, minHeight: 0, position: 'relative' },
  // transform:translateZ(0) promotes the frame to its own layer so Safari ≤15 actually clips the
  // scrolling storefront inside to the rounded corners (without it, the content's square corners show).
  phone:    { width: 392, maxWidth: '100%', height: 'min(86vh, 780px)', background: '#fff', borderRadius: 30, overflow: 'hidden', boxShadow: '0 24px 70px rgba(40,30,35,0.28)', border: '8px solid #1c1518', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' },
  phoneMobile: { width: '100%', height: '100%', background: '#fff', overflow: 'hidden' },
  phoneScroll: { width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },
  dirtyTag: { position: 'absolute', top: 18, right: 18, background: '#2C4433', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20 },
};
