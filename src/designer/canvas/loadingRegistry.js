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
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

// Invisible Suspense fallback: counts one in-flight asset for its lifetime.
export function LoadingPing() {
  useEffect(() => {
    inFlight += 1;
    emit();
    return () => { inFlight = Math.max(0, inFlight - 1); emit(); };
  }, []);
  return null;
}

// true while any decoration is still loading. Drives the single page-level overlay.
export function useAnyLoading() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => inFlight > 0,
    () => false,
  );
}
