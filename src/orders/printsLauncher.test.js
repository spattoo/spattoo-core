import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./OrdersPanel.jsx', import.meta.url), 'utf8');

// ── The wiring, pinned as source ────────────────────────────────────────────────────────────────
// The launcher's own gate was always right — `if (!ids.length && !prints.length) return null` — and
// the API has linked the print to the order since migration 086. What was wrong is that `prints`
// was read ONCE, in an effect keyed on `[order?.id, apiClient]`, and neither of those changes when
// a baker makes a print inside a takeover rendered above this component.
//
// Asserted as text because the alternative is mounting OrdersPanel with a stubbed client, a design,
// an order and a portal — a lot of scaffolding to prove one subscription exists.
describe('Print & cut-outs refreshes when a print is made', () => {
  it('subscribes to the edible prints bus', () => {
    expect(src).toMatch(/onEdiblePrintsChanged\(/);
  });

  it('re-runs the SAME fetch on the event, not a different one', () => {
    // A listener that set state without re-reading would trust a client-assembled row, and
    // `image_url` is composed by the API from the storage key — it is not on the generate response.
    expect(src).toMatch(/const load = \(\) => Promise\.resolve\(apiClient\?\.fetchOrderEdiblePrints/);
    expect(src).toMatch(/onEdiblePrintsChanged\(load\)/);
  });

  it('opens the sheet on request, and loads before it does', () => {
    // The sheet takes `prints` as a prop, so opening on the event alone would show an empty sheet
    // whenever the fetch had not returned — which is exactly this case, a print made a moment ago.
    const handler = src.slice(src.indexOf('onOpenPrintSheet(async'), src.indexOf('return () => { alive'));
    expect(handler).toMatch(/await load\(\)/);
    expect(handler).toMatch(/setOpen\(true\)/);
  });

  it('opens RAISED when the request came from inside X-Ray', () => {
    /* ⚠️ The z and what dismissing returns to are ONE decision. The sheet is a Z.panel dialog when
       opened from order details; opened from X-Ray it must paint at Z.overStudio, because a 1000
       dialog inside a 4000 takeover renders underneath it — which is why the button used to close
       X-Ray first. Raised also means back lands in X-Ray rather than two steps away. */
    const handler = src.slice(src.indexOf('onOpenPrintSheet(async'), src.indexOf('return () => { alive'));
    expect(handler).toMatch(/setRaised\(true\)/);
    expect(src).toMatch(/z=\{raised \? Z\.overStudio : Z\.panel\}/);
    // …and cleared on close, or the next plain open would paint over a takeover that is not there.
    expect(src).toMatch(/setOpen\(false\); setRaised\(false\);/);
  });

  it('detaches EVERY listener on unmount, and still cancels the in-flight fetch', () => {
    // ⚠️ All three halves. An early version returned only the unsubscribe and dropped
    // `alive = false`, which leaves a resolved fetch setting state on an unmounted component; the
    // second subscription then made it easy to detach one listener and forget the other.
    const cleanup = src.match(/return \(\) => \{[^}]*\};/g)?.find(c => c.includes('alive = false'));
    expect(cleanup, 'a cleanup that clears the alive flag').toBeTruthy();
    expect(cleanup).toMatch(/off\(\)/);      // the data-changed listener
    expect(cleanup).toMatch(/offOpen\(\)/);  // the open-request listener
  });
});

/* ── The name on this button is quoted in a prompt in another repo ───────────────────────────────
 *
 * ⚠️ IF YOU RENAME IT, THE BUILD GUIDE STARTS LYING. `spattoo-api`'s build-guide prompt
 * (src/services/openai.js) tells the model, when a decoration needs a paper template, to add a tip
 * saying the outline *"can be printed at the size it needs from the order's \"Print & cut-outs\"
 * sheet"* — with that name kept exact, because it is a real button.
 *
 * That text is then PERSISTED: the guide lives in `orders.xray_spec`, so every order generated
 * before a rename keeps pointing at a button that no longer exists, and regenerating costs a
 * credit. This is the hazard `check:plan-copy` exists for in the API — two surfaces stating the
 * same thing, one of them going stale quietly — and the second copy is here, in another repo,
 * where no gate can see it.
 *
 * The label has already been through one rename debate (see the note above IconAction: "Print &
 * cut-outs" → "Cut-outs" was considered and rejected), so this is not hypothetical.
 */
describe('the launcher label is quoted by the build-guide prompt', () => {
  it('still reads exactly "Print & cut-outs"', () => {
    expect(src).toMatch(/label="Print & cut-outs"/);
  });

  it('says where the other copy is, so a rename finds it', () => {
    // The pointer is the comment above; this asserts the comment itself has not been deleted.
    expect(src).toMatch(/Print & cut-outs/);
  });
});
