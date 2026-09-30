import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SceneLights, SceneEnv, SceneBackground } from '../canvas/CakeCanvas.jsx';
import CakeTier from '../canvas/CakeTier.jsx';
import StampStroke from '../canvas/StampStroke.jsx';
import { DESIGNER_GROUND } from '../constants.js';
import { corsUrl } from '../utils/assetUrl.js';
import { Panel } from '../../shared/Panel.jsx';
import { SizeDial } from '../shared/SizeDial.jsx';
import { useNarrow } from '../../shared/useNarrow.js';
import { INK } from '../../shared/tokens.js';

/* ── A cream pattern: piped on the cake, from the catalogue's own piping ─────────────────────────
 *
 * Sandeep, with a unicorn cake: *"the piping includes multiple nozzles and a lot of overlap.
 * currently we dont have a mechanism to overlap like or create a pattern with multiple nozzle
 * pipings."* Then, on where it should live: *"lets do this in designer… can we add a studio in
 * decorations?"* — and on what it makes: *"if i build the pattern as only one building block, i
 * should be able to drag and extend it on the cake."*
 *
 * ⚠️ THE CAKE, ON THE BOARD — AND THE PLATE THIS REPLACED WAS A TRADE I TALKED MYSELF INTO. The
 * first version composed on a flat dish, and I wrote the loss up as deliberate: no curved wall, no
 * seating on the cream below, because a flat surface has one upward normal everywhere. Sandeep, at
 * a screenshot of it: *"its showing only board. it should show cake as well."* He is right, and the
 * argument for the plate was thin — a block piped on a dish has to be TRANSPLANTED onto a cake that
 * curves, so the studio was solving an easier problem than the one it exists for. The cake is the
 * baker's OWN tiers, at their own radii and heights, so what is composed here is composed where it
 * will live.
 *
 * ⚠️ THE PIECES ARE THE CATALOGUE'S PIPING, NOT A NOZZLE PROFILE. Sandeep: *"you are showing the
 * nozzles here. it should be the glb elements thumbnails."* So a piece is a GLB stamp — the same
 * `kind: 'stamp'` stroke the pen's own *"I'll pipe it myself"* makes, rendered by the same
 * `StampStroke` through the same `stampTransforms`. That is the point of the change and not just
 * its appearance: a block composed here and a run piped by hand are now the SAME object, so
 * anything true of one is true of the other, and nothing in this file knows how to draw cream.
 *
 * ⚠️ OFFERED ONLY WHERE `hand_piping` IS TICKED. Sandeep: *"elements with placement_config.
 * hand_piping ticked is a good idea."* It is the admin's per-element judgement that the piece
 * survives being repeated — a wrap band is one pre-formed ring and a drip is a procedural curtain,
 * and stamping either along a line produces something nobody would pipe. The pen's own door reads
 * the same flag, so there is one answer to "may this be repeated", not two.
 *
 * ⚠️ NO HEIGHT DIAL, AND ITS ABSENCE IS THE HONEST OPTION. A heap was swept to a height the baker
 * chose; a stamp's height belongs to the MODEL and is scaled by Size (`stampTransforms`:
 * `target = 2 × thickness`, sized by height when `regular`). A Height dial would have been a
 * control that moved and changed nothing.
 *
 * ⚠️ THE FOOTER'S SHAPE IS GARNISHSTUDIO'S, COPIED ON PURPOSE (its own notes carry the reasoning):
 * keeping is the DEFAULT, because a baker who pipes a good block almost always wants it again; and a
 * piece opened from the shelf is ALREADY kept, so offering "keep" again would insert a second copy
 * every time one was reused. Same words, too — "Use it on the cake" reads correctly from both doors.
 */

/* A stroke of exactly the shape the pen commits and `StampStroke` renders. Built in ONE place so a
   studio piece cannot drift from a hand-piped one — the two are the same record. */
