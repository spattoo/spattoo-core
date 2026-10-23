/* ── Driving a demo recording ────────────────────────────────────────────────────────────────────
 *
 * A thin wrapper over Playwright that makes a scripted run LOOK like someone using the app: the
 * pointer travels to a control before it is pressed, the press leaves a mark, and the view zooms
 * toward what is being explained. `.pw/reel.mjs` does the same job for the cake itself — a move no
 * hand can repeat, run identically every time.
 *
 *   import { openDemo } from './driver.mjs';
 *   const d = await openDemo(page, { touch: false });
 *   await d.click('Decorations');
 *   await d.zoomOn('Decorations', 1.6); await d.hold(1500); await d.zoomOut();
 *
 * ⚠️ THE DRAWN CLICK AND THE REAL CLICK ARE THE SAME EVENT, IN ORDER. The overlay only draws; the
 * click is Playwright's own mouse at the same coordinates, fired immediately after the ripple. A
 * demo that faked the click would record a video of something the app never did.
 *
 * ⚠️ COORDINATES ARE READ AFTER THE ZOOM, NEVER BEFORE. `boundingBox()` reports post-transform
 * viewport coordinates, so a control measured while zoomed is where it appears on screen. Caching a
 * box across a zoom is how a cursor ends up pointing at nothing.
 *
 * ⚠️ LABELS, NOT SELECTORS, FOR NAV. The phone rail says "Decor" where the desktop says
 * "Decorations", and five destinations live behind "More" at 390px — measured, both widths. `find`
 * matches on visible text so one script serves both, and `openNav` adds the More step when it has
 * to. A script written against exact text works on one width and silently misses on the other.
 */

const EASE_MS = 650;      // how long the pointer takes to cross; slower reads as deliberate
const SETTLE  = 450;      // after a click, before the next move — lets the UI land

export async function openDemo(page, { touch = false } = {}) {
  const { installOverlay } = await import('./overlay.mjs');
  await page.evaluate(installOverlay, { touch });

  const api = {
    touch,

    /* Find a clickable by its VISIBLE text, preferring an exact match so "Orders" does not land on
       "New Order". Returns a Locator, or null when this width does not show it. */
    async find(label) {
      for (const re of [new RegExp(`^\\s*${label}\\s*$`, 'i'), new RegExp(label, 'i')]) {
        const loc = page.locator('button, a, [role=button]').filter({ hasText: re });
        const n = await loc.count();
        for (let i = 0; i < n; i++) {
          const one = loc.nth(i);
          if (await one.isVisible().catch(() => false)) return one;
        }
      }
      return null;
    },

    /* Move the drawn pointer onto a control and stop there. */
    async moveTo(target) {
      const loc = typeof target === 'string' ? await api.find(target) : target;
      if (!loc) throw new Error(`demo: nothing visible matching "${target}"`);
      const box = await loc.boundingBox();
      if (!box) throw new Error(`demo: "${target}" has no box (off screen?)`);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.evaluate(([x, y, ms]) => window.__spattooDemo.moveTo(x, y, ms), [x, y, EASE_MS]);
      return { x, y, loc };
    },

    /* Move, mark, then really click — in that order. */
    async click(target, { settle = SETTLE } = {}) {
      const { x, y } = await api.moveTo(target);
      await page.evaluate(() => window.__spattooDemo.flash());
      await page.mouse.click(x, y);
      await page.waitForTimeout(settle);
    },

    /* Open a rail destination at either width. On a phone the strip holds five items and the rest
       are inside More, so this tries the strip first and falls back to opening More. */
    async openNav(label, { alt = null } = {}) {
      const direct = await api.find(label) ?? (alt ? await api.find(alt) : null);
      if (direct) return api.click(direct);
      const more = await api.find('More');
      if (!more) throw new Error(`demo: "${label}" is not on screen and there is no More menu`);
      await api.click(more);
      const inSheet = await api.find(label) ?? (alt ? await api.find(alt) : null);
      if (!inSheet) throw new Error(`demo: "${label}" is not in the More sheet either`);
      return api.click(inSheet);
    },

    /* Push in on a control so a viewer can read it.
     *
     * ⚠️ A ZOOM THAT DOES NOT FIT ITS TARGET IS WORSE THAN NO ZOOM. 1.7× on a 1280px desktop frames
     * a rail label nicely; the same 1.7× on a 405px phone put half the tile off the left edge —
     * recorded, looked at, and unusable. So the scale DEFAULTS BY VIEWPORT and is then reduced
     * until the target actually fits, rather than trusting a number chosen on one width.
     *
     * ⚠️ THE ORIGIN IS CLAMPED, SO THE PUSH-IN CANNOT WALK OFF THE PAGE. Scaling about a point near
     * an edge throws everything beyond it out of frame. `originRange` solves, for one axis, the set
     * of origins that keep the target inside the viewport with a margin; the wanted origin is then
     * clamped into it. Both axes must have a solution or the scale comes down a notch.
     *
     * ⚠️ THE POINTER ARRIVES AFTER THE ZOOM, NOT BEFORE. Its box is re-measured once the transform
     * has settled — `boundingBox()` reports post-transform coordinates — so the arrow lands on the
     * control wherever the push-in left it. Moving first and zooming about the cursor also works,
     * but only while the origin needs no clamping, and the clamp is what makes this safe at 405px.
     */
    async zoomOn(target, scale = null, { margin = 20, move = true } = {}) {
      const loc = typeof target === 'string' ? await api.find(target) : target;
      if (!loc) throw new Error(`demo: cannot zoom on "${target}" — not visible`);
      const vp = page.viewportSize();
      const box = await loc.boundingBox();

      // Origins (in page coords) that keep [a, a+len] inside [margin, V-margin] at this scale.
      const originRange = (s, a, len, V, m) => {
        const lo = ((a + len) * s - V + m) / (s - 1);
        const hi = (a * s - m) / (s - 1);
        return lo <= hi ? [lo, hi] : null;
      };
      const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

      let s = scale ?? (vp.width < 700 ? 1.25 : 1.6);
      let rx = null, ry = null;
      while (s > 1.04) {
        rx = originRange(s, box.x, box.width, vp.width, margin);
        ry = originRange(s, box.y, box.height, vp.height, margin);
        if (rx && ry) break;
        s = Math.round((s - 0.05) * 100) / 100;
      }
      if (!rx || !ry) return;                       // nothing fits — leave the view alone

      const ox = clamp(box.x + box.width / 2, rx);
      const oy = clamp(box.y + box.height / 2, ry);
      await page.evaluate(([x, y, k]) => window.__spattooDemo.zoom(x, y, k), [ox, oy, s]);
      if (move) await api.moveTo(loc);              // re-measured post-transform
    },

    async zoomOut() { await page.evaluate(() => window.__spattooDemo.reset()); },

    async hold(ms) { await page.waitForTimeout(ms); },
    async showCursor(on) { await page.evaluate(v => window.__spattooDemo.show(v), on); },
  };
  return api;
}

/* The two shapes every product video is cut in. The phone one is already vertical, so the same
   run yields a Shorts/Reels cut; 405×720 is exact 9:16 where 390×844 is slightly taller. */
export const SHAPES = {
  desktop: { width: 1280, height: 800 },
  phone:   { width: 405,  height: 720 },
};
