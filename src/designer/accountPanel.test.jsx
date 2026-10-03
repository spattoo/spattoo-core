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
    // ...and only once the screen is unlocked, so the two gates are read together rather than one
    // quietly replacing the other.
    expect(panel).toMatch(/canChangePhone && unlocked &&/);
  });
});

describe('the lock', () => {
  // ⚠️ THE LOCK IS NOT THE UI. `unlocked` decides what is drawn; the server decides what is
  // allowed, independently, on every write (requireRecentPassword in spattoo-api). If this ever
  // becomes the only gate, the calls behind it are reachable from a console with the same session
  // and the padlock is decoration.
  it('opens read-only', () => {
    expect(panel).toMatch(/const \[unlocked,\s+setUnlocked\]\s*=\s*useState\(false\)/);
  });

  it('hides the phone control until unlocked', () => {
    expect(panel).toMatch(/canChangePhone && unlocked &&/);
  });

  it('hides the password control until unlocked', () => {
    expect(panel).toMatch(/\{unlocked && <EditPencil label="Change password"/);
  });

  // ⚠️ ONE CONTROL, NOT TWO THAT LOOK ALIKE. The rows shipped with different gestures — a worded
  // "Change" button on the number, bare fields on the password — and that is what the pencil
  // replaced. A second copy of the control is where the next difference would come from, so both
  // rows render the same component or this fails.
  it('opens every row the same way', () => {
    expect(panel).toMatch(/const EditPencil =/);
    // Email, phone, password — three editable rows, one control between them.
    const uses = panel.match(/<EditPencil /g) ?? [];
    expect(uses.length).toBe(3);
  });

  // The password is proved against Supabase, never posted to our API — which would make an endpoint
  // that answers "is this the right password", i.e. something to brute force.
  it('proves the password through reauthenticate, not a password field on our API', () => {
    expect(panel).toMatch(/apiClient\.reauthenticate\(unlockPw\)/);
    expect(panel).not.toMatch(/signInWithPassword/);
  });

  // A server-side expiry the screen ignores leaves a panel that looks editable and refuses every
  // edit. Both codes drop back to the prompt.
  it('re-prompts when the server says the unlock is stale', () => {
    expect(panel).toMatch(/reauth_required/);
    expect(panel).toMatch(/reauth_expired/);
  });
});

describe('what belongs on this screen', () => {
  // Sandeep: "this screen is not the right place for signout button. when the user clicks on
  // avatar, there should be two options - 1. My account 2. Signout." Sign out is not an account
  // DETAIL, it is a way out of the app; at the foot of a screen you open to edit something it costs
  // a tap every time and sits where a destructive-looking button should not.
  it('has no sign out', () => {
    expect(panel).not.toMatch(/Sign out/);
  });

  // ...and the avatar menu is where it went, beside the way in.
  // ⚠️ THE HOVER LABEL MUST GO WHEN THE MENU COMES. The pointer is still over the avatar after the
  // click, so SidebarTooltip stayed visible — positioned `left: calc(100% + 12px)`, which is exactly
  // where the rail menu opens. It covered Sign out completely: rendered, clickable, invisible.
  it('the avatar tooltip is suppressed while its menu is open', () => {
    expect(src).toMatch(/suppressed=\{profileOpen\}/);
    // And the component must actually honour it, not just accept the prop.
    expect(src).toMatch(/const show = visible && !suppressed;/);
    expect(src).not.toMatch(/opacity: visible \? 1 : 0,/);
  });

  // Counts the BEHAVIOUR, not the label: the header dropdown writes `>My Account<` on one line and
  // the rail menu puts the text on its own, so matching the words found one of the two and called
  // the other missing. What has to be true in both places is that the item opens the panel.
  it('the avatar menu offers both doors, in the header and the rail', () => {
    const opens = src.match(/setAccountPanelOpen\(true\); setProfileOpen\(false\);/g) ?? [];
    expect(opens.length).toBe(2);
    const signOuts = src.match(/apiClient\?\.signOut\?\.\(\) \?\? supabase\?\.auth\.signOut\(\); setProfileOpen\(false\);/g) ?? [];
    expect(signOuts.length).toBe(2);
  });
});

describe('where we email you', () => {
  /* ⚠️ IT IS bakers.email, NEVER THE APP-USER'S. The app-user's email IS the username — moving it
     means moving the Supabase auth identity, which is a different act with its own confirmation.
     Sandeep: "i dont want to do the appuser email- thats username." */
  it('writes the bakery address, not the sign-in one', () => {
    expect(panel).toMatch(/apiClient\.updateBakerProfile\(\{ email: next \}\)/);
    expect(panel).not.toMatch(/updateUser\(\{\s*email/);
  });

  /* ⚠️ BLANK IS A VALUE. null means "use my sign-in address" — bakerNotifyEmail() prefers
     bakers.email and falls back to the primary app-user, which is what 22 of the 24 bakeries on dev
     actually run on. Backfilling a copy instead would freeze an address that stops following the
     login email, which is the bug this whole field came out of. */
  it('treats an empty box as the default, not as nothing', () => {
    expect(panel).toMatch(/placeholder=\{userData\?\.email \|\| 'you@yourbakery\.com'\}/);
    expect(panel).toMatch(/Leave it blank to use your sign-in address/);
  });

  // PATCH /baker/profile is requireCapability('store:manage') — an ungated pencil could only 403.
  it('offers the pencil only to somebody the server will accept', () => {
    expect(panel).toMatch(/\{canEditEmail && unlocked && \(/);
    expect(src).toMatch(/canEditEmail=\{hasCap\('store:manage'\)\}/);
  });

  // The sign-in address is no longer shown as a field of its own: it cannot be changed, and a row
  // nobody can act on is furniture.
  it('does not show the username as its own row', () => {
    const code = panel
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/You sign in with this address/);
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
  //
  // ⚠️ COMMENTS DO NOT COUNT, and this test failed until it said so. CLAUDE.md rule 4 exempts them
  // outright — "Comments and docs are not UI; ⚠️ in source is fine" — and this component's notes
  // carry both `⚠️` and a `✕` describing the close button. decorFlyout.test.jsx hit the same wall and
  // wrote down the order that works: block comments out FIRST and non-greedily, then line comments.
  // Taking `{/* … */}` out as one unit instead swallows everything between the first `{/*` and the
  // next `*​/}`, which is most of the file.
  it('has no emoji', () => {
    const code = panel
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, JSX comments' innards included
      .replace(/^\s*\/\/.*$/gm, '');       // line comments
    expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
