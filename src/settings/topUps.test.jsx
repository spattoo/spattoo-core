import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Top-ups: the two things a baker buys ────────────────────────────────────────────────────────
 *
 * Message credits used to be a `<Section>` sitting between "Orders & Delivery" and Privacy, which
 * made a purchase surface read as a sibling of Store Hours. It is not one. Top-ups is the group for
 * capacity that runs out, as opposed to configuration that does not.
 */
const src      = readFileSync(new URL('./TopUpsSection.jsx', import.meta.url), 'utf8');
const panel    = readFileSync(new URL('./SettingsPanel.jsx', import.meta.url), 'utf8');
const topPanel = readFileSync(new URL('./TopUpsPanel.jsx', import.meta.url), 'utf8');
const designer = readFileSync(new URL('../designer/CakeDesigner.jsx', import.meta.url), 'utf8');
const msgPanel = readFileSync(new URL('./MessageCreditsPanel.jsx', import.meta.url), 'utf8');
const buyPanel = readFileSync(new URL('../billing/BuyCreditsPanel.jsx', import.meta.url), 'utf8');

/* Comments explain why a name MOVED and are allowed to quote the one it moved from — the old label
   has to be nameable to say what changed. Only rendered code may not carry it. */
const codeOnly = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const code     = codeOnly(src);
const panelCode = codeOnly(panel);

describe('the names', () => {
  /* SUBSCRIPTION_TIERS.md: "Smart tools (BETA — name the JOB, never 'AI')". The pill, the billing
     card, the plan copy in migrations 048/051/055 and the marketing pricing table all already obey
     it; a new surface that said "AI credits" would be the only place in the product that did. */
  it('names the job, never the technology', () => {
    expect(src).toMatch(/Smart tool credits/);
    expect(code).not.toMatch(/AI credits/i);
  });

  /* A row saying "Smart tool credits" must not open a panel headed something else. The panel said
     "Credits", which named nothing and disagreed with the pill's own tooltip — harmless while the
     only way in was an unlabelled number, wrong the moment a labelled row pointed at it. */
  it('opens a panel headed the same as the row', () => {
    expect(buyPanel).toMatch(/title="Smart tool credits"/);
    expect(buyPanel).not.toMatch(/title="Credits"/);
  });

  /* Both rows are "<what it is for> credits". The pair was deliberately made the same shape so
     neither reads as a feature and both read as something spendable — "Customer messages" beside
     "Smart tool credits" mixed a deliverable with a currency. */
  it('gives both rows the same shape', () => {
    expect(src).toMatch(/Smart tool credits/);
    expect(src).toMatch(/Message credits/);
    expect(code).not.toMatch(/Customer messages/);
    expect(code).not.toMatch(/Customer updates/);
  });
});

describe('the balance on each row', () => {
  /* The credits pill works because it SHOWS the number. A menu row reading "Smart tool credits ›"
     with nothing beside it is strictly less useful than the pill it duplicates, which would leave
     the second entry point with no reason to exist. */
  it('shows how much is left', () => {
    expect(src).toMatch(/value != null/);            // drawn when known
    expect(src).toMatch(/left</);                    // and labelled
  });

  /* `null` is "not loaded yet". Rendering it as 0 tells a baker they have run out when we simply do
     not know, which is the one wrong answer that changes what they do next. */
  it('never draws "not known" as zero', () => {
    expect(src).toMatch(/value != null &&/);
    expect(code).not.toMatch(/value \?\? 0/);
  });

  // The pill re-reads on this bus; a row that did not would contradict the screen it just opened.
  it('re-reads when credits change', () => {
    expect(src).toMatch(/onCreditsChanged/);
  });
});

describe('a row is furniture only if its endpoint exists', () => {
  /* CreditsPill's rule: "if not wired the endpoint gets no furniture at all". A row that can show no
     balance and open no working screen reads as a broken feature rather than an absent one. */
  it('hides a row whose fetcher is missing, and the card when both are', () => {
    expect(src).toMatch(/typeof apiClient\?\.fetchAiCredits === 'function'/);
    expect(src).toMatch(/typeof apiClient\?\.fetchMessageBalance === 'function'/);
    expect(src).toMatch(/if \(!hasCredits && !hasMessages\) return null/);
  });
});

