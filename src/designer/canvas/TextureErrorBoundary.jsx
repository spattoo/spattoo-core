import { Component, Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { reportError } from '../../telemetry/index.js';

// Render-time error boundary for texture/GLB load failures inside an R3F tree. If a child throws
// (e.g. a texture fails to load — a CORS-poisoned cache entry, a 404, a tainted image), render
// nothing instead of letting the throw bubble up and crash the whole <Canvas>. Shared by the
// on-cake sticker render (CakeCanvas) and the placement preview (TopperPreview) — one boundary,
// both call sites, so a single bad asset can never white-screen the designer.
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

// drei's <Environment preset> fetches an HDRI from a public CDN (pmndrs drei-assets
// on GitHub raw), which is flaky / rate-limited and 503s. A failed env map must
// NEVER crash the scene — wrap it so a load failure degrades to the scene's default
// lighting instead of white-screening the designer. Same props as <Environment>.
export function SafeEnvironment(props) {
  // ErrorBoundary OUTSIDE the Suspense: <Environment> suspends while loading the
  // HDR, and on a load REJECTION React unwinds to the Suspense and the error
  // propagates to the boundary ABOVE it — so the boundary must sit outside to
  // catch it (and the Suspense lets call sites without their own boundary, like
  // the off-screen thumbnail canvas, load it safely).
  return (
    <TextureErrorBoundary screen="Environment">
      <Suspense fallback={null}>
        <Environment {...props} />
      </Suspense>
    </TextureErrorBoundary>
  );
}
