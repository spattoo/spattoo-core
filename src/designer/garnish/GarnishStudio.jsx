import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '../../shared/Panel.jsx';
import Segmented from '../../shared/Segmented.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { tidyDrawn, fillWorthwhile } from '../geometry/drawnShape.js';
import { snapStroke } from '../geometry/strokeSnap.js';
import { snapPolygon } from '../geometry/snapPolygon.js';
import { pointInRing } from '../geometry/regions.js';
import { panelsFrom } from '../geometry/garnishPanel.js';
import { fillShape, FILL_PATTERNS } from '../geometry/pipingFill.js';
import { findRegions } from '../geometry/regions.js';

// ── Piping a chocolate garnish, off the cake ─────────────────────────────────────────────────────
//
// A flat surface to pipe on, which is how these are actually made: piped on parchment, set hard,
// peeled off, and pushed into the buttercream. Drawing it here rather than on the cake is what makes
// it an OBJECT — something that can be stood upright, moved, and used again on another cake. See
// plans/chocolate-garnish-studio.md.
//
// ⚠️ A PIECE IS SEVERAL STROKES, and the first prototype allowed only one. Look at any real filigree:
// a leaf is an outline and then its veins; a flower is a petal, and another petal, and another. Each
// is a separate squeeze with the nozzle lifted between them. Keeping only the last stroke made every
// piece a single closed blob, which is not what anybody draws.
//
// ⚠️ FILL IS PER-STROKE AND STARTS AT NONE. Half the reference pieces are outline only — the clefs,
// the loops, the veins — and a shape that never closed has no inside at all. Filling by default would
// decide for the baker; the same rule the photo editor settled on.

export const PLATE = 420;          // the studio's own square, in its own units
const INK = '#4A2C1B';
const SURFACE = '#F6F4F0';

/* ── Ready-made shapes ───────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE REFERENCE GARNISHES ARE GEOMETRIC, and a hand cannot draw a clean triangle with a mouse.
 * Auto-correct tidies a wobble; it cannot invent the straight edges and equal angles those cut panels
 * are made of. Picking the shape is the honest route to them.
 *
 * Each is inserted as ONE CLOSED PATH, which makes it a region the moment it lands — so it can be
 * filled straight away, by the same rule that has always applied to a shape drawn in one loop.
 *
 * Sized to a fraction of the plate rather than in absolute units, so they stay proportionate if the
 * plate is ever resized, and centred because that is where the eye is.
 */
const polygon = (n, r, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a2 = rot + (i / n) * Math.PI * 2;
    return [PLATE / 2 + Math.cos(a2) * r, PLATE / 2 + Math.sin(a2) * r];
  });

/* ⚠️ THE ICON IS THE SHAPE, PIPED. A word makes you read and translate; a picture of the thing is
 * recognised without either. And drawing them as chocolate ropes — round caps, the piece's own colour,
 * a stroke rather than a fill — means the button shows what you are about to get instead of a generic
 * geometric glyph. It also tracks the chosen colour, so a white-chocolate piece has white buttons. */
/* ⚠️ A FIXED CHOCOLATE, NOT THE PIECE'S COLOUR. These were tinted with whatever colour was chosen,
 * on the theory that a white-chocolate piece deserves white buttons. Wrong: this is a palette of
 * TOOLS, and a tool does not restyle itself according to what you last made with it. Turning every
 * shape button purple because one triangle is purple says the buttons are a preview when they are a
 * menu. */
const ShapeIcon = ({ kind }) => {
  const st = { fill: 'none', stroke: INK, strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      {/* The icon is the shape it makes — a spike, not an equilateral triangle. An icon that
          disagrees with its result teaches the wrong thing before the first tap. */}
      {kind === 'triangle' && <path d="M13 3 L18 21 L8 21 Z" {...st} />}
      {kind === 'heart' && (
        <path d="M13 21 C4 14.5 4.5 7 9 6.2 C11 5.8 12.4 7 13 8.4 C13.6 7 15 5.8 17 6.2 C21.5 7 22 14.5 13 21 Z" {...st} />
      )}
      {kind === 'square'   && <rect x="5" y="5" width="16" height="16" rx="1.5" {...st} />}
      {kind === 'circle'   && <circle cx="13" cy="13" r="8.5" {...st} />}
      {kind === 'strip'    && <rect x="3" y="9" width="20" height="8" rx="1.5" {...st} />}
    </svg>
  );
};

/* ⚠️ A GARNISH TRIANGLE IS A SPIKE, not an equilateral one. Look at the reference cakes: the panels
 * standing round the rim are tall and narrow, because that is what reads from the side of a cake and
 * what survives being stood upright. An equilateral triangle is the geometric default and the wrong
 * default here — the shape a baker wants is the one their cake wants. */
const spike = (halfWidth, height) => {
  const cx = PLATE / 2, cy = PLATE / 2;
  return [[cx, cy - height], [cx + halfWidth, cy + height * 0.7], [cx - halfWidth, cy + height * 0.7]];
};

/* A heart from the classic parametric curve, sampled and flipped for screen coordinates (y grows
 * downward on a canvas). Sampled at 40 points: enough that the lobes read as curves at plate size,
 * few enough that the path stays small — and the paths are what gets stored and turned into a guide. */
const heart = (scale) => {
  const cx = PLATE / 2, cy = PLATE / 2;
  return Array.from({ length: 40 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [cx + x * scale, cy - y * scale];
  });
};

