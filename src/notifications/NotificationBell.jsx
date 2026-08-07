import { useCallback, useEffect, useState } from 'react';
import { useNarrow } from '../shared/useNarrow.js';

// ── The bell ─────────────────────────────────────────────────────────────────────────────────────
// An unread count in the header, and a list behind it. Sits beside CreditsPill and follows the same
// rule: header furniture is glanceable, ignorable, and never the reason a header looks broken.
//
// ── WHY IT EXISTS ALONGSIDE PUSH AND EMAIL ──────────────────────────────────────────────────────
// Push reaches a baker who is not looking at the app. Email reaches them later, and is the durable
// record. Neither answers "what have I missed?" while they ARE in the app — a push that arrived
// during service and was dismissed is gone, and nobody scrolls their inbox mid-shift.
//
// So this is not a third delivery channel. It is a READ of the notifications already produced, which
// is why it needed no new event, no new pipeline and no new failure mode.
//
// ── WHY THE COUNT IS PER BAKERY ─────────────────────────────────────────────────────────────────
// A bakery is a shop floor. If one person deals with an enquiry it is dealt with, and a second
// unread badge on a colleague's screen is noise about work already done. `read_at` therefore lives
// on the notification, not on a per-person join (migration 057).

// Poll rather than subscribe. Supabase Realtime is already wired for co-design and could push these,
// but a bell is not worth a socket per baker: the freshness that matters is measured in minutes, the
// push already handles the urgent case, and a poll cannot leave a stale count when a socket drops.
const POLL_MS = 60_000;

