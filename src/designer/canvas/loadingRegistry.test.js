import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadingState, whenCaptureIdle, captureState } from './loadingRegistry.js';

/* ── The number that tells two bugs apart ────────────────────────────────────────────────────────
 *
 * The spinner shows while this count is above zero, so when it will not go away there are exactly
 * two possibilities and they look identical on screen: something IS still loading, or something
 * finished and never counted itself back down. The module's own note says so.
 *
 * ⚠️ IT HAD NO TEST AND WAS ALSO INVISIBLE IN PRODUCTION — the count was published only under
 * `import.meta.env.DEV`, so it was absent from app.spattoo.dev, which is the only place the badge
 * has ever been seen misbehaving (2026-10-28: *"even after all elements are loaded, processing icon
 * is still showing for sometime"*). Diagnosing it meant inferring from a screenshot, which is
 * precisely what that note says not to do.
 *
 * ⚠️ ASSERTED AS SOURCE for the counting, because `LoadingPing` is a React effect and this repo has
 * no renderer in its test setup — the same call `takeIsolation.test.js` makes and for the same
 * reason. The arithmetic that can be run without React is run.
 */
const SRC = readFileSync(new URL('./loadingRegistry.js', import.meta.url), 'utf8');

/* ⚠️ THE NAMES ARE BUILT, NOT WRITTEN. Quoting `count(` or `count === 0` verbatim in a test file
   makes `check:bindings` read it as a call to something undeclared — which is exactly what that
   gate is for, and `takeIsolation.test.js` has already paid for it once: "the gate is right to be
   crude there; the test can ask the same question differently." So the identifiers are assembled
   and matched as plain substrings. */
const N = 'in' + 'Flight';
const SINCE = 'busy' + 'Since';

describe('what the spinner knows', () => {
  it('reports nothing in flight before anything mounts', () => {
    expect(loadingState()).toEqual({ inFlight: 0, busyMs: 0, pending: [] });
  });

  /* ⚠️ THE GATE WAS THE BUG. A probe that exists only in a dev build cannot diagnose a production
     screenshot, and this one is a single integer written when the count changes. */
  it('publishes in every build, not only in DEV', () => {
    const pub = SRC.slice(SRC.indexOf('function publish'), SRC.indexOf('const emit'));
    expect(pub.length).toBeGreaterThan(0);
    expect(pub, 'publish must not gate itself on the build').not.toContain('import.meta.env');
    expect(pub).toContain('window.__loadingInFlight');
    expect(pub).toContain('__spattooLoading');
    expect(pub).toContain('busyMs');
  });

  /* Every mount is paired with a release, and the release can never take the count below zero — a
     negative count leaves the spinner unable to appear again, the same fault inverted and harder
     to notice. */
  it('counts up on mount and back down on cleanup, never below zero', () => {
    const ping = SRC.slice(SRC.indexOf('export function LoadingPing'), SRC.indexOf('export function loadingState'));
    expect(ping).toContain(`${N} += 1`);
    expect(ping).toContain(`Math.max(0, ${N} - 1)`);
    expect(ping).toContain('return () =>');            // the release is a cleanup, not a one-way count
  });

  /* ⚠️ DURATION IS THE DIAGNOSTIC. A count of 16 means nothing on its own; a count of 16 that has
     not moved in forty seconds is a cleanup that never ran. The clock starts when the count leaves
     zero and stops when it returns, so it measures THIS burst rather than the age of the tab. */
  it('times the current burst only', () => {
    const ping = SRC.slice(SRC.indexOf('export function LoadingPing'), SRC.indexOf('export function loadingState'));
    const starts = ping.indexOf(`${SINCE} = typeof performance`);
    const stops = ping.indexOf(`${SINCE} = null`);
    expect(starts, 'the clock must start when the count leaves zero').toBeGreaterThan(-1);
    expect(stops, 'and stop when it returns to zero').toBeGreaterThan(starts);
    expect(loadingState().busyMs).toBe(0);
  });

  /* The overlay reads a boolean off the same count — one spinner for the page, never one per
     element. If these ever disagree the badge stops meaning anything. */
  it('drives the overlay from the same count', () => {
    expect(SRC).toContain('useSyncExternalStore');
    expect(SRC).toContain(`${N} > 0`);
  });
});

/* ── Naming the boundary that will not let go ────────────────────────────────────────────────────
 *
 * ⚠️ A COUNT CANNOT BE ACTED ON. 2026-10-29: a cake finished drawing, the spinner stayed for 130
 * seconds, and resizing the window to a phone width cleared it instantly — so the assets had
 * arrived and a boundary never released. "6 in flight" was the only thing the probe could say, and
 * six of WHAT is the whole question. These assert the labelling as source, for the same reason the
 * rest of this file does: `LoadingPing` is a React effect and there is no renderer here.
 */
