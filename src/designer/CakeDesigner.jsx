import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import CakeCanvas, { CakeThumbnailCanvas, preloadTopper } from './canvas/CakeCanvas';
import { useCakeDesign } from './hooks/useCakeDesign';

// Tier caps are hardcoded — tiers are not element_types rows, they're the cake structure itself
const TIER_CAPS   = { color: true, resize: false, style: false, fontSize: false, duplicate: false, delete: false };
const TOPPER_CAPS = { resize: true, delete: true };

function hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(155,95,114,${alpha})`;
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

const TIER_LABELS = ['Bottom Tier', '2nd Tier', '3rd Tier', 'Top Tier'];

// ── Color picker (react-colorful) ─────────────────────────────────────────────
function ColorWheel({ color, onChange }) {
  // Common cake piping colour presets
  const PRESETS = [
    '#ffffff','#f5e6c8','#f5b8c8','#e8a0b0','#c8b5e8',
    '#b5c8e8','#b5e8d5','#f0c040','#e87040','#5c3d2e',
    '#3e2010','#1a1a1a','#d4af37','#8b1a1a','#2e5c3e',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <HexColorPicker color={color} onChange={onChange} style={{ width: 216, height: 180 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: 216 }}>
        {PRESETS.map(c => (
          <div key={c} onClick={() => onChange(c)} style={{
            width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
            border: color === c ? '2.5px solid #9b5f72' : '1.5px solid #e0d0d5',
            boxSizing: 'border-box', flexShrink: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Zone label map ────────────────────────────────────────────────────────────
const ZONE_LABELS = {
  top_edge:     'Top',
  bottom_board: 'Base',
  top_surface:  'Top surface',
  side:         'Side',
  side_edge:    'Side edge',
};


// TOPPERS + PIPING STYLES are loaded from Supabase cake_elements table

// ── Per-element-type card in the elements panel ───────────────────────────────
function ElementTypeCard({
  elementType, design, toppersDb = [], scatteredDecorElements = [], selectedPiping,
  onTopPipingSelect, onBottomPipingSelect,
  onAddTopPiping, onAddBottomPiping,
  onRemoveTopPiping, onRemoveBottomPiping,
  onSetTopper, onDragStartSticker, onDragStartTopper,
}) {
  const { slug, name, placement_rules: pr } = elementType;
  const zones = pr?.zones ?? [];

  // ── cream_piping — zone selector per tier ──────────────────────────────────
  if (slug === 'cream_piping') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>

        {design.tiers.map((tier, i) => (
          <div key={i} style={{ width: '100%', borderTop: '1px solid #f0dce3', paddingTop: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              {TIER_LABELS[i]}
            </div>

            {/* top_edge zone */}
            {zones.includes('top_edge') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={s.tierCheckLabel}>{ZONE_LABELS.top_edge}</span>
                <div style={{ flex: 1 }} />
                {tier.topPiping ? (
                  <>
                    <div onClick={() => onTopPipingSelect(i)}
                      style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 2.5, boxSizing: 'border-box' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: tier.topPiping.color }} />
                    </div>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: '#e53935', fontWeight: 700 }}
                      onClick={() => onRemoveTopPiping(i)}>×</button>
                  </>
                ) : (
                  <button onClick={() => onAddTopPiping(i)}
                    style={{ fontSize: 10, fontWeight: 700, color: '#333', background: '#fdf0f5', border: '1.5px solid #f0dce3', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>
                    + Add
                  </button>
                )}
              </div>
            )}

            {/* bottom_board zone */}
            {zones.includes('bottom_board') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={s.tierCheckLabel}>{ZONE_LABELS.bottom_board}</span>
                <div style={{ flex: 1 }} />
                {tier.bottomPiping ? (
                  <>
                    <div onClick={() => onBottomPipingSelect(i)}
                      style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 2.5, boxSizing: 'border-box' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: tier.bottomPiping.color }} />
                    </div>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: '#e53935', fontWeight: 700 }}
                      onClick={() => onRemoveBottomPiping(i)}>×</button>
                  </>
                ) : (
                  <button onClick={() => onAddBottomPiping(i)}
                    style={{ fontSize: 10, fontWeight: 700, color: '#333', background: '#fdf0f5', border: '1.5px solid #f0dce3', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>
                    + Add
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── topper — pick from DB-driven GLB toppers ──────────────────────────────
  if (slug === 'topper') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        {toppersDb.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No toppers yet</div>
        )}
        {toppersDb.map(t => {
          const isActive = design.topper?.id === t.id;
          return (
            <div key={t.id} style={{ width: '100%', borderTop: '1px solid #f0dce3', paddingTop: 8, paddingBottom: 2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                {/* Thumbnail */}
                <div style={{
                  width: 80, height: 80, borderRadius: 10,
                  background: '#fff',
                  border: `2px solid ${isActive ? '#9b5f72' : '#f0dce3'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'grab', touchAction: 'none',
                  boxShadow: isActive ? '0 0 0 2px rgba(155,95,114,0.2)' : 'none',
                }}
                  onClick={() => onSetTopper(isActive ? null : t)}
                  onPointerDown={e => { e.preventDefault(); onDragStartTopper?.(t, e.clientX, e.clientY); }}
                >
                  {t.thumbnail_url
                    ? <img src={t.thumbnail_url} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    : null
                  }
                </div>
                {/* Label + action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ ...s.tierCheckLabel, flex: 1, textAlign: 'center' }}>{t.name}</span>
                  {isActive && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: '#e53935', fontWeight: 700 }}
                      onClick={() => onSetTopper(null)}>×</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── scattered_decor — PNG stickers placeable on any zone ──────────────────
  if (slug === 'scattered_decor') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
        {scatteredDecorElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No elements yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {scatteredDecorElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => {
                e.preventDefault();
                onDragStartSticker?.(el, e.clientX, e.clientY);
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                background: '#fff',
                border: '1.5px solid #f0dce3',
              }}>
                {el.thumbnail_url && <img src={el.thumbnail_url} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── All other types — coming soon placeholder ──────────────────────────────
  return (
    <div style={{ ...s.elementCard, cursor: 'default', opacity: 0.55 }}>
      <div style={s.elementCardLabel}>{name}</div>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 0.5, textAlign: 'center' }}>
        {zones.map(z => ZONE_LABELS[z] ?? z).join(' · ')}
      </div>
      <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>Coming soon</div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
function GearIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function UserIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TemplatesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {/* Flame */}
      <path d="M12 2 C11 3 10.5 4.5 12 5.2 C13.5 4.5 13 3 12 2Z" />
      {/* Candle */}
      <line x1="12" y1="5.2" x2="12" y2="8" />
      {/* Top tier */}
      <rect x="5" y="8" width="14" height="6" rx="2" />
      {/* Bottom tier */}
      <rect x="2" y="14" width="20" height="8" rx="2" />
    </svg>
  );
}

function ElementsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function TextIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

// ── Sidebar tooltip ───────────────────────────────────────────────────────────
function SidebarTooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {children}
      <div style={{
        position: 'absolute',
        left: 'calc(100% + 12px)',
        top: '50%',
        background: '#18191b',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 10px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 200,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        fontFamily: "'Quicksand', sans-serif",
        letterSpacing: 0.3,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(-4px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Change password modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose, brandBtn, supabase, apiClient }) {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    if (form.newPassword !== form.confirmPassword) {
      setMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    if (form.newPassword.length < 8) {
      setMsg({ ok: false, text: 'Password must be at least 8 characters.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      if (apiClient?.changePassword) {
        await apiClient.changePassword(form.newPassword);
      } else if (supabase) {
        const { error } = await supabase.auth.updateUser({ password: form.newPassword });
        if (error) throw error;
      }
      setMsg({ ok: true, text: 'Password updated. Signing you out…' });
      // Supabase invalidates the session on password change — sign out cleanly
      // so the user lands on the login screen and re-authenticates with the new password.
      setTimeout(() => {
        apiClient?.signOut?.() ?? supabase?.auth.signOut();
      }, 1200);
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Failed to update password.' });
      setLoading(false);
    }
  }

  const canSubmit = form.newPassword && form.confirmPassword && !loading;

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Change Password</span>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>New password</span>
          <input style={s.modalInput} type="password" value={form.newPassword}
            onChange={e => setField('newPassword', e.target.value)} disabled={loading} autoFocus />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Confirm new password</span>
          <input style={s.modalInput} type="password" value={form.confirmPassword}
            onChange={e => setField('confirmPassword', e.target.value)} disabled={loading}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()} />
        </label>
        {msg && (
          <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#2e7d52' : '#e53935' }}>
            {msg.text}
          </div>
        )}
        <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
          disabled={!canSubmit} onClick={handleSubmit}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

// ── Add team member modal ──────────────────────────────────────────────────────
function AddUserModal({ onClose, brandBtn }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'staff' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    setLoading(true); setMsg(null);
    // TODO: POST /api/baker/invite-user
    await new Promise(r => setTimeout(r, 600));
    setMsg({ ok: true, text: 'Invitation sent successfully.' });
    setLoading(false);
  }

  const canSubmit = form.firstName.trim() && form.email.trim() && !loading;

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Add Team Member</span>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={s.fieldLabel}>First name</span>
            <input style={s.modalInput} value={form.firstName} onChange={e => setField('firstName', e.target.value)} disabled={loading} />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={s.fieldLabel}>Last name</span>
            <input style={s.modalInput} value={form.lastName} onChange={e => setField('lastName', e.target.value)} disabled={loading} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Email</span>
          <input style={s.modalInput} type="email" value={form.email} onChange={e => setField('email', e.target.value)} disabled={loading} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={s.fieldLabel}>Role</span>
          <select style={{ ...s.modalInput, background: '#fff' }} value={form.role} onChange={e => setField('role', e.target.value)} disabled={loading}>
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        {msg && (
          <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#2e7d52' : '#e53935' }}>{msg.text}</div>
        )}
        <button style={{ ...s.orderBtn, ...(brandBtn || {}), marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
          disabled={!canSubmit} onClick={handleSubmit}>
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </div>
  );
}

// ── Main designer ─────────────────────────────────────────────────────────────
export default function CakeDesigner({ apiClient, supabase, thumbnailBucket = 'cake-thumbnails', onOrder, onSaveTemplate }) {
  const { design, setTierColor, setTopPiping, setBottomPiping, addText, updateText, duplicateText, removeText, addSticker, updateSticker, removeSticker, duplicateSticker, setTopper, setTopperScale, loadDesign, canvasConfig } = useCakeDesign();
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementTypes, setElementTypes] = useState([]);
  const [elementTypesLoading, setElementTypesLoading] = useState(false);
  const [toppersDb, setToppersDb] = useState([]);
  const [scatteredDecorDb, setScatteredDecorDb] = useState([]);
  const [pipingStylesDb, setPipingStylesDb] = useState([]);
  const [activeElementTypeIds, setActiveElementTypeIds] = useState(new Set());

  // Capabilities fetched eagerly on mount so edit controls work
  // even before the elements panel is opened (e.g. text, piping selected directly)
  const allowedActionsBySlug = useMemo(() => {
    const m = {};
    elementTypes.forEach(et => { m[et.slug] = et.default_allowed_actions ?? {}; });
    return m;
  }, [elementTypes]);

  // ── Unified selection: null | { type, ...props } ──────────────────────────
  // type 'tier':   { index }
  // type 'piping': { tierIndex, zone: 'top'|'bottom' }
  // type 'text':   { id }
  // type 'topper': {}
  const [selectedEl, setSelectedEl] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);

  // Derived for backward-compat with canvas props
  const selectedTier     = selectedEl?.type === 'tier'    ? selectedEl.index : null;
  const selectedPiping   = selectedEl?.type === 'piping'  ? selectedEl       : null;
  const selectedTextId   = selectedEl?.type === 'text'    ? selectedEl.id    : null;
  const selectedStickerId = selectedEl?.type === 'sticker' ? selectedEl.id   : null;
  const STICKER_CAPS = { resize: true, delete: true, color: false, duplicate: true };
  const caps = selectedEl
    ? (selectedEl.type === 'tier'    ? TIER_CAPS
     : selectedEl.type === 'topper'  ? TOPPER_CAPS
     : selectedEl.type === 'sticker' ? (design.stickers.find(s => s.id === selectedEl.id)?.allowedActions ?? STICKER_CAPS)
     : (allowedActionsBySlug[selectedEl.type] ?? null))
    : null;

  // pipingTarget: { tierIndex, zone } — triggers in-canvas style picker
  const [pipingTarget, setPipingTarget] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [saveModal, setSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateOffering, setTemplateOffering] = useState('standard');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const hasEdited = useRef(false);
  const textInputRef = useRef();
  const thumbContainerRef = useRef();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [addUserModal,        setAddUserModal]        = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [bakerReady,          setBakerReady]          = useState(false);
  const [bakerData,    setBakerData]    = useState(null);
  const [userData,     setUserData]     = useState(null);
  const settingsRef      = useRef(null);
  const profileRef       = useRef(null);
  const hitTestRef       = useRef(null);
  const dragStickerRef   = useRef(null);  // element being pointer-dragged
  const [dragGhost, setDragGhost] = useState(null); // { x, y, el } for floating preview

  const primaryColor = bakerData?.primary_color || '#1a1a1a';
  const accentColor  = bakerData?.accent_color  || '#333333';
  const brandBtn = {
    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
    boxShadow: `0 4px 16px ${hexToRgba(primaryColor, 0.25)}`,
  };
  const brandActive = {
    background: hexToRgba(primaryColor, 0.1),
    color: primaryColor,
  };
  const initials = userData
    ? `${(userData.firstName || '')[0] || ''}${(userData.lastName || '')[0] || ''}`.toUpperCase() || '?'
    : '?';

  useEffect(() => {
    if (apiClient?.fetchBakerProfile) {
      apiClient.fetchBakerProfile()
        .then(({ baker, user }) => {
          if (baker) setBakerData(baker);
          if (user)  setUserData(user);
        })
        .catch(() => {})
        .finally(() => setBakerReady(true));
      return;
    }
    if (!supabase) { setBakerReady(true); return; }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setBakerReady(true); return; }
      const { data: contact } = await supabase
        .from('baker_appusers')
        .select('first_name, last_name, baker_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!contact) { setBakerReady(true); return; }
      setUserData({ firstName: contact.first_name, lastName: contact.last_name, email: session.user.email });
      const { data: baker } = await supabase
        .from('bakers')
        .select('id, name, logo_url')
        .eq('id', contact.baker_id)
        .single();
      if (baker) setBakerData(baker);
      setBakerReady(true);
    });
  }, [supabase, apiClient]);

  useEffect(() => {
    function onMouseDown(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false);
      if (profileRef.current  && !profileRef.current.contains(e.target))  setProfileOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSaving(true);
    setSaveMsg(null);

    // Capture from the off-screen thumbnail canvas (no floor, transparent bg)
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const thumbnailBlob = await new Promise(resolve => {
      if (!thumbCanvas) return resolve(null);
      thumbCanvas.toBlob(blob => resolve(blob ?? null), 'image/png');
    });

    // Build design JSON
    const designJson = {
      shape: 'round',
      tiers: design.tiers.map(t => ({
        color:        t.color,
        topPiping:    t.topPiping    ?? null,
        bottomPiping: t.bottomPiping ?? null,
        decorations:  [],
        texts:        [],
        ...(t.radius != null && { radius: t.radius }),
        ...(t.height != null && { height: t.height }),
      })),
      texts:    design.texts,
      stickers: design.stickers,
      topper:   design.topper ?? null,
    };

    if (onSaveTemplate) {
      try {
        await onSaveTemplate({
          name:      templateName.trim(),
          offering:  templateOffering,
          tierCount: design.tiers.length,
          designJson,
          thumbnailBlob,
        });
        setSaveMsg({ ok: true, text: 'Template saved!' });
        setTimeout(() => { setSaveModal(false); setSaveMsg(null); setTemplateName(''); }, 1200);
      } catch (err) {
        setSaveMsg({ ok: false, text: err.message });
      }
      setSaving(false);
      return;
    }

    // Upload thumbnail to R2 via signed URL
    let thumbnail_url = null;
    if (thumbnailBlob && apiClient?.getSignedUploadUrl) {
      try {
        const filename = `${crypto.randomUUID()}.png`;
        const { url, key } = await apiClient.getSignedUploadUrl('templates/thumbnails', filename, 'image/png');
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: thumbnailBlob });
        thumbnail_url = key;
      } catch (_) { /* thumbnail upload failure is non-fatal */ }
    }

    const { error } = await supabase.from('cake_templates').insert({
      name: templateName.trim(),
      shape: 'round',
      tier_count: design.tiers.length,
      offering: templateOffering,
      design: designJson,
      thumbnail_url,
      is_active: true,
      sort_order: 0,
    });

    setSaving(false);
    if (error) {
      setSaveMsg({ ok: false, text: error.message });
    } else {
      setSaveMsg({ ok: true, text: 'Template saved!' });
      setTimeout(() => { setSaveModal(false); setSaveMsg(null); setTemplateName(''); }, 1200);
    }
  }

  // Eager load element_types (with allowed_actions) on mount so edit controls
  // are available immediately — before the elements panel is ever opened.
  useEffect(() => {
    if (apiClient) {
      apiClient.fetchElementTypes().then(data => { if (data) setElementTypes(data); });
    } else {
      supabase
        .from('element_types')
        .select('id, slug, name, placement_rules, sort_order, default_allowed_actions')
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data }) => { if (data) setElementTypes(data); });
    }
  }, []);

  async function openElements() {
    const opening = !elementsOpen;
    setElementsOpen(opening);
    setTemplatesOpen(false);
    // Lazy-load top-level cake_elements when panel first opens
    if (opening && toppersDb.length === 0 && scatteredDecorDb.length === 0) {
      setElementTypesLoading(true);
      let rows = [];
      if (apiClient) {
        rows = await apiClient.fetchElements({ parentsOnly: true });
      } else {
        const { data: topLevelData } = await supabase
          .from('cake_elements')
          .select('id, name, image_url, thumbnail_url, allowed_zones, placement_config, sort_order, element_type_id')
          .is('parent_id', null)
          .eq('is_active', true)
          .order('sort_order');
        rows = topLevelData ?? [];
      }
      setActiveElementTypeIds(new Set(rows.map(r => r.element_type_id)));
      const topperTypeId        = elementTypes.find(et => et.slug === 'topper')?.id;
      const scatteredDecorTypeId = elementTypes.find(et => et.slug === 'scattered_decor')?.id;
      setToppersDb(rows.filter(r => r.element_type_id === topperTypeId));
      setScatteredDecorDb(rows.filter(r => r.element_type_id === scatteredDecorTypeId));
      setElementTypesLoading(false);
    }
  }

  async function openTemplates() {
    const isOpening = !templatesOpen;
    setTemplatesOpen(isOpening);
    setElementsOpen(false);
    if (!isOpening) return;
    setTemplatesLoading(true);
    if (apiClient) {
      const data = await apiClient.fetchTemplates().catch(() => []);
      setTemplates(data ?? []);
    } else {
      const { data, error } = await supabase
        .from('cake_templates')
        .select('id, name, offering, tier_count, thumbnail_url, created_at')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at', { ascending: false });
      setTemplates(error ? [] : data);
    }
    setTemplatesLoading(false);
  }

  function stopRotatingOnFirstEdit() {
    if (!hasEdited.current) {
      hasEdited.current = true;
      setAutoRotate(false);
    }
  }

  const selectedText = design.texts.find(t => t.id === selectedTextId) ?? null;

  // ── Color helpers ─────────────────────────────────────────────────────────
  function getCurrentColor() {
    if (!selectedEl) return '#f5b8c8';
    if (selectedEl.type === 'tier') return design.tiers[selectedEl.index]?.color ?? '#f5b8c8';
    if (selectedEl.type === 'piping') {
      const t = design.tiers[selectedEl.tierIndex];
      return (selectedEl.zone === 'top' ? t?.topPiping?.color : t?.bottomPiping?.color) ?? '#f5e6c8';
    }
    if (selectedEl.type === 'text') return selectedText?.color ?? '#ffffff';
    if (selectedEl.type === 'sticker') return design.stickers.find(s => s.id === selectedEl.id)?.color ?? '#ffffff';
    return '#f5b8c8';
  }

  function handleColorChange(c) {
    if (!selectedEl) return;
    if (selectedEl.type === 'tier') { setTierColor(selectedEl.index, c); return; }
    if (selectedEl.type === 'piping') {
      const { tierIndex, zone } = selectedEl;
      if (zone === 'top') { const p = design.tiers[tierIndex]?.topPiping; if (p) setTopPiping(tierIndex, { ...p, color: c }); }
      else { const p = design.tiers[tierIndex]?.bottomPiping; if (p) setBottomPiping(tierIndex, { ...p, color: c }); }
      return;
    }
    if (selectedEl.type === 'text') updateText(selectedEl.id, { color: c });
    if (selectedEl.type === 'sticker') updateSticker(selectedEl.id, { color: c });
  }

  function handleDelete() {
    if (!selectedEl) return;
    if (selectedEl.type === 'piping') {
      if (selectedEl.zone === 'top') setTopPiping(selectedEl.tierIndex, null);
      else setBottomPiping(selectedEl.tierIndex, null);
    } else if (selectedEl.type === 'text') {
      removeText(selectedEl.id);
    } else if (selectedEl.type === 'sticker') {
      removeSticker(selectedEl.id);
    } else if (selectedEl.type === 'topper') {
      setTopper(null);
    }
    setSelectedEl(null);
    setColorOpen(false);
  }

  // ── Selection handlers ────────────────────────────────────────────────────
  function clearAllSelections() {
    setSelectedEl(null);
    setColorOpen(false);
  }

  function handleDeselect() { clearAllSelections(); }

  function handleTierClick(i) {
    stopRotatingOnFirstEdit();
    setSelectedEl(prev => (prev?.type === 'tier' && prev.index === i) ? null : { type: 'tier', index: i });
    setColorOpen(false);
  }

  function handleTextSelect(id) {
    stopRotatingOnFirstEdit();
    setSelectedEl({ type: 'text', id });
    setColorOpen(false);
  }

  function handleTopPipingSelect(tierIndex) {
    stopRotatingOnFirstEdit();
    setSelectedEl({ type: 'piping', tierIndex, zone: 'top' });
    setColorOpen(false);
  }

  function handleBottomPipingSelect(tierIndex) {
    stopRotatingOnFirstEdit();
    setSelectedEl({ type: 'piping', tierIndex, zone: 'bottom' });
    setColorOpen(false);
  }

  function handleTopperClick() {
    if (!design.topper) return;
    stopRotatingOnFirstEdit();
    setSelectedEl(prev => prev?.type === 'topper' ? null : { type: 'topper' });
    setColorOpen(false);
  }

  function handleStickerSelect(id) {
    stopRotatingOnFirstEdit();
    setSelectedEl(prev => prev?.type === 'sticker' && prev.id === id ? null : { type: 'sticker', id });
    setColorOpen(false);
  }

  function handleStickerMove(id, changes) {
    updateSticker(id, changes);
  }

  function handleElementDrop(element, hit) {
    stopRotatingOnFirstEdit();
    const placementMode = element.placement_config?.[hit.zone] ?? 'hug';
    addSticker(element, hit.zone, hit.tierIndex, placementMode, hit);
    setElementsOpen(false);
  }

  function startTopperDrag(topper, startX, startY) {
    setDragGhost({ x: startX, y: startY, el: topper });
    function onMove(e) {
      setDragGhost({ x: e.clientX, y: e.clientY, el: topper });
    }
    function onUp(e) {
      setDragGhost(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      if (hit) {
        if (topper.image_url) preloadTopper(topper.image_url);
        setTopper(topper);
        setSelectedEl({ type: 'topper' });
        stopRotatingOnFirstEdit();
        setElementsOpen(false);
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function startStickerDrag(el, startX, startY) {
    dragStickerRef.current = el;
    setDragGhost({ x: startX, y: startY, el });

    function onMove(e) {
      setDragGhost({ x: e.clientX, y: e.clientY, el });
    }
    function onUp(e) {
      setDragGhost(null);
      dragStickerRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const hit = hitTestRef.current?.(e.clientX, e.clientY);
      if (hit) handleElementDrop(el, hit);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handlePipingStyleSelect(element) {
    if (!pipingTarget) return;
    const { tierIndex, zone } = pipingTarget;
    const piping = { id: element.id, glbUrl: element.glbUrl, name: element.name, color: '#f5e6c8' };
    if (zone === 'top') setTopPiping(tierIndex, piping);
    else setBottomPiping(tierIndex, piping);
    setPipingTarget(null);
  }

  useEffect(() => {
    if (selectedEl?.type === 'text' && textInputRef.current) {
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  }, [selectedEl?.type === 'text' ? selectedEl.id : null]);

  // Lazy-load piping styles from DB the first time the picker is triggered
  useEffect(() => {
    if (pipingTarget && pipingStylesDb.length === 0) {
      if (apiClient) {
        const pipingTypeId = elementTypes.find(et => et.slug === 'cream_piping')?.id;
        if (pipingTypeId) {
          apiClient.fetchElements({ elementTypeId: pipingTypeId })
            .then(data => setPipingStylesDb(data ?? []));
        }
      } else {
        supabase
          .from('cake_elements')
          .select('id, name, image_url, sort_order')
          .eq('element_type_id', '2f718ccd-64e1-4941-b5f9-72133f77c04c')
          .eq('is_active', true)
          .order('sort_order')
          .then(({ data }) => setPipingStylesDb(data ?? []));
      }
    }
  }, [pipingTarget]);

  function handleOrder() {
    const canvas = document.querySelector('canvas');
    onOrder({ design, imageData: canvas?.toDataURL('image/png') ?? null });
  }

  const tierPanelVisible = selectedEl?.type === 'tier';
  const currentColor = getCurrentColor();
  // Right panel shows when: tier selected (always), or color picker opened, or topper selected (resize)
  const showRightPanel = tierPanelVisible
    || (caps?.color && colorOpen)
    || (selectedEl?.type === 'sticker' && caps?.resize);

  // ── Caps-driven floating toolbar (text + piping) ──────────────────────────
  function buildToolbar(el) {
    if (!el) return null;
    const c = el.type === 'tier'    ? TIER_CAPS
            : el.type === 'topper'  ? TOPPER_CAPS
            : el.type === 'sticker' ? (design.stickers.find(s => s.id === el.id)?.allowedActions ?? STICKER_CAPS)
            : (allowedActionsBySlug[el.type] ?? null);
    if (!c) return null;
    const items = [];

    if (c.color) {
      items.push(
        <button key="color"
          style={{ ...s.swatchBtn, background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)', padding: 3, border: colorOpen ? '2.5px solid #6c47ff' : 'none' }}
          onClick={() => setColorOpen(o => !o)}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: getCurrentColor() }} />
        </button>,
        <div key="d1" style={s.tbDivider} />
      );
    }

    if (c.style && el.type === 'piping') {
      items.push(
        <button key="style" style={{ ...s.tbIconBtn, fontSize: 10, letterSpacing: 0.3 }}
          onClick={() => { setPipingTarget({ tierIndex: el.tierIndex, zone: el.zone }); clearAllSelections(); }}>
          Style
        </button>,
        <div key="d2" style={s.tbDivider} />
      );
    }

    if (c.fontSize && el.type === 'text') {
      const fs = selectedText?.fontSize ?? 0.2;
      items.push(
        <button key="fs-" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.max(0.10, +((fs) - 0.03).toFixed(2)) })}>−</button>,
        <span key="fs-val" style={s.tbSizeLabel}>{Math.round(fs * 100)}</span>,
        <button key="fs+" style={s.tbIconBtn} onClick={() => updateText(el.id, { fontSize: Math.min(0.45, +((fs) + 0.03).toFixed(2)) })}>+</button>,
        <div key="d3" style={s.tbDivider} />
      );
    }

    if (c.resize && el.type === 'topper') {
      const sc = design.topper?.scale ?? 1;
      items.push(
        <button key="tp-" style={s.tbIconBtn} onClick={() => setTopperScale(Math.max(0.25, +(sc - 0.15).toFixed(2)))}>−</button>,
        <button key="tp+" style={s.tbIconBtn} onClick={() => setTopperScale(Math.min(4, +(sc + 0.15).toFixed(2)))}>+</button>,
        <div key="d-tp" style={s.tbDivider} />
      );
    }

    if (c.resize && el.type === 'sticker') {
      const sc = design.stickers.find(s => s.id === el.id)?.scale ?? 1;
      items.push(
        <button key="sc-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { scale: Math.max(0.25, +(sc - 0.15).toFixed(2)) })}>−</button>,
        <button key="sc+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { scale: Math.min(6, +(sc + 0.15).toFixed(2)) })}>+</button>,
        <div key="d4" style={s.tbDivider} />
      );
    }

    if (c.duplicate && el.type === 'text') {
      items.push(
        <button key="dup" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateText(el.id); setSelectedEl(null); }}>Duplicate</button>
      );
    }

    if (c.duplicate && el.type === 'sticker') {
      items.push(
        <button key="dup-sticker" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateSticker(el.id); setSelectedEl(null); }}>Duplicate</button>
      );
    }

    if (c.delete) {
      items.push(
        <button key="del" style={{ ...s.tbIconBtn, color: '#e53935', fontSize: 11 }} onClick={handleDelete}>Remove</button>
      );
    }

    items.push(
      <button key="ok" style={{ ...s.tbIconBtn, color: '#6c47ff', fontWeight: 700, fontSize: 11 }}
        onClick={() => { setSelectedEl(null); setColorOpen(false); }}>Done</button>
    );

    return <div style={s.textToolbar}>{items}</div>;
  }

  if (!bakerReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5', fontFamily: "'Quicksand', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ color: '#999', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ ...s.page, animation: 'spattooFadeIn 0.35s ease' }}>
      <style>{`@keyframes spattooFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Main ── */}
      <div style={s.main}>

        {/* ── Left column: logo + sidebar ── */}
        <div style={s.leftCol}>
          {/* Logo sits above the dark pill */}
          <div style={s.topLogo}>
            {bakerData?.logo_url
              ? <img src={bakerData.logo_url} alt="" style={s.topLogoImg} />
              : <div style={s.topLogoText}>{bakerData?.name ?? 'My Bakery'}</div>
            }
          </div>

        {/* ── Sidebar ── */}
        <div style={s.sidebar}>
          <nav style={s.sidebarNav}>
            {[
              { id: 'templates', label: 'Templates', icon: <TemplatesIcon size={20} /> },
              { id: 'elements',  label: 'Elements',  icon: <ElementsIcon size={20} /> },
              { id: 'text',      label: 'Text',      icon: <TextIcon size={20} /> },
            ].map(({ id, label, icon }) => {
              const active = id === 'elements' ? elementsOpen : id === 'templates' ? templatesOpen : false;
              return (
                <SidebarTooltip key={id} label={label}>
                  <button
                    style={{ ...s.sidebarBtn, ...(active ? s.sidebarBtnActive : {}) }}
                    onClick={() => {
                      if (id === 'text')      { stopRotatingOnFirstEdit(); addText(); }
                      if (id === 'elements')  openElements();
                      if (id === 'templates') openTemplates();
                    }}>
                    {icon}
                  </button>
                </SidebarTooltip>
              );
            })}
          </nav>

          <div style={{ flex: 1 }} />

          <div style={s.sidebarDivider} />

          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <SidebarTooltip label="Settings">
                <button
                  style={{ ...s.sidebarBtn, ...(settingsOpen ? s.sidebarBtnActive : {}) }}
                  onClick={() => { setSettingsOpen(o => !o); setProfileOpen(false); }}>
                  <GearIcon size={18} />
                </button>
              </SidebarTooltip>
              {settingsOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropdownSection}>Settings</div>
                  <button style={s.dropdownItem}
                    onClick={() => { setAddUserModal(true); setSettingsOpen(false); }}>
                    Add User
                  </button>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }} ref={profileRef}>
              <SidebarTooltip label={userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'Profile'}>
                <button
                  style={{ ...s.sidebarProfileBtn, background: primaryColor }}
                  onClick={() => { setProfileOpen(o => !o); setSettingsOpen(false); }}>
                  {initials}
                </button>
              </SidebarTooltip>
              {profileOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropdownUserInfo}>
                    <div style={s.dropdownName}>
                      {userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'My Account'}
                    </div>
                    {userData?.email && <div style={s.dropdownEmail}>{userData.email}</div>}
                  </div>
                  <div style={s.dropdownDivider} />
                  <button style={s.dropdownItem}
                    onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>
                    Change Password
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>{/* end leftCol */}

        {/* ── Elements flyout ── */}
        {elementsOpen && (
          <div style={s.flyout}>
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Elements</span>
              <button style={s.iconBtn} onClick={() => setElementsOpen(false)}>✕</button>
            </div>

            {elementTypesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}

            {elementTypes.filter(et => activeElementTypeIds.has(et.id)).map(et => (
              <ElementTypeCard
                key={et.id}
                elementType={et}
                design={design}
                toppersDb={toppersDb}
                scatteredDecorElements={scatteredDecorDb}
                selectedPiping={selectedPiping}
                onTopPipingSelect={i => { stopRotatingOnFirstEdit(); handleTopPipingSelect(i); setColorOpen(true); }}
                onBottomPipingSelect={i => { stopRotatingOnFirstEdit(); handleBottomPipingSelect(i); setColorOpen(true); }}
                onAddTopPiping={i => { stopRotatingOnFirstEdit(); setPipingTarget({ tierIndex: i, zone: 'top' }); clearAllSelections(); setElementsOpen(false); }}
                onAddBottomPiping={i => { stopRotatingOnFirstEdit(); setPipingTarget({ tierIndex: i, zone: 'bottom' }); clearAllSelections(); setElementsOpen(false); }}
                onRemoveTopPiping={i => { setTopPiping(i, null); if (selectedPiping?.tierIndex === i && selectedPiping?.zone === 'top') clearAllSelections(); }}
                onRemoveBottomPiping={i => { setBottomPiping(i, null); if (selectedPiping?.tierIndex === i && selectedPiping?.zone === 'bottom') clearAllSelections(); }}
                onSetTopper={t => { if (t?.image_url) preloadTopper(t.image_url); setTopper(t); setElementsOpen(false); stopRotatingOnFirstEdit(); }}
                onDragStartSticker={(el, x, y) => startStickerDrag(el, x, y)}
                onDragStartTopper={(t, x, y) => startTopperDrag(t, x, y)}
              />
            ))}

          </div>
        )}

        {/* ── Templates flyout ── */}
        {templatesOpen && (
          <div style={s.flyout}>
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Templates</span>
              <button style={s.iconBtn} onClick={() => setTemplatesOpen(false)}>✕</button>
            </div>
            {templatesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}
            {!templatesLoading && templates.length === 0 && (
              <div style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: '16px 0' }}>No templates yet</div>
            )}
            {templates.map(t => (
              <div key={t.id} style={s.templateCard}
                onClick={async () => {
                  let templateDesign = t.design ?? null;
                  if (!templateDesign) {
                    if (apiClient) {
                      const full = await apiClient.fetchTemplate(t.id).catch(() => null);
                      templateDesign = full?.design ?? null;
                    } else {
                      const { data } = await supabase
                        .from('cake_templates')
                        .select('design')
                        .eq('id', t.id)
                        .single();
                      templateDesign = data?.design ?? null;
                    }
                  }
                  if (templateDesign) {
                    loadDesign(templateDesign);
                    setTemplatesOpen(false);
                    clearAllSelections();
                  }
                }}
              >
                {t.thumbnail_url
                  ? <img src={t.thumbnail_url} alt={t.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }} />
                  : <div style={s.templateThumbPlaceholder} />
                }
                <div style={s.templateCardFooter}>
                  <span style={s.templateCardName}>{t.name}</span>
                  {t.offering === 'premium' && (
                    <span style={s.templateBadge}>Premium</span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: '#888', textAlign: 'center' }}>
                  {t.tier_count}-tier
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Canvas area ── */}
        <div style={s.canvasArea}>
          <div style={s.topControls}>
            <button style={{ ...s.addTierBtn, color: '#333' }}
              onClick={() => setSaveModal(true)}>
              Save Template
            </button>
          </div>
          {!selectedEl && (
            <div style={s.hint}>Tap a tier or text to edit</div>
          )}

          <Suspense fallback={<div style={s.loading}>Loading 3D cake...</div>}>
            <CakeCanvas
              config={canvasConfig}
              selectedTier={selectedTier}
              onTierClick={handleTierClick}
              onDeselect={handleDeselect}
              selectedPiping={selectedPiping}
              onTopPipingSelect={handleTopPipingSelect}
              onBottomPipingSelect={handleBottomPipingSelect}
              pipingTarget={pipingTarget}
              onPipingStyleSelect={handlePipingStyleSelect}
              onPipingCancel={() => setPipingTarget(null)}
              pipingStyles={pipingStylesDb}
              pipingToolbar={selectedPiping !== null ? buildToolbar(selectedEl) : null}
              selectedTextId={selectedTextId}
              onTextSelect={handleTextSelect}
              onTextMove={(id, pos) => updateText(id, pos)}
              onTextContentChange={(id, content) => updateText(id, { content })}
              autoRotate={autoRotate}
              textToolbar={selectedText ? buildToolbar(selectedEl) : null}
              onTopperClick={handleTopperClick}
              topperSelected={selectedEl?.type === 'topper'}
              topperToolbar={selectedEl?.type === 'topper' ? buildToolbar(selectedEl) : null}
              selectedStickerId={selectedStickerId}
              onStickerSelect={handleStickerSelect}
              onStickerMove={handleStickerMove}
              stickerToolbar={selectedStickerId !== null ? buildToolbar(selectedEl) : null}
              hitTestRef={hitTestRef}
            />
          </Suspense>

          <div style={s.rotateHint}>Drag to rotate</div>

          {/* ── Right edit panel — driven by element caps ── */}
          {showRightPanel && (
            <div style={s.wheelPanel}>
              <div style={s.wheelHeader}>
                <span style={s.wheelTitle}>
                  {selectedEl?.type === 'tier'    ? TIER_LABELS[selectedEl.index]
                  : selectedEl?.type === 'piping'  ? `${TIER_LABELS[selectedEl.tierIndex]} ${selectedEl.zone === 'top' ? 'Top' : 'Base'}`
                  : selectedEl?.type === 'text'    ? 'Text Color'
                  : selectedEl?.type === 'topper'  ? (design.topper?.name ?? 'Topper')
                  : selectedEl?.type === 'sticker' ? (design.stickers.find(s => s.id === selectedEl.id)?.name ?? 'Sticker')
                  : ''}
                </span>
                <button style={s.iconBtn} onClick={() => {
                  if (tierPanelVisible) setSelectedEl(null);
                  else { setColorOpen(false); if (selectedEl?.type === 'topper') setSelectedEl(null); }
                }}>✕</button>
              </div>

              {/* Color wheel — tier (always), piping/text (when colorOpen) */}
              {caps?.color && (tierPanelVisible || colorOpen) && (
                <ColorWheel
                  key={`${selectedEl.type}-${selectedEl.index ?? selectedEl.tierIndex ?? selectedEl.id ?? 'x'}-${selectedEl.zone ?? ''}`}
                  color={currentColor}
                  onChange={handleColorChange}
                />
              )}

              {/* Resize slider — sticker (delete/color are in the floating canvas toolbar) */}
              {caps?.resize && selectedEl?.type === 'sticker' && (() => {
                const sticker = design.stickers.find(s => s.id === selectedEl.id);
                if (!sticker) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', paddingTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>Size</div>
                    <input
                      type="range" min={25} max={300} step={5}
                      value={Math.round(sticker.scale * 100)}
                      onChange={e => updateSticker(sticker.id, { scale: Number(e.target.value) / 100 })}
                      style={{ width: 200, accentColor: '#9b5f72' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{Math.round(sticker.scale * 100)}%</span>
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      </div>{/* end main */}

      {/* ── Order button ── */}
      {selectedEl?.type !== 'text' && (
        <div style={s.orderBar}>
          <button style={{ ...s.orderBtn, ...brandBtn }} onClick={handleOrder}>Order This Cake</button>
        </div>
      )}

      {/* ── Save as Template modal ── */}
      {saveModal && (
        <div style={s.modalOverlay} onClick={() => setSaveModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>Save as Template</span>
              <button style={s.iconBtn} onClick={() => setSaveModal(false)}>✕</button>
            </div>
            <input
              style={s.modalInput}
              placeholder="Template name..."
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {['standard', 'premium'].map(o => (
                <button
                  key={o}
                  style={{ ...s.offeringBtn, borderColor: templateOffering === o ? primaryColor : '#f0dce3', background: templateOffering === o ? hexToRgba(primaryColor, 0.08) : '#fff', color: templateOffering === o ? primaryColor : '#666' }}
                  onClick={() => setTemplateOffering(o)}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
            {saveMsg && (
              <div style={{ fontSize: 12, fontWeight: 600, color: saveMsg.ok ? '#4caf50' : '#e53935', marginTop: 8 }}>
                {saveMsg.text}
              </div>
            )}
            <button
              style={{ ...s.orderBtn, ...brandBtn, marginTop: 14, opacity: saving || !templateName.trim() ? 0.6 : 1 }}
              onClick={handleSaveTemplate}
              disabled={saving || !templateName.trim()}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      )}

      {/* ── Add User modal ── */}
      {addUserModal && <AddUserModal onClose={() => setAddUserModal(false)} brandBtn={brandBtn} />}

      {/* ── Change Password modal ── */}
      {changePasswordModal && (
        <ChangePasswordModal
          onClose={() => setChangePasswordModal(false)}
          brandBtn={brandBtn}
          supabase={supabase}
          apiClient={apiClient}
        />
      )}

      {/* Off-screen thumbnail canvas — no floor, transparent background */}
      <CakeThumbnailCanvas config={canvasConfig} containerRef={thumbContainerRef} />

      {/* Floating sticker ghost while pointer-dragging from elements panel */}
      {dragGhost && (
        <div style={{
          position: 'fixed',
          left: dragGhost.x - 28, top: dragGhost.y - 28,
          width: 56, height: 56,
          borderRadius: 12,
          background: 'repeating-conic-gradient(#e8e8e8 0% 25%, #fff 0% 50%) 0 0 / 10px 10px',
          border: '2px solid #9b5f72',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: 0.85,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {dragGhost.el.thumbnail_url && (
            <img src={dragGhost.el.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    display:'flex', flexDirection:'column', height:'100vh',
    background:'#f4f4f5', fontFamily:"'Quicksand',sans-serif", overflow:'hidden',
  },

  // Left column (logo above + sidebar below)
  leftCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 0 12px 12px', gap: 10, flexShrink: 0,
  },
  topLogo: {
    width: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  topLogoImg: { maxHeight: 36, maxWidth: 56, objectFit: 'contain' },
  topLogoText: {
    fontSize: 11, fontWeight: 700, color: '#444',
    textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word',
    fontFamily: "'Quicksand',sans-serif",
  },

  // Sidebar
  sidebar: {
    width: 64, minWidth: 64,
    background: '#18191b',
    borderRadius: 20,
    margin: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    flexShrink: 0,
    flex: 1,
    boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
  },
  sidebarDivider: {
    height: 1, width: 32,
    background: 'rgba(255,255,255,0.10)',
    margin: '6px 0', flexShrink: 0,
  },
  sidebarNav: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '4px 0', gap: 2,
  },
  sidebarBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.45)',
    transition: 'background 0.15s, color 0.15s',
    flexShrink: 0,
  },
  sidebarBtnActive: {
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
  },
  sidebarProfileBtn: {
    width: 36, height: 36, borderRadius: '50%', border: 'none',
    cursor: 'pointer', color: '#fff',
    fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
    fontFamily: "'Quicksand',sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.5s ease',
  },

  // Dropdowns
  dropdown: {
    position: 'absolute', top: 0, left: 'calc(100% + 8px)',
    background: '#fff', borderRadius: 10,
    border: '1px solid #f0dce3',
    boxShadow: '0 4px 20px rgba(107,45,66,0.14)',
    minWidth: 160, zIndex: 50,
    display: 'flex', flexDirection: 'column',
    padding: '6px 0', overflow: 'hidden',
  },
  dropdownSection: {
    fontSize: 10, fontWeight: 700, color: '#888',
    letterSpacing: 1, textTransform: 'uppercase',
    padding: '6px 14px 4px',
  },
  dropdownItem: {
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', padding: '8px 14px',
    fontSize: 13, fontWeight: 500, color: '#1a1a1a',
    fontFamily: "'Quicksand',sans-serif",
  },
  dropdownUserInfo: { padding: '10px 14px 8px' },
  dropdownName: { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  dropdownEmail: { fontSize: 11, color: '#666', marginTop: 2 },
  dropdownDivider: { height: 1, background: '#f0dce3', margin: '4px 0' },

  // Main + flyout panels
  main: { flex: 1, display: 'flex', minHeight: 0, position: 'relative' },
  flyout: {
    position: 'absolute', left: 76, top: 0, bottom: 0, zIndex: 20,
    width: 200, background: '#fff',
    borderRadius: '0 16px 16px 0',
    display: 'flex', flexDirection: 'column',
    padding: '12px 10px', gap: 10,
    overflowY: 'auto',
    boxShadow: '4px 0 20px rgba(0,0,0,0.10)',
    margin: '12px 0',
  },
  flyoutHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4, flexShrink: 0,
  },
  flyoutTitle: {
    fontSize: 10, fontWeight: 700, color: '#888',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  // Field label (modals)
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: 0.3,
  },
  elementCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: '#fff', border: '1.5px solid #f0dce3', borderRadius: 12,
    padding: '10px 8px', cursor: 'pointer', position: 'relative',
    transition: 'all 0.15s',
  },
  elementCardLabel: {
    fontSize: 10, fontWeight: 700, color: '#666',
    letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center',
  },
  elementCardCheck: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 11, color: '#333', fontWeight: 800,
  },
  templateCard: {
    border: '1.5px solid #f0dce3', borderRadius: 12,
    overflow: 'hidden', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '0 0 8px',
    transition: 'all 0.15s',
  },
  templateThumbPlaceholder: {
    width: '100%', height: 100,
    background: '#fdf0f5', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: 32,
  },
  templateCardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 8px 0',
  },
  templateCardName: {
    fontSize: 11, fontWeight: 700, color: '#1a1a1a',
  },
  templateBadge: {
    fontSize: 9, color: '#333', fontWeight: 700,
    background: '#fdf0f5', border: '1px solid #f0dce3',
    borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3,
  },

  tierCheckRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    cursor: 'pointer', padding: '2px 0',
  },
  tierCheckLabel: {
    fontSize: 10, fontWeight: 600, color: '#333',
    letterSpacing: 0.3,
  },

  // Canvas
  canvasArea: {
    flex:1, position:'relative', minHeight:0,
    background:'transparent',
  },
  loading: {
    position:'absolute', inset:0, display:'flex',
    alignItems:'center', justifyContent:'center', color:'#666', fontSize:14,
  },
  hint: {
    position:'absolute', top:14, left:'50%', transform:'translateX(-50%)',
    zIndex:10, background:'rgba(107,45,66,0.7)', color:'#fff',
    fontSize:11, fontWeight:600, padding:'5px 14px', borderRadius:20,
    letterSpacing:0.3, pointerEvents:'none', backdropFilter:'blur(6px)',
  },
  topControls: {
    position:'absolute', top:14, right:14, zIndex:10,
    display:'flex', gap:8,
  },
  addTierBtn: {
    zIndex:10,
    background:'#fff', border:'1.5px solid #e0d0d5', borderRadius:20,
    padding:'6px 14px', fontSize:11, fontWeight:700,
    color:'#1a1a1a', cursor:'pointer',
    boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
  },
  rotateHint: {
    position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
    fontSize:10, color:'#999', letterSpacing:1, pointerEvents:'none',
  },

  // Tier colour wheel panel
  wheelPanel: {
    position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
    background:'rgba(255,255,255,0.92)', backdropFilter:'blur(18px)',
    WebkitBackdropFilter:'blur(18px)', borderRadius:20,
    padding:'14px 16px 16px',
    boxShadow:'0 4px 24px rgba(107,45,66,0.14)',
    zIndex:20, width:248,
  },
  wheelHeader: {
    display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14,
  },
  wheelTitle: {
    fontSize:11, fontWeight:700, color:'#666', letterSpacing:1.5, textTransform:'uppercase',
  },
  deleteBtn: {
    flex: 1, padding: '8px 0', borderRadius: 10,
    background: '#fff0f0', border: '1.5px solid #f5c0c0',
    fontSize: 11, fontWeight: 700, color: '#e53935', cursor: 'pointer',
    fontFamily: "'Quicksand',sans-serif",
  },
  doneBtn: {
    flex: 1, padding: '8px 0', borderRadius: 10,
    background: '#f0f0ff', border: '1.5px solid #c0c0f5',
    fontSize: 11, fontWeight: 700, color: '#6c47ff', cursor: 'pointer',
    fontFamily: "'Quicksand',sans-serif",
  },
  iconBtn: {
    background:'#f5eaed', border:'none', width:28, height:28, borderRadius:'50%',
    fontSize:12, color:'#333', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700,
  },

  // Text toolbar — floated above element via drei Html, no position needed
  textToolbar: {
    display:'inline-flex', alignItems:'center', gap:4,
    background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    padding:'6px 10px',
    borderRadius:12, whiteSpace:'nowrap',
    boxShadow:'0 4px 20px rgba(107,45,66,0.22), 0 1px 4px rgba(0,0,0,0.1)',
    border:'1px solid rgba(240,220,227,0.9)',
    pointerEvents:'auto',
  },
  swatchBtn: {
    width:26, height:26, borderRadius:'50%', border:'2.5px solid #e0d0d5',
    cursor:'pointer', flexShrink:0, padding:0,
    boxShadow:'0 1px 4px rgba(0,0,0,0.15)',
  },
  tbDivider: {
    width:1, height:20, background:'#e8d8dd', margin:'0 4px', flexShrink:0,
  },
  tbIconBtn: {
    background:'transparent', border:'none', borderRadius:8,
    padding:'4px 8px', fontSize:14, cursor:'pointer',
    color:'#333', fontWeight:600, fontFamily:"'Quicksand',sans-serif",
    minWidth:28, textAlign:'center',
  },
  tbSizeLabel: {
    fontSize:13, fontWeight:700, color:'#222', minWidth:26, textAlign:'center',
  },
  toolbarBtn: {
    background:'#f5eaed', border:'none', borderRadius:10,
    padding:'5px 10px', fontSize:13, cursor:'pointer', color:'#333', fontWeight:700,
    flexShrink:0,
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(107,45,66,0.18)',
    backdropFilter: 'blur(4px)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: '20px 22px 22px',
    width: 280, boxShadow: '0 8px 40px rgba(107,45,66,0.18)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle: {
    fontSize: 13, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.3,
  },
  modalInput: {
    border: '1.5px solid #d1d5db', borderRadius: 10, padding: '9px 12px',
    fontSize: 13, fontFamily: "'Quicksand',sans-serif", color: '#222',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  offeringBtn: {
    flex: 1, padding: '7px 0', borderRadius: 10, border: '1.5px solid #f0dce3',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
    fontFamily: "'Quicksand',sans-serif", transition: 'all 0.15s',
  },

  // Order
  orderBar: {
    padding:'10px 20px 16px', background:'transparent',
    flexShrink:0,
  },
  orderBtn: {
    width:'100%', padding:'13px',
    background:'linear-gradient(135deg,#1a1a1a,#333333)',
    color:'#fff', border:'none', borderRadius:12,
    fontSize:14, fontWeight:700, cursor:'pointer', letterSpacing:0.5,
    boxShadow:'0 4px 16px rgba(0,0,0,0.2)',
    fontFamily:"'Quicksand',sans-serif",
    transition:'background 0.5s ease, box-shadow 0.5s ease',
  },
};
