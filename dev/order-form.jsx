import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OrderModal from '../src/orders/OrderModal.jsx';

/* ── The order form, against a stubbed API ────────────────────────────────────────────
 *
 * Built for the egg/eggless question, and it exists because THE STATES CANNOT BE REACHED
 * ANY OTHER WAY. Which egg options a customer sees is decided by `baker_dietary_exclusions`,
 * so "pure-veg bakery" and "egg-only bakery" are two rows in a table nobody has on their
 * machine — and the `egg` row itself does not exist in any database until migration 078 is
 * applied. Every one of those configurations would otherwise be first exercised in
 * production.
 *
 * ?bakery=both     both offered — a real question, and the step cannot be passed unanswered
 * ?bakery=eggless  a pure-veg kitchen: told, not asked, and nothing recorded on the order
 * ?bakery=egg      an egg-only kitchen
 * ?bakery=none     the baker switched both off — the question disappears entirely
 *
 * The payload the form would POST is printed down the right-hand side, because the point of
 * this change is WHAT GETS STORED — that "with egg" is no longer the absence of a row — and
 * a screenshot of chips cannot show that.
 */

const VOCAB = [
  { id: 7, key: 'egg',         label: 'With egg',    kind: 'diet',     sort_order: 5  },
  { id: 1, key: 'eggless',     label: 'Eggless',     kind: 'diet',     sort_order: 10 },
  { id: 2, key: 'vegan',       label: 'Vegan',       kind: 'diet',     sort_order: 20 },
  { id: 3, key: 'jain',        label: 'Jain',        kind: 'diet',     sort_order: 30 },
  { id: 4, key: 'nut_free',    label: 'Nut-free',    kind: 'allergen', sort_order: 40 },
  { id: 5, key: 'gluten_free', label: 'Gluten-free', kind: 'allergen', sort_order: 50 },
  { id: 6, key: 'dairy_free',  label: 'Dairy-free',  kind: 'allergen', sort_order: 60 },
];

// What each bakery has switched OFF. `offered: false` on a DIET row hides it; on an
// allergen it never does — which is the asymmetry the picker must keep.
const EXCLUDED = {
  both:    [],
  eggless: ['egg'],          // pure-veg: every cake here is eggless
  egg:     ['eggless'],      // egg-only
  none:    ['egg', 'eggless'],
};

function App() {
  const params  = new URLSearchParams(location.search);
  const bakery  = EXCLUDED[params.get('bakery')] ? params.get('bakery') : 'both';
  const off     = new Set(EXCLUDED[bakery]);
  const [payload, setPayload] = useState(null);

  const apiClient = {
    fetchDietaryRequirements: async () => VOCAB.map(r => ({ ...r, offered: !off.has(r.key) })),
    fetchFlavours: async () => ([
      { id: 'f1', name: 'Chocolate Truffle', conflicts_with: [] },
      { id: 'f2', name: 'Tiramisu',   conflicts_with: [{ key: 'eggless', declared_by: 'baker' }] },
      { id: 'f3', name: 'Hazelnut Praline', conflicts_with: [{ key: 'nut_free', declared_by: 'spattoo' }] },
    ]),
    fetchCustomers: async () => [],
    fetchUploadLimits: async () => ({ maxImageBytes: 5 * 1024 * 1024 }),
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <OrderModal
          key={bakery}
          tierCount={1}
          mode="customer"
          bakerSlug="demo"
          bakerName="Sweet Crumb"
          primaryColor="#3A4F46"
          onClose={() => {}}
          apiClient={apiClient}
          onSubmit={async (body) => { setPayload(body); return { orderId: 'demo' }; }}
        />
      </div>

      <aside style={{
        width: 340, flexShrink: 0, borderLeft: '1px solid #d8d3c8', background: '#fff',
        padding: 16, overflow: 'auto', fontSize: 12,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Bakery</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.keys(EXCLUDED).map(k => (
            <a key={k} href={`?bakery=${k}`} style={{
              padding: '6px 10px', borderRadius: 8, textDecoration: 'none', fontWeight: 700,
              border: `1.5px solid ${k === bakery ? '#3A4F46' : '#ccc'}`,
              color: k === bakery ? '#3A4F46' : '#666',
            }}>{k}</a>
          ))}
        </div>
        <div style={{ color: '#666', marginBottom: 16, lineHeight: 1.5 }}>
          Switched off: {EXCLUDED[bakery].length ? EXCLUDED[bakery].join(', ') : '(nothing)'}
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>Submitted payload</div>
        <pre style={{
          background: '#F6F5F2', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', fontSize: 11, lineHeight: 1.5,
        }}>{payload ? JSON.stringify(payload, null, 2) : 'Submit to see what would be stored.'}</pre>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