export default function NotificationBell({ apiClient, onOpenLink }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems]   = useState(null);   // null = never loaded
  const [open, setOpen]     = useState(false);
  // 768 is this component's own number — the panel is 320 wide and needs a header to hang off.
  // The SSR guard lives in the shared hook now, not here.
  const narrow = useNarrow(768);

  const load = useCallback(() => {
    if (!apiClient?.fetchNotifications) return Promise.resolve();
    return apiClient.fetchNotifications()
      .then(r => { setUnread(r?.unread ?? 0); setItems(r?.notifications ?? []); })
      .catch(() => { /* header furniture never surfaces an error */ });
  }, [apiClient]);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) load(); };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [load]);

  // Nothing to show and nothing loaded — render nothing rather than an empty bell. A host that has
  // not wired the endpoint gets no furniture at all, which is the same rule CreditsPill follows.
  if (!apiClient?.fetchNotifications) return null;

  async function openItem(n) {
    setOpen(false);
    if (!n.readAt) {
      // Optimistic: the count drops as the baker taps, not after a round trip. A number that lags
      // the tap reads as the tap not having worked.
      setUnread(u => Math.max(0, u - 1));
      setItems(list => list?.map(i => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      apiClient.markNotificationsRead?.([n.id]).catch(() => load());
    }
    onOpenLink?.(n.link);
  }

  async function markAllRead() {
    setUnread(0);
    setItems(list => list?.map(i => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    apiClient.markNotificationsRead?.().catch(() => load());
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" style={s.bell} onClick={() => { setOpen(o => !o); if (!items) load(); }}
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <BellGlyph />
        {/* The count caps at 9+. A two-digit badge on a small chip is unreadable, and the exact
            number stops mattering once it is "several" — the list is one tap away. */}
        {unread > 0 && <span style={s.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <>
          {/* Click-away, behind the panel. Without it the only way out is the bell itself, which a
              baker will not think to press again. */}
          <div style={s.backdrop} onClick={() => setOpen(false)} />
          {/* ── Where the panel sits ──────────────────────────────────────────────────────────────
              WIDE: anchored to the bell, hanging down-left from its right edge. The bell is top-right
              there, so the panel lands on screen.

              NARROW: pinned to the VIEWPORT instead. On a phone the bell sits near the LEFT of the
              header, and a 320px panel anchored to its right edge extends off the left of the
              screen — which does not scroll into view, it simply clips, and a baker reads "sand"
              where a customer's name should be. */}
          <div style={narrow ? s.panelNarrow : s.panel} role="dialog" aria-label="Notifications">
            <div style={s.head}>
              <span style={s.headTitle}>Notifications</span>
              {unread > 0 && (
                <button type="button" style={s.markAll} onClick={markAllRead}>Mark all read</button>
              )}
            </div>

            {items === null && <div style={s.empty}>Loading…</div>}
            {items?.length === 0 && <div style={s.empty}>Nothing yet. New enquiries will appear here.</div>}

            <div style={s.list}>
              {items?.map(n => (
                <button key={n.id} type="button" style={{ ...s.row, ...(n.readAt ? null : s.rowUnread) }}
                        onClick={() => openItem(n)}>
                  {!n.readAt && <span style={s.dot} aria-hidden />}
                  <span style={s.rowText}>
                    <span style={s.rowTitle}>{titleOf(n)}</span>
                    <span style={s.rowWhen}>{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// What a row SAYS. Derived from the payload rather than the type's admin label, because "Order
// placed — baker notification" is a registry entry, not a sentence a baker wants to read.
export function titleOf(n) {
  const p = n?.payload ?? {};
  switch (n?.type) {
    case 'order_placed_baker':    return `New quote request from ${p.customerName || 'a customer'}`;
    case 'quote_accepted_baker':  return `${p.customerName || 'A customer'} accepted your quote`;
    case 'quote_question_baker':  return `${p.customerName || 'A customer'} asked about their quote`;
    case 'delivery_digest_baker': return (p.count ?? 0) === 1
      ? 'One delivery today' : `${p.count ?? 0} deliveries today`;
    // Falls back to the registry label rather than to nothing: an unknown type is a type added since
    // this file was written, and showing its label beats showing a blank row.
    default: return n?.label || 'Notification';
  }
}

// "3 days ago" beats a date in a list being scanned for what is new. Same reasoning as the sheet
// library's relativeDate, kept separate because this one wants minutes and hours too.
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? (months === 1 ? 'a month ago' : `${months} months ago`) : 'over a year ago';
}

const BellGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

const s = {
  bell: { position: 'relative', width: 38, height: 38, borderRadius: 10, border: 'none',
          background: 'none', color: '#4A5D51', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 0 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px',
           borderRadius: 8, background: '#C0392B', color: '#fff', fontSize: 10, fontWeight: 800,
           lineHeight: '16px', textAlign: 'center', boxSizing: 'border-box' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 1150 },
  panel: { position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 1200, width: 320,
           maxHeight: 420, overflowY: 'auto', background: '#fff', borderRadius: 14,
           border: '1px solid #E8EFE9', boxShadow: '0 18px 48px rgba(20,24,21,0.22)' },
  // Fixed to the viewport, not to the bell. `left` and `right` together set the width, so it fits
  // whatever the screen is — no 320 to overflow, and nothing to clip. maxHeight in vh because a
  // fixed panel cannot be measured against a parent that is not its offset context.
  panelNarrow: { position: 'fixed', left: 12, right: 12, top: 64, zIndex: 1200,
                 maxHeight: '65vh', overflowY: 'auto', background: '#fff', borderRadius: 14,
                 border: '1px solid #E8EFE9', boxShadow: '0 18px 48px rgba(20,24,21,0.22)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderBottom: '1px solid #F1F5F2' },
  headTitle: { fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8a9a8e' },
  markAll: { border: 'none', background: 'none', color: '#3D5A44', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 },
  empty: { padding: '22px 16px', fontSize: 12.5, color: '#8a9a8e', textAlign: 'center', lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 14px', border: 'none',
         borderBottom: '1px solid #F6F8F6', background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' },
  rowUnread: { background: '#F7FAF8' },
  dot: { width: 7, height: 7, borderRadius: '50%', background: '#3D5A44', marginTop: 5, flexShrink: 0 },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 700, color: '#2A241F', lineHeight: 1.35 },
  rowWhen: { fontSize: 11, color: '#8a9a8e' },
};
