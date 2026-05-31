import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CakeDesigner, CreateTemplate, AuthGate } from '../src/index.js';

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
      onOrder={({ design }) => console.log('Order:', design)}
    />
  );
}

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
