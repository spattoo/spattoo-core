import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── What the baker is shown before they are charged ─────────────────────────────────────────────
 *
 * Customer updates are OPT-IN and cost money, and the messages go out branded "Spattoo" rather than
 * the bakery's own name — which in this market cannot be changed (plans/whose-name-is-on-the-message
 * .md: an unregistered home baker has no route to a DLT header or a Meta display name).
 *
 * ⚠️ THAT IS ONLY FAIR IF THEY SAW IT FIRST. Charging someone to send a message carrying our brand is
 * defensible when they read the actual message, sender included, and chose to pay — and indefensible
 * when they did not. So the preview is not decoration, it is the thing that makes the feature
 * legitimate, and these pin the parts a redesign would quietly drop.
 */
const src = readFileSync(new URL('./CustomerUpdatesSection.jsx', import.meta.url), 'utf8');

describe('the preview', () => {
  it('shows who the message comes from', () => {
    expect(src).toMatch(/From <strong>\{sender\}<\/strong>/);
  });

  /* The body is rendered from the server's text, never from a copy in here. Two copies drift the
     first time one is reworded, and the version that matters is the one Meta approved. */
  it('renders the server\'s body rather than its own wording', () => {
    expect(src).toMatch(/e\.body\.split\('\\n'\)/);
    expect(src).not.toMatch(/has sent you a quote/);   // no template prose in the client
  });

  it('says which parts are real and which are samples', () => {
    expect(src).toMatch(/bakery&rsquo;s name is real; the customer, price and date are examples/);
  });
});

describe('the promise that nothing breaks without paying', () => {
  /* The lede is the feature, not a disclaimer: a baker who never recharges loses no functionality.
     It is what makes this an upgrade rather than a toll, and it goes FIRST. */
  it('leads with email being free', () => {
    expect(src).toMatch(/<strong>Email updates are always free\.<\/strong>/);
    expect(src.indexOf('Email updates are always free')).toBeLessThan(src.indexOf('messages left'));
  });

  it('tells the baker the free way to keep it free', () => {
    expect(src).toMatch(/Add your customer&rsquo;s email .* cost you nothing/);
  });

  it('reads zero choices as a complete answer, not an empty one', () => {
    expect(src).toMatch(/No paid updates — your customers hear from you by email only/);
  });
});

describe('the choices', () => {
  /* ⚠️ WARN, NEVER BLOCK. `quote_issued` and `order_ready` are the two where the order stalls if
     unseen, but it is the baker's bakery and their call — they just should not discover the
     consequence from a customer who never replied. */
  it('warns when a recommended message is switched off, and does not prevent it', () => {
    expect(src).toMatch(/!on && e\.recommended/);
    expect(src).toMatch(/will not be told their quote is ready/);
    expect(src).not.toMatch(/disabled=\{.*recommended/);
  });

  /* The per-message price is not what a baker decides with — "2 messages per order" is what says
     whether a pack lasts a month or a year. */
  it('totals the messages per order from what is ticked', () => {
    expect(src).toMatch(/events\.filter\(e => enabled\.has\(e\.slug\)\)\.reduce/);
    expect(src).toMatch(/message\{perOrder === 1 \? '' : 's'\} per order/);
  });

  /* ⚠️ A tile that looks pressable and does nothing is read as a failed payment. Until buying is
     wired the packs are a price list, and the screen says so. */
  it('only makes a pack pressable when buying actually works', () => {
    expect(src).toMatch(/const canBuy = typeof apiClient\.purchaseMessages === 'function'/);
    expect(src).toMatch(/canBuy \? \(\s*<button/);
    expect(src).toMatch(/Recharging is not switched on yet/);
  });

  /* A tick box that waits for a round trip feels broken — but a failed save must not leave the
     screen claiming something it did not store. */
  it('is optimistic, and puts the toggle back if the save fails', () => {
    expect(src).toMatch(/const before = data\.enabledTypes;/);
    expect(src).toMatch(/setData\(d => \(\{ \.\.\.d, enabledTypes: before \}\)\)/);
  });
});
