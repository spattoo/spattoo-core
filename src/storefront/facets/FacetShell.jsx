import { useEffect, useMemo, useReducer, useState } from 'react';
import CakeVisual from './CakeVisual.jsx';
import {
  FACETS, emptyDraft, loadDraft, saveDraft, isFilled, canSubmit,
} from './cakeDraft.js';

// ── The shell ───────────────────────────────────────────────────────────────────────────────────
// Everything except the doors: the shared draft, the visual, which facet is open, and the submit
// gate. The doors (templates, photo, designer, flavour list, suggester) plug in as facet bodies.
//
// Built first because every door depends on the draft's shape and none of them can settle it alone.
//
// ── DELIBERATELY NOT shared/Panel.jsx ───────────────────────────────────────────────────────────
// That shell wears the app's near-black chrome, and this is the CUSTOMER's storefront, which wears
// the BAKER's colours. Putting app furniture here would be the same mistake as styling a baker's
// storefront in Spattoo green — the whole point of the storefront is that it belongs to them.

const FACET_TITLE = {
  design:  'The design',
  flavour: 'The flavour',
  size:    'How many people?',
  date:    'When do you need it?',
};

// The two entries. Their labels differ in SHAPE, not one word — two lines differing by a single
// word force the eye to compare rather than recognise, which is backwards for a screen whose job is
// instant self-identification. And neither asks the customer to KNOW anything: "I know how it
// should look" would have no door for the many people who know neither.
const ENTRIES = [
  { facet: 'design',  label: "I'll start with the design" },
  { facet: 'flavour', label: "I'll pick the flavour first" },
];

function reduce(draft, patch) {
  // Facets MUTATE the shared draft rather than returning values this shell stitches together,
  // because any facet may fill a field that nominally belongs to another — the suggester asks the
  // occasion because it needs it, and the answer belongs to the cake. A shallow merge per top-level
  // key keeps a facet from having to rebuild the parts it did not touch.
  const next = { ...draft };
  for (const [k, v] of Object.entries(patch)) {
    next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...draft[k], ...v } : v;
  }
  return next;
}

