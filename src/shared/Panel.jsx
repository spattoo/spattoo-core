import { useEffect } from 'react';

// ── The one panel shell ─────────────────────────────────────────────────────────────────────────
// Twelve files each defined their own overlay, and they had nothing in common. Five different
// scrims — OrderModal's is maroon at 22%, the credits panel's near-black-green at 38%. Ten border
// radii across the app. And z-indexes of 100 / 400 / 1000 / 3000 chosen independently, so which
// panel wins when two are open is whatever the numbers happened to be rather than a decision.
//
// This is the single definition. A caller supplies a title and a body; the scrim, the surface, the
// header, the close button, scrolling, Esc and backdrop-click all happen here. Restyling every
// panel to LOOK alike without this would leave twelve places to keep in sync, and they would drift
// again — the disparity is a structural problem wearing a visual costume.
//
// The responsive behaviour is OrderModal's, which was the best in the app and is now everyone's: a
// centred dialog on desktop, a bottom sheet with a drag handle on mobile. The colours are the
// credits panel's green set, which was the most developed — the maroon scrim was the outlier, and
// green is what the rest of the baker app already speaks.

// One scale, named, so stacking is decided rather than discovered. A popover opened FROM a panel
// must sit above it; a toast above both.
export const Z = { panel: 1000, popover: 1100, toast: 1200 };

export const PANEL = {
  font:    "'Quicksand', sans-serif",
  scrim:   'rgba(20, 24, 21, 0.42)',
  surface: '#FFFFFF',
  radius:  18,
  shadow:  '0 18px 48px rgba(20, 24, 21, 0.22)',
  tint:    '#F7FAF8',   // section blocks and the header band
  line:    '#E8EFE9',   // block borders, header rule
  hair:    '#F1F5F2',   // row separators
  ink:     '#2C4433',   // headings and figures
  body:    '#4A5D51',   // body copy
  muted:   '#9BB5A2',   // labels, secondary
};

// Injected once per mount rather than per panel — three copies of these keyframes already existed
// inside OrderModal alone.
const PANEL_CSS = `
  @keyframes spattooPanelUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  @keyframes spattooPanelIn { from { opacity: 0; transform: scale(.98) } to { opacity: 1; transform: none } }
  .spattoo-panel ::placeholder { color: ${PANEL.muted}; opacity: 1; }
  .spattoo-panel-body::-webkit-scrollbar { width: 10px; }
  .spattoo-panel-body::-webkit-scrollbar-thumb { background: ${PANEL.line}; border-radius: 99px;
    border: 3px solid ${PANEL.surface}; }
`;

const overlayStyle = (isMobile) => ({
  position: 'fixed', inset: 0, zIndex: Z.panel,
  background: PANEL.scrim,
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  display: 'flex', justifyContent: 'center',
  alignItems: isMobile ? 'flex-end' : 'center',
  padding: isMobile ? 0 : 16,
  fontFamily: PANEL.font,
});

const sheetStyle = (isMobile, width) => ({
  background: PANEL.surface,
  fontFamily: PANEL.font,
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',                       // so the header band's corners are clipped, not squared
  ...(isMobile
    ? { width: '100%', maxHeight: '92vh', borderRadius: `${PANEL.radius}px ${PANEL.radius}px 0 0`,
        boxShadow: '0 -4px 40px rgba(20,24,21,0.20)',
        animation: 'spattooPanelUp 0.28s cubic-bezier(0.32,0.72,0,1)', paddingTop: 8 }
    : { width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)',
        borderRadius: PANEL.radius, boxShadow: PANEL.shadow,
        animation: 'spattooPanelIn 0.18s cubic-bezier(0.2,0.7,0.3,1)' }),
});

const grab = { width: 36, height: 4, borderRadius: 2, background: '#D8DCD8',
               margin: '0 auto 10px', flexShrink: 0 };

// The header is a tinted band, not more white. It gives a panel a spine — the thing every one of
// these was missing — and echoes the storefront's tinted-band motif without borrowing its colour.
const headStyle = (isMobile) => ({
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
  padding: isMobile ? '12px 18px 13px' : '15px 20px 14px',
  background: PANEL.tint, borderBottom: `1px solid ${PANEL.line}`, flexShrink: 0,
});

const titleStyle    = (isMobile) => ({ fontSize: isMobile ? 17 : 16, fontWeight: 800, color: PANEL.ink, margin: 0, lineHeight: 1.2 });
const subtitleStyle = { fontSize: 12, color: PANEL.muted, fontWeight: 600, margin: '3px 0 0', lineHeight: 1.4 };

const closeStyle = (isMobile) => ({
  border: 'none', background: 'rgba(44,68,51,0.06)', cursor: 'pointer', borderRadius: '50%',
  width: isMobile ? 34 : 28, height: isMobile ? 34 : 28, flexShrink: 0,
  fontSize: 13, color: PANEL.body, fontWeight: 700, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const subheadStyle = (isMobile) => ({
  flexShrink: 0, padding: isMobile ? '12px 18px' : '12px 20px',
  borderBottom: `1px solid ${PANEL.line}`, background: PANEL.surface,
});

const bodyStyle = (isMobile, pad) => ({
  flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
  padding: pad ?? (isMobile ? '16px 18px 20px' : '18px 20px 20px'),
  display: 'flex', flexDirection: 'column', gap: 14,
  color: PANEL.body,
});

const footStyle = (isMobile) => ({
  flexShrink: 0, padding: isMobile ? '12px 18px 18px' : '14px 20px 18px',
  borderTop: `1px solid ${PANEL.line}`, background: PANEL.surface,
  display: 'flex', gap: 10,
});

/**
 * A modal panel. Centred on desktop, a bottom sheet on mobile.
 *
 * `onClose` is what makes it dismissable — pass it and the panel closes on Esc, on backdrop click
 * and from the ✕. Omit it for a panel the user must resolve some other way, and no ✕ is drawn.
 */
export function Panel({ open = true, onClose, title, subtitle, width = 420, isMobile = false,
                        bodyPadding, subhead, footer, showClose = true, children }) {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={overlayStyle(isMobile)} onClick={onClose}>
      <style>{PANEL_CSS}</style>
      <div
        className="spattoo-panel"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={sheetStyle(isMobile, width)}
        onClick={(e) => e.stopPropagation()}
      >
        {isMobile && <div style={grab} />}
        {(title || (onClose && showClose)) && (
          <div style={headStyle(isMobile)}>
            <div style={{ minWidth: 0 }}>
              {title && <h2 style={titleStyle(isMobile)}>{title}</h2>}
              {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
            </div>
            {onClose && showClose && (
              <button type="button" aria-label="Close" style={closeStyle(isMobile)} onClick={onClose}>✕</button>
            )}
          </div>
        )}
        {/* Pinned under the header and above the scroll — step dots, tabs, a filter row. */}
        {subhead && <div style={subheadStyle(isMobile)}>{subhead}</div>}
        <div className="spattoo-panel-body" style={bodyStyle(isMobile, bodyPadding)}>{children}</div>
        {footer && <div style={footStyle(isMobile)}>{footer}</div>}
      </div>
    </div>
  );
}

/** A tinted section inside a panel. Three copies of this rule already existed in one file. */
export function PanelBlock({ style, children }) {
  return (
    <div style={{ background: PANEL.tint, border: `1px solid ${PANEL.line}`, borderRadius: 11,
                  padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {children}
    </div>
  );
}
