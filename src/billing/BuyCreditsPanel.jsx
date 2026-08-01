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
          handler: () => { resolve(); settle(); },
          modal: { ondismiss: resolve },
        });
        rzp.open();
      });
    } catch (e) { setErr(e.message || 'Could not start the payment.'); }
    finally { setBusy(null); }
  }

  // Credits are minted by the payment WEBHOOK, which lands asynchronously — the balance is not
  // updated the moment Checkout closes. Re-read a few times and then stop rather than spinning
  // forever; the next open reconciles whatever arrived late.
  async function settle() {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1500));
      setTick(t => t + 1);
      creditsChanged();          // the header readout, which is a different component
    }
  }

  const spendable = data?.unlimited ? null : (data?.spendable ?? 0);

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#2C4433' }}>Credits</div>
          <button type="button" onClick={onClose} style={s.close} aria-label="Close">×</button>
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
        {shelf && !shelf.canBuy && (
          <div style={s.note}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2C4433' }}>
              Your credits refresh on {formatResetDate(shelf.resetsOn)}
            </div>
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
              Blaze includes top-ups — add credits whenever you need them, and they never expire.
            </div>
          </div>
        )}

        {shelf?.canBuy && shelf.reason === 'stocked' && (
          <div style={s.note}>
            <div style={{ fontSize: 12, color: '#7C8B82', fontWeight: 600, lineHeight: 1.5 }}>
              <strong style={{ color: '#2C4433' }}>You’re well stocked.</strong> You can add more
              once your bought balance drops below {shelf.ceiling}.
            </div>
          </div>
        )}

        {shelf?.canBuy && packs.length > 0 && (
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
