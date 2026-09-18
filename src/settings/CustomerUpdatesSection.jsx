import { useState, useEffect } from 'react';
import { Toggle } from './controls.jsx';
import { useNarrow } from '../shared/useNarrow.js';

// ── Settings → Customer updates ──────────────────────────────────────────────────────────────────
//
// What a baker's customers are told, on which channel, and what it costs. Email and push are free and
// always on; SMS and WhatsApp are bought in packs and chosen per message.
//
// ⚠️ THE PREVIEW IS THE POINT OF THIS SCREEN, not decoration. Charging a baker for a message their
// customer sees branded "Spattoo" is only fair if they saw that before they paid
// (plans/whose-name-is-on-the-message.md). So the preview shows the REAL body, the REAL sender, and
// the baker's OWN bakery name — everything else is sample data, because a real price or date would
// imply we were quoting an actual order.
//
// ⚠️ NOTHING HERE IS MANDATORY, and the copy says so first. A baker who never recharges loses no
// functionality: every message still goes by email. That is what makes this an upgrade rather than a
// toll, and the sentence at the top is the feature, not a disclaimer.

const money = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export function CustomerUpdatesSection({ apiClient, primaryColor = '#2C4433' }) {
  const narrow = useNarrow();
  const [data, setData]       = useState(null);
  const [err, setErr]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [openPreview, setOpenPreview] = useState(null);   // slug whose message is shown
  const [buying, setBuying]   = useState(null);           // packKey while Checkout is open
  const [settling, setSettling] = useState(false);        // paid, waiting for the webhook

  useEffect(() => {
    let alive = true;
    apiClient.fetchMessageBalance()
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message || 'Could not load your customer update settings.'); });
    return () => { alive = false; };
  }, [apiClient]);

  const enabled = new Set(data?.enabledTypes ?? []);

  async function toggle(slug) {
    const next = new Set(enabled);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    const list = [...next];
    // Optimistic: a tick box that waits for a round trip feels broken, and the failure path below
    // puts it back rather than leaving the screen lying about what is saved.
    const before = data.enabledTypes;
    setData(d => ({ ...d, enabledTypes: list }));
    setSaving(true);
    try {
      await apiClient.saveMessageSettings(list);
      setErr(null);
    } catch (e) {
      setData(d => ({ ...d, enabledTypes: before }));
      setErr(e.message || 'That did not save. Please try again.');
    } finally { setSaving(false); }
  }

  /* ── Buy a pack ─────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ MESSAGES ARE MINTED BY THE WEBHOOK, not by this call and not by Checkout's handler. So after
   * a successful payment the balance here is still the OLD one, and the screen has to wait for it to
   * change rather than assume. `settle` polls against the balance captured BEFORE the purchase, which
   * is what makes "arrived" a fact instead of a guess — the same reason BuyCreditsPanel does it.
   */
  async function buy(packKey) {
    setBuying(packKey); setErr(null);
    try {
      const d = await apiClient.purchaseMessages(packKey);
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const el = document.createElement('script');
          el.src = 'https://checkout.razorpay.com/v1/checkout.js';
          el.onload = resolve; el.onerror = reject;
          document.head.appendChild(el);
        });
      }
      await new Promise(resolve => {
        const rzp = new window.Razorpay({
          key: d.key_id, order_id: d.order_id, amount: d.amount, currency: d.currency ?? 'INR',
          name: 'Spattoo',
          /* Razorpay's Price Summary shows ONE figure and we cannot add rows to it. `description` is
             the only text we control there, so the tax split rides in it: a baker who reached
             Checkout expecting ₹100 can see where ₹118 came from without going back. The numbers
             come from the same server call that set the charge, so this cannot disagree with the
             amount beside it. */
          description: `${d.messages} messages · ₹${(d.basePaise / 100).toFixed(0)} + ₹${(d.gstPaise / 100).toFixed(0)} GST`,
          theme: { color: primaryColor },
          handler: () => { resolve(); settle(balance); },
          modal: { ondismiss: resolve },
        });
        rzp.open();
      });
    } catch (e) {
      setErr(e.message || 'Could not start the payment.');
    } finally { setBuying(null); }
  }

  /* Poll until the balance CHANGES, not merely until we have refetched — otherwise success and
     silence look identical. Backs off rather than hammering: a webhook is usually a second or two,
     occasionally much longer when Razorpay retries. ~30s, then say so plainly. */
  async function settle(before) {
    setSettling(true);
    for (const wait of [1200, 1500, 2000, 2500, 3000, 4000, 5000, 5000, 5000]) {
      await new Promise(r => setTimeout(r, wait));
      const fresh = await apiClient.fetchMessageBalance().catch(() => null);
      if (fresh && fresh.balance !== before) { setData(fresh); setSettling(false); return; }
    }
    setSettling(false);
    setErr('Your payment went through. The messages can take a minute to arrive — reopen this screen shortly.');
  }

  if (err && !data) return <Shell><p style={s.err}>{err}</p></Shell>;
  if (!data)        return <Shell><p style={s.muted}>Loading…</p></Shell>;

  const { balance, packs = [], events = [], sender, sent } = data;
  // Buying is wired separately from this screen; until it is, say so rather than offering a control
  // that swallows the click.
  const canBuy = typeof apiClient.purchaseMessages === 'function';
  const perOrder = events.filter(e => enabled.has(e.slug)).reduce((n, e) => n + (e.messages ?? 1), 0);

  return (
    <Shell>
      {/* The principle, first and plainly. Everything below is downstream of it. */}
      <p style={s.lede}>
        <strong>Email updates are always free.</strong> SMS and WhatsApp are optional — Spattoo sends
        them to your customers for you, and they see <strong>{sender}</strong> as the sender with your
        bakery&rsquo;s name in the message.
      </p>
      <p style={s.lede}>
        Add your customer&rsquo;s email when you take an order and their updates cost you nothing.
      </p>

      <div style={{ ...s.balanceRow, flexDirection: narrow ? 'column' : 'row' }}>
        <div>
          <div style={s.balanceNum}>{balance.toLocaleString('en-IN')}</div>
          <div style={s.balanceLbl}>messages left</div>
          {sent?.last7Days > 0 && (
            <div style={s.usage}>{sent.last7Days} sent this week · {sent.last30Days} in 30 days</div>
          )}
        </div>
        {/* ⚠️ A TILE IS A BUTTON ONLY IF BUYING WORKS. Until the purchase flow lands these are a
            price list, not controls — a tile that looks pressable and does nothing is the worst of
            the three states, because the baker reads the silence as a broken payment. */}
        <div style={{ ...s.packs, justifyContent: narrow ? 'flex-start' : 'flex-end' }}>
          {packs.map(p => {
            const tile = (
              <>
                <span style={{ ...s.packMsgs, color: canBuy ? primaryColor : '#9CA3AF' }}>{p.messages}</span>
                <span style={s.packSub}>messages</span>
                <span style={s.packPrice}>{money(p.basePaise)} + GST</span>
              </>
            );
            return canBuy ? (
              <button key={p.packKey} type="button" disabled={!!buying || settling}
                      style={{ ...s.pack, borderColor: primaryColor,
                               opacity: buying && buying !== p.packKey ? 0.5 : 1 }}
                      onClick={() => buy(p.packKey)}>{tile}</button>
            ) : (
              <div key={p.packKey} style={{ ...s.pack, borderColor: '#E5E7EB', cursor: 'default' }}>{tile}</div>
            );
          })}
        </div>
      </div>

      {/* ⚠️ The running total, because the per-message price is not the number a baker is deciding
          with. "2 messages per order" is what tells them whether a pack lasts a month or a year. */}
      <p style={s.perOrder}>
        {perOrder === 0
          ? 'No paid updates — your customers hear from you by email only.'
          : <>About <strong>{perOrder} message{perOrder === 1 ? '' : 's'} per order</strong> with your current choices.</>}
      </p>

      <div style={s.list}>
        {events.map(e => {
          const on = enabled.has(e.slug);
          const shown = openPreview === e.slug;
          return (
            <div key={e.slug} style={s.row}>
              <div style={s.rowMain}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.rowTitle}>
                    {e.label}
                    {e.recommended && <span style={s.badge}>Recommended</span>}
                    {e.repeats && <span style={s.badgeWarn}>Can repeat</span>}
                  </div>
                  <div style={s.rowWhen}>{e.when}</div>
                  <button type="button" style={{ ...s.link, color: primaryColor }}
                          onClick={() => setOpenPreview(shown ? null : e.slug)}>
                    {shown ? 'Hide message' : 'See the message'}
                  </button>
                </div>
                <Toggle checked={on} onChange={() => toggle(e.slug)} />
              </div>

              {/* ⚠️ Warn, never block. Their bakery, their call — but a baker economising should know
                  which two the order actually depends on before switching one off. */}
              {!on && e.recommended && (
                <p style={s.warn}>
                  {e.slug === 'quote_issued_customer'
                    ? 'Your customers will not be told their quote is ready. You will need to tell them yourself.'
                    : 'Your customers will not be told their cake is ready.'}
                </p>
              )}

              {shown && (
                <div style={s.preview}>
                  <div style={s.previewFrom}>From <strong>{sender}</strong></div>
                  <div style={s.bubble}>
                    {e.body.split('\n').map((line, i) => (
                      <p key={i} style={{ margin: line ? '0 0 6px' : '0 0 10px' }}>{line}</p>
                    ))}
                    {e.button && <div style={s.previewBtn}>{e.button}</div>}
                  </div>
                  <div style={s.previewNote}>
                    Your bakery&rsquo;s name is real; the customer, price and date are examples.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!canBuy && packs.length > 0 && (
        <p style={s.muted}>Recharging is not switched on yet — these are the packs and what they will cost.</p>
      )}

      {settling && <p style={s.muted}>Payment received — waiting for your messages to arrive…</p>}
      {err && <p style={s.err}>{err}</p>}
      {saving && <p style={s.muted}>Saving…</p>}
    </Shell>
  );
}

function Shell({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>;
}

const s = {
  lede:       { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#444' },
  balanceRow: { display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', background: '#FAFCFB', borderRadius: 12, border: '1px solid #EEF2EF' },
  balanceNum: { fontSize: 28, fontWeight: 800, color: '#1a1a1a', lineHeight: 1 },
  balanceLbl: { fontSize: 12, color: '#888', marginTop: 2 },
  usage:      { fontSize: 11, color: '#9BB5A2', marginTop: 6 },
  packs:      { display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 },
  pack:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                padding: '8px 12px', borderRadius: 10, border: '1.5px solid', background: '#fff',
                cursor: 'pointer', minWidth: 84 },
  packMsgs:   { fontSize: 16, fontWeight: 800, lineHeight: 1.1 },
  packSub:    { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },
  packPrice:  { fontSize: 11, color: '#555', marginTop: 2 },
  perOrder:   { margin: 0, fontSize: 12, color: '#555' },
  list:       { display: 'flex', flexDirection: 'column', gap: 2 },
  row:        { padding: '12px 0', borderBottom: '1px solid #F3F4F6' },
  rowMain:    { display: 'flex', alignItems: 'flex-start', gap: 12 },
  rowTitle:   { fontSize: 13, fontWeight: 700, color: '#1a1a1a', display: 'flex',
                alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowWhen:    { fontSize: 11, color: '#888', marginTop: 2 },
  badge:      { fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                color: '#2C4433', background: '#E8F0EA', padding: '2px 6px', borderRadius: 4 },
  badgeWarn:  { fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                color: '#8A6D3B', background: '#FCF3E3', padding: '2px 6px', borderRadius: 4 },
  /* ⚠️ UNDERLINED, and lighter than the row title. At weight 700 with no underline this read as a
     third line of label — "Quote sent / As soon as you send a quote / See the message" scans as three
     headings, and the one control that opens the preview looked like text. The preview is what makes
     charging for these fair at all (see the note at the top of this file), so an affordance nobody
     recognises is not a styling detail. Caught by screenshotting it at 375px, not by reading it. */
  link:       { background: 'none', border: 'none', padding: '4px 0 0', fontSize: 11.5,
                fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                textDecoration: 'underline', textUnderlineOffset: 2 },
  warn:       { margin: '8px 0 0', fontSize: 11, color: '#8A6D3B', background: '#FCF3E3',
                padding: '6px 10px', borderRadius: 8 },
  preview:    { marginTop: 10 },
  previewFrom:{ fontSize: 10, color: '#888', marginBottom: 4 },
  bubble:     { background: '#E7FFDB', borderRadius: 12, padding: '10px 12px',
                fontSize: 12.5, lineHeight: 1.45, color: '#111', whiteSpace: 'pre-wrap' },
  previewBtn: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #C9E6BB', textAlign: 'center',
                fontSize: 12, fontWeight: 600, color: '#0A7CFF' },
  previewNote:{ fontSize: 10, color: '#9BB5A2', marginTop: 5 },
  muted:      { margin: 0, fontSize: 12, color: '#888' },
  err:        { margin: 0, fontSize: 12, color: '#B00020' },
};
