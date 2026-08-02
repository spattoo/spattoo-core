import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel, PanelBlock, ConfirmPanel, PANEL } from '../src/shared/Panel.jsx';
import ColorGuide from '../src/chefsdesk/ColorGuide.jsx';
import BuyCreditsPanel from '../src/billing/BuyCreditsPanel.jsx';

// ── Panel shell harness ─────────────────────────────────────────────────────────────────────────
// The twelve panels in this app each had their own overlay — five scrims, ten radii, z-indexes of
// 100 / 400 / 1000 / 3000 with no scale. shared/Panel.jsx is the single definition; this is where
// it gets looked at before another panel is converted to it.
//
// Not a mock of any one panel: it renders the SHELL with representative content, which is the part
// that is now shared. Toggle desktop/mobile to check the bottom-sheet, and the variants to check a
// panel with no header (a confirmation) and one with a pinned subhead (step dots, tabs).

const swatch = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 };

function Demo() {
  const [open, setOpen] = useState('form');
  const [isMobile, setIsMobile] = useState(false);
  const [wave, setWave] = useState(0);

  const btn = (on) => ({
    border: `1px solid ${on ? PANEL.ink : '#DED8CF'}`, background: on ? PANEL.ink : '#fff',
    color: on ? '#fff' : '#5b554c', borderRadius: 8, padding: '7px 12px', font: 'inherit',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{ fontFamily: "'Quicksand', sans-serif", padding: 24, minHeight: '100vh', background: '#E7E4DE' }}>
      <h1 style={{ fontSize: 16, margin: '0 0 4px' }}>Panel shell — shared/Panel.jsx</h1>
      <p style={{ fontSize: 12, color: '#8A857D', margin: '0 0 16px', maxWidth: 720, lineHeight: 1.5 }}>
        One scrim, one radius, one shadow, one z-scale. Centred on desktop, a bottom sheet with a
        drag handle on mobile — OrderModal's behaviour, which was the best in the app.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button style={btn(open === 'form')}    onClick={() => setOpen('form')}>With header + subhead + footer</button>
        <button style={btn(open === 'confirm')} onClick={() => setOpen('confirm')}>Confirmation (no header)</button>
        <button style={btn(open === 'plain')}   onClick={() => setOpen('plain')}>Header only</button>
        {/* The REAL converted components, not mock-ups of them — the shell is only proven by the
            panels that actually use it. ColorGuide is the densest one in the app. */}
        <button style={btn(open === 'confirmPanel')} onClick={() => setOpen('confirmPanel')}>ConfirmPanel (real)</button>
        <button style={btn(open === 'colorGuide')}   onClick={() => setOpen('colorGuide')}>ColorGuide (real)</button>
        <button style={btn(open === 'credits')}      onClick={() => setOpen('credits')}>Credits (real)</button>
        <button style={btn(isMobile)}           onClick={() => setIsMobile((m) => !m)}>
          {isMobile ? 'Mobile' : 'Desktop'}
        </button>
        <button style={btn(false)}              onClick={() => setWave((w) => (w + 1) % 3)}>
          Wave {wave + 1}/3
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: '#6b6459', lineHeight: 1.6, maxWidth: 720 }}>
        <b>Tokens.</b> scrim <code>{PANEL.scrim}</code> · radius {PANEL.radius} · ink{' '}
        <code>{PANEL.ink}</code> · tint <code>{PANEL.tint}</code> · line <code>{PANEL.line}</code>
        <div style={swatch}>
          {['ink', 'body', 'muted', 'tint', 'line', 'hair'].map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <i style={{ width: 16, height: 16, borderRadius: 4, background: PANEL[k], border: '1px solid #0001', display: 'inline-block' }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {open === 'form' && (
        <Panel
          onClose={() => setOpen(null)}
          isMobile={isMobile}
          wave={wave}
          width={360}
          title="New Order"
          subhead={
            <div style={{ display: 'flex' }}>
              {['Customer', 'Details', 'Delivery'].map((label, i) => (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: isMobile ? 30 : 24, height: isMobile ? 30 : 24, borderRadius: '50%',
                                background: i <= 1 ? PANEL.ink : '#D8DCD8', color: '#fff', fontWeight: 700,
                                fontSize: isMobile ? 13 : 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: isMobile ? 10 : 9, fontWeight: 700, letterSpacing: 0.5,
                                 textTransform: 'uppercase', color: i <= 1 ? PANEL.ink : PANEL.muted }}>{label}</span>
                </div>
              ))}
            </div>
          }
          footer={
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button style={{ padding: '12px 18px', borderRadius: 14, border: `1.5px solid ${PANEL.line}`,
                               background: '#fff', color: PANEL.body, fontWeight: 700, fontSize: 13,
                               font: 'inherit', cursor: 'pointer' }}>Back</button>
              <button style={{ flex: 1, padding: 12, borderRadius: 14, border: 'none', color: '#fff',
                               background: 'linear-gradient(135deg,#1a1a1a,#333)', fontWeight: 700,
                               fontSize: 13, font: 'inherit', cursor: 'pointer' }}>Next</button>
            </div>
          }
        >
          <PanelBlock>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: PANEL.ink }}>Reference photo</div>
                <div style={{ fontSize: 11, color: PANEL.muted, fontWeight: 600 }}>the picture the customer sent</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: PANEL.body }}>Add</span>
            </div>
          </PanelBlock>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: PANEL.body }}>Flavour</span>
            <input placeholder="— Select flavour —"
                   style={{ padding: '10px 12px', borderRadius: 12, border: '1.5px solid #d1d5db',
                            font: 'inherit', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: PANEL.body }}>Anything else?</span>
            <textarea rows={4} placeholder="Occasion, colours, a message on top…"
                      style={{ padding: '10px 12px', borderRadius: 12, border: '1.5px solid #d1d5db',
                               font: 'inherit', fontSize: 13, resize: 'vertical' }} />
          </label>
          <p style={{ fontSize: 12, color: PANEL.muted, lineHeight: 1.6, margin: 0 }}>
            Scroll me — the body scrolls while the header, the steps and the footer stay put.
            {' '}Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.
          </p>
        </Panel>
      )}

      {open === 'confirm' && (
        <Panel
          onClose={() => setOpen(null)}
          showClose={false}
          isMobile={isMobile}
          width={360}
          footer={
            <button style={{ width: '100%', padding: 12, borderRadius: 14, border: `1.5px solid ${PANEL.line}`,
                             background: 'transparent', color: PANEL.body, fontWeight: 700, fontSize: 13,
                             font: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(null)}>Done</button>
          }
        >
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                          background: 'rgba(44,68,51,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={PANEL.ink} strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: PANEL.ink, marginBottom: 8 }}>Order Placed!</div>
            <div style={{ fontSize: 12, color: PANEL.muted, lineHeight: 1.6 }}>
              Your order has been received.<br />We'll be in touch soon.
            </div>
          </div>
        </Panel>
      )}

      {open === 'plain' && (
        <Panel onClose={() => setOpen(null)} isMobile={isMobile} wave={wave} title="Update Design"
               subtitle="The customer will see this change">
          <p style={{ fontSize: 13, color: PANEL.body, lineHeight: 1.6, margin: 0 }}>
            A panel with a header and nothing else — no subhead, no footer.
          </p>
        </Panel>
      )}
      {open === 'confirmPanel' && (
        <ConfirmPanel
          isMobile={isMobile}
          title="Cancel your subscription?"
          message="You'll keep your plan until the end of the current period. After that your storefront goes offline and your templates stay saved."
          confirmLabel="Cancel subscription"
          cancelLabel="Keep subscription"
          danger
          onConfirm={() => setOpen(null)}
          onCancel={() => setOpen(null)}
        />
      )}

      {open === 'colorGuide' && <ColorGuide onClose={() => setOpen(null)} />}

      {/* The credits panel with a stubbed apiClient — enough to reach the loaded state. */}
      {open === 'credits' && (
        <BuyCreditsPanel
          open
          onClose={() => setOpen(null)}
          apiClient={{
            fetchAiCredits: async () => ({
              spendable: 1105, allowance: 800, allowanceLeft: 555, walletBalance: 550,
              resetsOn: '2026-09-01',
              actions: [
                { actionKey: 'xray_photo', label: 'X-Ray — read a cake photo', credits: 15 },
                { actionKey: 'xray_decor', label: 'X-Ray — how to make a decoration', credits: 20 },
              ],
            }),
            fetchAiCreditPacks: async () => ({ canBuy: true, ceiling: 2000, packs: [
              { packKey: 'small',  credits: 150,  label: 'Small top-up',  basePaise: 14900, gstPaise: 2682 },
              { packKey: 'medium', credits: 400,  label: 'Medium top-up', basePaise: 34900, gstPaise: 6282 },
              { packKey: 'large',  credits: 1000, label: 'Large top-up',  basePaise: 79900, gstPaise: 14382 },
            ] }),
            fetchAiCreditHistory: async () => ({ items: [], nextBefore: null }),
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
