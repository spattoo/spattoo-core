import { createRoot } from 'react-dom/client';
import BillingPanel from '../src/settings/BillingPanel.jsx';

// ── Billing, in the states you cannot reach by using the app ────────────────────────────────────
// `?tier=blaze&status=expired` is the screenshot that started this: a lapsed Blaze baker was being
// offered Spark, free and top of the list, when Spark is the one plan they can never have again.
// `?tier=spark` is the other half — every trialing baker, who must still see a sane selection once
// Spark is filtered out of the chooser.
const q = new URLSearchParams(location.search);
const tier   = q.get('tier')   || 'blaze';
const status = q.get('status') || 'active';

// Prices in paise, ordered by sort_order exactly as GET /plans returns them.
const PLANS = [
  { id: 1, name: 'spark', display_name: 'Spark', tagline: 'Everything, free for 30 days', sort_order: 0, price_monthly: 0,      price_yearly: 0,       feature_bullets: ['Design canvas'] },
  { id: 2, name: 'flame', display_name: 'Flame', tagline: 'Less than the price of one cake', sort_order: 1, price_monthly: 99900,  price_yearly: 999900,  feature_bullets: ['Public storefront'] },
  { id: 3, name: 'blaze', display_name: 'Blaze', tagline: 'For a bakery with a queue', sort_order: 2, price_monthly: 249900, price_yearly: 2499900, feature_bullets: ['Edible Print Studio'] },
];

const apiClient = new Proxy({
  fetchPlans:   async () => PLANS,
  fetchBillingPeriods: async () => ([{ id: 1, name: 'monthly', months: 1, discount_pct: 0 }, { id: 2, name: 'yearly', months: 12, discount_pct: 17 }]),
  fetchBillingStatus: async () => ({ tier, status, next_billing_at: null, cancel_at_period_end: false }),
  fetchSubscriptionHistory: async () => [],
  fetchEntitlements: async () => ({ ent: {} }),
}, { get: (t, k) => t[k] ?? (async () => null) });

createRoot(document.getElementById('root')).render(
  <BillingPanel open apiClient={apiClient} onClose={() => {}} primaryColor="#3D5A44" accentColor="#6b8f76" />,
);