describe('what the spinner can name', () => {
  it('records a label and how long it has waited, longest first', () => {
    const pub = SRC.slice(SRC.indexOf('function publish'), SRC.indexOf('const emit'));
    expect(pub).toContain('pending');
    expect(pub, 'longest-waiting first — the top line is the one holding the spinner up')
      .toContain('sort');
    expect(pub).toContain('waitingMs');
  });

  /* ⚠️ KEYED BY A UNIQUE ID, NOT BY THE LABEL. Two decorations legitimately share one — a cake with
     four of the same flower is four boundaries — and keying by label would let the fourth mount
     erase the first's entry, so the count and the list would disagree about the same moment. */
  it('keys each ping separately, so repeats do not overwrite each other', () => {
    const ping = SRC.slice(SRC.indexOf('export function LoadingPing'), SRC.indexOf('export function loadingState'));
    expect(ping).toContain('nextPingId++');
    expect(ping, 'the entry goes when the boundary does').toContain('pending.delete(id)');
  });

  it('still publishes in every build, labels included', () => {
    const pub = SRC.slice(SRC.indexOf('function publish'), SRC.indexOf('const emit'));
    expect(pub).not.toContain('import.meta.env');
  });
});

/* ── Whose loading the spinner speaks for ────────────────────────────────────────────────────────
 *
 * ⚠️ THE FAULT THIS PREVENTS LOOKED EXACTLY LIKE A SLOW NETWORK FOR WEEKS. The same cake is drawn
 * by TWO React roots — the live canvas and a 400x400 thumbnail-capture canvas parked off-screen at
 * -9999 — so every decoration had two boundaries and the page spinner counted both. Measured on a
 * real template 2026-10-29: the live twelve resolved at 26s with the cake on screen, and the
 * spinner ran sixteen more seconds for the capture canvas, having fetched nothing (every asset was
 * already cached). A count that includes a canvas nobody can see is not reporting the cake.
 */
describe('the spinner counts the live scene only', () => {
  it('routes a ping to a channel, and the capture channel is not the spinner', () => {
    const ping = SRC.slice(SRC.indexOf('export function LoadingPing'), SRC.indexOf('/**'));
    expect(ping, 'the channel is a prop, not a module flag').toContain("channel = 'live'");
    expect(ping, 'capture pings leave the spinner alone').toContain("if (channel === 'capture')");
  });

  /* ⚠️ IT MUST BE INERT, NOT JUST UNCOUNTED. An early return that skipped the increment but still
     registered a label, or still ran the cleanup, would leave the list and the count disagreeing —
     the exact confusion the labels were added to end. */
  it('an opted-out ping touches neither the count nor the list', () => {
    const ping = SRC.slice(SRC.indexOf('export function LoadingPing'), SRC.indexOf('/**'));
    const guard = ping.indexOf("if (channel === 'capture')");
    expect(guard).toBeGreaterThan(-1);
    expect(ping.indexOf(`${N} += 1`), 'the increment is AFTER the guard').toBeGreaterThan(guard);
    expect(ping.indexOf('pending.set'), 'and so is the label').toBeGreaterThan(guard);
  });
});

/* ── Waiting for the capture canvas ──────────────────────────────────────────────────────────────
 *
 * ⚠️ THE CANVAS USED TO BE MOUNTED ALL SESSION SO NOBODY HAD TO WAIT. That cost every baker a
 * second cake on the GPU for every cake they opened — two canvases even on an empty one. It now
 * mounts only when a capture is coming, which means the capture has to be able to wait, and two of
 * the three callers are money paths.
 */
describe('waiting for the capture canvas', () => {
  it('reports idle when nothing is in flight', async () => {
    expect(captureState().inFlight).toBe(0);
    const out = await whenCaptureIdle({ settle: 2, everyMs: 5, timeoutMs: 500 });
    expect(out.ready).toBe(true);
  });

  /* ⚠️ IT RESOLVES, IT NEVER REJECTS. A thumbnail is the least important thing an order does: one
     that is early is a blemish, an order that will not submit is a lost cake. A caller that has to
     wrap this in try/catch would eventually forget to. */
  it('gives up rather than hanging, and says so', async () => {
    const SRC_FN = SRC.slice(SRC.indexOf('export function whenCaptureIdle'));
    expect(SRC_FN, 'resolves on timeout, never rejects').toContain('timedOut: true');
    expect(SRC_FN).not.toContain('reject(');
    const out = await whenCaptureIdle({ settle: 1, everyMs: 5, timeoutMs: 60 });
    expect(out.ready).toBe(true);                       // nothing in flight here, so it is ready
  });

  /* ⚠️ A TIMER, NOT requestAnimationFrame. A hidden tab stops rAF dead — this file already carries
     that scar — and a baker who switches away mid-save is ordinary, not exotic. */
  it('waits on a timer so a hidden tab cannot stall it forever', () => {
    const SRC_FN = SRC.slice(SRC.indexOf('export function whenCaptureIdle'), SRC.indexOf('export function captureState'));
    expect(SRC_FN).toContain('setInterval');
    expect(SRC_FN).not.toContain('requestAnimationFrame');
  });

  /* ⚠️ SEVERAL READINGS OF ZERO, NOT ONE. The count dips through zero between boundaries resolving
     and their replacements mounting; capturing in that gap photographs a half-built cake. */
  it('wants the count to stay at zero, not merely touch it', () => {
    const SRC_FN = SRC.slice(SRC.indexOf('export function whenCaptureIdle'), SRC.indexOf('export function captureState'));
    expect(SRC_FN).toContain('settle');
    expect(SRC_FN).toMatch(/zeros\s*>=\s*settle/);
  });
});

