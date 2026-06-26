import { useState, useEffect, useRef, useMemo } from 'react';

const TIER_LABELS = ['Bottom Tier', '2nd Tier', '3rd Tier', 'Top Tier'];

const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const totalMins = 360 + i * 30; // 6:00 AM → 11:30 PM
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  const label = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  return { value, label };
});

function hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(26,26,26,${alpha})`;
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

function FlavourSelect({ options, value, onChange, isMobile, primaryColor }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const selected = options.find(o => o.id === value) ?? null;

  function openDropdown() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: `1.5px solid ${open ? primaryColor : '#d1d5db'}`, borderRadius: 12,
          padding: isMobile ? '14px' : '10px 12px',
          fontSize: isMobile ? 16 : 13, fontFamily: "'Quicksand', sans-serif",
          color: selected ? '#222' : '#aaa',
          background: '#fff', cursor: 'pointer', outline: 'none',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : '— Select flavour —'}
        </span>
        <span style={{ fontSize: 10, color: '#aaa', flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {open && rect && (
        <div style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          maxHeight: 220, overflowY: 'auto', overscrollBehavior: 'contain',
        }}>
          {options.map((o, i) => {
            const isSelected = o.id === value;
            return (
              <div
                key={o.id}
                onPointerDown={() => { onChange(o.id); setOpen(false); }}
                style={{
                  padding: isMobile ? '13px 16px' : '10px 14px',
                  fontSize: isMobile ? 15 : 13,
                  fontFamily: "'Quicksand', sans-serif",
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? primaryColor : '#222',
                  background: isSelected ? hexToRgba(primaryColor, 0.08) : 'transparent',
                  borderTop: i > 0 ? '1px solid #f3f4f6' : 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                {o.name}
                {isSelected && <CheckIcon size={14} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,6 5,9 10,3" />
    </svg>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 600);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 600);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

function UpdateDesignForm({ isMobile, primaryColor, submitting, submitError, onSubmit, brandBtn }) {
  const [comment, setComment] = useState('');
  const canSubmit = comment.trim().length > 0 && !submitting;

  const inp = {
    border: '1.5px solid #d1d5db', borderRadius: 12,
    padding: isMobile ? '14px' : '10px 12px',
    fontSize: isMobile ? 16 : 13,
    fontFamily: "'Quicksand', sans-serif", color: '#222',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    background: '#fff', WebkitAppearance: 'none',
  };
  const lbl = { fontSize: isMobile ? 13 : 11, fontWeight: 700, color: '#444', letterSpacing: 0.3, fontFamily: "'Quicksand', sans-serif" };

  return (
    <>
      <div style={{ fontSize: isMobile ? 13 : 11, color: '#888', background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: isMobile ? '10px 14px' : '8px 12px' }}>
        The current 3D design will replace this order's saved design. Add a note explaining what changed.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lbl}>What changed? *</span>
        <textarea
          style={{ ...inp, resize: 'vertical', minHeight: isMobile ? 100 : 80 }}
          placeholder="e.g. Customer requested a blue tier instead of pink, added floral topper"
          value={comment}
          autoFocus
          onChange={e => setComment(e.target.value)}
        />
      </div>

      {submitError && (
        <div style={{ fontSize: isMobile ? 13 : 12, color: '#e53935', fontWeight: 600, lineHeight: 1.4 }}>
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #999999', paddingTop: 12 }}>
        <button
          style={{ ...btn(isMobile), ...brandBtn, flex: 1, opacity: canSubmit ? 1 : 0.45 }}
          disabled={!canSubmit}
          onClick={() => onSubmit(comment.trim())}
        >
          {submitting ? 'Saving…' : 'Update Design'}
        </button>
      </div>
    </>
  );
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getSlotsForDate(dateStr, storeHours) {
  if (!storeHours || !dateStr) return TIME_SLOTS;
  const dayKey = DAY_KEYS[new Date(dateStr + 'T00:00:00').getDay()];
  const hours = storeHours[dayKey];
  if (!hours) return null; // closed
  return TIME_SLOTS.filter(s => s.value >= hours.open && s.value <= hours.close);
}

export default function OrderModal({
  tierCount, onClose, onSubmit,
  apiClient, supabase, bakerId, bakerSlug,
  homeDeliveryEnabled = false,
  storeHours = null,
  brandBtn, primaryColor = '#1a1a1a',
  editingOrder = null,
  onViewOrder = null,
  mode = 'baker',   // 'baker' (search for the customer) | 'customer' (self-serve; identity from session)
}) {
  const isMobile = useIsMobile();

  // Step: 0=customer, 1=details, 2=delivery
  const [step, setStep] = useState(0);

  // Customer step sub-phases: 'phone' → 'found' | 'not_found'
  const [searchPhone,   setSearchPhone]   = useState('');
  const [searchPhase,   setSearchPhase]   = useState('phone'); // 'phone' | 'found' | 'not_found'
  const [foundCustomer, setFoundCustomer] = useState(null);
  const [customers,      setCustomers]      = useState(null);   // null = loading or unavailable
  const [customersLoading,  setCustomersLoading]  = useState(false);
  const [customersFetchErr, setCustomersFetchErr] = useState(null);

  // Customer form (populated on found or new)
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // Available flavours list
  const [availableFlavours, setAvailableFlavours] = useState([]);

  // Cake details
  const [weightKg, setWeightKg] = useState('');
  const [flavours, setFlavours] = useState(
    Array.from({ length: tierCount }, (_, i) => ({ tier: i, name: '', flavourId: null, source: null }))
  );
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Delivery
  const [deliveryDate,    setDeliveryDate]    = useState('');
  const [deliveryTime,    setDeliveryTime]    = useState('');
  const [deliveryMode,    setDeliveryMode]    = useState('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Submit state
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const [orderId,      setOrderId]      = useState(null);

  // Load customers on mount — baker mode only (a customer never lists the baker's
  // customers; their own identity comes from the session).
  useEffect(() => {
    if (mode === 'customer') return;
    if (apiClient?.fetchCustomers) {
      setCustomersLoading(true);
      apiClient.fetchCustomers()
        .then(data => setCustomers(data ?? []))
        .catch(err => { setCustomers([]); setCustomersFetchErr(err.message ?? 'Failed to load customers'); })
        .finally(() => setCustomersLoading(false));
    } else if (supabase && bakerId) {
      setCustomersLoading(true);
      supabase
        .from('customers')
        .select('id, email, first_name, last_name, phone')
        .eq('baker_id', bakerId)
        .order('first_name')
        .then(({ data, error }) => {
          if (error) { setCustomers([]); setCustomersFetchErr(error.message); }
          else setCustomers(data ?? []);
        })
        .catch(err => { setCustomers([]); setCustomersFetchErr(err.message ?? 'Failed to load customers'); })
        .finally(() => setCustomersLoading(false));
    }
  }, []);

  // Load available flavours on mount. The API resolves the customer-facing list (global
  // flavours minus this baker's exclusions, plus the baker's custom flavours) — core never
  // touches the flavour tables or that business rule (it's spattoo-api's job).
  useEffect(() => {
    if (!apiClient?.fetchFlavours || !bakerSlug) return;
    apiClient.fetchFlavours(bakerSlug)
      .then(data => Array.isArray(data) ? setAvailableFlavours(data) : null)
      .catch(() => {});
  }, []);

  // ── Customer search ─────────────────────────────────────────────────────────
  function selectCustomer(c) {
    setFoundCustomer(c);
    setCustomer({ firstName: c.first_name ?? '', lastName: c.last_name ?? '', email: c.email ?? '', phone: c.phone ?? '' });
    setSearchPhase('found');
  }

  function handleSearch() {
    const query = searchPhone.trim();
    if (!query) return;

    const digits = query.replace(/\D/g, '');
    const lower  = query.toLowerCase();

    const match = (customers ?? []).find(c => {
      if (digits.length >= 4) {
        const d = (c.phone ?? '').replace(/\D/g, '');
        if (d && (d.includes(digits) || digits.includes(d))) return true;
      }
      const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().trim();
      return fullName && fullName.includes(lower);
    });

    if (match) {
      selectCustomer(match);
    } else {
      setCustomer(c => ({ ...c, phone: digits.length >= 6 ? query : '' }));
      setFoundCustomer(null);
      setSearchPhase('not_found');
    }
  }

  const searchResults = useMemo(() => {
    const query = searchPhone.trim();
    if (query.length < 2 || !customers?.length) return [];
    const digits = query.replace(/\D/g, '');
    const lower  = query.toLowerCase();
    return customers.filter(c => {
      if (digits.length >= 3) {
        const d = (c.phone ?? '').replace(/\D/g, '');
        if (d && d.includes(digits)) return true;
      }
      const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().trim();
      return fullName && fullName.includes(lower);
    });
  }, [searchPhone, customers]);

  function resetSearch() {
    setSearchPhase('phone');
    setFoundCustomer(null);
  }

  function setFlavour(tierIdx, flavourId) {
    const picked = availableFlavours.find(f => f.id === flavourId) ?? null;
    setFlavours(fs => fs.map(f =>
      f.tier === tierIdx
        ? { tier: tierIdx, name: picked?.name ?? '', flavourId: picked?.id ?? null, source: picked?.source ?? null }
        : f
    ));
  }

  // Validation
  const canSearch   = searchPhone.trim().length >= 2 && !customersLoading;
  const canGoNext0  = searchPhase === 'found' || (searchPhase === 'not_found' && customer.firstName.trim());
  const canSubmit   = deliveryMode === 'pickup' || deliveryAddress.trim();

  // Steps depend on mode: the customer is already known from their session, so the
  // customer-search step exists ONLY for the baker placing an order on someone's behalf.
  const STEP_DEFS = mode === 'customer'
    ? [{ key: 'details', label: 'Cake Details' }, { key: 'delivery', label: 'Delivery' }]
    : [{ key: 'customer', label: 'Customer' }, { key: 'details', label: 'Cake Details' }, { key: 'delivery', label: 'Delivery' }];
  const currentStepKey = STEP_DEFS[step]?.key;
  const isLastStep     = step === STEP_DEFS.length - 1;
  const submitLabel     = mode === 'customer' ? 'Request quote' : 'Create order';
  const submittingLabel = mode === 'customer' ? 'Requesting…'   : 'Creating…';

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmit({
        // Customer mode: identity comes from the session server-side — never send it.
        ...(mode === 'baker' ? { customer } : {}),
        weightKg:            weightKg ? parseFloat(weightKg) : undefined,
        flavours:            flavours.filter(f => f.name.trim()),
        specialInstructions: specialInstructions.trim() || undefined,
        deliveryDate:        deliveryDate  || undefined,
        deliveryTime:        deliveryTime  || undefined,
        deliveryMode,
        deliveryAddress:     deliveryMode === 'home_delivery' ? deliveryAddress : undefined,
      });
      setOrderId(result?.orderId ?? 'ok');
    } catch (err) {
      setSubmitError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Shared style helpers ────────────────────────────────────────────────────
  const inp = {
    border: '1.5px solid #d1d5db', borderRadius: 12,
    padding: isMobile ? '14px' : '10px 12px',
    fontSize: isMobile ? 16 : 13,  // 16 on mobile prevents iOS viewport zoom
    fontFamily: "'Quicksand', sans-serif", color: '#222',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    background: '#fff', WebkitAppearance: 'none',
  };
  const lbl = { fontSize: isMobile ? 13 : 11, fontWeight: 700, color: '#444', letterSpacing: 0.3, fontFamily: "'Quicksand', sans-serif" };
  const field = { display: 'flex', flexDirection: 'column', gap: 6 };

  // ── Success ─────────────────────────────────────────────────────────────────
  if (orderId) {
    return (
      <div style={overlay(isMobile)} onClick={onClose}>
        <div style={sheetStyle(isMobile)} onClick={e => e.stopPropagation()}>
          {isMobile && <div style={handle} />}
          <div style={{ textAlign: 'center', padding: isMobile ? '24px 20px 16px' : '16px 0 12px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: hexToRgba(primaryColor, 0.12),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: isMobile ? 20 : 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>
              {editingOrder ? 'Design Updated!' : mode === 'customer' ? 'Quote Requested!' : 'Order Placed!'}
            </div>
            <div style={{ fontSize: isMobile ? 14 : 12, color: '#666', lineHeight: 1.6 }}>
              {editingOrder
                ? 'The new design has been saved to this order.'
                : mode === 'customer'
                  ? <>Your request is with the baker.<br />You'll receive a quote soon.</>
                  : <>Your order has been received.<br />We'll be in touch soon.</>}
            </div>
            {!editingOrder && orderId !== 'ok' && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 12, fontFamily: 'monospace', letterSpacing: 1 }}>
                #{String(orderId).slice(0, 8).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ padding: isMobile ? '0 20px' : '0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!editingOrder && onViewOrder && orderId !== 'ok' && (
              <button
                style={{ ...btn(isMobile), ...brandBtn, width: '100%' }}
                onClick={() => { onViewOrder(orderId); onClose(); }}
              >
                View Order
              </button>
            )}
            <button
              style={{ ...btn(isMobile), width: '100%', background: 'transparent', color: '#666', border: '1.5px solid #e0e0e0', boxShadow: 'none' }}
              onClick={onClose}
            >
              {(!editingOrder && onViewOrder && orderId !== 'ok') ? 'Close' : 'Done'}
            </button>
          </div>
          {isMobile && <div style={{ height: 'env(safe-area-inset-bottom, 16px)', flexShrink: 0 }} />}
        </div>
      </div>
    );
  }

  // ── Edit-mode: single-step "Update Design" modal ─────────────────────────────
  if (editingOrder) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
          .spattoo-modal input::placeholder,
          .spattoo-modal textarea::placeholder {
            font-family: 'Quicksand', sans-serif;
            font-weight: 500;
            color: #bbb;
          }
        `}</style>
        <div style={overlay(isMobile)} onClick={onClose}>
          <div className="spattoo-modal" style={sheetStyle(isMobile)} onClick={e => e.stopPropagation()}>
            {isMobile && <div style={handle} />}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '0 20px 14px' : '0 0 14px', flexShrink: 0 }}>
              <span style={{ fontSize: isMobile ? 18 : 14, fontWeight: 700, color: '#1a1a1a' }}>Update Design</span>
              <button style={{ background: '#f3f4f6', border: 'none', cursor: 'pointer', borderRadius: '50%', width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, fontSize: 13, color: '#333', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: isMobile ? '20px 20px' : '16px 0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 12 }}>
              <UpdateDesignForm
                isMobile={isMobile}
                primaryColor={primaryColor}
                submitting={submitting}
                submitError={submitError}
                onSubmit={async (comment) => {
                  setSubmitting(true);
                  setSubmitError(null);
                  try {
                    const result = await onSubmit({ comment });
                    setOrderId(result?.orderId ?? 'ok');
                  } catch (err) {
                    setSubmitError(err.message || 'Failed to save. Please try again.');
                  } finally {
                    setSubmitting(false);
                  }
                }}
                brandBtn={brandBtn}
              />
            </div>

            {isMobile && <div style={{ height: 'env(safe-area-inset-bottom, 16px)', flexShrink: 0 }} />}
          </div>
        </div>
      </>
    );
  }

  // ── Footer button logic ─────────────────────────────────────────────────────
  // Customer step, phone phase: one big "Find Customer" button (baker mode only).
  // Customer step, found/not_found: Back + Next.
  // Details/Delivery: Back + Next / submit (label by mode).
  const onCustomerStep = currentStepKey === 'customer';
  const showBackInFooter  = step > 0 || (onCustomerStep && searchPhase !== 'phone');
  const footerPrimaryLabel =
    onCustomerStep && searchPhase === 'phone' ? (customersLoading ? 'Loading…' : 'Find or Create Customer')
    : !isLastStep ? 'Next'
    : submitting ? submittingLabel : submitLabel;
  const footerPrimaryDisabled =
    onCustomerStep && searchPhase === 'phone' ? !canSearch
    : onCustomerStep ? !canGoNext0
    : isLastStep ? (!canSubmit || submitting)
    : false;

  function handleFooterPrimary() {
    if (onCustomerStep && searchPhase === 'phone') { handleSearch(); return; }
    if (!isLastStep) { setStep(s => s + 1); return; }
    handleSubmit();
  }

  function handleBack() {
    if (step > 0) { setStep(s => s - 1); setSubmitError(null); return; }
    resetSearch();
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
        @keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
        .spattoo-modal input::placeholder,
        .spattoo-modal textarea::placeholder {
          font-family: 'Quicksand', sans-serif;
          font-weight: 500;
          color: #bbb;
        }
      `}</style>
      <div style={overlay(isMobile)} onClick={onClose}>
        <div className="spattoo-modal" style={sheetStyle(isMobile)} onClick={e => e.stopPropagation()}>

          {/* Drag handle */}
          {isMobile && <div style={handle} />}

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: isMobile ? '0 20px 14px' : '0 0 14px', flexShrink:0 }}>
            <span style={{ fontSize: isMobile ? 18 : 14, fontWeight: 700, color: '#1a1a1a' }}>{mode === 'customer' ? 'Request a Quote' : 'Order This Cake'}</span>
            <button style={{ background:'#f3f4f6', border:'none', cursor:'pointer', borderRadius:'50%', width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, fontSize:13, color:'#333', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>✕</button>
          </div>

          {/* Step dots */}
          <div style={{ display:'flex', padding: isMobile ? '0 20px 14px' : '0 0 14px', borderBottom:'1px solid #999999', flexShrink:0 }}>
            {STEP_DEFS.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <div style={{ width: isMobile?30:24, height: isMobile?30:24, borderRadius:'50%', background:(done||active)?primaryColor:'#d8d4cf', color:'#fff', fontWeight:700, fontSize: isMobile?13:11, display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s' }}>
                    {done ? <CheckIcon /> : i+1}
                  </div>
                  <span style={{ fontSize: isMobile?10:9, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', color:(done||active)?primaryColor:'#bbb' }}>{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Scrollable content */}
          <div style={{ flex:1, overflowY:'auto', overscrollBehavior:'contain', padding: isMobile ? '20px 20px' : '16px 0', display:'flex', flexDirection:'column', gap: isMobile?16:12 }}>

            {/* ── Step: Customer (baker mode only) ── */}
            {currentStepKey === 'customer' && (
              <>
                {/* PHASE: phone entry */}
                {searchPhase === 'phone' && (
                  <div style={field}>
                    <span style={lbl}>Search by phone or name</span>
                    <input
                      style={inp}
                      type="text"
                      placeholder="e.g. 98765 43210 or Priya"
                      value={searchPhone}
                      autoFocus
                      onChange={e => setSearchPhone(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && canSearch && handleSearch()}
                    />
                    {customersLoading && (
                      <span style={{ fontSize: 11, color: '#aaa' }}>Loading customer list…</span>
                    )}
                    {!customersLoading && customersFetchErr && (
                      <span style={{ fontSize: 11, color: '#e53935' }}>Could not load customers: {customersFetchErr}</span>
                    )}
                    {searchResults.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:4 }}>
                        {searchResults.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectCustomer(c)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding: isMobile?'10px 12px':'8px 10px', background:'#fafafa', border:'1px solid #eee', borderRadius:10, cursor:'pointer', textAlign:'left', width:'100%' }}
                          >
                            <div style={{ width:isMobile?32:26, height:isMobile?32:26, borderRadius:'50%', background:primaryColor, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:isMobile?13:10, flexShrink:0 }}>
                              {(c.first_name?.[0] ?? '').toUpperCase()}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontWeight:600, fontSize:isMobile?13:12, color:'#1a1a1a' }}>{c.first_name} {c.last_name ?? ''}</div>
                              {c.phone && <div style={{ fontSize:isMobile?12:10, color:'#888' }}>{c.phone}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* PHASE: existing customer found */}
                {searchPhase === 'found' && foundCustomer && (
                  <div style={{ background: hexToRgba(primaryColor, 0.07), border: `1.5px solid ${hexToRgba(primaryColor, 0.3)}`, borderRadius: 14, padding: isMobile ? '16px' : '12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width: isMobile?40:32, height: isMobile?40:32, borderRadius:'50%', background: primaryColor, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize: isMobile?15:12, flexShrink:0 }}>
                        {(foundCustomer.first_name?.[0] ?? '').toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize: isMobile?15:13, color:'#1a1a1a' }}>
                          {foundCustomer.first_name} {foundCustomer.last_name ?? ''}
                        </div>
                        {foundCustomer.phone && <div style={{ fontSize: isMobile?13:11, color:'#666', marginTop:1 }}>{foundCustomer.phone}</div>}
                        {foundCustomer.email && <div style={{ fontSize: isMobile?12:10, color:'#999', marginTop:1 }}>{foundCustomer.email}</div>}
                      </div>
                      <div style={{ color: primaryColor, flexShrink:0 }}><CheckIcon size={18} /></div>
                    </div>
                  </div>
                )}

                {/* PHASE: not found — show new customer form */}
                {searchPhase === 'not_found' && (
                  <>
                    <div style={{ fontSize: isMobile?13:11, color:'#888', background:'#fafafa', border:'1px solid #eee', borderRadius:10, padding: isMobile?'10px 14px':'8px 12px' }}>
                      No customer found for <strong>{searchPhone}</strong> — fill in their details below.
                    </div>

                    <div style={{ display:'flex', gap:10 }}>
                      <label style={{ ...field, flex:1 }}>
                        <span style={lbl}>First name *</span>
                        <input style={inp} value={customer.firstName} autoFocus
                          onChange={e => setCustomer(c => ({ ...c, firstName: e.target.value }))} />
                      </label>
                      <label style={{ ...field, flex:1 }}>
                        <span style={lbl}>Last name</span>
                        <input style={inp} value={customer.lastName}
                          onChange={e => setCustomer(c => ({ ...c, lastName: e.target.value }))} />
                      </label>
                    </div>

                    <label style={field}>
                      <span style={lbl}>Phone</span>
                      <input style={{ ...inp, background:'#f9f9f9', color:'#555' }}
                        type="tel" value={customer.phone} readOnly />
                    </label>

                    <label style={field}>
                      <span style={lbl}>Email (optional)</span>
                      <input style={inp} type="email" value={customer.email}
                        onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && canGoNext0 && setStep(1)} />
                    </label>
                  </>
                )}
              </>
            )}

            {/* ── Step: Cake details ── */}
            {currentStepKey === 'details' && (
              <>
                <label style={field}>
                  <span style={lbl}>Cake weight (kg)</span>
                  <input style={inp} type="number" min="0.5" max="100" step="0.5"
                    placeholder="e.g. 2" value={weightKg} autoFocus
                    onChange={e => setWeightKg(e.target.value)} />
                </label>

                <div style={{ ...field, gap: isMobile?10:8 }}>
                  <span style={lbl}>{tierCount === 1 ? 'Flavour' : 'Flavour per tier'}</span>
                  {Array.from({ length: tierCount }, (_, i) => (
                    <div key={i} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {tierCount > 1 && (
                        <span style={{ fontSize: isMobile?12:10, fontWeight:700, color:'#888' }}>
                          {TIER_LABELS[i] ?? `Tier ${i+1}`}
                        </span>
                      )}
                      {availableFlavours.length > 0 ? (
                        <FlavourSelect
                          options={availableFlavours}
                          value={flavours[i]?.flavourId ?? ''}
                          onChange={id => setFlavour(i, id)}
                          isMobile={isMobile}
                          primaryColor={primaryColor}
                        />
                      ) : (
                        <input style={inp} placeholder="e.g. Vanilla"
                          value={flavours[i]?.name ?? ''}
                          onChange={e => setFlavours(fs => fs.map(f => f.tier === i ? { ...f, name: e.target.value, flavourId: null, source: null } : f))} />
                      )}
                    </div>
                  ))}
                </div>

                <label style={field}>
                  <span style={lbl}>Special instructions</span>
                  <textarea style={{ ...inp, resize:'vertical', minHeight: isMobile?80:64 }}
                    placeholder="Inscriptions, special requests…"
                    value={specialInstructions}
                    onChange={e => setSpecialInstructions(e.target.value)} />
                </label>
              </>
            )}

            {/* ── Step: Delivery ── */}
            {currentStepKey === 'delivery' && (
              <>
                <div style={{ display:'flex', gap:10 }}>
                  <label style={{ ...field, flex:1 }}>
                    <span style={lbl}>Date</span>
                    <input style={inp} type="date" value={deliveryDate} autoFocus
                      onChange={e => setDeliveryDate(e.target.value)} />
                  </label>
                  <label style={{ ...field, flex:1 }}>
                    <span style={lbl}>Time</span>
                    {(() => {
                      const slots = getSlotsForDate(deliveryDate, storeHours);
                      if (slots === null) {
                        return <div style={{ padding: '10px 12px', borderRadius: 12, background: '#FEF3C7', color: '#92400E', fontSize: isMobile?13:11, fontWeight: 600 }}>Closed on this day</div>;
                      }
                      return (
                        <select style={{ ...inp, appearance:'none', WebkitAppearance:'none' }}
                          value={deliveryTime}
                          onChange={e => setDeliveryTime(e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {slots.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </label>
                </div>

                <div style={field}>
                  <span style={lbl}>Delivery method</span>
                  <div style={{ display:'flex', gap:10, marginTop:2 }}>
                    {[['pickup','Pickup'],['home_delivery','Home Delivery']].map(([val, label]) => {
                      const active = deliveryMode === val;
                      const disabled = val === 'home_delivery' && !homeDeliveryEnabled;
                      return (
                        <button key={val}
                          onClick={() => !disabled && setDeliveryMode(val)}
                          style={{
                            flex:1, padding: isMobile?'14px 0':'10px 0', borderRadius:12,
                            border: `1.5px solid ${active ? primaryColor : '#999999'}`,
                            fontSize: isMobile?14:11, fontWeight:700,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            background: disabled ? '#f5f5f5' : active ? hexToRgba(primaryColor, 0.1) : 'transparent',
                            color: disabled ? '#bbb' : active ? primaryColor : '#666',
                            fontFamily:"'Quicksand',sans-serif", transition:'all 0.15s',
                            position: 'relative',
                          }}
                        >
                          {label}
                          {disabled && (
                            <div style={{ fontSize: isMobile?9:8, fontWeight:600, color:'#bbb', marginTop:2 }}>
                              Not available
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {deliveryMode === 'home_delivery' && (
                  <label style={field}>
                    <span style={lbl}>Delivery address *</span>
                    <textarea style={{ ...inp, resize:'vertical', minHeight: isMobile?80:64 }}
                      placeholder="Full delivery address…"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)} />
                  </label>
                )}

                {submitError && (
                  <div style={{ fontSize: isMobile?13:12, color:'#e53935', fontWeight:600, lineHeight:1.4 }}>
                    {submitError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sticky footer */}
          <div style={{ display:'flex', gap:10, flexShrink:0, padding: isMobile ? '12px 20px 0' : '12px 0 0', borderTop:'1px solid #999999' }}>
            {showBackInFooter && (
              <button style={{ padding: isMobile?'15px 20px':'12px 18px', borderRadius:14, border:'1.5px solid #999999', fontSize: isMobile?15:13, fontWeight:700, cursor:'pointer', background:'#fff', color:'#333', fontFamily:"'Quicksand',sans-serif", flexShrink:0 }}
                onClick={handleBack}>
                Back
              </button>
            )}
            <button
              style={{ ...btn(isMobile), ...brandBtn, flex:1, opacity: footerPrimaryDisabled ? 0.45 : 1 }}
              disabled={footerPrimaryDisabled}
              onClick={handleFooterPrimary}>
              {footerPrimaryLabel}
            </button>
          </div>

          {isMobile && <div style={{ height:'env(safe-area-inset-bottom, 16px)', flexShrink:0 }} />}

        </div>
      </div>
    </>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function overlay(isMobile) {
  return {
    position:'fixed', inset:0, background:'rgba(107,45,66,0.22)',
    backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)',
    zIndex:100, display:'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent:'center',
    fontFamily:"'Quicksand',sans-serif",
  };
}

function sheetStyle(isMobile) {
  const base = { fontFamily: "'Quicksand', sans-serif" };
  return isMobile ? {
    ...base,
    width:'100%', maxHeight:'92vh', background:'#fff',
    borderRadius:'20px 20px 0 0',
    display:'flex', flexDirection:'column',
    boxShadow:'0 -4px 40px rgba(107,45,66,0.18)',
    animation:'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)',
    paddingTop:10,
  } : {
    ...base,
    width:360, maxWidth:'calc(100vw - 32px)', maxHeight:'90vh',
    background:'#fff', borderRadius:20,
    display:'flex', flexDirection:'column',
    boxShadow:'0 8px 40px rgba(107,45,66,0.18)',
    padding:'20px 24px 22px',
  };
}

const handle = {
  width:36, height:4, borderRadius:2, background:'#d8d4cf',
  margin:'0 auto 12px', flexShrink:0,
};

function btn(isMobile) {
  return {
    padding: isMobile ? '15px' : '12px',
    borderRadius:14, border:'none',
    fontSize: isMobile?15:13, fontWeight:700, cursor:'pointer',
    fontFamily:"'Quicksand',sans-serif",
    background:'linear-gradient(135deg,#1a1a1a,#333333)',
    color:'#fff', transition:'opacity 0.15s',
  };
}
