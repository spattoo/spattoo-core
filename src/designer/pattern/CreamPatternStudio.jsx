import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildPipingHeap, NOZZLES, NOZZLE_BY_KEY, DEFAULT_NOZZLE } from '../geometry/creamPen.js';
import { mediumOf } from '../geometry/pipingMedia.js';
import { SceneLights, SceneEnv, SceneBackground } from '../canvas/CakeCanvas.jsx';
import { DESIGNER_GROUND } from '../constants.js';
import { Panel } from '../../shared/Panel.jsx';
import { SizeDial } from '../shared/SizeDial.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { INK } from '../../shared/tokens.js';

/* ── A cream pattern: piped here, then repeated on the cake ──────────────────────────────────────
 *
 * Sandeep, with a unicorn cake: *"the piping includes multiple nozzles and a lot of overlap.
 * currently we dont have a mechanism to overlap like or create a pattern with multiple nozzle
 * pipings."* Then, on where it should live: *"lets do this in designer… can we add a studio in
 * decorations?"* — and on what it makes: *"if i build the pattern as only one building block, i
 * should be able to drag and extend it on the cake."*
 *
 * ⚠️ A PLATE, NOT THE CAKE, AND THAT IS A REAL TRADE. The admin proof of concept piped straight onto
 * a tier, which is what let a run follow a curved wall and a piece seat on the cream below it. Here
 * the surface is flat, so the normal is always up and neither of those applies. That is right for a
 * BLOCK — small, repeated, and meant to be laid down over and over — and it is wrong for a mane,
 * which is piped onto the cake and follows it. The mane stays with the on-cake tool; this studio
 * makes the unit. Said plainly because the POC proved things this screen deliberately gives up.
 *
 * ⚠️ NOTHING NEW RENDERS IT. A piece is `buildPipingHeap` wearing `mediumOf('cream').material(...)`
 * — the same function the pen calls on every tap and the same material the cake shades its piping
 * with. The studio owns the composing; it owns no geometry and no shading.
 *
 * ⚠️ THE FOOTER'S SHAPE IS GARNISHSTUDIO'S, COPIED ON PURPOSE (its own notes carry the reasoning):
 * keeping is the DEFAULT, because a baker who pipes a good block almost always wants it again; and a
 * piece opened from the shelf is ALREADY kept, so offering "keep" again would insert a second copy
 * every time one was reused. Same words, too — "Use it on the cake" reads correctly from both doors.
 */

const PLATE_R = 1.15;

/* Where a piece sits, and which way it grows. `grow` is carried per piece rather than re-derived,
   for the reason the POC measured the hard way: a rosette's FACE normals swing right round between
   crests and creases, so a piece seated on the face it struck grows off sideways and reads as a
   smooth leaf. A piece laid on another follows the one BELOW it, which is what a hand does. */
function pieceGeometry({ point, normal, nozzle, thickness, heapHeight }) {
  return buildPipingHeap(
    new THREE.Vector3().fromArray(point),
    new THREE.Vector3().fromArray(normal),
    nozzle, thickness, heapHeight,
  );
}

