import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { recordCanvas, pickMimeType, isInstagramReady, extensionFor, downloadBlob } from './recordReel.js';

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
const OUT_FRACTION = 0.4;
const outAndBack = t => t <= OUT_FRACTION
  ? smootherstep(t / OUT_FRACTION)
  : smootherstep(1 - (t - OUT_FRACTION) / (1 - OUT_FRACTION));

export default function ReelDirector({ reelRef, orbitRef }) {
  const { camera, gl, scene, size } = useThree();
  const busy = useRef(false);

  useEffect(() => {
    if (!reelRef) return;
    reelRef.current = async ({
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
      onProgress = null,
    } = {}) => {
      // Two takes at once would fight over the camera and the drawing buffer, and the second would
      // record the first one's teardown.
      if (busy.current) throw new Error('already recording');
      busy.current = true;

      const controls = orbitRef?.current;
      const target = controls ? controls.target.clone() : new THREE.Vector3(0, 1.55, 0);

      // Everything we are about to change, so it can go back exactly. A reel that leaves the
      // designer at a different size or aspect is a bug the baker meets later, in another feature.
      const before = {
        pos: camera.position.clone(),
        aspect: camera.aspect,
        dpr: gl.getPixelRatio(),
        size: gl.getSize(new THREE.Vector2()),
        autoRotate: controls?.autoRotate ?? false,
        enabled: controls?.enabled ?? true,
      };

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
        const start = new THREE.Spherical().setFromVector3(before.pos.clone().sub(target));
        const arc = (arcDeg / 360) * TAU;

        const mimeType = pickMimeType();
        const frames = Math.max(2, Math.round(seconds * 60));

        const blob = await recordCanvas(gl.domElement, async requestFrame => {
          for (let i = 0; i < frames; i++) {
            const t = (pingPong ? outAndBack : smootherstep)(i / (frames - 1));
            const s = new THREE.Spherical(
              start.radius * (1 + (zoomTo - 1) * t),
              start.phi,
              start.theta + arc * t,
            );
            camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(s)));
            camera.lookAt(target);
            gl.render(scene, camera);
            // Immediately after the draw, before anything else touches the context — one captured
            // frame per rendered frame.
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
        gl.setPixelRatio(before.dpr);
        gl.setSize(before.size.x, before.size.y, false);
        camera.aspect = before.aspect;
        camera.position.copy(before.pos);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        if (controls) { controls.autoRotate = before.autoRotate; controls.enabled = before.enabled; controls.update(); }
        busy.current = false;
      }
    };
    return () => { if (reelRef) reelRef.current = null; };
  }, [reelRef, orbitRef, camera, gl, scene, size]);

  return null;
}
