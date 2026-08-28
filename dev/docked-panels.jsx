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

const ORDERS = [
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
  fetchOrderStatuses: async () => STATUSES,
  fetchCustomers:     async () => ORDERS.map((o, i) => ({
    id: `c${i}`, first_name: o.customers.first_name, last_name: o.customers.last_name,
    phone: o.customers.phone, email: null, is_active: true,
  })),
  fetchFlavours:      async () => [],
  fetchEntitlements:  async () => ({}),
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
