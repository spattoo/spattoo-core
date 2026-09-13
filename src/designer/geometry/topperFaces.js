import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import creamFonts from './creamFonts.json';

/* ── The faces a topper can be cut in ────────────────────────────────────────────────────────────
 *
 * ONE registry, shared by the admin studio and the designer, because the alternative is already in
 * the tree as a warning: `creamFonts.json` exists twice — once here and once copied into
 * spattoo-admin/src/admin/ — so the cream pen's preview and the cake are one edit away from
 * disagreeing about what a font looks like. A topper gets one list.
 *
 * ── Two kinds, and the difference is not cosmetic ──
 *
 *   outline      A real typeface with thicks and thins. The hairline is the thinnest acrylic in the
 *                design and is whatever the designer of the font drew — you cannot set it, only
 *                measure it and decide whether it can be cut.
 *   centreline   A single-stroke face swept to a constant width. The stroke IS a control, so a
 *                monoline can always be made thick enough to survive; it just cannot have thicks
 *                and thins. These are the cream pen's own faces, reused rather than re-sourced.
 *
 * Reached by KEY, never by name. A new face is a row here and nothing else.
 *
 * ── `fit`, and why it is not zero ──
 *
 * These faces are drawn for PRINT, where letters only have to LOOK joined. Cut in acrylic they have
 * to actually touch, and at their natural fit they do not: a script came out with a straight 3mm
 * rectangle bolted across the gap between two letters, which read exactly like what it was.
 *
 * `fit` is the tracking, in ems, that closes the gaps WHILE THE WORD STILL READS. Negative, because
 * letters have to overlap — look at a real one and the strokes run into each other.
 *
 * ⚠️ IT IS NOT THE FIT AT WHICH THE FACE FULLY JOINS ITSELF, and that was the first mistake here.
 * Chasing "zero bridges" is a criterion a machine can check and it is the wrong one: it keeps
 * tightening until even a distant tittle is swallowed, and at the value it lands on (-0.16 for
 * Parisienne) the word reads "Bithday" — the r is gone. Correct by every number on the panel: one
 * piece, no bridges, clears the cutter. Unreadable.
 *
 * So these are set BY LOOKING, at roughly half the fully-joining value, and the test is whether
 * every letter is still there. That leaves one short bridge on most faces, ~3mm, which is what a cut
 * topper actually has — far better than a legible-looking number and an illegible word.
 *
 * The sweep before that stopped at -0.05 and concluded tracking did nothing at all. Both errors were
 * about range: once too short, once too far.
 *
 * ⚠️ AND EVERY NUMBER HERE IS PER FACE. Having looked at two outline faces and found half the
 * fully-joining value about right, I set the four centreline ones by applying the same fraction
 * WITHOUT LOOKING AT THEM. Felix came out at -0.15 and rendered as an unreadable tangle. They need
 * about -0.04 — a quarter of what the rule predicted — because a monoline's letters already very
 * nearly touch, so their bridges are under 1.4mm at no tracking at all and there is almost nothing
 * to close. Half-of-the-join-value was never a rule; it was two observations.
 *
 * ⚠️ BUNDLE COST, and why `loadTopperFace` is async for a lookup that could have been a property.
 *
 * The four outline faces are ~370KB of JSON. Imported statically they land in the main bundle and
 * every designer load pays for them whether or not a topper is on the cake. Behind `import()` Vite
 * emits them as four separate chunks and the ES bundle grows by 10KB — the registry itself —
 * fetching a face only when one is chosen. Measured, not assumed.
 *
 * The UMD build cannot code-split and inlines all four (1.59MB -> 1.98MB). Both web and admin
 * resolve the ESM entry via `exports.import`, so nothing that ships pays it; the CJS file carries
 * the weight for any consumer that requires it. Worth knowing before adding a fifth face.
 *
 * Three more were added for card cutouts (Lilita One, Poppins Bold, Pacifico), taking the outline
 * faces to seven and ~490KB. They are cheaper than the scripts — 25-64KB against 73-104KB — because
 * a block face has far fewer curve segments per glyph. The split still holds: an ESM consumer
 * fetches only the face it picks.
 */

// Parsing a typeface JSON allocates every glyph's outline, so it is done once per face and kept —
// the studio re-parses on every keystroke otherwise.
const parsed = new Map();

