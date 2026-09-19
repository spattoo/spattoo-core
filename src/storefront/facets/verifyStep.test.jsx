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

/* ⚠️ COMMENTS DO NOT COUNT — three gates in this project have passed on a word that only ever
   appeared in prose explaining it. Every file here documents itself at length, so a match anywhere
   in the text proves nothing about what renders. */
/* ⚠️ BLOCK COMMENTS FIRST, THEN THE BRACES. Stripping `{/* … *​/}` as one unit BEFORE plain block
   comments looks tidier and is wrong: the lazy match runs from the first `{/*` to the first later
   `*​/}`, and every plain `/* … *​/` in between is inside that span — so one JSX comment near the top
   of a file silently deletes half of it. Measured here: the whole of VerifyStep from its first JSX
   comment onwards vanished, and an assertion about real code passed as "not present".
   Doing it the other way round leaves bare `{}` fragments, which match nothing and matter to nobody. */
const code = (f) => f
  .replace(/\/\*[\s\S]*?\*\//g, '')                             // block comments, JSX ones included
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');   // line comments

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
    // A default exists so the enquiry needs no props; assert the MECHANISM, not the wording, or
    // this fails every time the copy is improved.
    expect((src.match(/title \?\? /g) ?? []).length).toBeGreaterThanOrEqual(2);
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
    /* The sentence that does the actual work: it tells somebody at the designer door that nothing
       has gone to the baker yet. Matched on the durable half, not the pronoun. */
    expect(design).toMatch(/when you choose to send it/);
  });
});

describe('it is legible wherever it is mounted', () => {
  /* Standalone on the app, its parent is globals.css's `body { background: #111111 }`. Without its
     own ground it rendered dark grey on black — a gate nobody could read, so nobody could pass.
     The ground moved from `wrap` to `page` when the standalone chrome was added: `wrap` is now the
     shape it takes INSIDE FacetShell, where the sheet paints underneath it. */
  it('paints its own background rather than borrowing the host page', () => {
    const at = src.search(/^\s*page:\s*\{/m);
    const page = src.slice(at, at + 500);
    expect(page).toMatch(/background: ground/);
    // 100vh, not 100%: as a standalone gate the parent has no height, so a percentage collapsed to
    // the content and left a band of the app's black underneath it.
    expect(page).toMatch(/minHeight: '100vh'/);
    // The ground is derived from the baker's own colour, not a fixed white.
    expect(src).toMatch(/const ground = mix\(primary,/);
  });

  /* ⚠️ AND THE GROUND IS NOW OPT-IN, which is how the black-page bug could come back. `page` is only
     reached when the caller says `standalone` — a door that forgets it renders `wrap`, which has no
     ground and no height, on a body that is #111111. The two doors that ARE the whole page have to
     say so, and this is the only thing standing between that and a repeat of 2026-09-18. */
  it('is told it owns the page at both doors that are one', () => {
    const design = readFileSync(new URL('../../../../spattoo-web/apps/app/app/[slug]/design/DesignerClient.tsx', import.meta.url), 'utf8');
    const order  = readFileSync(new URL('../../../../spattoo-web/apps/app/app/[slug]/orders/[id]/OrderDetailClient.tsx', import.meta.url), 'utf8');
    for (const f of [design, order]) expect(code(f)).toMatch(/standalone\b/);
  });
});

describe('the channel the server chooses', () => {
  /* The order gate learns which contact the customer has from an endpoint, so `channels` is the
     baker's list on the first render and one channel a moment later. `channel` is seeded in a
     useState initialiser, which never re-reads — so the live dev gate asked for an email while
     `order-channel/... → {"channels":["sms"]}` sat in the network tab. */
  it('adopts a channel that arrives after the first render', () => {
    expect(code(src)).toMatch(/if \(!channels\.length \|\| channels\.includes\(channel\)\) return;/);
    // And only then: a tab the customer pressed themselves must not be overruled.
    expect(code(src)).toMatch(/const offered = channels\.join\('\|'\);/);
  });
});
