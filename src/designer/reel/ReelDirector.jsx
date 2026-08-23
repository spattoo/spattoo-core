import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { recordCanvas, pickMimeType, isInstagramReady, extensionFor, downloadBlob } from './recordReel.js';
import { snapshotScene } from './sceneSnapshot.js';
import { drawCaption, ensureCaptionFont, CAPTION } from './reelCaption.js';
import { CAMERA_POSITION_MOBILE, DESIGNER_GROUND } from '../constants.js';

/* ── The reel shot: a slow arc with a push in ────────────────────────────────────────────────────
 *
 * Lives INSIDE the <Canvas> because it needs the camera, and fills a ref so the designer outside can
 * start it — the same idiom as CameraSnapper, which is how the parent already reaches the camera.
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

export default function ReelDirector({ reelRef, orbitRef }) {
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

  useEffect(() => {
    if (!reelRef) return;

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
      width = 1080, height = 1920, // the reel format, rendered at this size whatever the screen is
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

      try {
        if (controls) { controls.autoRotate = false; controls.enabled = false; }

        // Render at exactly 1080×1920 regardless of the window. `false` leaves the CSS size alone,
        // so only the drawing buffer changes — the on-screen canvas stretches for the duration,
        // which reads as "recording" rather than as a glitch.
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Spherical coords around the orbit target: the arc is an azimuth sweep, the push-in a
        // radius. Both from where the baker left the camera, so the shot starts on their framing.
        const start = new THREE.Spherical().setFromVector3(startPos.clone().sub(target));
        const arc = (arcDeg / 360) * TAU;

        const mimeType = pickMimeType();
        const frames = Math.max(2, Math.round(seconds * 60));

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

        const blob = await recordCanvas(composite, async requestFrame => {
          for (let i = 0; i < frames; i++) {
            const t = (pingPong ? outAndBack : smootherstep)(i / (frames - 1));
            const s = new THREE.Spherical(
              start.radius * (1 + (zoomTo - 1) * t),
              start.phi,
              start.theta + arc * t,
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
            onProgress?.((i + 1) / frames);
            // Yield so the tab paints and stays responsive; rAF also keeps us on the display clock.
            await new Promise(r => requestAnimationFrame(r));
          }
        }, { mimeType });

        downloadBlob(blob, `${filename}.${extensionFor(mimeType)}`);
        return { mimeType, instagramReady: isInstagramReady(mimeType), size: blob.size };
      } finally {
        // Always, even on a throw: a half-restored camera is a designer that looks broken with no
        // clue why.
        snap.restore();
        camera.lookAt(target);   // aim is not part of the snapshot — it is derived from the target
        busy.current = false;
      }
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
    reelRef.current = { record, beginPreview, endPreview };
    return () => {
      // Leaving the designer mid-preview must not strand it on a recording ground.
      previewSnap.current?.restore();
      previewSnap.current = null;
      if (reelRef) reelRef.current = null;
    };
  }, [reelRef, orbitRef, camera, gl, scene]);

  return null;
}
