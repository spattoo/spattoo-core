import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { topperSources } from '../src/chefsdesk/a4/topperSource.js';
import { TOPPER_PRESETS } from '../src/designer/topper/topperPresets.js';

/* What a card topper actually looks like ON THE PRINT SHEET.
 *
 * ⚠️ The unit tests assert the drawing CALLS — the fill order, the even-odd rule, that y is flipped.
 * None of that proves the picture. This draws every preset through the real source, at the size a
 * sheet would, so the printed artwork can be looked at.
 */
function Sheet() {
  const ref = useRef(null);
  useEffect(() => {
    (async () => {
      const ctx = ref.current.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, ref.current.width, ref.current.height);
      let x = 20;
      for (const pre of TOPPER_PRESETS) {
        const [src] = await topperSources({ id: pre.key, name: pre.label, payload: { v: 1, objects: pre.objects } });
        if (!src) continue;
        const h = 150, w = h * src.aspect;
        // A hairline box: the item's own bounds on the sheet, so a topper drawn outside them shows.
        ctx.strokeStyle = '#d9d4cf'; ctx.lineWidth = 1;
        ctx.strokeRect(x, 30, w, h);
        src.draw(ctx, x, 30, w, h);
        ctx.fillStyle = '#5B6B60'; ctx.font = '12px system-ui';
        ctx.fillText(src.name, x, 200);
        x += w + 26;
      }
      window.__drawn = true;
    })();
  }, []);
  return <canvas ref={ref} width={1500} height={230} style={{ background: '#fff' }} />;
}

createRoot(document.getElementById('root')).render(<Sheet />);
