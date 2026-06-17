import React, { useState, useEffect } from 'react';

// CustomerStorefront — the public, branded landing a customer sees before entering
// the design space. Logo + story + brand colours + "Start designing" CTA, and the
// invite-gated OTP login.
//
// Props:
//   slug          string    which baker's storefront to load (when `baker` not given)
//   baker         object?   pre-fetched storefront data (e.g. SSR); skips the fetch
//   inviteId      string?   from the invite link `?invite=<id>` — enables login
//   apiBaseUrl    string?   base URL for the public API
//   supabase      object?   Supabase client (to adopt the session after verify)
//   onAuthenticated function?  called with the session once OTP verifies
//   onStartDesign function?  called when there's no invite (e.g. preview mode)
//   designLabel   string?   CTA label
//
// Access is invite-gated: without a valid invite the CTA can't start a session —
// the customer is told to ask the bakery. Branding comes from the baker record.
export default function CustomerStorefront({
  slug,
  baker: bakerProp = null,
  inviteId = null,
  apiBaseUrl = '',
  supabase = null,
  onAuthenticated,
  onStartDesign,
  designLabel = 'Start designing your cake',
}) {
  const [baker, setBaker]     = useState(bakerProp);
  const [invite, setInvite]   = useState(null);   // landing: { valid, expired, customer:{masked_*}, ... }
  const [loading, setLoading] = useState(!bakerProp);
  const [error, setError]     = useState(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (!bakerProp && slug) {
          const data = await getJSON(`${apiBaseUrl}/api/storefront/${encodeURIComponent(slug)}`);
          if (alive) setBaker(data);
        }
        if (inviteId) {
          const land = await getJSON(`${apiBaseUrl}/api/invite/${encodeURIComponent(inviteId)}`);
          if (alive) setInvite(land);
        }
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug, bakerProp, inviteId, apiBaseUrl]);

  if (loading) return <Centered>Loading…</Centered>;
  if (error)   return <Centered>{error}</Centered>;
  if (!baker)  return <Centered>Storefront unavailable</Centered>;

  const primary = baker.primary_color || '#2C4433';
  const accent  = baker.accent_color  || '#6B8C74';
  const ig = baker.instagram_handle?.replace(/^@/, '');
  const s = styles(primary, accent);

  function handleCta() {
    if (inviteId && invite?.valid) { setShowLogin(true); return; }
    if (inviteId && invite && !invite.valid) return; // expired — message shown below
    onStartDesign?.(baker);                            // no invite → preview/host decides
  }

  return (
    <div style={s.page}>
      <div style={s.hero}>
        {baker.logo_url
          ? <img src={baker.logo_url} alt={baker.name} style={s.logo} />
          : <div style={s.logoFallback}>{(baker.name ?? '?').slice(0, 1).toUpperCase()}</div>}

        <h1 style={s.name}>{baker.name}</h1>
        {baker.tagline && <p style={s.tagline}>{baker.tagline}</p>}

        {inviteId && invite && !invite.valid ? (
          <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
        ) : (
          <button type="button" style={s.cta} onClick={handleCta}>{designLabel}</button>
        )}
        {!inviteId && <p style={s.hint}>Have an invite link from {baker.name}? Open it to start designing.</p>}
      </div>

      {baker.story && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Our story</h2>
          <p style={s.story}>{baker.story}</p>
        </section>
      )}

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Our creations</h2>
        <div style={s.gallery}>{[0, 1, 2].map(i => <div key={i} style={s.galleryTile} />)}</div>
        <p style={s.comingSoon}>Featured cakes coming soon.</p>
      </section>

      {(ig || baker.website_url) && (
        <footer style={s.footer}>
          {ig && <a style={s.footerLink} href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer">@{ig}</a>}
          {baker.website_url && <a style={s.footerLink} href={baker.website_url} target="_blank" rel="noreferrer">Website</a>}
        </footer>
      )}

      {showLogin && (
        <LoginModal
          invite={invite}
          inviteId={inviteId}
          apiBaseUrl={apiBaseUrl}
          supabase={supabase}
          primary={primary}
          onClose={() => setShowLogin(false)}
          onAuthenticated={onAuthenticated}
        />
      )}
    </div>
  );
}

