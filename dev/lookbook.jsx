import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

/* ── PROTOTYPE: the Lookbook ─────────────────────────────────────────────────────────────────────
 *
 * Spotlight, Aurora and Atelier are the same storefront — hero, blurb, gallery, CTA — in different
 * clothes. Their tokens are radius, shadow, align, edges, cardStyle: every one of them a STYLE, not
 * one of them a change to what the page DOES. That is why a fourth set of colours and corners never
 * felt like a fourth theme.
 *
 * This one has a job instead of a look: the storefront IS the baker's cakes, and every cake is a
 * door into the designer with the design already loaded.
 *
 * ── WHY THIS IS NOT JUST A NICER GALLERY ────────────────────────────────────────────────────────
 * Because the pictures are EDITABLE. DesignFacet already carries the path — picking a template
 * writes { kind: 'template', templateId } onto the draft, and hands the flavour and size facets the
 * tier count and shape so they never have to ask. Its own comment says why templates lead: a
 * template is the only door that produces something COMPLETE, so a quote can be reached with
 * nothing read or guessed. A photo is a request somebody still has to interpret.
 *
 * So the highest-converting door in the product was three taps inside a modal, and the front page
 * was a picture of a cake nobody could touch. The Lookbook puts that door on the front page and
 * makes it the whole page. A competitor can copy a layout; they cannot copy this without also
 * having a designer underneath it.
 *
 * ── WHAT IT COSTS ───────────────────────────────────────────────────────────────────────────────
 * A baker with three templates gets a thin page, and one with none gets no page at all — which is
 * a real state DesignFacet already handles ("hasn't put any cakes up yet"). This theme should be
 * OFFERED on the strength of the baker's own catalogue, not chosen blind. Noted, not solved.
 */

// Shaped exactly like the rows fetchStorefrontTemplates() returns, so wiring is a swap and not a
// rewrite: id, name, thumbnail_url, tier_count, shape, attrs.min_weight_kg.
const TEMPLATES = [
  { id: 1, name: 'Rose & Pistachio',  thumbnail_url: '/sample-cake-1.png', tier_count: 3, shape: 'round',  attrs: { min_weight_kg: 3 },   note: 'Made for a December wedding' },
  { id: 2, name: 'Cocoa Drip',        thumbnail_url: '/sample-cake-3.png', tier_count: 2, shape: 'round',  attrs: { min_weight_kg: 1.5 }, note: 'A birthday, twice over' },
  { id: 3, name: 'Buttercream Bloom', thumbnail_url: '/sample-cake-2.png', tier_count: 1, shape: 'round',  attrs: { min_weight_kg: 1 },   note: 'Piped by hand, petal by petal' },
  { id: 4, name: 'Ivory & Gold',      thumbnail_url: '/sample-cake-1.png', tier_count: 2, shape: 'square', attrs: { min_weight_kg: 2 },   note: 'An anniversary in Jubilee Hills' },
  { id: 5, name: 'Berry Compote',     thumbnail_url: '/sample-cake-2.png', tier_count: 1, shape: 'round',  attrs: { min_weight_kg: 1 },   note: 'Summer, and a lot of strawberries' },
  { id: 6, name: 'Midnight Ganache',  thumbnail_url: '/sample-cake-3.png', tier_count: 3, shape: 'round',  attrs: { min_weight_kg: 4 },   note: 'For someone who does not like sweet' },
];

const BAKER = 'AARAVI';
const pad = n => String(n).padStart(2, '0');

// The facts a template already knows. Written as a line a person would say, not as a spec table —
// "3 tiers · round · from 3 kg" is data; this is a caption.
const facts = t =>
  [`${t.tier_count} ${t.tier_count === 1 ? 'tier' : 'tiers'}`,
   t.shape === 'square' ? 'square' : 'round',
   `from ${t.attrs.min_weight_kg} kg`].join('  ·  ');

