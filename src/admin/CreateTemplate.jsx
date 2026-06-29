import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import CakeCanvas, { CakeThumbnailCanvas } from '../designer/canvas/CakeCanvas.jsx';
import { TIER_RADII, FROSTING_TYPES } from '../designer/hooks/useCakeDesign.js';

const API_BASE = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_API_URL ?? '') : '';

const TIER_COLORS = ['#f5b8c8', '#ffffff', '#c8dff5', '#d4f5d4'];
const TIER_LABELS = ['Bottom', '2nd', '3rd', 'Top'];
const BOTTOM_BASE = 0.1;
const BOTTOM_H    = 1.45;

const s = {
  page: {
    display: 'flex', height: '100vh', fontFamily: "'Quicksand', sans-serif",
    background: '#faf6f1', overflow: 'hidden',
  },
  sidebar: {
    width: 300, minWidth: 300, background: '#fff',
    borderRight: '1px solid #999999',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '20px 20px 16px',
    borderBottom: '1px solid #999999',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 16, fontWeight: 800, color: '#6b2d42',
    fontFamily: "'Playfair Display', serif",
  },
  sidebarBody: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
  },
  sidebarFooter: {
    padding: '14px 20px', borderTop: '1px solid #999999', flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  canvasWrap: {
    flex: 1, position: 'relative', background: '#FAFAF8',
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#1a1a1a',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    width: '100%', padding: '9px 12px', border: '1.5px solid #999999',
    borderRadius: 8, fontSize: 13, fontFamily: "'Quicksand', sans-serif",
    color: '#2d1b0e', outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '8px 10px', border: '1.5px solid #999999',
    borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif",
    color: '#2d1b0e', background: '#fff', outline: 'none',
    boxSizing: 'border-box',
  },
  tierCard: {
    border: '1.5px solid #999999', borderRadius: 10,
    padding: '12px', marginBottom: 10, background: '#ffffff',
  },
  tierHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  tierLabel: {
    fontSize: 11, fontWeight: 700, color: '#1a1a1a',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  rowLabel: { fontSize: 11, color: '#b07a8a', width: 80, flexShrink: 0, fontWeight: 600 },
  tierCountRow: {
    display: 'flex', gap: 6, marginBottom: 16,
  },
  tierCountBtn: (active) => ({
    flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
    border: `1.5px solid ${active ? '#1a1a1a' : '#999999'}`,
    background: active ? '#FAFAF8' : '#fff',
    color: active ? '#6b2d42' : '#b07a8a',
    fontSize: 13, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
  }),
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#c9a0b0',
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: 10, marginTop: 4,
  },
  pipingRow: {
    display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6,
  },
  pipingLabel: { fontSize: 10, color: '#b07a8a', width: 36, flexShrink: 0, fontWeight: 600 },
  thumbnailBox: {
    width: '100%', aspectRatio: '1 / 1', border: '1.5px dashed #999999',
    borderRadius: 10, display: 'flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', background: '#ffffff',
    marginBottom: 8,
  },
  btn: (variant = 'primary') => ({
    width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
    border: 'none', fontSize: 13, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    background: variant === 'primary' ? '#1a1a1a' : '#f3f4f6',
    color: variant === 'primary' ? '#fff' : '#1a1a1a',
  }),
  // Element panel
  typeScrollRow: {
    display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6,
    marginBottom: 10, scrollbarWidth: 'none',
  },
  typePill: (active) => ({
    flexShrink: 0, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
    border: `1.5px solid ${active ? '#1a1a1a' : '#999999'}`,
    background: active ? '#FAFAF8' : '#fff',
    color: active ? '#6b2d42' : '#b07a8a',
    fontSize: 11, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
  }),
  elGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
  },
  elCard: {
    border: '1.5px solid #999999', borderRadius: 8, overflow: 'hidden',
    cursor: 'pointer', background: '#ffffff', display: 'flex',
    flexDirection: 'column', alignItems: 'center',
    padding: '6px 4px',
    transition: 'border-color 0.15s',
  },
  elThumb: {
    width: '100%', aspectRatio: '1/1', objectFit: 'contain',
    borderRadius: 6, background: '#fff',
  },
  elName: {
    fontSize: 9, color: '#1a1a1a', fontWeight: 600, marginTop: 4,
    textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word',
  },
  // Group bar overlay
  groupBar: {
    position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
    padding: '8px 14px', borderRadius: 12, whiteSpace: 'nowrap',
    boxShadow: '0 4px 20px rgba(107,45,66,0.22)',
    border: '1px solid rgba(240,220,227,0.9)',
    zIndex: 30, pointerEvents: 'auto',
  },
  groupBarBtn: {
    background: 'none', border: '1.5px solid #999999', borderRadius: 8,
    padding: '4px 10px', fontSize: 11, cursor: 'pointer',
    fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
  },
};

