import { useEffect, useRef, useState } from 'react';
import { Panel } from '../../shared/Panel.jsx';
import Segmented from '../../shared/Segmented.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { tidyDrawn, fillWorthwhile } from '../geometry/drawnShape.js';
import { fillShape, FILL_PATTERNS } from '../geometry/pipingFill.js';

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
  const canFill = !!last?.ring;

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
    const line = (pts, width, colour = INK) => {
      if (!pts || pts.length < 2) return;
      x.beginPath();
      pts.forEach(([a, b], i) => (i ? x.lineTo(a * k, b * k) : x.moveTo(a * k, b * k)));
      x.lineWidth = width * k; x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = colour === INK ? color : colour;
      x.stroke();
    };

    for (const s of strokes) {
      for (const f of s.fills) line(f, ROPE);
      line(s.path, ROPE + 2);                       // the outline sits over its own fill
    }
    // Wet, still being piped: lighter, so in-progress reads differently from finished.
    if (drawing) line(trail, ROPE + 2, 'rgba(74,44,27,0.55)');
    // ⚠️ colour and ROPE are dependencies too: without them the plate keeps the shade and the line
    // width it was first painted with, and the controls appear to do nothing until the next stroke.
  }, [strokes, trail, drawing, color, ROPE]);

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
    v: 1, plate: PLATE, rope: ROPE, color,
    strokes: strokes.map(s2 => ({
      path: s2.path.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]),
      fill: s2.fillPattern && s2.fillPattern !== 'none' ? s2.fillPattern : null,
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

  function addToCake() {
    onSave?.({
      name: name.trim() || 'Chocolate piece', paths: piecePaths(strokes),
      rope: ROPE, plate: PLATE, color, zone, mode,
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
      return { path: s2.path, ring, fills, fillPattern: s2.fill ?? 'none' };
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
  function down(e) { ref.current.setPointerCapture(e.pointerId); setTrail([at(e)]); }
  function move(e) { if (drawing) setTrail(t => [...t, at(e)]); }
  function up() {
    const tidy = tidyDrawn(trail, { minStep: 3, tolerance: 3 });
    setTrail([]);
    if (tidy) setStrokes(s => [...s, { ...tidy, fills: [] }]);
  }

  // ── Fill the last stroke ──────────────────────────────────────────────────────────────────────
  function applyFill(pattern) {
    setStrokes(all => all.map((s, i) => {
      if (i !== all.length - 1 || !s.ring) return s;
      const fills = pattern === 'none' ? [] : fillShape(s.ring, {
        pattern, spacing: ROPE * 2.2, inset: ROPE * 0.5, ropeWidth: ROPE, seed: i + 3,
      });
      return { ...s, fills, fillPattern: pattern };
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
        <canvas
          ref={ref}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{
            width: isMobile ? '100%' : 420, aspectRatio: '1 / 1', borderRadius: 14,
            border: '1px solid #E3DFD8', display: 'block', touchAction: 'none', cursor: 'crosshair',
          }}
        />

        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {colorControl && (
            <div>
              <span style={labelStyle}>Chocolate colour</span>
              <div style={{ marginTop: 5 }}>{colorControl}</div>
            </div>
          )}

          <label style={{ display: 'block' }}>
            <span style={labelStyle}>Line thickness</span>
            <input type="range" min={3} max={14} step={1} value={ROPE}
              onChange={e => onRopeChange?.(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4, accentColor: color }} />
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

          {/* ⚠️ Only when the last stroke closed. An open stroke — a vein, a swirl, a letter — has no
              inside, and a dead control is worse than an absent one, so the reason is stated. */}
          {canFill ? (
            <div>
              <span style={labelStyle}>Fill the last shape</span>
              <div style={{ marginTop: 5 }}>
                <Segmented
                  label="Fill the last shape"
                  isMobile={isMobile}
                  items={[{ id: 'none', label: 'None' },
                          ...Object.entries(FILL_PATTERNS).map(([id, f]) => ({ id, label: f.label }))]}
                  value={last.fillPattern ?? 'none'}
                  onChange={applyFill}
                  tone={INK}
                />
              </div>
              {!fillWorthwhile(last.ring) && (
                <div style={{ fontSize: 10.5, color: '#9A6A2F', marginTop: 5, lineHeight: 1.45 }}>
                  That reads more like a line than a shape — a fill will come out as dashes.
                </div>
              )}
            </div>
          ) : strokeCount ? (
            <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.5 }}>
              That stroke is open, so there is nothing to fill — which is how veins, swirls and
              letters are piped. Draw a shape that joins up to fill it.
            </div>
          ) : null}

          <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.6 }} data-readout>
            {strokeCount
              ? `${strokeCount} ${strokeCount === 1 ? 'stroke' : 'strokes'} · ${lifts} ${lifts === 1 ? 'squeeze' : 'squeezes'}`
              : 'Nothing piped yet.'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStrokes(s => s.slice(0, -1))} disabled={!strokeCount} style={btn(false, !strokeCount)}>
              Undo stroke
            </button>
            <button onClick={() => setStrokes([])} disabled={!strokeCount} style={btn(false, !strokeCount)}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
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
