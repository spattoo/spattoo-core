import { Component } from 'react';

// Render-time error boundary for texture/GLB load failures inside an R3F tree. If a child throws
// (e.g. a texture fails to load — a CORS-poisoned cache entry, a 404, a tainted image), render
// nothing instead of letting the throw bubble up and crash the whole <Canvas>. Shared by the
// on-cake sticker render (CakeCanvas) and the placement preview (TopperPreview) — one boundary,
// both call sites, so a single bad asset can never white-screen the designer.
export class TextureErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? null : this.props.children; }
}
