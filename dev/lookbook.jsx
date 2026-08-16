import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useNarrow } from '../src/shared/useNarrow.js';

/* ── PROTOTYPE: the Lookbook ─────────────────────────────────────────────────────────────────────
 *
 * Spotlight, Aurora and Atelier are the same storefront — hero, blurb, gallery, CTA — in different
 * clothes. Their tokens are radius, shadow, align, edges, cardStyle: every one a STYLE, not one of
 * them a change to what the page DOES. That is why a fourth set of colours never felt like a fourth
 * theme.
 *
 * This one has a job: the hero IS the baker's catalogue, and every cake in it is a door into the
 * designer with the design already loaded.
 *
 * ── WHY THIS IS NOT JUST A NICER GALLERY ────────────────────────────────────────────────────────
 * Because the pictures are EDITABLE. DesignFacet already carries the path — picking a template
 * writes { kind: 'template', templateId } onto the draft and hands the flavour and size facets the
 * tier count and shape so they never ask again. Its own comment says why templates lead: a template
 * is the only door producing something COMPLETE, so a quote can be reached with nothing read or
 * guessed, where a photo is a request somebody must interpret. That door was three taps inside a
 * modal; this puts it on the front page.
 *
 * ── WHY A SLIDESHOW AND NOT A LONG PAGE ─────────────────────────────────────────────────────────
 * The first pass ran the catalogue as six full-height plates down the page, with the main button at
 * the bottom. Everything this business earns is behind that button, and it sat six screens down —
 * the concept winning an argument it should have lost.
 *
 * A hero that is a picture of nothing with a button under it would have been the safe fix, and it
 * would have turned this straight back into hero-blurb-gallery-CTA. A slideshow keeps both: the
 * whole catalogue and the button occupy ONE screen. Range is shown by moving through it rather than
 * by scrolling past it, and every slide carries its own story, so the cakes do the talking that a
 * blurb usually does badly.
 */

// Shaped exactly like fetchStorefrontTemplates() returns, so wiring is a swap, not a rewrite.
const TEMPLATES = [
  { id: 1, name: 'Rose & Pistachio',  thumbnail_url: '/sample-cake-1.png', tier_count: 3, shape: 'round',  attrs: { min_weight_kg: 3 },   story: 'Made for a December wedding in Jubilee Hills — three tiers, rosewater buttercream, real pistachio sponge.' },
  { id: 2, name: 'Cocoa Drip',        thumbnail_url: '/sample-cake-3.png', tier_count: 2, shape: 'round',  attrs: { min_weight_kg: 1.5 }, story: 'A birthday, twice over: the same cake ordered two years running, because the first one disappeared in ten minutes.' },
  { id: 3, name: 'Buttercream Bloom', thumbnail_url: '/sample-cake-2.png', tier_count: 1, shape: 'round',  attrs: { min_weight_kg: 1 },   story: 'Piped by hand, petal by petal. Four hours of work and not a single sugar flower bought in.' },
  { id: 4, name: 'Ivory & Gold',      thumbnail_url: '/sample-cake-1.png', tier_count: 2, shape: 'square', attrs: { min_weight_kg: 2 },   story: 'An anniversary, and a brief that ran to two words: quiet and gold.' },
  { id: 5, name: 'Midnight Ganache',  thumbnail_url: '/sample-cake-3.png', tier_count: 3, shape: 'round',  attrs: { min_weight_kg: 4 },   story: 'For someone who does not like sweet things — dark ganache, almost no sugar, and it went first.' },
];

const BAKER = 'AARAVI';

