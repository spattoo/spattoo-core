import { useState, useEffect, useRef, useMemo } from 'react';
import { useNarrow } from '../shared/useNarrow.js';
import { DEFAULT_LEGAL_BASE } from '../legal/links.js';
import { ACCEPT_IMAGE, validateImageFile, compressImage } from '../shared/image.js';
import { useUploadLimits } from '../shared/useUploadLimits.js';
import { isValidEmail } from '../shared/validators.js';
import { Panel, PANEL } from '../shared/Panel.jsx';
import { uploadThumbnail } from '../designer/utils/thumbnail.js';
import {
  findFlavourConflicts, conflictSentence, conflictCallToAction, dietTone,
  visibleRequirements, unguaranteedRequirements, unguaranteedSentence,
} from './dietary.js';
import Chip from '../shared/Chip.jsx';
// The SAME occasion list the storefront offers — they write the same column, and a baker
// picking from a different set than their customer is how `other` quietly swallows half the data.
// occasionsByRelevance only RANKS that list against the recipient; it never shortens it, so both
// surfaces still offer every occasion.
import { RECIPIENTS, occasionsByRelevance, loadDraft, clearDraft } from '../storefront/facets/cakeDraft.js';

// Max reference photos on a manual order — mirrors the API's MAX_ORDER_PHOTOS.
const MAX_REFERENCE_PHOTOS = 3;

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

