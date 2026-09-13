import { StrictMode, useState } from 'react';
import { useNarrow } from '../src/shared/useNarrow.js';
import { createRoot } from 'react-dom/client';
import OrdersPanel from '../src/orders/OrdersPanel.jsx';
import CustomersPanel from '../src/customers/CustomersPanel.jsx';

/* ── The docked panels, and how you leave them ────────────────────────────────────────
 *
 * Orders and Customers dock beside the spatula rail and are reached only from inside the
 * designer, behind a login — so their top bar has never been checkable without an account
 * and a seeded database. That is exactly why it drifted: a back arrow that was really a
 * close button sat next to the rail for months.
 *
 * ?panel=orders|customers   which panel
 * ?from=rail|dashboard      dashboard = opened WITH an onBack, i.e. there is somewhere back
 *
 * The strip on the left is a stand-in for the spatula rail — it is what the leading control
 * has to be judged against, since the whole complaint was that a back arrow next to a
 * permanent navigation rail is meaningless.
 */

/* ⚠️ A DESIGNED order, so the X-Ray sheet is reachable here at all.
 *
 * Every other fixture is a photo/quote order with no `design_snapshot`, and the X-Ray button on
 * those needs an AI read and an API. So the tin plan — which tin, how tall, how many layers, how
 * many bakes and barrels — could not be looked at without an account and a real order, and it
 * shipped for a long time saying "2 layers, 1 filling" above a nine-inch cake because nobody
 * could see it. 12kg at the football cake's own proportions is the case that exposed it.
 */
const TALL_12KG = {
  tiers: [{ shape: 'round', radius: 1.2, height: 2.1, color: '#F1EEDC',
            frostingType: 'buttercream', frostingStyle: 'smooth' }],
};

const ORDERS = [
  { id: 'o0', status: 'confirmed', delivery_date: '2026-09-12', weight_kg: 12,
    design_snapshot: TALL_12KG, flavours: [{ tier: 0, name: 'Blueberry' }],
    dietary_requirements: [],
    customers: { first_name: 'Jay', last_name: 'test', phone: '9000000000' } },
  { id: 'o1', status: 'requested', delivery_date: '2026-08-29', weight_kg: 1,
    flavours: [{ tier: 0, name: 'Black Forest' }], dietary_requirements: [],
    customers: { first_name: 'daya', last_name: 'tammisetty', phone: '9177717190' } },
  { id: 'o2', status: 'requested', delivery_date: '2026-08-28', weight_kg: 2,
    flavours: [{ tier: 0, name: 'Black Currant' }],
    dietary_requirements: [{ key: 'eggless', label: 'Eggless', kind: 'diet' }],
    customers: { first_name: 'daya', last_name: 'tammisetty', phone: '9177717190' } },
  { id: 'o3', status: 'requested', delivery_date: '2026-08-27', weight_kg: 1.5,
    flavours: [{ tier: 0, name: 'Blueberry' }],
    // The egg answer must NOT reach this row — it is a choice, not a deviation.
    dietary_requirements: [{ key: 'egg', label: 'With egg', kind: 'diet' }],
    customers: { first_name: 'asha', last_name: 'rao', phone: '9000000000' } },
];

const STATUSES = [
  { key: 'requested', label: 'Requested', phase: 'quote', sort_order: 20, tone: 'amber' },
  { key: 'quoted',    label: 'Quoted',    phase: 'quote', sort_order: 30, tone: 'blue'  },
];