export const SHAPES = [
  { key: 'triangle', label: 'Triangle', make: () => spike(PLATE * 0.11, PLATE * 0.3) },
  { key: 'square',   label: 'Square',   make: () => polygon(4, PLATE * 0.28, -Math.PI / 4) },
  // 48 sides reads as a circle at any size the plate can show, and stays a short path to store.
  { key: 'circle',   label: 'Circle',   make: () => polygon(48, PLATE * 0.28) },
  { key: 'heart',    label: 'Heart',    make: () => heart(PLATE * 0.017) },
  { key: 'strip',    label: 'Strip',    make: () => {
      const w = PLATE * 0.34, h = PLATE * 0.12, cx = PLATE / 2, cy = PLATE / 2;
      return [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]];
    } },
];

/** Every polyline in the piece, outlines and fills together — what gets saved and what gets built
 *  into geometry. Order is piping order, so a build guide can read it as instructions. */
export const piecePaths = strokes => strokes.flatMap(s => [s.path, ...s.fills]);

/* ⚠️ THE COLOUR CONTROL IS PASSED IN, not built here. `ColorWheel` is THE colour control for every
 * colour a customer picks (INVARIANTS #3) and it lives inside CakeDesigner; a row of hand-rolled
 * chocolate swatches would be a second answer to a settled question, which is exactly the mistake
 * the letter-blocks card made and was caught on within the hour. */
