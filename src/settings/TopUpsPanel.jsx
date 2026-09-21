import { useState } from 'react';
import { Panel } from '../shared/Panel.jsx';
import { TopUpsSection } from './TopUpsSection.jsx';
import MessageCreditsPanel from './MessageCreditsPanel.jsx';
import BuyCreditsPanel from '../billing/BuyCreditsPanel.jsx';

/* ── Settings → Top-ups ──────────────────────────────────────────────────────────────────────────
 *
 * A destination of its own on the Settings menu, beside Store Settings, Flavours, Template
 * visibility and Billing.
 *
 * ⚠️ IT WAS INSIDE STORE SETTINGS, AND THAT WAS WRONG TWICE OVER. First as a `<Section>` among Store
 * Hours and Orders & Delivery, which made a purchase surface read as a store setting. Then — after
 * moving it — still only reachable by opening Store Settings and scrolling, which is the same fault
 * one level up: what a baker BUYS is not a detail of how their shop is configured, and it is not
 * found by hunting through a form they opened for something else.
 *
 * Sandeep asked for it "directly under settings" twice. The first time I read that as a top-level
 * Section inside the panel; he meant the MENU.
 *
 * ⚠️ IT OWNS BOTH ITS CHILDREN. The two rows open screens that already exist — BuyCreditsPanel (the
 * same one the credits pill opens) and CustomerUpdatesSection wrapped as MessageCreditsPanel —
 * rather than reimplementing either. They live here so the host needs one piece of state instead of
 * three, and so closing one returns to this menu rather than to whatever was behind it.
 */
/* `initialView` lands the panel straight on one of its two screens instead of the menu. Same prop
   name and shape as OrdersPanel's, deliberately — a second word for "open it here" is a second thing
   to learn. Used by the no-email notice on an order, which asks a question ("am I covered?") that is
   answered on the Message credits screen and nowhere else.
   ⚠️ Seeded, not controlled: pressing Back inside the panel must return to the Top-ups menu rather
   than snapping to wherever it was opened at. */
export default function TopUpsPanel({ open, onClose, apiClient, primaryColor = '#2C4433', isMobile = false,
                                      initialView = null }) {
  const [creditsOpen,  setCreditsOpen]  = useState(initialView === 'smart-tools');
  const [messagesOpen, setMessagesOpen] = useState(initialView === 'messages');

  return (
    <>
      <Panel
        open={open}
        onClose={onClose}
        isMobile={isMobile}
        width={420}
        bodyPadding={0}
        title="Top-ups"
        subtitle="What you have left, and what it costs to add more"
      >
        <div style={{ padding: '4px 18px 18px' }}>
          <TopUpsSection
            apiClient={apiClient}
            primaryColor={primaryColor}
            onOpenSmartTools={() => setCreditsOpen(true)}
            onOpenMessages={() => setMessagesOpen(true)}
          />
        </div>
      </Panel>

      {/* Rendered outside the Panel above so they survive it closing — and because a Panel's body is
          a scroller, not a place to mount another Panel. Both return null while shut. */}
      <BuyCreditsPanel
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
      />

      <MessageCreditsPanel
        open={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        apiClient={apiClient}
        primaryColor={primaryColor}
        isMobile={isMobile}
      />
    </>
  );
}
