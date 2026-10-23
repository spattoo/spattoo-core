/* ── The in-page demo overlay: a cursor, a tap ripple and a zoom ─────────────────────────────────
 *
 * Everything here runs INSIDE the recorded page, because Playwright's video records the page and
 * nothing else — there is no OS cursor in the capture and no compositor to zoom with. Screen Studio
 * gives you both for free; a scripted recording has to draw them.
 *
 * Three decisions worth not re-litigating:
 *
 * ⚠️ THE CURSOR LIVES ON <html>, THE ZOOM LIVES ON <body>. A CSS transform on an element makes it
 * the containing block for its fixed-position descendants, so zooming <body> takes the whole app
 * with it — rail, panels, canvas — which is what we want. Putting the cursor inside that subtree
 * would scale the arrow itself and move it off the thing it is pointing at. On <html> it is
 * untouched by the zoom, and `getBoundingClientRect()` already reports POST-transform viewport
 * coordinates, so pointing at a zoomed element needs no maths of our own.
 *
 * ⚠️ THE CURSOR IS ANIMATED BY rAF, NOT BY A CSS TRANSITION. We need to know when the move has
 * finished so the click lands after it, and a transition only tells you via an event that does not
 * fire if the value did not change. An rAF loop that resolves a promise is exact and lets the
 * easing curve be ours.
 *
 * ⚠️ NOTHING HERE TAKES POINTER EVENTS. Every node is `pointer-events: none`, so the overlay can
 * never swallow the click it is supposed to be illustrating — the real click still goes through
 * Playwright's mouse, to the real element.
 */

