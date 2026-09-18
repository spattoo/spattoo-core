import { useEffect, useState } from 'react';
import { onCreditsChanged } from '../billing/creditsBus.js';
import { NavRow } from '../shared/NavRow.jsx';

/* ── Settings → Top-ups ──────────────────────────────────────────────────────────────────────────
 *
 * The two things a baker BUYS beyond their plan: smart-tool credits and message credits. Everything
 * else in Settings is configuration — how the shop works. These are capacity, and they run out.
 *
 * ⚠️ NAMED BY THE JOB, NEVER "AI" — SUBSCRIPTION_TIERS.md states the rule for smart tools, and the
 * pill, the billing card, the plan copy in migrations 048/051/055 and the marketing pricing table all
 * already obey it. "Message credits" is the matching shape on purpose: both rows are
 * "<what it is for> credits", so neither reads as a feature and both read as something spendable.
 *
 * ⚠️ A ROW IS FURNITURE ONLY IF ITS ENDPOINT EXISTS. Same rule CreditsPill follows — "if not wired
 * the endpoint gets no furniture at all". A row that cannot show a balance and cannot open a working
 * screen is worse than no row, because it reads as a broken feature rather than an absent one.
 *
 * ⚠️ THE ROWS ARE `shared/NavRow.jsx`, NOT A LOCAL STYLE OBJECT. The first version hand-rolled them —
 * plain text, a faint balance and a literal "›" — and they did not read as pressable at all. The
 * shared row is now the standard for anything that opens something; see the note at the top of it.
 */

/* The number is the reason a second entry point is worth having at all. The credits pill works
   because it SHOWS 240 — a row reading "Smart tool credits ›" with nothing beside it would be
   strictly less useful than the pill it duplicates.

   ⚠️ `null` means "not loaded yet", which is NOT zero. Rendering it as "0 left" tells a baker they
   have run out when we simply do not know, and that is the one wrong answer that changes what they
   do next. Formatted here, so the row never has to decide. */
const left = (n) => (n == null ? undefined : `${n.toLocaleString('en-IN')} left`);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hasCredits && (
        <NavRow
          label="Smart tool credits"
          hint="Photo to cake design, and the other smart tools."
          value={left(credits)}
          accent={primaryColor}
          onClick={onOpenSmartTools}
        />
      )}
      {hasMessages && (
        <NavRow
          label="Message credits"
          hint="SMS and WhatsApp updates to your customers. Email is always free."
          value={left(messages)}
          accent={primaryColor}
          onClick={onOpenMessages}
        />
      )}
    </div>
  );
}
