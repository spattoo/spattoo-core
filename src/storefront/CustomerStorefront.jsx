import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CakeSpinner } from '../designer/canvas/CakeSpinner.jsx';
import HeroCake3D from './HeroCake3D.jsx';
import { FONT, SERIF, buildContent, storefrontText, buildPalette, applyFontTheme, resolveSections, lighten, darken, mix, alpha, onColor, safeHref } from './storefrontKit.js';
import { resolveTemplate } from './templates.js';

// Placeholder bio shown until the baker writes their own (baker.story). Sample copy only.
const SAMPLE_STORY = "We're a small-batch bakery pouring heart into every cake. From the first sketch to the final swirl of cream, each creation is made fresh to order — designed by you, baked by us. Here to sweeten life's little moments, one slice at a time.";

// CustomerStorefront — the public, mobile-first landing a customer sees before entering the
// design space. Most customers arrive by tapping a WhatsApp invite link on their phone, so the
// whole thing is designed for the phone frame first. A contact bar + header/hamburger, a
// full-bleed rotating-cake hero with the CTA overlaid, branded sections, a testimonials carousel
// and the invite-gated OTP login. Branding + colours come from the baker record.
const bpOf = w => (w >= 1024 ? 'desktop' : w >= 720 ? 'tablet' : 'mobile');

// Coarse responsive breakpoint for the customer-facing storefront. Measured off the storefront's
// OWN CONTAINER width (via ResizeObserver on the root ref), NOT window.innerWidth — so it's correct
// both full-page AND inside a narrow preview frame (the customiser's phone mock, where the window is
// desktop-wide but the storefront box is ~mobile). Mobile-first, SSR-safe default 'mobile'.
function useContainerBreakpoint() {
  const [bp, setBp] = useState(null);   // null = not measured yet → render a loader, not a guessed layout
  const roRef = useRef(null);
  // Callback ref → (re)attaches the observer whenever the root node mounts, even if the first render
  // was a loading state without the node yet. ResizeObserver also covers window/container resizes.
  const setRef = useCallback(el => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (el && typeof ResizeObserver !== 'undefined') {
      const read = () => setBp(bpOf(el.clientWidth));
      read();
      const ro = new ResizeObserver(read);
      ro.observe(el);
      roRef.current = ro;
    } else if (typeof window !== 'undefined') {
      setBp(bpOf(window.innerWidth));
    }
  }, []);
  return [bp, setRef];
}

// Varied, asymmetric wave paths so the bands don't all read as the same flat horizontal stripe.
const WAVES = [
  'M0,40 C300,90 720,4 1140,52 C1320,72 1400,40 1440,50 L1440,70 L0,70 Z',
  'M0,55 C360,2 800,84 1200,30 C1350,10 1410,52 1440,40 L1440,70 L0,70 Z',
  'M0,30 C260,78 640,8 1040,46 C1280,68 1380,28 1440,44 L1440,70 L0,70 Z',
];