function Piece({ piece, onHit }) {
  const geo = useMemo(() => pieceGeometry(piece),
    [piece.point, piece.normal, piece.nozzle, piece.thickness, piece.heapHeight]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  /* ⚠️ THE PIECE IS A HIT TARGET, carrying its own id and growth direction. Cream piped onto cream
     is the whole point of a pattern with depth, and without this a click aimed at a rosette falls
     through to the plate behind it and buries the new piece inside the one you aimed at. */
  return (
    <mesh geometry={geo} castShadow receiveShadow
      userData={{ pieceId: piece.id, strokeId: piece.strokeId, grow: piece.normal }}
      onPointerDown={e => onHit?.(e, 'down')}
      onPointerMove={e => onHit?.(e, 'move')}>
      <meshPhysicalMaterial side={THREE.DoubleSide}
        {...mediumOf('cream').material({ softness: piece.softness }, piece.colour)} />
    </mesh>
  );
}

/* The plate. Flat, so every seat on it has the same upward normal — see the trade named at the top. */
function Plate({ onHit }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(PLATE_R, PLATE_R, 0.06, 96), []);
  useEffect(() => () => geo?.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, -0.03, 0]} receiveShadow
      onPointerDown={e => onHit?.(e, 'down')}
      onPointerMove={e => onHit?.(e, 'move')}>
      {/* ⚠️ DARKER THAN THE GROUND ON PURPOSE. `#F2EEE8` against `DESIGNER_GROUND` (#e5e2de)
          measures 1.12:1 contrast — the same tone to any practical eye, so the plate had no edge to
          find and would not have read as a dish even correctly framed. It also has to stay clearly
          apart from CREAM, which is what gets piped on it and defaults to white: a white rosette on
          a near-white plate is the same problem one layer up. */}
      <meshStandardMaterial color="#CFC7BD" roughness={0.85} metalness={0} />
    </mesh>
  );
}

/* ── Picking a tip: thumbnails, not a dropdown ───────────────────────────────────────────────────
 *
 * Sandeep: *"we should not have a dropdown (like in admin) for piping selection. it should be the
 * thumbnails."*
 *
 * ⚠️ A NOZZLE ALREADY KNOWS HOW TO DRAW ITSELF. Every tip carries the 2D cross-section its sweep is
 * built from — which is literally the opening you pipe through, and how a tip is pictured on the
 * packet. So a thumbnail is that array as an SVG polygon: no render, no canvas, no asset.
 *
 * ⚠️ ONE FIXED viewBox, NOT EACH SCALED TO FILL ITS BOX. The wall tips are SQUASHED — `rose12w`
 * measures x ±0.55 against y ±1.0 where `star5` is x ±1.0 — because they are pressed against a side
 * rather than standing off a top. Normalising each would hide exactly the difference being chosen
 * between, which is what the dropdown did behind a word.
 */
