import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNarrow } from '../../shared/useNarrow.js';
import { Z } from '../../shared/Panel.jsx';

// ── The first minute in the designer ─────────────────────────────────────────────────────────────
// A customer arrives from a link the baker sent, on a phone, having never seen a 3D cake designer.
// Nothing on screen says the cake can be TURNED, that a tier can be tapped, or what to do once it
// looks right. They are not short of intent — they came to order a cake — they are short of a first
// move.
//
// ── IT IS THE SAME TOUR FOR BOTH, BECAUSE DESIGNING IS THE SAME JOB ─────────────────────────────
// A baker designs on the same canvas with the same decorations. What differs is not the tour, it is
// WHO GETS IT UNINVITED: a customer has one visit and needs the nudge; a baker opens the app every
// day and would resent it, so they get the "Take a tour" rail item and no automatic run.
//
// This does not try to teach a baker their whole app — Orders, Chef's Desk and the storefront link
// are a different subject with a different audience. It points at designing, and only at designing.
//
// The one thing that genuinely differs is the last step: the same button says "Request a Quote" to a
// customer and "Order This Cake" to a baker, and telling a baker the bakery will come back to them
// would be nonsense.
//
// ── WHY NOT ON "FIRST LOGIN" ────────────────────────────────────────────────────────────────────
// A customer OTP-verifies at the ENQUIRY end of the journey, after the cake is designed. A tour tied
// to logging in would arrive to explain something they had already finished. It triggers on the
// first time the designer is opened instead, which needs no auth and is the moment that matters.
//
// ── MOBILE IS THE PRIMARY CASE HERE ─────────────────────────────────────────────────────────────
// The opposite of the rest of the app. A baker is often at a laptop; a customer taps a link in
// WhatsApp. So the bubble is sized for a phone first, and the SIDE it sits on is measured rather
// than assumed — the rail is a column on the left at desktop width and a bar along the bottom on a
// phone, so "put it to the right of the target" is wrong exactly half the time.

const SEEN_KEY = 'spattoo.tour.customer.v1';   // v1: bump to re-show after the steps change

// ── Where "seen" lives, and why it is two different places ──────────────────────────────────────
// BAKER — a column, baker_appusers.tour_seen_at (migration 060), read from /me and written by
// POST /me/tour-seen. They are authenticated from the first render, so there is no reason to guess:
// it survives a new laptop and a cleared browser, and it is per PERSON rather than per bakery.
//
// CUSTOMER — a cookie, because a column is impossible. DesignFacet opens the designer straight from
// the "let me build it myself in 3D" door with no OTP; verification happens later, at enquiry. At
// the moment this has to decide, there is no customer row to read and no session to write with.
//
// ── WHY A COOKIE RATHER THAN localStorage ───────────────────────────────────────────────────────
// localStorage is per ORIGIN, and every baker's storefront is its own subdomain — so a customer
// ordering from two bakeries was told the same thing twice. A cookie can be set on the PARENT
// domain, which every {slug}.spattoo.com shares, so one viewing covers all of them.
//
// The domain is DERIVED from location.hostname, never configured: the last two labels of whatever
// we are actually served from. That is `.spattoo.dev` in dev and `.spattoo.com` in production with
// no env var, no build flag and nothing to remember at deploy — the bug this avoids is a cookie
// pinned to the wrong domain on the day the real one goes live, which fails by silently never
// matching. localhost gets no domain attribute at all (host-only), because a single label cannot
// be a cookie domain.
export const cookieDomain = (hostname) => {
  const parts = String(hostname).split('.');
  // An IP address, `localhost`, or `{slug}.localhost` — host-only, no Domain attribute.
  if (parts.length < 2 || /^[\d.]+$/.test(hostname) || parts[parts.length - 1] === 'localhost') return '';
  return `; domain=.${parts.slice(-2).join('.')}`;
};

// Anchored by data-tour, not by class or DOM shape: a tour that breaks when a wrapper div appears is
// worse than no tour, because nobody notices it stopped pointing at the right thing.
//
// Step 1 covers rotate AND tap-a-tier together. They were two steps, and the second could not be
// anchored honestly — the cake is a WebGL canvas, so there is no element for "the bottom tier", and
// a second spotlight on the same rectangle reads as the tour being stuck.
const stepsFor = (mode) => [
  { target: 'canvas',   title: 'Turn it around',  body: 'Drag to spin the cake. Tap a tier to change its colour or frosting.' },
  { target: 'elements', title: 'Add decorations', body: 'Toppers, piping, flowers — browse and place them on the cake.' },
  { target: 'uploads',  title: 'Use your photo',  body: 'Upload a picture to put on the cake, or a design you want copied.' },
  mode === 'customer'
    ? { target: 'quote', title: 'Ask for a price', body: 'Happy with it? Send it to the bakery and they will come back with a quote.' }
    : { target: 'quote', title: 'Turn it into an order', body: 'Happy with it? Save it against a customer and it lands in your orders.' },
];

