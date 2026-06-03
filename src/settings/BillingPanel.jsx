import { useState, useEffect } from 'react';

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
  trial:     { label: 'Trial',     color: '#9B5F72', bg: '#FDF5F7' },
  pending:   { label: 'Pending',   color: '#92400E', bg: '#FEF9C3' },
  active:    { label: 'Active',    color: '#065F46', bg: '#D1FAE5' },
  expired:   { label: 'Expired',   color: '#991B1B', bg: '#FEE2E2' },
  past_due:  { label: 'Past Due',  color: '#B45309', bg: '#FEF3C7' },
  paused:    { label: 'Paused',    color: '#1E40AF', bg: '#DBEAFE' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};

const EVENT_LABELS = {
  trial_started:  'Trial started',
  trial_expired:  'Trial expired',
  activated:      'Subscription activated',
  upgraded:       'Plan upgraded',
  downgraded:     'Plan downgraded',
  cancelled:      'Subscription cancelled',
  reactivated:    'Subscription reactivated',
  payment_failed: 'Payment failed',
  admin_override: 'Updated by admin',
};

const PLAN_INFO = {
  spark: {
    label: 'Spark', free: true, rank: 0,
    color: '#6B7280',
    tagline: '10 orders · 1 member · Help docs',
    features: ['Design canvas', '10 total orders', '1 team member', 'Help docs support'],
    prices: { monthly: 'Free', quarterly: 'Free', yearly: 'Free' },
  },
  flame: {
    label: 'Flame', rank: 1,
    color: '#C2410C',
    gradient: 'linear-gradient(135deg, #C2410C, #EA580C)',
    tagline: 'Unlimited orders · Subdomain · WhatsApp',
    features: ['Unlimited orders', 'Custom subdomain', 'WhatsApp notifications', '2 team members', 'Email support'],
    prices: { monthly: '₹999', quarterly: '₹2,697', yearly: '₹9,999' },
  },
  blaze: {
    label: 'Blaze', popular: true, rank: 2,
    color: '#7C3AED',
    gradient: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
    tagline: 'Custom templates · Branding · 5 members',
    features: ['Everything in Flame', 'Custom templates', 'Custom branding', 'Branded subdomain', '5 team members', 'Priority chat support'],
    prices: { monthly: '₹2,499', quarterly: '₹6,747', yearly: '₹24,999' },
  },
  forge: {
    label: 'Forge', rank: 3,
    color: '#1D4ED8',
    gradient: 'linear-gradient(135deg, #1E3A8A, #1D4ED8)',
    tagline: 'Unlimited team · Account manager',
    features: ['Everything in Blaze', 'Unlimited team members', 'Dedicated account manager'],
    prices: { monthly: '₹4,999', quarterly: '₹13,497', yearly: '₹49,999' },
  },
};

const PERIOD_KEYS  = ['monthly', 'quarterly', 'yearly'];
const PERIOD_SHORT = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const PERIOD_LABEL = { monthly: '/mo', quarterly: '/qtr', yearly: '/yr' };

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

