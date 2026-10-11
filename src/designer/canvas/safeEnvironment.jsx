import { Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { TextureErrorBoundary } from './TextureErrorBoundary.jsx';

/* ── The scene's HDRI, wrapped so a failed fetch degrades instead of white-screening ─────────────
 *
 * ⚠️ IT LIVES IN ITS OWN FILE SO THAT NEEDING A BOUNDARY IS NOT THE SAME AS LIGHTING A SCENE.
 * `check:env-map` asks whether an exported module can REACH the env map, by walking imports for
 * `canvas/envMap.js` or the name `SafeEnvironment`. That is a proxy for "mounts a scene", and while
 * this function sat beside `SafeGlb` in TextureErrorBoundary.jsx the proxy misfired: anything that
 * wanted a GLB error boundary — `StampStroke`, which mounts no scene and lights nothing — came out
 * flagged, because it imported a FILE that lights a scene rather than a scene.
 *
 * The allowlist already carries one entry of exactly this shape (`pipingMedia.js`, "the import
 * reaches a FILE that lights a scene, not a scene"). Splitting the file fixes the proxy for every
 * future caller instead of spending another exception, which is the root CLAUDE.md's own rule:
 * the honest fix is for the thing to stop living in a module that does more than it needs, not for
 * the gate to grow around it.
 *
 * drei's <Environment preset> fetches an HDRI from a public CDN (pmndrs drei-assets on GitHub raw),
 * which is flaky, rate-limited and 503s. A failed env map must NEVER crash the scene. Same props as
 * <Environment>.
 */
export function SafeEnvironment(props) {
  /* ErrorBoundary OUTSIDE the Suspense: <Environment> suspends while loading the HDR, and on a load
     REJECTION React unwinds to the Suspense and the error propagates to the boundary ABOVE it — so
     the boundary must sit outside to catch it (and the Suspense lets call sites without their own
     boundary, like the off-screen thumbnail canvas, load it safely). */
  return (
    <TextureErrorBoundary screen="Environment">
      <Suspense fallback={null}>
        <Environment {...props} />
      </Suspense>
    </TextureErrorBoundary>
  );
}
