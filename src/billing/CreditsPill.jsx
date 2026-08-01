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

  const title = pct >= 100
    ? 'Smart tool credits — none left this month. Tap to top up.'
    : `Smart tool credits — ${left} left. Tap for details.`;

  // The whole control opens Billing — there is no separate "+" buy button. Topping up belongs
  // beside the meter and the price list, not on a header chip that would sell credits to a baker
  // who has not been shown what they cost.

  return (
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
  );
}

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
