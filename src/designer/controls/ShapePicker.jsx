import { useState } from 'react';
import { CakePreview } from '../canvas/CakeCanvas.jsx';
import { starterDesign } from '../hooks/useCakeDesign.js';
import { tierGeometry } from '../cakeShapes.js';
import { isGlyphFamily, glyphTierDims, GLYPH_FAMILIES } from '../geometry/glyphShape.js';
import GlyphInput, { GLYPH_INPUT_PROPS } from './GlyphInput.jsx';
import { Panel } from '../../shared/Panel.jsx';

// Prompt copy per glyph family — the only per-family wording the picker carries.
const GLYPH_COPY = {
  number: { title: 'Your number cake', sub: 'Type your number — you can change it later', ask: 'What number would you like your cake shaped as?' },
  letter: { title: 'Your letter cake', sub: 'Type your letters — you can change it later', ask: 'What letters would you like your cake shaped as?' },
};

// The camera a shape is photographed from. The Cake Shape Studio captures its thumbnail through this and
// the live tile renders through it — ONE camera, or a shape would change appearance the moment somebody
// saved a picture of it.
//
// It FITS THE CAKE rather than being a fixed position, because a shape can now be a stack: a fixed camera
// framed for one tier decapitates a two-tier cake, and a catalog holding 1-, 2- and 3-tier structures has
// no single distance that flatters all of them. So the distance is derived from what is actually being
// photographed — total height and widest footprint — and every cake fills its tile the same way.
//
// The front of the cake, LIFTED ~25°: dead-on, a heart is a slab with a notch and reads as a box, and the
// footprint — the entire thing being chosen — is precisely what a pure front view hides. Long lens (20°)
// so the cake doesn't splay outward at the base the way a wide angle makes a straight wall bulge.
const SHAPE_FOV = 20;
const SHAPE_ELEV = 25 * (Math.PI / 180);

export function shapeView(design) {
  const tiers = design?.tiers ?? [];
  // A glyph tier (number/letter) carries no honest width/height (its box is DERIVED from the typed
  // characters + byCount), so ask the geometry for it — otherwise a "2027"/"ABC" tile frames as if it
  // were one narrow glyph. Every other family is sized by its own tier fields.
  const box = t => { const fam = tierGeometry(t).family; return isGlyphFamily(fam)
    ? glyphTierDims(fam, t.shapeConfig)
    : { width: t.width ?? (t.radius ?? 1.2) * 2, depth: t.depth ?? (t.radius ?? 1.2) * 2, height: t.height ?? 1.45 }; };
  const boxes = tiers.map(box);
  const totalH = boxes.reduce((h, b) => h + b.height, 0) || 1.45;
  const maxW = boxes.length ? Math.max(...boxes.map(b => Math.max(b.width, b.depth))) : 2.4;

  // Fit the LARGER of the cake's height and its width, with headroom for the board it stands on.
  const fit = Math.max(totalH * 1.5, maxW * 1.25);
  const dist = (fit / 2) / Math.tan((SHAPE_FOV / 2) * (Math.PI / 180));
  // Aim at the cake's middle, not the board. Deliberately NOT the designer's rule (framing.js): that
  // one aims above the middle to sit the cake low on a big stage, which is right for a stage and
  // wrong for a 96px tile — here the shape is the whole subject and wants to be centred in its box.
  const cy = totalH * 0.45;
  return {
    fov: SHAPE_FOV,
    cameraPosition: [0, cy + dist * Math.sin(SHAPE_ELEV), dist * Math.cos(SHAPE_ELEV)],
    target: [0, cy, 0],
  };
}