// ── OTP login ──────────────────────────────────────────────────────────────────
function LoginModal({ invite, inviteId, apiBaseUrl, supabase, primary, onClose, onAuthenticated }) {
  const channels = invite?.customer?.channels?.length ? invite.customer.channels : ['email'];
  const [channel, setChannel] = useState(channels[0]);
  const [step, setStep]   = useState('start');   // start | code
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  const masked = channel === 'email' ? invite?.customer?.masked_email : invite?.customer?.masked_phone;

  async function send() {
    setBusy(true); setErr(null);
    try {
      await postJSON(`${apiBaseUrl}/api/invite/${inviteId}/send-otp`, { channel });
      setStep('code');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      const { session } = await postJSON(`${apiBaseUrl}/api/invite/${inviteId}/verify-otp`, { channel, code });
      if (supabase && session) {
        await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      }
      onAuthenticated?.(session);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const m = modalStyles(primary);
  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.card} onClick={e => e.stopPropagation()}>
        <div style={m.title}>Log in to start designing</div>

        {channels.length > 1 && step === 'start' && (
          <div style={m.channels}>
            {channels.map(c => (
              <button key={c} type="button" onClick={() => setChannel(c)}
                style={{ ...m.channelBtn, ...(channel === c ? m.channelActive : {}) }}>
                {c === 'email' ? 'Email' : c === 'sms' ? 'SMS' : c}
              </button>
            ))}
          </div>
        )}

        {step === 'start' ? (
          <>
            <p style={m.sub}>We'll send a code to <b>{masked}</b></p>
            <button style={m.primaryBtn} disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send code'}</button>
          </>
        ) : (
          <>
            <p style={m.sub}>Enter the code sent to <b>{masked}</b></p>
            <input style={m.input} value={code} onChange={e => setCode(e.target.value)}
              inputMode="numeric" placeholder="6-digit code" autoFocus />
            <button style={m.primaryBtn} disabled={busy || !code.trim()} onClick={verify}>{busy ? 'Verifying…' : 'Verify & enter'}</button>
            <button style={m.linkBtn} disabled={busy} onClick={send}>Resend code</button>
          </>
        )}

        {err && <p style={m.err}>{err}</p>}
        <button style={m.close} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
  return res.json();
}
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
  return res.json();
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Quicksand', sans-serif", color: '#6B8C74', fontWeight: 600, background: '#EDEAE2' }}>
      {children}
    </div>
  );
}

function styles(primary, accent) {
  return {
    page:        { minHeight: '100vh', background: '#EDEAE2', fontFamily: "'Quicksand', sans-serif", color: '#2C4433', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px 48px' },
    hero:        { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 0 40px', maxWidth: 640, width: '100%' },
    logo:        { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${accent}`, background: '#fff' },
    logoFallback:{ width: 96, height: 96, borderRadius: '50%', background: primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800 },
    name:        { fontSize: 34, fontWeight: 800, margin: '20px 0 0', color: primary },
    tagline:     { fontSize: 16, fontWeight: 600, color: accent, margin: '10px 0 0', lineHeight: 1.5 },
    cta:         { marginTop: 32, padding: '15px 32px', borderRadius: 14, border: 'none', background: primary, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", boxShadow: '0 6px 20px rgba(44,68,51,0.18)' },
    expired:     { marginTop: 28, fontSize: 14, fontWeight: 700, color: '#C0392B', background: '#FFF0F0', padding: '12px 18px', borderRadius: 12 },
    hint:        { marginTop: 20, fontSize: 13, fontWeight: 600, color: '#9BB5A2' },
    section:     { maxWidth: 640, width: '100%', marginTop: 40 },
    sectionTitle:{ fontSize: 13, fontWeight: 800, color: accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
    story:       { fontSize: 16, fontWeight: 500, lineHeight: 1.7, color: '#3C5443', whiteSpace: 'pre-wrap', margin: 0 },
    gallery:     { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
    galleryTile: { aspectRatio: '1 / 1', borderRadius: 14, background: '#fff', border: '1.5px dashed #C5D4C8' },
    comingSoon:  { fontSize: 13, fontWeight: 600, color: '#9BB5A2', marginTop: 10, textAlign: 'center' },
    footer:      { marginTop: 48, display: 'flex', gap: 20 },
    footerLink:  { fontSize: 14, fontWeight: 700, color: primary, textDecoration: 'none' },
  };
}

function modalStyles(primary) {
  return {
    overlay:   { position: 'fixed', inset: 0, background: 'rgba(20,30,24,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
    card:      { background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 380, fontFamily: "'Quicksand', sans-serif", boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
    title:     { fontSize: 19, fontWeight: 800, color: '#2C4433', marginBottom: 14 },
    sub:       { fontSize: 14, fontWeight: 600, color: '#6B8C74', margin: '0 0 16px', lineHeight: 1.5 },
    channels:  { display: 'flex', gap: 8, marginBottom: 16 },
    channelBtn:{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid #C5D4C8', background: '#fff', color: '#6B8C74', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" },
    channelActive: { background: '#E8EDE9', borderColor: primary, color: '#2C4433' },
    input:     { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #C5D4C8', fontSize: 18, fontWeight: 700, letterSpacing: 4, textAlign: 'center', color: '#2C4433', boxSizing: 'border-box', marginBottom: 14, fontFamily: "'Quicksand', sans-serif" },
    primaryBtn:{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: primary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" },
    linkBtn:   { width: '100%', padding: '10px', marginTop: 8, background: 'none', border: 'none', color: '#6B8C74', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" },
    err:       { fontSize: 13, fontWeight: 700, color: '#C0392B', marginTop: 12, textAlign: 'center' },
    close:     { width: '100%', padding: '10px', marginTop: 10, background: 'none', border: 'none', color: '#9BB5A2', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" },
  };
}
