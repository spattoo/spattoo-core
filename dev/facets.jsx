import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FacetShell from '../src/storefront/facets/FacetShell.jsx';
import { Slice } from '../src/storefront/facets/CakeVisual.jsx';

// The shell with STUB doors — the point of this harness is the frame, the draft and the
// persistence, not the facets themselves. Each stub writes to the draft the way a real door will.
const BAKER = { name: 'Feelings & Flavours', slug: 'feelings-flavours',
                primary_color: '#2C4433', accent_color: '#6B8C74' };

// Ten, not the four this started with. A real baker's list is long — that is the whole reason the
// suggester exists — and at four the suggester could show the top pick plus two runners-up and have
// almost nothing left over, so "everything else Feelings & Flavours makes" never rendered here.
// `f10` carries a conflict so the dietary exclusion is visible rather than theoretical, and two are
// left without a tasteFamily because real catalogues have those: they score nothing and must still
// be reachable in the full list.
const FLAVOURS = [
  { flavourId: 'f1', name: 'Belgian Dark', spongeColor: '#3B2415', fillingColor: '#23130B',
    tasteFamily: 'chocolate', crowdPleaser: false },
  { flavourId: 'f2', name: 'Red Velvet',   spongeColor: '#8E2436', fillingColor: '#F6F1E8',
    tasteFamily: 'classic', crowdPleaser: true, isSignature: true },
  { flavourId: 'f3', name: 'Matcha',       spongeColor: '#A9BE7B', fillingColor: '#CFE0B0',
    tasteFamily: 'tea', crowdPleaser: false },
  { flavourId: 'f4', name: 'Strawberry',   spongeColor: '#F5E6D3', fillingColor: '#E4626F',
    tasteFamily: 'fruit', crowdPleaser: true },
  { flavourId: 'f5', name: 'Salted Caramel', spongeColor: '#D9A566', fillingColor: '#8A5A22',
    tasteFamily: 'caramel', crowdPleaser: true },
  { flavourId: 'f6', name: 'Vanilla Bean', spongeColor: '#F6EEDC', fillingColor: '#EADFC4',
    tasteFamily: 'classic', crowdPleaser: true },
  { flavourId: 'f7', name: 'Mango',        spongeColor: '#F7E3A1', fillingColor: '#F0A93B',
    tasteFamily: 'fruit', crowdPleaser: true },
  { flavourId: 'f8', name: 'Coffee Walnut', spongeColor: '#6B4A32', fillingColor: '#C7A17A',
    tasteFamily: 'coffee', crowdPleaser: false },
  { flavourId: 'f9', name: 'Pineapple',    spongeColor: '#F6F0D8', fillingColor: '#EBD98A' },
  { flavourId: 'f10', name: 'Rasmalai',    spongeColor: '#F3E7CE', fillingColor: '#E8D9A8',
    tasteFamily: 'indian', crowdPleaser: false, conflicts_with: ['eggless'] },
  // Named for the HINT path: "they already like Biscoff, and this is it" only fires when the baker
  // actually makes it, and that is the case worth being able to see.
  { flavourId: 'f11', name: 'Biscoff Crunch', spongeColor: '#C9A46B', fillingColor: '#B98A4E',
    tasteFamily: 'caramel', crowdPleaser: true },
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

// Stub the two OTP endpoints so the verification step can be DRIVEN here, not merely rendered.
// The real ones need Supabase phone auth and an actual SMS; what this harness has to prove is the
// wiring — that a code moves the step on, that the session reaches onSubmit, and that a bad code
// surfaces instead of hanging. `000000` is the wrong-code path.
const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/send-otp')) {
    await new Promise(r => setTimeout(r, 300));
    const { to } = JSON.parse(init.body);
    if (!/^\+?\d[\d\s-]{7,}$/.test(to)) {
      return new Response(JSON.stringify({ error: 'Enter a valid phone number' }), { status: 400 });
    }
    return new Response(JSON.stringify({ sent: true, channel: 'sms', to }), { status: 200 });
  }
  if (u.includes('/sign-reference-upload')) {
    await new Promise(r => setTimeout(r, 200));
    const { contentType, contentLength } = JSON.parse(init.body);
    window.__uploads = window.__uploads || [];
    window.__uploads.push({ contentType, contentLength });
    return new Response(JSON.stringify({
      key: `orders/reference/stub-${window.__uploads.length}.webp`,
      url: 'https://stub.r2.invalid/put',
    }), { status: 200 });
  }
  if (u.startsWith('https://stub.r2.invalid/put')) {
    await new Promise(r => setTimeout(r, 150));
    return new Response('', { status: 200 });
  }
  if (u.includes('/verify-otp')) {
    await new Promise(r => setTimeout(r, 300));
    const { code } = JSON.parse(init.body);
    if (code === '000000') {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), { status: 401 });
    }
    return new Response(JSON.stringify({
      session: { access_token: 'stub-access-token', refresh_token: 'stub-refresh', expires_at: 0 },
      verified: { channel: 'sms', to: '+919876543210' },
    }), { status: 200 });
  }
  return realFetch(url, init);
};

function Demo() {
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [sent, setSent] = useState(null);
  // Mirrors STOREFRONT_OTP_REQUIRED on the API, which the real storefront reads back from
  // /settings. Toggled here so the suppressed path is drivable, not merely reasoned about.
  const [otpRequired, setOtpRequired] = useState(true);
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(true)}>Open</button>
        <button onClick={() => setMobile(m => !m)}>{mobile ? 'Mobile' : 'Desktop'}</button>
        <button onClick={() => { localStorage.clear(); location.reload(); }}>Clear draft</button>
        <button onClick={() => setOtpRequired(v => !v)}>OTP {otpRequired ? 'required' : 'SUPPRESSED'}</button>
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
          apiBaseUrl="" captchaSiteKey={null} otpRequired={otpRequired}
          onClose={() => setOpen(false)}
          onSubmit={async (d, session) => {
            const m = await import('../src/storefront/facets/cakeDraft.js');
            const payload = m.toOrderPayload(d, BAKER.slug);
            // The token is shown alongside the payload because it is what carries the VERIFIED
            // contact — an enquiry that arrives without it is one the baker cannot trust.
            setSent(`Authorization: Bearer ${session?.access_token ?? '(none — unverified!)'}\n\n`
                    + JSON.stringify(payload, null, 2));
            // Lets the retry-after-failure path be driven: the session must survive so the second
            // attempt does not ask for another code.
            if (window.__failFirstSubmit) {
              window.__failFirstSubmit = false;
              throw new Error('Could not send that just now.');
            }
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