function Plate({ t, i, onStart }) {
  const [hot, setHot] = useState(false);
  // The whole plate is the control. A card with a small button in the corner teaches people to hunt
  // for the button; a card that IS the button does not have to teach anything.
  return (
    <article style={{ ...s.plate, ...(i % 2 ? s.plateAlt : null) }}>
      <button type="button" onClick={() => onStart(t)}
              onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
              onFocus={() => setHot(true)} onBlur={() => setHot(false)}
              style={{ ...s.plateBtn, ...(i % 2 ? s.plateBtnAlt : null) }}>
        <div style={s.art}>
          <img src={t.thumbnail_url} alt="" style={{ ...s.img, ...(hot ? s.imgHot : null) }} />
        </div>
        <div style={s.cap}>
          {/* Numbered because it is genuinely an ordered set of works — a catalogue numbers its
              plates. Numbering that encodes nothing is decoration; this one is true. */}
          <div style={s.num}>{pad(i + 1)}</div>
          <h2 style={s.name}>{t.name}</h2>
          <p style={s.note}>{t.note}</p>
          <div style={s.facts}>{facts(t)}</div>
          <div style={{ ...s.action, ...(hot ? s.actionHot : null) }}>
            Start from this one <span aria-hidden="true">→</span>
          </div>
        </div>
      </button>
    </article>
  );
}

function Lookbook() {
  const [started, setStarted] = useState(null);
  const onStart = t => setStarted(t);          // stands in for patch({ design: { kind:'template', templateId: t.id }})

  return (
    <div style={s.page}>
      <header style={s.head}>
        <div style={s.brand}>{BAKER}</div>
        <nav style={s.nav}><span style={s.navItem}>Our story</span><span style={s.navItem}>Contact</span></nav>
      </header>

      {/* No hero. One sentence of framing, because without it a visitor reads this as a gallery and
          never learns that the pictures are doors. The claim is the concept, stated once. */}
      <section style={s.intro}>
        <p style={s.introLine}>
          {TEMPLATES.length} cakes {BAKER} has made.<br />Every one of them is a starting point.
        </p>
        <p style={s.introSub}>Pick one and change anything — the colours, the tiers, the name on top.</p>
      </section>

      {TEMPLATES.map((t, i) => (
        <React.Fragment key={t.id}>
          <Plate t={t} i={i} onStart={onStart} />
          {i === 2 && (
            <section style={s.breather}>
              <p style={s.breatherLine}>Nothing here is fixed. They are all just places to begin.</p>
            </section>
          )}
        </React.Fragment>
      ))}

      {/* The other two doors survive, at the end, where someone who has looked at every cake and
          liked none of them will be. Front-and-centre they would compete with the catalogue; buried
          entirely they would strand the customer who arrived with a photo on their phone. */}
      <section style={s.tail}>
        <p style={s.tailHead}>Nothing quite right?</p>
        <div style={s.tailRow}>
          <button style={s.tailBtn}>Design one from scratch <span aria-hidden="true">→</span></button>
          <button style={s.tailBtnQuiet}>I have a photo to send <span aria-hidden="true">→</span></button>
        </div>
      </section>

      {started && (
        <div style={s.toast} role="status">
          Opening the designer with <b>{started.name}</b> loaded — {started.tier_count} tiers, {started.shape}.
        </div>
      )}
    </div>
  );
}

const INK = '#1C1B18', PAPER = '#F7F4EE', PAPER2 = '#EFEAE0', MUTED = '#8A857A';
const SANS  = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