function PipingSelect({ label, value, options, onSelect, onColorChange }) {
  return (
    <div style={s.pipingRow}>
      <span style={s.pipingLabel}>{label}</span>
      <select
        style={{ ...s.select, flex: 1 }}
        value={value?.id ?? ''}
        onChange={e => {
          const el = options.find(o => o.id === e.target.value);
          onSelect(el ? { id: el.id, glbUrl: el.image_url, name: el.name, color: value?.color ?? '#f5e6c8' } : null);
        }}
      >
        <option value="">None</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {value && (
        <input
          type="color"
          value={value.color ?? '#f5e6c8'}
          onChange={e => onColorChange(e.target.value)}
          style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'none' }}
          title="Piping colour"
        />
      )}
    </div>
  );
}

export default function CreateTemplate({ supabase, thumbnailBucket = 'cake-thumbnails', onSave, onSaved }) {
  const [name, setName]           = useState('');
  const [tierCount, setTierCount] = useState(1);
  const [tiers, setTiers]         = useState([
    { color: '#f5b8c8', frostingType: 'buttercream', topPiping: null, bottomPiping: null },
  ]);
  const [topper, setTopper]       = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [pipingStyles, setPipingStyles] = useState([]);
  const [topperOptions, setTopperOptions] = useState([]);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null);
  const canvasContainerRef = useRef();
  const thumbContainerRef  = useRef();
  const hitTestRef         = useRef(null);
  const [dragGhost, setDragGhost] = useState(null); // { x, y, el }

  // Sticker state
  const [stickers, setStickers]               = useState([]);
  const [selectedStickerIds, setSelectedStickerIds] = useState(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Element panel state
  const [stickerElements, setStickerElements] = useState([]);
  const [elementTypes, setElementTypes]       = useState([]);
  const [activeTypeId, setActiveTypeId]       = useState(null);

  useEffect(() => {
    async function loadElements() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const token = session.access_token;

      async function apiFetch(path) {
        const res = await fetch(`${API_BASE}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        return res.json();
      }

      const [types, allElements] = await Promise.all([
        apiFetch('/api/element-types'),
        apiFetch('/api/elements?parents_only=true'),
      ]);

      if (!Array.isArray(types)) return;

      const pipingTypeId = types.find(t => t.slug === 'piping_style')?.id;
      const topperTypeId = types.find(t => t.slug === 'topper')?.id;

      const elements = Array.isArray(allElements) ? allElements : [];
      setPipingStyles(elements.filter(e => e.element_type_id === pipingTypeId));
      setTopperOptions(elements.filter(e => e.element_type_id === topperTypeId));

      const stickerTypes = types.filter(t => t.slug !== 'piping_style' && t.slug !== 'topper');
      setElementTypes(stickerTypes);
      if (stickerTypes.length > 0) setActiveTypeId(stickerTypes[0].id);

      const excludeIds = new Set([pipingTypeId, topperTypeId].filter(Boolean));
      setStickerElements(elements.filter(e => !excludeIds.has(e.element_type_id)));
    }
    loadElements();
  }, []);

  useEffect(() => {
    setTiers(prev => {
      if (tierCount > prev.length) {
        const added = Array.from({ length: tierCount - prev.length }, (_, i) => ({
          color: TIER_COLORS[prev.length + i] ?? '#ffffff',
          frostingType: 'buttercream',
          topPiping: null,
          bottomPiping: null,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, tierCount);
    });
  }, [tierCount]);

  function updateTier(index, patch) {
    setTiers(prev => prev.map((t, i) => i === index ? { ...t, ...patch } : t));
  }

  // ── Sticker management ──
  function addStickerEl(element, hit = null) {
    const isGlb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '');
    const zone = hit?.zone ?? (element.placement_config?.top_surface ? 'top_surface' : 'side');
    const placementMode = element.placement_config?.[zone] ?? 'hug';
    setStickers(prev => [...prev, {
      id:            Date.now(),
      elementId:     element.id,
      imageUrl:      element.image_url,
      name:          element.name,
      zone,
      tierIndex:     hit?.tierIndex ?? 0,
      placementMode,
      theta:         hit?.theta ?? 0,
      y:             hit?.y    ?? (BOTTOM_BASE + BOTTOM_H * 0.45),
      x:             hit?.x    ?? 0,
      z:             hit?.z    ?? 0,
      scale:         isGlb ? 2.5 : 1,
      yOffset:       0,
      rotation:      0,
      radialOffset:  0,
      tiltAngle:     0,
      groupId:       null,
      color:         null,
      allowedActions: {
        resize:    element.allowed_actions?.resize    ?? true,
        duplicate: element.allowed_actions?.duplicate ?? true,
        color:     element.allowed_actions?.color     ?? false,
        delete:    true,
      },
    }]);
  }

  function startStickerDrag(el, startX, startY) {
    setDragGhost({ x: startX, y: startY, el });
    function onMove(e) {
      setDragGhost({ x: e.clientX, y: e.clientY, el });
    }
    function onUp(e) {
      setDragGhost(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      if (hit) addStickerEl(el, hit);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function updateStickerPos(id, changes) {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
  }

  function removeStickerById(id) {
    setStickers(prev => prev.filter(s => s.id !== id));
    setSelectedStickerIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function moveGroupStickers(groupId, startPositions, delta) {
    setStickers(prev => prev.map(s => {
      if (s.groupId !== groupId) return s;
      const start = startPositions[s.id];
      if (!start) return s;
      const u = { ...s };
      if (delta.deltaTheta !== undefined) u.theta = start.theta + delta.deltaTheta;
      if (delta.deltaY     !== undefined) u.y     = start.y     + delta.deltaY;
      if (delta.dx         !== undefined) u.x     = start.x     + delta.dx;
      if (delta.dz         !== undefined) u.z     = start.z     + delta.dz;
      return u;
    }));
  }

  // ── Selection ──
  function clearSelection() {
    setSelectedStickerIds(new Set());
    setMultiSelectMode(false);
  }

  function handleStickerSelect(id, ctrlKey = false) {
    if (ctrlKey || multiSelectMode) {
      setMultiSelectMode(true);
      setSelectedStickerIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    const sticker = stickers.find(s => s.id === id);
    if (sticker?.groupId) {
      setSelectedStickerIds(new Set(stickers.filter(s => s.groupId === sticker.groupId).map(s => s.id)));
    } else {
      const isOnly = selectedStickerIds.size === 1 && selectedStickerIds.has(id);
      setSelectedStickerIds(isOnly ? new Set() : new Set([id]));
    }
  }

  function handleStickerLongPress(id) {
    setMultiSelectMode(true);
    setSelectedStickerIds(new Set([id]));
  }

  function groupSelected() {
    const ids = [...selectedStickerIds];
    const groupId = crypto.randomUUID();
    setStickers(prev => prev.map(s => ids.includes(s.id) ? { ...s, groupId } : s));
    clearSelection();
  }

  function ungroupSelected() {
    const ids = [...selectedStickerIds];
    const gid = stickers.find(s => ids.includes(s.id))?.groupId;
    if (!gid) return;
    setStickers(prev => prev.map(s => s.groupId === gid ? { ...s, groupId: null } : s));
    clearSelection();
  }

  function deleteSelected() {
    const ids = new Set(selectedStickerIds);
    setStickers(prev => prev.filter(s => !ids.has(s.id)));
    clearSelection();
  }

  // ── Single sticker toolbar (shown in R3F Html — minimal) ──
  const selectedId = selectedStickerIds.size === 1 ? [...selectedStickerIds][0] : null;
  const selectedSticker = selectedId ? stickers.find(s => s.id === selectedId) : null;
  const stickerToolbar = null; // edit panel below replaces the floating Html toolbar

  const canvasConfig = useMemo(() => ({
    tiers: tiers.map((t, i) => ({
      radius:       TIER_RADII[i] ?? 0.35,
      height:       1.45 - i * 0.08,
      color:        t.color,
      frostingType: t.frostingType,
      topPiping:    t.topPiping,
      bottomPiping: t.bottomPiping,
    })),
    texts:    [],
    stickers,
    topper:   topper ? { ...topper, scale: 1 } : null,
  }), [tiers, topper, stickers]);

  function captureThumbnail() {
    const canvas = thumbContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    setThumbnail(canvas.toDataURL('image/webp', 0.85));
  }

  async function handleSave() {
    if (!name.trim()) { setSaveMsg({ ok: false, text: 'Name is required.' }); return; }
    setSaving(true);
    setSaveMsg(null);

    const designJson = {
      shape: 'round',
      tiers: tiers.map(t => ({
        color:        t.color,
        frostingType: t.frostingType,
        topPiping:    t.topPiping ?? null,
        bottomPiping: t.bottomPiping ?? null,
        decorations:  [],
        texts:        [],
      })),
      texts:    [],
      stickers,
      topper:   topper ?? null,
    };

    const thumbnailBlob = thumbnail ? await (await fetch(thumbnail)).blob() : null;

    try {
      if (onSave) {
        await onSave({ name: name.trim(), tierCount, designJson, thumbnailBlob });
      } else {
        let thumbnail_url = null;
        if (thumbnailBlob) {
          const ext = thumbnailBlob.type === 'image/webp' ? 'webp' : 'png';
          const fileName = `template-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(thumbnailBucket)
            .upload(fileName, thumbnailBlob, { contentType: thumbnailBlob.type, upsert: false });
          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage.from(thumbnailBucket).getPublicUrl(fileName);
            thumbnail_url = publicUrl;
          }
        }
        const { error } = await supabase.from('cake_templates').insert({
          name: name.trim(), shape: 'round', tier_count: tierCount,
          offering: 'standard', design: designJson, thumbnail_url, is_active: true, sort_order: 0,
        });
        if (error) throw new Error(error.message);
      }
      setSaveMsg({ ok: true, text: 'Template saved!' });
      onSaved?.();
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const visibleElements = activeTypeId
    ? stickerElements.filter(e => e.element_type_id === activeTypeId)
    : stickerElements;

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
      <div style={s.page}>

        {/* ── Sidebar ── */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarTitle}>Create Template</div>
          </div>

          <div style={s.sidebarBody}>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={s.label}>Template Name</label>
              <input
                style={s.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Classic Pink 2-Tier"
              />
            </div>

            {/* Tier count */}
            <div style={{ marginBottom: 16 }}>
              <label style={s.label}>Tiers</label>
              <div style={s.tierCountRow}>
                {[1, 2, 3, 4].map(n => (
                  <button key={n} style={s.tierCountBtn(tierCount === n)} onClick={() => setTierCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-tier settings */}
            <div style={{ marginBottom: 16 }}>
              <div style={s.sectionTitle}>Tiers</div>
              {tiers.map((tier, i) => (
                <div key={i} style={s.tierCard}>
                  <div style={s.tierHeader}>
                    <span style={s.tierLabel}>{TIER_LABELS[i]} Tier</span>
                  </div>
                  <div style={s.row}>
                    <span style={s.rowLabel}>Color</span>
                    <input
                      type="color"
                      value={tier.color}
                      onChange={e => updateTier(i, { color: e.target.value })}
                      style={{ width: 36, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                    />
                    <span style={{ fontSize: 11, color: '#b07a8a' }}>{tier.color}</span>
                  </div>
                  <div style={s.row}>
                    <span style={s.rowLabel}>Frosting</span>
                    <select
                      style={{ ...s.select, flex: 1 }}
                      value={tier.frostingType}
                      onChange={e => updateTier(i, { frostingType: e.target.value })}
                    >
                      {FROSTING_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  </div>
                  {pipingStyles.length > 0 && (
                    <>
                      <PipingSelect
                        label="Top"
                        value={tier.topPiping}
                        options={pipingStyles}
                        onSelect={el => updateTier(i, { topPiping: el })}
                        onColorChange={c => updateTier(i, { topPiping: { ...tier.topPiping, color: c } })}
                      />
                      <PipingSelect
                        label="Base"
                        value={tier.bottomPiping}
                        options={pipingStyles}
                        onSelect={el => updateTier(i, { bottomPiping: el })}
                        onColorChange={c => updateTier(i, { bottomPiping: { ...tier.bottomPiping, color: c } })}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Topper */}
            {topperOptions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={s.sectionTitle}>Topper</div>
                <select
                  style={s.select}
                  value={topper?.id ?? ''}
                  onChange={e => {
                    const el = topperOptions.find(o => o.id === e.target.value);
                    setTopper(el ? { id: el.id, image_url: el.image_url, name: el.name } : null);
                  }}
                >
                  <option value="">None</option>
                  {topperOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {/* Elements */}
            {stickerElements.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={s.sectionTitle}>Elements</div>
                <div style={{ fontSize: 10, color: '#b07a8a', marginBottom: 8 }}>
                  Tap to add · Long-press on canvas to multi-select
                </div>

                {/* Type filter pills */}
                {elementTypes.length > 1 && (
                  <div style={s.typeScrollRow}>
                    {elementTypes.map(t => (
                      <button key={t.id} style={s.typePill(activeTypeId === t.id)} onClick={() => setActiveTypeId(t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Element grid */}
                <div style={s.elGrid}>
                  {visibleElements.map(el => (
                    <div
                      key={el.id}
                      style={{ ...s.elCard, touchAction: 'none' }}
                      onPointerDown={e => { e.preventDefault(); startStickerDrag(el, e.clientX, e.clientY); }}
                    >
                      {(el.thumbnail_url || el.image_url) && (
                        <img
                          src={el.thumbnail_url ?? el.image_url}
                          alt={el.name}
                          style={s.elThumb}
                        />
                      )}
                      <div style={s.elName}>{el.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ── Footer: thumbnail + save ── */}
          <div style={s.sidebarFooter}>
            <div style={s.thumbnailBox}>
              {thumbnail
                ? <img src={thumbnail} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="thumbnail" />
                : <span style={{ fontSize: 11, color: '#c9a0b0' }}>No thumbnail yet</span>
              }
            </div>
            <button style={s.btn('secondary')} onClick={captureThumbnail}>
              📷 Capture Thumbnail
            </button>
            {saveMsg && (
              <div style={{ fontSize: 12, fontWeight: 600, color: saveMsg.ok ? '#3a7d44' : '#c00', textAlign: 'center' }}>
                {saveMsg.text}
              </div>
            )}
            <button
              style={{ ...s.btn('primary'), opacity: saving || !name.trim() ? 0.6 : 1 }}
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>

        {/* ── 3D Canvas ── */}
        <div style={s.canvasWrap} ref={canvasContainerRef}>
          <Suspense fallback={
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b07a8a', fontSize: 13 }}>
              Loading 3D…
            </div>
          }>
            <CakeCanvas
              config={canvasConfig}
              selectedTier={null}
              onTierClick={() => {}}
              onDeselect={clearSelection}
              selectedPiping={null}
              onTopPipingSelect={() => {}}
              onBottomPipingSelect={() => {}}
              pipingTarget={null}
              onPipingStyleSelect={() => {}}
              onPipingCancel={() => {}}
              pipingStyles={[]}
              selectedTextId={null}
              onTextSelect={() => {}}
              onTextMove={() => {}}
              onTextContentChange={() => {}}
              autoRotate={false}
              selectedStickerIds={selectedStickerIds}
              onStickerSelect={handleStickerSelect}
              onStickerLongPress={handleStickerLongPress}
              onStickerMove={updateStickerPos}
              onGroupMove={moveGroupStickers}
              stickerToolbar={stickerToolbar}
              hitTestRef={hitTestRef}
            />
          </Suspense>

          {/* ── Drag ghost ── */}
          {dragGhost && (
            <div style={{
              position: 'fixed', left: dragGhost.x - 28, top: dragGhost.y - 28,
              width: 56, height: 56, borderRadius: 12, overflow: 'hidden',
              background: 'rgba(255,255,255,0.9)', border: '2px solid #1a1a1a',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            }}>
              {dragGhost.el.thumbnail_url && (
                <img src={dragGhost.el.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
            </div>
          )}

          {/* ── Single sticker edit strip ── */}
          {selectedSticker && !multiSelectMode && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
              padding: '8px 12px', borderRadius: 12, whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(107,45,66,0.22)',
              border: '1px solid rgba(240,220,227,0.9)', zIndex: 30,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#c9a0b0', letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>
                {selectedSticker.name}
              </span>

              {/* Height */}
              <span style={{ fontSize: 10, color: '#1a1a1a', fontWeight: 700 }}>Height</span>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { yOffset: +(((selectedSticker.yOffset ?? 0) - 0.05).toFixed(3)) })}>−</button>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { yOffset: +(((selectedSticker.yOffset ?? 0) + 0.05).toFixed(3)) })}>+</button>

              {/* Scale */}
              <span style={{ fontSize: 10, color: '#1a1a1a', fontWeight: 700, marginLeft: 4 }}>Size</span>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { scale: Math.max(0.3, +((selectedSticker.scale - 0.2).toFixed(2))) })}>−</button>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { scale: +((selectedSticker.scale + 0.2).toFixed(2)) })}>+</button>

              {/* Tilt */}
              <span style={{ fontSize: 10, color: '#1a1a1a', fontWeight: 700, marginLeft: 4 }}>Tilt</span>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { tiltAngle: Math.max(-1.2, +((selectedSticker.tiltAngle ?? 0) - 0.1).toFixed(3)) })}>−</button>
              <span style={{ fontSize: 10, color: '#1a1a1a', minWidth: 28, textAlign: 'center' }}>{Math.round(((selectedSticker.tiltAngle ?? 0) * 180) / Math.PI)}°</span>
              <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { tiltAngle: Math.min(1.2, +((selectedSticker.tiltAngle ?? 0) + 0.1).toFixed(3)) })}>+</button>

              {/* Spin (top surface stand stickers only) */}
              {selectedSticker.zone === 'top_surface' && selectedSticker.placementMode === 'stand' && <>
                <span style={{ fontSize: 10, color: '#1a1a1a', fontWeight: 700, marginLeft: 4 }}>Spin</span>
                <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { rotation: +((selectedSticker.rotation ?? 0) - 0.2).toFixed(3) })}>↺</button>
                <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { rotation: +((selectedSticker.rotation ?? 0) + 0.2).toFixed(3) })}>↻</button>
              </>}

              {/* Depth (side stickers only) */}
              {selectedSticker.zone === 'side' && <>
                <span style={{ fontSize: 10, color: '#1a1a1a', fontWeight: 700, marginLeft: 4 }}>Depth</span>
                <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { radialOffset: Math.max(0, +((selectedSticker.radialOffset ?? 0) - 0.05).toFixed(3)) })}>−</button>
                <button style={s.groupBarBtn} onClick={() => updateStickerPos(selectedId, { radialOffset: Math.min(0.6, +((selectedSticker.radialOffset ?? 0) + 0.05).toFixed(3)) })}>+</button>
              </>}

              <button
                style={{ ...s.groupBarBtn, color: '#e53935', borderColor: '#fcc', marginLeft: 4 }}
                onClick={() => removeStickerById(selectedId)}>
                Delete
              </button>
              <button style={{ ...s.groupBarBtn, color: '#6c47ff', borderColor: '#ddd' }} onClick={clearSelection}>
                Done
              </button>
            </div>
          )}

          {/* ── Multi-select group bar ── */}
          {(multiSelectMode || selectedStickerIds.size > 1) && (() => {
            const ids = [...selectedStickerIds];
            const allGrouped = ids.length > 1 && ids.every(id => {
              const stk = stickers.find(x => x.id === id);
              return stk?.groupId && stk.groupId === stickers.find(x => x.id === ids[0])?.groupId;
            });
            return (
              <div style={s.groupBar}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>
                  {ids.length === 0 ? 'Tap to select' : ids.length === 1 ? '1 selected — tap more' : `${ids.length} selected`}
                </span>
                {ids.length > 1 && !allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#1a1a1a', borderColor: '#999999' }} onClick={groupSelected}>
                    Group
                  </button>
                )}
                {ids.length > 1 && allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#1a1a1a', borderColor: '#999999' }} onClick={ungroupSelected}>
                    Ungroup
                  </button>
                )}
                {ids.length > 1 && (
                  <button style={{ ...s.groupBarBtn, color: '#e53935', borderColor: '#fcc' }} onClick={deleteSelected}>
                    Delete all
                  </button>
                )}
                <button style={{ ...s.groupBarBtn, color: '#6c47ff', borderColor: '#ddd' }} onClick={clearSelection}>
                  Done
                </button>
              </div>
            );
          })()}
        </div>

      </div>

      {/* Hidden off-screen canvas for thumbnail capture */}
      <Suspense fallback={null}>
        <CakeThumbnailCanvas config={canvasConfig} containerRef={thumbContainerRef} />
      </Suspense>
    </>
  );
}
