import { createRoot } from 'react-dom/client';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './scene.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { angleByKey, anglePosition, PHOTO_OPENS_AT, DEFAULT_ANGLE } from '../src/designer/photo/photoAngles.js';

/* ── Which angle should a photo OPEN at? ─────────────────────────────────────────────────────────
 *
 * The panel opened at three-quarter, so every picture started ~38° off the front — and a name piped
 * across the front of a cake ran out of frame. Reported against the reel, whose preview stands
 * face-on. `?angle=front|three-quarter|side|above` renders the real presets through the real scene,
 * on a cake WITH WRITING ON THE FRONT, because that is the case the argument is about: a bare cake
 * looks fine from anywhere and proves nothing.
 */
const q = new URLSearchParams(location.search);
const ANGLE = q.get('angle') ?? PHOTO_OPENS_AT;

const design = {
  tiers: [{
    shape: 'round', color: '#E6C9EC', frostingType: 'buttercream', frostingStyle: 'smooth',
    topPipings: [], bottomPipings: [], creamLayers: [],
  }],
  texts: [], ages: [], stickers: [], piping: [], garnishes: [], toppers: [],
  // The whole point: a message across the FRONT. At three-quarter its left half walks off the frame.
  writings: [{
    id: 'w1', style: 'acrylic', text: 'Happy Birthday', font: 'parisienne',
    surface: 'side', sideY: 1.0, fit: 0.9, acrylicFinish: 'gold', color: '#ffffff',
  }],
};

/* The camera the PANEL would set — `anglePosition` at the preset, the same call PhotoOptions makes
   through onAngle. Distance preserved from where the designer stands, as a preset does. */
function Stand() {
  const { camera } = useThree();
  const a = angleByKey(ANGLE);
  // The same aim TakeDirector falls back to, so the two paths are compared at one target rather
  // than at two — the whole question is the ANGLE, and a different aim would move the answer.
  const t = new THREE.Vector3(0, 1.55, 0);
  const p = anglePosition(t, 8.2, a.theta, a.phi);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(t);
  camera.updateProjectionMatrix();
  return null;
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', position: 'relative' }}>
    <CakePreview design={design} shadows autoRotate={false}><Stand /></CakePreview>
    <div style={{ position: 'absolute', left: 12, top: 12, fontFamily: 'system-ui', fontSize: 12,
                  fontWeight: 800, color: '#2C2A26', background: '#fff', padding: '4px 9px',
                  borderRadius: 7, border: '1px solid #E8E4DC' }}>
      {ANGLE}{ANGLE === PHOTO_OPENS_AT ? ' — opens here now' : ANGLE === DEFAULT_ANGLE ? ' — opened here before' : ''}
    </div>
  </div>,
);
