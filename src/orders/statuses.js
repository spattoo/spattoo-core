// ── Order lifecycle: the ONE place core derives status behaviour ──────────────
// The lifecycle is owned by the DB (order_statuses table) and served via
// GET /api/order-statuses. Core keeps ONE fallback copy (used until the host wires
// apiClient.fetchOrderStatuses) and derives EVERY status-dependent bit — labels,
// filter chips, the stepper, the calendar — from it, instead of scattered hardcoded
// maps. Visual tone stays a core concern (a deliberate MONOCHROME design: no
// per-status hues), derived from lifecycle position rather than per-status colours.
//
// Lives here rather than inside OrdersPanel because the Orders list and the Orders
// calendar both need it — a second copy would drift the moment a status is added.

export const DEFAULT_STATUSES = [
  { key: 'initiated',      label: 'Initiated',      phase: 'quote',       sort_order: 10,  is_terminal: false },
  { key: 'requested',      label: 'Requested',      phase: 'quote',       sort_order: 20,  is_terminal: false },
  { key: 'quoted',         label: 'Quoted',         phase: 'quote',       sort_order: 30,  is_terminal: false },
  { key: 'quote_approved', label: 'Quote approved', phase: 'fulfillment', sort_order: 35,  is_terminal: false },
  { key: 'confirmed',      label: 'Confirmed',      phase: 'fulfillment', sort_order: 40,  is_terminal: false },
  { key: 'in_production',  label: 'In production',  phase: 'fulfillment', sort_order: 50,  is_terminal: false },
  { key: 'ready',          label: 'Ready',          phase: 'fulfillment', sort_order: 60,  is_terminal: false },
  { key: 'completed',      label: 'Completed',      phase: 'fulfillment', sort_order: 70,  is_terminal: true  },
  { key: 'declined',       label: 'Declined',       phase: 'closed',      sort_order: 80,  is_terminal: true  },
  { key: 'cancelled',      label: 'Cancelled',      phase: 'closed',      sort_order: 90,  is_terminal: true  },
  { key: 'expired',        label: 'Expired',        phase: 'closed',      sort_order: 100, is_terminal: true  },
];

// Build a lookup index + derived lists from a status list (API or fallback).
export function buildStatusIndex(list) {
  const ordered   = [...list].sort((a, b) => a.sort_order - b.sort_order);
  const byKey     = Object.fromEntries(ordered.map(s => [s.key, s]));
  // The happy-path stepper is everything that isn't a closed off-ramp, in order.
  const flowSteps = ordered.filter(s => s.phase !== 'closed');
  return { ordered, byKey, flowSteps };
}

export const DEFAULT_STATUS_INDEX = buildStatusIndex(DEFAULT_STATUSES);

export const statusLabel = (idx, key) => idx.byKey[key]?.label ?? key;
export const isClosed    = (idx, key) => idx.byKey[key]?.phase === 'closed';
export const isTerminal  = (idx, key) => !!idx.byKey[key]?.is_terminal;

// The design is pinned from 'confirmed' onward (the agreed cake) and in any closed
// state — editable only during the quote phase. Locked orders open VIEW-only in 3D.
export const isDesignLocked = (idx, key) => {
  const s = idx.byKey[key];
  if (!s) return false;
  if (s.phase === 'closed') return true;
  const confirmedOrder = idx.byKey['confirmed']?.sort_order ?? Infinity;
  return s.sort_order >= confirmedOrder;
};

// Monochrome badge tone derived from lifecycle position — no per-status hues.
// Completed = solid ink; closed off-ramps = muted outline; in-flight = soft grey.
export function statusTone(idx, key) {
  if (key === 'completed') return { bg: '#1a1a1a', color: '#fff',    border: 'transparent' };
  if (isClosed(idx, key))  return { bg: '#fff',    color: '#999',    border: '#E0DDD8' };
  return                          { bg: '#ECEBE6', color: '#5e5e5e', border: 'transparent' };
}
