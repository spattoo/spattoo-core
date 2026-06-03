import { useState, useEffect, useRef } from 'react';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

function fmt(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(c) {
  return `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none' }}
    >
      <div style={{
        width: 40, height: 22, borderRadius: 11, position: 'relative',
        background: checked ? '#10b981' : '#d1d5db',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? '#065f46' : '#999' }}>{label}</span>
      )}
    </div>
  );
}

// ── Input / field helpers ─────────────────────────────────────────────────────
const inp = {
  padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E0DDD8',
  fontSize: 13, fontFamily: 'inherit', color: '#222',
  outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff',
};

function Field({ label, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: error ? '#e53935' : '#aaa', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      {error && <span style={{ fontSize: 11, color: '#e53935', fontWeight: 600 }}>{error}</span>}
      {children}
    </div>
  );
}

// ── Customer form (add or edit) ───────────────────────────────────────────────
function CustomerForm({ initial = {}, onSave, onCancel, saving, serverError }) {
  const [form, setForm] = useState({
    firstName: initial.first_name ?? '',
    lastName:  initial.last_name  ?? '',
    email:     initial.email      ?? '',
    phone:     initial.phone      ?? '',
  });
  const [errors, setErrors] = useState({});

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: null })); }

  function validate() {
    const e = {};
    if (!form.firstName.trim())                        e.firstName = 'Required';
    if (!form.phone.trim() && !form.email.trim())      e.phone = 'Phone or email required';
    setErrors(e);
    return !Object.keys(e).length;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="First name *" error={errors.firstName} style={{ flex: 1 }}>
          <input style={{ ...inp, borderColor: errors.firstName ? '#e53935' : '#E0DDD8' }}
            value={form.firstName} autoFocus onChange={e => set('firstName', e.target.value)} />
        </Field>
        <Field label="Last name" style={{ flex: 1 }}>
          <input style={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
        </Field>
      </div>
      <Field label="Phone *" error={errors.phone}>
        <input style={{ ...inp, borderColor: errors.phone ? '#e53935' : '#E0DDD8' }}
          type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
      </Field>
      <Field label="Email">
        <input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
      </Field>
      {serverError && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', border: '1px solid #FECACA', fontSize: 13, color: '#991B1B', fontWeight: 600 }}>
          {serverError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => validate() && onSave(form)} disabled={saving} style={{
          flex: 1, padding: '11px', borderRadius: 12, border: 'none',
          background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} style={{
          padding: '11px 18px', borderRadius: 12, border: '1.5px solid #E0DDD8',
          background: '#fff', color: '#666', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  pending:   { bg: '#FEF9C3', color: '#92400E' },
  approved:  { bg: '#D1FAE5', color: '#065F46' },
  completed: { bg: '#DBEAFE', color: '#1E40AF' },
  cancelled: { bg: '#FEE2E2', color: '#991B1B' },
};

function OrderHistoryRow({ order, onViewOrder }) {
  const st    = STATUS_STYLE[order.status] ?? { bg: '#F3F4F6', color: '#374151' };
  const date  = order.delivery_date
    ? new Date(order.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div onClick={() => onViewOrder?.(order.id)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0EDE8', cursor: 'pointer' }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, background: '#F0EDE8', overflow: 'hidden' }}>
        {order.design_thumbnail_url
          ? <img src={order.design_thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎂</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{date}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
          {[order.weight_kg ? `${order.weight_kg} kg` : null, order.flavours?.length ? order.flavours.map(f => f.name ?? f.flavour ?? f).join(', ') : null].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: st.bg, color: st.color, flexShrink: 0, textTransform: 'capitalize' }}>
          {order.status}
        </div>
        <span style={{ fontSize: 16, color: '#ccc' }}>›</span>
      </div>
    </div>
  );
}

// ── Customer detail ───────────────────────────────────────────────────────────
function CustomerDetail({ customer, onUpdated, apiClient, isMobile, onViewOrder }) {
  const [editing,      setEditing]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [toggling,     setToggling]     = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [historyOpen,  setHistoryOpen]  = useState(false);
  const [orders,       setOrders]       = useState(null);
  const [ordersLoading,setOrdersLoading]= useState(false);

  async function toggleHistory() {
    if (!historyOpen && orders === null) {
      setOrdersLoading(true);
      try {
        const data = await apiClient.fetchOrders({ customer_id: customer.id });
        setOrders(Array.isArray(data) ? data : []);
      } catch {
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    }
    setHistoryOpen(o => !o);
  }

  async function handleSave(form) {
    setSaving(true); setSaveError(null);
    try {
      const updated = await apiClient.updateCustomer(customer.id, form);
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setToggling(true);
    try {
      const fn = customer.is_active ? apiClient.deactivateCustomer : apiClient.reactivateCustomer;
      const updated = await fn(customer.id);
      onUpdated({ ...customer, ...updated });
    } catch (err) {
      alert(err.message);
    } finally {
      setToggling(false);
    }
  }

  const name = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>

      {/* Avatar + name header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: customer.is_active ? '#1a1a1a' : '#d1d5db',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700,
        }}>{initials(customer)}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: customer.is_active ? '#1a1a1a' : '#999' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>
            {customer.is_active ? `Customer since ${fmt(customer.created_at)}` : 'Deactivated'}
          </div>
        </div>
      </div>

      {editing ? (
        <CustomerForm
          initial={customer}
          onSave={handleSave}
          onCancel={() => { setEditing(false); setSaveError(null); }}
          saving={saving}
          serverError={saveError}
        />
      ) : (
        <>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={() => setEditing(true)} style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1.5px solid #E0DDD8', background: '#fff',
              fontSize: 13, fontWeight: 700, color: '#444',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <PencilIcon size={13} /> Edit
            </button>
            <Toggle
              checked={customer.is_active}
              onChange={handleToggleActive}
              disabled={toggling}
              label={customer.is_active ? 'Active' : 'Inactive'}
            />
          </div>

          {/* Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <InfoSection title="Contact">
              <InfoRow label="Phone" value={customer.phone} />
              <InfoRow label="Email" value={customer.email} />
            </InfoSection>
            <InfoSection title="Meta">
              <InfoRow label="Added" value={fmt(customer.created_at)} />
              <InfoRow label="Source" value={customer.source === 'manual' ? 'Added manually' : 'From order'} />
              <InfoRow label="Status" value={customer.is_active ? 'Active' : 'Deactivated'} />
            </InfoSection>
          </div>

          {/* Order history */}
          <div style={{ marginTop: 28 }}>
            <button onClick={toggleHistory} style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid #E0DDD8', background: historyOpen ? '#1a1a1a' : '#fff',
              color: historyOpen ? '#fff' : '#444', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Order History</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {ordersLoading ? 'Loading…' : historyOpen ? '▲ Hide' : '▼ Show'}
              </span>
            </button>
            {historyOpen && (
              <div style={{ marginTop: 8 }}>
                {ordersLoading
                  ? <div style={{ padding: '16px 0', fontSize: 13, color: '#bbb', textAlign: 'center' }}>Loading…</div>
                  : orders?.length
                    ? orders.map(o => <OrderHistoryRow key={o.id} order={o} onViewOrder={onViewOrder} />)
                    : <div style={{ padding: '16px 0', fontSize: 13, color: '#bbb', textAlign: 'center' }}>No orders yet</div>
                }
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InfoSection({ title, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#222' }}>{value}</span>
    </div>
  );
}

// ── Customer list ─────────────────────────────────────────────────────────────
function CustomerList({ customers, selected, onSelect, onToggle, togglingIds, isMobile, primaryColor }) {
  return (
    <div style={{
      width: isMobile ? '100%' : 300, flexShrink: 0,
      borderRight: isMobile ? 'none' : '1.5px solid #E8E4DC',
      overflowY: 'auto', background: '#fff',
    }}>
      {!customers.length && (
        <div style={{ padding: 24, fontSize: 13, color: '#bbb', textAlign: 'center' }}>No customers found</div>
      )}
      {customers.map(c => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const isSelected = selected?.id === c.id;
        const isToggling = togglingIds.has(c.id);
        return (
          <div key={c.id} onClick={() => onSelect(c)} style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: '1px solid #F5F3EF', cursor: 'pointer',
            background: isSelected ? '#F0EDE8' : 'transparent',
            transition: 'background 0.12s',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: c.is_active ? (isSelected ? primaryColor : '#1a1a1a') : '#d1d5db',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
            }}>{initials(c)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.is_active ? '#1a1a1a' : '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 1 }}>{c.phone || c.email || '—'}</div>
            </div>
            <div onClick={e => e.stopPropagation()}>
              <Toggle
                checked={c.is_active}
                onChange={() => onToggle(c)}
                disabled={isToggling}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function CustomersPanel({ open, onClose, onBack, apiClient, primaryColor = '#1a1a1a', externalFilter = null, onViewOrder }) {
  const isMobile = useIsMobile();
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [query,      setQuery]      = useState('');
  const [showAll,    setShowAll]    = useState(false);
  const [adding,      setAdding]      = useState(false);
  const [addSaving,   setAddSaving]   = useState(false);
  const [addError,    setAddError]    = useState(null);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    load();
  }, [open, showAll, externalFilter]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = { includeInactive: showAll, ...(externalFilter?.params ?? {}) };
      const data = await apiClient.fetchCustomers(params);
      setCustomers(Array.isArray(data) ? data : []);
      if (!isMobile && data?.length && !selected) setSelected(data[0]);
    } catch (err) {
      setError(err.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(form) {
    setAddSaving(true); setAddError(null);
    try {
      const created = await apiClient.createCustomer(form);
      setCustomers(cs => [created, ...cs]);
      setSelected(created);
      setAdding(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  function handleUpdated(updated) {
    setCustomers(cs => cs.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    setSelected(s => s?.id === updated.id ? { ...s, ...updated } : s);
  }

  async function handleToggle(customer) {
    setTogglingIds(ids => new Set([...ids, customer.id]));
    try {
      const fn = customer.is_active ? apiClient.deactivateCustomer : apiClient.reactivateCustomer;
      const updated = await fn(customer.id);
      handleUpdated({ ...customer, ...updated });
    } catch (err) {
      alert(err.message);
    } finally {
      setTogglingIds(ids => { const next = new Set(ids); next.delete(customer.id); return next; });
    }
  }

  const filtered = customers.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
    return name.includes(q) || (c.phone ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q);
  });

  if (!open) return null;

  const showDetail = isMobile ? (!!selected || adding) : true;
  const showList   = isMobile ? (!selected && !adding)  : true;

  const topBarTitle = isMobile && selected
    ? `${selected.first_name ?? ''} ${selected.last_name ?? ''}`.trim()
    : 'Customers';

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 76,
        zIndex: 300, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif", background: '#F7F5F0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        animation: 'slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Top bar */}
        <div style={{
          height: 56, padding: '0 20px', background: '#fff',
          borderBottom: '1.5px solid #E8E4DC', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button
            onClick={isMobile && (selected || adding) ? () => { setSelected(null); setAdding(false); } : (onBack ?? onClose)}
            style={closeBtn}>
            <ArrowLeftIcon />
          </button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', flex: 1 }}>{topBarTitle}</span>
          {(!isMobile || (!selected && !adding)) && (
            <span style={{ fontSize: 13, color: '#bbb' }}>{customers.length} total</span>
          )}
          {(!isMobile || (!selected && !adding)) && (
            <button onClick={() => { setAdding(true); setSelected(null); }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 10,
              padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700,
            }}>+ Add</button>
          )}
          {onBack && (
            <button onClick={onClose} style={closeBtn} title="Home">
              <HomeIcon />
            </button>
          )}
        </div>

        {/* Filter banner */}
        {externalFilter && !selected && !adding && (
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

          {/* List pane */}
          {showList && (
            <div style={{
              width: isMobile ? '100%' : 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
              borderRight: isMobile ? 'none' : '1.5px solid #E8E4DC', background: '#fff',
            }}>
              {/* Search + filter */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EDE8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search name, phone, email…"
                  style={{ ...inp, fontSize: 13 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['active', false, 'Active'], ['all', true, 'All']].map(([key, val, label]) => (
                    <button key={key} onClick={() => setShowAll(val)} style={{
                      flex: 1, padding: '6px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${showAll === val ? '#1a1a1a' : '#E0DDD8'}`,
                      background: showAll === val ? '#1a1a1a' : '#fff',
                      color: showAll === val ? '#fff' : '#888',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && <div style={{ padding: 24, fontSize: 13, color: '#bbb', textAlign: 'center' }}>Loading…</div>}
                {error   && <div style={{ padding: 24, fontSize: 13, color: '#e53935' }}>{error}</div>}
                {!loading && !error && (
                  <CustomerList
                    customers={filtered}
                    selected={selected}
                    onSelect={c => { setSelected(c); setAdding(false); }}
                    onToggle={handleToggle}
                    togglingIds={togglingIds}
                    isMobile={isMobile}
                    primaryColor={primaryColor}
                  />
                )}
              </div>
            </div>
          )}

          {/* Detail / Add pane */}
          {showDetail && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
              {adding ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', marginBottom: 20 }}>New Customer</div>
                  <CustomerForm
                    onSave={handleAdd}
                    onCancel={() => setAdding(false)}
                    saving={addSaving}
                    serverError={addError}
                  />
                </div>
              ) : selected ? (
                <CustomerDetail
                  key={selected.id}
                  customer={selected}
                  onUpdated={handleUpdated}
                  apiClient={apiClient}
                  isMobile={isMobile}
                  onViewOrder={onViewOrder}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
                  Select a customer to view details
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PencilIcon({ size = 14 }) {
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
