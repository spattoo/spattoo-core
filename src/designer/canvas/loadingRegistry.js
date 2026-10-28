import { useEffect, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// One loader per page, not one per element.
//
// Each decoration renders inside its own <Suspense> (so a resolved element stays
// visible and adding one element never blanks the others). If each boundary drew its
// own badge, loading a template with N decorations would flash N badges at once.
//
// Instead, every per-element Suspense fallback is <LoadingPing/> — it draws NOTHING,
// it just registers "one asset in flight" on mount and clears it on unmount. Because
// Suspense mounts the fallback exactly while its child is suspended, the live count is
// always the number of decorations currently loading. A single canvas overlay reads
// useAnyLoading() and shows ONE cake spinner whenever that count is > 0.
// ─────────────────────────────────────────────────────────────────────────────

let inFlight = 0;
let busySince = null;          // when the count last left zero
const listeners = new Set();

/* ⚠️ THE COUNT IS THE ONLY THING THE SPINNER KNOWS, so it is the only thing worth watching when the
   spinner will not go away. "Still loading" and "finished, but the count never came back down" are
   the same picture on screen and completely different bugs — one is the network, the other is a
   mount that never ran its cleanup.
 *
 * ⚠️ PUBLISHED IN EVERY BUILD, NOT ONLY IN DEV, AND THAT IS THE WHOLE POINT OF IT. This was gated on
 * `import.meta.env.DEV`, so the one number that tells those two apart did not exist on
 * app.spattoo.dev — which is the only place anybody has ever seen the badge misbehave. Reported
 * 2026-10-28: *"even after all elements are loaded, processing icon is still showing for sometime."*
 * Diagnosing it meant inferring from a screenshot, which is exactly what the note above says not to
 * do. It is one integer on `window`, written only when the count changes; there is nothing to save
 * by hiding it from the build where it is needed.
 *
 * ⚠️ AND IT CARRIES HOW LONG, BECAUSE DURATION IS WHAT SEPARATES THE TWO. A count of 16 means
 * nothing on its own — busy and stuck look identical. A count of 16 that has not moved for forty
 * seconds is a cleanup that never ran. `busyMs` is that answer, already computed, so nobody has to
 * sample it twice and subtract. */
function publish() {
  if (typeof window === 'undefined') return;
  window.__loadingInFlight = inFlight;                       // the bare number, as before
  window.__spattooLoading = {
    inFlight,
    busyMs: busySince == null ? 0 : Math.round(performance.now() - busySince),
    at: Math.round(performance.now()),
  };
}

const emit = () => {
  listeners.forEach(l => l());
  publish();
};

// Invisible Suspense fallback: counts one in-flight asset for its lifetime.
export function LoadingPing() {
  useEffect(() => {
    if (inFlight === 0) busySince = typeof performance === 'undefined' ? null : performance.now();
    inFlight += 1;
    emit();
    return () => {
      inFlight = Math.max(0, inFlight - 1);
      if (inFlight === 0) busySince = null;
      emit();
    };
  }, []);
  return null;
}

/** What the spinner currently believes, for a console or a probe. See `publish`. */
export function loadingState() {
  return { inFlight, busyMs: busySince == null ? 0 : Math.round(performance.now() - busySince) };
}

// true while any decoration is still loading. Drives the single page-level overlay.
export function useAnyLoading() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => inFlight > 0,
    () => false,
  );
}
