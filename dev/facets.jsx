import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FacetShell from '../src/storefront/facets/FacetShell.jsx';
import { Slice } from '../src/storefront/facets/CakeVisual.jsx';

// The shell with STUB doors — the point of this harness is the frame, the draft and the
// persistence, not the facets themselves. Each stub writes to the draft the way a real door will.
const BAKER = { name: 'Feelings & Flavours', slug: 'feelings-flavours',
                primary_color: '#2C4433', accent_color: '#6B8C74' };

const FLAVOURS = [
  { flavourId: 'f1', name: 'Belgian Dark', spongeColor: '#3B2415', fillingColor: '#23130B' },
  { flavourId: 'f2', name: 'Red Velvet',   spongeColor: '#8E2436', fillingColor: '#F6F1E8' },
  { flavourId: 'f3', name: 'Matcha',       spongeColor: '#A9BE7B', fillingColor: '#CFE0B0' },
  { flavourId: 'f4', name: 'Strawberry',   spongeColor: '#F5E6D3', fillingColor: '#E4626F' },
];

function stubDoor({ facet, draft, patch, close }) {
  const btn = { padding: '13px 16px', borderRadius: 12, border: '1.5px solid #E7DFD5',
                background: '#fff', font: 'inherit', fontSize: 14, fontWeight: 700,
                color: '#2A241F', cursor: 'pointer', textAlign: 'left' };

  if (facet === 'design') return (
    <>
      {[["I'm in a hurry — show me your designs", 'template'],
        ["I've got a cake photo for reference", 'photo'],
        ["I'm feeling creative — let me build it myself in 3D", 'designed']].map(([label, kind]) => (
        <button key={kind} style={btn} onClick={() => { patch({ design: { kind } }); close(); }}>{label}</button>
      ))}
    </>
  );

  if (facet === 'flavour') return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6C60' }}>I know my flavour</div>
      {FLAVOURS.map(f => (
        <button key={f.flavourId} style={btn} onClick={() => {
          patch({ flavours: draft.flavours.map((t, i) => i === 0 ? { ...t, ...f, source: 'global' } : t) });
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 5,
                           background: f.spongeColor, border: '1px solid rgba(0,0,0,.12)' }} />
            {f.name}
          </span>
        </button>
      ))}
      <button style={{ ...btn, borderStyle: 'dashed' }} onClick={close}>I can't decide — help me pick</button>
    </>
  );

  if (facet === 'size') return (
    <>
      {[10, 20, 40, 70].map(n => (
        <button key={n} style={btn} onClick={() => { patch({ size: { servings: n, weightKg: n / 8 } }); close(); }}>
          About {n} people
        </button>
      ))}
    </>
  );

  return (
    <>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6C60' }}>When do you need it?</label>
      <input type="date" value={draft.details.deliveryDate}
             onChange={e => patch({ details: { deliveryDate: e.target.value } })}
             style={{ padding: '12px 14px', borderRadius: 12, border: '1.5px solid #E7DFD5', font: 'inherit' }} />
      <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6C60', marginTop: 6 }}>Your phone</label>
      <input value={draft.contact.phone} placeholder="So {baker} can reach you"
             onChange={e => patch({ contact: { phone: e.target.value } })}
             style={{ padding: '12px 14px', borderRadius: 12, border: '1.5px solid #E7DFD5', font: 'inherit' }} />
      <button style={{ ...btn, marginTop: 6 }} onClick={close}>Done</button>
    </>
  );
}

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
        <FacetShell baker={BAKER} isMobile={mobile} renderFacet={stubDoor}
          onClose={() => setOpen(false)}
          onSubmit={(d) => { import('../src/storefront/facets/cakeDraft.js').then(m => setSent(JSON.stringify(m.toOrderPayload(d), null, 2))); setOpen(false); }} />
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Demo />);