// ── THE IMAGE SLOT ──────────────────────────────────────────────────────────────────────────────
// A baker's own hero photo if they have set one, otherwise the cake currently showing. The
// COMPOSITION does not care which — same bleed, same crop, same type over it.
//
// ⚠️ This is not how hero_image behaves today. CustomerStorefront does
// `heroType = heroImage ? 'photo' : tokens.hero.type`, so setting a photo REPLACES the template's
// hero with the generic photo one. For every other theme that is fine. For this one it would delete
// the concept the baker chose the theme for: their catalogue would vanish the moment they uploaded
// a picture. A template that owns an image slot has to consume hero_image rather than be overridden
// by it — a real change to that line when this gets wired.
const HERO_IMAGE = new URLSearchParams(location.search).get('photo');   // ?photo=/sample-cake-2.png
const CTA = 'Let’s make your cake';   // the storefront's own designLabel, not a string invented here
const DWELL = 5200;                        // how long a slide holds before the next one
const pad = n => String(n).padStart(2, '0');

const facts = t =>
  [`${t.tier_count} ${t.tier_count === 1 ? 'tier' : 'tiers'}`,
   t.shape === 'square' ? 'square' : 'round',
   `from ${t.attrs.min_weight_kg} kg`].join('  ·  ');

function Lookbook() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [started, setStarted] = useState(null);
  const narrow = useNarrow(860);
  const t = TEMPLATES[i];

  // Slow, and it stops for good the moment anybody touches a dot. A carousel that keeps moving
  // under someone who has chosen a slide is arguing with them.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setTimeout(() => setI(n => (n + 1) % TEMPLATES.length), DWELL);
    return () => clearTimeout(id);
  }, [auto, i]);

  const go = n => { setAuto(false); setI(n); };
  const onStart = tpl => setStarted(tpl);   // stands in for patch({ design: { kind:'template', templateId } })

  return (
    <div style={s.page}>
      <header style={s.head}>
        <div style={s.brand}>{BAKER}</div>
        <nav style={s.nav}><span style={s.navItem}>Our story</span><span style={s.navItem}>Contact</span></nav>
      </header>

      {/* ── PHONE: name, button, then the cake bleeding off the bottom ──────────────────────────
          From a bakery site whose hero is a big name over a MACRO crop of crust and seeds running to
          all three edges. The lesson is not "use a photo" — it is that texture at close range is
          appetite, and that type over a bleeding image reads as a shopfront where type in a card
          reads as a web page.
          What fills the slot is the baker's photo if they set one, and otherwise their own cake,
          cropped hard — we own the camera, so we can crop INTO the buttercream instead of framing
          the whole object. A generated stock photo would be the one thing on this storefront that is
          not the baker's work, and identical in every shop that picked the theme. */}
      {narrow ? (
        <section style={s.phone}>
          <div style={s.pTop}>
            <div style={s.kicker}>Custom cakes · made to order</div>
            <h1 style={s.pName}>{BAKER}</h1>
            <p style={s.pLine}>Every cake here is a starting point.</p>
            <button style={s.ctaMain} onClick={() => onStart(t)}>{CTA} <span aria-hidden="true">→</span></button>
          </div>
          {/* Bleeds left, right and bottom. A margin here would put the cake in a box and undo it. */}
          <div style={s.pArt}>
            {HERO_IMAGE
              ? <img src={HERO_IMAGE} alt="" style={{ ...s.pImg, opacity: 1 }} />
              : TEMPLATES.map((x, n) => (
                  <img key={x.id} src={x.thumbnail_url} alt="" style={{ ...s.pImg, opacity: n === i ? 1 : 0 }} />
                ))}
            <div style={s.pScrim} />
            <div style={s.pOver} key={t.id}>
              <div style={s.pOverName}>{t.name}</div>
              <div style={s.pOverFacts}>{facts(t)}</div>
            </div>
            <nav style={s.pDots} aria-label="Cakes">
              {TEMPLATES.map((x, n) => (
                <button key={x.id} onClick={() => go(n)} aria-current={n === i} aria-label={x.name} style={s.dotHit}>
                  <span style={{ ...s.dot, ...s.dotLight, ...(n === i ? s.dotOnLight : null) }} />
                </button>
              ))}
            </nav>
          </div>
        </section>
      ) : (
      <section style={s.hero}>
        {/* LEFT — what the shop is, the story of the cake currently showing, and the way in. The
            button never moves as slides change; only the words above it do. */}
        <div style={s.copy}>
          <div style={s.kicker}>Custom cakes · made to order</div>
          <h1 style={s.title}>Every cake here is a starting point.</h1>

          <div key={t.id} style={s.slideCopy}>
            <div style={s.meta}><span style={s.num}>{pad(i + 1)}</span> {facts(t)}</div>
            <h2 style={s.name}>{t.name}</h2>
            <p style={s.story}>{t.story}</p>
          </div>

          <div style={s.actions}>
            <button style={s.ctaMain} onClick={() => onStart(t)}>{CTA} <span aria-hidden="true">→</span></button>
            <button style={s.ctaQuiet} onClick={() => onStart(t)}>or start from {t.name}</button>
          </div>
        </div>

        {/* RIGHT — the catalogue itself. Range is shown by moving THROUGH it on one screen rather
            than by scrolling past it over six. */}
        <div style={s.stage}>
          <div style={s.frame}>
            {TEMPLATES.map((x, n) => (
              <img key={x.id} src={x.thumbnail_url} alt=""
                   style={{ ...s.img, opacity: n === i ? 1 : 0, transform: n === i ? 'none' : 'scale(1.02)' }} />
            ))}
          </div>
          <nav style={s.dots} aria-label="Cakes">
            {TEMPLATES.map((x, n) => (
              <button key={x.id} onClick={() => go(n)} aria-current={n === i} aria-label={x.name} style={s.dotHit}>
                <span style={{ ...s.dot, ...(n === i ? s.dotOn : null) }} />
              </button>
            ))}
          </nav>
        </div>
      </section>
      )}

      {/* There was a "Nothing here quite right?" block here with two more buttons — design from
          scratch, send a photo. Both are already the FIRST SCREEN of the flow: DesignFacet opens
          with all three doors. So the storefront was duplicating the flow's own opening, and
          apologising in the process — a shop does not ask a customer to admit that nothing on the
          shelves appealed. One way in, and the flow does the branching it already knows how to do. */}
      {started && (
        <div style={s.toast} role="status">
          Opening the designer with <b>{started.name}</b> loaded — {started.tier_count} tiers, {started.shape}.
        </div>
      )}
    </div>
  );
}