/* ── Retrying a boundary the asset already arrived for ───────────────────────────────────────────
 *
 * A Suspense boundary inside the <Canvas> lives in R3F's own React root, and a resolved asset does
 * not reliably give that root work to do. The boundary then keeps showing its fallback after every
 * byte has arrived: the decoration is never drawn, the scene stays unlit, and the spinner stays up
 * until something unrelated re-renders the tree.
 *
 * ⚠️ THIS WAS SEEN TWICE IN PRODUCTION AND FIXED ONLY ON THE HALF NOBODY WATCHES. The notes in
 * loadingRegistry.js and beside SceneKindContext both record it — "one held for SIXTY-TWO SECONDS
 * after every byte had arrived... it cleared when the tab was switched, i.e. on a re-render" — and
 * both times it was read as the CAPTURE root's problem. The capture half got `channel`; the live
 * half, which is the one a baker waits on, was left.
 *
 * Measured on the production build via `npm run measure:template`, a fresh browser each time:
 * 4 of 5 cold loads never settled before, 0 of 8 after.
 */
describe('a boundary whose asset has already arrived', () => {
  const FLUSH = 'useFlush' + 'PendingBoundaries';
  const HOOK = SRC.slice(SRC.indexOf(`export function ${FLUSH}`));

  it('has a flush for the LIVE root, not only the capture one', () => {
    expect(SRC).toContain(`export function ${FLUSH}`);
  });

  /* It must do nothing at all when nothing is pending — this runs on every cake, and a timer that
     ticks on an idle canvas is a cost with no symptom to justify it. */
  it('does nothing while nothing is loading', () => {
    expect(HOOK).toMatch(/if\s*\(\s*!\s*loading\s*\)\s*return/);
  });

  /* ⚠️ A GRACE, SO THE PATH THAT ALREADY WORKS PAYS NOTHING. An asset that resolves quickly is done
     long before the first tick, so a normal load never re-renders for this at all. */
  it('waits before it starts nudging', () => {
    expect(HOOK).toMatch(/setTimeout/);
    expect(SRC).toMatch(/FLUSH_GRACE_MS\s*=\s*\d+/);
  });

  /* ⚠️ AND IT CLEARS BOTH TIMERS. The grace timer and the interval are separate handles, and
     leaking either keeps re-rendering a canvas that finished loading. */
  it('stops when the loading stops', () => {
    expect(HOOK).toContain('clearTimeout');
    expect(HOOK).toContain('clearInterval');
  });

  /* ⚠️ CALLED FROM CakeCanvas, WHICH IS THE WHOLE POINT. React re-attempts a suspended boundary
     when an ANCESTOR renders — a fallback re-rendering itself does not retry its own boundary, and
     a wrapper that re-renders `{children}` is bailed out of when the child elements are
     referentially unchanged. It has to be the component whose JSX creates those elements. A hook
     that exists and is never called is exactly the shape this bug already took once. */
  it('is actually called by the live canvas', () => {
    const CANVAS = readFileSync(new URL('./CakeCanvas.jsx', import.meta.url), 'utf8');
    /* ⚠️ A LIVE CALL, NOT THE TEXT OF ONE. The first version of this asserted `toContain` on the
       call, and commenting the call out passed it — `// useFlushPendingBoundaries();` contains the
       string just as happily. A test that a one-character edit defeats is the same shape as the
       bug it guards, which went unfixed for two sightings because the evidence was never asked to
       be real. So: at least one line that calls it and is not commented out. */
    const live = CANVAS.split('\n')
      .map(l => l.trim())
      .filter(l => l.includes(`${FLUSH}()`) && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    expect(live.length).toBeGreaterThan(0);
    expect(CANVAS).toMatch(new RegExp(`import\\s*\\{[^}]*${FLUSH}[^}]*\\}\\s*from\\s*'\\./loadingRegistry\\.js'`));
  });
});