const apiClient = {
  fetchOrders:        async () => ORDERS,
  /* Its PRESENCE is what switches the List/Calendar strip on (`hasCalendar` tests for the function,
     not for a flag), so without it the harness silently could not reach that control at all — which
     is how a refactor of it went unverified until someone looked for the tab and it was not there. */
  fetchOrdersCalendar: async () => ORDERS.map(o => ({ id: o.id, needed_date: o.needed_date, status: o.status })),
  fetchOrderStatuses: async () => STATUSES,
  fetchCustomers:     async () => ORDERS.map((o, i) => ({
    id: `c${i}`, first_name: o.customers.first_name, last_name: o.customers.last_name,
    phone: o.customers.phone, email: null, is_active: true,
  })),
  fetchFlavours:      async () => [],
  /* Real-shaped flavour rows, because the X-Ray tin drawings colour their layers from these —
   * `spongeColor`/`fillingColor`, exactly as lib/flavourList.js resolves them. The catch-all Proxy
   * answers `{}`, which reads as "no flavours are coloured", so the one thing this fixture exists
   * to show — a Blueberry cake that looks like blueberry — was drawn in neutral cream. */
  fetchBakerFlavours: async () => ([
    { id: 'f1', name: 'Blueberry',    spongeColor: '#F2E7D2', fillingColor: '#4B3B78', conflicts_with: [] },
    { id: 'f2', name: 'Belgian Dark', spongeColor: '#4A3327', fillingColor: '#6B4A36', conflicts_with: [] },
    { id: 'f3', name: 'Lemon',        spongeColor: '#F6E7B0', fillingColor: '#E8C24A', conflicts_with: [] },
  ]),
  /* ⚠️ xray_reports ON, or the X-Ray button does not render and the sheet is unreachable here.
   * It was stubbed as `{}`, which reads as "no entitlement" — so the one screen this harness could
   * have shown without an account was the one it hid. */
  fetchEntitlements:  async () => ({ ent: { xray_reports: true } }),
  fetchOrderAudit:    async () => [],
};

function App() {
  const q       = new URLSearchParams(location.search);
  const which   = q.get('panel') === 'customers' ? 'customers' : 'orders';
  const fromDash = q.get('from') === 'dashboard';
  const [closed, setClosed] = useState(null);
  // The real rail is hidden on a phone (dockedLeft(isMobile) === 0), so the stand-in must be too —
  // otherwise it sits on top of the very control this harness exists to look at.
  const isMobile = useNarrow(600);

  const common = {
    open: true,
    apiClient,
    primaryColor: '#3A4F46',
    onClose: () => setClosed('onClose — dismissed'),
    // Non-null only when the panel was opened FROM somewhere, which is the only case a
    // back control is honest. Mirrors CakeDesigner, where it is set alongside a filter.
    onBack: fromDash ? () => setClosed('onBack — returned to Dashboard') : null,
  };

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Stand-in for the spatula rail. The leading control is judged against THIS. */}
      {!isMobile && <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 76, zIndex: 400,
        background: '#141815', color: '#9BB5A2', display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: 18, gap: 22, fontSize: 9, fontWeight: 700,
      }}>
        {['New Cake', 'Dashboard', 'Orders', 'Customers', 'Settings'].map(l => (
          <span key={l} style={{ textAlign: 'center', lineHeight: 1.4 }}>◻<br />{l}</span>
        ))}
      </div>}

      <div style={{ position: 'fixed', left: 90, bottom: 12, zIndex: 500, fontSize: 12 }}>
        {['orders', 'customers'].map(pn => ['rail', 'dashboard'].map(f => (
          <a key={pn + f} href={`?panel=${pn}&from=${f}`} style={{
            marginRight: 6, padding: '5px 9px', borderRadius: 8, background: '#fff',
            border: `1.5px solid ${which === pn && (f === 'dashboard') === fromDash ? '#3A4F46' : '#ccc'}`,
            textDecoration: 'none', color: '#333', fontWeight: 700,
          }}>{pn}/{f}</a>
        )))}
        {closed && <span style={{ marginLeft: 10, fontWeight: 700, color: '#3A4F46' }}>{closed}</span>}
      </div>

      {which === 'orders'
        ? <OrdersPanel {...common} onEditDesign={() => {}} onNewOrder={() => {}} />
        : <CustomersPanel {...common} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
