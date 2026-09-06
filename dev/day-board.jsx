import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OrdersCalendar from '../src/orders/OrdersCalendar.jsx';

/* ── The day board, against a stubbed API ────────────────────────────────────────────────────────
 *
 * It exists because the states that matter CANNOT BE REACHED any other way. The board's whole point
 * is the batch totals, and to see them you need a day carrying: the same flavour split across egg
 * and eggless, a tiered cake whose one weight has to be divided by volume, an order with no egg
 * answer at all, and an order with no weight yet. Nobody has that day in their database, and the
 * ones that would produce it are exactly the ones a real bakery gets on a bad Saturday.
 *
 *   ?phone=1   the phone layout — where TAP opens the board instead of the list
 *   ?day=N     which day of this month carries the orders (default: the 14th)
 *
 * The 2-tier order is the real one from dev — r=1.0 over r=0.72, both 0.7 high, 2 kg — because the
 * volume split is the one number here that is wrong by a third if you guess it.
 */

const q = new URLSearchParams(location.search);
const isMobile = q.get('phone') === '1';
const DAY = Number(q.get('day') || 14);

const now = new Date();
const iso = (d) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const BUSY = iso(DAY);
const QUIET = iso(Math.min(DAY + 3, 28));

const diet = (...keys) => keys.map(key => ({ key }));

const ORDERS = [
  { id: '1', weight_kg: 2, delivery_date: BUSY,
    customers: { first_name: 'Asha', last_name: 'Raman' },
    flavours: [{ name: 'Vanilla', tier: 0 }],
    dietary_requirements: diet('eggless') },
  { id: '2', weight_kg: 1.5, delivery_date: BUSY,
    customers: { first_name: 'Meera', last_name: 'Krishnan' },
    flavours: [{ name: 'Vanilla', tier: 0 }],
    dietary_requirements: diet('vegan') },                        // vegan counts as eggless
  { id: '3', weight_kg: 1, delivery_date: BUSY,
    customers: { first_name: 'Rohit', last_name: 'Sharma' },
    flavours: [{ name: 'Vanilla', tier: 0 }],
    dietary_requirements: diet('egg') },                          // same flavour, cannot share a bowl
  { id: '4', weight_kg: 2, delivery_date: BUSY,                   // the real two-tier order
    customers: { first_name: 'Priya', last_name: 'Nair' },
    flavours: [{ name: 'Litchi', tier: 0 }, { name: 'Blueberry', tier: 1 }],
    dietary_requirements: diet('egg'),
    design_snapshot: { tiers: [
      { shape: 'round', radius: 1, width: 2, depth: 2, height: 0.7 },
      { shape: 'round', radius: 0.72, width: 1.44, depth: 1.44, height: 0.7 },
    ] } },
  { id: '5', weight_kg: 1, delivery_date: BUSY,
    customers: { first_name: 'Sanjay' },
    flavours: [{ name: 'Chocolate', tier: 0 }],
    dietary_requirements: [] },                                   // nobody asked — the amber row
  { id: '6', weight_kg: null, delivery_date: BUSY,                // photo order, not priced yet
    customers: { email: 'walkin@example.com' },
    flavours: [{ name: 'Red velvet', tier: 0 }],
    dietary_requirements: diet('eggless') },
  { id: '7', weight_kg: 0.5, delivery_date: BUSY,
    customers: { first_name: 'Kavya', last_name: 'Iyer' },
    flavours: [{ name: 'Butterscotch', tier: 0 }],
    dietary_requirements: diet('eggless') },                      // the 7th — proves the +N more cap
  { id: '8', weight_kg: 1, delivery_date: QUIET,
    customers: { first_name: 'Dev' }, flavours: [{ name: 'Vanilla', tier: 0 }],
    dietary_requirements: diet('egg') },
];

const apiClient = {
  fetchOrdersCalendar: async () => [
    { date: BUSY,  count: ORDERS.filter(o => o.delivery_date === BUSY).length,  by_status: { pending: 4, confirmed: 3 } },
    { date: QUIET, count: 1, by_status: { confirmed: 1 } },
  ],
  /* ⚠️ THIS STUB MIMICS THE REAL ENDPOINT'S PARAMETERS, INCLUDING THE TRAP.
   *
   * The first version accepted `from` and matched it against delivery_date — which is not what
   * GET /api/orders does, and the difference cost a release. On the real endpoint `from`/`to`
   * filter `created_at`, so `{from: d, to: d}` asks for orders RAISED that day and returns an empty
   * array for a day whose cakes were ordered a fortnight ago. A 200 with no rows, on a board whose
   * empty state is a sentence rather than an error: it looked like a quiet day.
   *
   * A stub more permissive than the thing it stands in for cannot catch that. This one filters on
   * `delivery_date` ONLY, and honours from/to against created_at exactly as the API does — so the
   * same mistake reproduces here instead of in front of a baker.
   *
   * Deliberately slow, too: a board that flashes empty before it fills is a real defect, and an
   * instant stub hides it.
   */
  fetchOrders: async (params = {}) => {
    await new Promise(r => setTimeout(r, 450));
    let rows = ORDERS;
    if (params.delivery_date) rows = rows.filter(o => o.delivery_date === params.delivery_date);
    if (params.from) rows = rows.filter(o => (o.created_at ?? '') >= params.from);
    if (params.to)   rows = rows.filter(o => (o.created_at ?? '') <= params.to);
    return rows;
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', padding: isMobile ? 0 : 24 }}>
      <div style={{
        width: isMobile ? 390 : '100%', maxWidth: isMobile ? 390 : 1000, height: '100%',
        display: 'flex', flexDirection: 'column',
        background: '#fff', border: '1.5px solid #E8E4DC', borderRadius: isMobile ? 0 : 14, overflow: 'hidden',
      }}>
        <OrdersCalendar
          apiClient={apiClient}
          isMobile={isMobile}
          primaryColor="#2C4433"
          onPickDate={(d) => console.info('[day-board] View orders →', d)}
        />
      </div>
    </div>
  </StrictMode>,
);
