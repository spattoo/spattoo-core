// ── "This order has a new edible print" ──────────────────────────────────────────────────────────
//
// Same shape and the same reason as billing/creditsBus.js: the thing that CREATES a print and the
// thing that DECIDES WHETHER TO OFFER IT sit in different trees, and threading a refresh callback
// between them would mean every component in between carrying a prop it has no use for.
//
// ── THE BUG THIS FIXES ───────────────────────────────────────────────────────────────────────────
// A baker opened X-Ray, pressed **Make it** on an edible print, was told it had been made, closed
// X-Ray — and "Print & cut-outs" in order details was still not there.
//
// Nothing was wrong with the data. `POST /orders/:id/edible-prints/generate` writes the upload AND
// the `order_edible_prints` link (migration 086), and the launcher's gate is already right:
//
//     if (!ids.length && !prints.length) return null;
//
// But `prints` is fetched in an effect keyed on `[order?.id, apiClient]`, and neither changes when
// a print is made inside a takeover rendered ABOVE that still-mounted component. So the launcher
// went on believing the answer it got before the print existed. Closing X-Ray changed nothing,
// because X-Ray closing does not remount the panel underneath it.
//
// ⚠️ THE SYMPTOM POINTS AT THE WRONG THING. The baker is told "it is in your uploads", goes looking
// for the button that opens it, and finds it missing — which reads as the print not having been
// made. They paid credits for it. A stale gate is indistinguishable from a failed generation.
//
// Carries NO data, deliberately: the listener re-reads from the server rather than trusting a row
// assembled on the client. The link, the label and the public URL are the server's to compose, and
// one of them (`image_url`) does not exist on the row the generate call returns.

const listeners = new Set();

/** Call after anything that adds or removes an edible print on an order. Cheap and idempotent. */
export function ediblePrintsChanged() {
  for (const fn of listeners) {
    try { fn(); } catch { /* one broken listener must not stop the others */ }
  }
}

/** Returns an unsubscribe function, for useEffect cleanup. */
export function onEdiblePrintsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── "Take me to the print sheet" ─────────────────────────────────────────────────────────────────
//
// A separate signal from the one above, and deliberately not a flag on it. "A print was made" is a
// fact about data that several readers may care about; "open the sheet now" is a one-off intent
// from a baker who just pressed something. Folding the second into the first would mean every
// future listener of a data change had to work out whether it was also supposed to open a modal.
//
// ⚠️ WHY IT HAS TO CROSS COMPONENTS AT ALL. The print sheet is opened by the launcher inside
// OrdersPanel; the button that should open it sits in X-Ray, a takeover rendered above it. The
// alternative was the copy that shipped first — "Close this sheet and open Print & cut-outs" —
// which is an instruction rather than a link, and asks a baker to remember a name and go find it.

const openListeners = new Set();

/** Ask the order's Print & cut-outs sheet to open. The caller closes whatever it is standing in. */
export function openPrintSheet() {
  for (const fn of openListeners) {
    try { fn(); } catch { /* one broken listener must not stop the others */ }
  }
}

/** Returns an unsubscribe function, for useEffect cleanup. */
export function onOpenPrintSheet(fn) {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}
