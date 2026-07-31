import { useState } from 'react';
import { creditsChanged } from '../../billing/creditsBus.js';

// ── How to make the decorations ──────────────────────────────────────────────────────────────────
// The nozzle sections answer "which tip pipes this border". This answers the other half: a baker's
// OWN decoration is always an uploaded 2D image, so it never has a nozzle, and until now the sheet
// listed it on the checklist by name and said nothing about making it.
//
// WHAT IT DELIBERATELY DOES NOT DO: guess whether a decoration is printed or modelled. A 2D lion
// could be an edible-print decal or a reference for a fondant figure, and the baker decides that
// WITH THE CUSTOMER — often after the order is placed. So the A4 print path is always available
// (free, deterministic, PhotoSheet) and a build guide is only ever generated when asked for.
//
// The presence of a guide then IS the answer: generate one and the baker models it, so it shows on
// every future cake using that decoration. Never generate one and it stays a print job. No
// print-or-model field to add, migrate, or keep correct.
export default function BuildGuideSection({ report, design, guides, apiClient, onGenerated, s }) {
  // Every placeable that references a library element, named from the design so the row reads the
  // way the checklist does.
  const decorations = [];
  const seen = new Set();
  for (const d of [...(design?.stickers ?? []), ...(design?.decorations ?? [])]) {
    if (!d?.elementId || seen.has(d.elementId)) continue;
    seen.add(d.elementId);
    decorations.push({ elementId: d.elementId, name: d.name || 'Decoration' });
  }
  if (!decorations.length) return null;

  return (
    <div>
      <div style={s.sub}><span style={s.dot('#6A5A8C')} /> Decorations — how to make them</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {decorations.map(d => (
          <DecorationRow
            key={d.elementId} decoration={d} row={guides[d.elementId]}
            apiClient={apiClient} onGenerated={onGenerated} s={s}
          />
        ))}
      </div>
    </div>
  );
}

function DecorationRow({ decoration, row, apiClient, onGenerated, s }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const [note, setNote] = useState(null);
  const [open, setOpen] = useState(false);

  const guide = row?.guide;

  async function generate() {
    if (busy || !apiClient?.createElementBuildGuide) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await apiClient.createElementBuildGuide(decoration.elementId);
      // A decoration nobody models — a printed decal, an acrylic topper. A real answer, and the
      // server released the hold rather than charging for it, so say so plainly instead of
      // showing it as a failure.
      if (res?.notModelled) setNote('This looks printed or pre-made rather than modelled by hand — nothing was charged.');
      else { onGenerated?.(); setOpen(true); }
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
          {decoration.name}
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
          <button type="button" onClick={generate} disabled={busy || !apiClient?.createElementBuildGuide}
            title="Costs 20 credits once. Every future cake with this decoration includes it."
            style={{
              border: '1.5px solid #E0DDD8', background: busy ? '#F4F1EC' : '#fff', borderRadius: 9,
              cursor: busy ? 'default' : 'pointer', padding: '6px 12px', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700, color: '#555',
            }}>
            {busy ? 'Reading…' : 'How do I make this?'}
          </button>
        )}
      </div>

      {/* The once-only framing is the point of the price, so it is stated where the decision is
          made rather than in a help page nobody opens. */}
      {!guide && !busy && !err && !note && (
        <div style={{ ...s.muted, marginTop: 6 }}>
          Uses 20 credits, once — every future cake with this decoration includes it.
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
