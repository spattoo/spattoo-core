import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';
import CakeCanvas, { CakeThumbnailCanvas, preloadTopper } from './canvas/CakeCanvas';
import { useCakeDesign } from './hooks/useCakeDesign';
import ColorGuide from './ColorGuide';
import OrderModal from './OrderModal';
import OrdersPanel from './OrdersPanel';
import CustomersPanel from './CustomersPanel';
import DashboardPanel from './DashboardPanel';
import SettingsPanel from './SettingsPanel';
import BillingPanel from './BillingPanel';

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
  elementType, design, toppersDb = [], scatteredDecorElements = [], picksElements = [], imageTopperElements = [], otherElements = [],
  onSetTopper, onDragStartSticker, onDragStartTopper,
}) {
  const { slug, name } = elementType;

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

  // ── picks — draggable GLB elements inserted into cake ─────────────────────
  if (slug === 'picks') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
        {picksElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No picks yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {picksElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                {el.thumbnail_url && <img src={el.thumbnail_url} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── image_topper — draggable 2D images placed upright on top surface ────────
  if (slug === 'image_topper') {
    return (
      <div style={{ ...s.elementCard, cursor: 'default' }}>
        <div style={s.elementCardLabel}>{name}</div>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto top of cake to place</div>
        {imageTopperElements.length === 0 && (
          <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No image toppers yet</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {imageTopperElements.map(el => (
            <div
              key={el.id}
              onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                {el.thumbnail_url && <img src={el.thumbnail_url} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── All other types — generic draggable grid ──────────────────────────────
  return (
    <div style={{ ...s.elementCard, cursor: 'default' }}>
      <div style={s.elementCardLabel}>{name}</div>
      {otherElements.length > 0 ? (
        <>
          <div style={{ fontSize: 9, color: '#888', marginBottom: 8 }}>Drag onto cake to place</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {otherElements.map(el => (
              <div
                key={el.id}
                onPointerDown={e => { e.preventDefault(); onDragStartSticker?.(el, e.clientX, e.clientY); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
              >
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#fff', border: '1.5px solid #f0dce3' }}>
                  {el.thumbnail_url && <img src={el.thumbnail_url} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No elements yet</div>
      )}
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

function NewCakeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {/* large 4-pointed sparkle */}
      <path d="M12 2.5c.28 0 .5.22.5.5 0 4.1 1.9 5.5 5.5 5.5.28 0 .5.22.5.5s-.22.5-.5.5c-3.6 0-5.5 1.4-5.5 5.5 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-4.1-1.9-5.5-5.5-5.5-.28 0-.5-.22-.5-.5s.22-.5.5-.5c3.6 0 5.5-1.4 5.5-5.5 0-.28.22-.5.5-.5z" />
      {/* small sparkle top-right */}
      <path d="M19.5 2c.2 0 .35.16.35.35 0 1.75 1 2.65 2.65 2.65.19 0 .35.16.35.35s-.16.35-.35.35c-1.65 0-2.65.9-2.65 2.65 0 .19-.16.35-.35.35s-.35-.16-.35-.35c0-1.75-1-2.65-2.65-2.65-.19 0-.35-.16-.35-.35s.16-.35.35-.35c1.65 0 2.65-.9 2.65-2.65 0-.19.16-.35.35-.35z" />
    </svg>
  );
}

function DashboardIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function OrdersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="12" y2="15" />
    </svg>
  );
}

function CustomersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
      <path d="M19 8v6M22 11h-6" />
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

// ── Cream piping inline section (per-tier, per-zone controls) ─────────────────
// ── Main designer ─────────────────────────────────────────────────────────────
export default function CakeDesigner({ apiClient, supabase, thumbnailBucket = 'cake-thumbnails', onOrder, onSaveTemplate }) {
  const { design, setTierColor, setTopPiping, setBottomPiping, addText, updateText, duplicateText, removeText, addSticker, updateSticker, removeSticker, duplicateSticker, groupStickers, ungroupStickers, moveGroupStickers, setTopper, setTopperScale, resetDesign, loadDesign, canvasConfig } = useCakeDesign();
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementTypes, setElementTypes] = useState([]);
  const [elementTypesLoading, setElementTypesLoading] = useState(false);
  const [toppersDb, setToppersDb] = useState([]);
  const [scatteredDecorDb, setScatteredDecorDb] = useState([]);
  const [picksDb, setPicksDb] = useState([]);
  const [imageTopperDb, setImageTopperDb] = useState([]);
  const [otherElementsDb, setOtherElementsDb] = useState({}); // typeId → elements[]
  const [pipingPopupOpen,    setPipingPopupOpen]    = useState(false);
  const [pipingPopupEl,     setPipingPopupEl]     = useState(null);
  const [pipingPopupColor,  setPipingPopupColor]  = useState('#f5e6c8');
  const [pipingPopupSize,   setPipingPopupSize]    = useState(1.0);
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
  // type 'sticker': { id }  ← primary sticker (toolbar anchor)
  const [selectedEl, setSelectedEl] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  // Full sticker selection set (drives canvas highlight + group ops)
  const [selectedStickerIds, setSelectedStickerIds] = useState(new Set());
  // True when user entered multi-select via long-press (mobile) or Ctrl+click (desktop)
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Derived
  const selectedTier    = selectedEl?.type === 'tier'    ? selectedEl.index : null;
  const selectedPiping  = selectedEl?.type === 'piping'  ? selectedEl       : null;
  const selectedTextId  = selectedEl?.type === 'text'    ? selectedEl.id    : null;
  const selectedStickerId = selectedStickerIds.size === 1 ? [...selectedStickerIds][0] : null;
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
  const [colorGuideOpen,      setColorGuideOpen]      = useState(false);
  const [orderModalOpen,      setOrderModalOpen]      = useState(false);
  const [editingOrder,        setEditingOrder]        = useState(null);
  const [ordersPanelOpen,     setOrdersPanelOpen]     = useState(false);
  const [customersPanelOpen,  setCustomersPanelOpen]  = useState(false);
  const [customersFilter,     setCustomersFilter]     = useState(null);
  const [dashboardOpen,       setDashboardOpen]       = useState(false);
  const [settingsPanelOpen,   setSettingsPanelOpen]   = useState(false);
  const [billingPanelOpen,    setBillingPanelOpen]    = useState(false);
  const [ordersFilter,        setOrdersFilter]        = useState(null);
  const [bakerReady,          setBakerReady]          = useState(false);
  const [bakerData,    setBakerData]    = useState(null);
  const [userData,     setUserData]     = useState(null);
  const [bakerSettings, setBakerSettings] = useState({});
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [mobilePanelHeight, setMobilePanelHeight] = useState(260);
  const settingsRef      = useRef(null);
  const profileRef       = useRef(null);
  const hitTestRef       = useRef(null);
  const snapCameraRef    = useRef(null);
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
  const isMobile = windowWidth <= 640;

  useEffect(() => {
    if (apiClient?.fetchBakerSettings) {
      apiClient.fetchBakerSettings().then(s => setBakerSettings(s ?? {})).catch(() => {});
    }
  }, [apiClient]);

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

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  async function loadElementsIfNeeded() {
    if (toppersDb.length > 0 || scatteredDecorDb.length > 0 || picksDb.length > 0 || imageTopperDb.length > 0 || Object.keys(otherElementsDb).length > 0) return;
    setElementTypesLoading(true);
    let rows = [];
    if (apiClient) {
      rows = await apiClient.fetchElements({ parentsOnly: true });
    } else {
      const { data: topLevelData } = await supabase
        .from('cake_elements')
        .select('id, name, image_url, thumbnail_url, allowed_zones, placement_config, sort_order, element_type_id, default_color, allowed_actions')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('sort_order');
      rows = topLevelData ?? [];
    }
    setActiveElementTypeIds(new Set(rows.map(r => r.element_type_id)));
    const topperTypeId         = elementTypes.find(et => et.slug === 'topper')?.id;
    const scatteredDecorTypeId = elementTypes.find(et => et.slug === 'scattered_decor')?.id;
    const picksTypeId          = elementTypes.find(et => et.slug === 'picks')?.id;
    const imageTopperTypeId    = elementTypes.find(et => et.slug === 'image_topper')?.id;
    const knownTypeIds         = new Set([topperTypeId, scatteredDecorTypeId, picksTypeId, imageTopperTypeId].filter(Boolean));
    setToppersDb(rows.filter(r => r.element_type_id === topperTypeId));
    setScatteredDecorDb(rows.filter(r => r.element_type_id === scatteredDecorTypeId));
    setPicksDb(rows.filter(r => r.element_type_id === picksTypeId));
    setImageTopperDb(rows.filter(r => r.element_type_id === imageTopperTypeId));
    const others = {};
    rows.filter(r => !knownTypeIds.has(r.element_type_id)).forEach(r => {
      (others[r.element_type_id] ??= []).push(r);
    });
    setOtherElementsDb(others);
    setElementTypesLoading(false);
  }

  async function openElements() {
    const opening = !elementsOpen;
    setElementsOpen(opening);
    setTemplatesOpen(false);
    if (opening) setPipingPopupOpen(false);
    if (opening) await loadElementsIfNeeded();
  }

  async function openPipingPopup(el) {
    // Seed color/size from any existing application of this style
    let color = '#f5e6c8', size = 1.0;
    for (const tier of design.tiers) {
      if (tier.topPiping?.id === el.id)    { color = tier.topPiping.color ?? color;    size = tier.topPiping.size ?? size;    break; }
      if (tier.bottomPiping?.id === el.id) { color = tier.bottomPiping.color ?? color; size = tier.bottomPiping.size ?? size; break; }
    }
    setPipingPopupEl(el);
    setPipingPopupColor(color);
    setPipingPopupSize(size);
    setPipingPopupOpen(true);
    setElementsOpen(false);
  }

  function handlePipingColorChange(c) {
    setPipingPopupColor(c);
    design.tiers.forEach((tier, i) => {
      if (tier.topPiping?.id    === pipingPopupEl?.id) setTopPiping(i,    { ...tier.topPiping,    color: c });
      if (tier.bottomPiping?.id === pipingPopupEl?.id) setBottomPiping(i, { ...tier.bottomPiping, color: c });
    });
  }

  function handlePipingSizeChange(v) {
    setPipingPopupSize(v);
    design.tiers.forEach((tier, i) => {
      if (tier.topPiping?.id    === pipingPopupEl?.id) setTopPiping(i,    { ...tier.topPiping,    size: v });
      if (tier.bottomPiping?.id === pipingPopupEl?.id) setBottomPiping(i, { ...tier.bottomPiping, size: v });
    });
  }

  function togglePipingZone(tierIndex, zone, isOn) {
    if (isOn) {
      if (zone === 'rim') setTopPiping(tierIndex, null);
      else                setBottomPiping(tierIndex, null);
    } else {
      const piping = { id: pipingPopupEl.id, glbUrl: pipingPopupEl.image_url, name: pipingPopupEl.name, color: pipingPopupColor, size: pipingPopupSize };
      if (zone === 'rim') setTopPiping(tierIndex, piping);
      else                setBottomPiping(tierIndex, piping);
      stopRotatingOnFirstEdit();
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
    if (!selectedEl && selectedStickerIds.size === 0) return;
    if (selectedEl?.type === 'piping') {
      if (selectedEl.zone === 'top') setTopPiping(selectedEl.tierIndex, null);
      else setBottomPiping(selectedEl.tierIndex, null);
    } else if (selectedEl?.type === 'text') {
      removeText(selectedEl.id);
    } else if (selectedStickerIds.size > 0) {
      selectedStickerIds.forEach(id => removeSticker(id));
      setSelectedStickerIds(new Set());
    } else if (selectedEl?.type === 'topper') {
      setTopper(null);
    }
    setSelectedEl(null);
    setColorOpen(false);
  }

  // ── Selection handlers ────────────────────────────────────────────────────
  function clearAllSelections() {
    setSelectedEl(null);
    setColorOpen(false);
    setSelectedStickerIds(new Set());
    setMultiSelectMode(false);
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
    setSelectedEl(prev => prev?.type === 'topper' ? prev : { type: 'topper' });
    setColorOpen(false);
  }

  function handleStickerSelect(id, ctrlKey = false) {
    stopRotatingOnFirstEdit();
    const sticker = design.stickers.find(s => s.id === id);

    if (ctrlKey || multiSelectMode) {
      setMultiSelectMode(true);
      setSelectedStickerIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) { next.delete(id); } else { next.add(id); }
        const primaryId = next.has(id) ? id : ([...next][next.size - 1] ?? null);
        setSelectedEl(primaryId ? { type: 'sticker', id: primaryId } : null);
        return next;
      });
      setColorOpen(false);
      return;
    }

    if (sticker?.groupId) {
      // Auto-select all stickers in this group
      const groupIds = new Set(
        design.stickers.filter(s => s.groupId === sticker.groupId).map(s => s.id)
      );
      setSelectedStickerIds(groupIds);
      setSelectedEl({ type: 'sticker', id });
    } else {
      // Toggle single selection
      const isOnly = selectedStickerIds.size === 1 && selectedStickerIds.has(id);
      setSelectedStickerIds(isOnly ? new Set() : new Set([id]));
      setSelectedEl(isOnly ? null : { type: 'sticker', id });
    }
    setColorOpen(false);
  }

  function handleStickerLongPress(id) {
    stopRotatingOnFirstEdit();
    setMultiSelectMode(true);
    setSelectedStickerIds(new Set([id]));
    setSelectedEl({ type: 'sticker', id });
    setColorOpen(false);
  }

  function handleGroupMove(groupId, startPositions, delta) {
    moveGroupStickers(groupId, startPositions, delta);
  }

  function handleStickerMove(id, changes) {
    updateSticker(id, changes);
  }

  function handleElementDrop(element, hit) {
    stopRotatingOnFirstEdit();
    let placementMode = element.placement_config?.[hit.zone];
    if (!placementMode && Object.values(element.placement_config ?? {}).includes('faux_ball_single')) {
      placementMode = 'faux_ball_single';
    }

    const imageTopperTypeId = elementTypes.find(et => et.slug === 'image_topper')?.id;
    const isImageTopper = element.element_type_id === imageTopperTypeId;

    // Center image toppers on the top surface regardless of where they were dropped.
    const effectiveHit = (isImageTopper && hit.zone === 'top_surface')
      ? { ...hit, x: 0, z: 0 }
      : hit;

    addSticker(element, effectiveHit.zone, effectiveHit.tierIndex, placementMode ?? 'hug', effectiveHit);
    setElementsOpen(false);

    if (isImageTopper && hit.zone === 'top_surface') {
      snapCameraRef.current?.([0, 5.5, 8.7]);
    }
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


  function handleNewCake() {
    resetDesign();
    clearAllSelections();
    setEditingOrder(null);
    setAutoRotate(true);
    hasEdited.current = false;
    setElementsOpen(false);
    setTemplatesOpen(false);
  }

  function handlePanelDrag(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = mobilePanelHeight;
    function onMove(ev) {
      const delta = startY - ev.clientY; // drag up → taller panel
      setMobilePanelHeight(Math.min(560, Math.max(80, startH + delta)));
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handleOrder() {
    setOrderModalOpen(true);
  }

  async function handleOrderSubmit(formData) {
    const thumbCanvas = thumbContainerRef.current?.querySelector('canvas');
    const designThumbnail = thumbCanvas ? thumbCanvas.toDataURL('image/png') : null;

    const designSnapshot = {
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

    if (editingOrder) {
      const payload = { designSnapshot, designThumbnail, comment: formData.comment };
      if (apiClient?.updateOrderDesign) return await apiClient.updateOrderDesign(editingOrder.id, payload);
      if (onOrder)                       return await onOrder({ ...payload, mode: 'update_design', orderId: editingOrder.id });
      return;
    }

    const payload = { ...formData, designSnapshot, designThumbnail };
    if (apiClient?.placeOrder) return await apiClient.placeOrder(payload);
    if (onOrder)               return await onOrder(payload);
  }

  const creamPipingType = elementTypes.find(et => et.slug === 'cream_piping');
  const creamPipingEls  = otherElementsDb[creamPipingType?.id] ?? [];

  const tierPanelVisible = selectedEl?.type === 'tier';
  const currentColor = getCurrentColor();
  // Right panel shows when: tier selected (always), or color picker opened, or topper selected (resize)
  const selectedStickerIsFauxBall = selectedEl?.type === 'sticker' &&
    (design.stickers.find(s => s.id === selectedEl.id)?.placementMode === 'faux_ball_single');
  const showRightPanel = tierPanelVisible
    || (caps?.color && colorOpen)
    || selectedStickerIsFauxBall
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
      const sticker = design.stickers.find(s => s.id === el.id);
      const sc = sticker?.scale ?? 1;
      items.push(
        <button key="sc-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { scale: Math.max(0.25, +(sc - 0.15).toFixed(2)) })}>−</button>,
        <button key="sc+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { scale: Math.min(6, +(sc + 0.15).toFixed(2)) })}>+</button>,
        <div key="d4" style={s.tbDivider} />
      );
      const isGlbTop = sticker?.zone === 'top_surface' && /\.(glb|gltf)(\?|$)/i.test(sticker?.imageUrl ?? '');
      if (isGlbTop) {
        const yo = sticker?.yOffset ?? 0;
        items.push(
          <button key="ht-dn" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.max(0, +(yo - 0.1).toFixed(2)) })}>↓</button>,
          <button key="ht-up" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { yOffset: Math.min(1.2, +(yo + 0.1).toFixed(2)) })}>↑</button>,
          <div key="d-ht" style={s.tbDivider} />
        );
      }
      // Depth (radialOffset) — side stickers only
      const isSide = sticker?.zone === 'side' || sticker?.zone === 'middle_tier';
      if (isSide) {
        const ro = sticker?.radialOffset ?? 0;
        items.push(
          <span key="ro-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Depth</span>,
          <button key="ro-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.max(0, +(ro - 0.05).toFixed(2)) })}>−</button>,
          <button key="ro+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { radialOffset: Math.min(0.6, +(ro + 0.05).toFixed(2)) })}>+</button>,
          <div key="d-ro" style={s.tbDivider} />
        );
      }
      // Tilt — all stickers
      {
        const ta = sticker?.tiltAngle ?? 0;
        items.push(
          <span key="ta-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Tilt</span>,
          <button key="ta-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { tiltAngle: Math.max(-1.2, +((ta) - 0.1).toFixed(3)) })}>−</button>,
          <span key="ta-val" style={{ ...s.tbSizeLabel, minWidth: 28 }}>{Math.round(ta * 180 / Math.PI)}°</span>,
          <button key="ta+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { tiltAngle: Math.min(1.2, +((ta) + 0.1).toFixed(3)) })}>+</button>,
          <div key="d-ta" style={s.tbDivider} />
        );
      }
      // Spin (rotation) — top_surface stand stickers only
      if (sticker?.zone === 'top_surface' && sticker?.placementMode === 'stand') {
        const rot = sticker?.rotation ?? 0;
        items.push(
          <span key="sp-lbl" style={{ ...s.tbSizeLabel, fontSize: 9, color: '#888', letterSpacing: 0.3 }}>Spin</span>,
          <button key="sp-" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot - 0.2).toFixed(3) })}>↺</button>,
          <button key="sp+" style={s.tbIconBtn} onClick={() => updateSticker(el.id, { rotation: +(rot + 0.2).toFixed(3) })}>↻</button>,
          <div key="d-sp" style={s.tbDivider} />
        );
      }
      // Group / Ungroup
      const isGrouped = !!sticker?.groupId;
      if (isGrouped) {
        items.push(
          <button key="ungroup" style={{ ...s.tbIconBtn, fontSize: 11, color: '#9b5f72' }}
            onClick={() => { ungroupStickers(sticker.groupId); clearAllSelections(); }}>
            Ungroup
          </button>,
          <div key="d-ug" style={s.tbDivider} />
        );
      }
    }

    if (c.duplicate && el.type === 'text') {
      items.push(
        <button key="dup" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateText(el.id); setSelectedEl(null); }}>Duplicate</button>
      );
    }

    if (c.duplicate && el.type === 'sticker') {
      const sticker = design.stickers.find(s => s.id === el.id);
      if (!sticker?.groupId) {
        items.push(
          <button key="dup-sticker" style={{ ...s.tbIconBtn, fontSize: 11 }} onClick={() => { duplicateSticker(el.id); clearAllSelections(); }}>Duplicate</button>
        );
      }
    }

    if (c.delete) {
      const label = selectedStickerIds.size > 1 ? 'Remove all' : 'Remove';
      items.push(
        <button key="del" style={{ ...s.tbIconBtn, color: '#e53935', fontSize: 11 }} onClick={handleDelete}>{label}</button>
      );
    }

    items.push(
      <button key="ok" style={{ ...s.tbIconBtn, color: '#6c47ff', fontWeight: 700, fontSize: 11 }}
        onClick={() => { clearAllSelections(); }}>Done</button>
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

  // Block access if subscription is expired or cancelled
  const blockedStatuses = ['expired', 'cancelled', 'paused'];
  if (bakerData && blockedStatuses.includes(bakerData.subscription_status)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F4F8F5', fontFamily: "'Quicksand', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
            {bakerData.subscription_status === 'expired' ? 'Your trial has ended' : 'Subscription inactive'}
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
            Choose a plan to continue using Spattoo. Start free with Spark or unlock more with a paid plan.
          </div>
          <button
            onClick={() => setBillingPanelOpen(true)}
            style={{
              padding: '14px 32px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
              color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}
          >
            View Plans
          </button>
          <BillingPanel
            open={billingPanelOpen}
            onClose={() => setBillingPanelOpen(false)}
            apiClient={apiClient}
            primaryColor={primaryColor}
            accentColor={accentColor}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.page, animation: 'spattooFadeIn 0.35s ease' }}>
      <style>{`@keyframes spattooFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Mobile header ── */}
      {isMobile && (
        <div style={s.mobileHeader}>
          <div style={s.topLogo}>
            {bakerData?.logo_url
              ? <img src={bakerData.logo_url} alt="" style={s.topLogoImg} />
              : <div style={s.topLogoText}>{bakerData?.name ?? 'My Bakery'}</div>
            }
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button
                style={{ ...s.sidebarBtn, color: settingsOpen ? '#1a1a1a' : '#555', background: settingsOpen ? 'rgba(0,0,0,0.06)' : 'none', width: 38, height: 38 }}
                onClick={() => { setSettingsOpen(o => !o); setProfileOpen(false); }}>
                <GearIcon size={18} />
              </button>
              {settingsOpen && (
                <div style={{ ...s.dropdown, left: 'auto', right: 0, top: 'calc(100% + 8px)' }}>
                  <div style={s.dropdownSection}>Settings</div>
                  <button style={s.dropdownItem} onClick={() => { setSettingsPanelOpen(true); setSettingsOpen(false); }}>Store Settings</button>
                  <button style={s.dropdownItem} onClick={() => { setBillingPanelOpen(true); setSettingsOpen(false); }}>Billing</button>
                  <button style={s.dropdownItem} onClick={() => { setColorGuideOpen(true); setSettingsOpen(false); }}>Color Guide</button>
                  <button style={s.dropdownItem} onClick={() => { setAddUserModal(true); setSettingsOpen(false); }}>Add User</button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }} ref={profileRef}>
              <button style={{ ...s.sidebarProfileBtn, background: primaryColor }}
                onClick={() => { setProfileOpen(o => !o); setSettingsOpen(false); }}>
                {initials}
              </button>
              {profileOpen && (
                <div style={{ ...s.dropdown, left: 'auto', right: 0, top: 'calc(100% + 8px)' }}>
                  <div style={s.dropdownUserInfo}>
                    <div style={s.dropdownName}>{userData ? `${userData.firstName} ${userData.lastName}`.trim() : 'My Account'}</div>
                    {userData?.email && <div style={s.dropdownEmail}>{userData.email}</div>}
                  </div>
                  <div style={s.dropdownDivider} />
                  <button style={s.dropdownItem} onClick={() => { setChangePasswordModal(true); setProfileOpen(false); }}>Change Password</button>
                  <button style={s.dropdownItem} onClick={() => { apiClient?.signOut?.() ?? supabase?.auth.signOut(); setProfileOpen(false); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ ...s.main, ...(isMobile ? { flexDirection: 'column' } : {}) }}>

        {/* ── Left column: logo + sidebar ── */}
        {!isMobile && <div style={s.leftCol}>
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
              { id: 'new',        label: 'New Cake',  icon: null },
              { id: 'dashboard',  label: 'Dashboard', icon: <DashboardIcon size={20} /> },
              { id: 'templates',  label: 'Templates', icon: <TemplatesIcon size={20} /> },
              { id: 'elements',   label: 'Elements',  icon: <ElementsIcon size={20} /> },
              { id: 'text',       label: 'Text',      icon: <TextIcon size={20} /> },
              { id: 'orders',     label: 'Orders',    icon: <OrdersIcon size={20} /> },
              { id: 'customers',  label: 'Customers', icon: <CustomersIcon size={20} /> },
            ].map(({ id, label, icon }) => {
              const active = id === 'elements' ? elementsOpen : id === 'templates' ? templatesOpen : false;
              const isNew  = id === 'new';
              return (
                <SidebarTooltip key={id} label={label}>
                  <button
                    style={{ ...s.sidebarBtn, ...(isNew ? { borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.45)', color: '#fff' } : {}), ...(active ? s.sidebarBtnActive : {}) }}
                    onClick={() => {
                      if (id === 'new')       handleNewCake();
                      if (id === 'text')      { stopRotatingOnFirstEdit(); addText(); }
                      if (id === 'elements')  openElements();
                      if (id === 'templates') openTemplates();
                      if (id === 'dashboard') setDashboardOpen(true);
                      if (id === 'orders')    setOrdersPanelOpen(true);
                      if (id === 'customers') setCustomersPanelOpen(true);
                    }}>
                    {isNew
                      ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      : icon}
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
                    onClick={() => { setSettingsPanelOpen(true); setSettingsOpen(false); }}>
                    Store Settings
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { setBillingPanelOpen(true); setSettingsOpen(false); }}>
                    Billing
                  </button>
                  <button style={s.dropdownItem}
                    onClick={() => { setColorGuideOpen(true); setSettingsOpen(false); }}>
                    Color Guide
                  </button>
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
        </div>}{/* end leftCol */}

        {/* ── Elements flyout ── */}
        {elementsOpen && (
          <div style={{ ...s.flyout, ...(isMobile ? { ...s.flyoutMobile, height: mobilePanelHeight } : {}) }}>
            {isMobile && (
              <div style={s.panelHandle} onPointerDown={handlePanelDrag}>
                <div style={s.panelHandlePill} />
              </div>
            )}
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Elements</span>
              <button style={s.iconBtn} onClick={() => setElementsOpen(false)}>✕</button>
            </div>
            <div style={s.flyoutScroll}>
            {elementTypesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}

            {/* Cream piping — thumbnail grid, tap a style to open popup */}
            {creamPipingType && activeElementTypeIds.has(creamPipingType.id) && (
              <div style={{ ...s.elementCard, cursor: 'default' }}>
                <div style={s.elementCardLabel}>Cream Piping</div>
                {creamPipingEls.length === 0 && (
                  <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>No styles yet</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {creamPipingEls.map(el => {
                    const isActive = design.tiers.some(t => t.topPiping?.id === el.id || t.bottomPiping?.id === el.id);
                    return (
                      <div key={el.id} onClick={() => openPipingPopup(el)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{
                          width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                          background: '#fff',
                          border: `1.5px solid ${isActive ? '#9b5f72' : '#f0dce3'}`,
                          boxShadow: isActive ? '0 0 0 2px rgba(155,95,114,0.18)' : 'none',
                        }}>
                          {el.thumbnail_url && <img src={el.thumbnail_url} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#9b5f72' : '#444', textAlign: 'center', maxWidth: 68 }}>{el.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All other element types */}
            {elementTypes
              .filter(et => et.slug !== 'cream_piping' && activeElementTypeIds.has(et.id))
              .map(et => (
                <ElementTypeCard
                  key={et.id}
                  elementType={et}
                  design={design}
                  toppersDb={toppersDb}
                  scatteredDecorElements={scatteredDecorDb}
                  picksElements={picksDb}
                  imageTopperElements={imageTopperDb}
                  otherElements={otherElementsDb[et.id] ?? []}
                  onSetTopper={t => { if (t?.image_url) preloadTopper(t.image_url); setTopper(t); setElementsOpen(false); stopRotatingOnFirstEdit(); }}
                  onDragStartSticker={(el, x, y) => startStickerDrag(el, x, y)}
                  onDragStartTopper={(t, x, y) => startTopperDrag(t, x, y)}
                />
              ))}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Templates flyout ── */}
        {templatesOpen && (
          <div style={{ ...s.flyout, ...(isMobile ? { ...s.flyoutMobile, height: mobilePanelHeight } : {}) }}>
            {isMobile && (
              <div style={s.panelHandle} onPointerDown={handlePanelDrag}>
                <div style={s.panelHandlePill} />
              </div>
            )}
            <div style={s.flyoutHeader}>
              <span style={s.flyoutTitle}>Templates</span>
              <button style={s.iconBtn} onClick={() => setTemplatesOpen(false)}>✕</button>
            </div>
            <div style={s.flyoutScroll}>
            {templatesLoading && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '16px 0' }}>Loading...</div>
            )}
            {!templatesLoading && templates.length === 0 && (
              <div style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: '16px 0' }}>No templates yet</div>
            )}
            <div style={isMobile ? s.templateGrid : null}>
            {templates.map(t => (
              <div key={t.id} style={{ ...s.templateCard, ...(isMobile ? { flex: '0 0 calc(50% - 5px)' } : {}) }}
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
                  ? <img src={t.thumbnail_url} alt={t.name} style={{ width: '100%', height: 120, objectFit: 'contain', borderRadius: 8, background: '#faf7f5' }} />
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
            </div>{/* end templateGrid */}
            </div>{/* end flyoutScroll */}
          </div>
        )}

        {/* ── Canvas area ── */}
        <div style={{ ...s.canvasArea, ...(isMobile ? { order: -1, overflow: 'hidden' } : {}) }}>

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
              pipingStyles={[]}
              pipingToolbar={selectedPiping !== null ? buildToolbar(selectedEl) : null}
              selectedTextId={selectedTextId}
              onTextSelect={handleTextSelect}
              onTextMove={(id, pos) => updateText(id, pos)}
              onTextContentChange={(id, content) => updateText(id, { content })}
              autoRotate={autoRotate}
              textToolbar={selectedText ? buildToolbar(selectedEl) : null}
              onTopperClick={handleTopperClick}
              topperSelected={selectedEl?.type === 'topper'}
              topperToolbar={null}
              selectedStickerIds={selectedStickerIds}
              onStickerSelect={handleStickerSelect}
              onStickerLongPress={handleStickerLongPress}
              onStickerMove={handleStickerMove}
              onGroupMove={handleGroupMove}
              stickerToolbar={selectedEl?.type === 'sticker' && !selectedStickerIsFauxBall ? buildToolbar(selectedEl) : null}
              hitTestRef={hitTestRef}
              snapCameraRef={snapCameraRef}
              cameraPosition={isMobile ? [6, 7, 9] : [4.5, 5.5, 6.5]}
            />
          </Suspense>

          {/* ── Topper toolbar (DOM overlay so it doesn't orbit with the scene) ── */}
          {selectedEl?.type === 'topper' && (
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 200, pointerEvents: 'auto' }}>
              {buildToolbar(selectedEl)}
            </div>
          )}

          {/* ── Multi-select group bar ── */}
          {(multiSelectMode || selectedStickerIds.size > 1) && (() => {
            const ids = [...selectedStickerIds];
            const allGrouped = ids.length > 1 && ids.every(id => {
              const s = design.stickers.find(x => x.id === id);
              return s?.groupId && s.groupId === design.stickers.find(x => x.id === ids[0])?.groupId;
            });
            return (
              <div style={s.groupBar}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>
                  {ids.length === 0 ? 'Tap to select' : ids.length === 1 ? '1 selected — tap more' : `${ids.length} selected`}
                </span>
                {ids.length > 1 && !allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#9b5f72', borderColor: '#f0dce3' }}
                    onClick={() => { groupStickers(ids); clearAllSelections(); }}>
                    Group
                  </button>
                )}
                {ids.length > 1 && allGrouped && (
                  <button style={{ ...s.groupBarBtn, color: '#9b5f72', borderColor: '#f0dce3' }}
                    onClick={() => {
                      const gid = design.stickers.find(x => x.id === ids[0])?.groupId;
                      if (gid) ungroupStickers(gid);
                      clearAllSelections();
                    }}>
                    Ungroup
                  </button>
                )}
                {ids.length > 1 && (
                  <button style={{ ...s.groupBarBtn, color: '#e53935', borderColor: '#fcc' }}
                    onClick={handleDelete}>
                    Delete all
                  </button>
                )}
                <button style={{ ...s.groupBarBtn, color: '#6c47ff', borderColor: '#ddd' }}
                  onClick={clearAllSelections}>
                  Done
                </button>
              </div>
            );
          })()}

          <div style={s.rotateHint}>Drag to rotate</div>

          {/* ── Right edit panel — driven by element caps ── */}
          {showRightPanel && (
            <div style={isMobile ? s.wheelPanelMobile : s.wheelPanel}>
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

              {/* Faux ball single controls */}
              {selectedEl?.type === 'sticker' && (() => {
                const sticker = design.stickers.find(s => s.id === selectedEl.id);
                if (!sticker || sticker.placementMode !== 'faux_ball_single') return null;
                const tierRadius = canvasConfig.tiers[sticker.tierIndex]?.radius ?? 1.2;
                const isSideBall = sticker.zone === 'side' || sticker.zone === 'middle_tier';
                const dist  = Math.sqrt((sticker.x ?? 0) ** 2 + (sticker.z ?? 0) ** 2);
                const theta = Math.atan2(sticker.x ?? 0, sticker.z ?? 0);
                const rdInset = Math.max(0, tierRadius - dist);
                const tierInfo = canvasConfig.tiers[sticker.tierIndex];
                const tierBaseY = (() => {
                  let y = 0;
                  for (let i = 0; i < sticker.tierIndex; i++) y += (canvasConfig.tiers[i]?.height ?? 0.5);
                  return y + 0.1;
                })();
                const tierHeight = tierInfo?.height ?? 0.5;
                function pushApart(newX, newZ, selfR = sticker.scale ?? 0.12) {
                  const maxR  = tierRadius * 0.92;
                  let x = newX, z = newZ;
                  const siblings = design.stickers.filter(
                    s => s.id !== sticker.id && s.placementMode === 'faux_ball_single' && s.tierIndex === sticker.tierIndex && s.zone === sticker.zone
                  );
                  for (const sib of siblings) {
                    const minDist = selfR + (sib.scale ?? 0.12);
                    const ex = x - (sib.x ?? 0), ez = z - (sib.z ?? 0);
                    const d  = Math.sqrt(ex * ex + ez * ez);
                    if (d < minDist && d > 0.001) {
                      x = (sib.x ?? 0) + ex * (minDist / d);
                      z = (sib.z ?? 0) + ez * (minDist / d);
                      const r2 = Math.sqrt(x * x + z * z);
                      if (r2 > maxR) { x = x * maxR / r2; z = z * maxR / r2; }
                    }
                  }
                  return { x, z };
                }
                function setAngle(v) {
                  const { x, z } = pushApart(dist * Math.sin(v), dist * Math.cos(v));
                  updateSticker(sticker.id, { x, z });
                }
                function setInset(v) {
                  const d = Math.max(0, tierRadius - v);
                  const { x, z } = pushApart(d * Math.sin(theta), d * Math.cos(theta));
                  updateSticker(sticker.id, { x, z });
                }
                function pushApartSide(newTheta, newY, selfR = sticker.scale ?? 0.12) {
                  const surfR = tierRadius + selfR;
                  let t = newTheta, y = newY;
                  const siblings = design.stickers.filter(
                    s => s.id !== sticker.id && s.placementMode === 'faux_ball_single' && s.tierIndex === sticker.tierIndex
                  );
                  for (const sib of siblings) {
                    const minDist = selfR + (sib.scale ?? 0.12);
                    const sibSurfR = tierRadius + (sib.scale ?? 0.12);
                    const ax = surfR * Math.sin(t), ay = y, az = surfR * Math.cos(t);
                    const bx = sibSurfR * Math.sin(sib.theta ?? 0), by = sib.y ?? (tierBaseY + tierHeight * 0.5), bz = sibSurfR * Math.cos(sib.theta ?? 0);
                    const ex = ax - bx, ey = ay - by, ez = az - bz;
                    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
                    if (d < minDist && d > 0.001) {
                      t = Math.atan2(bx + ex * (minDist / d), bz + ez * (minDist / d));
                      y = Math.max(tierBaseY + selfR, Math.min(tierBaseY + tierHeight - selfR, by + ey * (minDist / d)));
                    }
                  }
                  return { theta: t, y };
                }
                const SliderRow = ({ label, value, min, max, step, onChange, display }) => {
                  const pct = ((value - min) / (max - min)) * 100;
                  function valFromEvent(e) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const snapped = min + Math.round((ratio * (max - min)) / step) * step;
                    return Math.min(max, Math.max(min, snapped));
                  }
                  return (
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: 0.5 }}>{label}</span>
                        <span style={{ fontSize: 10, color: '#888' }}>{display ?? value.toFixed(3)}</span>
                      </div>
                      <div
                        style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onChange(valFromEvent(e)); }}
                        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); onChange(valFromEvent(e)); }}
                        onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                        onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                      >
                        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                        </div>
                        <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#9b5268', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                  );
                };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4, width: '100%' }}>
                    {isSideBall ? <>
                      {SliderRow({ label: 'Angle', value: sticker.theta ?? 0, min: -Math.PI, max: Math.PI, step: 0.01, display: `${((sticker.theta ?? 0) * 180 / Math.PI).toFixed(1)}°`, onChange: v => { const { theta: t, y } = pushApartSide(v, sticker.y ?? (tierBaseY + tierHeight * 0.5)); updateSticker(sticker.id, { theta: t, y }); } })}
                      {SliderRow({ label: 'Height', value: sticker.y ?? (tierBaseY + tierHeight * 0.5), min: tierBaseY, max: tierBaseY + tierHeight, step: 0.01, onChange: v => { const { theta: t, y } = pushApartSide(sticker.theta ?? 0, v); updateSticker(sticker.id, { theta: t, y }); } })}
                    </> : <>
                      {SliderRow({ label: 'Angle', value: theta, min: -Math.PI, max: Math.PI, step: 0.01, onChange: setAngle, display: `${(theta * 180 / Math.PI).toFixed(1)}°` })}
                      {SliderRow({ label: 'Inset from rim', value: rdInset, min: 0, max: tierRadius * 0.95, step: 0.01, onChange: setInset })}
                    </>}
                    {SliderRow({ label: 'Radius', value: sticker.scale ?? 0.12, min: 0.03, max: 0.35, step: 0.005, onChange: v => {
                      if (isSideBall) {
                        const { theta: t, y } = pushApartSide(sticker.theta ?? 0, sticker.y ?? (tierBaseY + tierHeight * 0.5), v);
                        updateSticker(sticker.id, { scale: v, theta: t, y });
                      } else {
                        const { x, z } = pushApart(sticker.x ?? 0, sticker.z ?? 0, v);
                        updateSticker(sticker.id, { scale: v, x, z });
                      }
                    } })}
                    <button style={{ ...s.iconBtn, width: '100%', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#e53935', background: '#fff0f0', border: '1.5px solid #f5c0c0' }}
                      onClick={handleDelete}>Remove</button>
                  </div>
                );
              })()}

              {/* Resize slider — regular stickers */}
              {caps?.resize && selectedEl?.type === 'sticker' && (() => {
                const sticker = design.stickers.find(s => s.id === selectedEl.id);
                if (!sticker || sticker.placementMode === 'faux_ball_single') return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', paddingTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>Size</div>
                    {(() => {
                      const pct = ((Math.round(sticker.scale * 100) - 25) / 275) * 100;
                      return (
                        <div
                          style={{ width: 200, position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                          onPointerDown={e => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            updateSticker(sticker.id, { scale: (25 + Math.round(ratio * 275 / 5) * 5) / 100 });
                          }}
                          onPointerMove={e => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            updateSticker(sticker.id, { scale: (25 + Math.round(ratio * 275 / 5) * 5) / 100 });
                          }}
                          onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                          onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                        >
                          <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                          </div>
                          <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#9b5268', pointerEvents: 'none' }} />
                        </div>
                      );
                    })()}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{Math.round(sticker.scale * 100)}%</span>
                  </div>
                );
              })()}

            </div>
          )}

          {/* ── Cream Piping popup ── */}
          {pipingPopupOpen && pipingPopupEl && (
            <div style={isMobile ? s.pipingPopupMobile : s.pipingPopup}>
              {/* Header: thumbnail + style name + close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #f0dce3', background: '#fff', flexShrink: 0 }}>
                  {pipingPopupEl.thumbnail_url && <img src={pipingPopupEl.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', flex: 1, fontFamily: "'Quicksand',sans-serif" }}>{pipingPopupEl.name}</span>
                <button style={s.iconBtn} onClick={() => setPipingPopupOpen(false)}>✕</button>
              </div>

              {/* Color + Spacing */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f5eaed', borderBottom: '1px solid #f5eaed' }}>
                <input type="color" value={pipingPopupColor}
                  onChange={e => handlePipingColorChange(e.target.value)}
                  style={{ width: 28, height: 28, border: '1.5px solid #f0dce3', borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                <div
                  style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
                  onPointerDown={e => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    handlePipingSizeChange(+(0.5 + Math.round(ratio * 1.5 / 0.05) * 0.05).toFixed(2));
                  }}
                  onPointerMove={e => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    handlePipingSizeChange(+(0.5 + Math.round(ratio * 1.5 / 0.05) * 0.05).toFixed(2));
                  }}
                  onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
                  onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
                >
                  {(() => { const pct = ((pipingPopupSize - 0.5) / 1.5) * 100; return (<>
                    <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#9b5268', borderRadius: 2 }} />
                    </div>
                    <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#9b5268', pointerEvents: 'none' }} />
                  </>); })()}
                </div>
              </div>

              {/* Per-tier Rim / Board toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
                {design.tiers.map((tier, i) => {
                  const hasRim   = tier.topPiping?.id    === pipingPopupEl.id;
                  const hasBoard = tier.bottomPiping?.id === pipingPopupEl.id;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#555', flex: 1, fontFamily: "'Quicksand',sans-serif" }}>{TIER_LABELS[i]}</span>
                      <button
                        onClick={() => togglePipingZone(i, 'rim', hasRim)}
                        style={{ ...s.zoneToggle, ...(hasRim ? s.zoneToggleOn : {}) }}>
                        Rim
                      </button>
                      <button
                        onClick={() => togglePipingZone(i, 'board', hasBoard)}
                        style={{ ...s.zoneToggle, ...(hasBoard ? s.zoneToggleOn : {}) }}>
                        Board
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>{/* end main */}

      {/* ── Order + Save Template bar ── */}
      {selectedEl?.type !== 'text' && (
        <div style={{ ...s.orderBar, ...(isMobile ? { padding: '6px 16px 10px' } : {}), display: 'flex', gap: 8 }}>
          <button
            style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
            onClick={handleOrder}>
            {editingOrder ? 'Update Design' : 'Order This Cake'}
          </button>
          <button
            style={{ ...s.orderBtn, ...brandBtn, width: 'auto', flex: 1, whiteSpace: 'nowrap', opacity: 0.75, ...(isMobile ? { padding: '10px', fontSize: 13 } : { padding: '9px 16px', fontSize: 13 }) }}
            onClick={() => setSaveModal(true)}>
            Save as Template
          </button>
        </div>
      )}

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <div style={s.mobileBottomNav}>
          {/* New cake — circle + as first nav item */}
          <button style={{ ...s.sidebarBtn, borderRadius: '50%', border: '1.8px solid rgba(255,255,255,0.45)', color: '#fff' }} onClick={handleNewCake}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {[
            { id: 'dashboard',  icon: <DashboardIcon size={20} /> },
            { id: 'templates',  icon: <TemplatesIcon size={20} /> },
            { id: 'elements',   icon: <ElementsIcon size={20} /> },
            { id: 'text',       icon: <TextIcon size={20} /> },
            { id: 'orders',     icon: <OrdersIcon size={20} /> },
            { id: 'customers',  icon: <CustomersIcon size={20} /> },
          ].map(({ id, icon }) => {
            const active = id === 'elements' ? elementsOpen : id === 'templates' ? templatesOpen : false;
            return (
              <button key={id}
                style={{ ...s.sidebarBtn, ...(active ? s.sidebarBtnActive : {}) }}
                onClick={() => {
                  if (id === 'text')      { stopRotatingOnFirstEdit(); addText(); }
                  if (id === 'elements')  openElements();
                  if (id === 'templates') openTemplates();
                  if (id === 'dashboard') setDashboardOpen(true);
                  if (id === 'orders')    setOrdersPanelOpen(true);
                  if (id === 'customers') setCustomersPanelOpen(true);
                }}>
                {icon}
              </button>
            );
          })}
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
              {saving ? 'Saving...' : 'Save as Template'}
            </button>
          </div>
        </div>
      )}

      {/* ── Color Guide modal ── */}
      {colorGuideOpen && (
        <ColorGuide
          onClose={() => setColorGuideOpen(false)}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
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

      {/* ── Billing panel ── */}
      <BillingPanel
        open={billingPanelOpen}
        onClose={() => setBillingPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />

      {/* ── Settings panel ── */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
        onBrandingUpdate={({ primary_color, accent_color, logo_url }) => {
          setBakerData(b => ({ ...b, primary_color, accent_color, logo_url }));
        }}
      />

      {/* ── Orders panel ── */}
      <OrdersPanel
        open={ordersPanelOpen}
        onClose={() => { setOrdersPanelOpen(false); setOrdersFilter(null); }}
        onBack={ordersFilter ? () => { setOrdersPanelOpen(false); setOrdersFilter(null); setDashboardOpen(true); } : null}
        externalFilter={ordersFilter}
        onEditDesign={(order) => {
          setEditingOrder(order);
          setOrdersPanelOpen(false);
          if (order.design_snapshot) {
            try { loadDesign(order.design_snapshot); } catch (e) { console.error('loadDesign failed', e); }
          }
        }}
        apiClient={apiClient}
        primaryColor={primaryColor}
        homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
      />

      {/* ── Dashboard panel ── */}
      <DashboardPanel
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        accentColor={accentColor}
        onNavigateOrders={(filter) => {
          setOrdersFilter(filter);
          setDashboardOpen(false);
          setOrdersPanelOpen(true);
        }}
        onNavigateCustomers={(filter) => {
          setCustomersFilter(filter);
          setDashboardOpen(false);
          setCustomersPanelOpen(true);
        }}

      />

      {/* ── Customers panel ── */}
      <CustomersPanel
        open={customersPanelOpen}
        onClose={() => { setCustomersPanelOpen(false); setCustomersFilter(null); }}
        onBack={customersFilter ? () => { setCustomersPanelOpen(false); setCustomersFilter(null); setDashboardOpen(true); } : null}
        apiClient={apiClient}
        primaryColor={primaryColor}
        externalFilter={customersFilter}
      />

      {/* ── Order modal ── */}
      {orderModalOpen && (
        <OrderModal
          tierCount={design.tiers.length}
          onClose={() => { setOrderModalOpen(false); setEditingOrder(null); }}
          onSubmit={handleOrderSubmit}
          editingOrder={editingOrder}
          apiClient={apiClient}
          supabase={supabase}
          bakerId={bakerData?.id}
          bakerSlug={bakerData?.slug}
          homeDeliveryEnabled={!!bakerSettings?.delivery?.home_delivery}
          brandBtn={brandBtn}
          primaryColor={primaryColor}
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
  flyoutScroll: {
    flex: 1, overflowY: 'auto', minHeight: 0,
    display: 'flex', flexDirection: 'column', gap: 10,
    paddingBottom: 8,
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
    flexShrink: 0,
  },
  elementCardLabel: {
    fontSize: 10, fontWeight: 700, color: '#666',
    letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center',
  },
  elementCardCheck: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 11, color: '#333', fontWeight: 800,
  },
  templateGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
  },
  templateCard: {
    border: '1.5px solid #f0dce3', borderRadius: 12,
    overflow: 'hidden', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '0 0 8px',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  templateThumbPlaceholder: {
    width: '100%', height: 120,
    background: '#faf7f5', display: 'flex',
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
  groupBar: {
    position:'absolute', bottom:60, left:'50%', transform:'translateX(-50%)',
    display:'flex', alignItems:'center', gap:8,
    background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)',
    padding:'8px 14px', borderRadius:12, whiteSpace:'nowrap',
    boxShadow:'0 4px 20px rgba(107,45,66,0.22)',
    border:'1px solid rgba(240,220,227,0.9)',
    zIndex:30, pointerEvents:'auto',
  },
  groupBarBtn: {
    background:'none', border:'1.5px solid #e0d0d5', borderRadius:8,
    padding:'4px 10px', fontSize:11, cursor:'pointer',
    fontWeight:700, fontFamily:"'Quicksand',sans-serif",
  },

  zoneToggle: {
    padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
    border: '1.5px solid #e0d0d5', background: 'transparent',
    color: '#888', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif",
    transition: 'all 0.12s',
  },
  zoneToggleOn: {
    background: 'rgba(155,95,114,0.12)',
    border: '1.5px solid #9b5f72',
    color: '#9b5f72',
  },

  pipingPopup: {
    position: 'absolute',
    right: 14, top: '50%', transform: 'translateY(-50%)',
    width: 248, maxHeight: '80vh',
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: 20,
    padding: '14px 16px 16px',
    boxShadow: '0 4px 24px rgba(107,45,66,0.14)',
    display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto',
    zIndex: 20,
  },

  // Mobile-specific
  mobileHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', height: 52, flexShrink: 0,
    background: '#fff', borderBottom: '1px solid #f0e8ea',
    position: 'relative', zIndex: 10,
  },
  mobileBottomNav: {
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    height: 60, background: '#18191b', flexShrink: 0, padding: '0 4px',
  },
  flyoutMobile: {
    position: 'relative',
    left: 'auto', top: 'auto', bottom: 'auto',
    width: '100%', flexShrink: 0,
    margin: 0, borderRadius: '20px 20px 0 0',
    zIndex: 1, order: 0,
    boxShadow: '0 -2px 16px rgba(0,0,0,0.10)',
  },
  panelHandle: {
    width: '100%', display: 'flex', justifyContent: 'center',
    padding: '6px 0 10px', cursor: 'ns-resize', touchAction: 'none', flexShrink: 0,
  },
  panelHandlePill: {
    width: 36, height: 4, borderRadius: 2, background: '#ddd',
  },
  wheelPanelMobile: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '80%', overflowY: 'auto',
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '20px 20px 0 0',
    padding: '14px 16px 24px',
    boxShadow: '0 -4px 24px rgba(107,45,66,0.14)',
    zIndex: 20,
  },
  pipingPopupMobile: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '20px 20px 0 0',
    padding: '14px 16px 24px',
    boxShadow: '0 -4px 24px rgba(107,45,66,0.14)',
    display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto', maxHeight: '60vh',
    zIndex: 20,
  },
};
