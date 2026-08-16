import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useNarrow } from '../src/shared/useNarrow.js';
import CreamBand from './CreamBand.jsx';

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
// ?accent=%23A8654B — the baker's own colour, so the band is not the same beige in every shop.
const ACCENT = new URLSearchParams(location.search).get('accent') || '#A8654B';

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
      {/* NAV ONLY. The reference puts the bakery's logo in a dark bar AND spells the name out
          underneath it — the same identity twice in one screen. Atelier already settled this in this
          codebase with headerBrand:false: "the hero IS the wordmark here, so the header does not
          repeat it." The name appears once, large, below. */}
      <header style={s.head}>
        <nav style={s.nav}><span style={s.navItem}>Our story</span><span style={s.navItem}>Contact</span></nav>
      </header>

      {/* ── THE HERO ─────────────────────────────────────────────────────────────────────────────
          The composition, not the photograph, is what was worth taking from the reference: the name
          large, and a band of texture bleeding off the left, right and bottom edges with a line of
          practical information sitting on it.
          The name is the hero. Everything under it is a SURFACE — which is why no cake goes here.
          A cake on white is an object and asks to be looked at; this band asks nothing, which is its
          job. The cakes live below, where a catalogue belongs, once the name has done its work.
          Same shape at every width: it was strong enough on a phone to be worth keeping on a
          desktop, and one composition beats two that have to agree with each other. */}
      <section style={s.hero}>
        <div style={s.top}>
          <div style={s.kicker}>Custom cakes · made to order</div>
          <h1 style={s.name}>{BAKER}</h1>
          <p style={s.line}>Every cake here is a starting point.</p>
          <button style={s.ctaMain} onClick={() => onStart(t)}>{CTA} <span aria-hidden="true">→</span></button>
        </div>

        <div style={s.band}>
          {HERO_IMAGE
            ? <img src={HERO_IMAGE} alt="" style={s.bandImg} />
            : <CreamBand ink={INK} accent={ACCENT} paper={PAPER} style={s.bandArt} />}
          {/* Where the reference put its street address: the practical line, on the texture. */}
          <div style={s.bandLine}>Hyderabad · three days&rsquo; notice · delivered</div>
        </div>
      </section>

      {/* The catalogue, under the name's screen rather than in it. Every thumbnail is still a door
          into the designer with that design loaded. */}
      <section style={s.strip}>
        <div style={s.stripHead}>Start from one of these</div>
        <div style={s.stripRow}>
          {TEMPLATES.map((x, n) => (
            <button key={x.id} onClick={() => onStart(x)} style={s.chip} aria-label={`Start from ${x.name}`}>
              <img src={x.thumbnail_url} alt="" style={s.chipImg} />
              <span style={s.chipName}>{x.name}</span>
              <span style={s.chipFacts}>{facts(x)}</span>
            </button>
          ))}
        </div>
      </section>

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
  hero: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100svh - 49px)' },
  top:  { padding: 'clamp(26px, 5vh, 64px) clamp(20px, 5vw, 64px) clamp(22px, 4vh, 44px)',
          flex: '0 0 auto', maxWidth: 1180, margin: '0 auto', width: '100%' },
  kicker: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.6,
            textTransform: 'uppercase', color: MUTED },
  name: { fontFamily: SERIF, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em',
          fontSize: 'clamp(34px, 8vw, 96px)', color: INK, margin: '12px 0 0', lineHeight: 1,
          overflowWrap: 'break-word' },
  line: { fontFamily: SERIF, fontSize: 'clamp(18px, 2vw, 28px)', lineHeight: 1.3, color: INK,
          margin: '12px 0 22px' },

  // flex:1 with minHeight — the band takes whatever the words leave, so a long bakery name eats into
  // the texture rather than pushing the button off a short screen.
  ctaMain: { fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
             background: INK, color: PAPER, border: 'none', padding: '16px 28px', cursor: 'pointer' },

  band: { position: 'relative', flex: '1 1 auto', minHeight: 210, overflow: 'hidden', background: PAPER },
  bandArt: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  bandImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
             objectPosition: 'center 62%' },
  bandLine: { position: 'absolute', left: 0, right: 0, bottom: 'clamp(16px, 3vh, 30px)', textAlign: 'center',
              fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: 2.2, textTransform: 'uppercase',
              color: INK, opacity: 0.62 },

  strip: { padding: 'clamp(30px, 6vh, 72px) clamp(20px, 5vw, 64px)', maxWidth: 1180, margin: '0 auto' },
  stripHead: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.4,
               textTransform: 'uppercase', color: MUTED, marginBottom: 18 },
  // Scrolls sideways rather than wrapping: a baker with eleven templates gets a rail, not eleven
  // rows that bury everything under them.
  stripRow: { display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'thin' },
  chip: { flex: '0 0 auto', width: 150, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', font: 'inherit', display: 'flex', flexDirection: 'column', gap: 2 },
  chipImg: { width: '100%', height: 150, objectFit: 'contain', display: 'block' },
  chipName: { fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: INK, marginTop: 6 },
  chipFacts: { fontFamily: SANS, fontSize: 9.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
               color: MUTED },

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