const INK = '#1C1B18', PAPER = '#F7F4EE', MUTED = '#8A857A';
const SANS  = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

const s = {
  page: { background: PAPER, minHeight: '100vh' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px clamp(16px, 4vw, 56px)', borderBottom: '1px solid #E4DED2' },
  brand: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '0.16em', fontSize: 17, color: INK },
  nav: { display: 'flex', gap: 22 },
  navItem: { fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
             textTransform: 'uppercase', color: MUTED },

  // One screen: catalogue, story and button together. Nothing here is allowed to push the button
  // below the fold — that was the whole failure of the first pass.
  // ── PHONE ─────────────────────────────────────────────────────────────────────────────────
  phone: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100svh - 53px)' },
  pTop:  { padding: '24px 20px 20px', flex: '0 0 auto' },
  pName: { fontFamily: SERIF, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em',
           fontSize: 'clamp(32px, 10vw, 52px)', color: INK, margin: '10px 0 0', lineHeight: 1,
           overflowWrap: 'break-word' },
  pLine: { fontFamily: SERIF, fontSize: 18, lineHeight: 1.3, color: INK, margin: '10px 0 18px' },
  // flex:1 with minHeight:0 — the cake takes whatever the words leave, so a long bakery name eats
  // into the picture rather than pushing the button off a short screen.
  pArt:  { position: 'relative', flex: '1 1 auto', minHeight: 240, overflow: 'hidden' },
  // objectFit cover at 62% pushes past the silhouette and into the WALL, which is where the
  // buttercream texture is. Framing the whole cake gives a picture of an object; this gives a
  // surface, which is the entire point of the reference.
  pImg:  { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
           objectPosition: 'center 62%', transition: 'opacity 620ms ease' },
  pScrim: { position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(20,19,16,0.66) 0%, rgba(20,19,16,0.14) 44%, transparent 72%)' },
  pOver: { position: 'absolute', left: 20, right: 20, bottom: 46, animation: 'slideIn 460ms cubic-bezier(.2,.7,.2,1)' },
  pOverName: { fontFamily: SERIF, fontWeight: 600, fontSize: 25, color: '#FFF', lineHeight: 1.1 },
  pOverFacts: { fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.82)', marginTop: 6 },
  pDots: { position: 'absolute', left: 12, bottom: 6, display: 'flex', gap: 4 },
  dotLight:   { boxShadow: 'inset 0 0 0 1.5px #FFF', opacity: 0.5 },
  dotOnLight: { backgroundColor: '#FFF', opacity: 1, transform: 'scale(1.3)' },

  hero: { display: 'flex', gap: 'clamp(20px, 4vw, 68px)', alignItems: 'center', flexWrap: 'wrap',
          maxWidth: 1180, margin: '0 auto', padding: 'clamp(22px, 4vh, 56px) clamp(16px, 4vw, 56px)' },
  copy: { flex: '1 1 340px', minWidth: 0 },
  kicker: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.6,
            textTransform: 'uppercase', color: MUTED },
  title: { fontFamily: SERIF, fontWeight: 600, color: INK, margin: '12px 0 0',
           fontSize: 'clamp(30px, 3.6vw, 52px)', lineHeight: 1.12 },

  // The slide's own words. Keyed on the template id so React remounts it and the fade replays —
  // without the key the text swaps on a live node and nothing tells the eye it changed.
  slideCopy: { marginTop: 'clamp(18px, 3vh, 34px)', minHeight: 172,
               animation: 'slideIn 460ms cubic-bezier(.2,.7,.2,1)' },
  meta: { fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase',
          color: MUTED },
  num:  { fontVariantNumeric: 'tabular-nums', opacity: 0.7, marginRight: 8 },
  name: { fontFamily: SERIF, fontWeight: 600, color: INK, fontSize: 'clamp(24px, 2.6vw, 34px)',
          margin: '8px 0 0', lineHeight: 1.15 },
  story:{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.8, color: '#5D584F', margin: '10px 0 0', maxWidth: 460 },

  actions: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 22 },
  ctaMain: { fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
             background: INK, color: PAPER, border: 'none', padding: '16px 28px', cursor: 'pointer' },
  ctaQuiet:{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: MUTED, background: 'none',
             border: 'none', borderBottom: `1px solid ${MUTED}`, padding: '0 0 5px', cursor: 'pointer' },

  stage: { flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  // Fixed height and stacked images: the slides cross-fade in place, so the page does not reflow
  // when a taller cake arrives and the button never moves under a thumb going for it.
  frame: { position: 'relative', width: '100%', maxWidth: 460, height: 'clamp(280px, 46vh, 460px)' },
  img: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
         transition: 'opacity 620ms ease, transform 620ms cubic-bezier(.2,.8,.3,1)' },

  dots: { display: 'flex', gap: 4, marginTop: 14 },
  dotHit: { width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0, border: 'none',
            background: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  dot: { width: 7, height: 7, borderRadius: '50%', boxShadow: `inset 0 0 0 1.5px ${INK}`, opacity: 0.3,
         transition: 'opacity 260ms ease, background-color 260ms ease, transform 260ms ease' },
  dotOn: { backgroundColor: INK, opacity: 1, transform: 'scale(1.3)' },


  toast: { position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 9,
           background: INK, color: PAPER, fontFamily: SANS, fontSize: 12.5, padding: '13px 20px',
           maxWidth: 'calc(100vw - 32px)' },
};

const css = document.createElement('style');
css.textContent = `
  body { margin: 0; } * { box-sizing: border-box; }
  button:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Lookbook />);