function TipThumbs({ value, onChange, colour, isMobile }) {
  return (
    <div style={{ display: 'grid', gap: 6,
                  gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 46 : 52}px, 1fr))` }}>
      {NOZZLES.map(n => {
        const active = n.key === value;
        /* SVG's y runs DOWN and a profile's runs up, so y is negated — without it an asymmetric tip
           is drawn mirrored, which on a squashed wall tip is a lie about which way it spreads. */
        const pts = n.profile.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ');
        return (
          <button key={n.key} type="button" onClick={() => onChange(n.key)} aria-pressed={active}
            title={`${n.label} — ${n.hint}`}
            style={{ padding: 4, borderRadius: 9, cursor: 'pointer', lineHeight: 0,
                     minHeight: isMobile ? 44 : undefined,
                     border: `1.5px solid ${active ? INK : '#D8D3CA'}`,
                     background: active ? 'rgba(26,26,26,0.06)' : '#fff' }}>
            <svg viewBox="-1.12 -1.12 2.24 2.24" style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }}>
              <polygon points={pts} fill={colour} stroke="#00000022" strokeWidth={0.03} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export default function CreamPatternStudio({
  apiClient = null, openWith = null, colorControl = null, color = '#E85A9B',
  onCancel, onSave,
}) {
  const isMobile = useNarrow();
  const [pieces, setPieces] = useState(() => openWith?.payload?.pieces ?? []);
  const [name, setName] = useState(openWith?.name ?? '');
  const [tip, setTip] = useState(NOZZLE_BY_KEY.star5 ? 'star5' : DEFAULT_NOZZLE);
  const [thickness, setThickness] = useState(0.09);
  const [heapHeight, setHeapHeight] = useState(0.9);
  const [softness, setSoftness] = useState(0.7);
  /* The pen's own number and the pen's own meaning: `stampTransforms` steps by
     `spacing × 2 × thickness`, and the pen card offers 0.5…1.6. Below 1 the copies overlap, which is
     what a dense block is. A second convention would make one number mean two things in one app. */
  const [spacing, setSpacing] = useState(0.7);
  const [saving, setSaving] = useState(false);

  const orbit = useRef(null);
  const run = useRef({ id: null, last: null, carry: 0 });
  const [drawing, setDrawing] = useState(false);

  const step = Math.max(spacing * 2 * thickness, 1e-3);

  const addPiece = useCallback((point, normal, strokeId) => {
    setPieces(prev => [...prev, {
      id: crypto.randomUUID(), strokeId,
      point: point.toArray(), normal: normal.toArray(),
      nozzle: tip, thickness, heapHeight, colour: color, softness,
    }]);
  }, [tip, thickness, heapHeight, color, softness]);

  /* A hit anywhere — plate or cream. The seat is whatever the ray struck; a piece landing on another
     grows the way that one grew, not along the rib it happened to hit. */
  const seatOf = (e) => {
    const grow = e.object?.userData?.grow;
    if (Array.isArray(grow)) return new THREE.Vector3().fromArray(grow);
    const n = e.face
      ? e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    return n;
  };

  /* ── Undo: the previous ACTION, not the previous piece ───────────────────────────────────────
   *
   * Sandeep: *"add a undo option as well. previous action can be undone on the studio."*
   *
   * ⚠️ DECLARED HERE, ABOVE `onHit`, AND THAT IS NOT TIDINESS. This block sat eighty lines BELOW
   * the handler that depends on it, so `onHit`'s dependency array named `remember` before the
   * `const` existed — a temporal-dead-zone ReferenceError thrown on the FIRST render, which would
   * have meant the studio never mounted at all. `npm run build` passed with it in place: a TDZ
   * throw is a runtime event, so the bundler has nothing to object to. Third time today that a
   * green build has hidden a dead screen.
   *
   * ⚠️ A SNAPSHOT PER ACTION, NOT PER PIECE. `addPiece` fires once per piece, so a drag laying
   * eleven rosettes calls it eleven times — pushing there would make one drag take eleven presses
   * to walk back. `useCakeDesign` already records what that costs: "it is ONE ACTION, so one undo
   * takes it back… which is what makes people leave a tool." So history is pushed where an ACTION
   * begins: once as a stroke starts, once before a clear.
   *
   * ⚠️ AND IT COVERS CLEAR, which the old derived button could not. "Undo stroke" found the last
   * strokeId and dropped it, so wiping the plate was unrecoverable — the one action most worth
   * undoing was the only one out of reach. Measured after this: Clear, then undo, and the pieces
   * come back.
   *
   * ⚠️ SNAPSHOTS, NOT INVERSE OPERATIONS. Pieces are plain data and a pattern is tens of them, not
   * thousands, so keeping the whole list costs nothing and cannot drift. An undo built from inverse
   * operations has to know how to reverse every action there will ever be, and gets it wrong the
   * first time somebody adds one. Capped at 50 so a long session cannot grow without bound.
   */
  const [history, setHistory] = useState([]);
  const remember = useCallback(() => setHistory(h => [...h.slice(-49), pieces]), [pieces]);
  const undo = () => setHistory(h => {
    if (!h.length) return h;
    setPieces(h[h.length - 1]);
    return h.slice(0, -1);
  });
  const clearAll = () => { remember(); setPieces([]); };

  const onHit = useCallback((e, phase) => {
    if (phase === 'move' && !drawing) return;
    /* A piece from the stroke in progress is ignored, and ignored WITHOUT stopping the event so the
       ray carries on to the plate behind. Otherwise a drag stacks on its own tail — the piece placed
       a moment ago is still under the moving pointer — and a straight run climbs into a spiral. */
    if (e.object?.userData?.strokeId && e.object.userData.strokeId === run.current.id) return;
    e.stopPropagation();
    const normal = seatOf(e);
    const point = e.point.clone();

    if (phase === 'down') {
      /* ⚠️ HISTORY IS PUSHED HERE, WHERE THE ACTION BEGINS — once per stroke, before the first piece
         of it lands. Pushing inside `addPiece` instead would snapshot once per PIECE, so a drag of
         eleven rosettes would need eleven presses of Undo to walk back; pushing after the stroke
         would record the result rather than the state to return to. */
      remember();
      /* Orbit is killed on the PRESS, not from state a render later: OrbitControls listens on the
         canvas DOM element, so an R3F stopPropagation never reaches it and an `enabled` prop arrives
         after its gesture has begun. CakeCanvas does the same for the pen. */
      if (orbit.current) orbit.current.enableRotate = false;
      const id = crypto.randomUUID();
      run.current = { id, last: point.clone(), carry: 0 };
      setDrawing(true);
      addPiece(point, normal, id);
      return;
    }

    /* Walking a drag by ARC LENGTH, carrying the remainder between events so spacing stays even
       across the whole run rather than resetting at each pointermove. */
    const st = run.current;
    if (!st.id || !st.last) return;
    const remaining = point.distanceTo(st.last);
    if (remaining < 1e-6) return;
    const dir = point.clone().sub(st.last).normalize();
    let walked = 0;
    while (st.carry + (remaining - walked) >= step) {
      walked += step - st.carry;
      st.carry = 0;
      addPiece(st.last.clone().addScaledVector(dir, walked), normal, st.id);
    }
    st.carry += remaining - walked;
    st.last = point.clone();
    /* ⚠️ `remember` IS IN THESE DEPS, and leaving it out is a bug no gate catches. It is a
       useCallback keyed on [pieces], so it gets a NEW identity every time a piece lands — while
       `onHit` would keep whichever one it captured when its own deps last changed. The down branch
       would then snapshot a STALE `pieces`, and undo after a second stroke would jump back two
       strokes instead of one. Bindings, build and the suite all pass either way; the harness only
       catches it if a run pipes two strokes with nothing else changing in between, which is exactly
       the sequence a baker uses and my first probe did not. Same stale-closure class as the NaN
       `bury` and the scatter re-apply. */
  }, [addPiece, drawing, step, remember]);

  /* Bound to the WINDOW: a drag released off the plate would never fire a pointerup on a mesh and
     would leave rotate switched off for good. */
  const endRun = useCallback(() => {
    setDrawing(false);
    run.current = { id: null, last: null, carry: 0 };
    if (orbit.current) orbit.current.enableRotate = true;
  }, []);
  useEffect(() => {
    window.addEventListener('pointerup', endRun);
    return () => window.removeEventListener('pointerup', endRun);
  }, [endRun]);

  const payloadOf = () => ({ pieces, plateR: PLATE_R });

  function addToCake() {
    onSave?.({ name: name.trim() || 'Cream pattern', payload: payloadOf(), pieces });
  }

  async function keepAndAdd() {
    setSaving(true);
    try {
      await apiClient?.savePattern?.({ name: name.trim() || 'Cream pattern', payload: payloadOf() });
    } catch (e) {
      /* ⚠️ A FAILED SAVE STILL PLACES IT. The baker piped it; losing the work because a network call
         failed would be the worst possible trade, and it can be kept again from the card later.
         GarnishStudio makes the same call for the same reason. */
      console.error('Could not keep the pattern', e);
    } finally {
      setSaving(false);
      addToCake();
    }
  }

  const canSave = !!apiClient?.savePattern && !openWith;
  const empty = pieces.length === 0;
  const strokes = new Set(pieces.map(p => p.strokeId)).size;
  const tipsUsed = new Set(pieces.map(p => p.nozzle)).size;

  const btn = (primary, disabled = false) => ({
    padding: '9px 16px', borderRadius: 9, minHeight: 40, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Quicksand',sans-serif", fontWeight: 800, fontSize: 12.5,
    border: primary ? 'none' : '1.5px solid #D8D3CA',
    background: primary ? INK : '#fff', color: primary ? '#fff' : INK,
    opacity: disabled ? 0.45 : 1,
  });
  const cap = { fontSize: 10, fontWeight: 800, color: '#888', letterSpacing: 1,
                textTransform: 'uppercase', margin: '14px 0 8px' };
  const row = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 };

  return (
    <Panel
      /* A composed pattern is unsaved work: a stray backdrop click must not throw it away.
         The ✕ and Cancel still close — deliberate exits stay one press away (INVARIANTS #13). */
      guardUnsaved={!empty}
      title="Cream pattern studio"
      width={760}
      flow="block"
      isMobile={isMobile}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btn(false)}>Cancel</button>
          {canSave && (
            <button onClick={addToCake} disabled={empty || saving} style={btn(false, empty || saving)}>
              Use it on the cake
            </button>
          )}
          <button onClick={canSave ? keepAndAdd : addToCake} disabled={empty || saving}
                  style={btn(true, empty || saving)}>
            {saving ? 'Keeping…' : canSave ? 'Keep it and use it on the cake' : 'Use it on the cake'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#777', lineHeight: 1.45 }}>
        Pipe a block here — tap for one, drag for a run, and change the tip or the colour as you go.
        Pipe onto what you have already piped and it stacks. You place it on the cake afterwards.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
          {/* ⚠️ THE WHEEL DOES NOT SIT ON THE PLATE, AT ANY WIDTH — and I put it there twice before
              measuring. The colour control is handed in, never rebuilt (INVARIANTS #3), and
              GarnishStudio floats it over the drawing because colour is reached for WHILE piping,
              with the other hand (INVARIANTS #12). Sound reasoning, copied without its context:
              there the plate is most of a 720px panel, so a 152px wheel is a corner ornament.
              Here it is not. On a phone the wheel covered the WHOLE canvas. Moving it below only on
              a phone still left it covering 11.4% of the plate at 900px — 16,568px², over the
              top-left corner, precisely where a piece piped there would vanish underneath it.
              GarnishStudio's own note says the drawing surface is the scarcest thing on the screen,
              which is the argument AGAINST overlaying it here rather than for it. Below the plate,
              always. */}
          <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden',
                        background: DESIGNER_GROUND }}>
            {/* `shadows`, because a piece standing off the plate is judged by the shadow it throws
                as much as by its own shading — without one it reads as a sticker. */}
            {/* ⚠️ FRAMED BY ARITHMETIC, NOT BY EYE. At fov 34 a camera 2.29 units from the target
                covers 1.40 world units, and the plate spans 2.30 — so it overflowed the frame by
                64% and the screen showed the MIDDLE of a dish with no rim anywhere in it. That is
                why the first screenshot read as a flat grey expanse: not an empty plate, a plate too
                close to see. 3.2/3.9 puts the camera 4.99 units out, covering 3.05 — a 1.33× margin
                round the rim — and holds a 39° pitch, still looking down enough to present the
                face rather than the edge. */}
            <Canvas shadows camera={{ position: [0, 3.2, 3.9], fov: 34 }}
                    style={{ width: '100%', height: '100%' }}>
              {/* The designer's own rig: cream judged under a light no cake has had is a judgement
                  about the wrong variable (INVARIANTS #17). */}
              <SceneLights shadows />
              <SceneEnv />
              <SceneBackground colour={DESIGNER_GROUND} />
              <OrbitControls ref={orbit} enablePan={false} makeDefault target={[0, 0.08, 0]} />
              <Plate onHit={onHit} />
              {pieces.map(p => <Piece key={p.id} piece={p} onHit={onHit} />)}
            </Canvas>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {/* ⚠️ `↶ Undo`, THE WORD AND THE GLYPH THE PEN ALREADY USES. A baker meets undo twice in
                this product and it should be the same control both times, not two conventions.
                ⚠️ ALWAYS PRESENT, DISABLED WHEN THERE IS NOTHING TO UNDO — GarnishStudio learned
                this twice: a control that appears only once you have needed it teaches nobody it
                exists, while a greyed one says "this is where undo lives".
                ⚠️ DISABLED ON THE HISTORY, NOT ON THE PIECES. An empty plate can still have
                something to undo — a Clear is exactly that case, and gating on `empty` would grey
                the button out at the one moment it matters most. */}
            <button onClick={undo} disabled={!history.length}
                    style={{ ...btn(false, !history.length), flex: 1 }}>
              ↶ Undo
            </button>
            <button onClick={clearAll} disabled={empty} style={{ ...btn(false, empty), flex: 1 }}>
              Clear
            </button>
          </div>
          {/* On a phone it sits here, below the plate — see the note above. */}
          {/* Below the plate at EVERY width — see the note above the canvas. Gating this on
              `isMobile` was the third mistake in a row with this one control: it removed the desktop
              overlay and then rendered nothing in its place, so a wide screen had no colour control
              at all. An overlap traded for an absence. */}
          {colorControl && <div style={{ marginTop: 10 }}>{colorControl}</div>}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={cap}>On the nozzle</div>
          <TipThumbs value={tip} onChange={setTip} colour={color} isMobile={isMobile} />
          {/* The chosen tip NAMED below the grid: nineteen labels would drown the shapes, and a shape
              with no name is unsearchable for a baker who wants "1M". */}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, margin: '8px 0 4px' }}>
            {NOZZLE_BY_KEY[tip]?.label ?? tip}
            <span style={{ fontWeight: 600, color: '#8a8a8a' }}> — {NOZZLE_BY_KEY[tip]?.hint}</span>
          </div>

          <div style={cap}>The piece</div>
          <div style={row}>
            <SizeDial size={thickness} min={0.03} max={0.22} step={0.005} onChange={setThickness}
                      fmt={v => `${Math.round(v * 1000) / 10}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Size</div>
              <div style={{ fontSize: 11, color: '#8a8a8a' }}>how wide the nozzle is</div>
            </div>
          </div>
          <div style={row}>
            <SizeDial size={heapHeight} min={0.3} max={2} step={0.05} onChange={setHeapHeight}
                      fmt={v => `${Math.round(v * 100) / 100}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Height</div>
              <div style={{ fontSize: 11, color: '#8a8a8a' }}>how proud it stands</div>
            </div>
          </div>
          <div style={row}>
            <SizeDial size={spacing} min={0.3} max={1.6} step={0.02} onChange={setSpacing}
                      fmt={v => `${Math.round(v * 100) / 100}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Spacing</div>
              <div style={{ fontSize: 11, color: '#8a8a8a' }}>
                {spacing >= 1 ? 'apart, along a drag' : 'overlapping, along a drag'}
              </div>
            </div>
          </div>
          <div style={row}>
            <SizeDial size={softness} min={0} max={1} step={0.05} onChange={setSoftness}
                      fmt={v => `${Math.round(v * 100)}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Softness</div>
              <div style={{ fontSize: 11, color: '#8a8a8a' }}>glossy &rarr; matte</div>
            </div>
          </div>

          <div style={cap}>This pattern</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 10 }}>
            {pieces.length} piece{pieces.length === 1 ? '' : 's'} · {strokes} stroke{strokes === 1 ? '' : 's'} · {tipsUsed} tip{tipsUsed === 1 ? '' : 's'}
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name it (optional)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
                     minHeight: 40, border: '1.5px solid #D8D3CA', fontFamily: "'Quicksand',sans-serif",
                     fontSize: 13, color: INK }} />
        </div>
      </div>
    </Panel>
  );
}