const s = {
  page: { background: PAPER, minHeight: '100vh' },
  head: { position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '14px clamp(16px, 4vw, 56px)',
          background: `${PAPER}F2`, backdropFilter: 'blur(8px)', borderBottom: `1px solid #E4DED2` },
  brand: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '0.16em', fontSize: 17, color: INK },
  nav: { display: 'flex', gap: 22 },
  navItem: { fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
             textTransform: 'uppercase', color: MUTED },

  intro: { padding: 'clamp(48px, 9vh, 110px) clamp(16px, 4vw, 56px) clamp(30px, 5vh, 60px)', maxWidth: 1180, margin: '0 auto' },
  introLine: { fontFamily: SERIF, fontWeight: 600, color: INK, margin: 0,
               fontSize: 'clamp(30px, 4.6vw, 62px)', lineHeight: 1.12, letterSpacing: '-0.005em' },
  introSub: { fontFamily: SANS, fontSize: 13.5, lineHeight: 1.8, color: MUTED, margin: '18px 0 0', maxWidth: 420 },

  plate: { borderTop: `1px solid #E4DED2` },
  plateAlt: { background: PAPER2 },
  plateBtn: { display: 'flex', gap: 'clamp(18px, 4vw, 64px)', alignItems: 'center', width: '100%',
              maxWidth: 1180, margin: '0 auto', padding: 'clamp(26px, 5vh, 68px) clamp(16px, 4vw, 56px)',
              background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
              font: 'inherit', color: 'inherit', flexWrap: 'wrap' },
  plateBtnAlt: { flexDirection: 'row-reverse' },
  art: { flex: '1 1 300px', minWidth: 0, display: 'flex', justifyContent: 'center' },
  img: { width: '100%', maxWidth: 420, height: 'auto', display: 'block',
         transition: 'transform 520ms cubic-bezier(.2,.8,.3,1)' },
  imgHot: { transform: 'scale(1.035)' },
  cap: { flex: '1 1 260px', minWidth: 0 },
  num: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.4, color: MUTED,
         fontVariantNumeric: 'tabular-nums' },
  name: { fontFamily: SERIF, fontWeight: 600, color: INK, fontSize: 'clamp(26px, 3.2vw, 44px)',
          lineHeight: 1.1, margin: '10px 0 0' },
  note: { fontFamily: SERIF, fontStyle: 'italic', color: '#5D584F', fontSize: 'clamp(15px, 1.4vw, 19px)',
          margin: '8px 0 0' },
  facts: { fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: 1.1, color: MUTED,
           textTransform: 'uppercase', margin: '20px 0 0' },
  action: { fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            color: INK, marginTop: 22, paddingBottom: 7, borderBottom: `1px solid ${INK}`,
            display: 'inline-block', transition: 'gap 200ms ease, opacity 200ms ease', opacity: 0.55 },
  actionHot: { opacity: 1 },

  breather: { borderTop: `1px solid #E4DED2`, padding: 'clamp(40px, 8vh, 96px) clamp(16px, 4vw, 56px)',
              maxWidth: 1180, margin: '0 auto' },
  breatherLine: { fontFamily: SERIF, fontSize: 'clamp(22px, 2.8vw, 38px)', color: INK, margin: 0,
                  maxWidth: 620, lineHeight: 1.25 },

  tail: { borderTop: `1px solid #E4DED2`, padding: 'clamp(44px, 9vh, 110px) clamp(16px, 4vw, 56px)',
          maxWidth: 1180, margin: '0 auto' },
  tailHead: { fontFamily: SERIF, fontSize: 'clamp(24px, 3vw, 40px)', color: INK, margin: '0 0 24px' },
  tailRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  tailBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
             background: INK, color: PAPER, border: 'none', padding: '15px 26px', cursor: 'pointer' },
  tailBtnQuiet: { fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
                  background: 'none', color: INK, border: `1px solid ${INK}`, padding: '15px 26px', cursor: 'pointer' },

  toast: { position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 9,
           background: INK, color: PAPER, fontFamily: SANS, fontSize: 12.5, padding: '13px 20px',
           maxWidth: 'calc(100vw - 32px)' },
};

const css = document.createElement('style');
css.textContent = `body { margin: 0; } * { box-sizing: border-box; } button:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Lookbook />);
