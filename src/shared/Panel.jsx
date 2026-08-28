import { useEffect, useRef } from 'react';
import { WAVES, WAVE_VIEWBOX } from './waves.js';
import { chromeGradient } from './chrome.js';

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
//
// `studio` is a full-screen Chef's Desk tool — a DESTINATION, not a dialog, so it covers the whole
// designer including its panels. `overStudio` is for a panel opened from inside one. Both are here
// rather than as a literal in the studio's own styles, because a number that has to be above
// another number is a relationship, and a relationship kept in two files is a relationship that
// breaks: the studio sat at a bare 4000 and the uploads picker at Z.panel, so "Add image" opened
// the picker faithfully, 3000 layers beneath an opaque surface. Nothing errored. Nothing appeared.
export const Z = { panel: 1000, popover: 1100, toast: 1200, studio: 4000, overStudio: 4100 };

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

const overlayStyle = (isMobile, zIndex = Z.panel, scrim = true) => ({
  position: 'fixed', inset: 0, zIndex,
  /* ⚠️ A panel that LEAVES ROOM to show something must not then blur it. The take panels frame the
     shot in the space above the sheet, and the scrim's 4px blur was landing squarely on it — the
     preview went from hidden behind the sheet to visible and out of focus, which is no more honest.
     Those panels darken their own surroundings anyway (the designer dims everything outside the
     crop), so there is nothing for this to add. */
  ...(scrim
    ? { background: PANEL.scrim, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }
    : { background: 'transparent' }),
  display: 'flex', justifyContent: 'center',
  alignItems: isMobile ? 'flex-end' : 'center',
  padding: isMobile ? 0 : 16,
  fontFamily: PANEL.font,
});

const sheetStyle = (isMobile, width, maxHeight) => ({
  background: PANEL.surface,
  fontFamily: PANEL.font,
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',                       // so the header band's corners are clipped, not squared
  ...(isMobile
    /* ⚠️ 92vh is the DEFAULT, not the rule. A panel that has something to show BEHIND it — the
       reel and photo panels both frame the shot in the space above — passes its own ceiling, or the
       sheet grows to fill the phone and covers the very thing it is describing. */
    ? { width: '100%', maxHeight: maxHeight || '92vh', borderRadius: `${PANEL.radius}px ${PANEL.radius}px 0 0`,
        boxShadow: '0 -4px 40px rgba(20,24,21,0.20)',
        animation: 'spattooPanelUp 0.28s cubic-bezier(0.32,0.72,0,1)', paddingTop: 8 }
    : { width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)',
        borderRadius: PANEL.radius, boxShadow: PANEL.shadow,
        animation: 'spattooPanelIn 0.18s cubic-bezier(0.2,0.7,0.3,1)' }),
});

const grab = { width: 36, height: 4, borderRadius: 2, background: '#D8DCD8',
               margin: '0 auto 10px', flexShrink: 0 };

// ── The header ──────────────────────────────────────────────────────────────────────────────────
// A first pass made this a tint 1–2% off white with a hairline under it. Technically a band;
// visually nothing — "I don't really see any change" was the correct verdict.
//
// So it takes the product's own shape instead. Every tinted section on a customer storefront ends
// in a WAVE rather than a straight rule, and it is the most distinctive thing in the design system.
// A panel header that ends the same way ties the app's chrome to the storefront and makes a popup
// recognisable as ours at a glance — which a rounded white rectangle never will be. The wave is
// drawn in the SURFACE colour so it reads as the body eating into the band, exactly as the
// storefront's bands dissolve into the page.
//
// The band is the SPATULA's surface — chromeGradient(), the same stops the rail's silhouette is
// drawn with — so a popup looks like it belongs to the rail it opened from. Deliberately not the
// brand green: the primary button is near-black and the step dots take the BAKER's own colour, so
// a green band would fight both.
//
// Only the band is new. Nothing below it changes — body, footer and every control are as they were.
const WAVE_H = 14;   // how deep the curve bites into the body

const headStyle = (isMobile) => ({
  position: 'relative',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
  padding: isMobile ? `14px 18px ${WAVE_H + 10}px` : `17px 20px ${WAVE_H + 10}px`,
  background: chromeGradient(180), flexShrink: 0,
});

const titleStyle    = (isMobile) => ({ fontSize: isMobile ? 18 : 17, fontWeight: 800,
                                       color: '#FFFFFF', margin: 0, lineHeight: 1.2,
                                       letterSpacing: '-0.01em' });
const subtitleStyle = { fontSize: 12, color: 'rgba(255,255,255,0.62)', fontWeight: 600,
                        margin: '3px 0 0', lineHeight: 1.4 };

// The ✕, and the same circle for a leading back arrow — a drill-down panel needs to look like one
// panel going deeper, not a second panel replacing the first.
const roundBtn = (isMobile) => ({
  border: 'none', background: 'rgba(255,255,255,0.16)', cursor: 'pointer', borderRadius: '50%',
  width: isMobile ? 34 : 28, height: isMobile ? 34 : 28, flexShrink: 0,
  fontSize: 13, color: '#FFFFFF', fontWeight: 700, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
  fontFamily: 'inherit', padding: 0,
});

const subheadStyle = (isMobile) => ({
  flexShrink: 0, padding: isMobile ? '12px 18px' : '12px 20px',
  borderBottom: `1px solid ${PANEL.line}`, background: PANEL.surface,
});

