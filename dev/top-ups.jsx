import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TopUpsPanel from '../src/settings/TopUpsPanel.jsx';
import fixture from './customer-updates.fixture.json';

// ── Settings → Top-ups, in the states you cannot reach by using the app ──────────────────────────
//
// Settings is behind a baker login, so the only way to LOOK at this group — which is the only way
// to know it is right — is here.
//
//   ?credits=240&messages=110   both balances known (the normal case)
//   ?loading=1                  neither ever resolves — proves "not known" is not drawn as "0 left"
//   ?zero=1                     genuinely nothing left, which must look different from ?loading=1
//   ?nocredits=1                smart tools not wired — that row must not appear at all
//   ?nomessages=1               messages not wired — same
//   ?none=1                     neither wired — the whole card must disappear, not render empty
const q = new URLSearchParams(location.search);

const never = () => new Promise(() => {});          // never resolves, never rejects

const has = (flag) => q.get(flag) === '1';
const credits  = has('zero') ? 0 : Number(q.get('credits')  ?? 240);
const messages = has('zero') ? 0 : Number(q.get('messages') ?? 110);

const apiClient = {
  ...(has('nocredits') || has('none') ? {} : {
    fetchAiCredits: has('loading') ? never : async () => ({ spendable: credits, usedPct: 40 }),
  }),
  ...(has('nomessages') || has('none') ? {} : {
    fetchMessageBalance: has('loading') ? never : async () => ({ ...fixture, balance: messages }),
  }),
  saveMessageSettings: async (list) => ({ enabledTypes: list }),
  /* Enough of the billing endpoints for BuyCreditsPanel to open, so the WHOLE row-to-screen journey
     can be seen — including that the panel is headed the same as the row that opened it. */
  fetchAiCreditPacks: async () => ({ canBuy: true, packs: [
    { packKey: 'ai_200', credits: 200, basePaise: 19900, totalPaise: 23482 },
    { packKey: 'ai_500', credits: 500, basePaise: 44900, totalPaise: 52982 },
  ] }),
  fetchAiCreditHistory: async () => ({ rows: [] }),
};

function Harness() {
  /* The real destination, opened the way the Settings menu opens it — not the section on its own.
     `?closed=1` to see the button that opens it rather than the panel. */
  const [open, setOpen] = useState(!has('closed'));

  return (
    <div style={{ minHeight: '100vh', background: '#F4F8F5', padding: 20,
                  fontFamily: "'Quicksand', system-ui, sans-serif" }}>
      <button type="button" onClick={() => setOpen(true)}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #D8E4DB',
                       background: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
        Settings › Top-ups
      </button>
      <TopUpsPanel
        open={open}
        onClose={() => setOpen(false)}
        apiClient={apiClient}
        primaryColor="#2C4433"
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
