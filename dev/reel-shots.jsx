import { StrictMode, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './scene.js';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { cakeAimTarget } from '../src/designer/geometry/framing.js';
import { CAMERA_POSITION, CAMERA_FOV } from '../src/designer/constants.js';
import { angleByKey, anglePosition } from '../src/designer/photo/photoAngles.js';
import { progressAt, POLE_MARGIN } from '../src/designer/reel/takePlan.js';
import { recordCanvas, pickMimeType, extensionFor, downloadBlob } from '../src/designer/reel/recordReel.js';

/* ── Does cutting fix the sameness? ──────────────────────────────────────────────────────────────
 *
 * `plans/reel-studio.md` §3 claims a cut is FREE: recordCanvas captures exactly one frame per
 * explicit requestFrame() and does not care whether consecutive frames are continuous in space, so
 * a three-shot reel costs the same as a one-shot one — no second encoder, no concatenation, no
 * ffmpeg. That claim is marked UNVERIFIED in the plan. This page is what verifies it.
 *
 * It also answers the question the plan cannot: does a cut actually make the reel better? Play
 * "Turntable" (today's shot, exactly) against the multi-shot recipes on the same cake and judge it.
 *
 * ⚠️ THE TIMINGS BELOW ARE THE ORIGINAL ONES, AND THEY ARE KNOWN TO BE WRONG. Sandeep, first
 * viewing: "those are moving very fast." Measured afterwards, the camera is not the problem — every
 * shot here is SLOWER than the shipped turntable (125°/s peak) and the close `detail` shot is the
 * slowest thing on the page at 12°/s mean. What is wrong is the CUT RATE: 1.4s per shot in Reveal
 * and 0.9s in Four cuts, against 4.5s today. The fix is fewer, longer shots — roughly one cut every
 * 2–2.5s, which makes a multi-shot reel LONGER than 4.5s rather than the same length chopped finer.
 *
 * Deliberately not applied yet, so the page still demonstrates the fault the plan describes. See
 * plans/reel-studio.md §5c, which carries the measurements. Retune before judging a reel template
 * on pacing — and add a tempo control rather than guessing at numbers a second time.
 *
 * ── WHAT THIS DELIBERATELY IS NOT ───────────────────────────────────────────────────────────────
 * Not the product. It records the canvas at its ON-SCREEN size, where a real take resizes the
 * drawing buffer to 1080×1920, probes the device and demotes to 720p if it cannot sustain the shot
 * (takePlan.js). All of that is about OUTPUT; this page is about shot grammar, and carrying the
 * output bracket across would add failure modes that have nothing to do with the question.
 *
 * ⚠️ AND IT CANNOT JUDGE STAGING — the plan's §6, the props and the surface. CakePreview mounts
 * CakeThumbnailScene, which draws SceneLights and CakeContent and NOTHING ELSE: no floor plane, no
 * shadow catcher. That is why the cake here floats on white. The painted floor and the
 * `shadowMaterial` catcher at y=0 belong to the LIVE CakeCanvas scene, so a prop judged on this
 * page would be judged without the contact shadow that is the whole reason it reads as real.
 * Staging needs the live scene, or a floor added here first.
 *
 * ── WHY THE CAMERA WORK LIVES IN A useFrame AT PRIORITY 1 ───────────────────────────────────────
 * ⚠️ CakePreview mounts its own OrbitControls and exposes no ref, so the controls cannot be turned
 * off from out here. drei registers `controls.update()` at useFrame(…, -1), and three's update()
 * ends with `position.copy(target).add(offset)` and `object.lookAt(target)` — it re-imposes its own
 * aim every frame. A director writing the camera at the default priority would have its framing
 * silently overwritten, and the page would render a shot nobody asked for while looking like it
 * worked.
 *
 * Priority 1 runs AFTER -1, and in R3F any priority above 0 also hands the render call to us —
 * which recording needs anyway, exactly as TakeDirector does it. So one loop positions the camera,
 * renders, and (while recording) asks for the frame. One captured frame per rendered frame.
 */

/* The cake. Two tiers so the low angle has height to work with, and cream layers so a close shot
 * has a real edge to frame — geometry, not a texture.
 *
 * ⚠️ NO PIPED BORDER, on purpose. A topPipings entry carries a glbUrl and a catalogue element id
 * (see dev/piping-drag.jsx `layer()`), so a piped cake here would couple a page about CAMERA WORK
 * to element data, and fail for reasons that have nothing to do with shots. Tiers and cream need no
 * asset. toCanvasConfig resolves stacking, radius and the frosting defaults from this much.
 */
const DESIGN = {
  tiers: [
    { shape: 'round', radius: 1.55, height: 1.35, color: '#F6DCE2',
      frostingType: 'buttercream', frostingStyle: 'smooth',
      topPipings: [], bottomPipings: [],
      creamLayers: [{ layerId: 'c1', color: '#FFF4E8', height: 0.40, order: 0, edge: 'wave', seed: 3 }] },
    { shape: 'round', radius: 1.05, height: 1.15, color: '#FFF4E8',
      frostingType: 'buttercream', frostingStyle: 'smooth',
      topPipings: [], bottomPipings: [],
      creamLayers: [{ layerId: 'c2', color: '#F6DCE2', height: 0.32, order: 0, edge: 'wave', seed: 7 }] },
  ],
  stickers: [], texts: [], ages: [], garnishes: [], piping: [],
};
const HEIGHTS = DESIGN.tiers.map(t => t.height);

/* ── The shots ───────────────────────────────────────────────────────────────────────────────────
 *
 * `angle` names a PHOTO_ANGLES key and nothing else. The plan's §2 argues this at length: those four
 * angles are tuned and carry written rationales, and TakeDirector already borrows "above" for its
 * rise rather than keeping a second opinion about where overhead is. A shot here that invented its
 * own phi would be the drift that comment exists to prevent.
 *
 * `radius` is a FRACTION of the framed distance, never a world number (INVARIANTS #8) — the cake's
 * size decides the distance, and a literal here would be wrong the first time the cake changed.
 */
const SHOTS = {
  wide:         { angle: 'three-quarter', radius: 1.10 },
  threeQuarter: { angle: 'three-quarter', radius: 0.92 },
  front:        { angle: 'front',         radius: 0.95 },
  side:         { angle: 'side',          radius: 0.95 },
  above:        { angle: 'above',         radius: 0.88 },
  // Close enough that a cream edge fills the frame. This is the shot the plan calls "detail", and
  // the one no current reel can produce — the dolly is fixed at 0.78 and never exposed.
  detail:       { angle: 'three-quarter', radius: 0.52 },
  // Below level. phi > 90 looks UP at the cake and makes it monumental; the take engine has always
  // been able to do this (phi clamps at 174°) and nothing has ever asked it to.
  hero:         { angle: 'front',         radius: 0.78, phi: 104 },
};

/* ── The recipes ─────────────────────────────────────────────────────────────────────────────────
 *
 * Data, exactly as plans/reel-studio.md §5 proposes — a second kind of reel is a row here, not a
 * branch in the runner. If this page is right, these rows are close to what the real catalogue
 * holds, served from the server so the Blaze gate has something to actually guard (§7a).
 *
 * "Turntable" is FIRST and is today's shot to the digit: one segment, 120°, the fixed 0.78 push-in,
 * out-and-back. It is the control. Without something to judge against, every other recipe here
 * looks good simply because it is new.
 */
const RECIPES = [
  { key: 'turntable', label: 'Turntable (today)',
    note: 'Exactly what ships now: one unbroken 120° orbit with the fixed 22% push-in. The control.',
    segments: [{ shot: 'threeQuarter', seconds: 4.5, arc: 120, zoomTo: 0.78, pingPong: true }] },

  { key: 'reveal', label: 'The reveal',
    note: 'Opens on an edge nobody can identify yet, cuts wide once the eye has something to place, finishes on the lid.',
    segments: [
      { shot: 'detail',       seconds: 1.2, arc: 14, zoomTo: 1.18 },
      { shot: 'threeQuarter', seconds: 2.2, arc: 90 },
      { shot: 'above',        seconds: 0.9, arc: 20 },
    ] },

  { key: 'hero', label: 'Hero',
    note: 'Low and looking up, a beat where nothing moves, then a rise. The hold is doing more work than it looks.',
    segments: [
      { shot: 'hero',         seconds: 1.6, arc: 22, zoomTo: 0.88 },
      { shot: 'front',        seconds: 0.7 },
      { shot: 'threeQuarter', seconds: 1.9, arc: 70, riseTo: 'above' },
    ] },

  { key: 'fourcut', label: 'Four cuts',
    note: 'Deliberately blunt: four angles, no move inside three of them. Tests whether rhythm alone carries it.',
    segments: [
      { shot: 'front',        seconds: 0.7 },
      { shot: 'side',         seconds: 0.7 },
      { shot: 'above',        seconds: 0.7 },
      { shot: 'threeQuarter', seconds: 1.6, arc: 60, zoomTo: 0.82 },
    ] },

  { key: 'vertigo', label: 'Dolly zoom',
    note: 'Camera pulls back while the lens narrows. The background rushes and the cake does not move — the one move that reads as filmed.',
    segments: [{ shot: 'threeQuarter', seconds: 3.0, arc: 26, zoomTo: 1.45, fovTo: 0.55 }] },
];

// Starts and ends at rest — the same curve TakeDirector uses, so a segment here accelerates the way
// a real take does. Not imported: it is not exported from TakeDirector (takePlan.test.js mirrors it
// locally for the same reason, and says so).
const smootherstep = t => t * t * t * (t * (t * 6 - 15) + 10);
const OUT = 0.4;
const outAndBack = t => t <= OUT ? smootherstep(t / OUT) : smootherstep(1 - (t - OUT) / (1 - OUT));

const DEG = Math.PI / 180;
const clampPhi = rad => Math.min(Math.PI - POLE_MARGIN, Math.max(POLE_MARGIN, rad));

/* Where the camera is, partway through one segment. Pure: no camera, no THREE, so it can be read
 * and argued about without running anything. */
function poseAt(seg, t, baseRadius) {
  const shot = SHOTS[seg.shot] ?? SHOTS.threeQuarter;
  const angle = angleByKey(shot.angle);
  const ping = seg.pingPong === true;
  const eased = (ping ? outAndBack : smootherstep)(t);

  const startPhi = (shot.phi ?? angle.phi) * DEG;
  const endPhi = seg.riseTo ? angleByKey(seg.riseTo).phi * DEG : startPhi;
  const phi = clampPhi(startPhi + (endPhi - startPhi) * eased);

  const theta = angle.theta + (seg.arc ?? 0) * eased;
  const zoom = 1 + ((seg.zoomTo ?? 1) - 1) * eased;
  const radius = baseRadius * shot.radius * zoom;
  const fov = CAMERA_FOV * (1 + ((seg.fovTo ?? 1) - 1) * eased);

  return { pos: anglePosition({ x: 0, y: 0, z: 0 }, radius, theta, phi / DEG), fov };
}

/* Where the cake sits in the frame. Lifted straight from TakeDirector: aiming at the cake's own
 * centre puts it low under a dead top half. Expressed as a fraction of the visible height at the
 * CURRENT distance, so a push-in does not slide the cake down the frame. */
const FRAME_LIFT = 0.20;
function aimBelow(target, radius, fovDeg) {
  const visibleH = 2 * radius * Math.tan((fovDeg / 2) * DEG);
  return new THREE.Vector3(target.x, target.y - visibleH * FRAME_LIFT, target.z);
}

const total = r => r.segments.reduce((n, s) => n + s.seconds, 0);

/* Which segment is live at `elapsed`, and how far through it. Returns the segment INDEX too, so the
 * page can show where the cuts land — the thing being judged. */
function segmentAt(recipe, elapsedMs) {
  let acc = 0;
  for (let i = 0; i < recipe.segments.length; i++) {
    const seg = recipe.segments[i];
    const end = acc + seg.seconds * 1000;
    if (elapsedMs < end || i === recipe.segments.length - 1) {
      return { i, seg, t: progressAt(elapsedMs - acc, seg.seconds) };
    }
    acc = end;
  }
  return { i: 0, seg: recipe.segments[0], t: 0 };
}

function ShotRunner({ runRef, target, onTick }) {
  const { camera, gl, scene } = useThree();
  const play = useRef(null);       // { recipe, started, frame }  — null when idle
  const baseRadius = useMemo(
    () => new THREE.Vector3(...CAMERA_POSITION).distanceTo(new THREE.Vector3(...target)),
    [target],
  );

  useFrame(() => {
    const p = play.current;
    if (p) {
      const elapsed = performance.now() - p.started;
      const { i, seg, t } = segmentAt(p.recipe, elapsed);
      const { pos, fov } = poseAt(seg, t, baseRadius);
      const aim = new THREE.Vector3(...target);
      camera.position.set(target[0] + pos.x, target[1] + pos.y, target[2] + pos.z);
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(aimBelow(aim, camera.position.distanceTo(aim), fov));
      /* ⚠️ ONLY ON A CUT, not every frame. This used to fire per frame, which is a React render
         per CAPTURED frame — on the one page whose whole subject is whether capture stays smooth.
         The segment index is all the UI shows, and it changes a handful of times per take. */
      if (i !== p.shown) { p.shown = i; onTick?.({ segment: i, shot: seg.shot, elapsed, done: false }); }
      if (elapsed >= total(p.recipe) * 1000) p.finish();
    }
    // We own the render: priority 1 takes it from R3F. Idle frames still draw, so dragging the cake
    // with OrbitControls keeps working between takes.
    gl.render(scene, camera);
    if (p?.frame) p.frame();
  }, 1);

  runRef.current = {
    async run(recipe, { record = false } = {}) {
      // Local save/restore rather than sceneSnapshot.js: that module guards the production bracket,
      // which also resizes the drawing buffer and swaps the ground. Nothing here touches either —
      // only these four values move, and their undo sits on the next line where it can be checked.
      const before = {
        pos: camera.position.clone(), quat: camera.quaternion.clone(),
        up: camera.up.clone(), fov: camera.fov,
      };
      const restore = () => {
        camera.position.copy(before.pos); camera.quaternion.copy(before.quat);
        camera.up.copy(before.up); camera.fov = before.fov; camera.updateProjectionMatrix();
      };

      const started = performance.now();
      let finish;
      const done = new Promise(res => { finish = res; });
      play.current = { recipe, started, finish, frame: null, shown: -1 };

      try {
        if (!record) { await done; return null; }
        const mimeType = pickMimeType();
        if (!mimeType) throw new Error('This browser cannot record video (MediaRecorder unavailable).');
        const blob = await recordCanvas(gl.domElement, async requestFrame => {
          // One captured frame per RENDERED frame — the loop above asks for it immediately after
          // drawing, which is the invariant recordReel.js was written around. No second rAF loop:
          // two loops rendering the same canvas is how frames get captured twice or missed.
          play.current.frame = requestFrame;
          await done;
          play.current.frame = null;
        }, { mimeType });
        return { blob, mimeType, ext: extensionFor(mimeType) };
      } finally {
        play.current = null;
        restore();
        onTick?.({ segment: -1, shot: null, elapsed: 0, done: true });
      }
    },
  };
  return null;
}

const s = {
  page:   { display: 'flex', flexWrap: 'wrap', height: '100vh', fontFamily: "'Quicksand',sans-serif" },
  side:   { width: 300, minWidth: 260, flexShrink: 0, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13 },
  stage:  { flex: 1, minWidth: 320, position: 'relative', background: '#fff' },
  h:      { fontSize: 15, margin: '0 0 4px' },
  sub:    { fontSize: 11.5, color: '#6E8577', lineHeight: 1.5, margin: '0 0 14px' },
  btn:    (on) => ({ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '8px 10px',
                     borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                     border: `1px solid ${on ? '#2C4433' : '#dfe6e0'}`, background: on ? '#2C4433' : '#fff',
                     color: on ? '#fff' : '#2C4433' }),
  note:   { fontSize: 11, color: '#6E8577', lineHeight: 1.45, margin: '-2px 0 10px 2px' },
  act:    { flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 800, background: '#2C4433', color: '#fff' },
  strip:  { display: 'flex', gap: 2, margin: '10px 0 4px' },
  cell:   (on) => ({ flex: 1, height: 6, borderRadius: 3, background: on ? '#2C4433' : '#dfe6e0' }),
  meta:   { fontSize: 11, color: '#6E8577', lineHeight: 1.6 },
};

function Page() {
  const runRef = useRef(null);
  const [recipe, setRecipe] = useState(RECIPES[0]);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState({ segment: -1, shot: null, elapsed: 0 });
  const [out, setOut] = useState(null);       // { url, ext, size, mimeType }

  const target = useMemo(() => cakeAimTarget(HEIGHTS, CAMERA_POSITION), []);

  async function go(record) {
    if (busy || !runRef.current) return;
    setBusy(true);
    try {
      const res = await runRef.current.run(recipe, { record });
      if (res) {
        if (out?.url) URL.revokeObjectURL(out.url);
        setOut({ blob: res.blob, url: URL.createObjectURL(res.blob), ext: res.ext,
                 size: res.blob.size, mimeType: res.mimeType });
      }
    } catch (e) {
      console.error('[reel-shots]', e);
      alert(String(e.message ?? e));
    } finally { setBusy(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.side}>
        <h2 style={s.h}>Reel shots</h2>
        <p style={s.sub}>
          Proving <b>plans/reel-studio.md §3</b> — that a cut costs nothing, because recording
          captures one frame per explicit request and does not care if the camera jumps. Play
          <b> Turntable</b> first: it is today's shot exactly, and it is what the rest has to beat.
        </p>

        {RECIPES.map(r => (
          <div key={r.key}>
            <button style={s.btn(recipe.key === r.key)} onClick={() => setRecipe(r)} disabled={busy}>
              {r.label} · {total(r).toFixed(1)}s · {r.segments.length} shot{r.segments.length > 1 ? 's' : ''}
            </button>
            {recipe.key === r.key && <div style={s.note}>{r.note}</div>}
          </div>
        ))}

        <div style={s.strip}>
          {recipe.segments.map((_, i) => <div key={i} style={s.cell(tick.segment === i)} />)}
        </div>
        <div style={s.meta}>
          {busy ? `${tick.shot ?? '…'} — shot ${tick.segment + 1} of ${recipe.segments.length}` : 'idle · drag the cake to reframe'}
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 10px' }}>
          <button style={s.act} onClick={() => go(false)} disabled={busy}>Play</button>
          <button style={s.act} onClick={() => go(true)} disabled={busy}>Record</button>
        </div>

        {out && (
          <div>
            {/* Played back here rather than downloaded. A page run twenty times should not leave
                twenty files in Downloads; Save is there for the one worth keeping. */}
            <video src={out.url} controls loop style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            <div style={s.meta}>
              {out.mimeType} · {(out.size / 1024 / 1024).toFixed(2)} MB
              {out.ext !== 'mp4' && ' · not MP4, so Instagram may refuse it'}
            </div>
            <button style={{ ...s.act, width: '100%', marginTop: 8 }}
                    onClick={() => downloadBlob(out.blob, `reel-${recipe.key}.${out.ext}`)}>Save</button>
          </div>
        )}
      </div>

      <div style={s.stage}>
        {/* shadows ON: the plan's §6 staging argument rests on contact shadows being real, and a
            harness judging that with them off would be judging a different scene. */}
        <CakePreview design={DESIGN} autoRotate={false} shadows target={target}
                     cameraPosition={CAMERA_POSITION} fov={CAMERA_FOV}>
          <ShotRunner runRef={runRef} target={target} onTick={setTick} />
        </CakePreview>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Page /></StrictMode>);