describe('what the rows open', () => {
  /* ⚠️ THE SAME BuyCreditsPanel THE PILL OPENS — a second mount, not a second screen. This is the
     rule that gets broken by writing something good: a fresh top-up screen here would look fine and
     drift from the real one within a release. */
  it('reuses the existing credits panel', () => {
    expect(topPanel).toMatch(/import BuyCreditsPanel from '\.\.\/billing\/BuyCreditsPanel\.jsx'/);
  });

  /* Both rows open a screen. Two adjacent rows that behave differently when tapped is worse than
     either choice alone — the baker learns what a row does from the first one they press. */
  it('opens a screen from both rows', () => {
    expect(topPanel).toMatch(/onOpenSmartTools=\{\(\) => setCreditsOpen\(true\)\}/);
    expect(topPanel).toMatch(/onOpenMessages=\{\(\) => setMessagesOpen\(true\)\}/);
  });

  /* Opened OVER settings rather than instead of it: a menu row that dismissed the menu it was
     tapped in would lose the baker their place. */
  it('leaves Top-ups open behind them', () => {
    expect(topPanel).not.toMatch(/setCreditsOpen\(true\);\s*onClose/);
    expect(topPanel).not.toMatch(/onOpenMessages=\{\(\) => \{[^}]*onClose/);
  });

  // The body is the existing section, wrapped — not a re-implementation of it.
  it('wraps the existing section rather than rebuilding it', () => {
    expect(msgPanel).toMatch(/import \{ CustomerUpdatesSection \}/);
    expect(msgPanel).toMatch(/<CustomerUpdatesSection/);
    expect(msgPanel).toMatch(/import \{ Panel \} from '\.\.\/shared\/Panel\.jsx'/);
  });
});

describe('it left the store settings', () => {
  /* ⚠️ TWICE. First as a <Section> among Store Hours and Orders & Delivery, then -- still wrong --
     as a <Section> at the top of the same panel, reachable only by opening Store Settings and
     scrolling. What a baker BUYS is not a detail of how their shop is configured. It is now its own
     destination on the Settings menu, beside Store Settings and Billing. */
  it('is not inside Store Settings at all', () => {
    expect(panelCode).not.toMatch(/<Section title="Top-ups">/);
    expect(panelCode).not.toMatch(/<Section title="Customer updates">/);
    expect(panelCode).not.toMatch(/<CustomerUpdatesSection/);
    expect(panelCode).not.toMatch(/<TopUpsSection/);
  });

  it('is a destination on the Settings menu', () => {
    expect(designer).toMatch(/id: 'topups', label: 'Top-ups'/);
    // Either capability: billing buys, customer:manage chooses which messages go out.
    expect(designer).toMatch(/hasCap\('billing:manage'\) \|\| hasCap\('customer:manage'\)/);
  });

  /* ⚠️ THE MEMO DEPS ARE NOT OPTIONAL. CakeDesigner says so itself: an omission here is silent and
     total -- the value arrives after mount, the memo never recomputes, and the entry can never
     appear however correct its gate is. That is how 'Record a reel' shipped invisible. */
  it('recomputes the menu when it opens', () => {
    expect(designer).toMatch(/billingPanelOpen, topUpsPanelOpen\]\)/);
  });

  /* Two render branches exist and only one is obvious. A panel mounted in one is a dead menu entry
     in the other. */
  it('is mounted in both render paths', () => {
    expect((designer.match(/<TopUpsPanel/g) ?? [])).toHaveLength(2);
  });

  // Going somewhere means leaving where you were.
  it('closes when the rail goes elsewhere', () => {
    expect(designer).toMatch(/setTopUpsPanelOpen\(false\);/);
  });
});
