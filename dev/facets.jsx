import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FacetShell from '../src/storefront/facets/FacetShell.jsx';
import { Slice } from '../src/storefront/facets/CakeVisual.jsx';

// The shell with STUB doors — the point of this harness is the frame, the draft and the
// persistence, not the facets themselves. Each stub writes to the draft the way a real door will.
const BAKER = { name: 'Feelings & Flavours', slug: 'feelings-flavours',
                primary_color: '#2C4433', accent_color: '#6B8C74' };

const FLAVOURS = [
  { flavourId: 'f1', name: 'Belgian Dark', spongeColor: '#3B2415', fillingColor: '#23130B',
    tasteFamily: 'chocolate', crowdPleaser: false },
  { flavourId: 'f2', name: 'Red Velvet',   spongeColor: '#8E2436', fillingColor: '#F6F1E8',
    tasteFamily: 'classic', crowdPleaser: true, isSignature: true },
  { flavourId: 'f3', name: 'Matcha',       spongeColor: '#A9BE7B', fillingColor: '#CFE0B0',
    tasteFamily: 'tea', crowdPleaser: false },
  { flavourId: 'f4', name: 'Strawberry',   spongeColor: '#F5E6D3', fillingColor: '#E4626F',
    tasteFamily: 'fruit', crowdPleaser: true },
];

// The templates door is REAL now, so the stub declines to handle `design` and the shell falls
// through to it. The stub API mimics the public GET /api/storefront/:slug/templates.
const API = {
  fetchStorefrontTemplates: async () => {
    await new Promise(r => setTimeout(r, 350));   // so the loading state is visible
    return [
      { id: 't1', name: 'Two-tier Rosette', tier_count: 2, thumbnail_url: null },
      { id: 't2', name: 'Classic Round',    tier_count: 1, thumbnail_url: null },
      { id: 't3', name: 'Naked Berry',      tier_count: 1, thumbnail_url: null },
      { id: 't4', name: 'Chocolate Drip',   tier_count: 2, thumbnail_url: null },
      { id: 't5', name: 'Wedding Three',    tier_count: 3, thumbnail_url: null,
        attrs: { min_weight_kg: 3 } },
    ];
  },
  fetchStorefrontFlavours: async () => {
    await new Promise(r => setTimeout(r, 250));
    return FLAVOURS.map(f => ({ id: f.flavourId, name: f.name, source: 'global',
                                spongeColor: f.spongeColor, fillingColor: f.fillingColor,
                                tasteFamily: f.tasteFamily, crowdPleaser: f.crowdPleaser,
                                isSignature: f.isSignature, conflicts_with: f.conflicts_with ?? [] }));
  },
};

function Demo() {
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [sent, setSent] = useState(null);
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(true)}>Open</button>
        <button onClick={() => setMobile(m => !m)}>{mobile ? 'Mobile' : 'Desktop'}</button>
        <button onClick={() => { localStorage.clear(); location.reload(); }}>Clear draft</button>
      </div>
      <div style={{ maxWidth: 760 }}>
        <b>Slice, every seeded flavour:</b>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {FLAVOURS.map(f => <Slice key={f.flavourId} sponge={f.spongeColor} filling={f.fillingColor} height={120} />)}
          <Slice height={120} />
        </div>
        <div style={{ fontSize: 12, color: '#7A6C60', marginTop: 6 }}>last one = a flavour nobody has coloured yet</div>
        {sent && <pre style={{ marginTop: 14, fontSize: 11, background: '#fff', padding: 12, borderRadius: 8, overflow: 'auto' }}>{sent}</pre>}
      </div>
      {open && (
        <FacetShell baker={BAKER} isMobile={mobile} api={API} leadTimeDays={2}
          onClose={() => setOpen(false)}
          onSubmit={async (d) => {
            const m = await import('../src/storefront/facets/cakeDraft.js');
            const payload = m.toOrderPayload(d, BAKER.slug);
            setSent(JSON.stringify(payload, null, 2));
            // Mimics POST /api/orders: it refuses without a first name, so the failure path is
            // reachable here rather than only in production.
            if (!payload.customer.firstName) throw new Error('customer.firstName is required');
            await new Promise(r => setTimeout(r, 400));
            return { orderId: 'ord_demo' };
          }} />
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Demo />);
