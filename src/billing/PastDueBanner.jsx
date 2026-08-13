import { useNarrow } from '../shared/useNarrow.js';

// ── "We couldn't take this month's payment" ───────────────────────────────────────────────────────
// The one state where the baker is about to lose their account and the app says nothing.
//
// ── WHAT past_due ACTUALLY IS ───────────────────────────────────────────────────────────────────
// Razorpay's charge failed and it is retrying. `past_due` is deliberately absent from BOTH access
// gates — CakeDesigner's blockedStatuses and the api's BLOCKED_STATUSES — and the SQL derive rule
// says why: "only status_id = 1 decays at the boundary. past_due (4) and pending (2) are the
// dunning window — Razorpay is still retrying, so the baker keeps access." That is the right call.
// Locking somebody out because a card bounced would be punishing the wrong thing.
//
// But the window is SHORT. Razorpay retries daily and halts after roughly three days, at which
// point the status becomes `expired` and the full lock screen appears. So the baker has about
// seventy-two hours of normal-looking service, then no account — and until now the only warning was
// an email. A missed email turns into "the app suddenly stopped working", which arrives as a
// support ticket rather than as a payment.
//
// ── WHY IT DOES NOT DISMISS ─────────────────────────────────────────────────────────────────────
// Everything else in this app that interrupts can be waved away, and should be. This cannot: the
// consequence is losing the bakery, the window is days, and a dismissal would outlive the baker's
// memory of dismissing it. It disappears the moment the charge succeeds, because the status flips
// to `active` and this returns null — there is nothing to dismiss that paying does not also fix.
//
// ── WHY IT SENDS THEM TO BILLING, NOT TO RAZORPAY ───────────────────────────────────────────────
// The webhook has Razorpay's `short_url` and puts it in the email, but it is never persisted — and
// it should not be. That URL belongs to one invoice and goes stale; a button that sometimes opens a
// dead page is worse than one that always works. BillingPanel already has the re-authorise flow
// (update payment method = a new mandate on the same plan and period), which is the actual fix when
// a card has expired or a UPI mandate has lapsed.
//
// `pending` is NOT shown here. It is a different situation with the same-sounding name: a
// subscription awaiting its FIRST authorisation, where nothing has failed and there is nothing to
// warn about.

const AMBER = { ink: '#B45309', bg: '#FEF3C7', line: '#FDE68A' };

// ── The bar's height on a WIDE screen, exported ─────────────────────────────────────────────────
// CakeDesigner's desktop logo is `position: absolute; top: 14` anchored to `page`, deliberately out
// of flow — "absolutely positioned so it costs the column no height", because 52px of header chrome
// pushes the spatula down and clips its blade. Everything else in `page` is a flex child and moves
// down when this bar appears; the logo, being out of flow, does not, and lands ON TOP of the text.
// Caught by looking at it, which is the only way it could have been.
//
// A constant rather than a measurement, and that is safe for one reason: the logo only renders when
// !isMobile, and at that width this bar is always ONE row. The narrow layout wraps to two, but
// nothing is out of flow there — the mobile header is a normal flex child.
export const PAST_DUE_BAR_H = 40;   // 10 top + ~20 line + 10 bottom, matching s.bar below

export default function PastDueBanner({ status, onOpenBilling }) {
  // 640, not the studio's 760: this is one sentence and one button, so it has room for longer than
  // a header with three controls does. The shared hook is what keeps the two from disagreeing about
  // anything other than the number.
  const narrow = useNarrow(640);

  if (status !== 'past_due') return null;

  return (
    <div style={{ ...s.bar, ...(narrow ? s.barNarrow : null) }} role="status">
      <span style={s.text}>
        <b>We couldn’t take this month’s payment.</b>{' '}
        {/* Says what is true right now AND what happens next. "Payment failed" alone reads as
            either "you are already locked out" or "ignore me" — and one of those is expensive. */}
        Your bakery is still open while we retry, but it will close in a few days if the payment
        doesn’t go through.
      </span>
      <button type="button" style={{ ...s.btn, ...(narrow ? s.btnNarrow : null) }} onClick={onOpenBilling}>
        Update payment
      </button>
    </div>
  );
}

const s = {
  // flexShrink:0 because `page` is a 100vh flex column — without it the bar is the thing that gets
  // squeezed to nothing on a short screen, which is the same class of bug that hid the rail's
  // Chef's Desk item.
  bar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
    height: PAST_DUE_BAR_H, boxSizing: 'border-box',
    padding: '0 16px', background: AMBER.bg, borderBottom: `1px solid ${AMBER.line}`,
    fontFamily: "'Quicksand',sans-serif", color: AMBER.ink, fontSize: 13, lineHeight: 1.4,
  },
  // On a phone the sentence needs the full width, so the button takes a row of its own rather than
  // competing with it — the same reshape the print studio's header does, for the same reason.
  // Height goes back to auto here: two rows, and nothing out of flow to clear it.
  barNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 8, height: 'auto', padding: '10px 14px' },
  text: { flex: 1, minWidth: 0 },
  btn: {
    flexShrink: 0, padding: '9px 16px', minHeight: 40, borderRadius: 10, border: 'none',
    background: AMBER.ink, color: '#fff', fontSize: 13, fontWeight: 800,
    fontFamily: 'inherit', cursor: 'pointer',
  },
  btnNarrow: { width: '100%' },
};
