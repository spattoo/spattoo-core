// SEC-CORE-5 — strip credential- and PII-shaped substrings from telemetry payloads.
//
// The default console transport is harmless, but `configureTelemetry` lets a host
// app inject a real transport (Sentry). At that point every `reportError` payload
// leaves the browser for a third party. Nothing here sends user data deliberately
// — the risk is INCIDENTAL: an error message, a stack frame or an `extra` field
// that happens to embed an email, a phone number or an access token. Once that
// reaches an issue tracker it is personal data we did not intend to export, and a
// token is a live credential.
//
// Tenant ids in context (baker_id / customer_id / surface) are deliberately NOT
// scrubbed — they are not secret and they are what makes a report triageable.
//
// ⚠️ MIRROR — the same rule exists in `spattoo-web`
// (`apps/app/lib/scrubPii.ts`, SEC-WEB-6): each runtime initialises its own SDK,
// so the two cannot share a module. Keep them in sync. Same convention as
// `safeHref` (storefrontKit.js ↔ spattoo-api src/lib/safeUrl.js).

const RULES = [
  // JWTs first — Supabase access/refresh tokens. Matched by shape, so a bare
  // token with no giveaway label is still caught.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[redacted-jwt]'],
  // Credential-ish params: token=…, access_token=…, apikey=…, password=…
  [/\b(access_token|refresh_token|id_token|token|apikey|api_key|key|secret|password|pwd)=[^&\s"']+/gi, '$1=[redacted]'],
  // Authorization: Bearer <value>
  [/\b(bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [redacted]'],
  // Emails.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]'],
  // Phone numbers — after the others so it can't eat part of a token.
  [/(?<![\w.])\+?\d[\d\s().-]{7,17}\d(?![\w.])/g, '[redacted-phone]'],
];

// Redact credential/PII-shaped substrings from one string.
export function scrubString(value) {
  let out = value;
  for (const [re, replacement] of RULES) out = out.replace(re, replacement);
  return out;
}

// Deep-scrub any value. `depth` bounds the walk so a cyclic or pathological
// payload can't hang the error path — telemetry must never break the caller.
export function scrubValue(value, depth = 6) {
  if (typeof value === 'string') return scrubString(value);
  if (depth <= 0 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth - 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, depth - 1);
  return out;
}
