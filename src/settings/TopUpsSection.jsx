import { useEffect, useState } from 'react';
import { onCreditsChanged } from '../billing/creditsBus.js';

/* ── Settings → Top-ups ──────────────────────────────────────────────────────────────────────────
 *
 * The two things a baker BUYS beyond their plan, in one place: smart-tool credits and message
 * credits. Everything else in Settings is configuration — how the shop works. These are capacity,
 * and they run out.
 *
 * ⚠️ WHY A GROUP AND NOT TWO MORE SECTIONS. Customer messages lived as its own `<Section>` between
 * "Orders & Delivery" and Privacy, which put a purchase surface in a list of store settings. Sandeep
 * read that as wrong before anyone else did, and he was right: "store hours" and "buy 600 messages"
 * are not the same kind of thing and should not read as siblings.
 *
 * ⚠️ NAMED BY THE JOB, NEVER "AI" — SUBSCRIPTION_TIERS.md states the rule for smart tools, and the
 * pill, the billing card, the plan copy in migrations 048/051/055 and the marketing pricing table all
 * already obey it. "Message credits" is the matching shape on purpose: both rows are
 * "<what it is for> credits", so neither reads as a feature and both read as something spendable.
 *
 * ⚠️ A ROW IS FURNITURE ONLY IF ITS ENDPOINT EXISTS. Same rule CreditsPill follows — "if not wired
 * the endpoint gets no furniture at all". A row that cannot show a balance and cannot open a working
 * screen is worse than no row, because it reads as a broken feature rather than an absent one.
 */

const s = {
  /* Vertical padding only: `Section` already insets its children by 20px, so a row that padded
     itself horizontally too would sit 40px in and its divider would stop short of the card. */
  row: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '14px 0', border: 'none', borderTop: '1px solid #F3F4F6',
    background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit',
  },
  firstRow: { borderTop: 'none', paddingTop: 0 },
  lastRow:  { paddingBottom: 0 },
  label:  { fontSize: 13.5, fontWeight: 700, color: '#1a1a1a' },
  hint:   { fontSize: 11.5, color: '#888', marginTop: 2, lineHeight: 1.45 },
  value:  { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  /* A text glyph, matching CustomersPanel's list rows. Not a new icon: there is no chevron in
     shared/icons.jsx, and one drawn here would be the only one of its kind in the app. */
  chev:   { fontSize: 16, color: '#ccc', marginLeft: 2 },
};

/* The number is the reason a second entry point is worth having at all. The credits pill works
   because it SHOWS 240 — a menu row reading "Smart tool credits ›" with nothing beside it would be
   strictly less useful than the pill it duplicates. `null` means "not known yet", which is not the
   same as zero and must not be drawn as one. */
function Row({ first, last, label, hint, value, onOpen, primaryColor }) {
  return (
    <button type="button" onClick={onOpen}
            style={{ ...s.row, ...(first ? s.firstRow : null), ...(last ? s.lastRow : null) }}>
      <span style={{ flex: 1 }}>
        <span style={s.label}>{label}</span>
        <span style={{ ...s.hint, display: 'block' }}>{hint}</span>
      </span>
      {value != null && (
        <span style={{ ...s.value, color: primaryColor }}>{value.toLocaleString('en-IN')} left</span>
      )}
      <span style={s.chev} aria-hidden="true">&rsaquo;</span>
    </button>
  );
}

export function TopUpsSection({ apiClient, primaryColor = '#2C4433', onOpenSmartTools, onOpenMessages }) {
  const [credits,  setCredits]  = useState(null);
  const [messages, setMessages] = useState(null);

  const hasCredits  = typeof apiClient?.fetchAiCredits === 'function';
  const hasMessages = typeof apiClient?.fetchMessageBalance === 'function';

  /* Re-reads on creditsChanged, exactly as the pill does. A baker who tops up inside the panel this
     row opens comes back to the row — and a stale number there would contradict the screen they just
     came from. */
  useEffect(() => {
    if (!hasCredits) return undefined;
    let alive = true;
    const load = () => apiClient.fetchAiCredits()
      .then(d => { if (alive) setCredits(d?.spendable ?? null); })
      .catch(() => {});
    load();
    const off = onCreditsChanged(load);
    return () => { alive = false; off?.(); };
  }, [apiClient, hasCredits]);

  useEffect(() => {
    if (!hasMessages) return undefined;
    let alive = true;
    apiClient.fetchMessageBalance()
      .then(d => { if (alive) setMessages(d?.balance ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient, hasMessages]);

  // Nothing wired at all: draw nothing rather than an empty card.
  if (!hasCredits && !hasMessages) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {hasCredits && (
        <Row
          first last={!hasMessages}
          label="Smart tool credits"
          hint="Photo to cake design, and the other smart tools."
          value={credits}
          primaryColor={primaryColor}
          onOpen={onOpenSmartTools}
        />
      )}
      {hasMessages && (
        <Row
          first={!hasCredits} last
          label="Message credits"
          hint="SMS and WhatsApp updates to your customers. Email is always free."
          value={messages}
          primaryColor={primaryColor}
          onOpen={onOpenMessages}
        />
      )}
    </div>
  );
}
