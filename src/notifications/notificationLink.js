// ── What a notification link asks the baker app to open ─────────────────────────────────────────
//
// The API hands over a PATH (spattoo-api src/lib/notificationLink.js): `/?order=<id>`,
// `/?panel=orders`, `/?panel=billing`. The baker app is one page — the order list is a panel in the
// designer, not a screen you can navigate to — so a link names WHAT TO OPEN, not where to go.
//
// ⚠️ READ IN TWO PLACES, AND IT MUST MEAN THE SAME IN BOTH.
//   1. A tap in the notification bell (CakeDesigner → openNotificationLink).
//   2. The page LOADING from a link that came from outside the app — a WhatsApp template's button, a
//      push opened while the app was closed. The host reads the address and passes it in as
//      `initialLink`. Until that existed nothing read `?panel=orders` on load, and a baker who tapped
//      "View Orders" in WhatsApp landed on an empty cake instead of their orders.

export const LINK_PARAMS = ['order', 'panel'];

/**
 * What a link asks to open, or null when it asks for nothing this app knows.
 *
 * @param {string|null} link  a path or query: "/?order=123", "?panel=orders", "https://…/?panel=billing"
 * @returns {{ open: 'orders', orderId: string|null } | { open: 'billing', orderId: null } | null}
 *   null for an unknown panel: that is a newer API than this bundle, and doing nothing is better than
 *   guessing at a screen.
 */
export function parseNotificationLink(link) {
  const query = (String(link ?? '').split('?')[1] ?? '').split('#')[0];
  const params = new URLSearchParams(query);
  const orderId = params.get('order') || null;
  const panel = params.get('panel') || null;
  if (orderId || panel === 'orders') return { open: 'orders', orderId };
  if (panel === 'billing') return { open: 'billing', orderId: null };
  return null;
}

/**
 * The page address with the link's own parameters taken out, so a refresh does not open the panel
 * again. Everything else in the address (?session=, ?signup=, the hash) is left exactly as it was.
 */
export function withoutLinkParams(pathname, search = '', hash = '') {
  const params = new URLSearchParams(search);
  LINK_PARAMS.forEach(name => params.delete(name));
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}
