import { useEffect, useState } from 'react';
import { onCreditsChanged } from './creditsBus.js';

// ── The credits pill ─────────────────────────────────────────────────────────────────────────────
// A always-present, always-quiet readout of the smart-tool balance, in the app header.
//
// WHY IT EXISTS: credits were only visible if a baker went looking in Billing, so during ordinary
// work they burned silently. A metered resource nobody can see is one a baker discovers by being
// refused — which is precisely the failure SUBSCRIPTION_TIERS.md calls out ("silently failing at the
// limit wastes the whole mechanism"). The nudges in the billing card only fire when someone opens
// billing; this is the surface that is always there.
//
// WHY IT IS SO SMALL: the same doc is equally clear that bakers should not be thinking about this.
// The pill's job is to be glanceable and ignorable — a number that only asks for attention when it
// starts running out. Hence no label in the resting state, and colour that stays neutral until 70%.
//
// It shows ONE shared number, never a per-tool count: every tool draws on the same pool, so a job
// count here would read as an earmark. Detail lives in Billing, one tap away.
// ONE shape, one placement rule: a horizontal chip, top-right on desktop (floating over the canvas)
// and in the top bar on mobile. It used to have a second 'stack' form for the desktop sidebar rail;
// that was dropped when the readout moved top-right, because two arrangements of the same number is
// two things to keep in step for no gain.
export default function CreditsPill({ apiClient, onOpen }) {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!apiClient?.fetchAiCredits) return;
    const load = () => apiClient.fetchAiCredits()
      .then(d => { if (alive) setData(d); })
      .catch(() => { /* header furniture never surfaces an error */ });
    load();
    // Re-read whenever something spends or buys, so the number is never stale mid-session.
    const off = onCreditsChanged(load);
    return () => { alive = false; off(); };
  }, [apiClient]);

  // Render nothing rather than a placeholder: an empty pill in the header is worse than no pill,
  // and this must never be the reason a header looks broken.
  if (!data || !data.active) return null;

  // Unlimited plans have no number worth showing — a countdown that never moves is noise, and the
  // baker already knows from Billing that it is included.
  if (data.unlimited) return null;

  const left = data.spendable ?? 0;
  const pct  = Math.min(100, data.usedPct ?? 0);

  // Neutral until it matters. The escalation mirrors the billing card's 70/90/100 exactly, so the
  // two surfaces never disagree about whether a baker is running low.
  const tone = pct >= 100 ? { fg: '#991B1B', bg: '#FEF2F2', br: '#FCA5A5' }
             : pct >= 90  ? { fg: '#8A5200', bg: '#FFF6E5', br: '#F0D9A8' }
             : pct >= 70  ? { fg: '#8A5200', bg: '#FFFBF2', br: '#EFE3CC' }
             :              { fg: '#4A5D51', bg: '#F4F8F5', br: '#E2EAE4' };

  // ── The one-time note ────────────────────────────────────────────────────────────────────────
  // The pill's colour is honest but easy to miss: it is a small chip someone is not looking at, and
  // a baker who has learned to ignore a number in the corner will keep ignoring it as it turns
  // amber. The email reaches people who read email; this reaches the rest, once, where they are
  // already working.
  //
  // The SERVER decides whether there is anything to warn about (creditWarning), because that rule
  // carries the 80% watermark and the "bought credits cover it" suppression. This file only decides
  // how to say it and whether it has already been said.
  //
  // Keyed on resetsOn rather than a month the client computes: the reset instant already changes
  // exactly once per allowance period, so it IS the period identifier — no date maths, and no way
  // to drift from the IST boundary the ledger meters on.
  const warning  = data.creditWarning;                       // 'low' | 'exhausted' | null
  const noteKey  = warning ? `spattoo.creditNote.${warning}.${data.resetsOn ?? ''}` : null;
  const showNote = !!warning && !dismissed && !readFlag(noteKey);

  const title = pct >= 100
    ? 'Smart tool credits — none left this month. Tap to top up.'
    : `Smart tool credits — ${left} left. Tap for details.`;

  // The whole control opens Billing — there is no separate "+" buy button. Topping up belongs
  // beside the meter and the price list, not on a header chip that would sell credits to a baker
  // who has not been shown what they cost.

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
    {showNote && (
      <div role="status" style={n.card}>
        <div style={n.head}>
          {warning === 'exhausted' ? 'Monthly credits used up' : 'Credits running low'}
        </div>
        <div style={n.body}>
          {warning === 'exhausted'
            ? <>You've used all {data.allowance} credits included with your plan this month.</>
            : <>You have <b>{data.allowanceLeft} of {data.allowance}</b> monthly credits left.</>}
          {/* The reset date, in both. It is what makes "wait" a real option rather than an
              oversight, and a note that hid it to push a top-up would deserve to be dismissed. */}
          {data.resetsOn && <> They refresh on <b>{formatReset(data.resetsOn)}</b>.</>}
          {/* Bought credits change the situation entirely — nothing has actually stopped. */}
          {data.walletBalance > 0 && <> You still have <b>{data.walletBalance} bought credits</b>, which don't expire.</>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {/* Offered only where the plan allows buying. A button that leads to "your plan can't"
              is worse than no button. */}
          {data.canBuy && (
            <button type="button" onClick={() => { dismiss(); onOpen?.(); }} style={n.primary}>
              Top up
            </button>
          )}
          <button type="button" onClick={dismiss} style={n.ghost}>Got it</button>
        </div>
      </div>
    )}
    <button
      type="button" onClick={onOpen} title={title} aria-label={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 34, padding: '0 10px',
        borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
        background: tone.bg, border: `1.5px solid ${tone.br}`, color: tone.fg,
        fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
        lineHeight: 1, flexShrink: 0,
      }}
    >
      <SparkGlyph color={tone.fg} />
      {left}
    </button>
    </div>
  );

  // Dismissal is LOCAL, not a server flag. It is a nicety rather than a record, and reusing the
  // server's per-month claim would mean the email — which claims first — suppressed this note
  // entirely. Per-browser means a baker on a second device may see it once more; that is a better
  // failure than never seeing it at all.
  function dismiss() {
    setDismissed(true);
    writeFlag(noteKey);
  }
}