// Full-width tinted band with a wavy (curved) top + bottom edge — the recurring soft-curve motif
// down the page. top/bottom can use DIFFERENT paths (asymmetry). innerStyle re-applies the content
// max-width container.
function WavyBand({ tint, fill, curveH, innerStyle, topPath = WAVES[0], bottomPath = WAVES[1], children }) {
  const wave = (flip, d) => (
    <svg
      style={{ position: 'absolute', [flip ? 'top' : 'bottom']: -1, left: 0, width: '100%', height: curveH, display: 'block', transform: flip ? 'scaleY(-1)' : 'none' }}
      viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill={fill} />
    </svg>
  );
  return (
    <div style={{ position: 'relative', background: tint, padding: `${curveH + 28}px 0` }}>
      {wave(true, topPath)}
      <div style={innerStyle}>{children}</div>
      {wave(false, bottomPath)}
    </div>
  );
}

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
  onEditPortrait = null,   // customiser only: makes the portrait an upload affordance
  designLabel = 'Start designing',
}) {
  const [baker, setBaker]     = useState(bakerProp);
  const [invite, setInvite]   = useState(null);
  const [loading, setLoading] = useState(!bakerProp);
  const [error, setError]     = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [howOpen, setHowOpen]     = useState(false);
  const [tIdx, setTIdx]           = useState(0);
  const [bp, rootRef] = useContainerBreakpoint();
  const galRef = useRef(null);   // "Our creations" scroll row (hook must precede any early return)

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

  // First thing an invited customer sees: a welcome that orients them to the path
  // (design → confirm identity → bake). Only for a valid invite; browse visits skip it.
  useEffect(() => { if (inviteId && invite?.valid) setWelcomeOpen(true); }, [inviteId, invite]);

  // Loader stays until the baker is fetched AND the container breakpoint is measured — so the FIRST
  // storefront paint is already at the correct layout (no mobile→desktop / default→config flash).
  // rootRef is attached to the loader too, so the breakpoint can measure before content renders.
  if (loading || !bp) return <Centered rootRef={rootRef}><CakeSpinner label="Loading…" /></Centered>;
  if (error)   return <Centered>{error}</Centered>;
  if (!baker)  return <Centered>Storefront unavailable</Centered>;

  // Storefront template — resolve the baker's chosen key (Settings → Storefront Theme, returned
  // by the public API as `storefront_theme`) to a built template; unknown/missing → the Standard
  // baseline. The template supplies the DESIGN TOKENS. ONE renderer below, driven by tokens —
  // new templates are data, not forked layouts.
  const template = resolveTemplate(baker.storefront_theme);
  // Baker font-theme lever (storefront_customizations.font_key) overlays the template's typography.
  const tokens = applyFontTheme(template.tokens, baker.storefront_customizations?.font_key);

  // COLOUR SOURCE = the baker's brand (the pickers), for EVERY template — full baker control. Each
  // template's palette (gradient, cake, band, ink) is DERIVED from these in buildPalette, so moving a
  // picker moves the whole design. A template only supplies DEFAULT colours (tokens.default*), which
  // the customiser seeds into the pickers when the template is selected — the starting point to tweak.
  // A baker with no saved colour falls back to the SELECTED template's designed defaults (e.g. a new
  // Spotlight baker gets its sage band), not a hardcoded literal — the template's `defaults` is the
  // single source of the starting palette. The literal is only a last resort if a template omits defaults.
  const primary = baker.primary_color || template.defaults?.primary || '#2C4433';
  const accent  = baker.accent_color  || template.defaults?.accent  || '#6B8C74';
  const ig      = baker.instagram_handle?.replace(/^@/, '');
  const phone   = baker.whatsapp || baker.whatsapp_number || baker.phone || null;
  const logo    = logoUrl || baker.logo_transparent_url || baker.logo_url;   // prefer the bg-removed logo (floats cleanly on any surface)
  const txt     = k => storefrontText(baker.storefront_customizations, k);   // baker-editable text + fallback

  // Hero/button text: the baker's cta_color, else the TEMPLATE's default (e.g. Spotlight ships light
  // #EAEBE5 for its sage band → white text). Only if a template omits it does buildPalette fall back to
  // its own adaptive onColor(band).
  const pal = buildPalette(primary, accent, tokens, { ctaColor: baker.storefront_customizations?.cta_color || template.defaults?.ctaColor });   // one place to tune every colour
  const s = styles(primary, accent, tokens, bp, pal);
  // Ordered, toggleable body sections (storefront_customizations.sections); absence → defaults.
  const sections = resolveSections(baker.storefront_customizations);
  // Interactive states (hover/active/focus) — inline styles can't express :hover, so one small
  // palette-driven stylesheet handles them. Colours come from `pal`, so this stays centralised too.
  const interactionCss = `
    .sf-cta { transition: background .18s ease, transform .18s ease, box-shadow .18s ease; }
    .sf-cta:hover:not(:disabled) { background: ${pal.ctaHover}; transform: translateY(-1px); box-shadow: 0 14px 34px ${alpha(primary, 0.3)}; }
    .sf-cta:active:not(:disabled) { transform: translateY(0); }
    .sf-cta:focus-visible { outline: 3px solid ${alpha(primary, 0.45)}; outline-offset: 3px; }
    .sf-navlink { transition: opacity .15s ease; }
    .sf-navlink:hover { opacity: .68; }
    .sf-arrow { transition: transform .15s ease, background .15s ease; }
    .sf-arrow:hover { background: ${pal.bandSoftA}; transform: translateY(-50%) scale(1.08); }
    .sf-gallery::-webkit-scrollbar { display: none; }
  `;
  const pageBg = tokens.pageBgMode === 'heroTop' ? pal.heroTop : tokens.pageBg;   // aurora: derived cream top; else the fixed token. (exposed for inline SVG fills)
  const { steps } = buildContent(baker);
  const testimonials = baker.testimonials || [];   // real reviews; empty → reviews section hidden

  const firstName = invite?.customer?.first_name || invite?.first_name || null;
  const occasion  = invite?.occasion || invite?.note || null;
  const expired = inviteId && invite && !invite.valid;
  // The baker's storefront is paused for new orders (trial lapsed / order cap). Show
  // a banner + disable the design CTAs so customers aren't blocked only at submit.
  // `accepting_orders` comes from the public storefront API.
  const notAcceptingOrders = baker.accepting_orders === false;

  function handleCta() {
    if (notAcceptingOrders) return;
    if (inviteId && invite?.valid) { setShowLogin(true); return; }
    if (expired) return;
    onStartDesign?.(baker);
  }

  // Nav items — only those with somewhere to go.
  // Real baker content; falls back to a clearly-marked sample so the section designs
  // end-to-end (Feelings & Flavours has no story/portrait on its record yet).
  const story    = baker.story || SAMPLE_STORY;
  const portrait = baker.portrait_url || null;   // a real baker photo; placeholder glyph otherwise
  const websiteHref = safeHref(baker.website_url);   // SEC-16 — https/http only; null → no link rendered

  const nav = [
    { label: 'Gallery', href: '#gallery' },
    { label: 'Our story', href: '#story' },
    { label: 'How it works', action: () => setHowOpen(true) },
    { label: 'Contact', href: '#contact' },
  ];

  const t = testimonials[tIdx % (testimonials.length || 1)];
  const move = d => setTIdx(i => (i + d + testimonials.length) % testimonials.length);

  // Gallery photos uploaded by the baker (baker.gallery); empty → graceful fallback below.
  const gallery = (galleryProp?.length ? galleryProp : baker.gallery) || [];
  const hasPhotos = gallery.length > 0;
  // "Our creations": 3 visible, horizontal-scroll with arrows once there are more than 3.
  const galScroll = dir => {
    const el = galRef.current;
    if (!el) return;
    const first = el.firstElementChild;
    const step = first ? first.getBoundingClientRect().width + (bp === 'mobile' ? 8 : 14) : el.clientWidth / 3;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  // Hero: the branded curve/split hero (with the live 3D cake) is ALWAYS the default — it needs no
  // photos, so it holds up for a brand-new storefront too. FULL-BLEED only when the baker sets an
  // explicit wide/lifestyle hero image. (The old dark "designer" hero fallback was removed — it was
  // the thing that reappeared when a baker had no gallery photos.)
  const heroImage = baker.storefront_customizations?.hero_image || null;   // baker-set wide/lifestyle hero photo
  // HERO TYPE (Phase 1 — pluggable heroes): a baker's wide hero photo overrides to the 'photo' hero;
  // otherwise the TEMPLATE declares its hero (tokens.hero.type; default 'centered-cake'). The renderer
  // dispatches through HERO_RENDERERS below — adding a hero is a new renderer + a template `hero.type`,
  // never a branch here. 'none' → no hero (just header + sections).
  const heroType = heroImage ? 'photo' : (tokens.hero?.type ?? 'centered-cake');
  // The brand tint flows up THROUGH the header only for the centred-cake (curve) hero — the logo sits
  // on the pink. Gradient / photo / none keep their own light header.
  const isCurveHero = heroType === 'centered-cake';
  const wide = bp !== 'mobile';
  const headerText = darken(primary, 0.12);   // header/nav sit on a LIGHT bar (band starts below the logo)
  const bandTints = [pal.bandSoftA, pal.bandSoftB];   // the two tone-on-tone section bands

  return (
    <div style={s.page} ref={rootRef}>
      <style>{interactionCss}</style>
      {phone && (
        <div style={s.utilbar}><PhoneIcon size={13} color={darken(primary, 0.1)} style={{ verticalAlign: '-2px', marginRight: 6 }} />Call / WhatsApp: <a href={`tel:${phone}`} style={s.utilLink}>{phone}</a></div>
      )}

      <header style={{ ...s.header, ...(isCurveHero ? { position: 'relative' } : {}) }}>
        <div style={{ ...s.brand, ...(wide ? { flex: 1 } : {}) }}>
          {logo
            ? <img src={logo} alt={baker.name} style={s.logoImg} />
            : <span style={{ ...s.brandName, color: headerText }}>{baker.name}</span>}
        </div>
        {bp === 'mobile' ? (
          <button type="button" aria-label="Menu" style={s.burger} onClick={() => setMenuOpen(true)}>
            <span style={{ ...s.burgerLine, background: headerText }} /><span style={{ ...s.burgerLine, background: headerText }} /><span style={{ ...s.burgerLine, background: headerText }} />
          </button>
        ) : (
          <>
            {/* Nav centered: brand (flex:1) + trailing spacer (flex:1) push the menu to the middle. */}
            <nav style={s.navRow}>
              {nav.map(n => n.href
                ? <a key={n.label} className="sf-navlink" href={n.href} style={{ ...s.navItem, color: headerText }}>{n.label}</a>
                : <button key={n.label} type="button" className="sf-navlink" style={{ ...s.navItem, ...s.navItemBtn, color: headerText }} onClick={n.action}>{n.label}</button>)}
            </nav>
            <div style={{ flex: 1 }} aria-hidden="true" />
          </>
        )}
      </header>

      {notAcceptingOrders && (
        <div style={{
          background: lighten(accent, 0.34), color: darken(primary, 0.12),
          textAlign: 'center', padding: '11px 16px', fontSize: 13.5, fontWeight: 600, lineHeight: 1.4,
        }}>
          This bakery isn't accepting new orders right now — please check back soon.
        </div>
      )}

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

      {/* ── HERO ── the template picks the type (tokens.hero.type); a baker hero photo overrides to
          the photo hero. ONE dispatch through the registry — no per-type branch here. */}
      {(HERO_RENDERERS[heroType] ?? HERO_RENDERERS['centered-cake'])({
        s, txt, expired, baker, notAcceptingOrders, designLabel, handleCta, pal, accent, bp, wide, pageBg, heroImage,
      })}

      {/* Body = ordered, toggleable sections (storefront_customizations.sections). Wavy bands
          alternate tint/wave by their position among the wavy sections, so reorder/toggle stays
          correct. Gallery lives on the plain white main; story/reviews/highlight ride wavy bands. */}
      {(() => {
        let bandIdx = 0;
        const wavy = (key, children) => {
          const tint = bandTints[bandIdx % bandTints.length];
          const topPath = WAVES[bandIdx % WAVES.length];
          const bottomPath = WAVES[(bandIdx + 1) % WAVES.length];
          bandIdx++;
          return (
            <WavyBand key={key} tint={tint} fill={pageBg} curveH={wide ? 64 : 46} topPath={topPath} bottomPath={bottomPath} innerStyle={s.main}>
              {children}
            </WavyBand>
          );
        };
        return sections.map((sec, i) => {
          if (!sec.enabled) return null;
          switch (sec.type) {
            case 'gallery':
              return (
                <main key="gallery" style={s.main}>
                  <Section id="gallery" eyebrow={txt('creations_heading')} s={s}>
                    {hasPhotos ? (
                      // 3 visible at a time; horizontal-scroll with arrows once there are more than 3.
                      <div style={s.galleryWrap}>
                        {gallery.length > 3 && <button type="button" aria-label="Previous" className="sf-arrow" style={{ ...s.arrow, ...s.arrowL }} onClick={() => galScroll(-1)}>‹</button>}
                        <div ref={galRef} className="sf-gallery" style={s.galleryScroll}>
                          {gallery.map((g, gi) => (
                            <figure key={gi} style={s.galleryItem}>
                              <div style={s.gGridCard}><img src={g.url || g} alt={g.caption || `${baker.name} cake`} style={s.gImg} /></div>
                              {g.caption && <figcaption style={s.gGridCap}>{g.caption}</figcaption>}
                            </figure>
                          ))}
                        </div>
                        {gallery.length > 3 && <button type="button" aria-label="Next" className="sf-arrow" style={{ ...s.arrow, ...s.arrowR }} onClick={() => galScroll(1)}>›</button>}
                      </div>
                    ) : (
                      <div style={{ ...s.gFallback, background: `linear-gradient(135deg, ${lighten(primary, 0.42)}, ${lighten(accent, 0.16)})` }}>
                        <CakeIcon size={52} color={alpha('#ffffff', 0.8)} />
                        <div style={s.gFallbackText}>Fresh photos coming soon</div>
                        <button type="button" className="sf-cta" disabled={notAcceptingOrders}
                          style={{ ...s.gFallbackCta, ...(notAcceptingOrders ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                          onClick={handleCta}>
                          {notAcceptingOrders ? 'Not taking new orders' : 'Design your own'}
                        </button>
                      </div>
                    )}
                  </Section>
                </main>
              );
            case 'highlight': {
              // Baker-set featured item ("this week's special"). Rendered only when it has content.
              if (!(sec.title || sec.blurb || sec.image)) return null;
              return wavy(`highlight-${i}`, (
                <section id={`highlight-${i}`} style={{ padding: '4px 0' }}>
                  {/* The baker's TITLE is the heading (no hardcoded eyebrow); image sits BELOW the text. */}
                  <div style={s.highlightText}>
                    {sec.title && <h3 style={s.highlightTitle}>{sec.title}</h3>}
                    {sec.blurb && <p style={s.highlightBlurb}>{sec.blurb}</p>}
                  </div>
                  {sec.image && <div style={s.highlightMedia}><img src={sec.image} alt={sec.title || ''} style={s.highlightImg} /></div>}
                </section>
              ));
            }
            case 'story':
              return wavy('story', (
                <section id="story" style={{ padding: '4px 0' }}>
                  <div style={s.eyebrow}>{txt('story_heading')}</div>
                  <div style={s.storyWrap}>
                    <div
                      style={{ ...s.portraitWrap, ...(onEditPortrait ? { cursor: 'pointer' } : {}) }}
                      onClick={onEditPortrait || undefined}
                      title={onEditPortrait ? 'Upload your photo' : undefined}
                    >
                      <div style={s.portrait}>
                        {portrait ? <img src={portrait} alt={baker.name} style={s.portraitImg} /> : <BakerIcon size={66} color={primary} />}
                      </div>
                      {onEditPortrait && <div style={s.portraitBadge}><CameraIcon size={16} color="#fff" /></div>}
                    </div>
                    {onEditPortrait && <div style={s.portraitHint}>{portrait ? 'Click to change your photo' : 'Click to add your photo'}</div>}
                    <div style={s.storyText}>
                      <p style={s.bio}>{story}</p>
                      <div style={s.signature}>— {baker.name}</div>
                    </div>
                  </div>
                </section>
              ));
            case 'reviews':
              if (!testimonials.length) return null;
              return wavy('reviews', (
                <Section eyebrow={txt('reviews_heading')} s={s}>
                  <div style={s.carousel}>
                    {testimonials.length > 1 && <button type="button" aria-label="Previous" className="sf-arrow" style={{ ...s.arrow, ...s.arrowL }} onClick={() => move(-1)}>‹</button>}
                    <figure style={s.testiCard}>
                      <div style={s.stars}>★★★★★</div>
                      <blockquote style={s.quote}>“{t.quote}”</blockquote>
                      <figcaption style={s.author}>{t.author}{t.occasion && <span style={s.authorOcc}> · {t.occasion}</span>}</figcaption>
                    </figure>
                    {testimonials.length > 1 && <button type="button" aria-label="Next" className="sf-arrow" style={{ ...s.arrow, ...s.arrowR }} onClick={() => move(1)}>›</button>}
                  </div>
                  {testimonials.length > 1 && (
                    <div style={s.dotsRow}>
                      {testimonials.map((_, ti) => <span key={ti} style={{ ...s.dot, ...(ti === tIdx ? s.dotOn : {}) }} onClick={() => setTIdx(ti)} />)}
                    </div>
                  )}
                </Section>
              ));
            default:
              return null;
          }
        });
      })()}

      <footer id="contact" style={s.footer}>
        {(phone || ig || websiteHref) && (
          <div style={s.footerLinks}>
            {phone && <a href={`tel:${phone}`} style={s.footerLink}><PhoneIcon size={13} color={lighten(accent, 0.1)} style={{ verticalAlign: '-2px', marginRight: 5 }} />{phone}</a>}
            {ig && <a style={s.footerLink} href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer">@{ig}</a>}
            {websiteHref && <a style={s.footerLink} href={websiteHref} target="_blank" rel="noreferrer">Website</a>}
          </div>
        )}
        <div style={s.madeWith}>Made with Spattoo</div>
      </footer>

      {welcomeOpen && (
        <WelcomeModal
          bakerName={baker.name}
          firstName={firstName}
          occasion={occasion}
          logo={logo}
          primary={primary}
          accent={accent}
          onClose={() => setWelcomeOpen(false)}
        />
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
function CameraIcon({ size = 16, color = '#fff', style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2L8.4 4.5h7.2L17 6.5h2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.3" />
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
      {title && <h2 style={s.sectionTitle}>{title}</h2>}
      {children}
    </section>
  );
}

// ── Invite welcome ──────────────────────────────────────────────────────────────
// The first thing an invited customer sees. Blurs the storefront and orients them,
// then OK closes it so they can browse the baker's story + gallery before designing
// (the sticky "Start designing" CTA is always there when they're ready).
function WelcomeModal({ bakerName, firstName, occasion, logo, primary, accent, onClose }) {
  const m = welcomeStyles(primary, accent);
  const cakePhrase = occasion ? `your ${occasion} cake` : 'your dream cake';
  return (
    <div style={m.overlay} role="dialog" aria-modal="true" aria-label={`Invitation from ${bakerName}`}>
      <div style={m.card}>
        <div style={m.eyebrow}>You’re invited</div>
        {logo
          ? <img src={logo} alt={bakerName} style={m.logo} />
          : <div style={m.bakerName}>{bakerName}</div>}
        <h2 style={m.title}>{firstName ? `${firstName}, design ` : 'Design '}{cakePhrase}</h2>
        <p style={m.sub}>{bakerName} has invited you to design your own cake — watch it come together live in 3D, then they bake it for you.</p>
        <button type="button" style={m.start} onClick={onClose}>OK</button>
      </div>
    </div>
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

function Centered({ children, rootRef }) {
  return (
    <div ref={rootRef} style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, color: '#6B8C74', fontWeight: 600, background: '#EDEAE2' }}>
      {children}
    </div>
  );
}

// ── Hero renderers (Phase 1 — pluggable heroes) ─────────────────────────────────────────────────
// Each renders the hero <section> for ONE hero type, from a shared ctx (the storefront's locals). The
// template picks the type via tokens.hero.type; a baker hero photo overrides to 'photo'. Adding a hero
// = a new function here + a HERO_RENDERERS entry + a template's `hero.type`. No branch in the renderer.
// The message + CTA in a LEFT column, a big rotating cake bleeding off the right on a soft gradient.
function gradientCakeHero({ s, txt, expired, baker, notAcceptingOrders, designLabel, handleCta, pal, accent, bp, wide }) {
  return (
    <section style={s.gradHero}>
      <div style={s.gradInner}>
        <div style={s.gradText}>
          <h1 style={s.gradTitle}>{txt('hero_tagline')}</h1>
          <p style={s.gradSub}>{txt('hero_subtitle')}</p>
          {expired ? (
            <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
          ) : (
            <button type="button" className="sf-cta" disabled={notAcceptingOrders}
              style={{ ...s.gradCta, ...(notAcceptingOrders ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
              onClick={handleCta}>
              {notAcceptingOrders ? 'Not taking new orders' : designLabel}
            </button>
          )}
        </div>
      </div>
      {/* Big cake, anchored right and pushed off-edge so only ~half shows (section clips it).
          Draggable to rotate; NO studio grid so it floats cleanly on the gradient. */}
      <div style={s.gradMedia}>
        <HeroCake3D primary={pal.cake} accent={accent} mood="light" height={bp === 'desktop' ? 560 : wide ? 480 : 400} spin={0.4} drip dripColor={pal.drip} />
      </div>
    </section>
  );
}
// The signature centred cake on a brand-tinted band with a wavy bottom (split on wide, stacked curve
// on mobile). The 3D cake floats on the band (transparent canvas) inside the studio grid.
function centeredCakeHero({ s, txt, expired, baker, notAcceptingOrders, designLabel, handleCta, pal, accent, bp, wide, pageBg }) {
  return wide ? (
    <section style={s.curveHero}>
      <div style={s.splitBand}>
        <div style={s.splitInner}>
          <div style={s.splitText}>
            <h1 style={s.splitTitle}>{txt('hero_tagline')}</h1>
            <p style={s.splitSub}>{txt('hero_subtitle')}</p>
            {expired ? (
              <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
            ) : (
              <button type="button" className="sf-cta" disabled={notAcceptingOrders}
                style={{ ...s.splitCta, ...(notAcceptingOrders ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                onClick={handleCta}>
                {notAcceptingOrders ? 'Not taking new orders' : designLabel}
              </button>
            )}
          </div>
          <div style={s.splitMedia}>
            <HeroCake3D primary={pal.cake} accent={accent} mood="light" height={bp === 'desktop' ? 460 : 380} spin={0.4} grid gridColor={pal.grid} gridOpacity={pal.gridOpacity} drip dripColor={pal.drip} />
          </div>
        </div>
        <svg style={s.splitWave} viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,30 C380,78 1060,-6 1440,46 L1440,70 L0,70 Z" fill={pageBg} />
        </svg>
      </div>
    </section>
  ) : (
    <section style={s.curveHero}>
      <div style={s.curveBand}>
        <h1 style={s.curveTitle}>{txt('hero_tagline')}</h1>
        {txt('hero_subtitle') && <p style={s.curveSub}>{txt('hero_subtitle')}</p>}
        <div style={s.curveCake}>
          <HeroCake3D primary={pal.cake} accent={accent} mood="light" height={300} spin={0.4} grid gridColor={pal.grid} gridOpacity={pal.gridOpacity} drip dripColor={pal.drip} />
        </div>
        <svg style={s.curveWave} viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,30 C380,78 1060,-6 1440,46 L1440,70 L0,70 Z" fill={pageBg} />
        </svg>
      </div>
      <div style={s.curveBody}>
        {expired ? (
          <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
        ) : (
          <button type="button" className="sf-cta" disabled={notAcceptingOrders}
            style={{ ...s.curveCta, ...(notAcceptingOrders ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
            onClick={handleCta}>
            {notAcceptingOrders ? 'Not taking new orders' : designLabel}
          </button>
        )}
      </div>
    </section>
  );
}
// Full-bleed baker lifestyle photo with the tagline + CTA overlaid.
function photoHero({ s, txt, expired, baker, notAcceptingOrders, designLabel, handleCta, heroImage }) {
  return (
    <section style={s.hero}>
      <div style={{ ...s.heroCake, backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-label={baker.name} />
      <div style={s.heroScrim} />
      <div style={s.heroFade} />
      <div style={s.heroContent}>
        <div><h1 style={s.heroEyebrow}>{txt('hero_tagline')}</h1></div>
        <div style={s.heroBottom}>
          {expired ? (
            <p style={s.expired}>This invite has expired. Please ask {baker.name} for a new link.</p>
          ) : (
            <button type="button" disabled={notAcceptingOrders}
              style={{ ...s.heroCta, ...(notAcceptingOrders ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
              onClick={handleCta}>
              {notAcceptingOrders ? 'Not taking new orders' : designLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
// The registry — template `hero.type` (or a baker photo) selects one. 'none' → no hero (just sections).
const HERO_RENDERERS = {
  'gradient-cake': gradientCakeHero,
  'centered-cake': centeredCakeHero,
  'photo':         photoHero,
  'none':          () => null,
};

function styles(primary, accent, tk, bp = 'mobile', pal) {
  // Template design tokens (tk) supply the look; the baker's primary/accent overlay. FONT/SERIF
  // shadow the module imports so the rest of styles() picks up the template's typography.
  const FONT = tk.font, SERIF = tk.serif;
  const ink = mix(primary, tk.inkMix.with, tk.inkMix.amount);  // soft warm-grey hero/footer
  const { heading, text, muted, shadow } = tk;
  const pageBg = tk.pageBgMode === 'heroTop' ? pal.heroTop : tk.pageBg;   // aurora: derived cream top surface
  // Brand-derived colours all come from the shared palette (storefrontKit → buildPalette) — the
  // single place to tune the tone-on-tone look. Aliased here so the style rules stay readable.
  const bandStrong = pal.bandStrong;   // hero + header band
  const cardBorder = pal.hairline;     // rose-tinted card / divider borders
  const brandFont = tk.brandFont || tk.font;
  const desktop = bp === 'desktop', wide = bp !== 'mobile';
  // Responsive content width — a phone column on mobile, but USE the screen on bigger devices
  // (the storefront is customer-facing; it must not be a skinny strip on desktop).
  const cw = desktop ? 1040 : wide ? 760 : tk.contentWidth;
  // Aurora gradient-hero layout knobs (config-driven, per breakpoint: [mobile, tablet, desktop]).
  const hero = tk.hero || {};
  const hIdx = desktop ? 2 : wide ? 1 : 0;
  const hPick = (a, d) => (Array.isArray(a) ? a[hIdx] : a) ?? d;
  return {
    page:        { minHeight: '100vh', background: pageBg, fontFamily: FONT, color: text, display: 'flex', flexDirection: 'column' },

    utilbar:     { background: tk.utilbarBg ?? lighten(primary, 0.9), color: darken(primary, 0.1), fontSize: 13.5, fontWeight: 700, textAlign: 'center', padding: '9px 16px' },
    utilLink:    { color: darken(primary, 0.1), textDecoration: 'none' },
    header:      { position: tk.headerBg === 'transparent' ? 'relative' : 'sticky', top: 0, zIndex: 30, background: tk.headerBg ?? 'rgba(252,250,247,0.92)', backdropFilter: tk.headerBg === 'transparent' ? 'none' : 'blur(8px)', borderBottom: `1px solid ${tk.headerBorderColor ?? cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' },
    brand:       { display: 'flex', alignItems: 'center', gap: 10 },
    logoImg:     { height: wide ? 52 : 44, width: 'auto', maxWidth: wide ? 300 : 240, objectFit: 'contain', display: 'block' },
    logo:        { width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}`, background: '#fff' },
    logoFallback:{ width: 38, height: 38, borderRadius: '50%', background: pal.cta, color: pal.onCta, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 },
    brandName:   { fontFamily: brandFont, fontSize: wide ? 30 : 26, fontWeight: 400, color: heading, lineHeight: 1 },
    navRow:      { display: 'flex', alignItems: 'center', gap: 28 },
    navItem:     { fontSize: 14.5, fontWeight: 600, color: heading, textDecoration: 'none', cursor: 'pointer', fontFamily: FONT, letterSpacing: 0.2 },
    navItemBtn:  { background: 'none', border: 'none', padding: 0 },
    burger:      { width: 42, height: 42, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4, padding: 0 },
    burgerLine:  { width: 18, height: 2, borderRadius: 2, background: heading },

    drawerOverlay:{ position: 'fixed', inset: 0, background: 'rgba(20,14,16,0.4)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' },
    drawer:      { width: 'min(78vw, 300px)', height: '100%', background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)', padding: '64px 26px 26px', display: 'flex', flexDirection: 'column', gap: 4 },
    drawerClose: { position: 'absolute', top: 14, right: 18, fontSize: 30, lineHeight: 1, background: 'none', border: 'none', color: muted, cursor: 'pointer' },
    drawerLink:  { padding: '14px 4px', fontSize: 17, fontWeight: 700, color: heading, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` },
    drawerLinkBtn:{ background: 'none', border: 'none', borderBottom: `1px solid ${cardBorder}`, textAlign: 'left', cursor: 'pointer', fontFamily: FONT, width: '100%' },
    drawerCta:   { marginTop: 20, padding: '14px', borderRadius: 12, border: 'none', background: pal.cta, color: pal.onCta, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT },

    hero:        { position: 'relative', width: '100%', height: '50vh', minHeight: 380, maxHeight: 480, background: `linear-gradient(180deg, ${lighten(ink, 0.06)}, ${ink})`, overflow: 'hidden' },
    heroCake:    { position: 'absolute', inset: 0 },
    heroScrim:   { position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(ink, 0.82)} 0%, ${alpha(ink, 0.32)} 24%, transparent 44%, ${alpha(ink, 0.4)} 64%, transparent 84%)`, pointerEvents: 'none' },
    // Dissolve the dark hero into the page colour at the seam — no hard edge.
    heroFade:    { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', background: `linear-gradient(180deg, transparent 0%, ${alpha(pageBg, 0.0)} 8%, ${pageBg} 100%)`, zIndex: 1, pointerEvents: 'none' },
    // pointerEvents none so drags pass through to the 3D canvas; the CTA re-enables itself.
    heroContent: { position: 'relative', zIndex: 2, height: '100%', maxWidth: cw, margin: '0 auto', padding: '54px 24px 30px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center', alignItems: 'center', color: '#fff', pointerEvents: 'none' },
    heroEyebrow: { fontSize: 12.5, fontWeight: 600, letterSpacing: 2.4, textTransform: 'uppercase', color: lighten(accent, 0.1), margin: 0, lineHeight: 1.5, textShadow: '0 2px 14px rgba(0,0,0,0.3)' },
    heroBottom:  { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    welcome:     { fontSize: 13.5, fontWeight: 700, color: '#fff', margin: '0 0 14px', background: alpha('#ffffff', 0.16), border: `1px solid ${alpha('#ffffff', 0.28)}`, padding: '9px 14px', borderRadius: 12, lineHeight: 1.5, backdropFilter: 'blur(4px)' },
    heroCta:     { padding: '15px 34px', borderRadius: 14, border: `2px solid ${lighten(accent, 0.1)}`, background: alpha(ink, 0.4), color: lighten(accent, 0.1), fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, backdropFilter: 'blur(8px)', pointerEvents: 'auto' },
    expired:     { fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(192,57,43,0.9)', padding: '12px 18px', borderRadius: 12 },
    heroHint:    { fontSize: 12.5, fontWeight: 600, color: alpha('#ffffff', 0.82), marginTop: 14, maxWidth: 320 },

    // Photo hero — the baker's featured creation FRAMED beside the tagline/CTA (not a full-bleed
    // crop). Light, contained, responsive: side-by-side on desktop, photo-over-text on mobile.
    photoHero:      { background: pageBg, padding: wide ? '40px 24px 6px' : '24px 20px 6px' },
    photoHeroInner: { maxWidth: cw, margin: '0 auto', display: 'flex', flexDirection: desktop ? 'row' : 'column-reverse', alignItems: 'center', gap: desktop ? 48 : 26 },
    photoHeroText:  { flex: 1, display: 'flex', flexDirection: 'column', gap: 22, alignItems: desktop ? 'flex-start' : 'center', textAlign: desktop ? 'left' : 'center' },
    photoHeroTitle: { fontFamily: SERIF, fontSize: wide ? 30 : 23, fontWeight: 600, color: heading, margin: 0, lineHeight: 1.25, letterSpacing: 0.2 },
    photoHeroCta:   { padding: '15px 34px', borderRadius: 14, border: 'none', background: pal.cta, color: pal.onCta, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow },
    photoHeroMedia: { width: '100%', maxWidth: 480 },
    photoHeroImg:   { width: '100%', aspectRatio: desktop ? '4 / 5' : '4 / 3', objectFit: 'cover', borderRadius: 22, boxShadow: shadow, display: 'block', border: `1px solid ${cardBorder}` },

    // Curved-band hero (Honeybear-style): a brand-tinted top band with a wavy SVG bottom edge,
    // headline on the colour, featured cake pulled up over the curve. (Colours = brand tint for
    // now; baker colour controls come later.)
    curveHero:  { background: pageBg },
    curveBand:  { position: 'relative', background: bandStrong, padding: wide ? '54px 24px 80px' : '40px 22px 66px', textAlign: 'center' },
    curveTitle: { fontFamily: SERIF, fontSize: wide ? 34 : 26, fontWeight: 700, color: pal.heroText, margin: '0 auto', lineHeight: 1.2, letterSpacing: 0.2, maxWidth: 560, textShadow: `0 1px 12px ${alpha(darken(primary, 0.2), 0.28)}` },
    curveSub:   { fontSize: 15, fontWeight: 600, color: alpha(pal.heroText, 0.96), margin: '10px auto 0', lineHeight: 1.55, maxWidth: 440, textAlign: 'center' },
    curveWave:  { position: 'absolute', left: 0, bottom: -1, width: '100%', height: wide ? 70 : 48, display: 'block' },
    curveBody:  { maxWidth: cw, margin: '0 auto', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 },
    curveCake:  { width: '100%', maxWidth: 340, margin: '4px auto -6px' },
    curveImg:   { width: '100%', maxWidth: wide ? 460 : 360, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 20, boxShadow: shadow, border: `1px solid ${cardBorder}`, marginTop: wide ? -50 : -38, background: '#fff' },
    curveCta:   { padding: '15px 34px', borderRadius: 14, border: 'none', background: pal.cta, color: pal.onCta, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow },

    // Split hero (tablet/desktop variant of the curved-band hero): message + CTA on the left, one
    // large featured cake on the right, all sitting on the brand-tinted band with the signature wavy
    // bottom. Fills the width and gives a single strong focal cake. Mobile keeps the stacked curve.
    splitBand:  { position: 'relative', background: bandStrong },
    splitInner: { position: 'relative', zIndex: 2, maxWidth: cw, margin: '0 auto', padding: desktop ? '68px 24px 104px' : '54px 24px 92px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: desktop ? 56 : 40 },
    splitText:  { flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 22 },
    splitTitle: { fontFamily: SERIF, fontSize: desktop ? 46 : 36, fontWeight: 700, color: pal.heroText, margin: 0, lineHeight: 1.08, letterSpacing: 0.2, textShadow: `0 1px 12px ${alpha(darken(primary, 0.2), 0.28)}` },
    splitSub:   { fontSize: desktop ? 18 : 16, fontWeight: 600, color: alpha(pal.heroText, 0.96), margin: 0, lineHeight: 1.6, maxWidth: 460 },
    splitCta:   { padding: '16px 38px', borderRadius: 14, border: 'none', background: pal.cta, color: pal.onCta, fontSize: 16.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow },
    splitMedia: { flex: '0 0 auto', width: desktop ? 440 : 340 },
    splitImg:   { width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 26, boxShadow: shadow, border: `1px solid ${cardBorder}`, background: '#fff', display: 'block' },
    splitWave:  { position: 'absolute', left: 0, bottom: -1, width: '100%', height: desktop ? 72 : 56, display: 'block', zIndex: 1 },

    // Aurora GRADIENT hero: a soft warm cream wash (tk.heroGradient). The message + CTA sit in a
    // contained LEFT column; one BIG rotating chocolate cake is anchored to the section's right and
    // pushed off-edge so only ~half shows (the section clips it). Bold + distinct vs the Standard
    // band/wave. The section is the positioning context; the cake bleeds past the screen edge.
    // Content flows from near the TOP (not vertically centred) so the headline sits high, clear of
    // the cake. gradInner is click-through (pointerEvents:none) so the cake behind stays draggable;
    // gradText re-enables events for the CTA. The headline is sized to keep the default tagline on
    // one line at each breakpoint.
    gradHero:  { position: 'relative', overflow: 'hidden', background: pal.heroGradient || pageBg, minHeight: hPick(hero.minHeight, desktop ? 540 : wide ? 460 : 400), padding: wide ? '0 24px' : '0 20px', boxSizing: 'border-box' },
    gradInner: { position: 'relative', zIndex: 2, width: '100%', maxWidth: cw, margin: '0 auto', paddingTop: wide ? 72 : 42, paddingBottom: wide ? 56 : 32, pointerEvents: 'none' },
    // width = the message column (config); the headline fills it (one line), the subtitle is capped
    // narrower (config) so it stays LEFT of the cake, never overlapping it.
    gradText:  { pointerEvents: 'auto', width: hPick(hero.textWidth, wide ? '58%' : '90%'), maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 20 },
    // Headline/subtitle colour = pal.heroInk (the Hero-text picker, else dark on the light gradient).
    gradTitle: { fontFamily: SERIF, fontSize: desktop ? 46 : wide ? 36 : 26, fontWeight: 800, color: pal.heroInk, margin: 0, lineHeight: 1.08, letterSpacing: -0.5 },
    gradSub:   { fontSize: desktop ? 17 : 15, fontWeight: 600, color: alpha(pal.heroInk, 0.82), margin: 0, lineHeight: 1.5, maxWidth: hPick(hero.subMaxWidth, 300) },
    // Button bg = the brand (pal.cta); label ADAPTS to it (readable on any picked colour).
    gradCta:   { padding: '16px 40px', borderRadius: 40, border: 'none', background: pal.cta, color: onColor(pal.cta), fontSize: 16.5, fontWeight: 800, cursor: 'pointer', fontFamily: FONT, boxShadow: shadow },
    // Anchored to the section's right and pushed off-screen (config negative right) → ~half shows.
    // Interactive (draggable to rotate) — the click-through gradInner keeps it reachable.
    gradMedia: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: hPick(hero.cakeRight, desktop ? -150 : wide ? -130 : -120), width: hPick(hero.cakeWidth, desktop ? 640 : wide ? 540 : 430), zIndex: 1 },

    main:        { maxWidth: cw, width: '100%', margin: '0 auto', padding: '0 24px', boxSizing: 'border-box' },
    section:     { padding: wide ? '66px 0 8px' : '46px 0 6px' },
    eyebrow:     { fontSize: 11.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: primary, marginBottom: 12, textAlign: 'center' },
    sectionTitle:{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: heading, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.3 },

    steps:       { display: 'grid', gap: 12 },
    stepCard:    { display: 'flex', gap: 16, alignItems: 'flex-start', background: '#fff', border: `1px solid ${cardBorder}`, boxShadow: shadow, borderRadius: 16, padding: '20px 20px' },
    stepNum:     { fontSize: 26, fontWeight: 700, color: primary, lineHeight: 1, flexShrink: 0 },
    stepTitle:   { fontSize: 16.5, fontWeight: 700, color: heading, marginBottom: 5 },
    stepBody:    { fontSize: 14, fontWeight: 500, lineHeight: 1.55, color: muted, margin: 0 },

    // Highlight — baker-set featured band: TITLE (heading) → blurb → image below, centred.
    highlightText:  { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center', maxWidth: 560, margin: '0 auto' },
    highlightTitle: { fontFamily: SERIF, fontSize: wide ? 28 : 23, fontWeight: 700, color: heading, margin: 0, lineHeight: 1.2 },
    highlightMedia: { width: '100%', maxWidth: wide ? 460 : 360, margin: '20px auto 0' },
    highlightImg:   { width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 18, boxShadow: shadow, border: `1px solid ${cardBorder}`, display: 'block' },
    highlightBlurb: { fontSize: 15.5, fontWeight: 500, lineHeight: 1.65, color: text, margin: 0 },

    // Our story
    storyWrap:   { display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: 'center', textAlign: desktop ? 'left' : 'center', gap: desktop ? 40 : 0, maxWidth: desktop ? 820 : 460, margin: '0 auto' },
    storyText:   { flex: 1 },
    portraitWrap:{ position: 'relative', width: 116, height: 116, marginBottom: desktop ? 0 : 20, flexShrink: 0 },
    portrait:    { width: 116, height: 116, borderRadius: '50%', background: `linear-gradient(135deg, ${lighten(primary, 0.35)}, ${lighten(accent, 0.1)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: shadow, border: '4px solid #fff', boxSizing: 'border-box' },
    portraitBadge:{ position: 'absolute', bottom: 0, right: 0, width: 34, height: 34, borderRadius: '50%', background: primary, border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' },
    portraitHint:{ fontSize: 12.5, fontWeight: 700, color: primary, margin: '-8px 0 16px' },
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
    galleryWrap:   { position: 'relative', maxWidth: wide ? 760 : '100%', margin: '0 auto' },
    galleryScroll: { display: 'flex', gap: wide ? 14 : 8, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', width: '100%', paddingBottom: 2 },
    galleryItem:   { flex: `0 0 calc((100% - ${wide ? 28 : 16}px) / 3)`, minWidth: 0, scrollSnapAlign: 'start', margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
    gGridFig:    { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
    gGridCard:   { aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', boxShadow: shadow, background: '#fff', border: `1px solid ${cardBorder}` },
    gGridCap:    { fontSize: 13, fontWeight: 600, color: muted, textAlign: 'center' },
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

function welcomeStyles(primary, accent) {
  const heading = mix(primary, '#2b2228', 0.42);
  const muted   = mix(primary, '#8d878a', 0.5);
  return {
    overlay:  { position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'rgba(28,20,24,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
    card:     { width: '100%', maxWidth: 384, boxSizing: 'border-box', background: '#FFFDFB', borderRadius: 24, padding: '34px 26px 22px', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.34)', fontFamily: FONT },
    eyebrow:  { fontSize: 11.5, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: primary, marginBottom: 12 },
    logo:     { maxHeight: 38, maxWidth: 210, objectFit: 'contain', display: 'block', margin: '0 auto 8px' },
    bakerName:{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: heading, marginBottom: 6 },
    title:    { fontFamily: SERIF, fontSize: 27, fontWeight: 600, color: heading, lineHeight: 1.18, margin: '4px 0 12px' },
    sub:      { fontSize: 14.5, lineHeight: 1.55, color: muted, margin: '0 2px 24px' },
    start:    { width: '100%', boxSizing: 'border-box', padding: '15px', borderRadius: 14, border: 'none', background: pal.cta, color: pal.onCta, fontFamily: FONT, fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: `0 8px 22px ${alpha(primary, 0.38)}` },
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
