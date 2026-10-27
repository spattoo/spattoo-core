import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The shop became a destination ───────────────────────────────────────────────────────────────
 *
 * Sandeep, 2026-10-03: "store is an important part of spattoo. and setting a store needs to stand
 * individual under menu. not hidden under the setting tab. Lets make the 'share' button to 'Store'
 * with a store icon. and whatever we have under settings for a store, will be moved under 'store'
 * now. setting would still hold - order and delivery, your agreement, 'delete my account' - should
 * go to my account. branding option should also be under store"
 *
 * Three surfaces moved at once, and the risk in that is not a crash — it is a block that ends up on
 * BOTH pages, or on NEITHER. Either builds, and no existing gate can see it.
 *
 * ⚠️ SOURCE ASSERTIONS, which is weaker than opening the screens, and `dev/store-settings.jsx` is
 * the other half: it mounts the real SettingsPanel at each scope against a stub so the section
 * headings can be read back. What is pinned here is the ROUTING — which block belongs to which
 * page, and which menu opens it — because that is the decision, and a rewrite can satisfy every
 * render test while quietly moving a section back.
 */
const designer = readFileSync(new URL('../designer/CakeDesigner.jsx', import.meta.url), 'utf8');
const panel    = readFileSync(new URL('./SettingsPanel.jsx', import.meta.url), 'utf8');
const privacy  = readFileSync(new URL('./PrivacyDataPanel.jsx', import.meta.url), 'utf8');
const orders   = readFileSync(new URL('../orders/OrdersPanel.jsx', import.meta.url), 'utf8');

describe('the rail', () => {
  it('has a Store item where Share used to be', () => {
    expect(designer).toMatch(/id: 'store', label: 'Store', icon: <StoreIcon/);
    // Share did not vanish — it became an item inside Store, beside Publish.
    expect(designer).toMatch(/id: 'store-share', label: 'Share my store'/);
    expect(designer).not.toMatch(/id: 'share', label: 'Share'/);
  });

  it('opens the shop, flavours and sharing from that one item', () => {
    expect(designer).toMatch(/id: 'store-settings'.*setSettingsScope\('store'\)/);
    expect(designer).toMatch(/id: 'store-flavours', label: 'Flavours'/);
  });

  // ⚠️ The rail memo's own comment: a value read inside it and missing from the dep list ships an
  // item that can NEVER appear, with every gate green. That is how the reel recorder shipped
  // invisible. The Store menu reads four values the previous list did not carry.
  it('declares what the Store menu reads', () => {
    const deps = designer.match(/\.filter\(item => hasCap\(item\.requires\)\), \[([^\]]*)\]/)?.[1] ?? '';
    for (const dep of ['settingsScope', 'flavoursPanelOpen', 'flavoursUncurated', 'onShareStore']) {
      expect(deps, `rail memo must depend on ${dep}`).toContain(dep);
    }
  });

  /* ⚠️ STORE WAS DEAD ON EVERY PHONE FOR A DAY. It gained a submenu on 2026-10-03 and is not in
     MOBILE_PRIMARY, so it landed in the More sheet as a tile — and the tile calls
     `openRailItem(id)` with NO menu, which the handler has no branch for. The tap was swallowed.
     A green suite, every gate passing, and the only signal was a dev console warning nobody was
     looking at.

     The sheet now draws a menu-carrying item as rows under a heading, the shape Chef's Desk and
     Settings always used there. These two filters are complements, so every secondary item reaches
     exactly one renderer by construction — which is what replaced the warning. */
  it('renders a stranded menu rather than swallowing the tap', () => {
    expect(designer).toMatch(/mobileSecondary\.filter\(i => !i\.menu\)\.map/);
    expect(designer).toMatch(/mobileSecondary\.filter\(i => i\.menu\)\.map/);
  });

  /* ── Where the calendar lives, and the two asks that pulled it both ways ───────────────────────
   *
   * It began as a view inside the Orders submenu. Then: *"calendar is an important feature and it
   * deserves an independant menu"* — so it became a rail destination of its own, directly below
   * Orders.
   *
   * ⚠️ THAT MADE IT LESS VISIBLE ON A PHONE, NOT MORE, and the reason is `MOBILE_PRIMARY`. The
   * strip holds six slots (new · elements · templates · orders · dashboard · More) and a top-level
   * item that is not in that list falls through to the More SHEET. So the independent menu bought
   * prominence on the rail and spent it on the phone: *"in mobile view, can we move the calendar
   * option as a sub menu under orders? it is in the more option now and not very much visible. this
   * is a very helpful feature."*
   *
   * Orders IS in MOBILE_PRIMARY, so under it the calendar is one tap from the bar instead of two
   * through More. Measured in the harness at 390px: tapping Orders draws New Order · Orders ·
   * Calendar in the strip, and Calendar is gone from the More sheet.
   *
   * ⚠️ STILL ONE DOOR. The rule the independent item was given has not changed — "a second door to
   * the same room is worse than a longer walk to one" — so it moved rather than being copied, and
   * the standalone rail item is gone from the desktop rail too. The alternative that keeps both
   * asks is a strip SLOT for the calendar, which costs whichever item it displaces; that is a
   * product call, not a refactor. */
  it('puts Calendar under Orders, and keeps only one door to it', () => {
    expect(designer).toMatch(/id: 'orders-calendar', label: 'Calendar',  view: 'calendar'/);
    // Moved, not duplicated: no standalone rail destination beside the submenu entry.
    expect(designer).not.toMatch(/id: 'calendar', label: 'Calendar', icon: <CalendarIcon/);
    expect(designer).not.toMatch(/if \(id === 'calendar'\)\s+openOrdersPanel/);
  });

  /* ⚠️ GATED ON THE HOST METHOD, not the capability alone — the gate moved in with the item.
     OrdersPanel decides a calendar exists at all from
     `typeof apiClient?.fetchOrdersCalendar === 'function'` and silently falls back to the list, so
     an ungated entry would open the list while saying Calendar. */
  it('appears only where a calendar can actually be drawn', () => {
    expect(designer).toMatch(/\.filter\(item => item\.view !== 'calendar' \|\| !!apiClient\?\.fetchOrdersCalendar\)/);
    const deps = designer.match(/\.filter\(item => hasCap\(item\.requires\)\), \[([^\]]*)\]/)?.[1] ?? '';
    expect(deps, 'the rail memo must depend on apiClient now that it gates an item').toContain('apiClient');
  });

  /* ⚠️ THE LIT ROW FOLLOWS THE PANEL, not the request. OrdersPanel owns `view` and its own toggle
     changes it without telling anyone — so lighting from `ordersInitialView` would be correct until
     the baker pressed that toggle, then quietly wrong.
     ⚠️ AND IT HAS TO SAY *WHICH* VIEW. With one view item in the menu, "the panel is open" read the
     same as "this row is where you are"; with two, both rows lit at once and the menu stopped
     answering the question it exists to answer. */
  it('lights whichever view is actually on screen', () => {
    expect(designer).toMatch(/active: ordersPanelOpen && ordersView === item\.view/);
    expect(designer).toMatch(/onViewChange=\{setOrdersView\}/);
    expect(orders).toMatch(/useEffect\(\(\) => \{ onViewChange\?\.\(view\); \}, \[view, onViewChange\]\)/);
  });

  it('leaves Settings with what is about the app, not the shop', () => {
    expect(designer).toMatch(/id: 'orders-delivery', label: 'Orders & Delivery'/);
    expect(designer).not.toMatch(/label: 'Store Settings', open: \(\) => setSettingsPanelOpen/);
  });

  // One state, not two booleans: both scopes are the same docked page, so a second one would render
  // over the first with no way back.
  it('cannot open both pages at once', () => {
    expect(designer).toMatch(/const \[settingsScope,\s+setSettingsScope\]\s+= useState\(null\)/);
    expect(designer).toMatch(/const settingsPanelOpen = settingsScope !== null;/);
  });
});

