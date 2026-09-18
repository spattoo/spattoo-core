import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TopUpsSection } from '../src/settings/TopUpsSection.jsx';
import MessageCreditsPanel from '../src/settings/MessageCreditsPanel.jsx';
import BuyCreditsPanel from '../src/billing/BuyCreditsPanel.jsx';
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
  const [msgOpen, setMsgOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 20,
                  fontFamily: "'Quicksand', system-ui, sans-serif", background: '#F4F8F5', minHeight: '100vh' }}>
      {/* The same card chrome `Section` draws, so the rows are judged at the width and inset they
          will actually have rather than floating on a bare page. */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F3F4F6', fontSize: 11, fontWeight: 800,
                      letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2', background: '#FAFCFB',
                      borderRadius: '16px 16px 0 0' }}>Top-ups</div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <TopUpsSection
            apiClient={apiClient}
            primaryColor="#2C4433"
            onOpenSmartTools={() => setCreditsOpen(true)}
            onOpenMessages={() => setMsgOpen(true)}
          />
        </div>
      </div>

      <BuyCreditsPanel
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        apiClient={apiClient}
        primaryColor="#2C4433"
      />

      <MessageCreditsPanel
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        apiClient={apiClient}
        primaryColor="#2C4433"
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
