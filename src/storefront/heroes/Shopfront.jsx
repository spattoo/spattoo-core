import { useEffect, useRef, useState } from 'react';

/* ── The Patisserie hero: a hand-drawn shop, with the baker's real cake in the window ────────────
 *
 * Drawn here, in SVG, from scratch. There is no image asset and nothing is traced from anything:
 * the brief for this theme arrived as a photograph of another bakery's brand illustration, and that
 * artwork is a real company's identity. What this borrows is the style LANGUAGE — ink line over
 * watercolour wash, scalloped and doily edges, an arched window, a lot of visible paper — which is a
 * genre rather than a property.
 *
 * ── WHY SVG AND NOT AN ILLUSTRATION FILE ────────────────────────────────────────────────────────
 * Because the shop has to be the BAKER's. Every colour here is a function of the pickers they
 * already have: the facade is their primary, the awning and window frame their accent, the hearts
 * their CTA colour. Ship a PNG and the theme is one bakery's shop wearing everyone's name — a baker
 * who wants a mint-green storefront cannot have one, and the "premium" theme becomes the least
 * personal thing we sell. It also keeps the page weightless and sharp on any screen.
 *
 * ── THE ONE IDEA ────────────────────────────────────────────────────────────────────────────────
 * The arched window is a HOLE, and the live 3D cake sits inside it. Not a drawing of a cake — the
 * customer's own design, spinning, framed by the shop. Everything else on this canvas exists to
 * point at that window, which is why the drawing stays sparse: no street, no furniture, no bunting.
 * Restraint is the premium signal; density is a greetings card.
 */