export default function FacetShell({
  baker, tierCount = 1, isMobile = false, palette,
  onClose, onSubmit, renderFacet,
}) {
  const slug = baker?.slug ?? 'unknown';
  const [draft, patch] = useReducer(reduce, null, () => loadDraft(slug, tierCount));
  // null = the entry screen. A facet is opened, filled, and closed back to here — there is no
  // "next", because there is no order to go in.
  const [open, setOpen] = useState(null);

  useEffect(() => { saveDraft(draft); }, [draft]);

  const remaining = useMemo(() => FACETS.filter(f => !isFilled(draft, f)), [draft]);
  const ready = canSubmit(draft);

  // The flavour whose colours the slice is drawn in — the first tier that has one, since that is
  // the one being chosen. Resolved here rather than in the visual so the visual never has to know
  // what a tier is.
  const shownFlavour = draft.flavours.find(f => f.flavourId) ?? null;

  const primary = palette?.primary ?? baker?.primary_color ?? '#2C4433';
  const accent  = palette?.accent  ?? baker?.accent_color  ?? '#6B8C74';

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.sheet(isMobile)} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <header style={s.head}>
          <div>
            <div style={s.eyebrow}>{baker?.name}</div>
            <h2 style={s.title}>{open ? FACET_TITLE[open] : "Let's make your cake"}</h2>
          </div>
          <button type="button" onClick={open ? () => setOpen(null) : onClose}
                  aria-label={open ? 'Back' : 'Close'} style={s.close}>
            {open ? '←' : '✕'}
          </button>
        </header>

        <div style={s.body(isMobile)}>
          {/* PINNED, on both layouts. If the cake scrolls away we have built a form again — the
              whole reason this is not a wizard is that something happens on every tap, and that
              only lands if the thing is still visible when you tap. */}
          <div style={s.stage(isMobile, primary)}>
            <CakeVisual facet={open} flavour={shownFlavour} primary={primary} accent={accent}
                        height={isMobile ? 170 : 230} />
          </div>

          <div style={s.panel(isMobile)}>
            {open
              ? renderFacet?.({ facet: open, draft, patch, close: () => setOpen(null) })
              : (
                <>
                  {ENTRIES.map(e => (
                    <button key={e.facet} type="button" onClick={() => setOpen(e.facet)}
                            style={s.entry(primary)}>
                      <span style={s.entryLabel}>{e.label}</span>
                      {isFilled(draft, e.facet) && <span style={s.tick(primary)}>✓</span>}
                    </button>
                  ))}

                  {/* What is left, as an invitation rather than a checklist. Nothing here is
                      required — someone who sends a photo and a date has made a real enquiry, and
                      demanding the rest would rebuild the corridor this design exists to remove. */}
                  {remaining.length > 0 && (
                    <div style={s.rest}>
                      {remaining.filter(f => !ENTRIES.some(e => e.facet === f)).map(f => (
                        <button key={f} type="button" onClick={() => setOpen(f)} style={s.restBtn}>
                          {FACET_TITLE[f]}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
          </div>
        </div>

        {!open && (
          <footer style={s.foot}>
            <button type="button" disabled={!ready} onClick={() => onSubmit?.(draft)}
                    style={s.send(primary, ready)}>
              Send to {baker?.name || 'the baker'}
            </button>
            {/* Says what is missing, never how long anything will take. */}
            <div style={s.hint}>
              {ready ? 'You can add more later — send it whenever you like.'
                     : 'Tell us how to reach you, and one thing about the cake.'}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

const s = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28, 24, 22, 0.44)',
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: (m) => ({
    background: '#FFFDF9', borderRadius: m ? '20px 20px 0 0' : 22, overflow: 'hidden',
    boxShadow: '0 24px 70px rgba(28,24,22,0.28)', display: 'flex', flexDirection: 'column',
    width: m ? '100%' : 'min(880px, 100%)',
    maxHeight: m ? '94vh' : 'calc(100vh - 32px)',
    ...(m ? { position: 'fixed', left: 0, right: 0, bottom: 0 } : {}),
  }),
  head: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '18px 20px 14px', flexShrink: 0,
  },
  eyebrow: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
             color: '#B3A79A' },
  title:   { fontSize: 21, fontWeight: 800, color: '#2A241F', margin: '3px 0 0', letterSpacing: '-0.01em' },
  close:   { border: 'none', background: '#F1EBE3', width: 32, height: 32, borderRadius: '50%',
             cursor: 'pointer', fontSize: 14, color: '#6B5F55', flexShrink: 0 },

  body:  (m) => ({ display: 'flex', flexDirection: m ? 'column' : 'row', gap: 0,
                   minHeight: 0, flex: 1 }),
  stage: (m, primary) => ({
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `linear-gradient(180deg, ${primary}0D, ${primary}03)`,
    width: m ? '100%' : 340, padding: m ? '4px 0 10px' : '0 12px',
  }),
  panel: (m) => ({ flex: 1, minHeight: 0, overflowY: 'auto', padding: m ? '14px 18px 4px' : '4px 22px 18px',
                   display: 'flex', flexDirection: 'column', gap: 10 }),

  entry: (primary) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '16px 18px', borderRadius: 14, border: `1.5px solid ${primary}22`,
    background: '#fff', font: 'inherit',
  }),
  entryLabel: { fontSize: 15, fontWeight: 700, color: '#2A241F', lineHeight: 1.35 },
  tick: (primary) => ({ color: primary, fontWeight: 800, fontSize: 14 }),

  rest:    { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  restBtn: { padding: '8px 13px', borderRadius: 20, border: '1.5px solid #E7DFD5', background: '#fff',
             font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#7A6C60', cursor: 'pointer' },

  foot: { flexShrink: 0, padding: '12px 20px 18px', borderTop: '1px solid #F0E9E0', background: '#FFFDF9' },
  send: (primary, ready) => ({
    width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
    background: ready ? primary : '#E3DBD1', color: ready ? '#fff' : '#A2968A',
    font: 'inherit', fontSize: 15, fontWeight: 800, cursor: ready ? 'pointer' : 'default',
  }),
  hint: { fontSize: 11.5, color: '#A2968A', fontWeight: 600, textAlign: 'center', marginTop: 8 },
};
