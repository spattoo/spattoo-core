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

// ─────────────────────────────────────────────────────────────────────────────
// The other half of the same question: which assets did NOT arrive.
//
// A decoration whose GLB/texture 404s is caught by TextureErrorBoundary and rendered as
// nothing, so the cake still draws. On screen that is right — one missing element must never
// white-screen the designer. For a BATCH CAPTURE it is not enough: a thumbnail that is silently
// missing a border is a wrong picture, and writing it over the good one is worse than skipping.
//
// So every caught failure is recorded here. A capture run clears the list before it renders a
// design and reads it back after: empty → the frame is complete, non-empty → skip that one and
// say which asset is gone. Same reasoning as captureThumbnailBlob refusing an undrawn frame.
// ─────────────────────────────────────────────────────────────────────────────

let failed = [];

// Called by TextureErrorBoundary for every asset it swallows.
export function recordAssetFailure(entry) { failed.push(entry); }

// What has failed since the last clear. Copy — callers must not mutate the list.
export function assetFailures() { return failed.slice(); }

export function clearAssetFailures() { failed = []; }
