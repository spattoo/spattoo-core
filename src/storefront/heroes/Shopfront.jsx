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
 * ── NO DOILY ROSETTE ────────────────────────────────────────────────────────────────────────────
 * There was one, bottom right, holding a short strapline. Removed on purpose and not to be
 * reinstated without thinking about it: the reference image this theme's brief arrived as carries a
 * doily rosette with a tagline in exactly that position, and of everything shared between the two it
 * was the most specific — an awning or an arched window is a patisserie trope that nobody owns, a
 * scalloped rosette holding a slogan in the corner is a composition. Trade dress is judged on the
 * OVERALL impression, so the cheapest real distance came from dropping the one element that was
 * doing the least work and looked the most borrowed.
 *
 * The strapline now sits under the headline, which is where every other theme puts it, and where it
 * can be a whole sentence instead of four words.
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
export default function Shopfront({ primary, accent, cta, paper, name, compact = false, children }) {
  // ONE viewBox at both breakpoints. The phone drops the wings (lamps, topiary) rather than using a
  // second drawing — two drawings would be two things to keep in step, and the wings are the first
  // thing to go when there is no room for them anyway.
  //
  // Geometry, so the numbers below are readable rather than magic:
  //   ground 478 · building 250→750 x, 150→478 y · sign band 176→244 · window 296→596 x, arch apex
  //   274, sill 440 · door 640→716. The window's top must clear the sign band, or the name ends up
  //   printed on the glass — which is exactly what the first draft did.
  const W = 1000, H = 560;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
            {/* One lamp, right. The left wall carries the hanging sign — a lamp there too would be
                three objects competing in one corner, which is the clutter this theme avoids. */}
            <path d={lamp(852, -1)} {...line(1.8)} />
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

        {/* ── What is in the window ────────────────────────────────────────────────────────────
            Drawn, in the same ink and wash as the shop.

            This was the baker's LIVE 3D cake, and losing that costs something real — it was the one
            place their own design appeared in the hero. But a soft-shaded WebGL render with a gold
            board, sitting inside flat linework, is two visual languages arguing in the middle of the
            frame, and the eye reads the seam before it reads either. Their actual designs still
            carry the page immediately below, in the gallery, where photographic weight belongs.

            Three pieces, deliberately uneven in height so the sill has a rhythm rather than a row. */}
        <g>
          {cakeOnStand(352, 440, 62, 34, primary, accent, cta, 0)}
          {cakeOnStand(446, 440, 86, 44, primary, accent, cta, 1)}
          {cakeOnStand(540, 440, 58, 30, primary, accent, cta, 2)}
        </g>

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

        {/* ── The hanging sign ─────────────────────────────────────────────────────────────────
            A projecting bracket sign, which is what a patisserie actually has, carrying the
            bakery's own INITIAL rather than a pastry glyph. A little drawn cupcake swinging on a
            bracket is the single most recognisable object in the reference image, and a monogram is
            both further from it and more personal: it is the baker's letter, in the baker's
            wordmark face, and it changes per shop the way everything else here does.

            SVG <text>, not an HTML overlay like the shop name: this one is small and fixed-width, so
            letting it scale with the viewBox is simpler and cannot drift out of registration. */}
        <g>
          <path d="M 250 292 L 186 292 M 250 292 q -14 12 -30 12 M 200 294 L 200 308 M 234 294 L 234 308" {...line(1.8)} />
          <path d="M 178 308 L 256 308 L 256 352 q -39 16 -78 0 Z" fill={paper} fillOpacity="0.94" />
          <path d="M 178 308 L 256 308 L 256 352 q -39 16 -78 0 Z" {...line(2)} />
          <text x="217" y="341" textAnchor="middle" fill={INK}
                style={{ fontFamily: "'Parisienne', 'Cormorant Garamond', cursive", fontSize: 30 }}>
            {(name || '').trim().charAt(0).toUpperCase()}
          </text>
        </g>

        {/* ── Window box ───────────────────────────────────────────────────────────────────────
            Under the sill, with a few blooms in the CTA and accent colours. It does two jobs: it
            settles the window onto the wall (the sill was floating), and it is somewhere for the
            cherry red to appear again below the sign band, so the hearts do not read as the only
            red on the page. */}
        <g>
          {[318, 352, 386, 420, 454, 488, 522, 556].map((x, i) => (
            <g key={x}>
              {/* Stems start at the box lip and the blooms clear it by a few px. They were 20px
                  higher, which floated them in the middle of the glass — flowers growing inside the
                  shop rather than in a box on its wall. */}
              <path d={`M ${x} 446 q 2 -9 0 -14`} {...line(1.3)} />
              <circle cx={x} cy={432} r={i % 2 ? 6 : 7} fill={i % 3 === 0 ? cta : accent} fillOpacity={i % 3 === 0 ? 0.8 : 0.72} />
              <circle cx={x} cy={432} r={i % 2 ? 6 : 7} {...line(1.1)} />
            </g>
          ))}
          <path d="M 306 444 L 586 444 L 578 470 L 314 470 Z" fill={accent} fillOpacity="0.45" />
          <path d="M 306 444 L 586 444 L 578 470 L 314 470 Z" {...line(2)} />
          <path d={scallops(310, 452, 272, 9, 5)} {...line(1.2)} />
        </g>

        {/* A step, so the door meets the pavement instead of stopping at it. */}
        <path d="M 628 470 L 728 470 L 734 478 L 622 478 Z" fill={paper} fillOpacity="0.8" />
        <path d="M 628 470 L 728 470 L 734 478 L 622 478 Z" {...line(1.8)} />

        {/* Pavement. One line — anything more begins drawing a street. */}
        <path d="M 130 478 L 870 478" {...line(2.4)} />
      </svg>

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

    </div>
  );
}