const seenCookie = () => {
  try { return document.cookie.split('; ').some(c => c.startsWith(`${SEEN_KEY}=`)); } catch { return true; }
};

// A year, and SameSite=Lax: this is read on a top-level page load and never cross-site, so Lax is
// the tightest setting that still works. Secure only on https — set unconditionally it would be
// dropped on http://localhost and the tour would repeat forever in local dev.
const markSeenCookie = () => {
  try {
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    const base = `${SEEN_KEY}=${Date.now()}; path=/; max-age=31536000; samesite=lax${secure}`;
    document.cookie = base + cookieDomain(window.location.hostname);
    // Verify it stuck, and fall back to host-only if it did not. A browser SILENTLY REFUSES a cookie
    // whose Domain is a public suffix — `spattoo-app-dev.vercel.app` derives `.vercel.app`, which is
    // exactly that — and a refusal is indistinguishable from success at the point of writing. Left
    // alone, the tour would repeat on every load of a preview deployment with nothing to explain it.
    if (!seenCookie()) document.cookie = base;
  } catch { /* ignore */ }
};

/**
 * `mode`       — 'customer' | 'baker'. Changes the last step's words and nothing else.
 * `autoStart`  — may it appear UNINVITED at all. A customer, yes; a baker who has never seen it,
 *                yes; a baker who has, no — the host reads that from /me and passes the answer.
 *                A separate prop from `mode` on purpose: "who is this" and "should it interrupt
 *                them" are two decisions, and folding them together is how the second one gets made
 *                by accident the next time a third mode appears.
 * `startNonce` — bump it to replay, from the "Take a tour" rail item. A COUNTER rather than a
 *                boolean because the interesting event is "asked again", and a boolean cannot say
 *                that twice in a row without the caller resetting it.
 * `onSeen`      — told once, the first time it is shown. The host persists it: a column for a
 *                baker, nothing for a customer (the cookie below is theirs). Kept out of here so
 *                this file never has to know there is an API.
 */
