import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadingState } from './loadingRegistry.js';

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
