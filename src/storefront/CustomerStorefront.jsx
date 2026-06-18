import React, { useState, useEffect } from 'react';
import { CakeSpinner } from '../designer/canvas/CakeSpinner.jsx';
import HeroCake3D from './HeroCake3D.jsx';
import { FONT, SERIF, buildContent, lighten, darken, mix, alpha, onColor } from './storefrontKit.js';

// Placeholder bio shown until the baker writes their own (baker.story). Sample copy only.
const SAMPLE_STORY = "We're a small-batch bakery pouring heart into every cake. From the first sketch to the final swirl of cream, each creation is made fresh to order — designed by you, baked by us. Here to sweeten life's little moments, one slice at a time.";

// CustomerStorefront — the public, mobile-first landing a customer sees before entering the
// design space. Most customers arrive by tapping a WhatsApp invite link on their phone, so the
// whole thing is designed for the phone frame first. A contact bar + header/hamburger, a
// full-bleed rotating-cake hero with the CTA overlaid, branded sections, a testimonials carousel
// and the invite-gated OTP login. Branding + colours come from the baker record.
export default function CustomerStorefront({
  slug,
  baker: bakerProp = null,
  inviteId = null,
  logoUrl = null,
  gallery: galleryProp = null,
  apiBaseUrl = '',
  supabase = null,
  onAuthenticated,
  onStartDesign,
  designLabel = 'Start designing',
}) {
  const [baker, setBaker]     = useState(bakerProp);
  const [invite, setInvite]   = useState(null);
  const [loading, setLoading] = useState(!bakerProp);
  const [error, setError]     = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [howOpen, setHowOpen]     = useState(false);
  const [tIdx, setTIdx]           = useState(0);
  const [gIdx, setGIdx]           = useState(0);

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

  // Adopt live updates to a pre-fetched baker (used by the theme preview/customiser, where
  // colours + theme change on the fly without re-fetching).
  useEffect(() => { if (bakerProp) setBaker(bakerProp); }, [bakerProp]);

  if (loading) return <Centered><CakeSpinner label="Loading…" /></Centered>;
  if (error)   return <Centered>{error}</Centered>;
  if (!baker)  return <Centered>Storefront unavailable</Centered>;

  const primary = baker.primary_color || '#2C4433';
  const accent  = baker.accent_color  || '#6B8C74';
  const ig      = baker.instagram_handle?.replace(/^@/, '');
  const phone   = baker.whatsapp || baker.whatsapp_number || baker.phone || null;
  const logo    = logoUrl || baker.logo_url;   // a full logo / wordmark; replaces the name lockup

  // Storefront template routing — the baker picks their theme in Settings → Storefront Theme,
  // and the public API returns its key as `storefront_theme`. Only 'spotlight' is implemented
  // today, so any other (or missing) theme falls back to it until that template is built.
  const BUILT_TEMPLATES = ['spotlight'];
  const theme = BUILT_TEMPLATES.includes(baker.storefront_theme) ? baker.storefront_theme : 'spotlight';
  // (theme === 'spotlight' renders the layout below; future templates branch here.)
  const s = styles(primary, accent);
  const { steps, testimonials } = buildContent(baker);

  const firstName = invite?.customer?.first_name || invite?.first_name || null;
  const occasion  = invite?.occasion || invite?.note || null;
  const showWelcome = !!(invite?.valid && firstName);
  const expired = inviteId && invite && !invite.valid;

  function handleCta() {
    if (inviteId && invite?.valid) { setShowLogin(true); return; }
    if (expired) return;
    onStartDesign?.(baker);
  }

  // Nav items — only those with somewhere to go.
  // Real baker content; falls back to a clearly-marked sample so the section designs
  // end-to-end (Feelings & Flavours has no story/portrait on its record yet).
  const story    = baker.story || SAMPLE_STORY;
  const portrait = baker.portrait_url || null;   // a real baker photo; placeholder glyph otherwise

  const nav = [
    { label: 'Gallery', href: '#gallery' },
    { label: 'Our story', href: '#story' },
    { label: 'How it works', action: () => setHowOpen(true) },
    { label: 'Contact', href: '#contact' },
  ];

  const t = testimonials[tIdx];
  const move = d => setTIdx(i => (i + d + testimonials.length) % testimonials.length);

  // Gallery photos uploaded by the baker (baker.gallery); empty → graceful fallback below.
  const gallery = (galleryProp?.length ? galleryProp : baker.gallery) || [];
  const hasPhotos = gallery.length > 0;
  const gPhoto = hasPhotos ? gallery[gIdx % gallery.length] : null;
  const gMove = d => setGIdx(i => (i + d + gallery.length) % gallery.length);

  return (
    <div style={s.page}>
      {phone && (
        <div style={s.utilbar}><PhoneIcon size={13} color={darken(primary, 0.1)} style={{ verticalAlign: '-2px', marginRight: 6 }} />Call / WhatsApp: <a href={`tel:${phone}`} style={s.utilLink}>{phone}</a></div>
      )}

      <header style={s.header}>
        <div style={s.brand}>
          {logo
            ? <img src={logo} alt={baker.name} style={s.logoImg} />
            : (<>
                <div style={s.logoFallback}>{(baker.name ?? '?').slice(0, 1).toUpperCase()}</div>
                <span style={s.brandName}>{baker.name}</span>
              </>)}
        </div>
        <button type="button" aria-label="Menu" style={s.burger} onClick={() => setMenuOpen(true)}>
          <span style={s.burgerLine} /><span style={s.burgerLine} /><span style={s.burgerLine} />
        </button>
      </header>

      {menuOpen && (
        <div style={s.drawerOverlay} onClick={() => setMenuOpen(false)}>
          <nav style={s.drawer} onClick={e => e.stopPropagation()}>
            <button type="button" aria-label="Close" style={s.drawerClose} onClick={() => setMenuOpen(false)}>×</button>
            {nav.map(n => n.href
              ? <a key={n.label} href={n.href} style={s.drawerLink} onClick={() => setMenuOpen(false)}>{n.label}</a>
              : <button key={n.label} type="button" style={{ ...s.drawerLink, ...s.drawerLinkBtn }} onClick={() => { setMenuOpen(false); n.action(); }}>{n.label}</button>
            )}
          </nav>
        </div>
      )}

      {/* ── HERO: full-bleed rotating cake, CTA overlaid ──────────────────────────── */}
      <section style={s.hero}>
        <div style={s.heroCake}><HeroCake3D primary={primary} accent={accent} mood="dark" height="100%" /></div>
        <div style={s.heroScrim} />
        <div style={s.heroFade} />
        <div style={s.heroContent}>
          <div>
            <h1 style={s.heroEyebrow}>You design, we bake it</h1>
          </div>
          <div style={s.heroBottom}>
            {showWelcome && <p style={s.welcome}>Welcome, {firstName} — invited to design{occasion ? ` your ${occasion} cake` : ' your cake'}.</p>}
            {expired ? (
              <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
            ) : (
              <button type="button" style={s.heroCta} onClick={handleCta}>{designLabel}</button>
            )}
          </div>
        </div>
      </section>

      <main style={s.main}>
        <Section id="gallery" eyebrow="Our creations" title={`A taste of what ${baker.name} makes`} s={s}>
          {hasPhotos ? (
            <>
              <div style={s.carousel}>
                {gallery.length > 1 && <button type="button" aria-label="Previous" style={{ ...s.arrow, ...s.arrowL }} onClick={() => gMove(-1)}>‹</button>}
                <div style={s.gSlide}><img src={gPhoto.url || gPhoto} alt={gPhoto.caption || `${baker.name} cake`} style={s.gImg} /></div>
                {gallery.length > 1 && <button type="button" aria-label="Next" style={{ ...s.arrow, ...s.arrowR }} onClick={() => gMove(1)}>›</button>}
              </div>
              {gPhoto.caption && <p style={s.gCaption}>{gPhoto.caption}</p>}
              {gallery.length > 1 && (
                <div style={s.dotsRow}>
                  {gallery.map((_, i) => <span key={i} style={{ ...s.dot, ...(i === gIdx ? s.dotOn : {}) }} onClick={() => setGIdx(i)} />)}
                </div>
              )}
            </>
          ) : (
            // Fallback when the baker hasn't uploaded photos yet — branded, not broken.
            <div style={{ ...s.gFallback, background: `linear-gradient(135deg, ${lighten(primary, 0.42)}, ${lighten(accent, 0.16)})` }}>
              <CakeIcon size={52} color={alpha('#ffffff', 0.8)} />
              <div style={s.gFallbackText}>Fresh photos coming soon</div>
              <button type="button" style={s.gFallbackCta} onClick={handleCta}>Design your own</button>
            </div>
          )}
        </Section>

        <section id="story" style={s.section}>
          <div style={s.eyebrow}>Our story</div>
          <div style={s.storyWrap}>
            <div style={s.portrait}>
              {portrait ? <img src={portrait} alt={baker.name} style={s.portraitImg} /> : <BakerIcon size={66} color={primary} />}
            </div>
            <p style={s.bio}>{story}</p>
            <div style={s.signature}>— {baker.name}</div>
          </div>
        </section>

        <Section eyebrow="Loved by our customers" title="Designed by them, baked by us" s={s}>
          <div style={s.carousel}>
            <button type="button" aria-label="Previous" style={{ ...s.arrow, ...s.arrowL }} onClick={() => move(-1)}>‹</button>
            <figure style={s.testiCard}>
              <div style={s.stars}>★★★★★</div>
              <blockquote style={s.quote}>“{t.quote}”</blockquote>
              <figcaption style={s.author}>{t.author} <span style={s.authorOcc}>· {t.occasion}</span></figcaption>
            </figure>
            <button type="button" aria-label="Next" style={{ ...s.arrow, ...s.arrowR }} onClick={() => move(1)}>›</button>
          </div>
          <div style={s.dotsRow}>
            {testimonials.map((_, i) => <span key={i} style={{ ...s.dot, ...(i === tIdx ? s.dotOn : {}) }} onClick={() => setTIdx(i)} />)}
          </div>
        </Section>
      </main>

      <footer id="contact" style={s.footer}>
        {(phone || ig || baker.website_url) && (
          <div style={s.footerLinks}>
            {phone && <a href={`tel:${phone}`} style={s.footerLink}><PhoneIcon size={13} color={lighten(accent, 0.1)} style={{ verticalAlign: '-2px', marginRight: 5 }} />{phone}</a>}
            {ig && <a style={s.footerLink} href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer">@{ig}</a>}
            {baker.website_url && <a style={s.footerLink} href={baker.website_url} target="_blank" rel="noreferrer">Website</a>}
          </div>
        )}
        <div style={s.madeWith}>Made with Spattoo</div>
      </footer>

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

      {howOpen && (
        <div style={s.howOverlay} onClick={() => setHowOpen(false)}>
          <div style={s.howCard} onClick={e => e.stopPropagation()}>
            <button type="button" aria-label="Close" style={s.howClose} onClick={() => setHowOpen(false)}>×</button>
            <div style={s.eyebrow}>How it works</div>
            <h2 style={s.howTitle}>From idea to cake in 3 steps</h2>
            {steps.map(st => (
              <div key={st.n} style={s.howStep}>
                <div style={s.stepNum}>{st.n}</div>
                <div>
                  <div style={s.stepTitle}>{st.title}</div>
                  <p style={s.stepBody}>{st.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── line icons (no emoji — render consistently, look professional) ──────────────
function BakerIcon({ size = 56, color = '#9b5f72', style }) {
  // A classic puffy three-lobe chef's toque on a flared band — reads as "the baker".
  return (
    <svg viewBox="0 0 64 56" width={size} height={size} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M10 50C9 44 9 38 14 33C5 33 3 23 11 19C8 10 18 6 24 12C26 5 38 5 40 12C46 6 56 10 53 19C61 23 59 33 50 33C55 38 55 44 54 50C40 54 24 54 10 50Z" />
      <path d="M14 34C25 38 39 38 50 34" />
    </svg>
  );
}
function CakeIcon({ size = 42, color = '#9b5f72', style }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M9 42V28a4 4 0 0 1 4-4h22a4 4 0 0 1 4 4v14" />
      <path d="M7 42h34" />
      <path d="M9 32c2.3 0 2.3 2.4 4.6 2.4S15.9 32 18.2 32s2.3 2.4 4.6 2.4S25.1 32 27.4 32s2.3 2.4 4.6 2.4S34.3 32 36.6 32 39 34.4 41 34.4" />
      <path d="M24 24v-6" />
      <circle cx="24" cy="14" r="1.8" />
    </svg>
  );
}
function PhoneIcon({ size = 14, color = '#9b5f72', style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function Section({ id, eyebrow, title, s, children }) {
  return (
    <section id={id} style={s.section}>
      <div style={s.eyebrow}>{eyebrow}</div>
      <h2 style={s.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

// ── OTP login ──────────────────────────────────────────────────────────────────
function LoginModal({ invite, inviteId, apiBaseUrl, supabase, primary, onClose, onAuthenticated }) {
  const channels = invite?.customer?.channels?.length ? invite.customer.channels : ['email'];
  const [channel, setChannel] = useState(channels[0]);
  const [step, setStep]   = useState('start');
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
      fontFamily: FONT, color: '#6B8C74', fontWeight: 600, background: '#EDEAE2' }}>
      {children}
    </div>
  );
}

function styles(primary, accent) {
  const ink = mix(primary, '#3a363a', 0.74);  // soft warm-grey hero/footer (lighter than near-black)
  const heading = '#241A1E', text = '#3A2E32', muted = '#8B7B80';
  const cardBorder = '#ECE5DE', shadow = '0 12px 30px rgba(60,40,45,0.08)';
  const cw = 600;                             // mobile-first content width
  return {
    page:        { minHeight: '100vh', background: '#FCFAF7', fontFamily: FONT, color: text, display: 'flex', flexDirection: 'column' },

    utilbar:     { background: lighten(primary, 0.9), color: darken(primary, 0.1), fontSize: 13.5, fontWeight: 700, textAlign: 'center', padding: '9px 16px' },
    utilLink:    { color: darken(primary, 0.1), textDecoration: 'none' },
    header:      { position: 'sticky', top: 0, zIndex: 30, background: 'rgba(252,250,247,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' },
    brand:       { display: 'flex', alignItems: 'center', gap: 10 },
    logoImg:     { height: 30, width: 'auto', maxWidth: 210, objectFit: 'contain', display: 'block' },
    logo:        { width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}`, background: '#fff' },
    logoFallback:{ width: 38, height: 38, borderRadius: '50%', background: primary, color: onColor(primary), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 },
    brandName:   { fontSize: 18, fontWeight: 700, color: heading },
    burger:      { width: 42, height: 42, borderRadius: 10, border: `1px solid ${cardBorder}`, background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4 },
    burgerLine:  { width: 18, height: 2, borderRadius: 2, background: heading },

    drawerOverlay:{ position: 'fixed', inset: 0, background: 'rgba(20,14,16,0.4)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' },
    drawer:      { width: 'min(78vw, 300px)', height: '100%', background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)', padding: '64px 26px 26px', display: 'flex', flexDirection: 'column', gap: 4 },
    drawerClose: { position: 'absolute', top: 14, right: 18, fontSize: 30, lineHeight: 1, background: 'none', border: 'none', color: muted, cursor: 'pointer' },
    drawerLink:  { padding: '14px 4px', fontSize: 17, fontWeight: 700, color: heading, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` },
    drawerLinkBtn:{ background: 'none', border: 'none', borderBottom: `1px solid ${cardBorder}`, textAlign: 'left', cursor: 'pointer', fontFamily: FONT, width: '100%' },
    drawerCta:   { marginTop: 20, padding: '14px', borderRadius: 12, border: 'none', background: primary, color: onColor(primary), fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },

    hero:        { position: 'relative', width: '100%', height: '50vh', minHeight: 380, maxHeight: 480, background: `linear-gradient(180deg, ${lighten(ink, 0.06)}, ${ink})`, overflow: 'hidden' },
    heroCake:    { position: 'absolute', inset: 0 },
    heroScrim:   { position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(ink, 0.82)} 0%, ${alpha(ink, 0.32)} 24%, transparent 44%, ${alpha(ink, 0.4)} 64%, transparent 84%)`, pointerEvents: 'none' },
    // Dissolve the dark hero into the page colour at the seam — no hard edge.
    heroFade:    { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', background: `linear-gradient(180deg, transparent 0%, ${alpha('#FCFAF7', 0.0)} 8%, #FCFAF7 100%)`, zIndex: 1, pointerEvents: 'none' },
    heroContent: { position: 'relative', zIndex: 2, height: '100%', maxWidth: cw, margin: '0 auto', padding: '54px 24px 30px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center', alignItems: 'center', color: '#fff' },
    heroEyebrow: { fontSize: 12.5, fontWeight: 600, letterSpacing: 2.4, textTransform: 'uppercase', color: lighten(accent, 0.1), margin: 0, lineHeight: 1.5, textShadow: '0 2px 14px rgba(0,0,0,0.3)' },
    heroBottom:  { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    welcome:     { fontSize: 13.5, fontWeight: 700, color: '#fff', margin: '0 0 14px', background: alpha('#ffffff', 0.16), border: `1px solid ${alpha('#ffffff', 0.28)}`, padding: '9px 14px', borderRadius: 12, lineHeight: 1.5, backdropFilter: 'blur(4px)' },
    heroCta:     { padding: '15px 34px', borderRadius: 14, border: `2px solid ${lighten(accent, 0.1)}`, background: alpha(ink, 0.4), color: lighten(accent, 0.1), fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, backdropFilter: 'blur(8px)' },
    expired:     { fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(192,57,43,0.9)', padding: '12px 18px', borderRadius: 12 },
    heroHint:    { fontSize: 12.5, fontWeight: 600, color: alpha('#ffffff', 0.82), marginTop: 14, maxWidth: 320 },

    main:        { maxWidth: cw, width: '100%', margin: '0 auto', padding: '0 24px', boxSizing: 'border-box' },
    section:     { padding: '46px 0 6px' },
    eyebrow:     { fontSize: 11.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: primary, marginBottom: 12, textAlign: 'center' },
    sectionTitle:{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: heading, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.3 },

    steps:       { display: 'grid', gap: 12 },
    stepCard:    { display: 'flex', gap: 16, alignItems: 'flex-start', background: '#fff', border: `1px solid ${cardBorder}`, boxShadow: shadow, borderRadius: 16, padding: '20px 20px' },
    stepNum:     { fontSize: 26, fontWeight: 700, color: primary, lineHeight: 1, flexShrink: 0 },
    stepTitle:   { fontSize: 16.5, fontWeight: 700, color: heading, marginBottom: 5 },
    stepBody:    { fontSize: 14, fontWeight: 500, lineHeight: 1.55, color: muted, margin: 0 },

    // Our story
    storyWrap:   { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 460, margin: '0 auto' },
    portrait:    { width: 116, height: 116, borderRadius: '50%', background: `linear-gradient(135deg, ${lighten(primary, 0.35)}, ${lighten(accent, 0.1)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 22, boxShadow: shadow, border: '4px solid #fff' },
    portraitImg: { width: '100%', height: '100%', objectFit: 'cover' },
    portraitGlyph:{ fontSize: 52 },
    bio:         { fontSize: 16, fontWeight: 500, lineHeight: 1.7, color: text, margin: 0, whiteSpace: 'pre-wrap' },
    signature:   { fontSize: 15, fontWeight: 700, color: primary, marginTop: 16, fontStyle: 'italic' },

    // How-it-works modal
    howOverlay:  { position: 'fixed', inset: 0, background: 'rgba(20,14,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 20 },
    howCard:     { position: 'relative', background: '#fff', borderRadius: 20, padding: '30px 24px 24px', width: '100%', maxWidth: 420, fontFamily: FONT, boxShadow: '0 24px 70px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 14 },
    howClose:    { position: 'absolute', top: 12, right: 16, fontSize: 28, lineHeight: 1, background: 'none', border: 'none', color: muted, cursor: 'pointer' },
    howTitle:    { fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: heading, margin: '0 0 6px', textAlign: 'center' },
    howStep:     { display: 'flex', gap: 14, alignItems: 'flex-start' },

    // Gallery slideshow
    gSlide:      { aspectRatio: '4 / 3', borderRadius: 18, overflow: 'hidden', boxShadow: shadow, background: '#fff', border: `1px solid ${cardBorder}` },
    gImg:        { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    gCaption:    { fontSize: 14, fontWeight: 600, color: muted, marginTop: 14, textAlign: 'center' },
    gFallback:   { aspectRatio: '4 / 3', borderRadius: 18, boxShadow: shadow, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff', textAlign: 'center', padding: 20 },
    gFallbackText:{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: '#fff' },
    gFallbackCta:{ padding: '11px 24px', borderRadius: 12, border: `1.5px solid ${alpha('#ffffff', 0.7)}`, background: alpha('#ffffff', 0.12), color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, backdropFilter: 'blur(4px)' },

    carousel:    { position: 'relative' },
    testiCard:   { background: '#fff', border: `1px solid ${cardBorder}`, boxShadow: shadow, borderRadius: 18, padding: '26px 46px', margin: 0, minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
    stars:       { color: accent, fontSize: 16, letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
    quote:       { fontSize: 15.5, fontWeight: 500, lineHeight: 1.6, color: text, margin: '0 0 16px', textAlign: 'center' },
    author:      { fontSize: 14, fontWeight: 700, color: heading, textAlign: 'center' },
    authorOcc:   { fontWeight: 600, color: muted },
    arrow:       { width: 38, height: 38, borderRadius: '50%', border: `1px solid ${cardBorder}`, background: '#fff', color: primary, fontSize: 22, fontWeight: 700, lineHeight: 1, cursor: 'pointer', boxShadow: shadow, position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
    arrowL:      { left: -8 },
    arrowR:      { right: -8 },
    dotsRow:     { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    dot:         { width: 8, height: 8, borderRadius: '50%', background: lighten(primary, 0.6), cursor: 'pointer' },
    dotOn:       { background: primary, width: 22, borderRadius: 5 },

    footer:      { marginTop: 40, padding: '16px 24px', background: ink, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
    footerName:  { fontSize: 18, fontWeight: 700, color: '#fff' },
    footerLinks: { display: 'flex', gap: 18, marginTop: 2 },
    footerLink:  { fontSize: 14, fontWeight: 700, color: lighten(accent, 0.1), textDecoration: 'none' },
    madeWith:    { fontSize: 12, fontWeight: 700, color: alpha('#ffffff', 0.5), letterSpacing: 0.4, marginTop: 10 },
  };
}

function modalStyles(primary) {
  return {
    overlay:   { position: 'fixed', inset: 0, background: 'rgba(20,30,24,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
    card:      { background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 380, fontFamily: FONT, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
    title:     { fontSize: 19, fontWeight: 700, color: '#2C4433', marginBottom: 14 },
    sub:       { fontSize: 14, fontWeight: 600, color: '#6B8C74', margin: '0 0 16px', lineHeight: 1.5 },
    channels:  { display: 'flex', gap: 8, marginBottom: 16 },
    channelBtn:{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid #C5D4C8', background: '#fff', color: '#6B8C74', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT },
    channelActive: { background: '#E8EDE9', borderColor: primary, color: '#2C4433' },
    input:     { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #C5D4C8', fontSize: 18, fontWeight: 700, letterSpacing: 4, textAlign: 'center', color: '#2C4433', boxSizing: 'border-box', marginBottom: 14, fontFamily: FONT },
    primaryBtn:{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: primary, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
    linkBtn:   { width: '100%', padding: '10px', marginTop: 8, background: 'none', border: 'none', color: '#6B8C74', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
    err:       { fontSize: 13, fontWeight: 700, color: '#C0392B', marginTop: 12, textAlign: 'center' },
    close:     { width: '100%', padding: '10px', marginTop: 10, background: 'none', border: 'none', color: '#9BB5A2', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
  };
}
