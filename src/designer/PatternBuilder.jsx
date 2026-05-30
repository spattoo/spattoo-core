import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PatternBuilderCanvas, { getOverlappingIds, placementPosition, ALL_TIER_GEOM } from './canvas/PatternBuilderCanvas.jsx';
import * as THREE from 'three';

const DEFAULT_TIER_COUNT = 4;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    display: 'flex', height: '100%', width: '100%',
    fontFamily: "'Quicksand', sans-serif",
    background: '#faf6f1', overflow: 'hidden',
  },
  sidebar: {
    width: 260, minWidth: 260, background: '#fff',
    borderRight: '1px solid #e8e8e8',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '18px 20px 14px', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
  },
  title: {
    fontSize: 15, fontWeight: 800, color: '#1a1a1a', margin: 0,
  },
  sidebarBody: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  sidebarFooter: {
    padding: '14px 20px', borderTop: '1px solid #e8e8e8', flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  canvasWrap: { flex: 1, position: 'relative' },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#1a1a1a',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5,
  },
  input: {
    width: '100%', padding: '8px 12px', border: '1.5px solid #e0e0e0',
    borderRadius: 8, fontSize: 13, fontFamily: "'Quicksand', sans-serif",
    color: '#1a1a1a', outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '8px 10px', border: '1.5px solid #e0e0e0',
    borderRadius: 8, fontSize: 12, fontFamily: "'Quicksand', sans-serif",
    color: '#1a1a1a', background: '#fff', outline: 'none', boxSizing: 'border-box',
  },
  btn: {
    padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 12,
  },
  btnPrimary:   { background: '#1a1a1a', color: '#fff' },
  btnSecondary: { background: '#fff', color: '#1a1a1a', border: '1.5px solid #e0e0e0' },
  btnDanger:    { background: '#fff', color: '#c0392b', border: '1.5px solid #f5c6c6' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#666',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  placementRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
    marginBottom: 4, border: '1.5px solid transparent',
  },
  placementRowSelected: { border: '1.5px solid #1a1a1a', background: '#f5f5f5' },
  placementRowOverlap:  { border: '1.5px solid #e74c3c', background: '#fff5f5' },
  overlapBadge: {
    background: '#ffeaea', color: '#c0392b', borderRadius: 6,
    padding: '6px 10px', fontSize: 11, fontWeight: 700, marginBottom: 12,
  },
  noPlacement: {
    fontSize: 12, color: '#aaa', textAlign: 'center', padding: '20px 0',
  },

  // ── Popup (canvas overlay) — black control colors ──────────────────────────
  popup: {
    position: 'absolute', top: 16, right: 16, width: 252,
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 16, padding: '14px 16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
    border: '1px solid #e0e0e0',
    zIndex: 10, display: 'flex', flexDirection: 'column', gap: 12,
    maxHeight: 'calc(100% - 32px)', overflowY: 'auto',
    touchAction: 'pan-y',
  },
  popupDivider: { height: 1, background: '#e8e8e8', margin: '0 -16px' },
  popupTitle: {
    fontSize: 10, fontWeight: 700, color: '#1a1a1a',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  sliderRow: { marginBottom: 10 },
  sliderLabel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 3,
  },
  sliderLabelText: { fontSize: 11, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.3 },
  sliderValue: { fontSize: 11, color: '#555', fontVariantNumeric: 'tabular-nums' },
  slider: { width: '100%', accentColor: '#1a1a1a' },
  tierBtn: {
    flex: 1, padding: '6px 4px', borderRadius: 7, border: 'none',
    cursor: 'pointer', fontFamily: "'Quicksand', sans-serif",
    fontWeight: 700, fontSize: 11,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function newPlacement(surface = 'top', overrides = {}) {
  const base = { id: crypto.randomUUID(), type: 'sphere', surface, r: 0.12, color: '#D4AF37' };
  if (surface === 'gap') {
    return { ...base, parentA: null, parentB: null, gapAngle: 0, heightOffset: 0, ...overrides };
  }
  return { ...base, thetaOffset: 0, rdInset: 0.08, yFromTop: 0.1, ...overrides };
}

function SliderControl({ label, value, min, max, step = 0.001, onChange, display }) {
  const trackRef = useRef(null);

  function clamp(v) { return Math.min(max, Math.max(min, v)); }

  function snap(v) {
    const steps = Math.round((v - min) / step);
    return clamp(min + steps * step);
  }

  function valueFromPointer(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return snap(min + ratio * (max - min));
  }

  function onPointerDown(e) {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    trackRef.current.setPointerCapture(e.pointerId);
    onChange(valueFromPointer(e));
  }

  function onPointerMove(e) {
    if (!trackRef.current.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    onChange(valueFromPointer(e));
  }

  function onPointerUp(e) {
    e.stopPropagation();
    if (trackRef.current.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
  }

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={s.sliderRow}>
      <div style={s.sliderLabel}>
        <span style={s.sliderLabelText}>{label}</span>
        <span style={s.sliderValue}>{display ?? value.toFixed(3)}</span>
      </div>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* track */}
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
        </div>
        {/* thumb */}
        <div style={{
          position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)',
          width: 16, height: 16, borderRadius: '50%',
          background: '#9b5268', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// onSave({ name, slug, placements, tier_count }) → Promise  (admin: save to DB)
// onApply(placements)                            → void     (designer: apply to canvas)
// onCancel()                                     → void     (designer: close overlay)

export default function PatternBuilder({ onSave, onApply, onCancel, tierCount: tierCountProp }) {
  const TIER_COUNT = tierCountProp ?? DEFAULT_TIER_COUNT;
  const [name,            setName]            = useState('');
  const [placements,      setPlacements]      = useState([]);
  const [selectedId,      setSelectedId]      = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState(null);
  const [savedSlug,       setSavedSlug]       = useState(null);
  const [draggingNewBall, setDraggingNewBall] = useState(false);
  const [activeTierIdx,   setActiveTierIdx]   = useState(0);
  const cursorBallRef = useRef(null);

  // Overlap detection across all tiers
  const overlappingIds = useMemo(() => {
    const ids = new Set();
    for (let i = 0; i < TIER_COUNT; i++) {
      const geom      = ALL_TIER_GEOM[i];
      const tierBalls = placements.filter(p => (p.tierId ?? 0) === i);
      const upperGeom = i + 1 < TIER_COUNT ? ALL_TIER_GEOM[i + 1] : null;
      getOverlappingIds(tierBalls, geom.topY, geom.radius, upperGeom).forEach(id => ids.add(id));
    }
    return ids;
  }, [placements]);

  const selected = placements.find(p => p.id === selectedId) ?? null;

  // ── Placement mutations ──────────────────────────────────────────────────────

  function addPlacement(surface = 'top', overrides = {}) {
    const { tierId: overrideTier, ...rest } = overrides;
    const tid       = overrideTier ?? activeTierIdx;
    const geom      = ALL_TIER_GEOM[tid] ?? ALL_TIER_GEOM[0];
    const tierBalls = placements.filter(p => (p.tierId ?? 0) === tid);
    const upperGeom = tid + 1 < TIER_COUNT ? ALL_TIER_GEOM[tid + 1] : null;

    let extra = rest;
    if (surface === 'gap') {
      const nonGap = tierBalls.filter(p => p.surface !== 'gap');
      if (nonGap.length >= 2) {
        let bestA = nonGap[0], bestB = nonGap[1], bestDist = Infinity;
        for (let i = 0; i < nonGap.length; i++) {
          for (let j = i + 1; j < nonGap.length; j++) {
            const posA = placementPosition(nonGap[i], geom.topY, geom.radius, tierBalls, upperGeom);
            const posB = placementPosition(nonGap[j], geom.topY, geom.radius, tierBalls, upperGeom);
            const dist = new THREE.Vector3().subVectors(posA, posB).length();
            if (dist < bestDist) { bestDist = dist; bestA = nonGap[i]; bestB = nonGap[j]; }
          }
        }
        extra = { parentA: bestA.id, parentB: bestB.id, ...rest };
      }
    } else {
      const autoTheta = 'thetaOffset' in rest
        ? rest.thetaOffset
        : (tierBalls.length * (Math.PI / 4)) % (Math.PI * 2) - Math.PI;
      extra = { thetaOffset: autoTheta, ...rest };
    }

    const p = newPlacement(surface, { tierId: tid, ...extra });
    setPlacements(prev => [...prev, p]);
    setSelectedId(p.id);
    if (tid !== activeTierIdx) setActiveTierIdx(tid);
  }

  function updateSelected(changes) {
    setPlacements(prev => prev.map(p => p.id === selectedId ? { ...p, ...changes } : p));
  }

  function deleteSelected() {
    setPlacements(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId(null);
  }

  // ── Canvas callbacks ─────────────────────────────────────────────────────────

  function onCakeTopClick({ thetaOffset, tierId }) {
    addPlacement('top', { thetaOffset, tierId });
  }

  function onCakeSideClick({ thetaOffset, yFromTop, tierId }) {
    addPlacement('side', { thetaOffset, yFromTop, tierId });
  }

  const onDragPlacement = useCallback((id, changes) => {
    setPlacements(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
  }, []);

  // ── New-ball drag-to-place ───────────────────────────────────────────────────

  useEffect(() => {
    if (!draggingNewBall) return;
    const onMove = e => {
      if (cursorBallRef.current) {
        cursorBallRef.current.style.left = `${e.clientX - 22}px`;
        cursorBallRef.current.style.top  = `${e.clientY - 22}px`;
      }
    };
    const onUp = () => setDraggingNewBall(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingNewBall]);

  function handleDropNewBall({ surface, thetaOffset, yFromTop, rdInset, parentA, parentB, gapAngle, tierId }) {
    if (surface === 'gap') {
      addPlacement('gap', { parentA, parentB, gapAngle, tierId });
    } else {
      addPlacement(surface, { thetaOffset, ...(surface === 'top' ? { rdInset } : { yFromTop }), tierId });
    }
    setDraggingNewBall(false);
  }

  // ── Apply (in-canvas mode) ───────────────────────────────────────────────────

  function handleApply() {
    if (overlappingIds.size > 0) { setSaveError('Fix overlapping balls before applying.'); return; }
    if (placements.length === 0) { setSaveError('Add at least one ball first.'); return; }
    onApply?.(placements);
  }

  // ── Save (admin mode) ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim())            { setSaveError('Pattern name is required.'); return; }
    if (overlappingIds.size > 0) { setSaveError('Fix overlapping balls before saving.'); return; }
    if (placements.length === 0) { setSaveError('Add at least one placement.'); return; }
    setSaving(true); setSaveError(null);
    try {
      const slug      = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const tierCount = placements.length > 0
        ? Math.max(...placements.map(p => p.tierId ?? 0)) + 1
        : 1;
      await onSave?.({ name: name.trim(), slug, placements, tier_count: tierCount });
      setSavedSlug(slug);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived for popup ────────────────────────────────────────────────────────

  const selectedGeom      = selected ? ALL_TIER_GEOM[selected.tierId ?? 0] : null;
  const selectedUpperGeom = selected && (selected.tierId ?? 0) + 1 < TIER_COUNT
    ? ALL_TIER_GEOM[(selected.tierId ?? 0) + 1] : null;
  const maxRdInset = selectedGeom
    ? Math.max(0, selectedGeom.radius - (selectedUpperGeom?.radius ?? 0) - (selected?.r ?? 0))
    : 0;

  const tierBallsForGap = placements.filter(
    p => p.surface !== 'gap' && (p.tierId ?? 0) === activeTierIdx
  );

  return (
    <div style={{ ...s.page, cursor: draggingNewBall ? 'crosshair' : 'auto' }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <p style={s.title}>Pattern Builder</p>
        </div>

        <div style={s.sidebarBody}>

          {onSave && (
            <div style={s.section}>
              <label style={s.label}>Pattern name</label>
              <input
                style={s.input} value={name}
                onChange={e => { setName(e.target.value); setSavedSlug(null); }}
                placeholder="e.g. Gold Cluster"
              />
            </div>
          )}

          <div style={s.section}>
            <div style={s.sectionTitle}>Drag to place</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                onMouseDown={e => {
                  e.preventDefault();
                  if (cursorBallRef.current) {
                    cursorBallRef.current.style.left = `${e.clientX - 22}px`;
                    cursorBallRef.current.style.top  = `${e.clientY - 22}px`;
                  }
                  setDraggingNewBall(true);
                }}
                style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'radial-gradient(circle at 38% 32%, #f8e88a, #D4AF37 55%, #7a6010)',
                  cursor: draggingNewBall ? 'grabbing' : 'grab',
                  boxShadow: '0 3px 10px rgba(212,175,55,0.45), inset 0 -3px 8px rgba(0,0,0,0.2)',
                  userSelect: 'none',
                }}
              />
              <span style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                Drop on any tier — position decides top, side, or gap
              </span>
            </div>
          </div>

          <div style={{ ...s.section, display: 'flex', gap: 8 }}>
            <button style={{ ...s.btn, ...s.btnSecondary, flex: 1 }} onClick={() => addPlacement('top')}>+ Top</button>
            <button style={{ ...s.btn, ...s.btnSecondary, flex: 1 }} onClick={() => addPlacement('side')}>+ Side</button>
            <button
              style={{ ...s.btn, ...s.btnSecondary, flex: 1 }}
              disabled={tierBallsForGap.length < 2}
              onClick={() => addPlacement('gap')}
            >+ Gap</button>
          </div>

          {overlappingIds.size > 0 && (
            <div style={s.overlapBadge}>
              ⚠ {overlappingIds.size} ball{overlappingIds.size > 1 ? 's' : ''} overlapping
            </div>
          )}

          <div style={s.section}>
            <div style={s.sectionTitle}>Placements ({placements.length})</div>
            {placements.length === 0 && (
              <div style={s.noPlacement}>Drag a ball onto the cake to start</div>
            )}
            {placements.map((p, i) => {
              const isSelected = p.id === selectedId;
              const isOverlap  = overlappingIds.has(p.id);
              return (
                <div
                  key={p.id}
                  style={{ ...s.placementRow, ...(isSelected ? s.placementRowSelected : {}), ...(isOverlap ? s.placementRowOverlap : {}) }}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color ?? '#D4AF37', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#444', flex: 1 }}>
                    Ball {i + 1} · T{(p.tierId ?? 0) + 1} · {p.surface}
                  </span>
                  {isOverlap && <span style={{ fontSize: 10, color: '#e74c3c' }}>overlap</span>}
                </div>
              );
            })}
          </div>

        </div>

        <div style={s.sidebarFooter}>
          {saveError && <div style={{ fontSize: 11, color: '#c0392b', fontWeight: 700 }}>{saveError}</div>}
          {savedSlug && <div style={{ fontSize: 11, color: '#27ae60', fontWeight: 700 }}>✓ Saved as "{savedSlug}"</div>}

          {/* Apply-to-canvas mode */}
          {onApply && (
            <>
              <button
                style={{ ...s.btn, ...s.btnPrimary, opacity: (overlappingIds.size > 0 || placements.length === 0) ? 0.5 : 1 }}
                disabled={overlappingIds.size > 0 || placements.length === 0}
                onClick={handleApply}
              >
                Apply to Cake
              </button>
              {onCancel && (
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onCancel}>
                  Cancel
                </button>
              )}
            </>
          )}

          {/* Save-to-DB mode (admin) */}
          {onSave && (
            <button
              style={{ ...s.btn, ...s.btnPrimary, opacity: (saving || overlappingIds.size > 0 || !name.trim()) ? 0.5 : 1 }}
              disabled={saving || overlappingIds.size > 0 || !name.trim()}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save Pattern'}
            </button>
          )}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={s.canvasWrap}>
        <PatternBuilderCanvas
          placements={placements}
          selectedId={selectedId}
          onSelectPlacement={setSelectedId}
          onCakeTopClick={onCakeTopClick}
          onCakeSideClick={onCakeSideClick}
          onDragPlacement={onDragPlacement}
          draggingNewBall={draggingNewBall}
          onDropNewBall={handleDropNewBall}
          tierCount={TIER_COUNT}
          activeTierIdx={activeTierIdx}
        />

        {/* ── Floating popup ── */}
        <div
          style={s.popup}
          onPointerDown={e => e.stopPropagation()}
          onPointerMove={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
        >

          {/* Tier selector — always visible */}
          <div style={selected ? { paddingBottom: 12, borderBottom: '1px solid #e8e8e8' } : {}}>
            <div style={s.popupTitle}>Active tier</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: TIER_COUNT }, (_, i) => (
                <button
                  key={i}
                  style={{ ...s.tierBtn, ...(activeTierIdx === i ? s.btnPrimary : s.btnSecondary) }}
                  onClick={() => setActiveTierIdx(i)}
                >
                  T{i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Ball controls — when selected */}
          {selected && selectedGeom && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={s.popupTitle}>
                  Edit ball {placements.findIndex(p => p.id === selectedId) + 1}
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  style={{ background: '#f0f0f0', border: 'none', width: 24, height: 24, borderRadius: '50%', fontSize: 11, cursor: 'pointer', color: '#333', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
              </div>

              {/* Gap controls */}
              {selected.surface === 'gap' && (() => {
                const tierBalls = placements.filter(p => p.surface !== 'gap' && (p.tierId ?? 0) === (selected.tierId ?? 0));
                return (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label style={s.label}>Parent A</label>
                      <select style={s.select} value={selected.parentA ?? ''} onChange={e => updateSelected({ parentA: e.target.value || null })}>
                        <option value="">— pick a ball —</option>
                        {tierBalls.map(p => <option key={p.id} value={p.id} disabled={p.id === selected.parentB}>Ball {placements.findIndex(x => x.id === p.id) + 1}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={s.label}>Parent B</label>
                      <select style={s.select} value={selected.parentB ?? ''} onChange={e => updateSelected({ parentB: e.target.value || null })}>
                        <option value="">— pick a ball —</option>
                        {tierBalls.map(p => <option key={p.id} value={p.id} disabled={p.id === selected.parentA}>Ball {placements.findIndex(x => x.id === p.id) + 1}</option>)}
                      </select>
                    </div>
                    {selected.parentA && selected.parentB && (
                      <>
                        <SliderControl label="Rotate around axis" value={selected.gapAngle ?? 0} min={-Math.PI} max={Math.PI} step={0.01} onChange={v => updateSelected({ gapAngle: v })} display={`${((selected.gapAngle ?? 0) * 180 / Math.PI).toFixed(1)}°`} />
                        <SliderControl label="Height offset" value={selected.heightOffset ?? 0} min={-0.5} max={0.8} step={0.005} onChange={v => updateSelected({ heightOffset: v })} display={`${(selected.heightOffset ?? 0) >= 0 ? '+' : ''}${(selected.heightOffset ?? 0).toFixed(3)}`} />
                      </>
                    )}
                    {(!selected.parentA || !selected.parentB) && (
                      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Select both parents to position this ball.</div>
                    )}
                  </>
                );
              })()}

              {/* Top / Side controls */}
              {selected.surface !== 'gap' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={s.label}>Surface</label>
                    <select style={s.select} value={selected.surface} onChange={e => updateSelected({ surface: e.target.value })}>
                      <option value="top">Top</option>
                      <option value="side">Side</option>
                    </select>
                  </div>
                  <SliderControl label="Angle" value={selected.thetaOffset} min={-Math.PI} max={Math.PI} step={0.01} onChange={v => updateSelected({ thetaOffset: v })} display={`${(selected.thetaOffset * 180 / Math.PI).toFixed(1)}°`} />
                  {selected.surface === 'top' && (
                    <SliderControl label="Inset from rim" value={Math.min(selected.rdInset, maxRdInset)} min={0} max={maxRdInset} step={0.001} onChange={v => updateSelected({ rdInset: v })} />
                  )}
                  {selected.surface === 'side' && (
                    <SliderControl label="Drop below top" value={selected.yFromTop} min={0} max={selectedGeom.height - selected.r} step={0.001} onChange={v => updateSelected({ yFromTop: v })} />
                  )}
                </>
              )}

              <SliderControl label="Radius" value={selected.r} min={0.02} max={0.3} step={0.001} onChange={v => updateSelected({ r: v })} />

              <div style={{ marginBottom: 10 }}>
                <label style={s.label}>Color</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={selected.color ?? '#D4AF37'} onChange={e => updateSelected({ color: e.target.value })}
                    style={{ width: 40, height: 32, border: '1.5px solid #e0e0e0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  <span style={{ fontSize: 12, color: '#555' }}>{selected.color ?? '#D4AF37'}</span>
                </div>
              </div>

              <button style={{ ...s.btn, ...s.btnDanger, width: '100%' }} onClick={deleteSelected}>
                Delete ball
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating ball cursor during drag */}
      <div
        ref={cursorBallRef}
        style={{
          display: draggingNewBall ? 'block' : 'none',
          position: 'fixed', left: -100, top: -100,
          width: 44, height: 44, borderRadius: '50%',
          background: 'radial-gradient(circle at 38% 32%, #f8e88a, #D4AF37 55%, #7a6010)',
          pointerEvents: 'none', zIndex: 9999, opacity: 0.8,
          boxShadow: '0 4px 14px rgba(212,175,55,0.55)',
        }}
      />
    </div>
  );
}
