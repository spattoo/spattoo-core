import { Panel } from '../shared/Panel.jsx';
import { CustomerUpdatesSection } from './CustomerUpdatesSection.jsx';

/* ── Message credits, as a screen ────────────────────────────────────────────────────────────────
 *
 * The same section that used to sit inline in Settings, now behind a Top-ups row.
 *
 * ⚠️ WHY A PANEL AND NOT AN ACCORDION. Its neighbour in Top-ups — smart tool credits — opens
 * BuyCreditsPanel, a screen. Two adjacent rows that behave differently when tapped is a worse fault
 * than either choice is on its own: the baker learns what a row does from the first one they press.
 * So both open a screen, and both come BACK to Top-ups when closed, which is what a menu row
 * promises.
 *
 * The body is `CustomerUpdatesSection` unchanged — it already owns its own fetches, its own saves
 * and the purchase flow, and it was never part of "Save Settings". Wrapping is all that is needed;
 * nothing here re-implements any of it.
 */
export default function MessageCreditsPanel({ open, onClose, apiClient, primaryColor = '#2C4433', isMobile = false }) {
  return (
    <Panel
      open={open}
      onClose={onClose}
      isMobile={isMobile}
      /* Matched to BuyCreditsPanel (420 / 18), the row next to it in Top-ups. Two sibling screens
         reached from two adjacent rows should open at the same size; a wider one here to fit the
         four pack tiles on a single line would buy a tidier row and cost the pair looking related. */
      width={420}
      bodyPadding={18}
      title="Message credits"
      subtitle="What Spattoo sends your customers, and what it costs"
    >
      <CustomerUpdatesSection apiClient={apiClient} primaryColor={primaryColor} />
    </Panel>
  );
}