describe('the split itself', () => {
  it('routes each block to exactly one page', () => {
    expect(panel).toMatch(/const showStore\s+= scope === 'all' \|\| scope === 'store';/);
    expect(panel).toMatch(/const showSettings = scope === 'all' \|\| scope === 'settings';/);
  });

  // The header described the page it was on. After the split it described the other one.
  it('says what each page is for', () => {
    expect(panel).toMatch(/scope === 'store'\s+\? 'How your shop looks and when it is open'/);
    // ...and stopped claiming agreements once they left for My Account.
    expect(panel).not.toMatch(/what you have agreed to/);
  });

  /* ⚠️ THE REASON THIS SPLIT NEEDED A SERVER CHANGE. `bakers.settings` is ONE jsonb column and both
     halves write into it — store hours from one page, lead time and delivery from the other. PUT
     /api/baker/settings took the body verbatim, so whichever page saved last would have erased the
     other's keys, silently. spattoo-api merges now (check:settings-merge). This asserts the comment
     survives, because the next person to trim what a page sends needs to meet it. */
  it('records why trimming a payload is dangerous', () => {
    expect(panel).toMatch(/THE SAVE IS SAFE BECAUSE THE SERVER MERGES NOW/);
  });
});

describe('your agreements and closing your account', () => {
  /* Both halves of the old Privacy & Data screen are on My Account. The consent trail went there on
     a second pass: it had landed under a Settings entry called "Orders & Delivery", and Sandeep
     called it — "'Your agreements' does not seem to be correct under 'order and delivery'". */
  it('are both on My Account, and neither is in Settings', () => {
    expect(designer).toMatch(/<PrivacyDataSection apiClient=\{apiClient\} show=\{canDelete \? 'all' : 'consents'\} \/>/);
    const panelCode = panel
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(panelCode).not.toMatch(/PrivacyDataSection/);
  });

  /* ⚠️ THE CAPABILITY PICKS `show`, it does not hide the block. Erasure is owner-only because the
     route is requireCapability('account:delete') and a control that could only ever 403 is worse
     than none — but gating the WHOLE section on it would take the agreements away from staff who
     could read them yesterday. */
  it('gate erasure without taking the agreements from staff', () => {
    expect(designer).toMatch(/canDelete=\{hasCap\('account:delete'\)\}/);
    expect(designer).toMatch(/show=\{canDelete \? 'all' : 'consents'\}/);
  });

  // The section calls all three fetches unguarded inside one Promise.all, so a host missing any of
  // them throws before the per-promise catch can see it.
  it('stay absent on a host that cannot serve them', () => {
    expect(designer).toMatch(/const privacyReady = !!\(apiClient\?\.fetchConsentHistory && apiClient\?\.fetchLegalCurrent && apiClient\?\.fetchDeletionStatus\)/);
  });

  // One component, three blocks, two screens — splitting the FILE would have duplicated the fetches
  // and the busy/error state, which is the copy that gets a fix and the copy that does not.
  it('is still the same component, filtered', () => {
    expect(privacy).toMatch(/const showConsents = show === 'all' \|\| show === 'consents';/);
    expect(privacy).toMatch(/const showDeletion = show === 'all' \|\| show === 'deletion';/);
  });

  // A locked-out baker reaches it through the lapsed gate, which needs BOTH halves and so passes no
  // `show` at all. If that ever starts filtering, erasure becomes unreachable for the one person
  // most likely to want it.
  it('stays whole on the lapsed gate', () => {
    expect(designer).toMatch(/title="Privacy & Data" width=\{520\} flow="block">\s*\n\s*<PrivacyDataSection apiClient=\{apiClient\} \/>/);
  });
});

