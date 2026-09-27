import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Opening a rail submenu ──────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS HAD NO TEST AT ALL, WHICH IS WHY IT SHIPPED TWICE AND WHY A WRONG EXPLANATION OF IT STOOD
 * FOR DAYS. `RailSubmenu`, `openRailItem` and `navMenuId` appeared in zero test files. Every gate was
 * green throughout; the fault was only ever visible by driving a browser, and the diagnosis was only
 * settled by measuring hover and click separately.
 *
 * What went wrong: on a pointer that hovers, `onMouseEnter` opens the submenu BEFORE the click
 * lands. The click toggled, found it open, and closed it — so the first click appeared to do
 * nothing and the second "worked". Measured on the rail harness: hover alone → 2 items, first click
 * → 0, second click → 2. Orders behaved identically; it was never specific to Templates.
 *
 * ⚠️ AND THE CAUSE I FIRST GAVE WAS WRONG — the document `mousedown` handler. It is guarded by
 * `navMenuRef.current`, which is attached only while a menu is already open, so it cannot fire on a
 * first click. Pinned below so nobody re-derives the wrong answer from the same two symptoms.
 *
 * Source assertions: this lives inside a 14k-line component that imports three.js, and the decision
 * worth protecting is a CONDITION between two handlers rather than anything a render would show.
 */
const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

describe('hover reveals the submenu; a click must not un-reveal it', () => {
  /* Sandeep, choosing the behaviour: "for Templates when you hover it, pls show submenu. but for sub
     menu a click is needed to open." So hovering shows the choices, and clicking a CHOICE is what
     goes somewhere. A click on the parent must leave the list alone. */
  it('the click skips its toggle for a menu that hover opened', () => {
    expect(src).toMatch(/if \(hoverOpenedRef\.current !== id\) setNavMenuId\(o => \(o === id \? null : id\)\);/);
  });

  it('hover records which menu it opened', () => {
    expect(src).toMatch(/onHoverOpen=\{\(\) => \{ hoverOpenedRef\.current = id;/);
  });

  /* ⚠️ Cleared when the CLOSE fires, not on mouse-leave. The close runs on a 220ms timer, because
     the gap between the button and the menu is over neither element; clearing earlier would leave
     the ref stale for a pointer that left and came straight back, and the next click would close a
     menu it should have left open. */
  it('and clears it when the close actually fires', () => {
    expect(src).toMatch(/onHoverClose=\{\(\) => \{ hoverOpenedRef\.current = null;/);
  });
});

describe('touch keeps its toggle', () => {
  /* ⚠️ NOT AN OVERSIGHT — a phone has no pointer to move away, so tapping the parent again is the
     only way to dismiss the menu. The two surfaces are already distinguishable without sniffing
     pointer types: the desktop rail passes hover handlers and the mobile bar passes none, so
     `hoverOpenedRef` is never set there and the toggle survives untouched.

     Verified in a browser at the time: the phone's first tap opened the menu (2 items) both before
     and after this fix. */
  it('the mobile bar passes no hover handlers', () => {
    const bar = src.slice(src.indexOf("anchorStyle={{ top: 'auto'") - 600, src.indexOf("anchorStyle={{ top: 'auto'") + 400);
    expect(bar).not.toMatch(/onHoverOpen/);
    expect(bar).not.toMatch(/onHoverClose/);
  });
});

describe('the outside-click handler is not what closed it', () => {
  /* The wrong diagnosis, pinned so the guard is not "simplified" away by someone re-reading the
     same symptoms. `navMenuRef` is attached only while that menu is open — see the two call sites,
     `containerRef={navMenuId === id ? navMenuRef : null}` — so with no menu open `navMenuRef.current`
     is null, the condition short-circuits, and a first click reaches React untouched. */
  it('it only acts when a menu is already open', () => {
    expect(src).toMatch(/if \(navMenuRef\.current && !navMenuRef\.current\.contains\(e\.target\)\) setNavMenuId\(null\);/);
  });

  it('and the ref is attached only while that menu is open', () => {
    expect(src).toMatch(/containerRef=\{navMenuId === id \? navMenuRef : null\}/);
  });
});

describe('choosing an item is what goes somewhere', () => {
  /* The parent reveals; the item travels. A submenu entry is a destination, so it closes whatever
     was open first — without that, choosing Catalogue while Library was open drew the flyout
     (z-index 20) behind the docked page (300) and looked like a dead menu item. */
  it('a submenu choice leaves the open destination', () => {
    expect(src).toMatch(/function selectMenuItem\(item\) \{[\s\S]*?leaveOpenPanels\(\);[\s\S]*?item\.open\?\.\(\);/);
  });
});
