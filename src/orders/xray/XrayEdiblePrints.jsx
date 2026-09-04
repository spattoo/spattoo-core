import { useState } from 'react';
import { creditsChanged } from '../../billing/creditsBus.js';

/* ── The edible prints on this cake, generated and sent to the print sheet ───────────────────────
 *
 * A customer sends a photo of a cake with a printed goose and a printed plaque on it. Without this
 * the baker leaves Spattoo, asks ChatGPT for a goose, prints it, and finds out at the bench whether
 * it was any good.
 *
 * ── WHY THIS IS TWO PRESSES AND NOT ONE ─────────────────────────────────────────────────────────
 * "Find the prints" is free — a second read of a photo this order already paid to read. "Make this
 * one" costs credits. Between them the baker ticks what is actually a print, because the picture
 * alone cannot tell a printed plaque from a fondant one (`decorationPolicy.js` says so, and that
 * ambiguity is why the `medium` column exists). One button that generated everything it thought it
 * saw would spend a baker's credits on a fondant fence.
 *
 * ── WHY NOTHING HAPPENS UNTIL IT IS ASKED ───────────────────────────────────────────────────────
 * Identify is free but not instant, and a report that fires an AI read on open would do it for every
 * order whether anyone wanted prints or not. The same reason the build guides sit behind a button.
 */
export default function XrayEdiblePrints({ orderId, apiClient, s }) {
  const [prints, setPrints] = useState(null);   // null = never asked
  const [ticked, setTicked] = useState({});     // index → bool
  const [busy, setBusy]   = useState(false);
  const [made, setMade]   = useState({});       // index → the upload row
  const [err, setErr]     = useState('');
  const [sourceKey, setSourceKey] = useState(null);

  // Without the API wired there is nothing to offer, and an inert button is worse than no button.
  if (!orderId || !apiClient?.identifyEdiblePrints) return null;

  async function find() {
    setBusy(true); setErr('');
    try {
      const res = await apiClient.identifyEdiblePrints(orderId);
      setSourceKey(res?.sourceKey ?? null);
      const rows = res?.prints ?? [];
      setPrints(rows);
      /* ⚠️ Only what the read was CONFIDENT about arrives ticked. A wrong tick spends real credits
       * on a fondant fence, and a baker who has to untick five things stops trusting the feature.
       * Being asked about two is a fair question. */
      // The server already excludes anything it warned about from `looksPrinted`, so this is one
      // question and not two. A warned row is offered, never pre-ticked.
      setTicked(Object.fromEntries(rows.map(p => [p.index, !!p.looksPrinted])));
    } catch (e) {
      setErr(e?.message || 'Could not read this photo.');
    } finally { setBusy(false); }
  }

  async function make(p) {
    setBusy(true); setErr('');
    try {
      const res = await apiClient.generateEdiblePrint(orderId, {
        sourceKey, bbox: p.bbox, prompt: p.prompt, label: p.label,
      });
      if (res?.upload) setMade(m => ({ ...m, [p.index]: res.upload }));
    } catch (e) {
      setErr(e?.code === 'INSUFFICIENT_CREDITS'
        ? "You've used this month's credits — open Billing for options."
        : (e?.message || 'Could not make that print.'));
    } finally {
      setBusy(false);
      // The balance moved, or a hold was released. Either way the card in Billing is now stale.
      creditsChanged();
    }
  }

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...s.sub, marginBottom: 0 }}>
          <span style={s.dot('#1B5FA8')} /> Edible prints
        </div>
        {prints === null && (
          <button type="button" onClick={find} disabled={busy}
                  title="Free — it re-reads the reference photo this order already has."
                  style={{ border: '1.5px solid #E0DDD8', background: busy ? '#F4F1EC' : '#fff', borderRadius: 9,
                    cursor: busy ? 'default' : 'pointer', padding: '6px 12px', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 700, color: '#555' }}>
            {busy ? 'Reading the photo…' : 'Find the prints'}
          </button>
        )}
      </div>

      <p style={{ ...s.muted, marginTop: 4 }}>
        Anything printed on icing sheet and cut out — a character, a plaque, a banner. Made here and
        saved to your uploads, so it is on the print sheet and yours to reuse.
      </p>

      {err && <div style={{ ...s.muted, color: '#B3261E', marginTop: 8 }}>{err}</div>}

      {prints?.length === 0 && (
        <div style={{ ...s.muted, marginTop: 8 }}>Nothing on this cake looks like an edible print.</div>
      )}

      {prints?.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prints.map(p => (
            <label key={p.index}
                   style={{ display: 'flex', alignItems: 'flex-start', gap: 9,
                            padding: '2px 0', cursor: 'pointer' }}>
              <input type="checkbox" disabled={!!made[p.index]}
                     checked={!!ticked[p.index]}
                     onChange={e => setTicked(t => ({ ...t, [p.index]: e.target.checked }))}
                     style={{ marginTop: 3 }} />
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{p.label}</span>
                {p.material && <span style={s.muted}>  ·  {p.material.replace(/_/g, ' ')}</span>}
                {/* ⚠️ A WARNING, not a bar. It used to disable the row, and on a real cake that
                    stopped a plain baby-shower goose the model had read as "Little Goose
                    illustration" — the cake's own wording mistaken for a title. The baker knows
                    whether it is Peppa Pig or their own goose; the image service refuses genuine
                    licensed work at its output stage, and a refusal releases the hold, so an attempt
                    costs nothing. Shown, never pre-ticked. */}
                {p.ipWarning && (
                  <div style={{ ...s.muted, color: '#B26B00' }}>{p.ipWarning}</div>
                )}
                {made[p.index] && (
                  <div style={{ ...s.muted, color: '#2C4433' }}>
                    Made — it is in your uploads as “{made[p.index].name}”.
                  </div>
                )}
              </span>
              {/* ⚠️ The button sits ON the row it acts on (INVARIANTS #11). It was a separate list
                  underneath, which meant reading a label, finding it again in a second list, and
                  pressing a button that had to repeat the label to say which one it was — and a
                  label that already contains quotation marks then read as Make ""a plaque"". The
                  control and the thing it changes belong in the same place. */}
              {ticked[p.index] && !made[p.index] && (
                <button type="button" onClick={(e) => { e.preventDefault(); make(p); }} disabled={busy}
                        style={{ border: '1.5px solid #E0DDD8', background: busy ? '#F4F1EC' : '#fff',
                          borderRadius: 9, cursor: busy ? 'default' : 'pointer', padding: '5px 11px',
                          fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#555', flexShrink: 0 }}
                        /* The cost is stated before it is spent, the way the build-guide button
                           states its own. A baker should never press something metered blind. */
                        title="Costs credits. Makes one print and saves it to your uploads, yours to reuse.">
                  {busy ? 'Making…' : 'Make it'}
                </button>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