export const TOPPER_FACES = {
  great_vibes:      { label: 'Great Vibes',    kind: 'outline',    fit: -0.07, licence: 'OFL 1.1' },
  parisienne:       { label: 'Parisienne',     kind: 'outline',    fit: -0.08, licence: 'OFL 1.1' },
  pinyon_script:    { label: 'Pinyon Script',  kind: 'outline',    fit: -0.08, licence: 'OFL 1.1' },
  dancing_script:   { label: 'Dancing Script', kind: 'outline',    fit: -0.10, licence: 'OFL 1.1' },
  /* ⚠️ BLOCK faces, and their `fit` is near zero where every script above is deeply negative.
   * A script's letters already almost touch, so a small negative closes them into one cuttable
   * piece. A block face's do not come close at any tracking a reader would accept — measured, the
   * value that joins "Sandeep" in Poppins overlaps each letter into the next by a third and sets it
   * as a smear. So these are left set as drawn: on a CARD topper the backing sheet is what joins the
   * letters (grow the offset until the outlines meet), and on acrylic the bar or a bridge does it.
   * Do not "fix" these by driving them negative until the piece count says 1. */
  lilita_one:       { label: 'Lilita One',    kind: 'outline',    fit: -0.012, licence: 'OFL 1.1' },
  poppins_bold:     { label: 'Poppins Bold',  kind: 'outline',    fit: -0.010, licence: 'OFL 1.1' },
  pacifico:         { label: 'Pacifico',      kind: 'outline',    fit: -0.06,  licence: 'OFL 1.1' },
  // ⚠️ The centreline faces need FAR less than the outline ones, and nothing about the outline
  // numbers predicts theirs — see the note below.
  ems_allure:       { label: 'Allure',         kind: 'centreline', fit: -0.04, licence: 'public domain' },
  ems_felix:        { label: 'Felix',          kind: 'centreline', fit: -0.04, licence: 'public domain' },
  ems_elfin:        { label: 'Elfin',          kind: 'centreline', fit: -0.04, licence: 'public domain' },
  hershey_script_1: { label: 'Cursive',        kind: 'centreline', fit: -0.04, licence: 'public domain' },
};

/* ⚠️ ONE resolution for an unknown key, used by everything that takes one.
 *
 * `loadTopperFace` substituted the default face while `faceFit` returned 0, so a design carrying a
 * face an admin had withdrawn rendered the right LETTERS at the wrong SPACING — set as drawn, with a
 * bridge across every gap, and nothing to say why. Caught by a test that meant to assert something
 * else. Both go through here now, so a fallback is one decision rather than each caller's guess. */
const resolveFace = (key) => (TOPPER_FACES[key] ? key : DEFAULT_TOPPER_FACE);

// The fit a face wants — the default face's, for a key that is no longer on the list.
export const faceFit = (key) => TOPPER_FACES[resolveFace(key)].fit ?? 0;

/* ⚠️ PARISIENNE, not the first row. Great Vibes is the heaviest script on the list — at a topper's
 * size its strokes read as a slab and the flourishes close up — and being first it was also what an
 * unknown key fell back to, so it was the face most cakes wore without anybody choosing it.
 * Parisienne is the finer hand, which is what a cut topper actually looks like. It is a DEFAULT, not
 * an order: every face above stays on the picker. */
export const DEFAULT_TOPPER_FACE = 'parisienne';

// The outline JSONs, keyed to match. Static so the library build resolves them; see the bundle note.
const OUTLINE_JSON = {
  great_vibes:    () => import('./typefaces/great-vibes.json'),
  parisienne:     () => import('./typefaces/parisienne.json'),
  pinyon_script:  () => import('./typefaces/pinyon-script.json'),
  dancing_script: () => import('./typefaces/dancing-script.json'),
  lilita_one:     () => import('./typefaces/lilita-one.json'),
  poppins_bold:   () => import('./typefaces/poppins-bold.json'),
  pacifico:       () => import('./typefaces/pacifico.json'),
};

/* The font object `topperShapes` wants, for either kind.
 *
 * Async because an outline face is a hundred kilobytes of JSON and there is no reason for a caller
 * that only ever uses a monoline to carry four of them. Centreline faces resolve immediately — they
 * are already in the cream pen's bundle.
 */
/* ⚠️ THE STUDIO'S PLAIN BLOCK FACE, WHICH IS NOT IN `TOPPER_FACES`. It is not offered in the face
 * picker — it is what a topper falls back to and what presets are drawn in — but it still has to be
 * LOADABLE, because `resolveFace` sends an unknown key to the default and the default is a SCRIPT.
 * Before this lived here, a caller that forgot got Great Vibes silently: the card topper's print
 * source hit it, and every future caller would have. One key, resolved in the one place that knows
 * how to load a face. */
export const BLOCK_FACE = '__block';

/** Every face a topper payload needs, loaded, keyed by face — with the block one always present so
 *  a caller can fall back without knowing what "block" means. */
export async function loadFacesFor(payload) {
  const wanted = new Set([BLOCK_FACE]);
  for (const o of payload?.objects ?? []) if (o.kind === 'text' && o.face) wanted.add(o.face);
  const out = {};
  await Promise.all([...wanted].map(async (key) => {
    try { out[key] = await loadTopperFace(key); } catch { /* the caller falls back to block */ }
  }));
  return out;
}

export async function loadTopperFace(key) {
  if (key === BLOCK_FACE) {
    if (parsed.has(BLOCK_FACE)) return parsed.get(BLOCK_FACE);
    // Dynamic, like every other face here, so nothing pays for it until a topper is drawn.
    const mod = await import('three/examples/fonts/helvetiker_bold.typeface.json');
    const f = new FontLoader().parse(mod.default ?? mod);
    parsed.set(BLOCK_FACE, f);
    return f;
  }
  const k = resolveFace(key);
  if (parsed.has(k)) return parsed.get(k);

  let font;
  if (TOPPER_FACES[k].kind === 'centreline') {
    font = creamFonts[k];
  } else {
    const mod = await OUTLINE_JSON[k]();
    font = new FontLoader().parse(mod.default ?? mod);
  }
  parsed.set(k, font);
  return font;
}

// Whether a face's stroke width is a control or a property of the drawing. The studio shows the
// Stroke slider only where it does something; the check itself is the face's `kind`, never its name.
export const isMonoline = (key) => TOPPER_FACES[key]?.kind === 'centreline';
