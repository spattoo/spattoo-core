/* The Store menu, as the rail draws it.
 *
 * ⚠️ ON THE RAIL'S OWN NEAR-BLACK GROUND. The menu is drawn over the dark blade, and an icon
 * inheriting `currentColor` there is the whole question — a glyph that reads on white can vanish
 * here, which is the same class of mistake the catalogue help line made (measured at 1.00:1).
 *
 * The real menu is built inside CakeDesigner behind a baker sign-in, so this reproduces the ITEM
 * ROW rather than reaching for the component: what is being judged is whether an icon beside a
 * label is legible and aligned at this size.
 */
import { createRoot } from 'react-dom/client';
import { ShareIcon } from '../src/shared/icons.jsx';

// Mirrors s.railMenuItemWithIcon + RAIL_MENU.item.
const row = {
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  padding: '8px 14px', fontSize: 13, fontFamily: "'Quicksand',sans-serif",
  color: 'rgba(255,255,255,0.86)', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
};
const badge = { fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                background: 'rgba(201,162,39,0.22)', color: '#E8C76A' };

function Harness() {
  return (
    <div style={{ padding: 28, display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      <div style={{ width: 230, background: '#1C1C1F', borderRadius: 12, padding: '6px 0',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        {[
          { id: 'a', label: 'Store Settings' },
          { id: 'b', label: 'Flavours', badge: 'all on' },
          { id: 'c', label: 'Share my store', icon: <ShareIcon size={15} /> },
        ].map(it => (
          <button key={it.id} style={row}>
            <span aria-hidden style={{ width: 15, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {it.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {it.badge && <span style={badge}>{it.badge}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
