// ── Lapsed-access gate: which story do we tell the baker? ─────────────────────
// THREE distinct situations reach the blocked-access gate, and showing the wrong one tells
// the baker a false story about their own account. Kept in its own module (not inline in
// CakeDesigner) so the resolution is a pure, testable function rather than a ternary buried
// in a 5,000-line render.
//
//   trial  — never paid; the 30-day Spark trial ran out (docs/SUBSCRIPTION_TIERS.md)
//   ended  — paid, then cancelled ON PURPOSE (a cancellation reason is recorded)
//   failed — paid, then Razorpay could no longer charge (halted / dunning exhausted)
//
// Until 2026-07-30 all three showed "Your trial has ended" plus a nudge to the free plan, so
// a paying baker whose renewal failed was told their trial was over and steered at a
// downgrade — the one remedy that cannot fix a failed payment.
//
// Deliberately NO amounts in any copy: Checkout is the only place a figure is shown, because
// it is the only place that knows the real one (plan + period + GST).

export const LAPSED_GATE_COPY = {
  trial: {
    title: 'Your trial has ended',
    body:  () => 'Choose a plan to keep using Spattoo.',
  },
  ended: {
    title: 'Your subscription has ended',
    body:  plan => `Your ${plan} plan is no longer active. Pick up where you left off, or choose a different plan.`,
  },
  failed: {
    title: "We couldn't renew your subscription",
    body:  plan => `Your last payment didn't go through, so your ${plan} plan is inactive. Resume it to get back in.`,
  },
};

// Resolve the state from two facts on the baker profile:
//   has_paid_before — the one-way "has ever paid" flag (api: bakers.first_paid_at). A baker who
//                     has entered a paid subscription NEVER returns to trial, so this never flips back.
//   subscription_cancellation_reason — present when the lapse was a DELIBERATE cancel; absent when
//                     Razorpay simply stopped being able to charge.
// Defaults to 'trial' for a missing/absent profile: it is the only copy that is safe when we do not
// know, since it makes no claim about a payment.
export function lapsedGateState(baker) {
  if (!baker?.has_paid_before) return 'trial';
  return baker.subscription_cancellation_reason ? 'ended' : 'failed';
}