// ── Shape tile — a cake, from the front ───────────────────────────────────────
// A cake, NOT a footprint. The first version of this drew the top-down outline, and it was useless on
// sight: every circle-family shape (Round, Cylinder, 2T Cylinder) drew the identical pink disc, so the
// grid was a geometry lesson that told you nothing about the cake you were about to start.
//
// Preferred source is the saved front view (`thumbnailKey`, rendered through the real renderer when admin
// saved the shape) — an <img> costs nothing, so the grid holds up at any catalog size. A shape with no
// picture yet falls back to rendering the real starter cake live: correct, and self-limiting, since it
// only costs a WebGL context for shapes nobody has captured. (A grid of ALL-live tiles would not hold:
// browsers cap concurrent contexts around 16 and start blanking the extras.)
export function ShapeTile({ shape, size = 96 }) {
  if (shape.thumbnailKey) {
    return (
      <img
        src={shape.thumbnailKey} alt="" width={size} height={size}
        loading="lazy" decoding="async"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  // An authored row draws its own stored design; seed round/rect (no stored design) are built live.
  const design = shape.design ?? starterDesign(shape.key);
  return (
    <div style={{ width: size, height: size }}>
      <CakePreview design={design} autoRotate={false} {...shapeView(design)} />
    </div>
  );
}

// ── The New-cake shape grid ───────────────────────────────────────────────────
// The first thing pressing "New" asks. It offers whatever is in the catalog — the two seeded keys plus
// every shape admin authored in the Cake Shape Studio — so a new shape reaches customers as a DB row, not
// a release. `shapes` is passed in rather than read from the module, so the caller owns the one list this
// grid and the tier's Shape row both read.
//
// Closing WITHOUT choosing leaves the cake alone: the caller discards nothing until onPick fires, so a
// mis-tap on New costs nothing.
//
// A GLYPH cake (number or letter) is generic — one tile shapes itself to any string the customer types (a
// character is a recipe, not an asset, so per-string rows don't scale). So picking a glyph tile doesn't
// create the cake yet: it asks for the characters first — the defining choice — then hands them to
// `onPick(key, { shapeConfig: { <digits|letters>: text } })`. Detected by the tier's resolved FAMILY
// (`tierGeometry`), never a key/label, so any authored number/letter starter works.
export default function ShapePicker({ shapes, onPick, onClose }) {
  const [glyphShape, setGlyphShape] = useState(null);   // the glyph tile awaiting text, or null (grid)
  const [glyphFam, setGlyphFam]     = useState(null);   // 'number' | 'letter' for that tile
  const [text, setText] = useState('');

  const glyphFamilyOf = s => {
    const f = tierGeometry((s.design ?? starterDesign(s.key)).tiers?.[0] ?? {}).family;
    return isGlyphFamily(f) ? f : null;
  };
  const pick = s => { const f = glyphFamilyOf(s); if (f) { setText(''); setGlyphFam(f); setGlyphShape(s); } else onPick(s.key); };
  const create = () => onPick(glyphShape.key, { shapeConfig: { [GLYPH_FAMILIES[glyphFam].textKey]: text } });
  const copy = glyphFam ? GLYPH_COPY[glyphFam] : null;

  return (
    <Panel
      onClose={onClose}
      title={copy ? copy.title : 'Start a new cake'}
      subtitle={copy ? copy.sub : 'Pick a shape — you can change it later'}
      width={520}
      bodyPadding={16}
    >
      {glyphShape ? (
        <div style={styles.numStep}>
          <div style={styles.numArt}><ShapeTile shape={glyphShape} size={128} /></div>
          <div style={styles.numLabel}>{copy.ask}</div>
          <GlyphInput value={text} onChange={setText} onEnter={create} autoFocus {...GLYPH_INPUT_PROPS[glyphFam]} />
          <div style={styles.numRow}>
            <button style={styles.backBtn} onClick={() => setGlyphShape(null)}>← Back</button>
            <button style={styles.createBtn} onClick={create}>Create cake</button>
          </div>
        </div>
      ) : (
        <div style={styles.grid}>
          {shapes.map(s => (
            <button key={s.key} style={styles.card} onClick={() => pick(s)}>
              <div style={styles.art}><ShapeTile shape={s} /></div>
              <div style={styles.name}>{s.label}</div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 },
  card:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10, border: '1.5px solid #e2e0e6', borderRadius: 12, background: '#faf9fb', cursor: 'pointer', fontFamily: 'inherit' },
  art:   { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96 },
  name:  { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.3 },

  numStep:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 4px' },
  numArt:    { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 128, height: 128 },
  numLabel:  { fontSize: 13, fontWeight: 700, color: '#3a3a44', textAlign: 'center', lineHeight: 1.35 },
  numRow:    { display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 2 },
  backBtn:   { flex: '0 0 auto', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d9d9e0', background: '#fff', color: '#555', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  createBtn: { flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
};
