import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FlavourFacet from '../src/storefront/facets/FlavourFacet.jsx';

/* The flavour suggester with a SEEDED draft — the state that produced the bug report.
 *
 * `recipient` is asked only inside this facet, written to the draft, and the draft is persisted for
 * seven days. So a customer who answered "a little one" last week opens the app today, is never
 * asked who it is for, and lands straight on the child-only celebration options. That state cannot
 * be reached by clicking through, which is exactly why it went unnoticed: reproducing it means
 * arriving with an answer you did not give in this session.
 *
 * ?recipient=child|adult|couple   what a previous visit left behind ('' = a first-time visitor)
 */
const FLAVOURS = [
  { id: 'f1', name: 'Chocolate Truffle', taste_family: 'chocolate', crowd_pleaser: 5, conflicts_with: [] },
  { id: 'f2', name: 'Vanilla Bean',      taste_family: 'vanilla',   crowd_pleaser: 5, conflicts_with: [] },
  { id: 'f3', name: 'Butterscotch',      taste_family: 'caramel',   crowd_pleaser: 4, conflicts_with: [] },
];

function App() {
  const q = new URLSearchParams(location.search);
  const seeded = q.get('recipient') ?? 'child';
  const [draft, setDraft] = useState({
    bakerSlug: 'demo',
    // `flavours` is a top-level array on the draft, not a detail — the facet reads .some/.map on it.
    flavours: [],
    details: { recipient: seeded, celebration: '', occasion: '', dietaryKeys: [], deliveryDate: '' },
  });
  const patch = (p) => setDraft(d => ({ ...d, ...p, details: { ...d.details, ...(p.details ?? {}) } }));

  return (
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
      {/* A phone-width column, since that is where the options run to the fold. */}
      <div style={{ width: 335, background: '#FFFDF8', borderRadius: 18, padding: 18, alignSelf: 'flex-start' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#9a9a9a', marginBottom: 10 }}>
          SEEDED recipient={seeded || '(none)'} —{' '}
          {['child','adult','couple',''].map(r => (
            <a key={r} href={`?recipient=${r}`} style={{ marginRight: 8 }}>{r || 'none'}</a>
          ))}
        </div>
        <FlavourFacet
          draft={draft} patch={patch} close={() => {}} bakerName="31 Bakers"
          setPreview={() => {}} facetBack={{ current: null }}
          api={{ fetchStorefrontFlavours: async () => FLAVOURS }}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