const strokeOf = (p) => ({
  kind: 'stamp',
  point: p.point,
  normal: p.normal,
  glbUrl: p.glbUrl,
  thickness: p.thickness,
  /* `regular` is what makes a stamp behave like a RING rather than like scattering: no jitter in
     spin or scale, sized by height, and faced across the run instead of along it. Piping is regular
     by definition — see the long note in stampTransforms. */
  regular: true,
  seed: p.seed,
  rotation: p.rotation ?? null,
  lean: p.lean ?? 0,
});

/* ⚠️ THE PIECE IS A HIT TARGET, carrying its own id and growth direction. Piping onto piping is the
   whole point of a pattern with depth, and without this a press aimed at a rosette falls through to
   the cake behind it and buries the new piece inside the one you aimed at. `grow` is stored per
   piece rather than re-derived because a rosette's FACE normals swing right round between crests
   and creases — the admin POC measured that the hard way — so a piece seated on the face it struck
   grows off sideways. A piece laid on another follows the one BELOW it, which is what a hand does. */
function Piece({ piece, onHit }) {
  const stroke = useMemo(() => strokeOf(piece), [piece]);
  return (
    <StampStroke
      stroke={stroke}
      color={piece.colour}
      softness={piece.softness}
      userData={{ pieceId: piece.id, strokeId: piece.strokeId, grow: piece.normal }}
      onPointerDown={e => onHit?.(e, 'down', piece.tierIndex)}
      onPointerMove={e => onHit?.(e, 'move', piece.tierIndex)}
    />
  );
}

/* ── What the pointer actually hits ──────────────────────────────────────────────────────────────
 * Invisible catchers, one per tier, exactly as `CreamPen` does it on the real cake rather than
 * hanging handlers off the tier's own meshes. A cylinder is CLOSED, so its wall and its top cap are
 * both hit from wherever you look — there is no back face to miss, which is what `check:movable`
 * guards against for open planes. Depth-write off so it never occludes the cream standing on it. */