describe('a menu item can carry an icon', () => {
  /* A menu item is drawn in three places — RailSubmenu, the desktop rail menu and the mobile More
     sheet — and they were three copies of the same four lines, which is how `badge` ended up
     supported in two of them and not the third. One component now, so an item cannot grow a mark
     that shows on a laptop and not on a phone. */
  it('is one row component, used by every menu', () => {
    expect(designer).toMatch(/function MenuItemRow\(\{ item, gutter, style, onClick, role \}\)/);
    expect((designer.match(/<MenuItemRow /g) ?? []).length).toBe(4);
  });

  /* ⚠️ THE GUTTER IS THE POINT. Giving ONE item an icon indents only that item — "Share my store"
     sat 72px right of "Store Settings" above it, because the others had nothing in the slot. The
     column is reserved for every item in a menu that has any icon, which is a fact about the LIST,
     so a row cannot decide it alone. Caught in a harness on the rail's own ground; invisible in the
     source. */
  it('reserves the icon column for the whole menu, or for none of it', () => {
    expect(designer).toMatch(/const menuHasIcons = items => \(items \?\? \[\]\)\.some\(i => i\.icon\)/);
    expect((designer.match(/gutter=\{menuHasIcons\(/g) ?? []).length).toBe(4);
  });

  it('and Share kept the mark it had as a rail item', () => {
    expect(designer).toMatch(/label: 'Share my store', icon: <ShareIcon size=\{15\} \/>/);
  });
});

describe('where the catalogue goes', () => {
  /* ⚠️ `templates` IS the catalogue (loadTemplates: "An empty array now means the catalogue is
     empty"), so `templates.length === 0` is the state EVERY new baker opens. It read "No templates
     yet" — a fact with nothing to do about it, and no mention of the storefront the shelf feeds.
     Sandeep: "for a new baker, he does not know where this catalogue goes." */
  it('gives a new baker something to do, not a statement of fact', () => {
    expect(designer).toMatch(/\? <CatalogueStoreSteps/);
    // The bare dead end must not come back for somebody who can act on it.
    expect(designer).not.toMatch(/templates\.length === 0\s*\n\s*\? 'No templates yet'/);
  });

  /* ⚠️ THE SCREEN CLAIMED SOMETHING IT NEVER CHECKED: "Your customers can see your catalogue" is
     true only once the storefront is published, and false for exactly the new baker it is written
     for. The claim is now paired with the condition it depends on. */
  it('only promises customers can see it when the shop is live', () => {
    expect(designer).toMatch(/bakerData\?\.storefront_published === false && hasCap\('store:manage'\)/);
    expect(designer).toMatch(/Publish it in Store/);
  });

  /* ⚠️ DICTATED COPY. He gave this sentence and has already had to restore it once (2026-09-28)
     after it was paraphrased. The publish line is an ADDITION beneath it, never an edit to it. */
  it('leaves the dictated sentence exactly as given', () => {
    const sentence = 'Create your catalogue by selecting cakes from Library or upload your own. Your customers can see your catalogue.';
    expect(designer.split(sentence).length - 1).toBeGreaterThanOrEqual(1);
  });
});