// Reference-photo picker for a manual order — the customer's reference image(s) that
// stand in for a 3D design (up to 3). Reuses the shared ingest pipeline (validate +
// compress) and the shared signed-PUT helper (uploadThumbnail), same as every other
// upload surface; only the small gallery shell is local. Each accepted file is
// compressed, uploaded to orders/reference/, and its returned R2 key kept in `keys`.
function ReferenceUploader({ apiClient, keys, setKeys, maxImageBytes, isMobile, primaryColor, lbl }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  async function addFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setError(null);
    const room = MAX_REFERENCE_PHOTOS - keys.length;
    if (room <= 0) { setError(`At most ${MAX_REFERENCE_PHOTOS} photos`); return; }
    setBusy(true);
    try {
      for (const file of files.slice(0, room)) {
        const bad = validateImageFile(file, { maxBytes: maxImageBytes });
        if (bad) { setError(bad); continue; }
        const blob = await compressImage(file);
        const key = await uploadThumbnail(blob, apiClient, 'orders/reference');
        if (key) setKeys(prev => [...prev, { key, preview: URL.createObjectURL(blob) }]);
        else setError('Upload failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function removeAt(i) {
    setKeys(prev => prev.filter((_, idx) => idx !== i));
  }

  const canAdd = keys.length < MAX_REFERENCE_PHOTOS && !busy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={lbl}>Reference photo{keys.length !== 1 ? 's' : ''} (optional)</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {keys.map((k, i) => (
          <div key={k.key} style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', border: '1.5px solid #e5e7eb', background: '#FAFAF8' }}>
            <img src={k.preview} alt="reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={() => removeAt(i)}
              style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ))}
        {canAdd && (
          <label style={{ width: 72, height: 72, borderRadius: 12, border: `1.5px dashed ${primaryColor}`, background: hexToRgba(primaryColor, 0.05), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: primaryColor, fontSize: 11, fontWeight: 700 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
            {busy ? 'Adding…' : 'Add'}
            <input type="file" accept={ACCEPT_IMAGE} multiple style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {error && <span style={{ fontSize: 11, color: '#e53935', fontWeight: 600 }}>{error}</span>}
      <span style={{ fontSize: isMobile ? 12 : 10, color: '#9CA3AF' }}>
        The first photo becomes the order's thumbnail. Leave empty for an order with no image.
      </span>
    </div>
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
  bakerName = null,   // named in the flavour-conflict warning ("check with Sweet Crumb")
  homeDeliveryEnabled = false,
  storeHours = null,
  brandBtn, primaryColor = '#1a1a1a',
  editingOrder = null,
  onViewOrder = null,
  mode = 'baker',   // 'baker' (search for the customer) | 'customer' (self-serve; identity from session)
  manual = false,   // baker's "New Order" — no 3D design; collect reference photo(s) instead
  initialDeliveryDate = null,   // 'YYYY-MM-DD' when started from a day in the Orders calendar
  legalBase = DEFAULT_LEGAL_BASE,   // host's marketing origin — where /terms + /privacy are served
}) {
  const isMobile = useNarrow(600);
  const { maxImageBytes } = useUploadLimits(apiClient);

  // Reference photos (manual orders only) — [{ key, preview }]; only `key` is sent.
  const [referenceKeys, setReferenceKeys] = useState([]);

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

  // ── What the storefront already asked ─────────────────────────────────────────────────────────
  // A customer who came through the storefront answered flavour, size, date and occasion BEFORE
  // opening the designer. Asking again is the flow's rudest moment — it reads as though nothing was
  // listening — so the draft seeds this form and they CONFIRM rather than re-enter.
  //
  // Same origin, so this costs nothing: StorefrontClient keeps the whole journey on the baker's
  // subdomain ("/{slug}" and "/{slug}/design"), which is why localStorage carries across with no URL
  // params and no round trip.
  //
  // Read ONCE at mount, into initialisers. A later read would fight the customer's edits — they are
  // allowed to change their mind in here, and the draft must not keep pulling them back.
  //
  // Customer mode only: a baker taking an order by hand is not the person whose draft this is.
  const seed = useRef(mode === 'customer' && bakerSlug ? loadDraft(bakerSlug, tierCount) : null).current;
  const sd = seed?.details ?? {};

  // Cake details
  const [weightKg, setWeightKg] = useState(seed?.size?.weightKg != null ? String(seed.size.weightKg) : '');
  // Length comes from tierCount — the DESIGN just built — not from the draft. Somebody who said "one
  // tier" on the storefront and then designed three has changed their mind by doing it, and the cake
  // in front of them is the truthful one. Names seed per tier where the draft has them.
  const [flavours, setFlavours] = useState(
    Array.from({ length: tierCount }, (_, i) => {
      const d = seed?.flavours?.[i];
      return d?.name?.trim()
        ? { tier: i, name: d.name, flavourId: d.flavourId ?? null, source: d.source ?? null }
        : { tier: i, name: '', flavourId: null, source: null };
    })
  );
  const [specialInstructions, setSpecialInstructions] = useState(sd.specialInstructions || '');
  // ── What the cake is FOR (migration 043) ──────────────────────────────────────────────────────
  // Captured here as well as on the storefront, and that is the point rather than a nicety: bakers
  // create a lot of orders by hand from a phone call or a WhatsApp thread. Recording these only on
  // the enquiry path would leave the dataset with a BIASED hole, not merely a smaller one — every
  // customer who prefers to ring up would be missing from it.
  const [occasion, setOccasion]     = useState(sd.occasion  || '');
  const [recipient, setRecipient]   = useState(sd.recipient || '');
  // Occasions ranked by who the cake is for. Memoised on `recipient` alone — the split is pure.
  const occasionChoices = useMemo(() => occasionsByRelevance(recipient), [recipient]);
  const [cakeNumber, setCakeNumber] = useState(sd.cakeNumber ?? '');
  // Dietary requirements the customer states — eggless / vegan / Jain / allergens.
  // ORDER-LEVEL, not per tier (unlike flavour): an eggless requirement is not
  // satisfied by an eggless top tier sitting on an egg-based base.
  const [dietaryOptions, setDietaryOptions] = useState([]);
  const [dietaryKeys,    setDietaryKeys]    = useState(sd.dietaryKeys ?? []);

  // What this bakery actually deals in. A diet option they don't offer is dropped; an
  // allergen NEVER is — see visibleRequirements() for why hiding one would be the worst
  // outcome available here.
  const visibleDietaryOptions = useMemo(
    () => visibleRequirements(dietaryOptions),
    [dietaryOptions],
  );

  // Allergens the customer ticked that this bakery has said it can't guarantee. Recorded
  // on the order regardless — the point is that the baker sees it and can answer, not
  // that the customer is turned away.
  const unguaranteed = useMemo(
    () => unguaranteedRequirements(dietaryOptions, dietaryKeys),
    [dietaryOptions, dietaryKeys],
  );

  // ── Flavour ↔ requirement conflicts ─────────────────────────────────────────
  // Derived, never stored, and it NEVER blocks: the picker keeps every flavour
  // selectable and submit stays enabled. Disabling an option would assert that we know
  // what is compatible — the opposite of what the ToS says we do — and the declarations
  // are hand-authored, so a stale one would silently cost the baker a real order.
  // The customer is told, named the person who can actually answer, and left in charge.
  const flavourConflicts = useMemo(() => findFlavourConflicts({
    flavours,
    requirements: dietaryOptions.filter(o => dietaryKeys.includes(o.key)),
    // conflicts_with rides along on the flavour list the picker already loaded — no
    // second fetch, and no chance of the two disagreeing.
    declarations: Object.fromEntries(
      availableFlavours.filter(f => f.conflicts_with?.length).map(f => [f.id, f.conflicts_with]),
    ),
  }), [flavours, dietaryOptions, dietaryKeys, availableFlavours]);

  // Delivery. Pre-filled when the order was started from a day in the Orders calendar —
  // it is the same order creation either way, the date is simply already chosen.
  // initialDeliveryDate wins over the draft: it means a baker started this from a specific day in
  // the calendar, which is a choice made just now, where the draft is something typed earlier.
  const [deliveryDate,    setDeliveryDate]    = useState(initialDeliveryDate || sd.deliveryDate || '');
  const [deliveryTime,    setDeliveryTime]    = useState(sd.deliveryTime || '');
  const [deliveryMode,    setDeliveryMode]    = useState(sd.deliveryMode || 'pickup');
  const [deliveryAddress, setDeliveryAddress] = useState(sd.deliveryAddress || '');

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

  // Load the dietary vocabulary from the API for the same reason the flavours come
  // from there: it is managed data (a DB table), so core must not carry its own copy
  // that drifts the moment someone adds or retires a requirement. If the host's
  // apiClient doesn't provide it the control simply doesn't render — an older shell
  // degrades to today's behaviour rather than showing an empty picker.
  // Passed the slug so each row comes back with `offered` — whether this bakery deals in
  // it at all. Hosts on an older apiClient signature simply ignore the argument and get
  // the unscoped vocabulary, which is the pre-existing behaviour.
  useEffect(() => {
    if (!apiClient?.fetchDietaryRequirements) return;
    apiClient.fetchDietaryRequirements(bakerSlug)
      .then(data => Array.isArray(data) ? setDietaryOptions(data) : null)
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

  // Jump straight to the new-customer form without searching — for when the baker
  // already knows it's a new customer. Prefills from whatever they typed (a phone if it
  // looks like digits, otherwise a name) so the field isn't wasted.
  function startNewCustomer() {
    const query = searchPhone.trim();
    const digits = query.replace(/\D/g, '');
    setCustomer(digits.length >= 6
      ? { firstName: '', lastName: '', email: '', phone: query }
      : { firstName: query, lastName: '', email: '', phone: '' });
    setFoundCustomer(null);
    setSearchPhase('not_found');
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
  // If an email was entered, it must look like one (it's optional — blank is fine).
  const emailOk     = !customer.email.trim() || isValidEmail(customer.email);
  // A NEW customer needs a name AND a phone (the order's contact) — otherwise the
  // create would fail server-side (phone/email required) after three steps. An EXISTING
  // (found) customer already has their details, so no re-check.
  const canGoNext0  = searchPhase === 'found' || (searchPhase === 'not_found' && customer.firstName.trim() && customer.phone.trim() && emailOk);
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
        // Manual order: the reference photo keys stand in for a design snapshot.
        ...(manual ? { referenceKeys: referenceKeys.map(k => k.key) } : {}),
        weightKg:            weightKg ? parseFloat(weightKg) : undefined,
        flavours:            flavours.filter(f => f.name.trim()),
        specialInstructions: specialInstructions.trim() || undefined,
        occasion:   occasion  || undefined,
        recipient:  recipient || undefined,
        // A whole number or nothing — never NaN, which the API would reject with a message about a
        // field the baker cannot see.
        cakeNumber: Number.isInteger(parseInt(cakeNumber, 10)) ? parseInt(cakeNumber, 10) : undefined,
        // Omitted entirely when nothing is selected: "none stated" is not the same as
        // the customer confirming the cake may contain anything.
        dietaryRequirementKeys: dietaryKeys.length ? dietaryKeys : undefined,
        deliveryDate:        deliveryDate  || undefined,
        deliveryTime:        deliveryTime  || undefined,
        deliveryMode,
        deliveryAddress:     deliveryMode === 'home_delivery' ? deliveryAddress : undefined,
      });
      setOrderId(result?.orderId ?? 'ok');
      // It is theirs now — the same rule the storefront's own submit follows. On SUCCESS only, so a
      // failed request keeps everything and nobody rebuilds a cake because a POST timed out.
      // Customer mode only, and NOT on the Update Design path below: that edits an order which
      // already exists and is not the placing of anything.
      if (mode === 'customer' && bakerSlug) clearDraft(bakerSlug);
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
      // A confirmation carries its own Done button, so no header and no ✕ — but Esc and the
      // backdrop still dismiss it, which onClose gives us.
      <Panel
        onClose={onClose}
        showClose={false}
        isMobile={isMobile}
        width={360}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {!editingOrder && onViewOrder && orderId !== 'ok' && mode !== 'customer' && (
              <button
                style={{ ...btn(isMobile), ...brandBtn, width: '100%' }}
                onClick={() => { onViewOrder(orderId); onClose(); }}
              >
                View Order
              </button>
            )}
            <button
              style={{ ...btn(isMobile), width: '100%', background: 'transparent', color: PANEL.body, border: `1.5px solid ${PANEL.line}`, boxShadow: 'none' }}
              onClick={onClose}
            >
              {(!editingOrder && onViewOrder && orderId !== 'ok' && mode !== 'customer') ? 'Close' : 'Done'}
            </button>
          </div>
        }
      >
          <div style={{ textAlign: 'center', padding: isMobile ? '8px 0 4px' : '4px 0' }}>
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
      </Panel>
    );
  }

  // ── Edit-mode: single-step "Update Design" modal ─────────────────────────────
  if (editingOrder) {
    return (
      <Panel onClose={onClose} isMobile={isMobile} width={360} title="Update Design">
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
      </Panel>
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
      <Panel
        onClose={onClose}
        isMobile={isMobile}
        width={360}
        title={manual ? 'New Order' : mode === 'customer' ? 'Request a Quote' : 'Order This Cake'}
        subhead={
          <div style={{ display:'flex' }}>
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
        }
        bodyPadding={isMobile ? '20px 20px' : '16px 20px'}
        footer={
          <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%' }}>
            {/* Customer consent, captured at the moment of the affirmative act (DPDP "Layer 2").
                Submitting the quote IS the acceptance — so this is a passive notice, not a checkbox:
                a customer sending their own photo to their baker should not be made to tick a box,
                and asking once here is what lets us NOT ask on every upload. The consent EVENT is
                written server-side by POST /api/customer/orders (source 'quote'), so it cannot be
                skipped by the client. Customer mode only — a baker placing an order already accepted
                at signup/gate. Sits directly above the submit button so it is unmissable. */}
            {mode === 'customer' && isLastStep && (
              <div style={{ fontSize: 11, lineHeight: 1.45, color: '#888', textAlign: 'center', fontFamily: "'Quicksand',sans-serif" }}>
                By requesting a quote you agree to the{' '}
                <a href={`${legalBase}/terms`} target="_blank" rel="noopener noreferrer" style={{ color: primaryColor, fontWeight: 700 }}>Terms of Service</a>
                {' '}and{' '}
                <a href={`${legalBase}/privacy`} target="_blank" rel="noopener noreferrer" style={{ color: primaryColor, fontWeight: 700 }}>Privacy Policy</a>.
                {' '}Cartoon characters and brand themes are usually protected — your baker may not be able to use them.
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              {showBackInFooter && (
                <button style={{ padding: isMobile?'15px 20px':'12px 18px', borderRadius:14, border:`1.5px solid ${PANEL.line}`, fontSize: isMobile?15:13, fontWeight:700, cursor:'pointer', background:'#fff', color:PANEL.body, fontFamily:"'Quicksand',sans-serif", flexShrink:0 }}
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
          </div>
        }
      >
        <>

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

                    {/* Skip the search — go straight to a new customer (baker already knows). */}
                    <button
                      type="button"
                      onClick={startNewCustomer}
                      style={{
                        marginTop: 4, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                        color: primaryColor, fontFamily: "'Quicksand', sans-serif",
                        fontSize: isMobile ? 14 : 12, fontWeight: 700,
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New customer
                    </button>
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
                      <span style={lbl}>Phone *</span>
                      <input style={inp} type="tel" value={customer.phone}
                        placeholder="e.g. 98765 43210"
                        onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && canGoNext0 && setStep(1)} />
                    </label>

                    <label style={field}>
                      <span style={lbl}>Email (optional)</span>
                      <input style={inp} type="email" value={customer.email}
                        placeholder="name@example.com"
                        onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && canGoNext0 && setStep(1)} />
                      {customer.email.trim() && !emailOk && (
                        <span style={{ fontSize: 11, color: '#e53935', fontWeight: 600 }}>Enter a valid email address.</span>
                      )}
                    </label>
                  </>
                )}
              </>
            )}

            {/* ── Step: Cake details ── */}
            {currentStepKey === 'details' && (
              <>
                {manual && (
                  <ReferenceUploader
                    apiClient={apiClient}
                    keys={referenceKeys}
                    setKeys={setReferenceKeys}
                    maxImageBytes={maxImageBytes}
                    isMobile={isMobile}
                    primaryColor={primaryColor}
                    lbl={lbl}
                  />
                )}

                <label style={field}>
                  <span style={lbl}>Cake weight (kg)</span>
                  <input style={inp} type="number" min="0.5" max="100" step="0.5"
                    placeholder="e.g. 2" value={weightKg} autoFocus
                    onChange={e => setWeightKg(e.target.value)} />
                </label>

                {/* ABOVE flavour on purpose: the requirement constrains which flavours
                    can be made, so it is asked before the thing it constrains. And it is
                    ORDER-level, not per tier like flavour — an eggless requirement is not
                    satisfied by an eggless top tier on an egg-based base. */}
                {visibleDietaryOptions.length > 0 && (
                  <div style={{ ...field, gap: isMobile?10:8 }}>
                    <span style={lbl}>Dietary requirements</span>
                    {['diet', 'allergen'].map(kind => {
                      const group = visibleDietaryOptions.filter(o => o.kind === kind);
                      if (!group.length) return null;
                      return (
                        <div key={kind} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {/* Split by kind rather than run together in one row: eggless is a
                              product attribute and an allergy is a safety matter, and a picker
                              that presents them identically invites treating them identically. */}
                          <span style={{ fontSize: isMobile?12:10, fontWeight:700, color:'#888' }}>
                            {kind === 'diet' ? 'Diet' : 'Allergies'}
                          </span>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            {group.map(o => {
                              const active = dietaryKeys.includes(o.key);
                              return (
                                <Chip key={o.key} label={o.label} active={active} isMobile={isMobile}
                                  tone={{ fg: primaryColor, bg: hexToRgba(primaryColor, 0.1), border: primaryColor }}
                                  onClick={() => setDietaryKeys(ks => active ? ks.filter(k => k !== o.key) : [...ks, o.key])} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* An allergen this bakery has said it can't guarantee. It stays
                        tickable and IS recorded on the order — the point is that the
                        baker sees it and can answer, not that the customer is turned
                        away with nowhere to put an allergy. */}
                    {unguaranteed.length > 0 && (() => {
                      const t = dietTone('allergen');
                      return (
                        <div style={{
                          border: `1.5px solid ${t.border}`, background: t.bg, borderRadius: 12,
                          padding: isMobile ? '12px 14px' : '10px 12px',
                          display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          {unguaranteed.map(o => (
                            <span key={o.key} style={{ fontSize: isMobile ? 13 : 12, fontWeight: 700, color: t.fg }}>
                              {unguaranteedSentence(o, { bakerName })}
                            </span>
                          ))}
                          <span style={{ fontSize: isMobile ? 12 : 11, fontWeight: 600, color: t.fg, opacity: 0.85 }}>
                            {conflictCallToAction({ audience: mode === 'customer' ? 'customer' : 'baker', bakerName })}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

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

                  {/* Directly under the picker, because it is about the choice just
                      made — not floated to the top of the form where it would read as a
                      general disclaimer and be scrolled past. Nothing above is disabled
                      and the submit button is untouched: this informs, it does not gate. */}
                  {flavourConflicts.length > 0 && (() => {
                    const t = dietTone(
                      flavourConflicts.some(c => c.requirement?.kind === 'allergen') ? 'allergen' : 'diet',
                    );
                    return (
                      <div style={{
                        border: `1.5px solid ${t.border}`, background: t.bg, borderRadius: 12,
                        padding: isMobile ? '12px 14px' : '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
                      }}>
                        {flavourConflicts.map((c, i) => (
                          <span key={`${c.flavourId}-${c.requirement.key}-${i}`}
                            style={{ fontSize: isMobile ? 13 : 12, fontWeight: 700, color: t.fg }}>
                            {tierCount > 1 && Number.isInteger(c.tier)
                              ? `${TIER_LABELS[c.tier] ?? `Tier ${c.tier + 1}`}: ` : ''}
                            {conflictSentence(c, { bakerName })}
                          </span>
                        ))}
                        {/* Once, under the list — the reassurance that they are not
                            being stopped matters more than repeating it per line. */}
                        <span style={{ fontSize: isMobile ? 12 : 11, fontWeight: 600, color: t.fg, opacity: 0.85 }}>
                          {conflictCallToAction({ audience: mode === 'customer' ? 'customer' : 'baker', bakerName })}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Optional, and deliberately three small controls rather than a form: a baker
                    taking this down mid-call will fill what they were told and skip the rest.
                    An age BAND is not asked here — on a call the number is what gets said, and
                    asking a baker to bucket it is asking them to do our filing. */}
                {/* Who FIRST, then the occasion — the order the storefront has always asked in
                    (FlavourFacet's QUESTIONS), and this form was the one screen disagreeing. It also
                    earns its keep: knowing the recipient is what lets the occasion list be ranked,
                    so asking the other way round threw that away. */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ ...field, flex: '1 1 130px' }}>
                    <span style={lbl}>Who&rsquo;s it for</span>
                    <select style={inp} value={recipient} onChange={e => setRecipient(e.target.value)}>
                      <option value="">—</option>
                      {RECIPIENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                  <label style={{ ...field, flex: '1 1 130px' }}>
                    <span style={lbl}>Occasion</span>
                    {/* Grouped, never trimmed. A baker on the phone must be able to write down
                        whatever they are told — see occasionsByRelevance. With no recipient chosen
                        `likely` is empty and this renders as the flat list it was. */}
                    <select style={inp} value={occasion} onChange={e => setOccasion(e.target.value)}>
                      <option value="">—</option>
                      {occasionChoices.likely.length > 0 ? (
                        <>
                          <optgroup label="Likely">
                            {occasionChoices.likely.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </optgroup>
                          <optgroup label="Other occasions">
                            {occasionChoices.other.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </optgroup>
                        </>
                      ) : occasionChoices.other.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                  {(occasion === 'birthday' || occasion === 'anniversary') && (
                    <label style={{ ...field, flex: '0 1 110px' }}>
                      {/* "Number on cake", never "Age" — the same rule the designer's number topper
                          follows. A 6 on a birthday cake is usually somebody's age, but the field is
                          not asking for one and the column does not store one: `orders.cake_number`
                          is production data the baker pipes, and 25 on an anniversary cake is years
                          married. Labelling it "Age" made the form appear to collect a child's age,
                          which is a materially different thing to hold under DPDP — for a word.
                          One label for both occasions now: "Which year" said the same thing twice. */}
                      <span style={lbl}>Number on cake</span>
                      <input style={inp} inputMode="numeric" value={cakeNumber} placeholder="e.g. 1"
                             onChange={e => setCakeNumber(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                    </label>
                  )}
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
        </>
      </Panel>
    </>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
// The overlay, sheet and drag handle that used to live here are now shared/Panel.jsx — this file
// had three copies of the same shell, and every other panel in the app had its own. Its mobile
// bottom-sheet behaviour is what the shared one adopted; its maroon scrim and 20px radius were the
// outliers and are gone.

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
