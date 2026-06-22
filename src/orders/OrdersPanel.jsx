import { useState, useEffect, useCallback, Fragment } from 'react';
import XrayReport from './xray/XrayReport.jsx';
import PhotoSheet from './PhotoSheet.jsx';

const PhotoGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.6" /><path d="M21 16l-5-5-6 6" />
  </svg>
);

// Show the print-sheet action only when the order actually has customer-uploaded photo frames.
function hasPhotoFrames(order) {
  return (order?.design_snapshot?.stickers ?? []).some(s => s?.photoMask && s?.photoUrl);
}

function PhotoSheetLauncher({ order }) {
  const [open, setOpen] = useState(false);
  if (!hasPhotoFrames(order)) return null;
  return (
    <>
      <IconAction glyph={<PhotoGlyph />} label="Print sheet" onClick={() => setOpen(true)} />
      {open && <PhotoSheet order={order} onClose={() => setOpen(false)} />}
    </>
  );
}

const XrayGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);
const Cube3D = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 2.6 L20.5 7 L20.5 17 L12 21.4 L3.5 17 L3.5 7 Z" /><path d="M3.5 7 L12 11.5 L20.5 7" /><path d="M12 11.5 L12 21.4" />
  </svg>
);
const LockGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
  </svg>
);
const PencilGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

// Icon + label control — matches the "Edit Details" button: white, light border,
// grey icon + text. No colour fill. Used for the cake-panel actions.
function IconAction({ glyph, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 10,
        border: '1.5px solid #E0DDD8', background: '#fff',
        fontSize: 13, fontWeight: 700, color: '#444', fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {glyph} {label}
    </button>
  );
}

