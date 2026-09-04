import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import XrayEdiblePrints from '../src/orders/xray/XrayEdiblePrints.jsx';

/* ── The edible-prints panel, without a login and without spending anything ──────────────────────
 *
 * The panel lives inside the X-Ray report, which is behind a sign-in and behind a real order with a
 * reference photo — so the only way to LOOK at it was to have all three. This gives it a stubbed
 * apiClient instead: the same shapes the real routes return, including the two cases that are easy
 * to get wrong and impossible to stage on demand.
 *
 *   a LICENSED character  — must be visible, unticked, unpressable, and say why BEFORE any spend
 *   an UNSURE candidate   — the fondant fence: shown, but unticked, because a wrong tick is money
 *
 * `s` is XrayReport's private style object. Copied rather than exported: this is a fixture, and
 * exporting a style bag so a harness can borrow it would make it API.
 */
const s = {
  sub:   { fontSize: 12, fontWeight: 800, color: '#555', letterSpacing: 0.3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 },
  dot:   (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
  card:  { background: '#fff', border: '1.5px solid #EFEAE3', borderRadius: 14, padding: 14 },
  muted: { fontSize: 12, color: '#9a958d' },
};

const CANDIDATES = [
  { index: 0, label: 'goose in a straw hat', material: 'edible_paper', looksPrinted: true,  blocked: false,
    prompt: 'a white goose wearing a straw boater and a green gingham bow', bbox: { x: .25, y: .39, w: .21, h: .18 } },
  { index: 1, label: '"Our little goose is on the way" plaque', material: 'edible_paper', looksPrinted: true, blocked: false,
    prompt: 'an ornate gold-outlined plaque', bbox: { x: .42, y: .41, w: .26, h: .12 } },
  { index: 2, label: 'white picket fence', material: 'fondant', looksPrinted: false, blocked: false,
    prompt: 'a white fondant picket fence', bbox: { x: .2, y: .62, w: .3, h: .1 } },
  { index: 3, label: 'Peppa Pig figure', material: 'edible_paper', looksPrinted: true, blocked: true,
    blockedReason: 'Licensed character or brand — Peppa Pig (Hasbro). This cannot be generated.',
    prompt: 'a cartoon pig', bbox: { x: .6, y: .5, w: .15, h: .15 } },
];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function App() {
  const [mode, setMode] = useState('normal');   // normal | empty | broke
  const api = {
    identifyEdiblePrints: async () => {
      await wait(600);
      return { ok: true, sourceKey: 'orders/reference/stub.jpg',
               prints: mode === 'empty' ? [] : CANDIDATES };
    },
    generateEdiblePrint: async (_id, payload) => {
      await wait(900);
      if (mode === 'broke') { const e = new Error('Not enough AI credits'); e.code = 'INSUFFICIENT_CREDITS'; throw e; }
      return { ok: true, cost: 16, upload: { id: 1, name: payload.label, storage_key: 'uploads/stub.png' } };
    },
  };
  const btn = (k, label) => (
    <button key={k} onClick={() => setMode(k)} style={{
      padding: '6px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
      fontWeight: 700, border: '1.5px solid #E0DDD8',
      background: mode === k ? '#2C2A26' : '#fff', color: mode === k ? '#fff' : '#555' }}>{label}</button>
  );
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>X-Ray — edible prints</h1>
        <p style={{ fontSize: 12, color: '#6E8577', marginTop: 4 }}>
          Stubbed API. Nothing is generated and no credits move. Press <b>Find the prints</b>.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {btn('normal', 'Four candidates')}{btn('empty', 'None found')}{btn('broke', 'Out of credits')}
      </div>
      {/* Remounted per mode so each is examined from a clean state rather than a stale one. */}
      <XrayEdiblePrints key={mode} orderId="stub-order" apiClient={api} s={s} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
