// Shared input validators — one copy of each rule, reused across screens (order modal,
// invite panel, …) so the rule can't drift. Keep these pure and format-only; whether a
// field is REQUIRED is the caller's business (e.g. email is optional in one place,
// required in another), so callers gate on emptiness themselves.

// A pragmatic email shape check: something@something.tld, no spaces. Not RFC-exhaustive
// on purpose — the authoritative check is a real send; this just catches typos early.
export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? '').trim());
