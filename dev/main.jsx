import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CakeDesigner, CreateTemplate, AuthGate, CustomerStorefront } from '../src/index.js';

const supabase = createClient(
  'https://lsvmnycehfopxsgruwmk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzdm1ueWNlaGZvcHhzZ3J1d21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjI0NjIsImV4cCI6MjA5MTM5ODQ2Mn0.ay0o6ugWvik_Mp607oYyYQIQzX4wphhhLNi-53HvwHY'
);

const API_URL = 'https://spattoo-backend.onrender.com';

function createApiClient(supabaseClient) {
  async function authFetch(path, options = {}) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `API error ${res.status}: ${path}`);
    }
    return res.json();
  }

  return {
    fetchElementTypes: () => authFetch('/api/element-types'),
    fetchElements: (opts = {}) => {
      const params = new URLSearchParams();
      if (opts.parentsOnly) params.set('parents_only', 'true');
      if (opts.elementTypeId) params.set('element_type_id', opts.elementTypeId);
      const qs = params.toString();
      return authFetch(`/api/elements${qs ? `?${qs}` : ''}`);
    },
    fetchTemplates: () => authFetch('/api/templates'),
    fetchTemplate: (id) => authFetch(`/api/templates/${id}`),
    fetchBakerProfile: () => authFetch('/api/baker/profile'),
    getSignedUploadUrl: (folder, filename, contentType) =>
      authFetch('/api/storage/sign-upload', {
        method: 'POST',
        body: JSON.stringify({ folder, filename, contentType }),
      }),
    fetchDashboard: () => authFetch('/api/baker/dashboard'),
    fetchDashboardBreakdown: (period) => authFetch(`/api/baker/dashboard/breakdown?period=${period}`),
    fetchOrders: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return authFetch(`/api/orders${qs ? `?${qs}` : ''}`);
    },
    updateOrderStatus: (orderId, status, comment) =>
      authFetch(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status, comment }) }),
    editOrder: (orderId, fields) =>
      authFetch(`/api/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    updateOrderDesign: (orderId, payload) =>
      authFetch(`/api/orders/${orderId}/design`, { method: 'PATCH', body: JSON.stringify(payload) }),
    fetchOrderAudit: (orderId) =>
      authFetch(`/api/orders/${orderId}/audit`),
    // X-Ray: batch craft-guide lookup for the piping elements in an order's design.
    fetchCraftGuides: (elementIds = []) =>
      elementIds.length
        ? authFetch(`/api/craft-guide?element_ids=${elementIds.map(encodeURIComponent).join(',')}`)
        : Promise.resolve([]),
    fetchNozzles: () => authFetch('/api/nozzles'),
    fetchCustomers: ({ includeInactive = false, from } = {}) => {
      const p = new URLSearchParams();
      if (includeInactive) p.set('include_inactive', 'true');
      if (from)            p.set('from', from);
      const qs = p.toString();
      return authFetch(`/api/baker/customers${qs ? `?${qs}` : ''}`);
    },
    createCustomer: (form) =>
      authFetch('/api/baker/customers', { method: 'POST', body: JSON.stringify(form) }),
    updateCustomer: (id, form) =>
      authFetch(`/api/baker/customers/${id}`, { method: 'PATCH', body: JSON.stringify(form) }),
    deactivateCustomer: (id) =>
      authFetch(`/api/baker/customers/${id}/deactivate`, { method: 'PATCH' }),
    reactivateCustomer: (id) =>
      authFetch(`/api/baker/customers/${id}/reactivate`, { method: 'PATCH' }),
    inviteCustomer: (form) =>
      authFetch('/api/baker/customers/invite', { method: 'POST', body: JSON.stringify(form) }),
    fetchMe: () => authFetch('/api/me'),
    fetchFlavours: (bakerSlug) =>
      fetch(`${API_URL}/api/flavours?bakerSlug=${bakerSlug}`).then(r => r.json()),
    placeOrder: async (payload) => {
      const profile = await authFetch('/api/baker/profile');
      return authFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ ...payload, bakerSlug: profile.baker.slug }),
      });
    },
    fetchBakerSettings: () => authFetch('/api/baker/settings'),
    updateBakerSettings: (settings) =>
      authFetch('/api/baker/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    // Global flavour master list with this baker's on/off state → [{ id, name, description, excluded }].
    // The API owns the schema (flavours / baker_flavour_exclusions) and resolution; core only sees flags.
    fetchBakerFlavours: () => authFetch('/api/baker/flavours'),
    updateBakerFlavourExclusions: (excludedFlavourIds) =>
      authFetch('/api/baker/flavours/exclusions', {
        method: 'PUT',
        body: JSON.stringify({ excluded_flavour_ids: excludedFlavourIds }),
      }),
    updateBakerProfile: (fields) =>
      authFetch('/api/baker/profile', { method: 'PATCH', body: JSON.stringify(fields) }),
    fetchBillingStatus:       () => authFetch('/api/billing/status'),
    fetchBillingPeriods:      () => authFetch('/api/billing/periods'),
    activateSparkPlan:   () => authFetch('/api/billing/activate-spark', { method: 'POST' }),
    fetchSubscriptionHistory: () => authFetch('/api/baker/subscription/history'),
    createSubscription: (tier, billing_period_id) =>
      authFetch('/api/billing/subscribe', { method: 'POST', body: JSON.stringify({ tier, billing_period_id }) }),
    cancelSubscription: () =>
      authFetch('/api/billing/cancel', { method: 'POST' }),
    signOut: () => supabaseClient.auth.signOut(),
    changePassword: (newPassword) => supabaseClient.auth.updateUser({ password: newPassword }),
  };
}

const apiClient = createApiClient(supabase);
const path = window.location.pathname;

// Public storefront — no auth. Resolved from the SUBDOMAIN (yellow-baker.localhost,
// mirroring prod yellow-baker.spattoo.com), falling back to /storefront?slug= for
// plain-localhost dev.
const host = window.location.hostname;
const subdomainSlug = host.endsWith('.localhost') && host !== 'localhost'
  ? host.slice(0, host.indexOf('.'))
  : null;
const params = new URLSearchParams(window.location.search);
const storefrontSlug = subdomainSlug
  || (path === '/storefront' ? (params.get('slug') || 'feelings-flavours') : null);

if (storefrontSlug) {
  const inviteId = params.get('invite');
  const slug = storefrontSlug;
  const container = document.getElementById('root');
  if (!container._reactRoot) container._reactRoot = ReactDOM.createRoot(container);
  container._reactRoot.render(
    <React.StrictMode>
      <CustomerStorefront
        slug={slug}
        inviteId={inviteId}
        apiBaseUrl={API_URL}
        supabase={supabase}
        onStartDesign={(b) => console.log('Start design for', b.slug)}
        onAuthenticated={(s) => console.log('Authenticated! session:', s)}
      />
    </React.StrictMode>
  );
}

function Root() {
  if (path === '/create-template') {
    return (
      <CreateTemplate
        supabase={supabase}
        onSaved={() => console.log('Template saved!')}
      />
    );
  }
  return (
    <CakeDesigner
      apiClient={apiClient}
      supabase={supabase}
      onOrder={({ design }) => console.log('Order:', design)}
    />
  );
}

if (!storefrontSlug) {
  const container = document.getElementById('root');
  if (!container._reactRoot) {
    container._reactRoot = ReactDOM.createRoot(container);
  }
  container._reactRoot.render(
    <React.StrictMode>
      <AuthGate supabase={supabase}>
        <Root />
      </AuthGate>
    </React.StrictMode>
  );
}