// A hand-drawn line never closes perfectly or holds one weight. These are the two cheap tricks that
// keep the vector from looking CAD-drawn: round caps/joins everywhere, and a stroke width that
// varies slightly between elements rather than one global 2px.
const INK = '#2E3A46';
const line = (w = 2.2) => ({ fill: 'none', stroke: INK, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' });

/** A scalloped edge, as a path — the awning, and the doily's outer ring both use it. */
function scallops(x, y, width, count, r, up = false) {
  const step = width / count;
  const sweep = up ? 0 : 1;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < count; i++) d += ` A ${step / 2} ${r} 0 0 ${sweep} ${x + step * (i + 1)} ${y}`;
  return d;
}

/**
 * @param {object} p
 * @param {string} p.primary   the facade wash (baker's primary)
 * @param {string} p.accent    awning stripes + window frame (baker's accent)
 * @param {string} p.cta       the hearts (baker's CTA colour)
 * @param {string} p.paper     page background, so the window's "glass" matches the page
 * @param {node}   p.children  the live cake, absolutely positioned into the window by the caller
 */
export default function Shopfront({ primary, accent, cta, paper, name, tagline, compact = false, children }) {
  // ── The cake has to be measured, not guessed ────────────────────────────────────────────────
  // The drawing scales with WIDTH (it is an SVG with a viewBox); the cake is a WebGL canvas with a
  // height in pixels. Give it a fixed height and the two are sized by different systems: a 210px
  // cake looks right in a 1240px-wide shop and swallows the whole building at 370px, which is
  // exactly what the phone showed — the cake covering the sign band it is supposed to stand below.
  //
  // So the window's height in real pixels is derived from the measured width, through the same
  // viewBox ratio the SVG uses, and handed to the caller. One source of truth for the scale.
  const wrapRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    setBoxW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  // One viewBox for both breakpoints; the phone crops to the shopfront itself by hiding the wings
  // (lamps, topiary) rather than by re-drawing anything. Two drawings would be two things to keep in
  // step, and the wings are the first thing to go when there is no room for them.
  // ONE viewBox at both breakpoints. The phone drops the wings (lamps, topiary) rather than using a
  // second drawing — two drawings would be two things to keep in step, and the wings are the first
  // thing to go when there is no room for them anyway.
  //
  // Geometry, so the numbers below are readable rather than magic:
  //   ground 478 · building 250→750 x, 150→478 y · sign band 176→244 · window 296→596 x, arch apex
  //   274, sill 440 · door 640→716. The window's top must clear the sign band, or the name ends up
  //   printed on the glass — which is exactly what the first draft did.
  const W = 1000, H = 560;
  // The rosette is a rosette: it holds three or four words, not a sentence. A long strapline goes
  // under the headline instead (the caller decides), so nothing is ever lost or squeezed to 8px.
  const badge = tagline && tagline.length <= 30 ? tagline : null;

  // CAKE_BOX_H below must stay equal to the cake container's `height` percentage.
  const CAKE_BOX_H = 0.26;
  const cakeH = Math.round(boxW * (H / W) * CAKE_BOX_H);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} aria-hidden="true">
        <defs>
          {/* The wash. A watercolour edge is DARKER than its middle — pigment migrates outward as it
              dries — which is the opposite of how a UI gradient is built, and most of why a flat fill
              reads as vector and this reads as paint. */}
          <radialGradient id="sfWash" cx="50%" cy="34%" r="74%">
            <stop offset="0%"   stopColor={primary} stopOpacity="0.30" />
            <stop offset="72%"  stopColor={primary} stopOpacity="0.66" />
            <stop offset="100%" stopColor={primary} stopOpacity="0.88" />
          </radialGradient>
          <linearGradient id="sfGlass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.30" />
            <stop offset="100%" stopColor={paper} stopOpacity="0.95" />
          </linearGradient>
          <clipPath id="sfArch">
            <path d="M 296 440 L 296 352 A 150 78 0 0 1 596 352 L 596 440 Z" />
          </clipPath>
        </defs>

        {!compact && (
          <g>
            <path d={lamp(150, 1)} {...line(1.8)} />
            <path d={lamp(850, -1)} {...line(1.8)} />
            {/* Topiary. The silhouette alone rendered as a green blob at this size — foliage is
                read from the STROKES inside it, not the outline, so a handful of leaf ticks do more
                than any amount of shaping. */}
            <g transform="translate(84 402)">
              <path d="M 0 76 q 20 -54 58 -48 q 8 -35 50 -26 q 35 -26 60 12 q 35 8 25 62 z" fill="#8FBF6E" fillOpacity="0.42" />
              <path d="M 0 76 q 20 -54 58 -48 q 8 -35 50 -26 q 35 -26 60 12 q 35 8 25 62" {...line(1.8)} />
              <g opacity="0.75">
                <path d="M 34 52 q 10 -12 22 -6 M 66 30 q 12 -12 24 -4 M 104 24 q 12 -10 22 -2 M 52 68 q 12 -10 24 -4 M 96 56 q 12 -12 24 -4 M 132 46 q 10 -10 20 -2" {...line(1.3)} />
              </g>
            </g>
          </g>
        )}

        {/* ── Building ─────────────────────────────────────────────────────────────────────── */}
        <path d="M 250 150 L 750 150 L 750 478 L 250 478 Z" fill="url(#sfWash)" />
        <path d="M 250 150 L 750 150 L 750 478 L 250 478 Z" {...line(2.4)} />

        {/* Roof. One scalloped course along the eave says "tiles"; drawing actual tiles at this size
            turns into texture noise and fights the linework. */}
        <path d="M 230 150 L 322 84 L 678 84 L 770 150 Z" fill={accent} fillOpacity="0.42" />
        <path d="M 230 150 L 322 84 L 678 84 L 770 150 Z" {...line(2.4)} />
        <path d={scallops(252, 140, 496, 13, 8)} {...line(1.5)} />

        {/* Sign band. The name itself is HTML over the top — a real webfont and the baker's real
            name at whatever length it is, rather than SVG text that cannot wrap. */}
        <path d="M 250 176 L 750 176 L 750 244 L 250 244 Z" fill={paper} fillOpacity="0.9" />
        <path d="M 250 176 L 750 176 M 250 244 L 750 244" {...line(1.7)} />
        <path d={heart(288, 210, 13)} fill={cta} />
        <path d={heart(712, 210, 13)} fill={cta} />

        {/* ── The window: a hole, with the customer's own cake standing in it ───────────────── */}
        <path d="M 296 440 L 296 352 A 150 78 0 0 1 596 352 L 596 440 Z" fill="url(#sfGlass)" />
        <g clipPath="url(#sfArch)" opacity="0.45">
          <path d="M 446 274 L 446 440 M 296 366 L 596 366 M 371 300 L 371 440 M 521 300 L 521 440" {...line(1.3)} />
        </g>
        <path d="M 296 440 L 296 352 A 150 78 0 0 1 596 352 L 596 440" {...line(2.8)} />
        <path d="M 282 440 L 610 440" {...line(2.8)} />

        {/* ── Door, with a scalloped awning ────────────────────────────────────────────────── */}
        <path d="M 640 478 L 640 382 A 38 26 0 0 1 716 382 L 716 478 Z" fill={paper} fillOpacity="0.85" />
        <path d="M 640 478 L 640 382 A 38 26 0 0 1 716 382 L 716 478" {...line(2.2)} />
        <g>
          <path d="M 632 356 q 46 -13 92 0 l 0 24 l -92 0 z" fill={accent} fillOpacity="0.5" />
          {[0, 1, 2, 3].map(i => <path key={i} d={`M ${650 + i * 20} 354 q 3 14 2 26`} {...line(1.2)} />)}
          <path d={scallops(632, 380, 92, 4, 7)} fill={accent} fillOpacity="0.5" />
          <path d={scallops(632, 380, 92, 4, 7)} {...line(1.7)} />
          <path d="M 632 356 q 46 -13 92 0" {...line(2.1)} />
        </g>

        {/* Pavement. One line — anything more begins drawing a street. */}
        <path d="M 130 478 L 870 478" {...line(2.4)} />
      </svg>

      {/* The live cake, standing on the sill. Percentages of the SAME viewBox the drawing uses, so
          the two stay registered at every width with no resize listener. */}
      <div style={{
        // Inset from the window opening (296→596 x, 274→440 y) rather than matching it: HeroCake3D
        // frames itself with margins and its own gold board, so a box the size of the arch renders a
        // cake that climbs out of the window and across the sign band — which is what the first pass
        // did. Sized to sit ON the sill with glass visible around it, like a cake in a real window.
        position: 'absolute', left: '34%', top: '52%', width: '22%', height: '26%',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'none',
      }}>
        {/* A render function, so the cake is built with the height this drawing just measured.
            Falls back to a plain node so a caller that does not care still works. */}
        {typeof children === 'function' ? (cakeH > 0 ? children({ height: cakeH }) : null) : children}
      </div>

      {/* The name, on the sign band. */}
      <div style={{
        position: 'absolute', left: '26%', top: '30.5%', width: '48%', height: '12.2%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          fontFamily: "'Parisienne', 'Cormorant Garamond', cursive", color: INK,
          fontSize: compact ? 'clamp(15px, 5vw, 26px)' : 'clamp(22px, 2.7vw, 38px)',
          lineHeight: 1.02, display: 'block', overflowWrap: 'break-word',
        }}>{name}</span>
      </div>

      {/* The doily — the one piece of pure ornament this drawing allows itself. */}
      {badge && !compact && (
        <div style={{ position: 'absolute', right: '2%', bottom: '9%', width: '17%' }}>
          <svg viewBox="0 0 200 200" width="100%" style={{ display: 'block' }} aria-hidden="true">
            <path d={scallops(16, 100, 168, 13, 9)} fill={accent} fillOpacity="0.4" />
            <path d={scallops(16, 100, 168, 13, 9, true)} fill={accent} fillOpacity="0.4" />
            <circle cx="100" cy="100" r="84" fill={accent} fillOpacity="0.4" />
            <circle cx="100" cy="100" r="68" {...line(1.1)} strokeDasharray="2 7" />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 22%', textAlign: 'center',
          }}>
            <span style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", color: INK, fontWeight: 600,
              fontSize: 'clamp(11px, 1.1vw, 16px)', lineHeight: 1.25,
            }}>{badge}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** A heart, as one path — two arcs into a point. */
function heart(cx, cy, r) {
  return `M ${cx} ${cy + r * 0.85}
          C ${cx - r * 1.5} ${cy - r * 0.2} ${cx - r * 0.6} ${cy - r * 1.35} ${cx} ${cy - r * 0.45}
          C ${cx + r * 0.6} ${cy - r * 1.35} ${cx + r * 1.5} ${cy - r * 0.2} ${cx} ${cy + r * 0.85} Z`;
}

/** A wrought-iron street lamp. */
function lamp(x, dir = 1) {
  const a = x + dir * 26, b = x + dir * 44;   // bracket end, lantern centre
  return `M ${x} 478 L ${x} 300
          M ${x - 9} 478 q 9 -8 18 0
          M ${x} 300 q 0 -26 ${dir * 26} -26 q ${dir * 18} 0 ${dir * 18} 16
          M ${x} 330 q ${dir * 14} -6 ${dir * 20} -18
          M ${b - 13} 292 l 26 0 l -8 -26 l -10 0 z
          M ${b} 266 l 0 -9
          M ${a} 274 l ${dir * 36} 0`;
}
