import { StrictMode, useState } from 'react';
import { useNarrow } from '../src/shared/useNarrow.js';
import { createRoot } from 'react-dom/client';
import OrdersPanel from '../src/orders/OrdersPanel.jsx';
import { RAIL_OVER_PAGE_Z } from '../src/shared/rail.js';
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
    design_snapshot: { ...TALL_12KG, decorations: [{ elementId: 'e1' }, { elementId: 'e2' }] },
    flavours: [{ tier: 0, name: 'Blueberry' }],
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
    /* ⚠️ THE ONE WITH AN EMAIL. Every fixture here was phone-only, so the harness could only ever
       show the no-email notice and never its absence — and "it renders" would have been the
       whole test. A fixture set that can only produce one branch is not a fixture set. */
    customers: { first_name: 'asha', last_name: 'rao', phone: '9000000000',
                 email: 'asha@example.com' } },
];

const STATUSES = [
  { key: 'requested', label: 'Requested', phase: 'quote', sort_order: 20, tone: 'amber' },
  { key: 'quoted',    label: 'Quoted',    phase: 'quote', sort_order: 30, tone: 'blue'  },
];

const apiClient = {
  /* ⚠️ THREE STATES, AND THE THIRD IS THE TRAP. `?balance=` picks what the no-email notice reads:
       (none)  the balance never resolves — the notice must NOT say "0", it must say nothing about a
               number. TopUpsSection learned this first: an unknown balance rendered as zero tells a
               baker they have run out when we simply do not know.
       ?balance=0    empty — the loud case, "they will not be told anything".
       ?balance=240  healthy — the number is the answer to "am I covered?". */
  fetchMessageBalance: async () => {
    // Read here, not from the component's `q`: this object is module-level and `q` is not in scope.
    // The first version referenced it anyway, the call threw, the .catch swallowed it, and all three
    // states rendered identically — a harness agreeing with itself about nothing.
    const q = new URLSearchParams(location.search);
    const b = q.get('balance');
    if (b === null) return new Promise(() => {});      // never resolves: "not loaded"
    /* ⚠️ `enabledTypes` MATTERS AS MUCH AS THE BALANCE, and leaving it out of this stub made three of
       the notice's branches unreachable — an absent list reads as "WhatsApp switched off", so the
       harness could only ever produce that one. `?types=0` is the switched-off case; anything else
       is the baker's default two. */
    const types = q.get('types') === '0'
      ? []
      : ['quote_issued_customer', 'order_ready_customer'];
    return { balance: Number(b), enabledTypes: types };
  },
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
  /* ⚠️ "Print & cut-outs" is gated on the order HAVING something to cut — `CutoutLauncher` returns
   * null with no decoration ids and no edible prints — so without these two the button does not
   * exist and the sheet behind it is unreachable from here. That is how it came to be opened, by a
   * baker, from an order screen, with nobody having ever seen it beside the rail.
   *
   * The artwork is inline PNG rather than a URL: the sheet TRACES the alpha channel on a canvas, and
   * a cross-origin image taints it, so a remote picture would fail at getImageData and show an empty
   * outline that looks like a tracing bug. */
  fetchElements: async () => ([
    { id: 'e1', name: 'Blossom',  image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAB+ElEQVR4nO3Ry3FCMRAFUcJ0FA6XdOyCBRuK30Ojlu50V929NOd0MjMzMzMzM7PYzj+/f/Qb7EAXuNGj/9S6ClDB4QhUsYujIcUuikYTuigaSeiiaBShC6MhRC6KPr7QhdEHF7kw+tAiF0Ufd6XRFsOjD7riaJNh0YdcebTN19EH3GG00eHow+002urj6IPtONrs7ehD7Tza7mX0gRJGGz6NPk7CaMOH0YdJGm15F32QxNGmt+hDJI+2vUYfIXm0rbjJyPTHO03g8InbYAKHT9wGEzh84jaYwOETOHziNpjA4RM4fOI2mMDhEzh8AodP3AYTOHwCh0/g8AkcPoHDJ3D4BA6fwOETOHziNpjIwfsaV+C1J3D4BA6fwOETOHwCh0/g8AkcPoHDNwRY5DU3DFfgNSdw+AQO31BgkdfacFyB15rA4SsBFnmNleEKvMYEDl8psMjhuAI3ABY5HFfgBsAih+MK3ABY5HBckRvgXqKPkDza9hZ9iMTRpnfRB0kabfkw+jAJow2fRh8nYbThy+gD7Tza7u3oQ+042uzj6IPtNNrqcPThdhht9HX0AVcebTMs+pArjjYZHn3QlUZblEYfV9gJ0YcWd0L0wcWdFH18YSdEQ4g7KRpF2EnRSMJOikYTdmI0pKgTE7VZgto14czMzMzMzFr3D78xf7bvIjwlAAAAAElFTkSuQmCC' },
    { id: 'e2', name: 'Bunting',  image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAACJElEQVR4nO3RS05DQQwFUdbJiAWxZxCDIKSQz8tru+x2lXTn3T5vb2ZmZmZmZnd7//z4ot9gQf3gXka/xRb3F1fkzfoPV+RNuocrcvOewRW5aUdwRW7WK7giN+kMrsjFW4ErctFW4opcrAhckYsUiSsyXAauyFCZuCInR+CKnBSJK3JwNKzIgdGgIgdGQ4ocGA0ocmA0nMiB0WAiB0ZDiRwYDSRyYDSMyIHRICIHRkOIHBgNIHJg9OFFDow+uMiB0YcWOTD6wBVGG4RFH7bSaIvl0QetONpkWfQhK4+2OR19wA6jjV6OPlyn0VaHow/WcbTZ09GH6jza7mH0gXYYbXgz+jA7jba8ij7IjqNNf6MPsfNoW3F3RqY/PmniDpi4AybugIk7YOIOmLgDJu6AiTtg4g6YyBvvMK7IffYyrsj1dxpX5LpbhityvS3HFbnOwnBF5heOK/IAXJEH4Io8AFfkAbiX6EPsONr0KvogO422vBl9mB1GGz6MPlDn0XZPRx+q42izw9EH6zTa6uXow3UYbXQ6+oCVR9ssiz5kxdEmy6MPWmm0RVj0YSuMNgiPPrC4CdGHFjch+uDiJkQfXtyEaABxE6IhxE2IBhE3IRpG3IRoIHEToqHETYgGEzchGk7chGhAcROiIcVNiAYVNyEaVtyExB2QuAMSd0DiDkjcAYk7IHEHJO6AxB2QuAMSd0DiDkjcAYk7IHEHJK6ZmZmZne4b+CCuVtKV8moAAAAASUVORK5CYII=' },
  ]),
  fetchOrderEdiblePrints: async () => ({ prints: [] }),
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
    // The way through from the no-email notice. Present here so the button is exercised; a host
    // without it (admin) renders the notice with no link rather than a button that does nothing.
    onOpenMessageCredits: () => setClosed('onOpenMessageCredits — opened Message credits'),
  };

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Stand-in for the spatula rail. The leading control is judged against THIS. */}
      {/* ⚠️ THE REAL RANK, not a round number that looks tall enough. This said 400 and that is why
          the harness could not show the bug it was best placed to catch: the rail lifts to
          RAIL_OVER_PAGE_Z (315) over a docked page, and whether it paints over what the panel opens
          is decided by 315 against the DOCKED PAGE's 300 — a comparison a stand-in at 400 fakes the
          answer to in both directions. Print & cut-outs was reported covered by the rail in the
          real app while this harness showed it clear. */}
      {!isMobile && <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 76, zIndex: RAIL_OVER_PAGE_Z,
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
