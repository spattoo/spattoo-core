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
 */

// Parsing a typeface JSON allocates every glyph's outline, so it is done once per face and kept —
// the studio re-parses on every keystroke otherwise.
const parsed = new Map();

export const TOPPER_FACES = {
  great_vibes:      { label: 'Great Vibes',    kind: 'outline',    licence: 'OFL 1.1' },
  parisienne:       { label: 'Parisienne',     kind: 'outline',    licence: 'OFL 1.1' },
  pinyon_script:    { label: 'Pinyon Script',  kind: 'outline',    licence: 'OFL 1.1' },
  dancing_script:   { label: 'Dancing Script', kind: 'outline',    licence: 'OFL 1.1' },
  ems_allure:       { label: 'Allure',         kind: 'centreline', licence: 'public domain' },
  ems_felix:        { label: 'Felix',          kind: 'centreline', licence: 'public domain' },
  ems_elfin:        { label: 'Elfin',          kind: 'centreline', licence: 'public domain' },
  hershey_script_1: { label: 'Cursive',        kind: 'centreline', licence: 'public domain' },
};

export const DEFAULT_TOPPER_FACE = 'great_vibes';

// The outline JSONs, keyed to match. Static so the library build resolves them; see the bundle note.
const OUTLINE_JSON = {
  great_vibes:    () => import('./typefaces/great-vibes.json'),
  parisienne:     () => import('./typefaces/parisienne.json'),
  pinyon_script:  () => import('./typefaces/pinyon-script.json'),
  dancing_script: () => import('./typefaces/dancing-script.json'),
};

/* The font object `topperShapes` wants, for either kind.
 *
 * Async because an outline face is a hundred kilobytes of JSON and there is no reason for a caller
 * that only ever uses a monoline to carry four of them. Centreline faces resolve immediately — they
 * are already in the cream pen's bundle.
 */
export async function loadTopperFace(key) {
  const k = TOPPER_FACES[key] ? key : DEFAULT_TOPPER_FACE;
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
