// ── Frontend error telemetry façade (vendor-neutral) ─────────────────────────
// Mirrors the backend contract (reportError / reportMessage / setContext) so both
// runtimes feel identical. spattoo-core imports NO vendor SDK — each consuming app
// (spattoo-web via @sentry/nextjs, spattoo-admin via @sentry/react) initialises its
// own SDK and injects a Sentry-backed transport via configureTelemetry(). Until
// then the default transport logs structured JSON to the console, so the library
// works with zero deps (same pattern as the API's Phase 0).
//
// A browser tab is a single user, so global context (baker_id / customer_id /
// surface) is safe to hold at module scope — unlike the server, which must scope
// per request.

import { scrubString, scrubValue } from './scrub.js';

let transport = consoleTransport();
let ctx = { surface: 'unknown' };

// Called once by the host app. `transport` is { capture(error, ctx), setContext?(ctx) }.
export function configureTelemetry({ transport: t, surface } = {}) {
  if (t) transport = t;
  if (surface) ctx.surface = surface;
  if (ctx.surface) safe(() => transport.setContext?.(ctx));
}

// Merge identifying context (e.g. bakerId once the designer resolves it). Every
// subsequent report carries it automatically.
export function setContext(partial = {}) {
  ctx = { ...ctx, ...partial };
  safe(() => transport.setContext?.(ctx));
}

// The one call everything funnels through.
// extra: { screen, action, severity, extra:{...} }
// SEC-CORE-5 — the payload is scrubbed HERE, at the single funnel, rather than in
// each host app's transport: that way any transport injected via
// configureTelemetry (Sentry today, anything later) inherits the guarantee
// instead of having to re-implement it. Tenant ids in `ctx` are left intact —
// they aren't secret and they're what makes a report triageable.
export function reportError(error, extra = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  safe(() => transport.capture(
    scrubError(err),
    { ...ctx, severity: 'error', ...scrubValue(extra) },
  ), error);
}

// Rebuild the Error with scrubbed message/stack. Errors carry their text in two
// places and a leaked token is just as exposed in a stack frame as in a message.
function scrubError(err) {
  const message = scrubString(err.message || '');
  if (message === err.message && !err.stack) return err;
  const copy = new Error(message);
  copy.name = err.name;
  if (err.stack) copy.stack = scrubString(err.stack);
  return copy;
}

export function reportMessage(message, extra = {}) {
  reportError(new Error(message), { severity: 'info', ...extra });
}

// Telemetry must never throw into the caller.
function safe(fn, original) {
  try { fn(); }
  catch (e) { console.error('[telemetry] failed:', e?.message, original ? `| original: ${original?.message}` : ''); }
}

function consoleTransport() {
  return {
    capture(error, c) {
      console.error('[error]', {
        level: c.severity || 'error',
        message: error?.message || String(error),
        ...c,
        time: new Date().toISOString(),
        stack: error?.stack,
      });
    },
  };
}