export function installOverlay({ touch }) {
  const NS = '__spattooDemo';
  if (window[NS]) return true;

  const root = document.documentElement;
  const style = document.createElement('style');
  style.id = '__demo_style';
  style.textContent = `
    #__demo_cursor, #__demo_ripple { position: fixed; pointer-events: none; z-index: 2147483647;
      top: 0; left: 0; will-change: transform; }
    #__demo_cursor { width: 28px; height: 28px; margin: -2px 0 0 -2px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); opacity: 0; transition: opacity .25s ease; }
    #__demo_ripple { width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,.35) 45%, rgba(255,255,255,0) 70%);
      box-shadow: 0 0 0 2px rgba(255,255,255,.75) inset; opacity: 0; }
    /* The zoom. A transition rather than rAF: nothing waits on its exact end frame, and the
       compositor runs it on its own thread, which keeps the 3D canvas smooth while it moves. */
    body { transition: transform .75s cubic-bezier(.22,.61,.36,1); }
    @keyframes __demo_pop { 0% { transform: scale(.35); opacity: .95; } 100% { transform: scale(1.25); opacity: 0; } }
  `;
  root.appendChild(style);

  // A real pointer silhouette, not an emoji — this is UI chrome and rule 4 forbids pictographs.
  const cursor = document.createElement('div');
  cursor.id = '__demo_cursor';
  cursor.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28">
      <path d="M5 2.5 L5 19.2 L9.2 15.1 L12 21.5 L15 20.2 L12.2 14 L18 14 Z"
            fill="#fff" stroke="#1a1a1a" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const ripple = document.createElement('div');
  ripple.id = '__demo_ripple';
  root.appendChild(cursor);
  root.appendChild(ripple);

  const state = { x: innerWidth / 2, y: innerHeight / 2, scale: 1, touch: !!touch };
  const put = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
  put(cursor, state.x, state.y);

  // A phone has no cursor to show, so the arrow stays hidden and taps are drawn as ripples.
  if (!state.touch) cursor.style.opacity = '1';

  window[NS] = {
    state,
    /* Ease the pointer from where it is to (x, y) over `ms`. Resolves when it arrives, so the
       caller can click immediately afterwards and the two read as one gesture. */
    moveTo(x, y, ms) {
      return new Promise(done => {
        const sx = state.x, sy = state.y, t0 = performance.now();
        const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          state.x = sx + (x - sx) * k;
          state.y = sy + (y - sy) * k;
          put(cursor, state.x, state.y);
          if (state.touch) put(ripple, state.x, state.y);
          t < 1 ? requestAnimationFrame(step) : done();
        })(t0);
      });
    },
    /* The visible half of a click. The REAL click is Playwright's, fired by the driver right
       after this — so what is recorded and what actually happens cannot drift apart. */
    flash() {
      put(ripple, state.x, state.y);
      ripple.style.animation = 'none';
      void ripple.offsetWidth;                       // restart the animation on a repeat click
      ripple.style.animation = '__demo_pop .5s ease-out';
      return new Promise(r => setTimeout(r, 180));   // let the ripple be seen before the UI moves
    },
    /* Zoom toward a point given in VIEWPORT coordinates. Converted to page coordinates for
       transform-origin, because the origin is measured in the element's own untransformed box. */
    zoom(vx, vy, scale) {
      const px = (vx / state.scale) + scrollX;
      const py = (vy / state.scale) + scrollY;
      state.scale = scale;
      document.body.style.transformOrigin = `${px}px ${py}px`;
      document.body.style.transform = `scale(${scale})`;
      return new Promise(r => setTimeout(r, 800));
    },
    reset() {
      state.scale = 1;
      document.body.style.transform = 'scale(1)';
      return new Promise(r => setTimeout(r, 800));
    },
    show(on) { cursor.style.opacity = on && !state.touch ? '1' : '0'; },

    /* ── The spatula wipe ───────────────────────────────────────────────────────────────────────
     *
     * A scene change made with the app's own object: the rail's silhouette sweeps across the frame
     * like a spatula spreading icing, and the next shot is behind it.
     *
     * ⚠️ IT DRAWS THE SHIPPED OUTLINE, NOT A DRAWING OF IT. The `d` comes from `spatulaFramePath`
     * with the rail's own measured numbers, handed in by the driver — the same single source the
     * rail renders from and `dev/spatula-menu.html` tunes. CLAUDE.md states the rule for studios
     * and it is the same rule here: carrying a copy of a shape is how the copy drifts from the
     * thing it is supposed to be. If the rail is ever re-tuned, this transition follows it.
     *
     * ⚠️ `fillRule="evenodd"`, because the hang hole is a subpath of the same `d`. Without it the
     * wipe paints straight over the hole and stops being recognisable as a spatula at all —
     * spatulaPath.js warns about exactly this.
     */
    wipe({ d, viewBox, ms = 900, colour = '#141414', angle = -12 }) {
      return new Promise(done => {
        const host = document.createElement('div');
        host.style.cssText = `position:fixed; inset:0; pointer-events:none; z-index:2147483646;
                              overflow:hidden;`;
        // Tall and wide enough that the blade covers the frame corner-to-corner while tilted.
        const span = Math.hypot(innerWidth, innerHeight) * 1.25;
        host.innerHTML = `<svg viewBox="${viewBox}" preserveAspectRatio="none"
             style="position:absolute; top:50%; left:0; width:${span}px; height:${span}px;
                    transform-origin:center; will-change:transform;">
             <path d="${d}" fill="${colour}" fill-rule="evenodd"/></svg>`;
        const svg = host.firstChild;
        document.documentElement.appendChild(host);
        const from = -span * 1.1, to = innerWidth + span * 0.15;
        const t0 = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);          // easeOutCubic — a confident push
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          svg.style.transform = `translate(${from + (to - from) * k}px, -50%) rotate(${angle}deg)`;
          if (t < 1) requestAnimationFrame(step);
          else { host.remove(); done(); }
        })(t0);
      });
    },

    /* Half a wipe: sweep in and STOP, covering the frame. The driver changes the scene behind it
       and calls `uncover()`. Two halves rather than one call with a callback, because what happens
       between them is Playwright's work, not the page's. */
    cover({ d, viewBox, ms = 500, colour = '#141414', angle = -12 }) {
      return new Promise(done => {
        const host = document.createElement('div');
        host.id = '__demo_wipe';
        host.style.cssText = `position:fixed; inset:0; pointer-events:none; z-index:2147483646;
                              overflow:hidden;`;
        const span = Math.hypot(innerWidth, innerHeight) * 1.25;
        host.innerHTML = `<svg viewBox="${viewBox}" preserveAspectRatio="none"
             style="position:absolute; top:50%; left:0; width:${span}px; height:${span}px;
                    transform-origin:center; will-change:transform;">
             <path d="${d}" fill="${colour}" fill-rule="evenodd"/></svg>`;
        const svg = host.firstChild;
        document.documentElement.appendChild(host);
        // Far enough right that the BLADE — the wide end — is what covers the frame.
        const from = -span * 1.1, to = innerWidth - span * 0.42;
        const t0 = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          svg.style.transform = `translate(${from + (to - from) * k}px, -50%) rotate(${angle}deg)`;
          t < 1 ? requestAnimationFrame(step) : done();
        })(t0);
      });
    },
    uncover({ ms = 500, angle = -12 } = {}) {
      return new Promise(done => {
        const host = document.getElementById('__demo_wipe');
        if (!host) return done();
        const svg = host.firstChild;
        const span = Math.hypot(innerWidth, innerHeight) * 1.25;
        const from = innerWidth - span * 0.42, to = innerWidth + span * 0.15;
        const t0 = performance.now();
        const ease = t => t * t;                            // accelerate away, so it clears fast
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          svg.style.transform = `translate(${from + (to - from) * k}px, -50%) rotate(${angle}deg)`;
          if (t < 1) requestAnimationFrame(step);
          else { host.remove(); done(); }
        })(t0);
      });
    },
  };
  return true;
}
