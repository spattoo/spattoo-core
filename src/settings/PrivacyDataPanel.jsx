import { useState, useEffect, useCallback } from 'react';
import { Section, Field, Toggle } from './controls.jsx';

// Privacy & Data — the DPDP rights surface (Layer 3). Three blocks, all config-driven:
//   1. Your agreements   — the consent trail (accept/withdraw) + a downloadable copy.
//   2. Optional data uses — a withdraw toggle per OPTIONAL consent the baker still holds. Empty
//      until an optional doc is published; the list comes from /api/legal/current (required=false),
//      never a hardcoded doc allowlist.
//   3. Delete my account — the §12 erasure request (soft-delete now → scheduled erasure), with a
//      restore path while pending. Necessary ToS/Privacy can't be withdrawn while using the product,
//      so that lever lives here, not as a toggle above.
// Self-contained: owns its own fetches + actions (immediate, not part of "Save Settings").
const GREEN = '#2C4433';
const DANGER = '#B42318';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}

// Latest action per doc_key (history is newest-first, so first seen wins).
function latestByDoc(events) {
  const m = new Map();
  for (const e of events ?? []) if (!m.has(e.docKey)) m.set(e.docKey, e);
  return m;
}

export function PrivacyDataSection({ apiClient }) {
  const [loading, setLoading]   = useState(true);
  const [history, setHistory]   = useState([]);
  const [current, setCurrent]   = useState([]);
  const [deletion, setDeletion] = useState(null);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);   // the download said something — see download()
  const [reason, setReason]     = useState('');

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    return Promise.all([
      apiClient.fetchConsentHistory().catch(() => ({ events: [] })),
      apiClient.fetchLegalCurrent().catch(() => ({ documents: [] })),
      apiClient.fetchDeletionStatus().catch(() => null),
    ])
      .then(([h, c, d]) => {
        setHistory(h?.events ?? []);
        setCurrent(c?.documents ?? []);
        setDeletion(d ?? null);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const latest = latestByDoc(history);
  // Optional consents the baker currently HOLDS (latest event = accepted, doc is not required).
  const optionalHeld = (current ?? []).filter(
    d => d.required === false && latest.get(d.docKey)?.action === 'accepted',
  );

  async function withdraw(docKey) {
    setBusy(true); setErr(null);
    try { await apiClient.withdrawConsent([docKey]); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function requestDeletion() {
    setBusy(true); setErr(null);
    try { const d = await apiClient.requestAccountDeletion(reason || undefined); setDeletion(d); setConfirmOpen(false); setReason(''); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function restore() {
    setBusy(true); setErr(null);
    try { const d = await apiClient.restoreAccount(); setDeletion(d); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // ── Downloading the record ────────────────────────────────────────────────────────────────────
  // Reported as "I clicked it and nothing happened". Nothing visible DID happen: the browser saves
  // to Downloads without a dialog, and this handler said nothing at all — no toast, no state, no
  // change to the button. A silent success and a silent failure look identical, so the only
  // available reading is that it is broken.
  //
  // It now confirms, naming the file so somebody knows what to look for.
  function download() {
    try {
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), consent_events: history }, null, 2)],
        { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'spattoo-consent-record.json';
      document.body.appendChild(a); a.click(); a.remove();
      // Revoked on the NEXT tick, not the line after click(). Chrome usually starts the download
      // synchronously so the old code usually worked — "usually" being the problem. Revoking a
      // blob: URL the browser has not finished reading cancels the download, silently, which is
      // exactly the symptom being investigated here.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      // A failure has to say so. It is the whole point of the block above.
      setErr(e.message || 'Could not prepare the download.');
    }
  }

  const pending = deletion?.deletion_status === 'pending_erasure';

  if (loading) {
    return <Section title="Privacy & Data"><span style={{ fontSize: 13, color: '#888' }}>Loading…</span></Section>;
  }

  return (
    <>
      {err && (
        <div style={{ background: '#FEF3F2', border: '1px solid #FEcdCA', color: DANGER, borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          {err}
        </div>
      )}

      {/* 1. Your agreements */}
      <Section title="Your agreements">
        {history.length === 0 ? (
          <span style={{ fontSize: 13, color: '#888' }}>No agreements recorded yet.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase' }}>
                  {e.docKey} <span style={{ color: '#9CA3AF', fontWeight: 600 }}>v{e.version}</span>
                </span>
                <span style={{ color: e.action === 'withdrawn' ? DANGER : GREEN, fontWeight: 700 }}>
                  {e.action === 'withdrawn' ? 'Withdrawn' : 'Accepted'}
                </span>
                <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{fmtDate(e.at)}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={download} disabled={!history.length}
          style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${GREEN}`, background: '#fff', color: GREEN, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: history.length ? 'pointer' : 'not-allowed', opacity: history.length ? 1 : 0.5 }}>
          Download my record
        </button>
        {saved && (
          <span style={{ fontSize: 12.5, color: GREEN, fontWeight: 700 }}>
            Saved as spattoo-consent-record.json — check your downloads.
          </span>
        )}
      </Section>

      {/* 2. Optional data uses — only rendered when there's something to manage */}
      {optionalHeld.length > 0 && (
        <Section title="Optional data uses">
          {optionalHeld.map(d => (
            <Field key={d.docKey} label={d.docKey} hint="You can withdraw this consent at any time.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <Toggle checked={true} onChange={() => !busy && withdraw(d.docKey)} />
                <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>Active</span>
              </div>
            </Field>
          ))}
        </Section>
      )}

      {/* 3. Delete my account (danger zone) */}
      <Section title="Delete my account">
        {pending ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 13, color: DANGER, fontWeight: 700 }}>
              Your account is scheduled for erasure on {fmtDate(deletion.erase_after)}.
            </span>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              Your storefront is offline. Restore anytime before then to keep everything — after erasure this cannot be undone.
            </span>
            <button onClick={restore} disabled={busy}
              style={{ alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 10, border: 'none', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Restoring…' : 'Restore my account'}
            </button>
          </div>
        ) : !confirmOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              Requesting deletion takes your storefront offline immediately and schedules your personal data for erasure.
              Records we're legally required to keep (such as tax invoices) are retained for their statutory period.
            </span>
            <button onClick={() => setConfirmOpen(true)}
              style={{ alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${DANGER}`, background: '#fff', color: DANGER, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
              Delete my account
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#FEF3F2', border: `1px solid #FECDCA`, borderRadius: 12, padding: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: DANGER }}>Are you sure?</span>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              This takes your storefront offline now and schedules erasure. You can restore your account during the window.
            </span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="Reason (optional)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={requestDeletion} disabled={busy}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: DANGER, color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button onClick={() => { setConfirmOpen(false); setReason(''); }} disabled={busy}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #D1D5DB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          For anything else, contact our Grievance Officer.
        </span>
      </Section>
    </>
  );
}
