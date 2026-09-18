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
  /* Was a "From Spattoo" caption, which STATED who it comes from and showed none of it. The chat
     header does the same job the way the customer will actually meet it — avatar, name, and the
     line WhatsApp shows for a number they have not saved. */
  it('shows who the message comes from', () => {
    expect(src).toMatch(/<div style=\{s\.chatName\}>\{sender\}<\/div>/);
    expect(src).toMatch(/style=\{s\.avatar\}/);
  });

  /* The body is rendered from the server's text, never from a copy in here. Two copies drift the
     first time one is reworded, and the version that matters is the one Meta approved.

     ⚠️ ASSERTS THE INTENT, NOT THE SPLIT. This pinned `e.body.split('\n')` exactly, and broke the
     moment the renderer learned that a single newline is a line break while a blank line is a
     paragraph — a fix that made the preview MORE faithful. A test that fails when the code gets
     better is testing the wrong thing. */
  it('renders the server\'s body rather than its own wording', () => {
    expect(src).toMatch(/e\.body\.split\(/);            // the server's text is what is rendered
    expect(src).not.toMatch(/has sent you a quote/);     // and no template prose lives in the client
    expect(src).not.toMatch(/has taken down your cake order/);
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

describe('the preview is a WhatsApp message, not a diagram of one', () => {
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  /* ⚠️ #E7FFDB IS THE WRONG SIDE OF THE CONVERSATION. It is WhatsApp's OUTGOING colour — what your
     own sent messages wear. Every message here is one the CUSTOMER receives, so it is an incoming
     bubble: white, left, tail on the left. The first version was green, which showed the baker
     their own sent message rather than the thing they are paying to have delivered. */
  it('draws an incoming bubble, not an outgoing one', () => {
    expect(code).not.toMatch(/#E7FFDB/i);
    expect(src).toMatch(/bubble:\s*\{\s*background: '#FFFFFF'/);
    expect(src).toMatch(/borderTopLeftRadius: 2/);        // the tail side
  });

  // Checked against a real message sent from our own number, not picked by eye.
  it('uses WhatsApp\'s own colours', () => {
    expect(src).toMatch(/#EFE7DE/);        // chat ground
    expect(src).toMatch(/#111B21/);        // body text
    expect(src).toMatch(/#667781/);        // timestamp
    expect(src).toMatch(/#00A884/);        // call to action
  });

  /* The picture is drawn ONLY where the template actually carries one — `image` comes from the
     server's list, which mirrors table A of plans/whatsapp-templates.md. Drawing a photo on a
     message that has none breaks the preview's promise exactly as badly as wrong words would. */
  it('shows a picture only where the template has one', () => {
    expect(src).toMatch(/\{e\.image && \(/);
    expect(src).toMatch(/fallbackImageUrl/);
    // and says so rather than inventing a photo when none is configured
    expect(src).toMatch(/Your customer&rsquo;s cake shows here/);
  });

  it('carries a clock and an arrowed call to action', () => {
    expect(src).toMatch(/sampleTime/);
    expect(src).toMatch(/toUpperCase\(\)/);               // "7:29 PM", not en-IN's "7:29 pm"
    expect(src).toMatch(/\{e\.button && \(/);
  });

  /* The customer has not saved this number, so WhatsApp really does say this. A baker paying to
     send under our name should see that it lands from someone their customer does not know. */
  it('does not hide that the sender is a stranger to the customer', () => {
    expect(src).toMatch(/tap to add to contacts/);
  });
});
