import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { recordCanvas, pickMimeType, isInstagramReady, extensionFor, downloadBlob } from './recordReel.js';
import { snapshotScene } from './sceneSnapshot.js';
import { drawCaption, ensureCaptionFont, CAPTION } from './reelCaption.js';
import { planTake, medianOf, progressAt } from './takePlan.js';
import { CAMERA_POSITION_MOBILE, DESIGNER_GROUND } from '../constants.js';
import { photoSize, clampToDevice } from '../photo/photoShapes.js';
import { anglePosition, angleByKey, angleAt } from '../photo/photoAngles.js';

/* ── Takes: the reel's slow arc, and the photo's single frame ────────────────────────────────────
 *
 * Lives INSIDE the <Canvas> because it needs the camera, and fills a ref so the designer outside can
 * start it — the same idiom as CameraSnapper, which is how the parent already reaches the camera.
 *
 * ⚠️ ONE DIRECTOR FOR BOTH, and not for tidiness. Both mutate the live scene — buffer size, camera
 * aspect, orbit controls — and both have to put it back. Two components doing that would each hold
 * their own snapshot, and the moment their brackets overlapped (open the photo panel during a reel
 * preview) one would restore the other's starting state on top of the baker's. The preview bracket
 * below is already the wider of the two for exactly this reason. Was ReelDirector until the photo
 * arrived; a "reel" director that also takes photographs is a name that misleads the next reader.
 * Catalogue authors only; see spattoo-docs/features/reel-capture.md.
 *
 * ── WHY THIS CAN DO WHAT THE SCRIPT COULD NOT ───────────────────────────────────────────────────
 * .pw/reel.mjs drives the mouse, because nothing outside the app can reach R3F's camera — and the
 * designer sets enableZoom={false}, so a script can rotate but never dolly, which is why its push-in
 * is an ffmpeg crop after the fact. In here we own the camera, so the dolly is real and there is
 * nothing to crop.
 */

const TAU = Math.PI * 2;
const smootherstep = t => t * t * t * (t * (t * 6 - 15) + 10);   // starts and ends at rest

/* Out and back, for a reel that LOOPS — and DELIBERATELY LOPSIDED.
 *
 * A one-way arc ends 120° from where it started, and Instagram cuts straight back to the beginning:
 * a hard jump every time round. Returning to the start angle removes the seam entirely.
 *
 * sin(πt) would do that in one line, but it is symmetric — out and back at the same speed. The
 * return is the half worth lingering on: a cake designed in 3D is a new idea to most people, and the
 * second pass is when they stop being surprised and start looking. So the outbound takes 40% of the
 * take and the return 60%, which at 4.5s is 1.8s out and 2.7s back.
 *
 * Each leg is smootherstep, so velocity is zero at the start, at the turnaround and at the end. The
 * stall at the seam is a feature here rather than a cost: nothing is moving at the cut, so the loop
 * point is invisible.
 *
 * ⚠️ The DOLLY rides the same phase, so it comes home too. Ending closer than it started would leave
 * the seam jumping on distance even with the angle matched — which is why there is one curve here
 * and not two.
 */
/* Where the cake sits in the frame.
 *
 * Aiming straight at the orbit target — the cake's own centre — put the subject at 0.64 of a 9:16
 * frame: low, under a dead top half, with the caption crowding it from below. A reel is a tall
 * frame and the eye lands high in it.
 *
 * So the camera orbits the cake but AIMS slightly below it, which lifts the cake in frame. Expressed
 * as a fraction of the visible height AT THE CURRENT DISTANCE rather than as a world offset: the
 * shot dollies in, and a fixed offset would slide the cake down the frame as it got closer — a drift
 * nobody would be able to name but everybody would feel. */
const FRAME_LIFT = 0.20;
const aimBelow = (target, radius, fovDeg) => {
  const visibleH = 2 * radius * Math.tan((fovDeg / 2) * Math.PI / 180);
  return target.clone().setY(target.y - visibleH * FRAME_LIFT);
};

