import { Component, Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { reportError } from '../../telemetry/index.js';
import { LoadingPing } from './loadingRegistry.js';

// Render-time error boundary for texture/GLB load failures inside an R3F tree. If a child throws
// (e.g. a texture fails to load — a CORS-poisoned cache entry, a 404, a tainted image), render
// nothing instead of letting the throw bubble up and crash the whole <Canvas>. ONE boundary for
// every call site — reach it through <SafeGlb> below rather than pairing it with a Suspense by
// hand — so a single bad asset can never white-screen the designer.
// Rendering null is the correct fallback; we now also REPORT the failure (as a warning) so a
// silently-missing decoration is observable in telemetry instead of vanishing without trace.
export class TextureErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    reportError(error, { screen: this.props.screen || 'CakeCanvas', action: 'texture_load', severity: 'warning' });
  }
  render() { return this.state.error ? null : this.props.children; }
}

// ⚠️ THE wrapper for anything that loads a model or a texture inside the canvas. Boundary OUTSIDE
// the Suspense (see the SafeEnvironment note below for why the order matters), and the fallback is
// always <LoadingPing/> so a loading decoration joins the ONE page-level spinner instead of drawing
// its own. Every GLB call site goes through this — stickers, piping rings, cream-pen stamps, the
// style picker tiles. A 404 on any one of them then costs that decoration, not the whole canvas:
// R3F re-throws an uncaught error out of the canvas into the app boundary, which is a dead screen.
export function SafeGlb({ screen = 'CakeCanvas', children }) {
  return (
    <TextureErrorBoundary screen={screen}>
      <Suspense fallback={<LoadingPing />}>{children}</Suspense>
    </TextureErrorBoundary>
  );
}

/* ⚠️ `SafeEnvironment` MOVED TO safeEnvironment.jsx, and deliberately is not re-exported here.
   `check:env-map` treats a file that MENTIONS the name as one that lights a scene — a proxy for
   "mounts a scene" — so a convenience re-export would put the name straight back and re-flag every
   module that only wants `SafeGlb`. That is what kept `StampStroke` off the public surface: it
   mounts no scene, but it needs a GLB boundary, and the boundary lived next to the environment. */
