import { useState } from 'react';
import { creditsChanged } from '../../billing/creditsBus.js';

// ── How to make the decorations ──────────────────────────────────────────────────────────────────
// The nozzle sections answer "which tip pipes this border". This answers the other half: how a
// decoration that is MODELLED rather than piped actually gets made.
//
// TWO SOURCES, ONE SECTION — because a decoration's identity lives in different places:
//
//   designed order   the decoration IS a library element. Steps hang off the element, so one
//                    baker's generation serves every future cake using it and is paid for once.
//
//   photo order      the decoration exists ONLY in the customer's photo. Steps are read from that
//                    photo and stored on the order. Nothing is matched against the library, and
//                    that is the point: matching scores zone, type, colour and mode at 0.60
//                    combined against a 0.35 confidence floor, so a pink fondant topper certifies
//                    as any other pink fondant topper without the model recognising the object.
//                    A real cake's bow matched "Fondant doll 1" and would have been given a
//                    faithful, detailed guide to a doll.
//
// So on a photo order the row is titled and prompted from `seen` — what the model reported seeing —
// never from the matched element's name.
//
// WHAT IT DELIBERATELY DOES NOT DO: guess whether a decoration is printed or modelled. A 2D lion
// could be an edible-print decal or a reference for a fondant figure, and the baker decides that
// WITH THE CUSTOMER — often after the order is placed. So the A4 print path is always available
// (free, deterministic, PhotoSheet) and steps are only ever generated when asked for.
export default function XrayDecorationSteps({
  design, fromPhoto, storedSteps, guides, orderId, apiClient, onGenerated, s,
}) {
  const rows = fromPhoto ? photoRows(design, storedSteps) : elementRows(design, guides);
  if (!rows.length) return null;

  return (
    <div>
      <div style={s.sub}><span style={s.dot('#6A5A8C')} /> Decorations — how to make them</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(row => (
          <DecorationRow
            key={row.key} row={row} orderId={orderId}
            apiClient={apiClient} onGenerated={onGenerated} s={s}
          />
        ))}
      </div>
    </div>
  );
}

// ── Row builders ────────────────────────────────────────────────────────────────────────────────

const ZONE_WORDS = {
  top_surface: 'top surface', side: 'side', rim: 'rim', base: 'base', board: 'board',
};

// A photo decoration, described the way the model reported it. `seen` is written by the backend
// mapper alongside the match precisely so this never has to trust the match.
function describe(sticker) {
  const seen = sticker?.seen ?? {};
  const what  = seen.what || sticker?.name || 'decoration';
  const where = ZONE_WORDS[seen.placement] || ZONE_WORDS[sticker?.zone] || null;
  return where ? `${what} on the ${where}` : what;
}

function photoRows(design, storedSteps) {
  const out = [];
  for (const d of [...(design?.stickers ?? []), ...(design?.decorations ?? [])]) {
    if (!d?.id) continue;                       // no stable key → nothing to store steps under
    const label = describe(d);
    out.push({
      key:     d.id,
      title:   label,
      label,
      // Photo steps are stored as { guide, label, … } per decoration inside xray_spec.
      guide:   storedSteps?.[d.id]?.guide ?? null,
      status:  'draft',                         // read off a photo, never reviewed by us
    });
  }
  return out;
}

function elementRows(design, guides) {
  const out = [];
  const seen = new Set();
  for (const d of [...(design?.stickers ?? []), ...(design?.decorations ?? [])]) {
    if (!d?.elementId || seen.has(d.elementId)) continue;
    seen.add(d.elementId);
    const row = guides?.[d.elementId];
    out.push({
      key:       d.elementId,
      title:     d.name || 'Decoration',
      elementId: d.elementId,
      guide:     row?.guide ?? null,
      status:    row?.status ?? 'draft',
    });
  }
  return out;
}

// ── One decoration ──────────────────────────────────────────────────────────────────────────────