/**
 * A cake on a footed stand, drawn.
 *
 * `variant` only changes what sits ON it (a cherry, a row of piping, a second tier) — the stand and
 * the body are one shape, so three calls give three cakes without three drawings to maintain.
 */
function cakeOnStand(cx, baseY, w, h, primary, accent, cta, variant) {
  const half = w / 2;
  const standTop = baseY - 14;              // the plate the cake sits on
  const bodyTop = standTop - h;
  const wash = { fill: primary, fillOpacity: 0.5 };
  return (
    <g key={cx}>
      {/* stand: foot, stem, plate */}
      <path d={`M ${cx - 16} ${baseY} q 16 -6 32 0`} {...line(1.6)} />
      <path d={`M ${cx} ${baseY} L ${cx} ${standTop}`} {...line(1.6)} />
      <path d={`M ${cx - half - 6} ${standTop} L ${cx + half + 6} ${standTop}`} {...line(1.8)} />
      {/* body */}
      <path d={`M ${cx - half} ${standTop} L ${cx - half} ${bodyTop} L ${cx + half} ${bodyTop} L ${cx + half} ${standTop} Z`} {...wash} />
      <path d={`M ${cx - half} ${standTop} L ${cx - half} ${bodyTop} L ${cx + half} ${bodyTop} L ${cx + half} ${standTop}`} {...line(1.8)} />
      {/* a scalloped border of piping around the base — the same edge as everything else here */}
      <path d={scallops(cx - half, standTop - 7, w, Math.max(3, Math.round(w / 14)), 5)} {...line(1.2)} />
      {/* the top */}
      <path d={`M ${cx - half} ${bodyTop} L ${cx + half} ${bodyTop}`} {...line(1.8)} />
      {variant === 1 && (
        <>
          {/* second tier */}
          <path d={`M ${cx - half * 0.55} ${bodyTop} L ${cx - half * 0.55} ${bodyTop - 26} L ${cx + half * 0.55} ${bodyTop - 26} L ${cx + half * 0.55} ${bodyTop} Z`} fill={accent} fillOpacity="0.45" />
          <path d={`M ${cx - half * 0.55} ${bodyTop} L ${cx - half * 0.55} ${bodyTop - 26} L ${cx + half * 0.55} ${bodyTop - 26} L ${cx + half * 0.55} ${bodyTop}`} {...line(1.6)} />
          <path d={heart(cx, bodyTop - 34, 7)} fill={cta} />
        </>
      )}
      {variant === 0 && <circle cx={cx} cy={bodyTop - 7} r={5} fill={cta} />}
      {variant === 0 && <circle cx={cx} cy={bodyTop - 7} r={5} {...line(1.2)} />}
      {variant === 2 && (
        <path d={`M ${cx - 16} ${bodyTop - 4} q 8 -10 16 0 q 8 -10 16 0`} {...line(1.4)} />
      )}
    </g>
  );
}

/** A heart, as one path — two arcs into a point. */
function heart(cx, cy, r) {
  return `M ${cx} ${cy + r * 0.85}
          C ${cx - r * 1.5} ${cy - r * 0.2} ${cx - r * 0.6} ${cy - r * 1.35} ${cx} ${cy - r * 0.45}
          C ${cx + r * 0.6} ${cy - r * 1.35} ${cx + r * 1.5} ${cy - r * 0.2} ${cx} ${cy + r * 0.85} Z`;
}

/**
 * A wrought-iron street lamp: post, one curved arm, a lantern hanging from its end.
 *
 * The first version had a bracket that curled back on itself and a lantern drawn at a different x
 * from the arm it was supposed to hang on — it read as a hook with a lamp floating beside it. The
 * lantern's centre is now the arm's end by construction, so the two cannot separate.
 */
function lamp(x, dir = 1) {
  const cx = x + dir * 26;             // arm end = lantern centre, one value
  return `M ${x} 478 L ${x} 306
          M ${x - 9} 478 q 9 -7 18 0
          M ${x} 306 q 0 -26 ${dir * 26} -26
          M ${cx} 280 L ${cx} 290
          M ${cx - 12} 290 L ${cx + 12} 290 L ${cx + 8} 316 L ${cx - 8} 316 Z
          M ${cx - 6} 276 q 6 -8 12 0`;
}