const OUT_FRACTION = 0.4;
const outAndBack = t => t <= OUT_FRACTION
  ? smootherstep(t / OUT_FRACTION)
  : smootherstep(1 - (t - OUT_FRACTION) / (1 - OUT_FRACTION));

export default function TakeDirector({ takeRef, orbitRef, onAngleChange = null }) {
  // ⚠️ NO `size` HERE, and none in the effect's deps below. It is tempting — the recorder does
  // resize the buffer — but subscribing to it made the preview undo itself: cropping the container to
  // 9:16 resizes the canvas, `size` changes, the effect tears down, and its cleanup restores the
  // buffer to the pre-crop size. The result was a 9:16 box on screen rendering a 1096×760 buffer,
  // i.e. a stretched cake in the one view whose whole job is to be truthful.
  const { camera, gl, scene } = useThree();
  const busy = useRef(false);

  // The preview's own snapshot. Separate from the take's, because its bracket is WIDER: the ground
  // and the portrait camera apply from the moment the panel opens, and a recording can start and
  // finish inside that window. Nesting two snapshots is fine — restore is idempotent — but they must
  // be separate objects or the take's restore would undo the preview the baker is still looking at.
  const previewSnap = useRef(null);

  /* ── Telling the panel where the camera actually is ───────────────────────────────────────────
   *
   * ⚠️ REPORTED, not remembered. The photo panel highlights the angle preset the camera is at, and
   * the obvious implementation — remember the last preset that was tapped — is a claim rather than a
   * fact: the baker drags the cake immediately afterwards (that is the whole design) and the
   * highlight would go on naming a shot that is no longer on screen.
   *
   * ⚠️ Waits for the controls to exist. OrbitControls is created by drei and its ref fills AFTER this
   * effect first runs, so subscribing once on mount silently attaches to nothing — the highlight
   * would work in whichever render order happened to win and not in the other.
   *
   * Fires on every frame of a drag; only a CHANGE of preset reaches React, so a drag across the
   * whole cake produces two state updates rather than two hundred.
   */
  useEffect(() => {
    if (!onAngleChange) return;
    let raf = 0;
    let controls = null;
    let last;
    const report = () => {
      const t = controls?.target;
      if (!t) return;
      const key = angleAt({ x: t.x, y: t.y, z: t.z },
                          { x: camera.position.x, y: camera.position.y, z: camera.position.z });
      if (key !== last) { last = key; onAngleChange(key); }
    };
    const attach = () => {
      controls = orbitRef?.current;
      if (!controls) { raf = requestAnimationFrame(attach); return; }
      controls.addEventListener('change', report);
      report();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      controls?.removeEventListener('change', report);
    };
  }, [orbitRef, camera, onAngleChange]);

  useEffect(() => {
    if (!takeRef) return;

    const record = async ({
      // 4.5s for the out-and-back: the return leg is the one people actually watch, and a rushed
      // one defeats the point of having it. A one-way sweep still wants ~2.5s — the caller passes it.
      seconds = 4.5,
      // ⚠️ NOT a full turn. A complete revolution reads as a product viewer, and it tells the viewer
      // exactly when the loop ends — which is when they scroll.
      arcDeg = 120,
      zoomTo = 0.78,               // closest distance as a fraction of the starting distance
      // Turn and return, so the reel loops without a jump. The arc and the dolly both come home.
      pingPong = false,
      // The size ASKED for. What is actually recorded comes from planTake() below — a device that
      // cannot sustain this gets a cheaper take rather than a juddering one.
      width: wantWidth = 1080, height: wantHeight = 1920,
      filename = 'cake-reel',
      // The one line burned into every frame — the bakery's own name, or our mark. Composed by the
      // caller from the `reel_branding` entitlement; see reelCaption.js.
      caption = '',
      // The hex the frame is being filmed against, so the caption can pick a colour that reads on
      // it. Passed in rather than read off scene.background, which may be a Color, a Texture or
      // null — only the swatch knows which hex the baker actually chose.
      ground = DESIGNER_GROUND,
      onProgress = null,
    } = {}) => {
      // Two takes at once would fight over the camera and the drawing buffer, and the second would
      // record the first one's teardown.
      if (busy.current) throw new Error('already recording');
      busy.current = true;

      const controls = orbitRef?.current;
      const target = controls ? controls.target.clone() : new THREE.Vector3(0, 1.55, 0);

      // Everything a take mutates, saved and restored in ONE place — see sceneSnapshot.js. Adding
      // something new that recording changes means adding one entry there, with its undo on the
      // adjacent line, rather than remembering to update a `finally` fifty lines away.
      const snap = snapshotScene({ camera, gl, scene, controls });
      const startPos = camera.position.clone();

      /* ⚠️ The realistic failure on the phones this most needs to work on.
       *
       * Recording holds a 1080×1920 drawing buffer, a second 1080×1920 canvas and a growing MP4, on
       * top of every topper texture already resident. A phone under memory pressure answers by
       * taking the WebGL context away — and WebGL does not throw when that happens. gl.render()
       * quietly does nothing, drawImage yields blank frames, and the take runs to completion and
       * downloads a black video. Which is far worse than an error, because it looks like it worked.
       *
       * Caught here so the loop can stop and SAY what happened. */
      let contextLost = false;
      const onContextLost = () => { contextLost = true; };
      gl.domElement.addEventListener('webglcontextlost', onContextLost);

      try {
        if (controls) { controls.autoRotate = false; controls.enabled = false; }

        // Render at exactly 1080×1920 regardless of the window. `false` leaves the CSS size alone,
        // so only the drawing buffer changes — the on-screen canvas stretches for the duration,
        // which reads as "recording" rather than as a glitch.
        gl.setPixelRatio(1);
        gl.setSize(wantWidth, wantHeight, false);
        camera.aspect = wantWidth / wantHeight;
        camera.updateProjectionMatrix();

        /* ── Can this device actually do it? ──────────────────────────────────────────────────────
         * Ten frames at the size being asked for, timed. This is not a synthetic benchmark: it is
         * THIS cake, at THIS size, on THIS device — a loaded cake with a dozen toppers on an old
         * Android is a completely different proposition from an empty one, and no static rule about
         * device class would tell them apart.
         *
         * Measured across animation frames on purpose. rAF-to-rAF delta is exactly the question
         * being asked — "can it sustain the shot?" — where timing gl.render() alone would measure
         * how fast the driver accepts commands, which is not the same thing and is usually instant.
         *
         * The first two are discarded: the frame after a resize pays for reallocating the drawing
         * buffer, and it is not representative of anything. */
        const samples = [];
        let mark = performance.now();
        for (let i = 0; i < 12; i++) {
          gl.render(scene, camera);
          await new Promise(r => requestAnimationFrame(r));
          const now = performance.now();
          if (i >= 2) samples.push(now - mark);
          mark = now;
        }
        const measured = medianOf(samples);
        const plan = planTake(measured);
        const { width, height } = plan;

        // Logged, not shown. The baker does not need a millisecond figure — but anybody testing this
        // on an actual old phone does, and "it looked fine to me" is not a measurement. This is the
        // only way to find out what a device actually managed without a cable and a profiler.
        console.info('[reel] probe %sms/frame → %s%s',
          measured == null ? '?' : measured.toFixed(1), plan.label, plan.demoted ? ' (demoted)' : '');

        if (plan.demoted) {
          gl.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }

        // Spherical coords around the orbit target: the arc is an azimuth sweep, the push-in a
        // radius. Both from where the baker left the camera, so the shot starts on their framing.
        const start = new THREE.Spherical().setFromVector3(startPos.clone().sub(target));
        const arc = (arcDeg / 360) * TAU;

        const mimeType = pickMimeType();

        /* ── Why a second canvas ──────────────────────────────────────────────────────────────────
         * WebGL cannot draw text, and putting the name in the 3D scene as a plane would make it
         * swim with the camera — it has to sit still on the frame while the cake turns behind it.
         *
         * So each frame is drawn twice: the renderer paints the cake into ITS canvas, we blit that
         * into a 2D canvas at 1:1, then write the caption on top and capture THAT. The blit is a
         * single GPU-backed drawImage per frame; at 1080×1920 it costs well under a millisecond,
         * which is why this is affordable at 60fps on a phone.
         *
         * ⚠️ Reading pixels out of a WebGL canvas at all only works because the designer creates its
         * context with preserveDrawingBuffer: true. Without it drawImage yields a blank frame, and
         * the reel records a caption floating on nothing. */
        const composite = document.createElement('canvas');
        composite.width = width;
        composite.height = height;
        const ctx = composite.getContext('2d');

        // Before the first frame, not during: canvas silently falls back to a default face if
        // Quicksand is not resident, and the substitution is invisible until the reel is posted.
        if (caption) await ensureCaptionFont(height * CAPTION.sizeFrac);

        let frameCount = 0;
        const blob = await recordCanvas(composite, async requestFrame => {
          /* ⚠️ Driven by the CLOCK, not by a frame counter.
           *
           * This used to run `seconds × 60` iterations, one per animation frame. On a phone managing
           * 30fps that took twice as long to get through — and MediaRecorder timestamps in real
           * time, so a 4.5s take came out as a 9s reel at half speed. Nothing reported it. The file
           * was perfectly valid; it was just not the shot anyone asked for.
           *
           * From the clock, a slow device produces FEWER frames across the same 4.5 seconds. The
           * length and the movement are what the baker chose; how many frames it took is the
           * machine's business, and the probe above is what keeps that number decent. */
          const started = performance.now();
          let t = 0;
          do {
            t = progressAt(performance.now() - started, seconds);
            const eased = (pingPong ? outAndBack : smootherstep)(t);
            const s = new THREE.Spherical(
              start.radius * (1 + (zoomTo - 1) * eased),
              start.phi,
              start.theta + arc * eased,
            );
            camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(s)));
            camera.lookAt(aimBelow(target, s.radius, camera.fov));
            gl.render(scene, camera);
            // Blit and caption while the drawing buffer still holds this frame, then capture. All
            // three in the same tick, before anything else touches either context — one captured
            // frame per rendered frame.
            ctx.drawImage(gl.domElement, 0, 0, width, height);
            drawCaption(ctx, { text: caption, width, height, ground });
            requestFrame();
            frameCount++;
            if (contextLost) {
              throw new Error('the 3D view was reset part-way through — the device may be low on '
                + 'memory. Close some tabs, or try a shorter reel.');
            }
            onProgress?.(t);
            // Yield so the tab paints and stays responsive; rAF also keeps us on the display clock.
            await new Promise(r => requestAnimationFrame(r));
          } while (t < 1);
          // `do…while` rather than `while`: a take must record at least one frame even if the tab
          // was backgrounded long enough that the very first clock reading is already past the end.
        }, { mimeType });

        downloadBlob(blob, `${filename}.${extensionFor(mimeType)}`);
        return {
          mimeType, instagramReady: isInstagramReady(mimeType), size: blob.size,
          // Reported so the UI can SAY it recorded smaller, rather than a baker noticing later that
          // this one is softer than the last one and having nothing to attribute it to.
          resolution: plan.label, demoted: plan.demoted,
          fps: Math.round(frameCount / seconds),
        };
      } finally {
        // Always, even on a throw: a half-restored camera is a designer that looks broken with no
        // clue why.
        gl.domElement.removeEventListener('webglcontextlost', onContextLost);
        snap.restore();
        camera.lookAt(target);   // aim is not part of the snapshot — it is derived from the target
        busy.current = false;
      }
    };
    /* ── the photo: one frame, at a size a video could never be ──────────────────────────────────
     *
     * Shares the reel's bracket (snapshot → mutate → restore) and its caption, and almost nothing
     * else. There is no encoder, no clock and no probe: a reel is capped by what a phone can encode
     * thirty times a second, a photo is a single render, so the only ceiling that matters is what
     * the GPU will allocate — asked for below rather than guessed at from a device class.
     */
    const capture = async ({
      aspect = 4 / 5,
      filename = 'cake-photo',
      caption = '',
      ground = DESIGNER_GROUND,
      // No ground at all: the cake cut out on nothing, for a baker dropping it into their own
      // poster. The designer hides the floor for this — see `filmCutout` on CakeCanvas — and all
      // that is left here is to stop painting the sky.
      transparent = false,
    } = {}) => {
      if (busy.current) throw new Error('already recording');
      busy.current = true;

      const controls = orbitRef?.current;
      // ⚠️ The camera is NOT moved. The baker framed this shot by dragging, and the preview they
      // approved is the current camera — a photo that re-composes itself at the last moment is the
      // one thing this feature cannot do. The reel drives the camera because a reel is a movement;
      // a photo is where you are standing.
      const snap = snapshotScene({ camera, gl, scene, controls });

      // Same trap as the reel's: WebGL does not throw when the context goes away. gl.render() does
      // nothing, drawImage yields blank, and a photo of nothing downloads looking like it worked.
      let contextLost = false;
      const onContextLost = () => { contextLost = true; };
      gl.domElement.addEventListener('webglcontextlost', onContextLost);

      try {
        /* ⚠️ Ask the driver what it can hold. Past MAX_RENDERBUFFER_SIZE a resize does not raise —
         * it is refused, or the context is lost, and what comes back is blank or half-height. Older
         * mobile GPUs sit at 4096 and a few at 2048, which is not comfortably clear of the 2048 long
         * edge this asks for. */
        const ctxGl = gl.getContext?.();
        const maxDim = Math.min(
          ctxGl?.getParameter?.(ctxGl.MAX_RENDERBUFFER_SIZE) || Infinity,
          gl.capabilities?.maxTextureSize || Infinity,
        );
        const wanted = photoSize(aspect);
        const { width, height, clamped } = clampToDevice(wanted, maxDim);

        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Transparency is a property of the CLEAR, not of the scene: React owns scene.background
        // (see filmGround), so the sky is already absent for a cutout and this only has to stop the
        // renderer filling the alpha channel back in.
        if (transparent) gl.setClearAlpha(0);

        // Before drawing, not during: canvas silently substitutes a default face if Quicksand is not
        // resident, and nobody notices until the photo is posted.
        if (caption) await ensureCaptionFont(height * CAPTION.sizeFrac);

        gl.render(scene, camera);
        if (contextLost) {
          throw new Error('the 3D view was reset — the device may be low on memory. Close some tabs '
            + 'and try again.');
        }

        /* The same blit the reel does, and for the same reason: WebGL cannot draw text, and putting
         * the name in the scene would make it swim with the camera.
         *
         * ⚠️ Reading pixels out of the WebGL canvas at all works only because the designer creates
         * its context with preserveDrawingBuffer: true. Without it this composites a caption onto a
         * blank rectangle. */
        const composite = document.createElement('canvas');
        composite.width = width;
        composite.height = height;
        const ctx = composite.getContext('2d');
        ctx.drawImage(gl.domElement, 0, 0, width, height);
        drawCaption(ctx, { text: caption, width, height, ground });

        /* ⚠️ PNG, NEVER JPEG — and this is the format decision, not a default nobody thought about.
         * A cake is smooth frosting under soft light, which is the exact content JPEG is worst at:
         * gentle gradients come back BANDED, and the banding lands on the icing where a baker will
         * read it as a fault in the render. It also rules out a transparent cutout entirely. The
         * file is larger; the picture is the product. */
        const blob = await new Promise((resolve, reject) => {
          composite.toBlob(b => (b ? resolve(b) : reject(new Error('the browser could not make the image'))), 'image/png');
        });

        downloadBlob(blob, `${filename}.png`);
        return { width, height, clamped, size: blob.size, transparent };
      } finally {
        gl.domElement.removeEventListener('webglcontextlost', onContextLost);
        // Put the clear alpha back BEFORE the snapshot restore recomputes anything — it is not one
        // of the snapshot's aspects, because only the photo touches it.
        gl.setClearAlpha(1);
        snap.restore();
        busy.current = false;
      }
    };

    /* ── standing somewhere else ──────────────────────────────────────────────────────────────────
     * A one-tap shortcut, not a fixed shot: it moves the camera and hands straight back to
     * OrbitControls, so the baker drags on from wherever it put them.
     *
     * ⚠️ Through controls.target and controls.update(), NOT camera.lookAt. OrbitControls derives its
     * own spherical state from the camera each update — a lookAt it did not perform is discarded on
     * the very next drag, and the view would snap somewhere else the instant the baker touched it.
     */
    const setAngle = (key) => {
      const a = angleByKey(key);
      const controls = orbitRef?.current;
      const target = controls?.target ?? new THREE.Vector3(0, 1.55, 0);
      // Distance is preserved — see photoAngles: a preset walks around the cake, it does not re-zoom.
      const radius = camera.position.distanceTo(target);
      const p = anglePosition(target, radius, a.theta, a.phi);
      camera.position.set(p.x, p.y, p.z);
      controls?.update?.();
      camera.updateProjectionMatrix();
    };

    // ── the preview ────────────────────────────────────────────────────────────────────────────
    // Applied while the panel is open so what the baker sees IS what records. The 9:16 crop is done
    // in the DOM by the designer (constraining the canvas container, which R3F follows); what
    // belongs in here is the part that lives in the scene — the ground, and the portrait camera.
    const beginPreview = () => {
      if (previewSnap.current) return;                 // already previewing; do not stack snapshots
      previewSnap.current = snapshotScene({ camera, gl, scene, controls: orbitRef?.current });
      // Stand where the phone camera stands. The designer uses a wider position on desktop, tuned
      // for a landscape frame — framing a cake with it and then cropping to 9:16 loses the sides,
      // which is exactly the trap the preview exists to remove.
      camera.position.set(...CAMERA_POSITION_MOBILE);
      // The SAME aim the take uses, or the preview would show the cake in a different place from the
      // one it records in — which is the single thing this preview exists to guarantee.
      const t = orbitRef?.current?.target ?? new THREE.Vector3(0, 1.55, 0);
      camera.lookAt(aimBelow(t, camera.position.distanceTo(t), camera.fov));
      orbitRef?.current?.update?.();
    };

    const endPreview = () => {
      previewSnap.current?.restore();
      previewSnap.current = null;
    };

    /* ── The ground is NOT set from here ──────────────────────────────────────────────────────────
     * It used to be: setGround(hex) wrote scene.background directly. That painted the sky and left
     * the 30×30 floor plane its own colour, so every reel had a hard horizon across it and the two
     * dark swatches produced a dark sky over a white floor.
     *
     * It is now a prop — `filmGround` on CakeCanvas — so the floor and the sky take the same colour
     * from the same value, and the preview and the take cannot disagree about it because there is
     * only one of it. React owns the scene; this file owns the camera. */
    takeRef.current = { record, capture, setAngle, beginPreview, endPreview };
    return () => {
      // Leaving the designer mid-preview must not strand it on a recording ground.
      previewSnap.current?.restore();
      previewSnap.current = null;
      if (takeRef) takeRef.current = null;
    };
  }, [takeRef, orbitRef, camera, gl, scene]);

  return null;
}
