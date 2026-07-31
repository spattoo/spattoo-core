// ── "The balance moved" ──────────────────────────────────────────────────────────────────────────
// The credits pill lives in the app header; the things that SPEND credits live several screens away
// (an order's build-guide button) or in another panel entirely (a top-up checkout). Threading a
// refresh callback from the header down through OrdersPanel into a launcher would mean every
// component in between carrying a prop it has no use for.
//
// So: one module-level notification, published by whatever moved the balance and consumed by
// whatever displays it. It deliberately carries NO data — the pill re-reads from the server rather
// than trusting a number computed on the client. The server is the only thing that knows what a
// reservation actually cost, and a debit can still be released after the fact.
//
// Why this matters at all: a meter that silently goes stale is worse than no meter, because it is
// believed. A baker who makes three build guides and still sees the opening number has been told
// something false.

const listeners = new Set();

// Call after anything that could have moved the balance — a kept generation, a released one, a
// completed top-up. Cheap and idempotent; over-notifying costs one request.
export function creditsChanged() {
  for (const fn of listeners) {
    try { fn(); } catch { /* one broken listener must not stop the others */ }
  }
}

// Returns an unsubscribe function, for useEffect cleanup.
export function onCreditsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
