import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The door a customer meets before they can see their own order ───────────────────────────────
 *
 * VerifyStep was written for ONE job: the enquiry, where a customer hands a design to a baker. The
 * order page now reuses it for a different one — somebody arrives from a WhatsApp button and has to
 * prove the address is theirs before the order will render.
 *
 * ⚠️ EVERY DEFECT PINNED HERE WAS FOUND BY OPENING THE PAGE, NOT BY READING IT. The suite was green
 * and the build was clean each time (2026-09-18, live 31-bakers storefront). They are pinned because
 * all three are invisible to a renderer that only ever sees the enquiry, and this is the first screen
 * a paid-for message delivers somebody to — it is the worst place in the product to be wrong.
 */
const src = readFileSync(new URL('./VerifyStep.jsx', import.meta.url), 'utf8');

describe('the name it says seven times', () => {
  /* It comes from /storefront/:slug/settings and both callers deliberately swallow a failed read.
     Undefined then reads "Who shall undefined ask for?" on a page reached from WhatsApp. */
  it('never renders an undefined baker', () => {
    expect(src).toMatch(/const bakerName = bakerNameProp \|\| 'the bakery'/);
  });
});

describe('the buttons name what pressing them does', () => {
  /* The enquiry really does send to the baker. The order door sends NOTHING — it opens the order.
     A customer told "Send to 31 Bakers" reasonably believes it will message the bakery. */
  it('takes the action name from the caller', () => {
    expect(src).toMatch(/submitLabel = null/);
    expect(src).toMatch(/const sendLabel = submitLabel \|\| `Send to \$\{bakerName\}`/);
  });

  it('leaves no hardcoded send wording in the markup', () => {
    // Code only: comments explain why this wording moved and are allowed to quote it. Drop the
    // one line allowed to SPELL it — the default — and no rendered line may say "Send to".
    const code = src.split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .filter(l => !l.includes('const sendLabel'))
      .join('\n');
    expect(code).not.toMatch(/Send to/);
    // and both buttons read from the one variable
    expect(code.match(/sendLabel/g) ?? []).toHaveLength(2);
  });

  /* `onBack` goes wherever the caller sends it — the shop front on the order route, which is not a
     cake and not anywhere the customer has been. */
  it('takes the back wording from the caller too', () => {
    expect(src).toMatch(/backLabel = 'Back to my cake'/);
    expect(src).not.toMatch(/>Back to my cake</);
    expect(src.match(/onClick=\{onBack\}>\{backLabel\}</g) ?? []).toHaveLength(2);
  });
});

describe('the words are true in the doorway they are used in', () => {
  /* ⚠️ "<baker> will be in touch about your cake" is TRUE at enquiry submit and false at the other
     two doors. At the designer door nothing has been sent, there is no cake yet, and the gate asks
     only because the designer cannot work without a session — every catalogue route behind it 401s.
     Promising a call in order to open a tool commits the baker to something nobody asked them about.
     Sandeep, 2026-09-19: "i came here to design the cake and the cake design is not ready yet." */
  it('takes its heading and reason from the caller', () => {
    expect(src).toMatch(/title = null, lede = null/);
    expect(src).toMatch(/title \?\? `Who shall \$\{bakerName\} ask for\?`/);
    expect(src).toMatch(/lede \?\? \(channel === 'email'/);
  });

  /* Only the FIRST screen is context-dependent. "Enter the code" and "We sent a 6-digit code to X"
     are true wherever this is used, so they are not overridable — one less thing a caller can get
     wrong. */
  it('does not let the code screen be renamed', () => {
    expect(src).toMatch(/: 'Enter the code'/);
    expect(src).toMatch(/We sent a 6-digit code to/);
  });

  // Both non-enquiry callers must actually pass copy, or the default promise reappears.
  it('is overridden at both doors that are not the enquiry', () => {
    const design = readFileSync(new URL('../../../../spattoo-web/apps/app/app/[slug]/design/DesignerClient.tsx', import.meta.url), 'utf8');
    const order  = readFileSync(new URL('../../../../spattoo-web/apps/app/app/[slug]/orders/[id]/OrderDetailClient.tsx', import.meta.url), 'utf8');
    for (const f of [design, order]) {
      expect(f).toMatch(/title="/);
      expect(f).toMatch(/lede=/);
    }
    expect(design).toMatch(/only sees your cake when you choose to send it/);
  });
});

describe('it is legible wherever it is mounted', () => {
  /* Standalone on the app, its parent is globals.css's `body { background: #111111 }`. Without its
     own ground it rendered dark grey on black — a gate nobody could read, so nobody could pass. */
  it('paints its own background rather than borrowing the host page', () => {
    const at = src.search(/^\s*wrap:\s*\{/m);
    const wrap = src.slice(at, at + 400);
    expect(wrap).toMatch(/background: '#FFFFFF'/);
    expect(wrap).toMatch(/color: '#1a1a1a'/);
    // 100vh, not 100%: as a standalone gate the parent has no height, so a percentage collapsed to
    // the content and left a band of the app's black underneath it.
    expect(wrap).toMatch(/minHeight: '100vh'/);
  });
});
