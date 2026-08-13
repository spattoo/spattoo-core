import { formatPlanPrice, periodPrice, PERIOD_SUFFIX } from './planPricing.js';

// ── PlanCards ─────────────────────────────────────────────────────────────────────────────────
// The ONE plan picker, shared by the billing screen (Settings → Billing) and the signup
// onboarding wizard. Select-to-expand accordion: tapping a plan selects it AND reveals its
// feature bullets (chevron rotates), matching the onboarding pattern. Presentation only — the
// parent owns the selected-plan state + the CTA. All plan data (display name, tagline, bullets,
// popular flag, prices) comes from the DB catalog (GET /api/plans), so there's nothing to keep
// in sync here. Themeable via `theme` tokens so it fits both the light billing panel and the
// dark onboarding screen.

const LIGHT_THEME = {
  text:          '#1a1a1a',
  textMuted:     '#9CA3AF',
  accent:        '#1a1a1a',   // selection colour; also used at low alpha for the active card bg
  cardBg:        '#ffffff',
  border:        '#E8EFE9',
  popularBg:     '#1a1a1a',
  popularText:   '#ffffff',
  currentBg:     '#F0F4F1',
  currentText:   '#6B7280',
  currentBorder: '#D4E0D7',
  check:         '#1a1a1a',
  chevron:       '#cbd5e1',
  divider:       'rgba(0,0,0,0.07)',
};

export default function PlanCards({
  plans = [],
  periods = [],
  selectedPeriod = 'monthly',
  selected,
  currentTier,
  onSelect,
  theme,
}) {
  const t = { ...LIGHT_THEME, ...(theme || {}) };
  const period = periods.find(p => p.name === selectedPeriod)
    || { name: selectedPeriod, months: 1, discount_pct: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plans.map(plan => {
        const active    = selected === plan.name;
        const isCurrent = !!currentTier && currentTier === plan.name;
        const price     = periodPrice(plan, period);
        const suffix    = price ? (PERIOD_SUFFIX[period.name] ?? '') : '';
        const bullets   = plan.feature_bullets ?? [];

        return (
          <div key={plan.name} style={{
            borderRadius: 14, overflow: 'hidden',
            border: `1.5px solid ${active ? t.accent : t.border}`,
            background: active ? `${t.accent}0f` : t.cardBg,
            boxShadow: active ? `0 0 0 3px ${t.accent}24` : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>
            {/* Tap to select AND reveal this plan's features. */}
            <button type="button" onClick={() => onSelect?.(plan.name)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', background: 'transparent', border: 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.text }}>{plan.display_name}</span>
                  {plan.is_popular && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: t.popularBg, color: t.popularText }}>
                      Most Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.currentBg, color: t.currentText, border: `1px solid ${t.currentBorder}` }}>
                      current
                    </span>
                  )}
                </div>
                {plan.tagline && (
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, fontWeight: 500 }}>{plan.tagline}</div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: active ? t.accent : t.text }}>
                  {formatPlanPrice(price)}
                  {suffix && <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 2, fontWeight: 600 }}>{suffix}</span>}
                </span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={t.chevron} strokeWidth="2"
                  style={{ transform: active ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {active && bullets.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: '4px 16px 14px', borderTop: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {bullets.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: t.text, opacity: 0.85 }}>
                    <span style={{ color: t.check, marginTop: 1, flexShrink: 0, fontWeight: 800 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