function PlanRow({ planKey, selected, onSelect, currentTier, isActive, period, primaryColor }) {
  const info       = PLAN_INFO[planKey];
  const isCurrent  = currentTier === planKey && isActive;
  const isSelected = selected === planKey;
  const price      = info.prices[period] ?? info.prices.monthly;

  return (
    <div
      onClick={() => onSelect(planKey)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
        background: isSelected ? `${primaryColor}0a` : '#fff',
        border: `1.5px solid ${isSelected ? primaryColor : '#E8EFE9'}`,
        boxShadow: isSelected ? `0 0 0 3px ${primaryColor}20` : 'none',
        transition: 'all 0.15s',
      }}
    >
      {/* Radio */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${isSelected ? primaryColor : '#CBD5E1'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.15s',
      }}>
        {isSelected && (
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: primaryColor }} />
        )}
      </div>

      {/* Name + tagline */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>{info.label}</span>
          {info.popular && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
              background: `${primaryColor}15`, color: primaryColor,
            }}>
              Most Popular
            </span>
          )}
          {isCurrent && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: '#F0F4F1', color: '#6B7280', border: '1px solid #D4E0D7',
            }}>
              current
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3, fontWeight: 500 }}>
          {info.tagline}
        </div>
      </div>

      {/* Price */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: isSelected ? primaryColor : '#374151' }}>
          {price}
        </span>
        {!info.free && (
          <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 2, fontWeight: 600 }}>
            {PERIOD_LABEL[period]}
          </span>
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel, danger = false }) {
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
            Keep subscription
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
  const [error,          setError]          = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    Promise.all([
      apiClient.fetchBillingStatus(),
      apiClient.fetchSubscriptionHistory().catch(() => []),
      apiClient.fetchBillingPeriods().catch(() => []),
    ])
      .then(([b, h, p]) => {
        setBilling(b);
        setHistory(h);
        setPeriods(p);
        setSelectedTier(b.tier ?? 'spark');
        if (b.billing_period) setSelectedPeriod(inferPeriodType(b.billing_period));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSubscribe() {
    setSubscribing(true); setError(null);
    try {
      if (selectedTier === 'spark') {
        await apiClient.activateSparkPlan();
        setBilling(b => ({ ...b, status: 'active', tier: 'spark' }));
        return;
      }
      const periodObj = periods.find(p => inferPeriodType(p.display_name) === selectedPeriod) ?? periods[0];
      const data = await apiClient.createSubscription(selectedTier, periodObj?.id);

      if (data.mock || !data.key_id) {
        // TODO: remove this branch once Razorpay is live — open checkout instead
        setBilling(b => ({ ...b, status: 'active', tier: selectedTier }));
      } else {
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
            handler: () => { setBilling(b => ({ ...b, status: 'active', tier: selectedTier })); resolve(); },
            modal: { ondismiss: resolve },
          });
          rzp.open();
        });
      }
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
      setBilling(b => ({ ...b, status: 'cancelled' }));
    } catch (e) { setError(e.message); }
    finally { setCancelling(false); }
  }

  if (!open) return null;

  const isActive   = billing?.status === 'active';
  const isOnSpark  = billing?.tier === 'spark';
  const endDate    = billing?.next_billing_at ? new Date(billing.next_billing_at) : null;
  const daysLeft   = endDate ? Math.max(0, Math.ceil((endDate - Date.now()) / 86400000)) : null;

  const currentRank  = PLAN_INFO[billing?.tier]?.rank ?? 0;
  const selectedRank = PLAN_INFO[selectedTier]?.rank   ?? 0;
  const isSameTier   = billing && selectedTier === billing.tier;

  function ctaLabel() {
    if (subscribing) return 'Processing…';
    if (isSameTier) return `${PLAN_INFO[selectedTier]?.label ?? 'Current'} — Current Plan`;
    if (selectedTier === 'spark') return 'Switch to Spark — Free';
    if (!isActive || isOnSpark || selectedRank > currentRank) return `Upgrade to ${PLAN_INFO[selectedTier]?.label}`;
    return `Switch to ${PLAN_INFO[selectedTier]?.label}`;
  }

  function getDiscount(pk) {
    return periods.find(p => inferPeriodType(p.display_name) === pk)?.discount_pct ?? 0;
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
                      {PLAN_INFO[billing.tier]?.label ?? billing.tier ?? '—'}
                    </div>
                    {endDate && isActive && (
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: daysLeft <= 7 ? '#DC2626' : '#6B7280' }}>
                        {isOnSpark ? 'Expires' : 'Renews'}{' '}
                        {endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {daysLeft <= 7 && ` · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
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

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0F4F1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 11, color: '#9BB5A2', fontWeight: 500 }}>
                    You'll keep access until the end of this billing period.
                  </div>
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

                {/* Radio rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.keys(PLAN_INFO).map(key => (
                    <PlanRow
                      key={key}
                      planKey={key}
                      selected={selectedTier}
                      onSelect={setSelectedTier}
                      currentTier={billing.tier}
                      isActive={isActive}
                      period={selectedPeriod}
                      primaryColor={primaryColor}
                    />
                  ))}
                </div>

                {/* Subscribe / Upgrade button — always visible */}
                <button
                  onClick={isSameTier ? undefined : handleSubscribe}
                  disabled={subscribing || isSameTier}
                  style={{
                    padding: '15px', borderRadius: 14, border: 'none',
                    cursor: (subscribing || isSameTier) ? 'default' : 'pointer',
                    background: (subscribing || isSameTier)
                      ? '#E2E8E4'
                      : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                    color: (subscribing || isSameTier) ? '#9BB5A2' : '#fff',
                    fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
                    boxShadow: (subscribing || isSameTier) ? 'none' : `0 6px 20px ${primaryColor}40`,
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {subscribing && (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                  )}
                  {ctaLabel()}
                </button>
              </div>

              {/* ── History ──────────────────────────────────────── */}
              {history.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#9BB5A2', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>History</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {history.map((ev, i) => (
                      <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2C4433', marginTop: 3, flexShrink: 0 }} />
                          {i < history.length - 1 && <div style={{ width: 2, flex: 1, background: '#E8EFE9', marginTop: 3 }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{EVENT_LABELS[ev.event] ?? ev.event}</div>
                          {ev.new_status && <StatusBadge status={ev.new_status} />}
                          {ev.note && <div style={{ fontSize: 11, color: '#888', marginTop: 3, fontStyle: 'italic' }}>"{ev.note}"</div>}
                          <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
                            {new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel subscription?"
        message="You'll keep full access until the end of your current billing period. This action cannot be undone."
        confirmLabel="Yes, cancel"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
}
