import { createRoot } from 'react-dom/client';
import ElementPreview from '../src/designer/preview/ElementPreview.jsx';
import './scene.js';

/* ── A catalogue element on a bendable wire ──────────────────────────────────────────────────────
 *
 * Butterflies hovering off a cake on thin white stems. Sandeep, with two reference photographs:
 * *"if you see these butterflies are standing on a white color bendable wire. we already have
 * butterfly elements, however we need to be able to attach this wire support."*
 *
 * ⚠️ THE PICTURE ANSWERS WHAT THE NUMBERS CANNOT, which is why this page exists rather than a test.
 * `elementStick`'s 2.2 and 2.6 were chosen here, in this harness's sibling, against a render — and
 * its own comment says so. The defaults in elementWire.js are a first guess by a person who has
 * never bent florist wire; they become right by being looked at.
 *
 * Three things to judge, in order:
 *
 *   1. Does it read as WIRE, or as a pin? The bow is the whole difference. Sweep `bend` and find
 *      where a white rod stops looking like a skewer.
 *   2. Is it thin enough? A stem wire is roughly a quarter of a cocktail stick.
 *   3. Does the butterfly sit where a hand would have put it — out and up, clear of the icing?
 *
 *   /element-wire.html                       the defaults
 *   /element-wire.html?bend=0                straight: the control case, should look wrong
 *   /element-wire.html?bend=0.5              the maximum, where it starts to read as a spring
 *   /element-wire.html?lean=0                vertical, which hand-bent wire never is
 *   /element-wire.html?lean=45&bend=0.3      the reference photographs' look
 *   /element-wire.html?len=6                 a long stem, high above the cake
 *   /element-wire.html?thick=0.6             too fat, for comparison
 *   /element-wire.html?bury=1                pushed right in, the piece down on the icing
 *   /element-wire.html?wire=0                no wire — the control
 *
 * ⚠️ `?glb=` TAKES A BUTTERFLY. It defaults to the fondant heart because that is the element this
 * harness's sibling already proves the chain with, and swapping the artwork must not be the thing
 * that breaks. Paste a real butterfly's GLB url to judge the pairing.
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const WIRE  = q.get('wire') !== '0';
const BEND  = num('bend', undefined);
const LEAN  = num("sweep", num("lean", undefined));
const LEN   = num('len', undefined);
const THICK = num('thick', undefined);
const BURY  = num('bury', undefined);

/* Only the keys actually given, so anything absent falls through to ELEMENT_WIRE_DEFAULTS — the
   case worth looking at is what a row that authors nothing gets. */
const shape = Object.fromEntries(Object.entries({
  length: LEN, thickness: THICK, bend: BEND, sweep: LEAN, bury: BURY,
}).filter(([, v]) => v != null && Number.isFinite(v)));

/* ⚠️ A 2D IMAGE IS A DIFFERENT RENDER PATH, NOT A DIFFERENT FILE EXTENSION, and it is the path the
   butterflies actually use. Sandeep: *"butterfly is not glb. its a image element."* A GLB is
   measured by `StickerModel` from a Box3; a PNG is measured by `StickerTexture` from its opaque
   pixels — and until now only the first of those reported a BOX, so a stick or a wire on an image
   element drew nothing at all. `?img=1` exercises that path with a transparent test shape; `?img=`
   takes a real element's url. */
const TEST_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAB+ElEQVR4nO3Ry3FCMRAFUcJ0FA6XdOyCBRuK30Ojlu50V929NOd0MjMzMzMzM7PYzj+/f/Qb7EAXuNGj/9S6ClDB4QhUsYujIcUuikYTuigaSeiiaBShC6MhRC6KPr7QhdEHF7kw+tAiF0Ufd6XRFsOjD7riaJNh0YdcebTN19EH3GG00eHow+002urj6IPtONrs7ehD7Tza7mX0gRJGGz6NPk7CaMOH0YdJGm15F32QxNGmt+hDJI+2vUYfIXm0rbjJyPTHO03g8InbYAKHT9wGEzh84jaYwOETOHziNpjA4RM4fOI2mMDhEzh8AodP3AYTOHwCh0/g8AkcPoHDJ3D4BA6fwOETOHziNpjIwfsaV+C1J3D4BA6fwOETOHwCh0/g8AkcPoHDNwRY5DU3DFfgNSdw+AQO31BgkdfacFyB15rA4SsBFnmNleEKvMYEDl8psMjhuAI3ABY5HFfgBsAih+MK3ABY5HBckRvgXqKPkDza9hZ9iMTRpnfRB0kabfkw+jAJow2fRh8nYbThy+gD7Tza7u3oQ+042uzj6IPtNNrqcPThdhht9HX0AVcebTMs+pArjjYZHn3QlUZblEYfV9gJ0YcWd0L0wcWdFH18YSdEQ4g7KRpF2EnRSMJOikYTdmI0pKgTE7VZgto14czMzMzMzFr3D78xf7bvIjwlAAAAAElFTkSuQmCC';
const IMG = q.get('img');
const FOLD = q.get('fold') === '1';
const ART = q.get('glb') ?? (IMG === '1' ? TEST_PNG : IMG) ?? '/cdn/elements/files/3D/5c642a4f-231c-4a0a-a7c8-372415863cfa.glb';

const PIECE = {
  id: `wire-${JSON.stringify(shape)}-${WIRE}-${FOLD}-${ART.slice(-24)}`,
  name: 'element on a wire',
  image_url: ART,
  allowed_zones: ['top_surface'],
  default_color: '#c9b6e4',
  placement_config: {
    r: 2, scale: { max: 6, min: 0.5, step: 0.25 },
    metalness: 0.0015, roughness: 0.3876,
    top_surface: { modes: ['stand'] },
    /* ⚠️ `?fold=1` IS THE CASE THE BUTTERFLIES ACTUALLY USE. Standing, a foldable sticker hinges its
       wings up into a V from the spine — so the lowest point stops being a wingtip and becomes the
       body, and a wire hung from the flat bottom starts in mid-air below it. Sandeep: *"butterfly
       can be folded in core. so need to adjust wire accordingly."* */
    ...(FOLD ? { foldable: true } : {}),
    wire: shape,
  },
  // The capability is what offers the wire; without it the designer shows no toggle at all.
  allowed_actions: { move: true, tilt: true, color: true, delete: true, resize: true, wire: WIRE },
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%' }}>
    {/* ⚠️ OFF AT PLACEMENT, like the pick — "can add a wire", so a baker decides. Previewing it
        means saying so explicitly, exactly as the card's toggle does. */}
    <ElementPreview element={PIECE} zone="top_surface" mode="stand" autoRotate={false}
                    extra={WIRE ? { wire: { on: true, ...shape } } : null}
                    style={{ height: '100%' }} />
  </div>,
);