function Catcher({ tier, index, onHit }) {
  const isRect = (tier.shape ?? 'round') === 'rect';
  return (
    <mesh position={[0, tier.baseY + tier.height / 2, 0]}
      onPointerDown={e => onHit?.(e, 'down', index)}
      onPointerMove={e => onHit?.(e, 'move', index)}>
      {isRect
        ? <boxGeometry args={[tier.width, tier.height, tier.depth]} />
        : <cylinderGeometry args={[tier.radius, tier.radius, tier.height, 96]} />}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/* ── Picking a piece: the catalogue's own thumbnails ─────────────────────────────────────────────
 *
 * Sandeep: *"we should not have a dropdown (like in admin) for piping selection. it should be the
 * thumbnails."* And then, at a grid of drawn nozzle openings: *"you are showing the nozzles here.
 * it should be the glb elements thumbnails."*
 *
 * ⚠️ THE SAME PICTURE THE PIPING CARD SHOWS. A baker who has chosen "Classic Shell Border" from
 * Decorations must meet the same tile here, or the two are different products in their eyes. So
 * this is the element's own thumbnail through `corsUrl`, exactly as `renderRingPickerCard` draws it
 * — not a render, not a generated preview, and nothing this file invents. */
function PieceThumbs({ items, value, onChange, isMobile }) {
  return (
    <div style={{ display: 'grid', gap: 6,
                  gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 56 : 64}px, 1fr))` }}>
      {items.map(it => {
        const active = it.id === value;
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)} aria-pressed={active}
            title={it.name}
            style={{ padding: 3, borderRadius: 9, cursor: 'pointer', lineHeight: 0,
                     minHeight: isMobile ? 44 : undefined, background: '#fff',
                     border: `1.5px solid ${active ? INK : '#D8D3CA'}`,
                     boxShadow: active ? '0 0 0 2px rgba(26,26,26,0.18)' : 'none' }}>
            <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 7, overflow: 'hidden',
                          background: '#fff' }}>
              {it.thumb && (
                <img src={corsUrl(it.thumb)} alt={it.name} loading="lazy" decoding="async"
                  crossOrigin="anonymous"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CreamPatternStudio({
  apiClient = null, openWith = null, colorControl = null, color = '#E85A9B',
  /* The pieces a baker may pipe with: [{ id, name, glbUrl, thumb, rotation }], already gated on
     `hand_piping` and already resolved to a GLB by the host. Resolving them HERE would mean a second
     copy of `resolvePipingGlbs`, which lives in CakeDesigner with the catalogue it reads. */
  pieceElements = [],
  /* The baker's own cake — `canvasConfig.tiers`, flat props straight through to CakeTier. */
  tiers = [],
  board = null,
  /* The calibrated stamp size that lands a piece on a ring's own footing (PIPE_STAMP_THICKNESS).
     Handed in rather than redefined: the pen already learned that guessing it ships borders at under
     half size — "beads, not shells". */
  defaultThickness = 0.144,
  onCancel, onSave,
}) {
  const isMobile = useNarrow();
  const [pieces, setPieces] = useState(() => openWith?.payload?.pieces ?? []);
  const [name, setName] = useState(openWith?.name ?? '');
  const [elId, setElId] = useState(() => pieceElements[0]?.id ?? '');
  const [thickness, setThickness] = useState(defaultThickness);
  const [softness, setSoftness] = useState(0.7);
  /* The pen's own number and the pen's own meaning: `stampTransforms` steps by
     `spacing × 2 × thickness`, and the pen card offers 0.5…1.6. Below 1 the copies overlap, which is
     what a dense block is. A second convention would make one number mean two things in one app. */
  const [spacing, setSpacing] = useState(0.85);
  const [saving, setSaving] = useState(false);

  /* An element list that arrives late (the catalogue is fetched per category) must still select
     something — without this the studio opens with no piece on the nozzle and the first press
     silently does nothing. */
  useEffect(() => {
    if (!elId && pieceElements.length) setElId(pieceElements[0].id);
  }, [pieceElements, elId]);

  const picked = pieceElements.find(p => p.id === elId) ?? null;

  const orbit = useRef(null);
  const run = useRef({ id: null, last: null, carry: 0, tierIndex: 0 });
  const [drawing, setDrawing] = useState(false);

  const step = Math.max(spacing * 2 * thickness, 1e-3);

  const addPiece = useCallback((point, normal, strokeId, tierIndex) => {
    if (!picked?.glbUrl) return;
    setPieces(prev => [...prev, {
      id: crypto.randomUUID(), strokeId, tierIndex,
      point: point.toArray(), normal: normal.toArray(),
      elId: picked.id, name: picked.name, glbUrl: picked.glbUrl, rotation: picked.rotation ?? null,
      /* The seed rides the PIECE, like the pen's stroke carries its own: a value read at render time
         would re-roll on every frame. It matters even for a regular stamp, which ignores the jitter —
         because `regular` is a property of the record and could one day be false. */
      seed: Math.floor(Math.random() * 1e6),
      thickness, colour: color, softness,
    }]);
  }, [picked, thickness, color, softness]);

  /* A hit anywhere — cake or cream. The seat is whatever the ray struck; a piece landing on another
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
   * throw is a runtime event, so the bundler has nothing to object to.
   *
   * ⚠️ A SNAPSHOT PER ACTION, NOT PER PIECE. `addPiece` fires once per piece, so a drag laying
   * eleven rosettes calls it eleven times — pushing there would make one drag take eleven presses
   * to walk back. `useCakeDesign` already records what that costs: "it is ONE ACTION, so one undo
   * takes it back… which is what makes people leave a tool." So history is pushed where an ACTION
   * begins: once as a stroke starts, once before a clear.
   *
   * ⚠️ AND IT COVERS CLEAR, which the old derived button could not. "Undo stroke" found the last
   * strokeId and dropped it, so wiping the cake was unrecoverable — the one action most worth
   * undoing was the only one out of reach.
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

  const onHit = useCallback((e, phase, tierIndex = 0) => {
    if (phase === 'move' && !drawing) return;
    /* A piece from the stroke in progress is ignored, and ignored WITHOUT stopping the event so the
       ray carries on to the cake behind. Otherwise a drag stacks on its own tail — the piece placed
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
      run.current = { id, last: point.clone(), carry: 0, tierIndex };
      setDrawing(true);
      addPiece(point, normal, id, tierIndex);
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
      addPiece(st.last.clone().addScaledVector(dir, walked), normal, st.id, st.tierIndex);
    }
    st.carry += remaining - walked;
    st.last = point.clone();
    /* ⚠️ `remember` IS IN THESE DEPS, and leaving it out is a bug no gate catches. It is a
       useCallback keyed on [pieces], so it gets a NEW identity every time a piece lands — while
       `onHit` would keep whichever one it captured when its own deps last changed. The down branch
       would then snapshot a STALE `pieces`, and undo after a second stroke would jump back two
       strokes instead of one. Bindings, build and the suite all pass either way. */
  }, [addPiece, drawing, step, remember]);

  /* Bound to the WINDOW: a drag released off the cake would never fire a pointerup on a mesh and
     would leave rotate switched off for good. */
  const endRun = useCallback(() => {
    setDrawing(false);
    run.current = { id: null, last: null, carry: 0, tierIndex: 0 };
    if (orbit.current) orbit.current.enableRotate = true;
  }, []);
  useEffect(() => {
    window.addEventListener('pointerup', endRun);
    return () => window.removeEventListener('pointerup', endRun);
  }, [endRun]);

  /* ── Where the camera stands ─────────────────────────────────────────────────────────────────
   * ⚠️ FRAMED BY ARITHMETIC, NOT BY EYE, because the first version was not: a camera 2.29 units out
   * at fov 34 covers 1.40 world units, and the plate spanned 2.30 — so the screen showed the MIDDLE
   * of a dish with no rim in it, which read as an empty grey expanse. At fov 34 the frame covers
   * `2·d·tan(17°)` ≈ 0.611·d, so `d = span / 0.611` fits the cake edge to edge and ×1.35 leaves a
   * margin. Derived from the tiers rather than fixed, because the cake is the baker's own and a
   * three-tier stack is nothing like a single 6-inch round. */
  const view = useMemo(() => {
    const maxR = Math.max(0.35, ...tiers.map(t => t.radius ?? 0.35));
    const topY = tiers.length
      ? Math.max(...tiers.map(t => (t.baseY ?? 0) + (t.height ?? 0)))
      : 0.6;
    const span = Math.max(2 * maxR, topY) * 1.15;
    const dist = (span / 0.611) * 1.15;
    /* ⚠️ THE PITCH IS THE WHOLE POINT, AND MY FIRST ARITHMETIC HAD NONE. Framing only for SPAN put
       the eye at 5.8° above the target — near enough eye-level that the top surface was a hairline
       and a piece piped on it was an invisible nub at the rim. The screenshot is what showed it;
       every DOM assertion passed. A pattern goes on the top as often as round the wall, so the
       camera has to present both: 28° is high enough to open the top into a readable ellipse and
       low enough that the wall is still most of the picture. */
    const el = 28 * Math.PI / 180;
    const ty = topY * 0.45;
    return {
      eye: [0, ty + dist * Math.sin(el), dist * Math.cos(el)],
      target: [0, ty, 0],
    };
  }, [tiers]);

  /* ── Dev hooks: what a script cannot see and cannot aim ──────────────────────────────────────
   *
   * ⚠️ DECLARED BELOW `addPiece`, DELIBERATELY. The TDZ crash earlier in this feature was a deps
   * array naming a `const` eighty lines under it, and a green build said nothing because a TDZ throw
   * is a runtime event. Order is load-bearing in this file.
   *
   * ⚠️ THE SCENE CANNOT BE READ FROM THE DOM. A canvas has no children, so "is there a cake in it"
   * is unanswerable by a selector — and the fault this studio nearly shipped (an undefined `baseY`
   * arriving as NaN, drawing nothing) is invisible to every other check. So the studio says what it
   * was handed, and `firstBaseY` is reported as a NUMBER precisely so a NaN cannot pass as present.
   *
   * ⚠️ AND PIPING IS DRIVEN, NOT SYNTHESISED. Raycasting into a live 3D scene from a script tests my
   * aim rather than the studio — the same argument `__tapElementById` and `__tapSticker` already
   * make. Pipes one piece at the top tier's centre, which is a seat that exists on every cake. */
  useEffect(() => {
    if (!(import.meta.env?.DEV && typeof window !== 'undefined')) return;
    window.__patternStudioScene = () => ({
      tiers: tiers.length,
      firstBaseY: tiers[0]?.baseY,
      board: !!board,
      pieces: pieces.length,
      picked: picked?.name ?? null,
    });
    window.__patternPipe = (dx = 0, dz = 0) => {
      const t = tiers[tiers.length - 1];
      if (!t || !picked?.glbUrl) return false;
      addPiece(
        new THREE.Vector3(dx, (t.baseY ?? 0) + (t.height ?? 0), dz),
        new THREE.Vector3(0, 1, 0),
        crypto.randomUUID(),
        tiers.length - 1,
      );
      return true;
    };
    return () => { delete window.__patternStudioScene; delete window.__patternPipe; };
  }, [tiers, board, pieces, picked, addPiece]);

  const payloadOf = () => ({ pieces, v: 2 });

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
  const kindsUsed = new Set(pieces.map(p => p.elId)).size;

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
        Pipe on the cake — tap for one, drag for a run, and change the piece or the colour as you go.
        Pipe onto what you have already piped and it stacks.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
          {/* ⚠️ THE WHEEL DOES NOT SIT ON THE CAKE, AT ANY WIDTH — and I put it there twice before
              measuring. The colour control is handed in, never rebuilt (INVARIANTS #3), and
              GarnishStudio floats it over the drawing because colour is reached for WHILE piping,
              with the other hand (INVARIANTS #12). Sound reasoning, copied without its context:
              there the plate is most of a 720px panel, so a 152px wheel is a corner ornament.
              Here it is not. On a phone the wheel covered the WHOLE canvas, and moving it below only
              on a phone still left it over 11.4% of the surface at 900px — precisely where a piece
              piped in that corner would vanish underneath it. Below the canvas, always. */}
          <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden',
                        background: DESIGNER_GROUND }}>
            {/* `shadows`, because a piece standing off the wall is judged by the shadow it throws
                as much as by its own shading — without one it reads as a sticker. */}
            <Canvas shadows camera={{ position: view.eye, fov: 34 }}
                    style={{ width: '100%', height: '100%' }}>
              {/* The designer's own rig: cream judged under a light no cake has had is a judgement
                  about the wrong variable (INVARIANTS #17). */}
              <SceneLights shadows />
              <SceneEnv />
              <SceneBackground colour={DESIGNER_GROUND} />
              <OrbitControls ref={orbit} enablePan={false} makeDefault target={view.target} />
              {/* A tier and a stamp both load GLBs. One boundary for the scene rather than one per
                  mesh — StampStroke carries its own SafeGlb, and CakeTier its own. */}
              <Suspense fallback={null}>
                {board && (
                  <mesh position={[0, board.y ?? 0.05, 0]} receiveShadow>
                    {(board.shape ?? 'round') === 'rect'
                      ? <boxGeometry args={[board.width, 0.1, board.depth]} />
                      : <cylinderGeometry args={[board.radius ?? 1.6, board.radius ?? 1.6, 0.1, 96]} />}
                    <meshStandardMaterial color="#CFC7BD" roughness={0.85} metalness={0} />
                  </mesh>
                )}
                {/* ⚠️ THE BAKER'S OWN TIERS, flat props straight through — the same mapping
                    CakeCanvas makes. A stand-in cake would be a different cake from the one the
                    pattern is for, which is the whole reason the plate was wrong. */}
                {tiers.map((t, i) => (
                  <CakeTier key={i}
                    radius={t.radius} height={t.height} color={t.color} yBase={t.baseY}
                    gradient={t.gradient ?? null} stripes={t.stripes ?? null} glaze={t.glaze ?? null}
                    shape={t.shape ?? 'round'} shapeFamily={t.shapeFamily ?? null}
                    shapeConfig={t.shapeConfig ?? null}
                    width={t.width} depth={t.depth} cornerR={t.cornerR}
                    frostingType={t.frostingType} frostingStyle={t.frostingStyle}
                    styleParams={t.styleParams}
                    dusting={t.dusting ?? null} foil={t.foil ?? null}
                    topCavity={t.topCavity ?? null} topSpiral={t.topSpiral ?? null} />
                ))}
                {tiers.map((t, i) => <Catcher key={`c${i}`} tier={t} index={i} onHit={onHit} />)}
                {pieces.map(p => <Piece key={p.id} piece={p} onHit={onHit} />)}
              </Suspense>
            </Canvas>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {/* ⚠️ `↶ Undo`, THE WORD AND THE GLYPH THE PEN ALREADY USES. A baker meets undo twice in
                this product and it should be the same control both times, not two conventions.
                ⚠️ ALWAYS PRESENT, DISABLED WHEN THERE IS NOTHING TO UNDO — GarnishStudio learned
                this twice: a control that appears only once you have needed it teaches nobody it
                exists, while a greyed one says "this is where undo lives".
                ⚠️ DISABLED ON THE HISTORY, NOT ON THE PIECES. A bare cake can still have something
                to undo — a Clear is exactly that case, and gating on `empty` would grey the button
                out at the one moment it matters most. */}
            <button onClick={undo} disabled={!history.length}
                    style={{ ...btn(false, !history.length), flex: 1 }}>
              ↶ Undo
            </button>
            <button onClick={clearAll} disabled={empty} style={{ ...btn(false, empty), flex: 1 }}>
              Clear
            </button>
          </div>
          {/* Below the canvas at EVERY width — see the note above it. Gating this on `isMobile` was
              the third mistake in a row with this one control: it removed the desktop overlay and
              then rendered nothing in its place, so a wide screen had no colour control at all. An
              overlap traded for an absence. */}
          {colorControl && <div style={{ marginTop: 10 }}>{colorControl}</div>}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={cap}>On the nozzle</div>
          {pieceElements.length === 0 ? (
            /* ⚠️ SAYS WHY, AND WHERE TO FIX IT. An empty grid with no words reads as a broken studio,
               and the cause is an admin decision rather than a fault: nothing in the catalogue has
               been marked as repeatable yet. */
            <div style={{ fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.5,
                          border: '1px dashed #D8D3CA', borderRadius: 9, padding: '10px 11px' }}>
              No piping is marked as repeatable yet. Tick <b>Allow hand piping</b> on a piping
              element in admin and it appears here.
            </div>
          ) : (
            <PieceThumbs items={pieceElements} value={elId} onChange={setElId} isMobile={isMobile} />
          )}
          {/* The chosen piece NAMED below the grid: a tile is 64px and a name is unreadable on it,
              while a piece with no name is unsearchable for a baker who wants "the shell". */}
          {picked && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, margin: '8px 0 4px' }}>
              {picked.name}
            </div>
          )}

          <div style={cap}>The piece</div>
          {/* ⚠️ THE RANGE OPENS ABOVE THE CALIBRATED DEFAULT, not just below it. `PIPE_STAMP_THICKNESS`
              lands a stamp on a ring's own footing and is an ESTIMATE — the pen's own note says so —
              so the slider has to be able to go bigger as well as smaller, or the estimate becomes a
              ceiling. */}
          <div style={row}>
            <SizeDial size={thickness} min={0.04} max={0.34} step={0.005} onChange={setThickness}
                      fmt={v => `${Math.round(v * 1000) / 10}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Size</div>
              <div style={{ fontSize: 11, color: '#8a8a8a' }}>how big each piece is</div>
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
            {pieces.length} piece{pieces.length === 1 ? '' : 's'} · {strokes} stroke{strokes === 1 ? '' : 's'} · {kindsUsed} kind{kindsUsed === 1 ? '' : 's'}
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
