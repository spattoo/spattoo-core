import { createRoot } from 'react-dom/client';
import { CustomerUpdatesSection } from '../src/settings/CustomerUpdatesSection.jsx';
import fixture from './customer-updates.fixture.json';

// ── Settings → Customer updates, in the states you cannot reach by using the app ─────────────────
//
// ⚠️ THE FIXTURE IS A REAL RESPONSE, captured from GET /api/baker/message-balance against dev (the
// packs are the rows 098 seeded, the event bodies are the server's own text with a real bakery name
// substituted). A harness fed hand-written data proves the component renders SOMETHING; one fed the
// server's actual shape proves it renders THIS.
//
//   ?balance=0        no messages left — the empty state a baker starts in
//   ?balance=223      partway through a pack
//   ?none=1           nothing ticked — "your customers hear from you by email only"
//   ?all=1            everything ticked, to see the per-order total climb
//   ?buy=1            buying wired, so the packs become real buttons
//   ?slow=1           a save that takes a second, to watch the optimistic toggle
//   ?fail=1           a save that fails, which must put the toggle back
const q = new URLSearchParams(location.search);

const data = structuredClone(fixture);
if (q.has('balance')) data.balance = Number(q.get('balance'));
if (q.get('none') === '1') data.enabledTypes = [];
if (q.get('all')  === '1') data.enabledTypes = data.events.map(e => e.slug);
if (q.has('sent')) data.sent = { last7Days: Number(q.get('sent')), last30Days: Number(q.get('sent')) * 4 };

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const apiClient = {
  fetchMessageBalance: async () => data,
  saveMessageSettings: async (list) => {
    if (q.get('slow') === '1') await wait(1000);
    if (q.get('fail') === '1') throw new Error('That did not save. Please try again.');
    data.enabledTypes = list;
    return { enabledTypes: list };
  },
  // Absent unless asked for: the packs must render as a price list when buying is not wired, and
  // that is the state the app is actually in today.
  ...(q.get('buy') === '1' ? { purchaseMessages: (k) => console.log('buy', k) } : {}),
};

createRoot(document.getElementById('root')).render(
  <div style={{ maxWidth: 560, margin: '0 auto', padding: 20, fontFamily: 'system-ui, sans-serif', background: '#F5F7F5', minHeight: '100vh' }}>
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #F3F4F6', fontSize: 11, fontWeight: 800,
                    letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2', background: '#FAFCFB',
                    borderRadius: '16px 16px 0 0' }}>Customer updates</div>
      <div style={{ padding: 20 }}>
        <CustomerUpdatesSection apiClient={apiClient} primaryColor="#2C4433" />
      </div>
    </div>
  </div>
);