function DecorationRow({ row, orderId, apiClient, onGenerated, s }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const [note, setNote] = useState(null);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(null);   // shown immediately, before the parent refetches

  const guide = fresh ?? row.guide;
  // An element guide is shared and amortises across every cake using it; photo steps belong to this
  // order alone. Saying which is which is the difference between "worth it" and "why again?".
  const canGenerate = row.elementId
    ? !!apiClient?.createElementDecorationSteps
    : !!(apiClient?.createXrayDecorationSteps && orderId);

  async function generate() {
    if (busy || !canGenerate) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = row.elementId
        ? await apiClient.createElementDecorationSteps(row.elementId)
        : await apiClient.createXrayDecorationSteps(orderId, { key: row.key, label: row.label });
      // A decoration nobody models — a printed decal, an acrylic topper, or piping, whose real
      // instruction is the nozzle section above. A real answer, and the server released the hold
      // rather than charging for it, so say so plainly instead of showing it as a failure.
      if (res?.notModelled) setNote('This looks piped, printed or pre-made rather than modelled by hand — nothing was charged.');
      else {
        setFresh(res?.steps?.guide ?? res?.guide?.guide ?? res?.guide ?? null);
        onGenerated?.();
        setOpen(true);
      }
    } catch (e) {
      setErr(e?.code === 'INSUFFICIENT_CREDITS'
        ? "You've used this month's credits — open Billing for options."
        : (e?.message || 'Could not read that decoration.'));
    } finally {
      setBusy(false);
      creditsChanged();
    }
  }

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#2C2A26', flex: 1, minWidth: 140 }}>
          {row.title}
        </span>

        {guide ? (
          <>
            {/* An unreviewed model guess must not look like a curated nozzle recommendation. */}
            {row.status !== 'approved' && (
              <span style={{ ...s.tag, background: '#F0EEF6', color: '#6A5A8C' }}>AI draft — not reviewed</span>
            )}
            {guide.set_time && <span style={s.tag}>sets in {guide.set_time}</span>}
            <button type="button" onClick={() => setOpen(o => !o)} style={{
              border: '1.5px solid #E0DDD8', background: '#fff', borderRadius: 9, cursor: 'pointer',
              padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#555',
            }}>{open ? 'Hide steps' : `${guide.steps?.length ?? 0} steps`}</button>
          </>
        ) : (
          <button type="button" onClick={generate} disabled={busy || !canGenerate}
            title={row.elementId
              ? 'Costs 20 credits once. Every future cake with this decoration includes it.'
              : 'Costs 20 credits. Read from this order’s reference photo.'}
            style={{
              border: '1.5px solid #E0DDD8', background: busy ? '#F4F1EC' : '#fff', borderRadius: 9,
              cursor: busy ? 'default' : 'pointer', padding: '6px 12px', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700, color: '#555',
            }}>
            {busy ? 'Reading…' : 'How do I make this?'}
          </button>
        )}
      </div>

      {/* The price framing is the point, so it is stated where the decision is made rather than in
          a help page nobody opens — and it differs by source, because one amortises and one does not. */}
      {!guide && !busy && !err && !note && (
        <div style={{ ...s.muted, marginTop: 6 }}>
          {row.elementId
            ? 'Uses 20 credits, once — every future cake with this decoration includes it.'
            : 'Uses 20 credits — read from this order’s photo.'}
        </div>
      )}
      {note && <div style={{ ...s.muted, marginTop: 6 }}>{note}</div>}
      {err && <div style={{ fontSize: 12, fontWeight: 700, color: '#C0392B', marginTop: 6 }}>{err}</div>}

      {guide && open && <GuideBody guide={guide} s={s} />}
    </div>
  );
}

// Steps carry ROLE TOKENS ({body}, {mane}) rather than colour names, so one guide serves every
// colour the decoration is ever made in. Rendered as the role word — the colours themselves are on
// the cream-colour table above, and repeating them here would be a second place to get them wrong.
const readable = (text) => String(text ?? '').replace(/\{(\w+)\}/g, (_, role) => role.replace(/_/g, ' '));

function GuideBody({ guide, s }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {guide.materials?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#8A857D', marginBottom: 5 }}>YOU WILL NEED</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {guide.materials.map((m, i) => <span key={i} style={s.tag}>{readable(m.label)}</span>)}
          </div>
        </div>
      )}

      {guide.steps?.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {guide.steps.map(step => (
            <li key={step.n} style={{ fontSize: 13, color: '#2C2A26' }}>
              <span style={{ fontWeight: 800 }}>{readable(step.title)}</span>
              {(step.instructions ?? []).map((line, i) => (
                <div key={i} style={{ fontWeight: 500, marginTop: 2 }}>{readable(line)}</div>
              ))}
              {step.tools?.length > 0 && (
                <div style={{ ...s.muted, marginTop: 3 }}>{step.tools.join(' · ')}</div>
              )}
            </li>
          ))}
        </ol>
      )}

      {guide.tips?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#8A857D', marginBottom: 5 }}>TIPS</div>
          {guide.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12.5, color: '#6b6459', fontWeight: 500 }}>· {readable(tip)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