export default function DesignTour({ mode = 'customer', autoStart = false, startNonce = 0, onSeen }) {
  // Memoised on mode: `measure` closes over STEPS, and a fresh array every render would mean the
  // resize listener holding whichever copy existed when it was bound.
  const STEPS = useMemo(() => stepsFor(mode), [mode]);
  const narrow = useNarrow(760);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  // null until decided, so nothing paints during the frame where we do not yet know. Reading
  // localStorage in the initialiser would be SSR-unsafe; an effect settles it on mount.
  const [running, setRunning] = useState(false);

  useEffect(() => {
    // The cookie is the CUSTOMER's memory only. A baker's lives in baker_appusers.tour_seen_at, and
    // the host has already folded that into `autoStart` — checking the cookie for them too would let
    // a browser override a fact the server holds.
    if (!autoStart || (mode === 'customer' && seenCookie())) return;
    // One frame's grace: the rail and the canvas mount with the designer, and measuring before they
    // exist gives a null rect and a bubble parked in the corner.
    const t = setTimeout(() => setRunning(true), 400);
    return () => clearTimeout(t);
  }, [autoStart, mode]);

  // Asked for by hand. Ignores `seen` entirely — that flag answers "should this appear uninvited",
  // which is a different question from "does this person want it now".
  //
  // It also settles something the automatic run cannot: localStorage is per ORIGIN, and every baker's
  // storefront is its own subdomain ({slug}.spattoo.com), so a customer ordering from two bakeries
  // gets the automatic tour twice. Rather than reach for a cookie on the parent domain to suppress
  // the second one, a button that is always there makes repetition cost nothing and forgetting cost
  // nothing either.
  useEffect(() => {
    if (!startNonce) return;
    setI(0);
    setRunning(true);
  }, [startNonce]);

  // Measure the current step's target. Re-measured on resize and scroll because both move it — the
  // rail is fixed but the quote bar is not, and a phone's address bar collapsing counts as a resize.
  const measure = useCallback(() => {
    if (!running) return;
    const el = document.querySelector(`[data-tour="${STEPS[i]?.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [running, i, STEPS]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const finish = useCallback(() => setRunning(false), []);

  // Marked when it is SHOWN, not when it is finished. Somebody who reads the first bubble and closes
  // the tab has been told; re-offering it next time would punish them for not clicking through. It
  // also means the one write happens whether they press Got it, press Skip, or simply leave.
  useEffect(() => {
    if (!running) return;
    if (mode === 'customer') markSeenCookie();
    onSeen?.();
  }, [running, mode, onSeen]);

  // A missing target is SKIPPED, never shown as an empty bubble. Uploads needs element:manage, and a
  // host that has not granted it should lose that one step rather than the whole tour.
  useEffect(() => {
    if (!running) return;
    if (rect === null && i < STEPS.length) {
      const el = document.querySelector(`[data-tour="${STEPS[i]?.target}"]`);
      if (!el) (i + 1 >= STEPS.length ? finish() : setI(n => n + 1));
    }
  }, [running, rect, i, finish]);

  if (!running || !rect) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const W = narrow ? Math.min(300, window.innerWidth - 24) : 320;

  // ── Which side the bubble sits on ──────────────────────────────────────────────────────────────
  // Measured, never assumed. On a phone the rail is a bar along the BOTTOM, so a bubble placed below
  // its target is off-screen; at desktop width the same target is a column on the LEFT, where below
  // is fine and right is better. Picking the side with the most room handles both without asking
  // which layout is on screen — the same reasoning as the notification panel, which broke by
  // anchoring to a control that had moved.
  const GAP = 12;
  const H = 150;                                    // the bubble's rough height — four lines and a row
  const room = {
    bottom: window.innerHeight - rect.bottom,
    top:    rect.top,
    right:  window.innerWidth - rect.right,
    left:   rect.left,
  };

  // FITS first, roomiest second. Picking the roomiest side alone is what put the bubble off-screen:
  // the canvas target spans nearly the whole viewport, so its LEFT gap was the largest of four small
  // numbers — 120px of room for a 320px bubble. "Most space" is not "enough space".
  const needs = { top: H + GAP, bottom: H + GAP, left: W + GAP, right: W + GAP };
  const fits  = Object.entries(room)
    .filter(([k, v]) => v >= needs[k])
    .filter(([k]) => !(narrow && (k === 'left' || k === 'right')))   // no side room worth having on a phone
    .sort((a, b) => b[1] - a[1]);

  const clamp = (v, max) => Math.max(12, Math.min(v, max - 12));
  const centred = {
    left: clamp(rect.left + rect.width / 2 - W / 2, window.innerWidth - W),
    top:  clamp(rect.top + rect.height / 2 - H / 2, window.innerHeight - H),
  };

  // Nothing fits beside it — which is the NORMAL case for a target the size of the canvas, not an
  // edge case. Sitting on top of it is right there: the subject is the whole area, so covering a
  // little of it costs nothing and the spotlight still shows what is being talked about.
  const pos = !fits.length ? centred : {
    bottom: { top: rect.bottom + GAP, left: centred.left },
    top:    { bottom: window.innerHeight - rect.top + GAP, left: centred.left },
    right:  { left: rect.right + GAP, top: centred.top },
    left:   { right: window.innerWidth - rect.left + GAP, top: centred.top },
  }[fits[0][0]];

  return (
    <>
      {/* The spotlight is ONE element: a ring around the target with a huge spread shadow, which
          dims everything else without four divs to keep in sync. pointerEvents none so the tour
          never blocks the thing it is pointing at — a customer who wants to just start dragging
          should be able to. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', pointerEvents: 'none', zIndex: Z.toast,
          top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12,
          borderRadius: 14, boxShadow: '0 0 0 9999px rgba(18,22,19,0.62)',
          // NO transition. `transition: all` here animates the 9999px spread shadow, which repaints
          // most of the viewport every frame — and it does not merely stutter, it fails to arrive:
          // measured mid-tour, React had rendered top:318px while the computed value was still
          // 265px, a full step behind, seconds after the change. The spotlight sat on Decorations
          // while the bubble talked about Uploads.
          //
          // Snapping is the right answer anyway. A spotlight is a pointer, and a pointer that slides
          // is a pointer that is wrong for the length of the slide.
        }}
      />
      <div role="dialog" aria-label={step.title}
        style={{
          position: 'fixed', zIndex: Z.toast + 1, width: W, boxSizing: 'border-box',
          background: '#fff', borderRadius: 14, padding: '14px 16px 12px',
          boxShadow: '0 18px 48px rgba(20,24,21,0.28)', fontFamily: "'Quicksand',sans-serif",
          ...pos,
        }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: '#2A241F', marginBottom: 4 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: '#5b6b60' }}>{step.body}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12 }}>
          {/* Dots, not "3 of 4": a customer wants to know it is nearly over, not to do arithmetic. */}
          <div style={{ display: 'flex', gap: 5 }}>
            {STEPS.map((s, n) => (
              <span key={s.target} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: n === i ? '#3D5A44' : '#D8E0DA',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Skip stays available on every step, including the last. A tour you cannot leave is a
                modal, and this one appears uninvited. */}
            <button type="button" onClick={finish}
              style={{ border: 'none', background: 'none', font: 'inherit', fontSize: 12.5,
                       color: '#8a9a8e', cursor: 'pointer', padding: '8px 4px' }}>
              Skip
            </button>
            <button type="button" onClick={() => (last ? finish() : setI(n => n + 1))}
              style={{ border: 'none', borderRadius: 10, background: '#3D5A44', color: '#fff',
                       font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                       padding: '0 16px', height: 40 }}>
              {last ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
