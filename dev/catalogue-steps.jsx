/* The empty-catalogue guidance, in both of the states it has.
 *
 * ⚠️ DRAWN ON THE RAIL'S OWN DARK GROUND, deliberately. The flyout sits at RAIL_FLYOUT_LEFT so the
 * rail overlaps its left edge — the surface this block paints over is near-black for the first
 * ~30px, which is the exact reason the help line above it had to grow a background (measured at
 * 1.00:1 before that). A harness on white would have proved nothing about the only case that broke.
 */
import { createRoot } from 'react-dom/client';
import { CatalogueStoreSteps } from '../src/designer/CakeDesigner.jsx';

function Harness() {
  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start' }}>
      {[false, true].map(published => (
        <div key={String(published)} style={{ width: 300 }}>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
            storefront_published = {String(published)}
          </div>
          {/* 10px of left padding, as the flyout gives it. */}
          <div style={{ background: 'rgba(255,255,255,0.6)', padding: 10, borderRadius: 10 }}>
            <CatalogueStoreSteps published={published} onOpenStore={() => console.log('open store')} />
          </div>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
