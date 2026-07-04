import { useState, useEffect } from 'react';
import PlanCards from '../billing/PlanCards.jsx';

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
}

const STATUS_META = {
  trial:     { label: 'Trial',     color: '#1a1a1a', bg: '#FDF5F7' },
  pending:   { label: 'Pending',   color: '#92400E', bg: '#FEF9C3' },
  active:    { label: 'Active',    color: '#065F46', bg: '#D1FAE5' },
  expired:   { label: 'Expired',   color: '#991B1B', bg: '#FEE2E2' },
  past_due:  { label: 'Past Due',  color: '#B45309', bg: '#FEF3C7' },
  paused:    { label: 'Paused',    color: '#1E40AF', bg: '#DBEAFE' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};

// Fallback labels when a tier isn't available; historyLabel() below adds the tier (e.g.
// "Upgraded to Blaze") when the event carries new_tier/previous_tier.
const EVENT_LABELS = {
  trial_started:       'Trial started',
  trial_expired:       'Trial expired',
  activated:           'Subscription activated',
  subscribed:          'Subscription activated',
  upgraded:            'Plan upgraded',
  downgraded:          'Plan downgraded',
  downgrade_scheduled: 'Downgrade scheduled',
  renewed:             'Subscription renewed',
  expired:             'Subscription expired',
  cancelled:           'Subscription cancelled',
  reactivated:            'Subscription reactivated',
  payment_method_changed: 'Payment method updated',
  interval_changed:       'Billing interval changed',
  payment_failed:         'Payment failed',
  admin_override:         'Updated by admin',
};

// Plan catalog (display names, taglines, feature bullets, prices, popular flag) now comes from
// the DB via GET /api/plans — see PlanCards + the billing fetch. Nothing hardcoded here.

const PERIOD_KEYS  = ['monthly', 'quarterly', 'yearly'];
const PERIOD_SHORT = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

function inferPeriodType(displayName) {
  const d = (displayName ?? '').toLowerCase();
  if (d.includes('year') || d.includes('annual')) return 'yearly';
  if (d.includes('quarter')) return 'quarterly';
  return 'monthly';
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.trial;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}


function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Keep subscription', onConfirm, onCancel, danger = false }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      fontFamily: "'Quicksand', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
        width: 340, maxWidth: 'calc(100vw - 40px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 20px', borderRadius: 10, border: '1.5px solid #E5E7EB',
              background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#6B7280',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none',
              background: danger ? '#DC2626' : '#1a1a1a', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#fff',
              boxShadow: danger ? '0 4px 12px rgba(220,38,38,0.3)' : 'none',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payments ──────────────────────────────────────────────────────────────────
const PAYMENT_STATUS_META = {
  captured: { label: 'Paid',     color: '#065F46', bg: '#D1FAE5' },
  failed:   { label: 'Failed',   color: '#991B1B', bg: '#FEE2E2' },
  refunded: { label: 'Refunded', color: '#6B7280', bg: '#F3F4F6' },
  unknown:  { label: '—',        color: '#6B7280', bg: '#F3F4F6' },
};

// `amount` is stored in minor units (paise) — render in major units.
function formatMoney(amount, currency = 'INR') {
  const major = (amount ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(major);
  } catch {
    return `${currency || 'INR'} ${major.toFixed(2)}`;
  }
}

function PaymentStatusPill({ status }) {
  const m = PAYMENT_STATUS_META[status] ?? PAYMENT_STATUS_META.unknown;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function PaymentRow({ p, divider }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: divider ? '1px solid #F0F4F1' : 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>{formatMoney(p.amount, p.currency)}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
          {new Date(p.charged_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
      <PaymentStatusPill status={p.status} />
    </div>
  );
}

// Latest payment on first look; the recent list is fetched on demand when expanded.
// `info` ({ payments:[latest], total }) comes from the panel's initial batch, so the
// collapsed view costs no extra request — only "View all" triggers a fetch.
function PaymentsCard({ info, apiClient, primaryColor, bare = false }) {
  const [expanded, setExpanded] = useState(false);
  const [all, setAll]           = useState(null);   // null until first expand
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);

  const latest = info?.payments?.[0];
  const total  = info?.total ?? 0;
  if (!latest) return null;

  const rows = expanded && all ? all : [latest];

  async function toggle() {
    if (expanded) { setExpanded(false); return; }
    if (!all && apiClient?.fetchPayments) {
      setLoading(true); setErr(null);
      try {
        const res = await apiClient.fetchPayments();
        setAll(res?.payments ?? []);
      } catch (e) {
        setErr(e.message); setLoading(false); return;
      }
      setLoading(false);
    }
    setExpanded(true);
  }

  // `bare` = render inside the Activity tab card (no own chrome / header — the tab supplies both).
  const inner = (
    <>
      {!bare && <div style={{ fontSize: 11, fontWeight: 800, color: '#9BB5A2', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Payments</div>}
      {rows.map((p, i) => <PaymentRow key={p.id} p={p} divider={i > 0} />)}
      {err && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 8, fontWeight: 600 }}>{err}</div>}
      {total > 1 && (
        <button
          onClick={toggle}
          disabled={loading}
          style={{
            marginTop: 10, background: 'none', border: 'none', padding: 0,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, color: primaryColor,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          {loading ? 'Loading…' : expanded ? 'Hide ▲' : `View all (${total}) ▾`}
        </button>
      )}
      {expanded && all && total > all.length && (
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>Showing the most recent {all.length} of {total}.</div>
      )}
    </>
  );
  if (bare) return inner;
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      {inner}
    </div>
  );
}

export default function BillingPanel({ open, onClose, apiClient, primaryColor = '#1a1a1a', accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [billing,        setBilling]        = useState(null);
  const [history,        setHistory]        = useState([]);
  const [periods,        setPeriods]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedTier,   setSelectedTier]   = useState('spark');
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [subscribing,    setSubscribing]    = useState(false);
  const [cancelling,     setCancelling]     = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);   // reactivation / downgrade confirm
  const [showMethodConfirm, setShowMethodConfirm] = useState(false);   // update-payment-method confirm
  const [error,          setError]          = useState(null);
  const [entitlements,   setEntitlements]   = useState(null);
  const [paymentsInfo,   setPaymentsInfo]   = useState(null);   // { payments:[latest], total }
  const [activityTab,    setActivityTab]    = useState('payments');   // bottom Activity card: 'payments' | 'history'
  const [plans,          setPlans]          = useState([]);     // DB plan catalog (GET /api/plans)

  // Refetch the MUTABLE billing data (status / history / entitlements / latest payment) — the server
  // is the source of truth. Called on open AND after every mutation so the WHOLE panel reconciles,
  // instead of drifting on partial optimistic updates (a stale cancel notice after resubscribe, a
  // subscription-history that never refreshes). periods + plans are a static catalog → loaded once.
  async function reload() {
    const [b, h, ent, pay] = await Promise.all([
      apiClient.fetchBillingStatus(),
      apiClient.fetchSubscriptionHistory().catch(() => []),
      apiClient.fetchEntitlements ? apiClient.fetchEntitlements().catch(() => null) : Promise.resolve(null),
      apiClient.fetchLatestPayment ? apiClient.fetchLatestPayment().catch(() => null) : Promise.resolve(null),
    ]);
    setBilling(b);
    setHistory(h);
    setEntitlements(ent);
    setPaymentsInfo(pay);
    setSelectedTier(b.tier ?? 'spark');
    if (b.billing_period) setSelectedPeriod(inferPeriodType(b.billing_period));
    return b;
  }

  // After a Checkout success the subscription.activated webhook processes ASYNCHRONOUSLY, so the
  // first refetch can still read 'pending'. Poll a few times until it settles (then give up quietly —
  // a later open reconciles). Runs in the background; it never blocks the UI.
  async function reloadUntilSettled(tries = 5, delayMs = 1500) {
    for (let i = 0; i < tries; i++) {
      const b = await reload().catch(() => null);
      if (b && b.status !== 'pending') return;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    Promise.all([
      apiClient.fetchBillingPeriods().catch(() => []),
      apiClient.fetchPlans ? apiClient.fetchPlans().catch(() => []) : Promise.resolve([]),
      reload(),
    ])
      .then(([p, pl]) => {
        setPeriods(p);
        setPlans(Array.isArray(pl) ? pl : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Open Razorpay Checkout for a just-created subscription and reconcile from the server afterwards.
  // Shared by every paid flow (subscribe / upgrade / downgrade / reactivate / payment-method change) so
  // the Checkout wiring lives in ONE place — the only thing that differs upstream is what createSubscription
  // was called with. `data` is the /billing/subscribe response.
  async function runCheckout(data) {
    if (data.mock || !data.key_id) {
      // TODO: remove this branch once Razorpay is live — open checkout instead
      await reload();
      return;
    }
    if (!window.Razorpay) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    await new Promise(resolve => {
      const rzp = new window.Razorpay({
        key: data.key_id, subscription_id: data.subscription_id,
        name: 'Spattoo', theme: { color: primaryColor },
        handler: () => { resolve(); reloadUntilSettled(); },   // reconcile from the server (webhook is async)
        modal: { ondismiss: resolve },
      });
      rzp.open();
    });
  }

  async function handleSubscribe() {
    setSubscribing(true); setError(null);
    try {
      if (selectedTier === 'spark') {
        await apiClient.activateSparkPlan();
        await reload();
        return;
      }
      const periodObj = periods.find(p => inferPeriodType(p.display_name) === selectedPeriod) ?? periods[0];
      // Interval switch (same tier, monthly↔yearly) is tagged so the timeline/logging read clearly; the
      // server independently confirms it by comparing periods, so this intent never gates the flow.
      const opts = isIntervalSwitch ? { intent: 'switch_interval' } : undefined;
      await runCheckout(await apiClient.createSubscription(selectedTier, periodObj?.id, opts));
    } catch (e) { setError(e.message); }
    finally { setSubscribing(false); }
  }

  // Update payment method (e.g. UPI→card): re-authorize a NEW mandate on the SAME plan + period. It's a
  // deferred recreate — the new method takes over at the next renewal, no double charge. Same Checkout
  // path as a normal subscribe, just with intent='change_method' + the current tier/period.
  async function handleUpdatePaymentMethod() {
    setSubscribing(true); setError(null);
    try {
      const curPeriod = inferPeriodType(billing?.billing_period);
      const periodObj = periods.find(p => inferPeriodType(p.display_name) === curPeriod) ?? periods[0];
      await runCheckout(await apiClient.createSubscription(billing.tier, periodObj?.id, { intent: 'change_method' }));
    } catch (e) { setError(e.message); }
    finally { setSubscribing(false); }
  }

  function handleCancel() {
    setShowCancelConfirm(true);
  }

  async function confirmCancel() {
    setShowCancelConfirm(false);
    setCancelling(true); setError(null);
    try {
      await apiClient.cancelSubscription();
      // Re-fetch authoritative state so the WHOLE panel reconciles (top card + history), not just a
      // local flag flip. cancelSubscription already set cancel_at_period_end server-side.
      await reload();
    } catch (e) { setError(e.message); }
    finally { setCancelling(false); }
  }

  if (!open) return null;

  const isActive        = billing?.status === 'active';
  const cancelScheduled = !!billing?.cancel_at_period_end;
  const isOnSpark  = billing?.tier === 'spark';
  const endDate    = billing?.next_billing_at ? new Date(billing.next_billing_at) : null;
  const daysLeft   = endDate ? Math.max(0, Math.ceil((endDate - Date.now()) / 86400000)) : null;

  // cancel_at_period_end is set by BOTH a real cancel AND a scheduled change (downgrade / reactivation /
  // interval switch), so distinguish them for the copy. `scheduled_downgrade_to` = the plan that takes
  // over at period end; `scheduled_period` = the period it moves to (set only for a same-tier interval switch).
  const currentPeriodType    = inferPeriodType(billing?.billing_period);
  const scheduledTo          = billing?.scheduled_downgrade_to ?? null;
  const scheduledPeriod      = billing?.scheduled_period ?? null;                // period the baker moves to (interval switch)
  // Same tier + a different scheduled period = an armed interval switch (NOT a plain reactivate/renew).
  const isIntervalScheduled  = !!scheduledTo && scheduledTo === billing?.tier && !!scheduledPeriod && scheduledPeriod !== currentPeriodType;
  const isReactivateSame     = !!scheduledTo && scheduledTo === billing?.tier && !isIntervalScheduled;   // resubscribed to same plan → renews
  const isDowngradeScheduled = !!scheduledTo && scheduledTo !== billing?.tier;   // scheduled change to a different tier
  const realCancel           = cancelScheduled && !scheduledTo;                  // a true cancel (no pending change)
  const windingDown          = isActive && realCancel;                           // cancelled + in grace → reactivatable
  // Spark is the free baseline — a PAID baker can't re-select it (returning to free = Cancel). A baker
  // still on Spark keeps seeing it. Shared PlanCards (onboarding) is unaffected — this filters here only.
  const selectablePlans = (isActive && !isOnSpark) ? plans.filter(p => p.name !== 'spark') : plans;

  // Rank + display name come from the DB catalog (sort_order is the tier rank).
  const planByName   = Object.fromEntries(plans.map(p => [p.name, p]));
  const rankOf       = name => planByName[name]?.sort_order ?? 0;
  const labelOf      = name => planByName[name]?.display_name ?? (name ? name[0].toUpperCase() + name.slice(1) : '—');
  const currentRank  = rankOf(billing?.tier);
  const selectedRank = rankOf(selectedTier);
  // Same tier is only "current" when NOT winding down — while cancelled, picking the same tier = reactivate.
  const isSameTier = billing && selectedTier === billing.tier && !windingDown;
  // The TRUE no-op = same tier AND same period (disables the CTA). Same tier + a DIFFERENT period is an
  // interval switch (monthly↔yearly) — a real, deferred change, not a no-op.
  const isSameTierSamePeriod = isSameTier && selectedPeriod === currentPeriodType;
  const isIntervalSwitch     = isSameTier && isActive && !isOnSpark && selectedPeriod !== currentPeriodType;

  function ctaLabel() {
    if (subscribing) return 'Processing…';
    if (windingDown) return selectedTier === billing.tier ? `Reactivate ${labelOf(selectedTier)}` : `Switch to ${labelOf(selectedTier)}`;
    if (isSameTierSamePeriod) return `${labelOf(selectedTier)} — Current Plan`;
    if (isIntervalSwitch) return `Switch to ${PERIOD_SHORT[selectedPeriod]} billing`;
    if (selectedTier === 'spark') return 'Switch to Spark — Free';
    if (!isActive || isOnSpark || selectedRank > currentRank) return `Upgrade to ${labelOf(selectedTier)}`;
    return `Switch to ${labelOf(selectedTier)}`;
  }

  // A reactivation, downgrade, or interval switch defers to period-end — confirm first so the baker sees it.
  const needsChangeConfirm = billing && !isSameTierSamePeriod && selectedTier !== 'spark'
    && (windingDown || isIntervalSwitch || (isActive && !isOnSpark && selectedRank < currentRank));
  function changeConfirmMessage() {
    const cur = labelOf(billing?.tier), next = labelOf(selectedTier);
    const dateStr = endDate ? endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of your current period';
    const reauth = ' You’ll re-authorize your payment method now.';
    if (isIntervalSwitch) {   // same tier, monthly↔yearly — deferred to cycle end, fresh mandate now
      return `You’ll keep ${PERIOD_SHORT[currentPeriodType]} billing until ${dateStr}, then switch to ${PERIOD_SHORT[selectedPeriod]} billing.${reauth}`;
    }
    if (windingDown && selectedRank > currentRank) {   // reactivate to a higher tier = immediate upgrade
      return `You’ll upgrade to ${next} now.${reauth}`;
    }
    if (windingDown && selectedTier === billing?.tier) {   // reactivate the same plan = it just renews
      return `Your subscription will continue — you keep access until ${dateStr}, then it renews as ${next}.${reauth}`;
    }
    const dgReauth = windingDown ? reauth : '';
    return `You’ll keep ${cur} until ${dateStr}, then move to ${next}.${dgReauth}`;   // downgrade / reactivate-lower
  }

  function getDiscount(pk) {
    return periods.find(p => inferPeriodType(p.display_name) === pk)?.discount_pct ?? 0;
  }

  // History row label with the tier woven in (events carry previous_tier/new_tier). Falls back to the
  // plain EVENT_LABELS map when a tier isn't present.
  function historyLabel(ev) {
    const to   = ev.new_tier      ? labelOf(ev.new_tier)      : null;
    const from = ev.previous_tier ? labelOf(ev.previous_tier) : null;
    switch (ev.event) {
      case 'activated':
      case 'subscribed':          return to   ? `Subscription activated — ${to}` : EVENT_LABELS.activated;
      case 'upgraded':            return to   ? `Upgraded to ${to}`              : EVENT_LABELS.upgraded;
      case 'downgraded':          return to   ? `Downgraded to ${to}`            : EVENT_LABELS.downgraded;
      case 'reactivated':         return to   ? `Reactivated — ${to}`            : EVENT_LABELS.reactivated;
      case 'payment_method_changed': return EVENT_LABELS.payment_method_changed;
      case 'interval_changed':    return EVENT_LABELS.interval_changed;
      case 'downgrade_scheduled': return to   ? `Downgrade to ${to} scheduled`   : EVENT_LABELS.downgrade_scheduled;
      case 'renewed':             return to   ? `Renewed — ${to}`                : EVENT_LABELS.renewed;
      case 'expired':             return to   ? `${to} expired`                  : EVENT_LABELS.expired;
      case 'cancelled':           return from ? `${from} cancelled`              : EVENT_LABELS.cancelled;
      default:                    return EVENT_LABELS[ev.event] ?? ev.event;
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 76,
        zIndex: 310, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F4F8F5',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
          }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Billing</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Manage your subscription</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading…
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {billing && (
            <>
              {/* ── Current plan ─────────────────────────────────── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#9BB5A2', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Current Plan</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>
                      {labelOf(billing.tier)}
                    </div>
                    {endDate && isActive && !isDowngradeScheduled && !isIntervalScheduled && (
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: (realCancel || daysLeft <= 7) ? '#DC2626' : '#6B7280' }}>
                        {realCancel ? 'Ends' : isOnSpark ? 'Expires' : 'Renews'}{' '}
                        {endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {realCancel
                          ? ' · won’t renew'
                          : daysLeft <= 7 ? ` · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : ''}
                      </div>
                    )}
                    {endDate && isActive && isDowngradeScheduled && (
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: '#6B7280' }}>
                        Until {endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {' · then '}<span style={{ fontWeight: 800, color: '#1a1a1a' }}>{labelOf(scheduledTo)}</span>
                      </div>
                    )}
                    {endDate && isActive && isIntervalScheduled && (
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: '#6B7280' }}>
                        {PERIOD_SHORT[currentPeriodType]} until {endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {' · then '}<span style={{ fontWeight: 800, color: '#1a1a1a' }}>{PERIOD_SHORT[scheduledPeriod]} billing</span>
                      </div>
                    )}
                    {billing.status === 'expired' && (
                      <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginTop: 4 }}>
                        Subscription expired — choose a plan below
                      </div>
                    )}
                  </div>
                  <StatusBadge status={billing.status} />
                </div>

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0F4F1', display: 'flex', alignItems: 'center', justifyContent: (realCancel || isDowngradeScheduled || isIntervalScheduled) ? 'flex-start' : 'flex-end', gap: 12 }}>
                  {realCancel ? (
                    // Grace notice — a REAL cancellation (cancel_at_period_end with NO scheduled downgrade).
                    // An upgrade supersedes the old plan instead of setting this flag; a downgrade sets the
                    // flag too but is handled by the branch below (it's a plan change, not a cancel).
                    <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>
                      Cancellation scheduled — you'll keep access until this period ends.
                    </div>
                  ) : isDowngradeScheduled ? (
                    <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>
                      Moving to {labelOf(scheduledTo)} on {endDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} — you keep {labelOf(billing.tier)} until then.
                    </div>
                  ) : isIntervalScheduled ? (
                    <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>
                      Switching to {PERIOD_SHORT[scheduledPeriod]} billing on {endDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} — you keep {PERIOD_SHORT[currentPeriodType]} billing until then.
                    </div>
                  ) : (
                    <>
                      {/* Update payment method — a healthy PAID sub only (Spark has no mandate). Re-auths a
                          new method on the same plan; deferred, takes over at next renewal. */}
                      {isActive && !isOnSpark && (
                        <button
                          onClick={() => setShowMethodConfirm(true)}
                          disabled={subscribing || cancelling}
                          style={{
                            flexShrink: 0,
                            background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 8,
                            padding: '7px 16px', cursor: (subscribing || cancelling) ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                            color: '#374151', opacity: (subscribing || cancelling) ? 0.6 : 1,
                          }}
                        >
                          Update payment method
                        </button>
                      )}
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        style={{
                          flexShrink: 0,
                          background: '#fff', border: '1.5px solid #FCA5A5', borderRadius: 8,
                          padding: '7px 16px', cursor: cancelling ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          color: cancelling ? '#ccc' : '#DC2626', opacity: cancelling ? 0.6 : 1,
                        }}
                      >
                        {cancelling ? 'Cancelling…' : 'Cancel subscription'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Plan picker ──────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>
                  {isOnSpark ? 'Upgrade your plan' : isActive ? 'Switch plan' : 'Choose a plan'}
                </div>

                {/* Period toggle */}
                <div style={{
                  display: 'flex', background: '#fff', borderRadius: 12, padding: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)', alignSelf: 'flex-start', gap: 2,
                }}>
                  {PERIOD_KEYS.map(pk => {
                    const active = selectedPeriod === pk;
                    const disc   = getDiscount(pk);
                    return (
                      <button
                        key={pk}
                        onClick={() => setSelectedPeriod(pk)}
                        style={{
                          padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          background: active ? `linear-gradient(135deg, ${primaryColor}, ${accentColor})` : 'transparent',
                          color: active ? '#fff' : '#888',
                          transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {PERIOD_SHORT[pk]}
                        {disc > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 20,
                            background: active ? 'rgba(255,255,255,0.25)' : '#D1FAE5',
                            color: active ? '#fff' : '#065F46',
                          }}>
                            -{disc}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Shared select-to-expand plan cards (same component as onboarding). */}
                <PlanCards
                  plans={selectablePlans}
                  periods={periods}
                  selectedPeriod={selectedPeriod}
                  selected={selectedTier}
                  currentTier={isActive ? billing.tier : null}
                  onSelect={setSelectedTier}
                  theme={{ accent: primaryColor, check: primaryColor, popularBg: primaryColor }}
                />

                {/* Subscribe / Upgrade button — always visible */}
                <button
                  onClick={isSameTierSamePeriod ? undefined : (needsChangeConfirm ? () => setShowChangeConfirm(true) : handleSubscribe)}
                  disabled={subscribing || isSameTierSamePeriod}
                  style={{
                    padding: '15px', borderRadius: 14, border: 'none',
                    cursor: (subscribing || isSameTierSamePeriod) ? 'default' : 'pointer',
                    background: (subscribing || isSameTierSamePeriod)
                      ? '#E2E8E4'
                      : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                    color: (subscribing || isSameTierSamePeriod) ? '#9BB5A2' : '#fff',
                    fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
                    boxShadow: (subscribing || isSameTierSamePeriod) ? 'none' : `0 6px 20px ${primaryColor}40`,
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {subscribing && (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                  )}
                  {ctaLabel()}
                </button>
              </div>

              {/* ── Activity (Payments + Subscription history) — tabbed, one at a time ── */}
              {/* History is reference material → kept at the bottom, both under one card. */}
              {(paymentsInfo?.total > 0 || history.length > 0) && (
                <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  {/* Tab header */}
                  <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid #F0F4F1', marginBottom: 16 }}>
                    {[['payments', 'Payments'], ['history', 'History']].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setActivityTab(key)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        padding: '0 0 10px', marginBottom: -1,
                        fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
                        color: activityTab === key ? '#2C4433' : '#9BB5A2',
                        borderBottom: `2px solid ${activityTab === key ? '#2C4433' : 'transparent'}`,
                      }}>{label}</button>
                    ))}
                  </div>

                  {activityTab === 'payments' ? (
                    paymentsInfo?.total > 0
                      ? <PaymentsCard bare info={paymentsInfo} apiClient={apiClient} primaryColor={primaryColor} />
                      : <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No payments yet.</div>
                  ) : (
                    history.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {history.map((ev, i) => (
                          <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2C4433', marginTop: 3, flexShrink: 0 }} />
                              {i < history.length - 1 && <div style={{ width: 2, flex: 1, background: '#E8EFE9', marginTop: 3 }} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{historyLabel(ev)}</div>
                              {ev.note && <div style={{ fontSize: 11, color: '#888', marginTop: 3, fontStyle: 'italic' }}>"{ev.note}"</div>}
                              <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
                                {new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No subscription activity yet.</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel subscription?"
        message={isDowngradeScheduled
          ? `You have a downgrade to ${labelOf(scheduledTo)} scheduled${endDate ? ` for ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''} — cancelling discards it. You'll keep ${labelOf(billing.tier)} until then, then your subscription ends. This can't be undone.`
          : "You'll keep full access until the end of your current billing period. This action cannot be undone."}
        confirmLabel="Yes, cancel"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <ConfirmDialog
        open={showChangeConfirm}
        title={isIntervalSwitch ? 'Switch billing interval?' : windingDown ? 'Reactivate subscription?' : 'Switch plan?'}
        message={changeConfirmMessage()}
        confirmLabel="Continue"
        onConfirm={() => { setShowChangeConfirm(false); handleSubscribe(); }}
        onCancel={() => setShowChangeConfirm(false)}
      />

      <ConfirmDialog
        open={showMethodConfirm}
        title="Update payment method?"
        message={`You’ll re-authorize your payment method now. Your ${labelOf(billing?.tier)} plan continues${endDate ? ` — the new method takes over at your next renewal on ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' and the new method takes over at your next renewal'}.`}
        confirmLabel="Continue"
        cancelLabel="Not now"
        onConfirm={() => { setShowMethodConfirm(false); handleUpdatePaymentMethod(); }}
        onCancel={() => setShowMethodConfirm(false)}
      />
    </>
  );
}
