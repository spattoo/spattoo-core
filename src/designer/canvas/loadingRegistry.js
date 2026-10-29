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
/* ⚠️ WHICH BOUNDARIES, NOT JUST HOW MANY — because a count cannot be acted on. Sandeep, 2026-10-29:
 * the cake was fully drawn, the spinner stayed for two minutes, and switching the window to a phone
 * width cleared it at once. That says the assets had ARRIVED and some boundary never released, and
 * at that point "6 in flight" is the one fact that does not help: six of WHAT. Every ping carries
 * the label its `SafeGlb` already had, so the stuck one can be named instead of guessed at.
 * A Map keyed by a unique id, because two decorations legitimately share a label. */
let nextPingId = 1;
const pending = new Map();     // id → { label, since }

/* ⚠️ TWO COUNTS, BECAUSE TWO CANVASES ASK DIFFERENT QUESTIONS. The live canvas's count answers
 * "is the baker's cake still loading" and drives the spinner. The capture canvas's count answers
 * "can a thumbnail be taken yet", which nothing used to ask because that canvas was simply kept
 * mounted the whole session — a second cake on the GPU for every baker, so that three buttons
 * could capture instantly. Now it mounts only when a capture is coming, so somebody has to be
 * able to WAIT for it. */
let captureInFlight = 0;

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
  const now = performance.now();
  window.__spattooLoading = {
    inFlight,
    busyMs: busySince == null ? 0 : Math.round(now - busySince),
    at: Math.round(now),
    /* Longest-waiting first: the one at the top is the one holding the spinner up. */
    pending: [...pending.values()]
      .map(p => ({ label: p.label, waitingMs: Math.round(now - p.since) }))
      .sort((a, b) => b.waitingMs - a.waitingMs),
  };
}

const emit = () => {
  listeners.forEach(l => l());
  publish();
};

// Invisible Suspense fallback: counts one in-flight asset for its lifetime.
/* ⚠️ THE SPINNER IS ABOUT THE BAKER'S CAKE, AND ONLY ONE CANVAS DRAWS THAT. Measured on a real
 * jungle template, 2026-10-29: twenty-four boundaries, twelve in the live canvas and twelve in the
 * 400x400 thumbnail-capture canvas parked off-screen at -9999. The live twelve were all resolved at
 * 26s — the cake was finished and on screen — and the spinner ran another SIXTEEN SECONDS for the
 * capture canvas nobody can see. Every asset was already in cache; not one byte was fetched. So
 * this was never download speed, which is what it looked like for weeks:
 *
 *   0.3s  24 pending = 12 live + 12 thumb
 *   26s   12 pending =  0 live + 12 thumb   ← the cake is done
 *   42s    0
 *
 * It also explains the two things that made no sense. Switching to a phone width cleared it at once
 * — that remounts the tree and flushes the second root. And a cake could sit "loading" having
 * fetched nothing at all.
 *
 * ⚠️ `counts={false}` IS NOT "DO NOT LOAD", it is "do not speak for the cake". The capture canvas
 * still mounts, still loads and still captures; it simply stops driving a spinner that is telling
 * the baker about their own cake. Whatever needs the thumbnail waits on the capture itself, which
 * is what `thumbRenderNowRef` has always been for. */
export function LoadingPing({ label = 'unlabelled', channel = 'live' }) {
  useEffect(() => {
    if (channel === 'capture') {
      captureInFlight += 1;
      return () => { captureInFlight = Math.max(0, captureInFlight - 1); };
    }
    const now = typeof performance === 'undefined' ? 0 : performance.now();
    if (inFlight === 0) busySince = typeof performance === 'undefined' ? null : now;
    inFlight += 1;
    const id = nextPingId++;
    pending.set(id, { label, since: now });
    emit();
    return () => {
      inFlight = Math.max(0, inFlight - 1);
      pending.delete(id);
      if (inFlight === 0) busySince = null;
      emit();
    };
  }, [label, channel]);
  return null;
}

/**
 * Resolve once the capture canvas has nothing left in flight.
 *
 * ⚠️ IT RESOLVES, IT NEVER REJECTS, AND IT ALWAYS GIVES UP EVENTUALLY. Two of the three callers are
 * money paths — placing an order and sharing a draft — and a thumbnail is the least important thing
 * either of them does. A picture that is a little early is a blemish; an order that will not submit
 * because a canvas is sulking is a lost cake. The caller is told whether it waited successfully so
 * it can decide, and `captureThumbnailBlob` already refuses to upload an empty frame.
 *
 * ⚠️ A TIMER, NOT `requestAnimationFrame`. A hidden or minimised tab stops rAF completely, and a
 * baker who switches away mid-save is the ordinary case, not the exotic one — this file already
 * carries that scar. A timer keeps running, throttled, and the timeout still fires.
 *
 * `settle` readings of zero rather than one: the count dips through zero between boundaries
 * resolving and their replacements mounting, and capturing in that gap is how a half-built cake
 * gets photographed.
 */
export function whenCaptureIdle({ timeoutMs = 8000, settle = 3, everyMs = 50 } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    let zeros = 0;
    const id = setInterval(() => {
      zeros = captureInFlight === 0 ? zeros + 1 : 0;
      if (zeros >= settle) { clearInterval(id); resolve({ ready: true, waitedMs: Date.now() - started }); }
      else if (Date.now() - started > timeoutMs) {
        clearInterval(id);
        resolve({ ready: false, timedOut: true, stillLoading: captureInFlight, waitedMs: Date.now() - started });
      }
    }, everyMs);
  });
}

/** What the capture canvas still has in flight. For a probe, and for the tests. */
export function captureState() { return { inFlight: captureInFlight }; }

/** What the spinner currently believes, for a console or a probe. See `publish`. */
export function loadingState() {
  const now = typeof performance === 'undefined' ? 0 : performance.now();
  return {
    inFlight,
    busyMs: busySince == null ? 0 : Math.round(now - busySince),
    pending: [...pending.values()]
      .map(p => ({ label: p.label, waitingMs: Math.round(now - p.since) }))
      .sort((a, b) => b.waitingMs - a.waitingMs),
  };
}

// true while any decoration is still loading. Drives the single page-level overlay.
export function useAnyLoading() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => inFlight > 0,
    () => false,
  );
}
