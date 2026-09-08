import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import XrayTinSection from '../src/orders/xray/XrayTinSection.jsx';
import { tinOptions } from '../src/orders/xray/tinHelper.js';

/* ── The tin comparison, on every shape of order that matters ────────────────────────────────────
 *
 * The X-Ray sheet is behind a login and needs a real order, so this row could not be looked at
 * while it was being drawn — which is how its predecessor shipped saying "2 layers, 1 filling"
 * above a nine-inch cake. Every case that has bitten is here: a 1kg where the tin barely matters,
 * a 12kg where it decides whether the cake is carryable, and the small two-tier where the step
 * rule runs out of tins.
 *
 * ?w=<kg> and ?tiers=1|2 to poke at anything else.
 */
const P = new URLSearchParams(location.search);
const round = (r, h) => ({ shape: 'round', radius: r, height: h });
const ONE = [round(1.2, 1.9)];
const TWO = [round(1.2, 1.6), round(0.85, 1.45)];

const CASES = P.get('w')
  ? [[Number(P.get('w')), P.get('tiers') === '2' ? TWO : ONE, `${P.get('w')}kg`]]
  : [
      [1,   ONE, '1 kg · one tier'],
      [3,   ONE, '3 kg · one tier — the anchor cake'],
      [12,  ONE, '12 kg · one tier — the reported one'],
      [1.5, TWO, '1.5 kg · two tiers — where the step rule runs out'],
      [5,   TWO, '5 kg · two tiers'],
    ];

const FLAV = { sponge: '#E8D9BE', filling: '#F6EFE2' };

function Row({ kg, tiers, label }) {
  const [picked, setPicked] = useState(null);
  const options = tinOptions(tiers, kg);
  // ONE ruler across the row, or the drawings cannot be compared by eye — which is the whole point.
  const ruler = Math.max(...options.map(o => o.tiers[0].tinInch), 1);
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>{label}</h2>
      <p style={{ fontSize: 12, color: '#6B8C74', margin: '0 0 14px' }}>
        {options.length} buildable option{options.length === 1 ? '' : 's'}
      </p>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {options.map(o => (
          <button key={o.key} onClick={() => setPicked(o.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            padding: '14px 12px 12px', borderRadius: 14, cursor: 'pointer', background: '#fff',
            border: picked === o.key ? '2px solid #2C4433' : '1.5px solid #E4DFD4',
            fontFamily: 'inherit',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 190 }}>
              <XrayTinSection tiers={o.tiers.map(t => ({ ...t, ...FLAV }))} ruler={ruler}
                              width={128} id={`${kg}-${o.key}`} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{o.tiers.map(t => `${t.tinInch}″`).join(' + ')}</div>
            <div style={{ fontSize: 11.5, color: '#6B8C74' }}>{o.totalIn}″ tall</div>
            <div style={{ fontSize: 11, color: '#8a8578' }}>
              {o.tiers.map(t => t.layers).join('+')} layers · {o.tiers.map(t => t.weightKg).join('+')} kg
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 28, maxWidth: 1180 }}>
    <h1 style={{ fontSize: 20, margin: '0 0 22px' }}>Tin comparison</h1>
    {CASES.map(([kg, tiers, label]) => <Row key={label} kg={kg} tiers={tiers} label={label} />)}
  </div>,
);
