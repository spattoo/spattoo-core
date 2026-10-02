import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The account screen, and the one thing about it that must never quietly revert ───────────────
 *
 * Changing your phone number LOOKS like the OTP this app already has, and that resemblance is the
 * whole danger. Every other OTP here is `supabase.auth.signInWithOtp` → `verifyOtp`, and what those
 * answer with is a SESSION — spattoo-backend/src/config.js says so outright: "The OTP itself is
 * minted and checked by Supabase, because verify-otp has to hand back a Supabase SESSION".
 *
 * Point that at a number the baker does not own yet and it does not verify anything. It signs them
 * in as whoever DOES own it, or — `shouldCreateUser` being default-true, deliberately, because "a
 * storefront visitor is new by definition" — mints an empty auth user and signs them in as that.
 * Either way the session they started in is gone.
 *
 * Supabase's own `verifyOtp({ type: 'phone_change' })` is real and is still the wrong tool: it
 * writes the number onto auth.users, and phone sign-in is switched on for this project because the
 * storefront needs it, so the SIM becomes a password-free door into the bakery. auth.users.phone is
 * globally unique too, and our own storefront mints phone-bearing auth users — so a baker who ever
 * verified their number on a Spattoo shop could never change it again.
 *
 * So the server mints and checks its own code and grants nothing (spattoo-backend migrations/119,
 * routes/account.js), and the screen reaches it through two plain API calls. The next person to
 * look at this will see two OTP flows and reasonably wonder why there are two. This is the answer,
 * and these assertions are what stop the "simplification".
 *
 * ⚠️ SOURCE ASSERTIONS, WHICH IS WEAKER THAN OPENING THE SCREEN — the same wall decorFlyout.test.jsx
 * describes: AccountPanel lives inside CakeDesigner behind a baker sign-in. `dev/account-screen.jsx`
 * is the other half: it mounts the real panel against a stub so it can be driven and photographed.
 */
const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

// The component, isolated, so a match elsewhere in a 16k-line file cannot pass for one in here.
const panel = (() => {
  const from = src.indexOf('export function AccountPanel(');
  expect(from, 'AccountPanel must exist and be exported (dev/account-screen.jsx mounts it)').toBeGreaterThan(-1);
  return src.slice(from, src.indexOf('\n// ── Add staff modal', from));
})();

describe('the phone change is not the sign-in OTP', () => {
  it('never calls Supabase auth to prove the number', () => {
    expect(panel).not.toMatch(/signInWithOtp/);
    expect(panel).not.toMatch(/verifyOtp/);
    expect(panel).not.toMatch(/phone_change/);
  });

  // updateUser is allowed here for the PASSWORD and nothing else. `{ phone }` on it is the
  // auth.users write that opens the second front door.
  it('never writes a phone onto the auth user', () => {
    expect(panel).not.toMatch(/updateUser\(\s*\{\s*phone/);
  });

  it('goes through the server pair that mints its own code', () => {
    expect(panel).toMatch(/apiClient\.startPhoneChange\(/);
    expect(panel).toMatch(/apiClient\.confirmPhoneChange\(/);
  });

  // The number is not sent back on confirm: the server reads it off the attempt row, so a caller
  // cannot prove one number and write another. A second argument here would mean that changed.
  it('confirms with the code alone', () => {
    expect(panel).toMatch(/confirmPhoneChange\(code\.trim\(\)\)/);
  });
});

describe('who may change it', () => {
  // Owner-scoped, because baker_appusers.phone is unique across is_primary rows (migration 016) and
  // migration 015 calls that index the subscription boundary. The server decides; the screen must
  // ASK rather than assume, or a staff member is shown a control that will 403.
  it('offers the control only when the server said this person owns the number', () => {
    expect(panel).toMatch(/canChangePhone/);
    expect(panel).toMatch(/\{canChangePhone && \(/);
  });
});

describe('the screen itself', () => {
  // INVARIANTS #13 — a panel holding a half-typed number and a half-typed password must not be
  // dismissed by a stray backdrop click. The ✕ still closes.
  it('guards work in progress', () => {
    expect(panel).toMatch(/guardUnsaved=\{dirty\}/);
    expect(panel).toMatch(/const dirty =/);
  });

  // Rule 5 — a baker's screen is a phone, and Panel is a bottom sheet only when told it is one.
  it('is a bottom sheet on a phone', () => {
    expect(panel).toMatch(/isMobile=\{isMobile\}/);
  });

  // INVARIANTS #11 — what is being changed stays on screen while it is changed.
  it('keeps the number visible through both steps', () => {
    expect(panel).toMatch(/Now: <b/);
    expect(panel).toMatch(/Changing to <b/);
  });

  // Rule 7 — a clickable is a <button>, never a <div onClick>, and it looks pressable at rest.
  it('has no div onClick', () => {
    expect(panel).not.toMatch(/<div[^>]*onClick/);
  });

  // Rule 4 — no pictographic emoji in any UI. The code box's placeholder is middle dots, which are
  // punctuation, not pictures.
  it('has no emoji', () => {
    expect(panel).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
