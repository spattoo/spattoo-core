import { useState } from 'react';
import CustomerSearch from './CustomerSearch.jsx';

// InvitePanel — baker tool to invite a customer to a design session. Right-side
// slide-in panel matching CustomersPanel/OrdersPanel. Calls apiClient.inviteCustomer
// (POST /api/baker/customers/invite): upserts the customer + mints an invite link.
// Two modes: invite a NEW customer (fill details) or an EXISTING one (search + pick).
// For an existing customer we pass their details to the same inviteCustomer call — the
// API dedupes by email/phone (scoped to the baker), so no duplicate is created.
// `attachedDesign` (optional): { designSnapshot, designThumbnailKey } from the designer's "Share the
// draft" flow. When present, the invite carries this starting design so the customer resumes straight
// into it — the design rides on the invite (design_snapshot), not a template row.
export default function InvitePanel({ open, onClose, apiClient, primaryColor = '#1a1a1a', attachedDesign = null }) {
  const empty = { firstName: '', lastName: '', email: '', phone: '', note: '' };
  const [form, setForm]     = useState(empty);
  const [mode, setMode]     = useState('search'); // 'search' (existing) | 'new'
  const [selected, setSelected] = useState(null); // existing customer picked from search
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [result, setResult] = useState(null);   // { link, invite, delivery }
  const [copied, setCopied] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  if (!open) return null;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function sendInvite(payload) {
    if (!apiClient?.inviteCustomer) return setError('Invite is not available');
    setSaving(true); setError(null);
    try {
      // Attach the shared design (if any) so the invite carries a starting snapshot.
      const res = await apiClient.inviteCustomer(attachedDesign
        ? { ...payload, designSnapshot: attachedDesign.designSnapshot, designThumbnailKey: attachedDesign.designThumbnailKey }
        : payload);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function submitNew(e) {
    e.preventDefault();
    if (!form.firstName.trim())                   return setError('First name is required');
    if (!form.email.trim() && !form.phone.trim()) return setError('Email or phone is required');
    sendInvite({
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim() || undefined,
      email:     form.email.trim() || undefined,
      phone:     form.phone.trim() || undefined,
      note:      form.note.trim()  || undefined,
    });
  }

  function inviteExisting() {
    if (!selected) return;
    if (!selected.email && !selected.phone) return setError('This customer has no email or phone on file to send the code to.');
    sendInvite({
      firstName: selected.first_name,
      lastName:  selected.last_name || undefined,
      email:     selected.email || undefined,
      phone:     selected.phone || undefined,
      note:      form.note.trim() || undefined,
    });
  }

  function reset() { setForm(empty); setResult(null); setError(null); setCopied(false); setSelected(null); }

  async function copyLink() {
    try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 76,
        zIndex: 300, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif", background: '#F7F5F0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        animation: 'slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Top bar */}
        <div style={{ height: 56, padding: '0 20px', background: '#fff', borderBottom: '1.5px solid #E8E4DC', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onClose} style={st.close}>✕</button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', flex: 1 }}>Invite for design</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            {!result ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={st.lead}>Invite a customer to design their own cake. They'll get a link and log in with a one-time code — no account needed.</p>

                {attachedDesign && (
                  <div style={st.attachBanner}>
                    <span style={st.attachTitle}>Your current design is attached</span>
                    <span style={st.attachSub}>The customer opens straight into this cake and can refine it before requesting a quote.</span>
                  </div>
                )}

                {mode === 'search' ? (
                  !selected ? (
                    <>
                      <Field label="Find a customer">
                        <CustomerSearch apiClient={apiClient} primaryColor={primaryColor} isMobile={isMobile} autoFocus onSelect={c => { setSelected(c); setError(null); }} />
                      </Field>
                      <div style={st.orRow}><span style={st.orLine} /><span style={st.orText}>or</span><span style={st.orLine} /></div>
                      <button type="button" onClick={() => { setMode('new'); setSelected(null); setError(null); }} style={st.secondaryWide}>+ Invite a new customer</button>
                      {error && <div style={st.err}>{error}</div>}
                    </>
                  ) : (
                    <>
                      <div style={st.selectedCard}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {(selected.first_name?.[0] ?? '').toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{selected.first_name} {selected.last_name ?? ''}</div>
                          {selected.phone && <div style={{ fontSize: 12, color: '#666', marginTop: 1 }}>{selected.phone}</div>}
                          {selected.email && <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{selected.email}</div>}
                        </div>
                        <button type="button" onClick={() => { setSelected(null); setError(null); }} style={st.changeBtn}>Change</button>
                      </div>
                      <Field label="Note (optional)"><input style={st.inp} value={form.note} onChange={set('note')} placeholder="e.g. Riya's birthday cake" /></Field>
                      {error && <div style={st.err}>{error}</div>}
                      <button type="button" onClick={inviteExisting} disabled={saving} style={{ ...st.primary, background: saving ? '#9BB5A2' : primaryColor }}>
                        {saving ? 'Sending…' : 'Invite to a design session'}
                      </button>
                    </>
                  )
                ) : (
                  <form onSubmit={submitNew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <button type="button" onClick={() => { setMode('search'); setError(null); }} style={st.backBtn}>← Back to search</button>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Field label="First name *"><input style={st.inp} value={form.firstName} onChange={set('firstName')} autoFocus /></Field>
                      <Field label="Last name"><input style={st.inp} value={form.lastName} onChange={set('lastName')} /></Field>
                    </div>
                    <Field label="Email"><input style={st.inp} type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" /></Field>
                    <Field label="Phone"><input style={st.inp} value={form.phone} onChange={set('phone')} placeholder="+91…" /></Field>
                    <Field label="Note (optional)"><input style={st.inp} value={form.note} onChange={set('note')} placeholder="e.g. Riya's birthday cake" /></Field>
                    <p style={st.hint}>Provide at least an email or a phone — the code is sent there.</p>
                    {error && <div style={st.err}>{error}</div>}
                    <button type="submit" disabled={saving} style={{ ...st.primary, background: saving ? '#9BB5A2' : primaryColor }}>
                      {saving ? 'Sending…' : 'Invite to a design session'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={st.successBadge}>Invite created</div>
                <Field label="Invite link">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...st.inp, fontFamily: 'monospace', fontSize: 12 }} readOnly value={result.link} onFocus={e => e.target.select()} />
                    <button type="button" onClick={copyLink} style={{ ...st.secondary }}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </Field>
                <div style={st.deliveryRow}>
                  Email: {result.delivery?.email?.queued
                    ? <b style={{ color: '#2E7D32' }}>on its way</b>
                    : <span style={{ color: '#9a8' }}>not sent{result.delivery?.email?.reason ? ` (${result.delivery.email.reason})` : ''}</span>}
                </div>
                <button type="button" onClick={reset} style={{ ...st.primary, background: primaryColor }}>Invite another</button>
                <button type="button" onClick={onClose} style={st.linkBtn}>Done</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      {children}
    </label>
  );
}

const st = {
  close:    { width: 34, height: 34, borderRadius: 9, border: '1.5px solid #E8E4DC', background: '#fff', color: '#666', fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  lead:     { fontSize: 13, fontWeight: 600, color: '#6B8C74', margin: '0 0 4px', lineHeight: 1.5 },
  inp:      { padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E0DDD8', fontSize: 13, fontFamily: 'inherit', color: '#222', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' },
  hint:     { fontSize: 11, fontWeight: 600, color: '#aaa', margin: 0 },
  err:      { background: '#FFF0F0', border: '1.5px solid #F5C0C0', borderRadius: 8, padding: '9px 12px', color: '#C0392B', fontSize: 12, fontWeight: 600 },
  primary:  { padding: '12px', borderRadius: 11, border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
  secondary:{ padding: '0 16px', borderRadius: 10, border: '1.5px solid #E0DDD8', background: '#fff', color: '#444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  linkBtn:  { padding: '8px', background: 'none', border: 'none', color: '#9BB5A2', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  successBadge: { alignSelf: 'flex-start', background: '#E8F5E9', color: '#2E7D32', fontWeight: 800, fontSize: 13, padding: '6px 14px', borderRadius: 20 },
  deliveryRow: { fontSize: 13, fontWeight: 600, color: '#555' },
  secondaryWide: { padding: '11px', borderRadius: 11, border: '1.5px dashed #CFC9BD', background: '#fff', color: '#6B6657', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  backBtn:  { alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 9, border: '1.5px solid #E0DDD8', background: '#fff', color: '#666', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  orRow:    { display: 'flex', alignItems: 'center', gap: 10 },
  orLine:   { flex: 1, height: 1, background: '#E0DDD8' },
  orText:   { fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.6 },
  selectedCard: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fff', border: '1.5px solid #E0DDD8', borderRadius: 12 },
  changeBtn: { padding: '6px 12px', borderRadius: 9, border: '1.5px solid #E0DDD8', background: '#fff', color: '#666', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  attachBanner: { display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 14px', borderRadius: 11, background: '#EEF5F0', border: '1.5px solid #CDE3D6' },
  attachTitle: { fontSize: 13, fontWeight: 800, color: '#2E6B4F' },
  attachSub:   { fontSize: 12, fontWeight: 600, color: '#5B7A68', lineHeight: 1.45 },
};