export default function GarnishStudio({
  initialName = '', color = INK, rope: ropeProp = 6, onRopeChange, colorControl = null,
  apiClient = null, openWith = null, onSave, onCancel,
}) {
  const ROPE = ropeProp;
  const ref = useRef(null);
  const [trail, setTrail] = useState([]);          // the live stroke, as state — see the note below
  const [strokes, setStrokes] = useState([]);
  const [name, setName] = useState(initialName);
  /* Where it goes and how it sits, decided HERE rather than after the fact. The piece is finished
     when it leaves this screen, and "where does it live" is the last question about it. */
  /* ⚠️ HOW IT IS MADE, not how it looks. Piped is a nozzle laying a rope; cut is chocolate spread,
     set and cut into shapes. It decides the geometry (swept tube vs extruded slab), what a fill even
     means (lacy passes vs solid by definition), and which build guide the X-ray prints — a motion, or
     a cutting template. A property of the PIECE, not of a stroke: nobody pipes half a garnish and
     cuts the other half. */
  const [kind, setKind] = useState('piped');
  const [autoShape, setAutoShape] = useState(true);
  /* Which stroke the hands are on. A shape lands centred, so a piece made of several — which is what
     the reference garnishes are — is unusable until they can be moved apart. */
  const [picked, setPicked] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  const dragRef = useRef(null);
  const [zone, setZone] = useState('top');
  const [mode, setMode] = useState('stand');
  /* ⚠️ THE LIBRARY IS OPTIONAL, and its absence must not break the studio. `apiClient` may not carry
     the garnish methods at all — an older host app, or an API that has not been deployed yet — and
     the answer to that is a studio that draws and places perfectly well but cannot keep anything,
     not a screen that throws. Every call below is optional-chained for that reason. */
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const isMobile = useNarrow();
  const drawing = trail.length > 0;

  const last = strokes[strokes.length - 1] ?? null;
  /* ⚠️ THE COLOUR PICKER BELONGS TO THE PARENT, so the studio cannot intercept the click — it can
     only notice that the prop changed. When something is picked, that choice was made FOR the picked
     shape and is stamped onto it; with nothing picked it is the colour new shapes will take. This is
     per-region colour: white chocolate inside dark is two shapes carrying two colours, not one piece
     forced to choose. A shape with no colour of its own follows the piece, so nothing already drawn
     freezes at whatever the picker happened to say when it was made. */
  const lastColor = useRef(color);
  useEffect(() => {
    const changed = lastColor.current !== color;
    lastColor.current = color;
    if (!changed || picked == null) return;
    setStrokes(all => all.map((s2, i) => (i === picked ? { ...s2, color } : s2)));
  }, [color, picked]);

  const subject = picked != null ? strokes[picked] : last;

  /* ⚠️ NOBODY DRAWS A SHAPE IN ONE GESTURE. A leaf is five strokes that meet; a triangle is three
     lines. Asking each stroke on its own whether IT closed is why a perfectly closed drawing was
     told "that stroke is open, so there is nothing to fill" — the shape was closed, no single stroke
     was, and the studio could only see strokes. `findRegions` welds the endpoints and returns the
     CYCLES, which is what a fillable shape actually is. It is recomputed from the outlines only,
     never from generated fill passes, or the fill would weld to itself and every shape would look
     closed. */
  const regions = useMemo(
    () => findRegions(strokes.map(s2 => s2.path)).regions,
    [strokes],
  );
  const targetIndex = picked != null ? picked : strokes.length - 1;
  const regionOf = i => regions.find(r => r.paths.includes(i)) ?? null;
  // A ring of its own, or one it forms together with its neighbours.
  const fillRing = subject?.ring ?? regionOf(targetIndex)?.ring ?? null;
  const canFill = !!fillRing;
  /* The colour of the thing being worked on — the picked shape if there is one, otherwise the colour
     new shapes will take. This is per-region colour: white chocolate inside dark is two shapes with
     two colours, not one piece with a compromise. */
  const subjectColor = subject?.color ?? color;

  // ── Draw ──────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = SURFACE; x.fillRect(0, 0, w, h);

    const k = w / PLATE;                            // plate units → css pixels
    /* ⚠️ THE PLATE IS THE ONLY SURFACE, so the chocolate has to be ON it. There was a second panel
       below showing the piece rendered in 3D — the same art twice, which read as two different
       drawings and invited the question "why is one corrected and one not?" when in fact both were.
       One area is enough, and it should be the one the hand is already on.

       A piped rope is round, so it is drawn in three passes rather than as flat ink: a dark rim, the
       chocolate itself, and a highlight offset towards the light. That is what makes it read as a
       tube with a wet finish instead of a marker line. It is an approximation — a canvas has no
       material — but it is an approximation IN THE RIGHT DIRECTION, which flat ink was not. */
    const rope = (pts, width, colour = color) => {
      if (!pts || pts.length < 2) return;
      const path = () => {
        x.beginPath();
        pts.forEach(([a, b], i) => (i ? x.lineTo(a * k, b * k) : x.moveTo(a * k, b * k)));
      };
      x.lineCap = 'round'; x.lineJoin = 'round';

      path(); x.lineWidth = width * k;        x.strokeStyle = shade(colour, -0.45); x.stroke();
      path(); x.lineWidth = width * k * 0.78; x.strokeStyle = colour;               x.stroke();

      // The highlight runs ALONG the rope, offset towards the light — a thin bright line, because a
      // narrow tube catches a narrow highlight. Wider and it reads as a second, paler stroke.
      x.save();
      x.translate(-width * k * 0.16, -width * k * 0.16);
      path(); x.lineWidth = Math.max(0.6, width * k * 0.2);
      x.strokeStyle = shade(colour, 0.5); x.globalAlpha = 0.75; x.stroke();
      x.restore();
      x.globalAlpha = 1;
    };
    // Flat, for the marks that are NOT chocolate — the selection outline and the resize handle.
    const line = (pts, width, colour = color) => {
      if (!pts || pts.length < 2) return;
      x.beginPath();
      pts.forEach(([a, b], i) => (i ? x.lineTo(a * k, b * k) : x.moveTo(a * k, b * k)));
      x.lineWidth = width * k; x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = colour;
      x.stroke();
    };

    if (kind === 'cut') {
      /* ⚠️ THE PLATE MUST SHOW WHAT THE CAKE WILL SHOW. Drawing a cut piece as outlines would let
         somebody design a solid panel while looking at a wireframe of it, so every judgement made
         here would be about something they are not getting. Holes punched with evenodd — the same
         "a ring inside a ring is a hole" rule the geometry uses. */
      const rings = strokes.filter(s2 => s2.ring);
      for (const panel of panelsFrom(rings.map(s2 => s2.ring)).map(pn => ({
        ...pn, color: rings.find(s2 => s2.ring === pn.outline)?.color ?? color,
      }))) {
        x.beginPath();
        for (const ring of [panel.outline, ...panel.holes]) {
          ring.forEach(([a2, b2], i) => (i ? x.lineTo(a2 * k, b2 * k) : x.moveTo(a2 * k, b2 * k)));
          x.closePath();
        }
        x.fillStyle = panel.color ?? color;
        x.fill('evenodd');
        // A cut panel is a SLAB, so it has an edge. Without one it reads as paper, not chocolate.
        x.strokeStyle = shade(panel.color ?? color, -0.4);
        x.lineWidth = Math.max(1, 2 * k * 1.2);
        x.stroke();
      }
      // An open stroke has no inside and cannot be cut, so it stays a line — which is also the
      // honest signal that it will not become part of the panel.
      for (const s2 of strokes) if (!s2.ring) rope(s2.path, ROPE + 2);
    } else {
      for (const s2 of strokes) {
        const c2 = s2.color ?? color;               // each shape keeps its own chocolate
        for (const f of s2.fills) rope(f, ROPE, c2);
        rope(s2.path, ROPE + 2, c2);                // the outline sits over its own fill
      }
    }
    if (picked != null && strokes[picked]) {
        const [hx, hy] = handleAt(strokes[picked]);
      x.beginPath();
      x.arc(hx * k, hy * k, ROPE * 1.6 * k, 0, Math.PI * 2);
      x.fillStyle = '#2b5ac8'; x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
      // A thin halo, not a box: the shapes are not rectangles and a box round a triangle points at
      // empty corners rather than at the thing selected.
      line(strokes[picked].ring ?? strokes[picked].path, 1.6, 'rgba(40,90,200,0.9)');
    }
    // Wet, still being piped: lighter, so in-progress reads differently from finished.
    if (drawing) rope(trail, ROPE + 2, 'rgba(74,44,27,0.55)');
    // ⚠️ colour and ROPE are dependencies too: without them the plate keeps the shade and the line
    // width it was first painted with, and the controls appear to do nothing until the next stroke.
  }, [strokes, trail, drawing, color, ROPE, picked, kind]);

  /* Opened FROM a kept piece: load it once, so the studio starts on the drawing rather than on a
     blank plate. Keyed on the piece's id so choosing a different one reloads, and re-renders in
     between do not stamp on edits the baker has since made. */
  useEffect(() => { if (openWith) openSaved(openWith); /* eslint-disable-next-line */ }, [openWith?.id]);

  useEffect(() => {
    let alive = true;
    apiClient?.fetchGarnishes?.()
      .then(rows => { if (alive) setSaved(rows ?? []); })
      .catch(() => {});          // no library is a quieter failure than a broken one
    return () => { alive = false; };
  }, [apiClient]);

  /* What gets STORED: the outlines and the NAME of each fill, never the generated fill paths. They
     are most of the size and they regenerate exactly from a seed — see supabase/baker_garnishes.sql. */
  const payloadOf = () => ({
    v: 1, plate: PLATE, rope: ROPE, color, kind,
    strokes: strokes.map(s2 => ({
      path: s2.path.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]),
      fill: s2.fillPattern && s2.fillPattern !== 'none' ? s2.fillPattern : null,
      // Only when it differs from the piece's, so a single-colour drawing stays as small as before.
      color: s2.color && s2.color !== color ? s2.color : undefined,
    })),
  });

  /* The tile is drawn FROM the paths — it is literally the plate the baker just looked at, so it is a
     sample of the piece rather than an illustration of one. */
  const thumbnail = () => {
    try { return ref.current?.toDataURL('image/png') ?? null; } catch { return null; }
  };

  async function keepAndAdd() {
    setSaving(true);
    try {
      await apiClient?.saveGarnish?.({
        name: name.trim() || 'Chocolate piece', payload: payloadOf(), thumbBase64: thumbnail(),
      });
    } catch (e) {
      // ⚠️ A FAILED SAVE STILL PLACES THE PIECE. The baker drew it; losing it because a network call
      // failed would be the worst possible trade, and they can save it again from the card later.
      console.error('Could not keep the garnish', e);
    } finally {
      setSaving(false);
      addToCake();
    }
  }

  /* ⚠️ PRESSING ON A SHAPE MOVES IT; PRESSING ON BARE PLATE DRAWS. One gesture, decided by what is
     under the finger, rather than a mode the baker has to remember they are in. Topmost first, so the
     thing drawn last — the thing they are most likely to be reaching for — wins an overlap. */
  const hitStroke = pt => {
    /* ⚠️ THE SMALLEST SHAPE THAT CONTAINS THE POINT WINS, not the most recent. Last-added seemed
       reasonable and made a whole class of piece unreachable: a circle contains nearly the entire
       plate, so once one was added, pressing anywhere — including inside the triangle sitting on top
       of it — picked and dragged the circle. A shape drawn INSIDE another could never be selected at
       all, which is exactly the arrangement the reference garnishes are made of.

       Smallest-first is also what a hand expects: press inside the little shape, get the little
       shape. */
    let best = null, bestArea = Infinity;
    strokes.forEach((s2, i) => {
      if (!s2.ring || !pointInRing(pt, s2.ring)) return;
      const a2 = Math.abs(ringArea(s2.ring));
      if (a2 < bestArea) { best = i; bestArea = a2; }
    });
    if (best != null) return best;

    // Nothing contains it: an open stroke has no inside, so it is caught by nearness to the line —
    // most recent first, since two lines crossing is a genuine tie and the newer one is the one in hand.
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].path.some(q => Math.hypot(q[0] - pt[0], q[1] - pt[1]) <= ROPE * 2.5)) return i;
    }
    return null;
  };

  const ringArea = ring => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return sum / 2;
  };

  const mapStroke = (s2, f) => ({
    ...s2,
    path: s2.path.map(f),
    ring: s2.ring ? s2.ring.map(f) : null,
    fills: s2.fills.map(fl => fl.map(f)),
  });

  /* ⚠️ A CORNER YOU DRAG, because that is how resizing works everywhere else and it is what a hand
     reaches for. Bigger/Smaller buttons in a side panel are a workaround for a missing handle: they
     make you look away from the thing you are sizing and they only move in fixed steps. The buttons
     stay, for fine adjustment, but they are no longer the only way. */
  const boundsOf = s2 => {
    const xs = s2.path.map(q => q[0]), ys = s2.path.map(q => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const handleAt = s2 => { const b = boundsOf(s2); return [b.x1, b.y1]; };

  const centroidOf = s2 => {
    const pts = s2.path;
    return [pts.reduce((a2, q) => a2 + q[0], 0) / pts.length,
            pts.reduce((a2, q) => a2 + q[1], 0) / pts.length];
  };

  /* Scale about the shape's OWN centre, not the plate's — resizing a piece must not also relocate it,
     which is what scaling about the origin does and is the sort of thing that reads as a bug. */
  function scalePicked(mul) {
    setStrokes(all => all.map((s2, i) => {
      if (i !== picked) return s2;
      const [cx, cy] = centroidOf(s2);
      return mapStroke(s2, ([x, y]) => [cx + (x - cx) * mul, cy + (y - cy) * mul]);
    }));
  }

  /* A shape arrives as a finished stroke: closed, so `ring` is set and the fill controls apply to it
     immediately — the same shape as anything drawn in one gesture. */
  function addShape(shape) {
    /* ⚠️ THE PATH CLOSES ITSELF. A triangle is three points, and a polyline through three points draws
       TWO sides — the third was simply never there. The ring was closed, but the ring is for filling
       and hit-testing; what gets drawn is the path. A closed shape's path must therefore return to
       its first point, or every polygon comes out missing exactly one edge. */
    const poly = shape.make();
    const path = [...poly, poly[0]];
    /* ⚠️ A SHAPE ARRIVES SELECTED. It lands in the middle of the plate, on top of whatever is already
       there, so the very next thing anyone wants is to move or resize it — and its controls only
       exist while it is picked. Landing unselected meant adding a shape and then having to work out
       that you must click the thing you just placed before you can do anything with it. */
    setStrokes(s2 => { setPicked(s2.length); return [...s2, { path, ring: path, closed: true, gap: 0, area: 0, fills: [] }]; });
  }

  /* ⚠️ COLOUR IS A GROUPING, because one mesh can wear one material. A two-tone piece therefore
     travels as PARTS — the shapes gathered by the chocolate they are made of — and the cake builds
     one mesh per part inside a single shared frame. `paths`, `rings` and `color` still travel beside
     them: every piece already saved was written before parts existed, and must go on rendering. */
  const partsOf = list => {
    const by = new Map();
    for (const s2 of list) {
      const c = s2.color ?? color;
      if (!by.has(c)) by.set(c, []);
      by.get(c).push(s2);
    }
    return [...by.entries()].map(([c, group]) => ({
      color: c,
      paths: piecePaths(group),
      rings: group.filter(s2 => s2.ring).map(s2 => s2.ring),
    }));
  };

  function addToCake() {
    onSave?.({
      name: name.trim() || 'Chocolate piece', paths: piecePaths(strokes),
      // The closed rings travel too: a cut piece is built from regions, not from the swept paths.
      rings: strokes.filter(s2 => s2.ring).map(s2 => s2.ring),
      parts: partsOf(strokes),
      kind, rope: ROPE, plate: PLATE, color, zone, mode,
    });
  }

  /* Re-drawing a kept piece: its outlines come back and their fills are REGENERATED, which is the
     whole reason the fill is not stored. */
  function openSaved(g) {
    const p = g.payload ?? {};
    setStrokes((p.strokes ?? []).map((s2, i) => {
      const ring = s2.path.length > 2 ? [...s2.path.slice(0, -1), s2.path[0]] : null;
      const fills = s2.fill && ring
        ? fillShape(ring, { pattern: s2.fill, spacing: ROPE * 2.2, inset: ROPE * 0.5, ropeWidth: ROPE, seed: i + 3 })
        : [];
      return { path: s2.path, ring, fills, fillPattern: s2.fill ?? 'none', color: s2.color };
    }));
    setName(g.name ?? '');
  }

  // ── Capture ───────────────────────────────────────────────────────────────────────────────────
  const at = e => {
    const r = ref.current.getBoundingClientRect();
    const k = PLATE / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  /* ⚠️ THE LIVE TRAIL IS STATE, NOT A REF. Held in a ref with a `setDrawing(true)` to force a
     repaint, React bails out when the value is unchanged and nothing appears until you let go —
     piping you cannot see as you pipe. */
  function down(e) {
    ref.current.setPointerCapture(e.pointerId);
    const pt = at(e);

    /* ⚠️ THE HANDLE IS TESTED FIRST. It sits ON the shape's own corner, so running the shapes first
       would swallow every press on it and the handle would never do anything. */
    if (picked != null && strokes[picked]) {
      const h = handleAt(strokes[picked]);
      if (Math.hypot(h[0] - pt[0], h[1] - pt[1]) <= ROPE * 4) {
        const [cx, cy] = centroidOf(strokes[picked]);
        dragRef.current = { idx: picked, resize: true, cx, cy,
                            from: Math.max(1e-6, Math.hypot(pt[0] - cx, pt[1] - cy)) };
        return;
      }
    }

    const hit = hitStroke(pt);
    if (hit != null) { setPicked(hit); dragRef.current = { idx: hit, last: pt }; return; }
    setPicked(null);
    setTrail([pt]);
  }
  function move(e) {
    const pt = at(e);
    const d = dragRef.current;
    if (d?.resize) {
      // Scaled about the shape's own centre, so dragging the corner grows it where it stands rather
      // than sliding it across the plate — the rule the Bigger/Smaller buttons already follow.
      const now = Math.max(1e-6, Math.hypot(pt[0] - d.cx, pt[1] - d.cy));
      const mul = now / d.from;
      d.from = now;
      setStrokes(all => all.map((s2, i) => (i === d.idx
        ? mapStroke(s2, ([x, y]) => [d.cx + (x - d.cx) * mul, d.cy + (y - d.cy) * mul])
        : s2)));
      return;
    }
    if (d) {
      const dx = pt[0] - d.last[0], dy = pt[1] - d.last[1];
      d.last = pt;
      setStrokes(all => all.map((s2, i) => (i === d.idx ? mapStroke(s2, ([x, y]) => [x + dx, y + dy]) : s2)));
      return;
    }
    if (drawing) setTrail(t => [...t, pt]);
  }
  function up() {
    if (dragRef.current) { dragRef.current = null; return; }
    const tidy = tidyDrawn(trail, { minStep: 3, tolerance: 3 });
    setTrail([]);
    if (!tidy) return;

    /* ⚠️ THE PEN'S OWN SNAPPER, not a second one. `snapStroke` already tidies a near-circle into a
       circle and a near-straight run into a straight line, and it is the difference between a wobbly
       hand-drawn triangle and something that looks cut. It works in 3D with a plane normal, so the
       plate maps to y = 0 and back — reusing it beats writing a flat version that would drift from
       the original the first time either changed.

       Applied ONCE, here, to the points that get stored — exactly as the pen does it. A tidy-up that
       ran on every render would re-tidy an already-tidy line and creep. */
    let path = tidy.path;
    if (autoShape) {
      /* ⚠️ POLYGONS FIRST, because `snapStroke` only knows CIRCLE and LINE — a hand-drawn triangle is
         neither, so the tick was on and the drawing came out exactly as wobbly as it went in. That is
         worse than having no correction at all: the tool says it tried. `snapPolygon` refuses
         anything that is not a polygon, so a swirl or a letter still falls through to the snapper
         below and is judged there. */
      const poly = tidy.closed ? snapPolygon(path) : null;
      if (poly) {
        path = poly.points;
      } else {
        const snapped = snapStroke(path.map(([x, y]) => [x, 0, y]), { normal: [0, 1, 0] });
        if (snapped?.points?.length > 1) path = snapped.points.map(([x, , z]) => [x, z]);
      }
    }
    const ring = tidy.closed && path.length > 2 ? [...path.slice(0, -1), path[0]] : tidy.ring;
    setStrokes(s2 => [...s2, { ...tidy, path, ring, fills: [] }]);
  }

  // ── Fill the last stroke ──────────────────────────────────────────────────────────────────────
  /* ⚠️ ACTIONS ACT ON WHAT IS PICKED. Fill used to apply to the LAST shape drawn, which was fine
     while nothing could be selected and wrong the moment something could: choosing a shape and then
     choosing a fill filled a different shape. Whatever is picked is the subject; with nothing picked
     the last shape is still the sensible default, because that is what a fresh drawing means. */
  function applyFill(pattern) {
    const target = targetIndex;
    const ring = fillRing;
    if (!ring) return;
    /* ⚠️ THE WHOLE REGION IS CLEARED, not just the stroke that carries the fill. A region's passes
       hang off ONE of its strokes — an arbitrary one — so clearing only the target would leave a
       filled shape that says it is empty, and refilling would stack a second set of passes on the
       first. */
    const members = regionOf(target)?.paths ?? [target];
    const fills = pattern === 'none' ? [] : fillShape(ring, {
      pattern, spacing: ROPE * 2.2, inset: ROPE * 0.5, ropeWidth: ROPE, seed: target + 3,
    });
    setStrokes(all => all.map((s2, i) => {
      if (!members.includes(i)) return s2;
      // The passes live on the stroke that was picked; the rest of the region just records the
      // pattern, so the control reads back the same answer whichever of them is selected next.
      return { ...s2, fills: i === target ? fills : [], fillPattern: pattern };
    }));
  }

  const strokeCount = strokes.length;
  const lifts = strokes.reduce((n, s) => n + 1 + s.fills.length, 0);

  return (
    <Panel
      title="Pipe a chocolate garnish"
      width={720}
      flow="block"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btn(false)}>Cancel</button>
          {/* ⚠️ KEEPING IT IS THE DEFAULT. A baker who pipes a good piece almost always wants it
              again, and "just this once" is the rarer decision — so it is the quieter button. */}
          {/* ⚠️ A PIECE OPENED FROM THE SHELF IS ALREADY KEPT. Offering "keep it" again saved a SECOND
              copy every time one was reused — the row is inserted, never updated, so reopening and
              placing twice left three identical pieces on the shelf. So the keep option appears only
              for something new, and reusing is just "use it".

              "Use it on the cake" rather than "just this cake": it reads correctly from both doors,
              where "just this cake" only made sense next to a save. */}
          {apiClient?.saveGarnish && !openWith && (
            <button onClick={addToCake} disabled={!strokeCount || saving} style={btn(false, !strokeCount || saving)}>
              Use it on the cake
            </button>
          )}
          <button
            onClick={apiClient?.saveGarnish && !openWith ? keepAndAdd : addToCake}
            disabled={!strokeCount || saving}
            style={btn(true, !strokeCount || saving)}
          >
            {saving ? 'Keeping…'
              : (apiClient?.saveGarnish && !openWith) ? 'Keep it and use it on the cake'
              : 'Use it on the cake'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#777', lineHeight: 1.45 }}>
        Pipe it here as you would on parchment — one stroke at a time. It sets, then you place it on
        a cake, lying down or standing up.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ⚠️ THE PLATE AND THE SHAPES ARE ONE COLUMN. Their shared wrapper was lost while moving
            the rail, so the shape row became a THIRD item in the row — sitting beside the plate,
            pushing the settings column into a corner, and leaving a field of white space where the
            column used to be. Nothing errored; the layout simply came apart. */}
        <div>
        {/* ⚠️ UNDO SITS WITH THE DRAWING. It was at the bottom of the settings column, a long way from
            the plate and below several controls that have nothing to do with it — so the one action
            you reach for the instant a stroke goes wrong was the furthest thing from where your hand
            already was. */}
        {/* ⚠️ THE TOOLS LIVE ON THE PLATE'S EDGE, not in a settings column beside it. Colour, what
            the piece is made of, and how thick the line is are all reached for WHILE drawing, with
            the other hand — so they belong within a thumb's reach of the drawing, the way a phone
            drawing app puts them. What is decided once and left — where it goes, how it sits, its
            name — stays in the column. INVARIANTS #12. */}
        {/* ⚠️ THE RAIL FLOATS ON THE PLATE, IT DOES NOT TAKE ROOM FROM IT. Sitting beside the canvas
            it stole 56px of the only thing that matters — and on a phone the drawing surface is
            already the scarcest thing on the screen. Every phone drawing app overlays its tools for
            this reason. The plate goes back to full width and the tools sit on top of it. */}
        <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 4, display: 'flex',
                      flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {colorControl && (
            <>
              {/* ⚠️ THE WHEEL IS THE LABEL. "Chocolate colour" beside a brown dot said what the dot
                  already said, and spent a line of the rail doing it. A ring of hues with the current
                  colour in the middle reads as "colour, and this is the one" at a glance. */}
              <button type="button" onClick={() => setColorOpen(o => !o)} aria-expanded={colorOpen}
                aria-label={picked != null ? 'Colour of this shape' : 'Chocolate colour'}
                title={picked != null ? 'Colour of this shape' : 'Chocolate colour'}
                style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', padding: 0,
                         border: colorOpen ? '2px solid #1a1a1a' : '2px solid transparent',
                         background: 'conic-gradient(#e5484d, #f5a524, #f5d90a, #46a758, #12a594, #0091ff, #8e4ec6, #e93d82, #e5484d)',
                         display: 'grid', placeItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: subjectColor,
                               border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.18)' }} />
              </button>
              {colorOpen && (
                /* Floats OVER the plate rather than pushing it: opening a picker must not move the
                   thing you are about to colour. */
                <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 6, width: 236,
                              padding: 10, borderRadius: 12, background: '#fff',
                              border: '1px solid #E3DFD8', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                  {colorControl}
                </div>
              )}
            </>
          )}

          {/* Piped or cut sits with the colour: both answer "what is this made of". */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[{ id: 'piped', label: 'Piped' }, { id: 'cut', label: 'Cut' }].map(o => (
              <button key={o.id} type="button" onClick={() => setKind(o.id)}
                aria-pressed={kind === o.id}
                title={o.id === 'piped' ? 'A nozzle laying a line of chocolate. Applies to every shape here.'
                                        : 'Spread thin, set, then cut. Applies to every shape here.'}
                style={{ width: 44, padding: '5px 0', borderRadius: 8, cursor: 'pointer',
                         fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800,
                         border: `1.5px solid ${kind === o.id ? '#1a1a1a' : 'rgba(0,0,0,0.10)'}`,
                         background: kind === o.id ? '#1a1a1a' : 'rgba(255,255,255,0.92)',
                         color: kind === o.id ? '#fff' : '#666' }}>{o.label}</button>
            ))}
          </div>

          {/* ⚠️ VERTICAL, BESIDE THE DRAWING. A horizontal slider at the foot of a settings column is
              a round trip from the hand and says nothing about the line getting fatter as you move
              up it. Rotated and next to the plate, it reads the way it behaves. */}
          <div style={{ height: 140, width: 38, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', borderRadius: 19,
                        background: 'rgba(255,255,255,0.92)' }}>
            <input type="range" min={3} max={14} step={1} value={ROPE}
              aria-label="Line thickness" title={`Line thickness: ${ROPE}`}
              onChange={e => onRopeChange?.(Number(e.target.value))}
              style={{ width: 124, transform: 'rotate(-90deg)', accentColor: color }} />
          </div>
        </div>

        <canvas
          ref={ref}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{
            width: isMobile ? '100%' : 420, aspectRatio: '1 / 1', borderRadius: 14,
            border: '1px solid #E3DFD8', display: 'block', touchAction: 'none', cursor: 'crosshair',
          }}
        />
        {/* ⚠️ ON THE PLATE, NOT UNDER IT. Undo is reached for the instant a stroke goes wrong, so it
            belongs where the mistake just happened — below the drawing it is a round trip away from
            the hand and, on a phone, often below the fold. Icons because two words at that size were
            the largest thing on the screen after the drawing itself. Hidden until there is something
            to undo, so an empty plate offers nothing that would do nothing. */}
        {/* ⚠️ ALWAYS PRESENT, DISABLED WHEN THERE IS NOTHING TO UNDO. Hidden until the first stroke
            they were reported missing twice — and both reports were right, because a control that
            appears only once you have already needed it teaches nobody it exists. A greyed button
            says "this is where undo lives"; an absent one says the tool has no undo. */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 4 }}>
            <PlateButton label="Undo the last stroke" disabled={!strokeCount}
              onClick={() => { setStrokes(s2 => s2.slice(0, -1)); setPicked(null); }}>
              <path d="M4 9h9a5 5 0 1 1 0 10h-3" />
              <polyline points="7.5 5 3.5 9 7.5 13" />
            </PlateButton>
            <PlateButton label="Clear the plate" danger disabled={!strokeCount}
              onClick={() => { setStrokes([]); setPicked(null); }}>
              <polyline points="4 6 20 6" />
              <path d="M9 6V4h6v2M6.5 6l1 14h9l1-14" />
            </PlateButton>
        </div>

        </div>

        {/* ⚠️ DIRECTLY UNDER THE PLATE. A shape lands ON the drawing, so the buttons that add one
            belong against it — in the settings column they were a scroll away from the thing they
            change, which is the pairing INVARIANTS #11 is about. */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SHAPES.map(sh => (
              <button key={sh.key} type="button" onClick={() => addShape(sh)} title={sh.label}
                aria-label={sh.label}
                style={{ width: 44, height: 44, display: 'flex', alignItems: 'center',
                         justifyContent: 'center', padding: 0, borderRadius: 10, cursor: 'pointer',
                         border: '1.5px solid #E0DDD8', background: '#fff' }}>
                <ShapeIcon kind={sh.key} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
            Lands closed, so you can fill it straight away.
          </div>
        </div>
        </div>

        {/* Everything decided once and left: fill, placement, the library, the name. */}
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ⚠️ FILL IS WHY THIS STUDIO EXISTS, so it sits with the shape it acts on rather than at
              the bottom of the column. It was below the placement controls, the library and the name
              field — past everything — and a baker looking for it had no reason to believe it was
              there at all. Placement matters once, at the end; fill is worked on while drawing. */}
          {kind === 'cut' ? (
            /* ⚠️ A CUT PANEL IS SOLID BY DEFINITION, so a fill choice on it would be a control with
               nothing to do. The lacy patterns are a piping technique — passes of a nozzle — and mean
               nothing to a knife. */
            <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.5 }}>
              A cut piece is solid chocolate. Draw a shape inside another to punch it out.
            </div>
          ) : canFill ? (
            <div>
              {/* ⚠️ NAMED FOR WHAT IT ACTS ON. It said "the last shape" long after it had started
                  acting on the PICKED one, so the label described behaviour that no longer existed —
                  and a baker who had just picked a shape had every reason to distrust it. */}
              <span style={labelStyle}>
                {picked != null ? 'Fill the shape you picked' : 'Fill the shape'}
              </span>
              <div style={{ marginTop: 5 }}>
                <Segmented
                  label="Fill the shape"
                  isMobile={isMobile}
                  items={[{ id: 'none', label: 'None' },
                          ...Object.entries(FILL_PATTERNS).map(([id, f]) => ({ id, label: f.label }))]}
                  value={subject?.fillPattern ?? 'none'}
                  onChange={applyFill}
                  tone={INK}
                />
              </div>
              {!fillWorthwhile(fillRing) && (
                <div style={{ fontSize: 10.5, color: '#9A6A2F', marginTop: 5, lineHeight: 1.45 }}>
                  That reads more like a line than a shape — a fill will come out as dashes.
                </div>
              )}
            </div>
          ) : strokeCount ? (
            <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.5 }}>
              {/* ⚠️ SAYS WHAT IS ACTUALLY WRONG. It used to say "that STROKE is open", which was
                  true and useless: a shape drawn in five strokes has no closed stroke in it, and the
                  drawing in front of the baker was plainly closed. What is missing is a JOIN. */}
              This is not closed yet, so there is nothing to fill — which is how veins, swirls and
              letters are piped. Bring the ends together and the whole shape becomes fillable, however
              many strokes it took.
            </div>
          ) : null}


          {picked != null && strokes[picked] && (
            <div style={{ padding: '9px 11px', borderRadius: 10, background: '#F4F7FB', border: '1.5px solid #DCE6F5' }}>
              <span style={labelStyle}>The shape you picked</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => scalePicked(1.15)} style={miniBtn}>Bigger</button>
                <button type="button" onClick={() => scalePicked(1 / 1.15)} style={miniBtn}>Smaller</button>
                <button type="button" onClick={() => { setStrokes(a2 => a2.filter((_, i) => i !== picked)); setPicked(null); }}
                  style={{ ...miniBtn, color: '#A33', borderColor: '#E0C9C9' }}>Remove</button>
              </div>
              <div style={{ fontSize: 10, color: '#8899aa', marginTop: 5, lineHeight: 1.4 }}>
                Drag it to move it, or drag the blue dot at its corner to resize. Colour and fill
                land on this shape alone.
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoShape} onChange={e => setAutoShape(e.target.checked)}
              style={{ marginTop: 2, accentColor: color }} />
            <span>
              <span style={{ ...labelStyle, textTransform: 'none', fontSize: 11.5, letterSpacing: 0 }}>
                Auto-correct shape
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: '#999', lineHeight: 1.4 }}>
                Straightens a drawn triangle or square onto its corners, tidies a near-circle into a
                circle, and a near-straight run into a straight line. A swirl or a letter is left as
                you drew it.
              </span>
            </span>
          </label>


          {/* ⚠️ SIDE IS NOT OFFERED, and that is a real limit rather than an oversight. A piece on a
              tier wall can only HUG it — standing has no meaning on a vertical surface, and a flat
              piece has to curve to the wall or it floats at the tangent. That is new geometry, not a
              flag, so the option is absent rather than present and wrong. */}
          {!!strokeCount && (
            <>
              <div>
                <span style={labelStyle}>Where it goes</span>
                <div style={{ marginTop: 5 }}>
                  <Segmented label="Where the piece goes" isMobile={isMobile} tone={color}
                    items={[{ id: 'top', label: 'On the cake' }, { id: 'board', label: 'On the board' }]}
                    value={zone} onChange={setZone} />
                </div>
              </div>
              <div>
                <span style={labelStyle}>How it sits</span>
                <div style={{ marginTop: 5 }}>
                  <Segmented label="How the piece sits" isMobile={isMobile} tone={color}
                    items={[{ id: 'stand', label: 'Standing' }, { id: 'lie', label: 'Lying flat' }]}
                    value={mode} onChange={setMode} />
                </div>
              </div>
            </>
          )}

          {/* ⚠️ ONLY WHEN THERE IS SOMETHING IN IT. An empty "My pieces" heading on a new baker's
              first visit reads as something missing rather than something not yet made. */}
          {saved.length > 0 && (
            <div>
              <span style={labelStyle}>My pieces</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {saved.slice(0, 12).map(g => (
                  <button key={g.id} type="button" title={g.name}
                    onClick={() => openSaved(g)}
                    style={{ width: 46, height: 46, padding: 0, borderRadius: 9, cursor: 'pointer',
                             border: '1.5px solid #E0DDD8', background: '#F6F4F0', overflow: 'hidden' }}>
                    {g.thumbUrl
                      ? <img src={g.thumbUrl} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: 9, fontWeight: 800, color: '#8a8a8a' }}>{(g.name ?? '?').slice(0, 6)}</span>}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                Tap one to bring it back and change it.
              </div>
            </div>
          )}

          <label style={{ display: 'block' }}>
            <span style={labelStyle}>Name it</span>
            <input value={name} onChange={e => setName(e.target.value.slice(0, 40))}
              placeholder="Filigree leaf"
              style={{ width: '100%', marginTop: 5, padding: '9px 11px', borderRadius: 10, fontSize: 13,
                       border: '1.5px solid #E0DDD8', fontFamily: 'inherit' }} />
          </label>


          <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.6 }} data-readout>
            {strokeCount
              ? `${strokeCount} ${strokeCount === 1 ? 'stroke' : 'strokes'} · ${lifts} ${lifts === 1 ? 'squeeze' : 'squeezes'}`
              : 'Nothing piped yet.'}
          </div>


        </div>
      </div>
    </Panel>
  );
}