// Two vertical rhythms, because the panels genuinely have two. 'stack' spaces children evenly and is
// what a form wants. 'block' is plain flow, for a body whose own children already carry the margins
// that separate them — imposing a gap on top of those would double every space in the panel.
const bodyStyle = (isMobile, pad, flow) => ({
  flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
  padding: pad ?? (isMobile ? '16px 18px 20px' : '18px 20px 20px'),
  ...(flow === 'block' ? {} : { display: 'flex', flexDirection: 'column', gap: 14 }),
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
 *
 * `guardUnsaved` protects work in progress: while it is true, Esc and the backdrop are ignored and
 * only the ✕ (or the panel's own buttons) close. Pass it whatever means "this holds something the
 * customer typed" — a filled order form, a half-written message.
 */
export function Panel({ open = true, onClose, title, subtitle, width = 420, isMobile = false,
                        bodyPadding, flow = 'stack', subhead, footer, showClose = true, wave = 0,
                        // Only for a panel opened from something that is ALREADY above Z.panel —
                        // pass Z.overStudio from inside a full-screen tool. Left alone everywhere
                        // else: the default is what keeps one scale meaningful.
                        zIndex = Z.panel,
                        // Caps the mobile sheet so something behind it stays visible. Any CSS
                        // length; ignored on desktop, where the panel is centred and nothing is
                        // underneath it.
                        maxHeightMobile,
                        // Whether to dim and blur everything behind the panel. Off for a panel whose
                        // whole point is what is visible behind it.
                        scrim = true,
                        // ── Work in progress must not be dismissable by accident ────────────────
                        // A backdrop click and Esc are for a panel somebody opened and does not
                        // want. They are the wrong gesture for one holding eight fields of typing:
                        // the click is a miss, and the cost is everything entered.
                        //
                        // OPT-IN rather than the default, because most panels here hold nothing to
                        // lose and taking away their easy dismissal would be a worse trade. The ✕
                        // always works — nobody presses it by accident, and it must never be
                        // second-guessed.
                        guardUnsaved = false,
                        onBack, backLabel = 'Back', children }) {
  // A backdrop click closes only if the press STARTED on the backdrop. Without this, dragging a
  // slider or a colour swatch and releasing past the panel's edge dispatches a click on the nearest
  // common ancestor — the backdrop — and the panel vanishes mid-adjustment, discarding the edit. The
  // decoration studio dodged this by closing on pointerdown instead, which loses a drag the other
  // way: press on the backdrop, change your mind, release inside, and it has already closed.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !guardUnsaved) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, guardUnsaved]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle(isMobile, zIndex, scrim)}
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (onClose && !guardUnsaved && pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <style>{PANEL_CSS}</style>
      <div
        className="spattoo-panel"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={sheetStyle(isMobile, width, maxHeightMobile)}
      >
        {isMobile && <div style={grab} />}
        {(title || (onClose && showClose)) && (
          <div style={headStyle(isMobile)}>
            {onBack && (
              <button type="button" aria-label={backLabel} style={roundBtn(isMobile)} onClick={onBack}>←</button>
            )}
            <div style={{ minWidth: 0, zIndex: 1, marginRight: 'auto' }}>
              {title && <h2 style={titleStyle(isMobile)}>{title}</h2>}
              {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
            </div>
            {onClose && showClose && (
              <button type="button" aria-label="Close" style={roundBtn(isMobile)} onClick={onClose}>✕</button>
            )}
            {/* The storefront's edge, at panel scale. Drawn in the surface colour so the body eats
                into the band rather than a line being laid on top of it. */}
            <svg
              viewBox={WAVE_VIEWBOX} preserveAspectRatio="none" aria-hidden="true"
              style={{ position: 'absolute', left: 0, right: 0, bottom: -1, width: '100%',
                       height: WAVE_H, display: 'block' }}
            >
              <path d={WAVES[wave % WAVES.length]} fill={PANEL.surface} />
            </svg>
          </div>
        )}
        {/* Pinned under the header and above the scroll — step dots, tabs, a filter row. */}
        {subhead && <div style={subheadStyle(isMobile)}>{subhead}</div>}
        <div className="spattoo-panel-body" style={bodyStyle(isMobile, bodyPadding, flow)}>{children}</div>
        {footer && <div style={footStyle(isMobile)}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Confirming something ────────────────────────────────────────────────────────────────────────
// Three files had written the same dialog independently — a scrim, a small card, a title, a
// paragraph, and a cancel/confirm pair — and all three had drifted: 340 / 420 / 440 wide, radius
// 20 / 18 / 18, and cancel buttons in three greys. Asking "are you sure?" is one thing the app does,
// so it is one component.
//
// `danger` is the only variant, because the only thing that changes between a confirmation you can
// undo and one you cannot is how loud the confirming button should be.
const confirmBtn = {
  padding: '11px 20px', borderRadius: 11, border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, color: '#FFFFFF',
};
const cancelBtn = {
  ...confirmBtn, flex: '0 0 auto',
  border: `1.5px solid ${PANEL.line}`, background: PANEL.surface, color: PANEL.body,
};

export function ConfirmPanel({
  open = true, title, message, children,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, danger = false, busy = false, confirmDisabled = false,
  confirmStyle, width = 400, isMobile = false,
}) {
  const off = busy || confirmDisabled;
  return (
    <Panel
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      width={width}
      isMobile={isMobile}
      footer={
        <>
          <button type="button" style={cancelBtn} disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            disabled={off}
            onClick={onConfirm}
            style={{
              ...confirmBtn, flex: 1,
              background: danger ? '#DC2626' : '#1a1a1a',
              opacity: off ? 0.5 : 1,
              cursor: off ? 'not-allowed' : 'pointer',
              ...confirmStyle,
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: PANEL.body }}>{message}</p>}
      {children}
    </Panel>
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
