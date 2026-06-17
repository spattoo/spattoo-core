import { Html } from '@react-three/drei';
import { useAnyLoading } from './loadingRegistry.js';

// ─────────────────────────────────────────────────────────────────────────────
// The ONE loading indicator for the whole designer — a pulsing cake glyph.
// Use it anywhere there's a wait, in either of two contexts:
//
//   • DOM (normal React tree, outside the R3F <Canvas>):
//       <CakeSpinner />            – the pulsing badge, drop into a centered box
//       <CakeSpinner label="…" />  – badge + caption
//       <CakeSpinnerFill label />  – absolute inset:0 wrapper that centres the badge
//
//   • In-scene (Suspense fallback INSIDE the 3D canvas):
//       <SceneLoader />            – the same badge via drei <Html>, rendered at the
//                                    suspended object's own position
//
// Single source of truth: the glyph, chip, and pulse live here only. The dark chip +
// light glyph reads on any background (cake, panel, white). Don't reimplement it elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

const PULSE = `@keyframes spattooCakePulse{0%,100%{opacity:.5}50%{opacity:1}}`;

function CakeGlyph({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="#e8e8ea" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2v2.3" />
      <circle cx="12" cy="2.4" r="0.6" fill="#e8e8ea" stroke="none" />
      <path d="M6 9.2c0-1 2.7-1.8 6-1.8s6 .8 6 1.8v1.8c0 1-2.7 1.8-6 1.8s-6-.8-6-1.8V9.2Z" />
      <path d="M4 14.6c0-1 3.6-1.8 8-1.8s8 .8 8 1.8v3.2c0 1-3.6 1.8-8 1.8s-8-.8-8-1.8v-3.2Z" />
    </svg>
  );
}

// The pulsing cake badge (DOM). `label` adds a caption beneath; `size` scales the glyph.
export function CakeSpinner({ size = 26, label }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      <style>{PULSE}</style>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size + 18, height: size + 18, borderRadius: 12,
        background: 'rgba(24,24,27,.72)', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        animation: 'spattooCakePulse 1.1s ease-in-out infinite',
      }}>
        <CakeGlyph size={size} />
      </div>
      {label && (
        <div style={{ fontSize: 12, color: '#666', fontFamily: "'Quicksand', sans-serif" }}>{label}</div>
      )}
    </div>
  );
}

// Fills its positioned parent and centres the badge — for overlay-style fallbacks.
export function CakeSpinnerFill({ label }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CakeSpinner label={label} />
    </div>
  );
}

// In-scene fallback: the same badge projected to the suspended object's screen position.
export function SceneLoader({ size = 26 }) {
  return (
    <Html center style={{ pointerEvents: 'none' }} zIndexRange={[50, 0]}>
      <CakeSpinner size={size} />
    </Html>
  );
}

// ONE page-level loader for all decorations: shows a single centered badge while any
// element (sticker GLB/texture, cream-pen stamp) is loading — never one badge per element.
// Drop it into a position:relative container (e.g. the canvas area). See loadingRegistry.
export function DecorLoadingOverlay() {
  return useAnyLoading() ? <CakeSpinnerFill /> : null;
}