// localStorage, wrapped: it throws in private browsing on some Safari versions, and a header chip
// must never be the reason a page fails to render.
function readFlag(key) {
  if (!key) return true;
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key) {
  if (!key) return;
  try { window.localStorage.setItem(key, '1'); } catch { /* nothing worth breaking over */ }
}

const formatReset = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }); }
  catch { return 'the 1st'; }
};

const n = {
  card: {
    position: 'absolute', top: 42, right: 0, zIndex: 20, width: 268,
    background: '#fff', border: '1.5px solid #E8EFE9', borderRadius: 12, padding: '12px 13px',
    boxShadow: '0 12px 32px rgba(20,24,21,0.16)', fontFamily: 'inherit', textAlign: 'left',
    cursor: 'default',
  },
  head:  { fontSize: 13, fontWeight: 800, color: '#2C4433', marginBottom: 4 },
  body:  { fontSize: 11.5, fontWeight: 600, color: '#7C8B82', lineHeight: 1.55 },
  primary: {
    flex: 1, padding: '7px 10px', borderRadius: 9, border: 'none', background: '#3D5A44',
    color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },
  ghost: {
    flex: 1, padding: '7px 10px', borderRadius: 9, border: '1.5px solid #E8EFE9',
    background: '#fff', color: '#7C8B82', fontSize: 12, fontWeight: 800,
    fontFamily: 'inherit', cursor: 'pointer',
  },
};

// A spark, not a coin. These are not money — they are a monthly allowance most bakers never buy,
// and a coin would say "you are spending" on every glance at the header.
function SparkGlyph({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4-2.4 6.1-2.4-6.1L3.5 11l6.1-2.4L12 2.5z"
        fill={color} opacity="0.9"
      />
    </svg>
  );
}