// X-Ray launcher — an icon+label action that opens the report.
function XrayLauncher({ order, apiClient }) {
  const [open, setOpen] = useState(false);
  if (!order?.design_snapshot) return null;
  return (
    <>
      <IconAction glyph={<XrayGlyph />} label="X-Ray report" onClick={() => setOpen(true)} />
      {open && <XrayReport order={order} apiClient={apiClient} onClose={() => setOpen(false)} />}
    </>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const TIER_LABELS = ['Bottom Tier', '2nd Tier', '3rd Tier', 'Top Tier'];

const STATUS_META = {
  pending:     { label: 'Pending',     bg: '#FEF9C3', color: '#92400E' },
  approved:    { label: 'Approved',    bg: '#D1FAE5', color: '#065F46' },
  in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#1E40AF' },
  ready:       { label: 'Ready',       bg: '#EDE9FE', color: '#4C1D95' },
  delivered:   { label: 'Delivered',   bg: '#F0FDF4', color: '#14532D' },
  cancelled:   { label: 'Cancelled',   bg: '#FEE2E2', color: '#991B1B' },
};
const ALL_STATUSES = Object.keys(STATUS_META);

// Neutral, monochrome badge tones — no hues. In-progress states read as soft grey,
// "Delivered" is a solid black (complete), "Cancelled" a muted outline.
const STATUS_TONE = {
  pending:     { bg: '#F2F1EE', color: '#777', border: 'transparent' },
  approved:    { bg: '#ECEBE6', color: '#5e5e5e', border: 'transparent' },
  in_progress: { bg: '#E4E2DC', color: '#4a4a4a', border: 'transparent' },
  ready:       { bg: '#D9D6CF', color: '#3a3a3a', border: 'transparent' },
  delivered:   { bg: '#1a1a1a', color: '#fff', border: 'transparent' },
  cancelled:   { bg: '#fff', color: '#999', border: '#E0DDD8' },
};

function StatusBadge({ status }) {
  const label = STATUS_META[status]?.label ?? status;
  const t = STATUS_TONE[status] ?? { bg: '#F2F1EE', color: '#555', border: 'transparent' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      letterSpacing: 0.3, background: t.bg, color: t.color,
      border: `1px solid ${t.border}`, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function fmt(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#222', lineHeight: 1.5, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

// Normalise an order's stored flavours into editable rows. Entries may come back
// as { name | flavour, flavourId | flavour_id, tier, source }.
function normaliseFlavours(order) {
  const rows = (order.flavours ?? []).map((f, i) => ({
    tier:      f.tier ?? i,
    name:      f.name ?? f.flavour ?? '',
    flavourId: f.flavourId ?? f.flavour_id ?? null,
    source:    f.source ?? null,
  }));
  return rows.length ? rows : [{ tier: 0, name: '', flavourId: null, source: null }];
}

function EditForm({ order, onSave, onCancel, saving, serverError, homeDeliveryEnabled = false, availableFlavours = [] }) {
  const [form, setForm] = useState({
    weight_kg:            order.weight_kg ?? '',
    delivery_date:        order.delivery_date ?? '',
    delivery_time:        order.delivery_time ?? '',
    delivery_mode:        (!homeDeliveryEnabled && order.delivery_mode === 'home_delivery') ? 'pickup' : (order.delivery_mode ?? 'pickup'),
    delivery_address:     order.delivery_address ?? '',
    special_instructions: order.special_instructions ?? '',
    flavours:             normaliseFlavours(order),
    comment:              '',
  });
  const [errors, setErrors] = useState({});

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: null })); }

  function setFlavour(tierIdx, flavourId) {
    const picked = availableFlavours.find(f => f.id === flavourId) ?? null;
    setForm(f => ({
      ...f,
      flavours: f.flavours.map((row, i) => i === tierIdx
        ? { ...row, name: picked?.name ?? '', flavourId: picked?.id ?? null, source: picked?.source ?? null }
        : row),
    }));
  }

  function setFlavourName(tierIdx, name) {
    setForm(f => ({
      ...f,
      flavours: f.flavours.map((row, i) => i === tierIdx
        ? { ...row, name, flavourId: null, source: null }
        : row),
    }));
  }

  const multiTier = form.flavours.length > 1;

  function validate() {
    const e = {};
    if (form.delivery_mode === 'home_delivery' && !form.delivery_address.trim())
      e.delivery_address = 'Address is required for home delivery';
    if (!form.comment.trim())
      e.comment = 'Please add a comment explaining the change';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(form);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Weight (kg)">
          <input style={inp} type="number" min="0.5" step="0.5"
            value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} />
        </Field>
      </div>

      <Field label={multiTier ? 'Flavour per tier' : 'Flavour'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {form.flavours.map((row, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {multiTier && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb' }}>
                  {TIER_LABELS[i] ?? `Tier ${i + 1}`}
                </span>
              )}
              {availableFlavours.length > 0 ? (
                <select
                  style={{ ...inp, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                  value={row.flavourId ?? ''}
                  onChange={e => setFlavour(i, e.target.value || null)}
                >
                  <option value="">— Select flavour —</option>
                  {/* Keep a free-text legacy flavour selectable even if not in the list */}
                  {row.name && !row.flavourId && !availableFlavours.some(f => f.name === row.name) && (
                    <option value="">{row.name}</option>
                  )}
                  {availableFlavours.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              ) : (
                <input style={inp} placeholder="e.g. Vanilla"
                  value={row.name}
                  onChange={e => setFlavourName(i, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Delivery date">
          <input style={inp} type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
        </Field>
        <Field label="Time">
          <input style={inp} type="time" value={form.delivery_time} onChange={e => set('delivery_time', e.target.value)} />
        </Field>
      </div>

      <Field label="Delivery mode">
        <div style={{ display: 'flex', gap: 8 }}>
          {[['pickup', 'Pickup'], ['home_delivery', 'Home Delivery']].map(([val, label]) => {
            const disabled = val === 'home_delivery' && !homeDeliveryEnabled;
            if (disabled) return null;
            const active = form.delivery_mode === val;
            return (
              <button key={val} onClick={() => set('delivery_mode', val)} style={{
                flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${active ? '#555' : '#E0DDD8'}`,
                background: active ? '#1a1a1a' : '#fff',
                color: active ? '#fff' : '#888',
              }}>{label}</button>
            );
          })}
        </div>
      </Field>

      {form.delivery_mode === 'home_delivery' && (
        <Field label="Address *" error={errors.delivery_address}>
          <textarea
            style={{ ...inp, minHeight: 72, resize: 'vertical', borderColor: errors.delivery_address ? '#e53935' : inp.borderColor }}
            value={form.delivery_address} onChange={e => set('delivery_address', e.target.value)} />
        </Field>
      )}

      <Field label="Special instructions">
        <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }}
          value={form.special_instructions} onChange={e => set('special_instructions', e.target.value)} />
      </Field>

      <Field label="Comment *" hint="Explain what you changed and why" error={errors.comment}>
        <textarea
          style={{ ...inp, minHeight: 72, resize: 'vertical', borderColor: errors.comment ? '#e53935' : '#f59e0b' }}
          placeholder="e.g. Customer called and changed delivery date to Friday"
          value={form.comment} onChange={e => set('comment', e.target.value)} />
      </Field>

      {serverError && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', border: '1px solid #FECACA', fontSize: 13, color: '#991B1B', fontWeight: 600 }}>
          {serverError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: '12px', borderRadius: 12, border: 'none',
          background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel} style={{
          padding: '12px 18px', borderRadius: 12, border: '1.5px solid #E0DDD8',
          background: '#fff', color: '#666', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: error ? '#e53935' : '#aaa', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      {hint && !error && <span style={{ fontSize: 11, color: '#bbb', marginTop: -2 }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: '#e53935', fontWeight: 600, marginTop: -2 }}>{error}</span>}
      {children}
    </div>
  );
}

const inp = {
  padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E0DDD8',
  fontSize: 13, fontFamily: 'inherit', color: '#222',
  outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff',
};

// ── Audit trail ───────────────────────────────────────────────────────────────

// Render an audit value; flavours come through as an array of objects.
function fmtAuditValue(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    const names = v.map(f => f?.name ?? f?.flavour).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }
  return String(v);
}

function AuditTrail({ orderId, apiClient, refresh }) {
  const [log, setLog]       = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiClient?.fetchOrderAudit) return;
    setLoading(true);
    apiClient.fetchOrderAudit(orderId)
      .then(data => setLog(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId, refresh]);

  if (loading) return <div style={{ fontSize: 12, color: '#bbb', padding: '8px 0' }}>Loading history…</div>;
  if (!log.length) return <div style={{ fontSize: 12, color: '#ddd', padding: '8px 0' }}>No changes recorded yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {log.map((entry, i) => {
        const isLast = i === log.length - 1;
        const changedFields = entry.changes ? Object.keys(entry.changes) : [];
        return (
          <div key={entry.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {/* Timeline line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', marginTop: 4,
                background: entry.event === 'status_changed' ? '#6366f1' : entry.event === 'design_updated' ? '#10b981' : '#f59e0b',
                border: '2px solid #fff', boxShadow: '0 0 0 1px #E0DDD8', flexShrink: 0,
              }} />
              {!isLast && <div style={{ width: 2, flex: 1, background: '#F0EDE8', minHeight: 16 }} />}
            </div>

            <div style={{ paddingBottom: isLast ? 0 : 16, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>
                    {entry.event === 'status_changed' ? 'Status changed' : entry.event === 'design_updated' ? 'Design updated' : 'Order edited'}
                  </span>
                  {entry.changed_by_name && (
                    <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>by {entry.changed_by_name}</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>
                  {new Date(entry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {changedFields.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                  {changedFields.map(f => {
                    const { from, to } = entry.changes[f];
                    return (
                      <div key={f} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#bbb' }}>{f.replace(/_/g, ' ')}:</span>
                        <span style={{ textDecoration: 'line-through', color: '#ccc' }}>{fmtAuditValue(from)}</span>
                        <span>→</span>
                        <span style={{ color: '#444', fontWeight: 600 }}>{fmtAuditValue(to)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {entry.comment && (
                <div style={{
                  marginTop: 6, fontSize: 12, color: '#555', fontStyle: 'italic',
                  background: '#FAFAF8', border: '1px solid #F0EDE8',
                  borderRadius: 8, padding: '6px 10px',
                }}>
                  "{entry.comment}"
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail pane ───────────────────────────────────────────────────────────────

function OrderDetail({ order, onEditDesign, onStatusChange, onOrderEdited, apiClient, primaryColor, isMobile, homeDeliveryEnabled = false, bakerSlug = null }) {
  const [changingStatus, setChangingStatus] = useState(false);
  const [editing, setEditing]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [auditRefresh, setAuditRefresh]     = useState(0);
  const [availableFlavours, setAvailableFlavours] = useState([]);

  useEffect(() => {
    if (!bakerSlug || !apiClient?.fetchFlavours) return;
    apiClient.fetchFlavours(bakerSlug)
      .then(data => { if (Array.isArray(data)) setAvailableFlavours(data); })
      .catch(() => {});
  }, [bakerSlug]);

  const customer  = order.customers;
  const name      = customer ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() : 'Unknown';
  const flavours  = (order.flavours ?? []).map(f => f.name ?? f.flavour).filter(Boolean);
  const delivDate = fmt(order.delivery_date);

  async function handleStatus(s) {
    if (s === order.status || changingStatus) return;
    setChangingStatus(true);
    await onStatusChange(order.id, s);
    setAuditRefresh(r => r + 1);
    setChangingStatus(false);
  }

  const [saveError, setSaveError] = useState(null);

  async function handleSaveEdit(formData) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiClient.editOrder(order.id, formData);
      onOrderEdited({ ...order, ...updated });
      setEditing(false);
      setAuditRefresh(r => r + 1);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isDelivered = order.status === 'delivered';
  const editBtn = isDelivered ? (
    <IconAction glyph={<LockGlyph />} label="Design locked" disabled />
  ) : (
    <IconAction glyph={<Cube3D />} label="Edit in 3D" onClick={() => onEditDesign(order)} disabled={!order.design_snapshot} />
  );

  // The cake-panel actions, side by side below the cake.
  const cakeActions = (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
      <XrayLauncher order={order} apiClient={apiClient} />
      <PhotoSheetLauncher order={order} />
      {editBtn}
      {!editing && <IconAction glyph={<PencilGlyph />} label="Edit Details" onClick={() => setEditing(true)} />}
    </div>
  );

  // ── Mobile: stacked layout ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Snapshot */}
        <div style={{
          width: '100%', aspectRatio: '4/3', borderRadius: 16, overflow: 'hidden',
          background: '#F0EDE8', border: '1.5px solid #E8E4DC',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          {order.design_thumbnail_url
            ? <img src={order.design_thumbnail_url} alt="Cake design"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <div style={{ textAlign: 'center', color: '#ccc' }}>
                <div style={{ fontSize: 48 }}>🎂</div>
                <div style={{ fontSize: 13 }}>No preview</div>
              </div>
          }
        </div>
        <div style={{ marginBottom: 20 }}>{cakeActions}</div>
        {editing
          ? <EditForm order={order} onSave={handleSaveEdit} onCancel={() => { setEditing(false); setSaveError(null); }} saving={saving} serverError={saveError} homeDeliveryEnabled={homeDeliveryEnabled} availableFlavours={availableFlavours} />
          : <>
              <StatusProgress status={order.status} onChange={handleStatus} disabled={changingStatus} />
              <DetailSections order={order} name={name} flavours={flavours} delivDate={delivDate} />
              <Section title="History">
                <AuditTrail orderId={order.id} apiClient={apiClient} refresh={auditRefresh} />
              </Section>
            </>
        }
      </div>
    );
  }

  // ── Desktop: side-by-side layout ──────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Left: cake image + edit */}
      <div style={{
        width: '42%', flexShrink: 0, background: '#F0EDE8',
        display: 'flex', flexDirection: 'column',
        borderRight: '1.5px solid #E8E4DC', padding: 24, gap: 20,
      }}>
        <div style={{
          flex: 1, borderRadius: 20, overflow: 'hidden',
          background: '#fff', border: '1.5px solid #E8E4DC',
          display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
        }}>
          {order.design_thumbnail_url
            ? <img src={order.design_thumbnail_url} alt="Cake design"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <div style={{ textAlign: 'center', color: '#ccc' }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>🎂</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No preview</div>
              </div>
          }
        </div>
        {cakeActions}
      </div>

      {/* Right: details */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
        {editing
          ? <EditForm order={order} onSave={handleSaveEdit} onCancel={() => { setEditing(false); setSaveError(null); }} saving={saving} serverError={saveError} homeDeliveryEnabled={homeDeliveryEnabled} availableFlavours={availableFlavours} />
          : <>
              <StatusProgress status={order.status} onChange={handleStatus} disabled={changingStatus} />
              <DetailSections order={order} name={name} flavours={flavours} delivDate={delivDate} />
              <Section title="History">
                <AuditTrail orderId={order.id} apiClient={apiClient} refresh={auditRefresh} />
              </Section>
            </>
        }
      </div>
    </div>
  );
}

function DetailSections({ order, name, flavours, delivDate }) {
  const customer = order.customers;
  return (
    <>
      <Section title="Customer">
        <InfoRow label="Name"  value={name} />
        <InfoRow label="Phone" value={customer?.phone} />
        <InfoRow label="Email" value={customer?.email} />
      </Section>

      <Section title="Order">
        {order.weight_kg && <InfoRow label="Weight" value={`${order.weight_kg} kg`} />}
        {flavours.length > 0 && <InfoRow label="Flavours" value={flavours.join(', ')} />}
        {order.special_instructions && <InfoRow label="Notes" value={order.special_instructions} />}
      </Section>

      <Section title="Delivery">
        <InfoRow label="Mode"    value={order.delivery_mode === 'home_delivery' ? 'Home Delivery' : 'Pickup'} />
        <InfoRow label="Date"    value={delivDate} />
        <InfoRow label="Time"    value={order.delivery_time} />
        <InfoRow label="Address" value={order.delivery_address} />
      </Section>

      <div style={{ marginTop: 4, fontSize: 11, color: '#ccc', fontFamily: 'monospace' }}>
        #{order.id.toUpperCase()} · placed {fmt(order.created_at)}
      </div>
    </>
  );
}

function Section({ title, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#bbb', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14, borderBottom: '1px solid #F0EDE8', paddingBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items}
      </div>
    </div>
  );
}

// ── List pane ─────────────────────────────────────────────────────────────────

function OrderList({ orders, loading, error, filter, onFilter, onSelect, selected, primaryColor, isMobile }) {
  const counts  = ALL_STATUSES.reduce((a, s) => ({ ...a, [s]: orders.filter(o => o.status === s).length }), {});
  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div style={{
      width: isMobile ? '100%' : 320, flexShrink: 0,
      borderRight: isMobile ? 'none' : '1.5px solid #E8E4DC',
      background: '#fff', display: 'flex', flexDirection: 'column',
    }}>
      {/* Filter chips */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #F0EDE8', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
        {[{ key: 'all', label: 'All', count: orders.length },
          ...ALL_STATUSES.filter(s => counts[s] > 0).map(s => ({ key: s, label: STATUS_META[s].label, count: counts[s] }))
        ].map(({ key, label, count }) => {
          const active = filter === key;
          return (
            <button key={key} onClick={() => onFilter(key)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              fontFamily: 'inherit',
              background: active ? primaryColor : '#F0EDE8',
              color: active ? '#fff' : '#777',
            }}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <Empty>Loading…</Empty>}
        {!loading && error && <Empty color="#e53935">{error}</Empty>}
        {!loading && !error && visible.length === 0 && <Empty>No orders yet.</Empty>}

        {!loading && visible.map(order => {
          const c     = order.customers;
          const name  = c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Unknown';
          const isSelected = selected?.id === order.id;
          const flavours = (order.flavours ?? []).map(f => f.name ?? f.flavour).filter(Boolean);

          return (
            <div key={order.id} onClick={() => onSelect(order)} style={{
              padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #F8F6F2',
              background: isSelected ? '#FAF7F4' : '#fff',
              borderLeft: isSelected ? `3px solid ${primaryColor}` : '3px solid transparent',
              transition: 'background 0.1s',
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              {/* Thumbnail */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: '#F0EDE8', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid #E8E4DC',
              }}>
                {order.design_thumbnail_url
                  ? <img src={order.design_thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 20 }}>🎂</span>
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[fmt(order.delivery_date), flavours[0]].filter(Boolean).join(' · ') || fmt(order.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function OrdersPanel({ open, onClose, onBack, onEditDesign, apiClient, primaryColor = '#1a1a1a', externalFilter = null, homeDeliveryEnabled = false, initialOrderId = null, bakerSlug = null }) {
  const isMobile = useIsMobile();
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    const params = externalFilter?.params ?? {};
    apiClient.fetchOrders(params)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        if (initialOrderId) {
          const match = list.find(o => o.id === initialOrderId);
          if (match) { setSelected(match); return; }
        }
        if (list.length && !isMobile) setSelected(list[0]);
      })
      .catch(err => setError(err.message ?? 'Failed to load orders'))
      .finally(() => setLoading(false));
  }, [open, externalFilter]);

  async function handleStatusChange(orderId, newStatus) {
    await apiClient.updateOrderStatus(orderId, newStatus);
    setOrders(os => os.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setSelected(s => s?.id === orderId ? { ...s, status: newStatus } : s);
  }

  if (!open) return null;

  // Mobile: show list OR detail (not both)
  const showDetail = isMobile ? !!selected : true;
  const showList   = isMobile ? !selected  : true;

  const topBarTitle = isMobile && selected ? 'Order Details' : 'Orders';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        left: isMobile ? 0 : 76,
        zIndex: 300,
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F7F5F0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      }}>
        {/* Top bar */}
        <div style={{
          height: 56, padding: '0 20px', background: '#fff',
          borderBottom: '1.5px solid #E8E4DC', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button onClick={isMobile && selected ? () => setSelected(null) : (onBack ?? onClose)} style={closeBtn}>
            <ArrowLeftIcon />
          </button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', flex: 1 }}>{topBarTitle}</span>
          {(!isMobile || !selected) && (
            <span style={{ fontSize: 13, color: '#bbb' }}>{orders.length} total</span>
          )}
          {onBack && (
            <button onClick={onClose} style={closeBtn} title="Home">
              <HomeIcon />
            </button>
          )}
        </div>

        {/* Filter banner */}
        {externalFilter && !selected && (
          <div style={{
            padding: '8px 20px', background: '#FEF9C3', borderBottom: '1px solid #FCD34D',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', flex: 1 }}>
              🔍 {externalFilter.label}
            </span>
            <button onClick={onClose} style={{
              fontSize: 11, fontWeight: 700, color: '#92400E', background: 'none',
              border: '1px solid #FCD34D', borderRadius: 6, padding: '2px 8px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>✕ Clear</button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {showList && (
            <OrderList
              orders={orders}
              loading={loading}
              error={error}
              filter={filter}
              onFilter={setFilter}
              onSelect={setSelected}
              selected={selected}
              primaryColor={primaryColor}
              isMobile={isMobile}
            />
          )}

          {/* Detail pane */}
          {showDetail && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {selected
                ? <OrderDetail
                    order={selected}
                    onEditDesign={(order) => { onClose(); onEditDesign(order); }}
                    onStatusChange={handleStatusChange}
                    onOrderEdited={(updated) => {
                      setOrders(os => os.map(o => o.id === updated.id ? { ...o, ...updated } : o));
                      setSelected(s => s?.id === updated.id ? { ...s, ...updated } : s);
                    }}
                    apiClient={apiClient}
                    primaryColor={primaryColor}
                    isMobile={isMobile}
                    homeDeliveryEnabled={homeDeliveryEnabled}
                    bakerSlug={bakerSlug}
                  />
                : <Empty>Select an order to view details.</Empty>
              }
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Empty({ children, color = '#bbb' }) {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 14, padding: 40, textAlign: 'center' }}>{children}</div>;
}

const FLOW_STEPS = [
  { key: 'pending',     label: 'Placed',    short: 'Placed'    },
  { key: 'approved',    label: 'Approved',  short: 'Approved'  },
  { key: 'in_progress', label: 'Baking',    short: 'Baking'    },
  { key: 'ready',       label: 'Ready',     short: 'Ready'     },
  { key: 'delivered',   label: 'Delivered', short: 'Done'      },
];

// Reached steps render ink-black, unreached stay white/grey — a clean monochrome
// stepper (no per-status colours, no red).
const INK = '#1a1a1a';

function StatusProgress({ status, onChange, disabled, readOnly = false }) {
  const isMobile    = useIsMobile();
  const isCancelled = status === 'cancelled';
  const currentIdx  = FLOW_STEPS.findIndex(s => s.key === status);

  const cancelledBanner = (
    <div style={{
      marginBottom: 20, padding: '12px 16px', borderRadius: 12,
      background: '#F3F2EF', border: '1.5px solid #E0DDD8',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: INK }}>
        <span style={{ fontSize: 18 }}>✕</span> Order Cancelled
      </div>
      {!readOnly && (
        <button onClick={() => onChange('pending')} disabled={disabled} style={{
          fontSize: 11, fontWeight: 700, color: INK, background: 'none',
          border: '1.5px solid #E0DDD8', borderRadius: 8, padding: '4px 10px',
          cursor: 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        }}>Reopen</button>
      )}
    </div>
  );

  if (isCancelled) return cancelledBanner;

  // ── Mobile: vertical stepper ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ marginBottom: 20 }}>
        {FLOW_STEPS.map((step, i) => {
          const done     = i < currentIdx;
          const active   = i === currentIdx;
          const isLast   = i === FLOW_STEPS.length - 1;
          const reached  = done || active;
          const dotColor = reached ? INK : '#d1d5db';
          const canClick = !readOnly && !disabled && !active;

          return (
            <div
              key={step.key}
              onClick={() => canClick && onChange(step.key)}
              style={{
                display: 'flex', gap: 16,
                cursor: canClick ? 'pointer' : 'default',
                minHeight: isLast ? 32 : 0,
              }}
            >
              {/* Left: dot + vertical connector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: reached ? INK : '#fff',
                  border: `2.5px solid ${dotColor}`,
                  color: reached ? '#fff' : '#bbb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  transition: 'all 0.2s',
                  boxShadow: active ? '0 0 0 4px rgba(26,26,26,0.12)' : 'none',
                }}>
                  {done
                    ? <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3" /></svg>
                    : i + 1}
                </div>
                {!isLast && (
                  <div style={{
                    width: 2, flex: 1, minHeight: 20,
                    background: done ? INK : '#E8E4DC',
                    margin: '3px 0', transition: 'background 0.3s',
                  }} />
                )}
              </div>

              {/* Right: label */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                paddingBottom: isLast ? 0 : 20,
              }}>
                <span style={{
                  fontSize: 15, fontWeight: active ? 700 : 500,
                  color: reached ? INK : '#bbb',
                  transition: 'color 0.2s',
                }}>{step.label}</span>
              </div>
            </div>
          );
        })}

        {!readOnly && status !== 'delivered' && (
          <button onClick={e => { e.stopPropagation(); onChange('cancelled'); }} disabled={disabled} style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            fontSize: 12, color: '#888', fontFamily: 'inherit', fontWeight: 600,
            textDecoration: 'underline', textUnderlineOffset: 2,
            cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
          }}>Cancel order</button>
        )}
      </div>
    );
  }

  // ── Desktop: horizontal stepper ─────────────────────────────────────────────
  const dotSize = 30;
  const connectorMarginTop = Math.round((dotSize - 3) / 2);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {FLOW_STEPS.map((step, i) => {
          const done     = i < currentIdx;
          const active   = i === currentIdx;
          const reached  = done || active;
          const dotColor = reached ? INK : '#d1d5db';
          const canClick = !readOnly && !disabled && !active;

          return (
            <Fragment key={step.key}>
              {i > 0 && (
                <div style={{
                  flex: 1, height: 3, borderRadius: 2,
                  marginTop: connectorMarginTop,
                  background: reached ? INK : '#E8E4DC',
                  transition: 'background 0.3s',
                }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <button
                  onClick={() => canClick && onChange(step.key)}
                  disabled={!canClick}
                  title={step.label}
                  style={{
                    width: dotSize, height: dotSize, borderRadius: '50%', flexShrink: 0,
                    background: reached ? INK : '#fff',
                    border: `2.5px solid ${dotColor}`,
                    color: reached ? '#fff' : '#bbb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: canClick ? 'pointer' : 'default',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                    transition: 'all 0.2s',
                    boxShadow: active ? '0 0 0 4px rgba(26,26,26,0.12)' : 'none',
                    outline: 'none',
                  }}
                >
                  {done
                    ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3" /></svg>
                    : i + 1}
                </button>
                <span style={{
                  fontSize: 9, fontWeight: 700, textAlign: 'center',
                  color: reached ? INK : '#aaa',
                  lineHeight: 1.2, whiteSpace: 'nowrap',
                }}>{step.short}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {!readOnly && status !== 'delivered' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={() => onChange('cancelled')} disabled={disabled} style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: '#888', fontFamily: 'inherit', fontWeight: 600,
            textDecoration: 'underline', textUnderlineOffset: 2,
            cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
          }}>Cancel order</button>
        </div>
      )}
    </div>
  );
}


function PencilIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

const closeBtn = {
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid #E8E4DC', background: '#F7F5F0',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, color: '#666', flexShrink: 0,
};

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}
