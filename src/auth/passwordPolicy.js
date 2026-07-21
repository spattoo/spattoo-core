// Single source of truth (within this package) for the account-password rules — a
// client-side mirror of the Supabase Auth → Policies setting (Minimum length 8;
// "Lowercase, uppercase letters, digits and symbols"). Supabase enforces this server-side
// on updateUser and rejects anything weaker as "weak_password"; this lets the UI show the
// SAME rules as a live checklist and gate submit on them, so the client never presents a
// green form for a password the server would reject.
//
// ⚠ MIRROR: spattoo-web keeps an identical copy at apps/app/lib/passwordPolicy.ts. The two
// repos are joined only by the vendored @spattoo/designer tgz, so this small, rarely-changing
// policy is duplicated by design. If the Supabase dashboard policy changes, update BOTH files.

export const PASSWORD_MIN_LENGTH = 8;

// GoTrue's symbol group for the "…and symbols" requirement is ASCII punctuation — and,
// notably, NOT whitespace. Kept as an explicit set (rather than a broad /[^A-Za-z0-9]/) so
// the checklist can't greenlight a character the server counts as "no symbol" (e.g. a space)
// and then reject the password anyway.
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:'\",.<>/?`~\\";
const SYMBOL_SET = new Set(SYMBOLS.split(''));

// Order here is the order shown in the checklist.
export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'symbol', label: 'One special character', test: (pw) => pw.split('').some((c) => SYMBOL_SET.has(c)) },
];

export function isPasswordValid(pw) {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