const miniBtn = { padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11.5, fontWeight: 800, border: '1.5px solid #DDD8D0', background: '#fff',
                  color: '#1a1a1a' };

/* A control that sits ON the drawing: small, quiet, and out of the way of the piece being made. The
 * label is the accessible name — an icon with no name is a button nobody can describe. */
function PlateButton({ label, onClick, danger, disabled, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled}
      style={{
        width: 34, height: 34, borderRadius: 9, display: 'grid',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        placeItems: 'center', background: 'rgba(255,255,255,0.92)',
        border: `1.5px solid ${danger ? '#E4CFCF' : '#DED8CE'}`,
      }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke={danger ? '#A33' : '#4A4A4A'} strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

/* Lighten or darken a colour, for the rim and the highlight of a rope. Works on the hex the picker
 * gives and on the rgba() the in-progress trail uses, which is the only other thing drawn here. */
function shade(colour, amount) {
  const m = /^#([0-9a-f]{6})$/i.exec(colour ?? '');
  if (!m) return colour;                       // rgba() and anything else: left alone rather than guessed
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `rgb(${r}, ${g}, ${b})`;
}

const labelStyle = { display: 'block', fontSize: 10, fontWeight: 800, color: '#888',
                     letterSpacing: 1, textTransform: 'uppercase' };

const btn = (primary, disabled = false) => ({
  padding: '9px 14px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
  border: primary ? 'none' : '1.5px solid #DDD8D0',
  background: primary ? (disabled ? '#B9C6BC' : '#2C4433') : '#fff',
  color: primary ? '#fff' : (disabled ? '#BBB' : '#1a1a1a'),
});
