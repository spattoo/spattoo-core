import { useState } from 'react';
import { creditsChanged } from '../../billing/creditsBus.js';
import { gelRecipeFor } from './gelLibrary.js';
import { decorationWidthMm, tierInchFor, downloadDecorationTemplate } from './decorationTemplate.js';

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
  design, fromPhoto, storedSteps, guides, orderId, photoUrl, tinPlan, apiClient, onGenerated, s,
}) {
  const rows = fromPhoto ? photoRows(design, storedSteps, tinPlan) : elementRows(design, guides);
  if (!rows.length) return null;

  return (
    <div>
      <div style={s.sub}><span style={s.dot('#6A5A8C')} /> Decorations — how to make them</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(row => (
          <DecorationRow
            key={row.key} row={row} orderId={orderId} photoUrl={photoUrl}
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

function photoRows(design, storedSteps, tinPlan) {
  const out = [];
  for (const d of [...(design?.stickers ?? []), ...(design?.decorations ?? [])]) {
    if (!d?.id) continue;                       // no stable key → nothing to store steps under
    const label = describe(d);
    out.push({
      key:     d.id,
      title:   label,
      label,
      // Where this decoration sits in the reference photo, so the card can show the real thing
      // rather than only describing it. Null whenever the model would not commit.
      bbox:    d?.seen?.bbox ?? null,
      // Real width, in mm — the model's size-against-its-tier judgement multiplied by the tin
      // plan's actual diameter for that tier. Null whenever either is missing, which is common and
      // correct: a piped border has no single width, and the baker CUTS to this number.
      widthMm: decorationWidthMm(d?.seen?.tierWidthRatio, tierInchFor(tinPlan, d?.tierIndex ?? 0)),
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
      // A library element already has a picture of itself; no crop needed.
      imageUrl:  d.imageUrl ?? null,
      guide:     row?.guide ?? null,
      status:    row?.status ?? 'draft',
    });
  }
  return out;
}

// ── One decoration ──────────────────────────────────────────────────────────────────────────────

function DecorationRow({ row, orderId, photoUrl, apiClient, onGenerated, s }) {
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

      {guide && open && <GuideBody guide={guide} row={row} photoUrl={photoUrl} s={s} />}
      {open && <TemplateButton row={row} photoUrl={photoUrl} s={s} />}
    </div>
  );
}

// Steps carry ROLE TOKENS ({body}, {mane}) rather than colour names, so one guide serves every
// colour the decoration is ever made in. Rendered as the role word — the colours themselves are on
// the cream-colour table above, and repeating them here would be a second place to get them wrong.
const readable = (text) => String(text ?? '').replace(/\{(\w+)\}/g, (_, role) => role.replace(/_/g, ' '));

function GuideBody({ guide, row, photoUrl, s }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ReferenceAndColours guide={guide} row={row} photoUrl={photoUrl} s={s} />
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

// ── Reference and colours ───────────────────────────────────────────────────────────────────────
// The two panels that make prose into a guide. Both are DETERMINISTIC — no model call, no cost, no
// storage — which is why they render for every decoration that has the inputs, not only ones a
// baker paid extra for.
//
// The reference answers "is mine supposed to look like that yet?", which no amount of text can.
// The colours answer "what do I mix?", which the steps deliberately cannot: they carry role tokens
// ({body}, {mane}) rather than colour names so one guide serves every colour the decoration is
// made in. That trade only works if the colours appear SOMEWHERE, and this is that somewhere.
function ReferenceAndColours({ guide, row, photoUrl, s }) {
  const colours = (guide?.colours ?? []).filter(c => /^#[0-9a-f]{6}$/i.test(String(c?.hex ?? '')));
  const hasRef  = !!(row?.imageUrl || (photoUrl && row?.bbox));
  if (!hasRef && !colours.length) return null;

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {hasRef && (
        <div>
          <div style={PANEL_LABEL}>REFERENCE</div>
          <DecorationCrop imageUrl={row.imageUrl} photoUrl={photoUrl} bbox={row.bbox} />
        </div>
      )}
      {colours.length > 0 && (
        <div style={{ flex: 1, minWidth: 190 }}>
          <div style={PANEL_LABEL}>COLOUR GUIDE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {colours.map((c, i) => <ColourRow key={i} colour={c} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

const PANEL_LABEL = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#8A857D', marginBottom: 5,
};

// A close-up WITHOUT cutting the image: the bbox drives background-size/position, so the crop is
// pure CSS. No canvas, no upload, no second asset to store, keep in sync, or erase when the
// account is deleted — and it stays correct if the model's box is ever re-read.
//
// Padded outward by a quarter of the box. Vision models are imprecise at boundaries, and a crop
// that clips the decoration is unrecoverable, while a little surrounding cake is harmless context.
function DecorationCrop({ imageUrl, photoUrl, bbox }) {
  const box = { width: 132, height: 132, borderRadius: 10, border: '1.5px solid #E8E4DE', background: '#FAF8F5' };
  if (imageUrl) {
    return <div style={{ ...box, backgroundImage: `url(${imageUrl})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />;
  }

  return <div style={{ ...box, ...cropStyle(photoUrl, bbox) }} />;
}

// Pure, and exported, because this is arithmetic that is easy to get subtly wrong and impossible
// to eyeball: an off-by-one in the position term shows a plausible-looking crop of the WRONG part
// of the cake, which reads as a bad model rather than a bad stylesheet.
//
// Padded outward by a quarter of the box. Vision models are imprecise at boundaries, and a crop
// that clips the decoration is unrecoverable, while a little surrounding cake is harmless context.
export function cropStyle(photoUrl, bbox) {
  const [x, y, w, h] = bbox;
  const padX = w * 0.25, padY = h * 0.25;
  const cx = Math.max(0, x - padX), cy = Math.max(0, y - padY);
  const cw = Math.min(1 - cx, w + padX * 2), ch = Math.min(1 - cy, h + padY * 2);

  // Scale the photo so the crop fills the frame, then offset so the crop's top-left lands at the
  // frame's. The percentage form of background-position is relative to (image − frame), which is
  // exactly the ratio below — and it degrades to centring when the crop spans the whole axis,
  // where that ratio would divide by zero.
  const posX = cw >= 1 ? 50 : (cx / (1 - cw)) * 100;
  const posY = ch >= 1 ? 50 : (cy / (1 - ch)) * 100;

  return {
    backgroundImage:    `url(${photoUrl})`,
    backgroundSize:     `${(1 / cw) * 100}% ${(1 / ch) * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat:   'no-repeat',
  };
}

// The hex is what the model saw; the recipe is ours. gelRecipeFor turns a target colour into the
// gel paste and drop count a baker actually works with — the same table the cream-colour section
// uses, so the two can never disagree about how a colour is mixed.
function ColourRow({ colour, s }) {
  const recipe = gelRecipeFor(colour.hex);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 20, height: 20, borderRadius: 5, background: colour.hex,
        border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2C2A26' }}>
          {readable(colour.role)}
          <span style={{ fontWeight: 600, color: '#8A857D', fontVariantNumeric: 'tabular-nums' }}> · {colour.hex}</span>
        </div>
        {recipe?.recipe && <div style={{ ...s.muted, marginTop: 1 }}>{recipe.recipe}</div>}
      </div>
    </div>
  );
}

// ── Print at actual size ────────────────────────────────────────────────────────────────────────
// Offered only when the size is genuinely known. A greyed button with a tooltip would invite the
// baker to wonder what they did wrong; absent, it simply is not part of this decoration's sheet.
//
// The common reason it is absent is correct behaviour, not a gap: a piped border has no single
// width, and analyzeCake is told to return null rather than invent one.
function TemplateButton({ row, photoUrl, s }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  if (!row.widthMm || !row.bbox || !photoUrl) return null;

  async function print() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await downloadDecorationTemplate({
        photoUrl, bbox: row.bbox, widthMm: row.widthMm, title: row.title,
      });
    } catch (e) {
      setErr(e?.message || 'Could not make the template.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" onClick={print} disabled={busy} style={{
        border: '1.5px solid #E0DDD8', background: busy ? '#F4F1EC' : '#fff', borderRadius: 9,
        cursor: busy ? 'default' : 'pointer', padding: '6px 12px', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 700, color: '#555',
      }}>{busy ? 'Preparing…' : 'Print template — actual size'}</button>
      <span style={s.muted}>{(row.widthMm / 10).toFixed(1)} cm wide on this cake</span>
      {err && <span style={{ fontSize: 12, fontWeight: 700, color: '#C0392B' }}>{err}</span>}
    </div>
  );
}
