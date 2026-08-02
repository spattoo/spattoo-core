import { useEffect, useState } from 'react';
import { creditsChanged } from './creditsBus.js';

// ── Buy credits ──────────────────────────────────────────────────────────────────────
// A screen about ONE thing: how many credits you have and how to get more.
//
// It exists because the top-up shelf used to live inside the Billing panel, and sending a baker
// there to buy credits put them in front of their subscription, their plan, their invoices and a
// change-plan button. Someone who wanted 400 credits was suddenly being asked to think about
// whether to upgrade — a much bigger, much scarier question, and not the one they had.
//
// Billing keeps the READOUT (balance, meter, what each tool costs) because that belongs beside the
// plan it comes with. Buying moved here. One shelf, in one place, so the two cannot drift.
export default function BuyCreditsPanel({ open, onClose, apiClient, primaryColor = '#3D5A44' }) {
  const [data, setData]   = useState(null);
  const [packs, setPacks] = useState([]);
  const [shelf, setShelf] = useState(null);
  const [busyPack, setBusy] = useState(null);
  const [err, setErr]     = useState(null);
  const [tick, setTick]   = useState(0);

  // ── After checkout ───────────────────────────────────────────────────────────────
  // Credits are minted by the payment WEBHOOK, so they do not exist the moment Checkout closes.
  // That gap is the whole design problem here: a baker has just paid, and the one thing they need
  // is to be told it worked.
  //
  // So the panel does NOT close. It becomes the confirmation — three honest states:
  //   'waiting'  paid, credits not here yet
  //   'done'     the balance actually moved, by how much
  //   'slow'     we stopped looking before they arrived
  //
  // It never auto-closes. A panel that vanishes by itself reads as a dismissal, and with unlucky
  // timing it disappears before the confirmation can be read.
  const [phase, setPhase] = useState(null);     // null | 'waiting' | 'done' | 'slow'
  const [gained, setGained] = useState(0);
  const [lastPaymentId, setLastPaymentId] = useState(null);

  useEffect(() => {
    if (!open || !apiClient?.fetchAiCredits) return;
    let alive = true;
    Promise.all([
      apiClient.fetchAiCredits().catch(() => null),
      apiClient.fetchAiCreditPacks ? apiClient.fetchAiCreditPacks().catch(() => null) : Promise.resolve(null),
    ]).then(([bal, pk]) => {
      if (!alive) return;
      setData(bal);
      setPacks(pk?.packs ?? []);
      setShelf(pk ? { canBuy: pk.canBuy, reason: pk.reason, ceiling: pk.ceiling, resetsOn: pk.resetsOn } : null);
    });
    return () => { alive = false; };
  }, [open, apiClient, tick]);

  if (!open) return null;

  async function buy(packKey) {
    setBusy(packKey); setErr(null);
    try {
      const d = await apiClient.purchaseAiCredits(packKey);
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      await new Promise(resolve => {
        // A one-time ORDER, not a subscription — order_id + amount, where a plan checkout passes
        // subscription_id. That is why this cannot reuse the plan checkout helper.
        const rzp = new window.Razorpay({
          key: d.key_id, order_id: d.order_id, amount: d.amount, currency: d.currency ?? 'INR',
          name: 'Spattoo', description: packs.find(p => p.packKey === packKey)?.label ?? 'Credits',
          theme: { color: primaryColor },
          handler: (resp) => {
            setLastPaymentId(resp?.razorpay_payment_id ?? null);
            resolve();
            // The balance BEFORE the purchase, captured here rather than read later: waiting until
            // after the first poll would race the webhook and could baseline against the new value.
            settle(data?.spendable ?? 0);
          },
          modal: { ondismiss: resolve },
        });
        rzp.open();
      });
    } catch (e) { setErr(e.message || 'Could not start the payment.'); }
    finally { setBusy(null); }
  }

  // Poll until the balance CHANGES, not merely until we have refetched.
  //
  // Comparing against the pre-purchase balance is what makes "arrived" a fact rather than a guess —
  // the old version re-read five times and assumed, so it could not tell success from silence and
  // showed the same screen for both.
  //
  // Backs off rather than hammering: a webhook is usually a second or two, occasionally much longer
  // when Razorpay retries. ~30s of looking, then say so plainly instead of pretending.
  async function settle(before) {
    setPhase('waiting');
    const waits = [1200, 1500, 2000, 2500, 3000, 4000, 5000, 5000, 5000];
    for (const wait of waits) {
      await new Promise(r => setTimeout(r, wait));
      const fresh = await apiClient.fetchAiCredits().catch(() => null);
      creditsChanged();                    // the header readout is a different component
      if (fresh) setData(fresh);
      const now = fresh?.spendable ?? before;
      if (now > before) {
        setGained(now - before);
        setPhase('done');
        return;
      }
    }
    // Not a failure, and must not be dressed as one — the payment is captured and the credits are
    // coming. But saying NOTHING here is the worst option: an unchanged balance with no explanation
    // is indistinguishable from having been charged for nothing.
    setPhase('slow');
  }

  // Reopening is a fresh visit: the last purchase's confirmation must not be the first thing a
  // baker sees three days later.
  function close() {
    setPhase(null); setGained(0); setLastPaymentId(null);
    setTick(t => t + 1);          // so the next open re-reads rather than showing a stale balance
    onClose?.();
  }

  const spendable = data?.unlimited ? null : (data?.spendable ?? 0);

  return (
    <div style={s.backdrop} onClick={close}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#2C4433' }}>Credits</div>
          <button type="button" onClick={close} style={s.close} aria-label="Close">×</button>
        </div>

        {/* The number first and large. It is the question that brought them here. */}
        <div style={s.balance}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#2C4433', fontVariantNumeric: 'tabular-nums' }}>
            {data?.unlimited ? 'Unlimited' : spendable}
          </div>
          {!data?.unlimited && (
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600 }}>
              credits to spend
              {data?.walletBalance > 0 && <> · {data.walletBalance} bought, never expire</>}
            </div>
          )}
        </div>

        {/* WHAT THEY BUY, before what they cost. A pack is meaningless without knowing what a
            credit does, and this is the one screen where someone is deciding to spend money. */}
        {(data?.actions ?? []).length > 0 && (
          <div style={s.priceList}>
            {data.actions.map(a => (
              <div key={a.actionKey} style={s.priceRow}>
                <span style={{ color: '#4A5D51', fontWeight: 600 }}>{a.label}</span>
                <span style={{ color: '#7C8B82', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {a.credits} credits
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Two gates, two different sentences. "Your plan doesn't include this" points at an
            upgrade; "you're already well stocked" points at nothing and must not read as refusal. */}
        {!phase && shelf && !shelf.canBuy && (
          <div style={s.note}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2C4433' }}>
              Your credits refresh on {formatResetDate(shelf.resetsOn)}
            </div>
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
              Blaze includes top-ups — add credits whenever you need them, and they never expire.
            </div>
          </div>
        )}

        {!phase && shelf?.canBuy && shelf.reason === 'stocked' && (
          <div style={s.note}>
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5 }}>
              <strong style={{ color: '#2C4433' }}>You’re well stocked.</strong> You can add more
              once your bought balance drops below {shelf.ceiling}.
            </div>
          </div>
        )}

        {/* ── After a payment ─────────────────────────────────────────────────────────
            Everything below stands in for the packs while a purchase is settling or has just
            settled. Buying again is not the next thing anyone wants here, and offering it beside
            an unconfirmed payment invites paying twice. */}
        {phase === 'waiting' && (
          <div style={s.note}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Payment received</div>
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
              Adding your credits… this usually takes a few seconds.
            </div>
          </div>
        )}

        {phase === 'done' && (
          <>
            {/* The number they bought, said back to them. The big balance above has already
                changed, but "it is bigger than it was" is not the same as being told it worked. */}
            <div style={{ ...s.note, borderColor: '#CFE3D5', background: '#F4FAF6' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>
                ✓ {gained} credits added
              </div>
              <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
                They never expire, and they are used only after your monthly credits run out.
              </div>
            </div>
            <button type="button" onClick={close}
              style={{ ...s.pack, justifyContent: 'center', cursor: 'pointer', background: primaryColor,
                       border: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
              Done
            </button>
          </>
        )}

        {/* Not an error, and must not be dressed as one — the payment IS captured. But an
            unchanged balance with no explanation is indistinguishable from having been charged
            for nothing, which is the single worst thing this screen could do. */}
        {phase === 'slow' && (
          <>
            <div style={s.note}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Payment received</div>
              <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
                Your credits are taking longer than usual to arrive. They are on their way — nothing
                is lost, and there is no need to pay again.
              </div>
              {/* The one handle they and we share if this has to be chased. */}
              {lastPaymentId && (
                <div style={{ fontSize: 10.5, color: '#B7C4BB', fontWeight: 600, marginTop: 6, userSelect: 'text' }}>
                  Payment {lastPaymentId}
                </div>
              )}
            </div>
            <button type="button" onClick={() => settle(spendable ?? 0)}
              style={{ ...s.pack, justifyContent: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Check again</span>
            </button>
          </>
        )}

        {!phase && shelf?.canBuy && packs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {/* Priced in CREDITS, never in jobs. The endpoint also returns `buys` (what a pack is
                worth in each tool) and it stays unused: "+20 decoration guides" would say the pack
                is FOR that one tool, when it spends anywhere. The price list above carries the same
                information without the false earmarking. */}
            {packs.map(p => (
              <button
                key={p.packKey} type="button" onClick={() => buy(p.packKey)}
                disabled={!!busyPack || p.blocked}
                title={p.blocked ? `Would take you over ${shelf?.ceiling} bought credits. Add this once your balance drops.` : undefined}
                style={{ ...s.pack, opacity: p.blocked ? 0.45 : (busyPack && busyPack !== p.packKey ? 0.5 : 1),
                         cursor: (busyPack || p.blocked) ? 'default' : 'pointer' }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#2C4433', fontVariantNumeric: 'tabular-nums' }}>
                    +{p.credits} credits
                  </div>
                  <div style={{ fontSize: 11.5, color: '#7C8B82', fontWeight: 600, marginTop: 2 }}>
                    {p.label} · never expires
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: primaryColor, fontVariantNumeric: 'tabular-nums' }}>
                  {busyPack === p.packKey ? 'Opening…' : formatMoney(p.pricePaise / 100)}
                </div>
              </button>
            ))}
            <span style={{ fontSize: 10.5, color: '#B7C4BB', fontWeight: 600 }}>Prices exclude GST.</span>
          </div>
        )}

        {err && <div style={{ fontSize: 12, fontWeight: 700, color: '#C0392B' }}>{err}</div>}

        {/* Deliberately at the bottom and understated. Someone here wants credits, not a plan
            conversation — but if the real answer IS a bigger plan, the door should not be hidden. */}
        <div style={{ fontSize: 11.5, color: '#B7C4BB', fontWeight: 600, lineHeight: 1.5 }}>
          Monthly credits come with your plan and reset each month. Credits you buy never expire and
          are only used once the monthly ones are gone.
        </div>
      </div>
    </div>
  );
}

const formatMoney = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const formatResetDate = (iso) => {
  if (!iso) return 'the 1st';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  } catch { return 'the 1st'; }
};

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(20,24,21,0.38)', zIndex: 3000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: 'min(420px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    background: '#fff', borderRadius: 16, padding: 18,
    display: 'flex', flexDirection: 'column', gap: 14,
    fontFamily: "'Quicksand', sans-serif", boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  close: {
    border: 'none', background: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1,
    color: '#9BB5A2', padding: 0, width: 28, height: 28,
  },
  balance: { display: 'flex', flexDirection: 'column', gap: 2 },
  priceList: {
    background: '#F7FAF8', border: '1px solid #E8EFE9', borderRadius: 11, padding: '11px 13px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  priceRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 },
  note: { background: '#F7FAF8', border: '1px solid #E8EFE9', borderRadius: 11, padding: '11px 13px' },
  pack: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    background: '#fff', border: '1.5px solid #E8EFE9', borderRadius: 12,
    padding: '13px 15px', fontFamily: 'inherit', textAlign: 'left', width: '100%',
  },
};
