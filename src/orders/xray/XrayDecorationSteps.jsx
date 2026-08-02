import { useState } from 'react';
import { creditsChanged } from '../../billing/creditsBus.js';
import { gelRecipeFor } from './gelLibrary.js';
import { downloadDecorationTemplate } from './decorationTemplate.js';

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
  design, fromPhoto, storedSteps, guides, orderId, photoUrl, decorationMeta, apiClient, onGenerated, s,
}) {
  const rows = fromPhoto ? photoRows(design, storedSteps, decorationMeta) : elementRows(design, guides);
  if (!rows.length) return null;

  return (
    <div>
      <div style={s.sub}><span style={s.dot('#6A5A8C')} /> Decorations — how to make them</div>
      {/* Said once for the whole section, as well as per row. The row badge marks an individual
          guide as unreviewed; this says the FEATURE is AI, which is what a baker deciding whether
          to trust the sheet actually needs to know. The same line is on the printed PDF, because
          paper carries no context around it. */}
      <div style={{ ...s.muted, marginTop: -4, marginBottom: 8 }}>
        Written and illustrated by AI. Check it before you build.
      </div>
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

function photoRows(design, storedSteps, meta) {
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
      // bbox + real width come from decorationMeta, computed ONCE in XrayReport and shared with
      // the PDF. Deriving them here as well would let the screen and the printed sheet disagree
      // about how big a decoration is — and the baker cuts fondant to the printed one.
      bbox:    meta?.[d.id]?.bbox ?? null,
      widthMm: meta?.[d.id]?.widthMm ?? null,
      // The generated build sequence, if one was made. Stored as an R2 key and expanded to a URL
      // by the API (routes/orders.js withStageUrls) — core never learns the bucket.
      stagesUrl: storedSteps?.[d.id]?.stages_url ?? null,
      // A render was ATTEMPTED and did not produce a sheet. Distinct from "never generated", and
      // the whole reason the card can say something honest instead of quietly omitting a picture.
      stagesFailed: storedSteps?.[d.id]?.stages_failed === true,
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
      // The shared build sequence for this element, expanded from its R2 key by the API.
      stagesUrl: row?.stages_url ?? null,
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
  const [freshStages, setFreshStages] = useState(null);

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
        // The sheet, if this run produced one. Held locally so a retry that succeeds shows the
        // picture at once rather than waiting for the parent's refetch.
        setFreshStages(res?.steps?.stages_url ?? null);
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

      {guide && open && (
        <GuideBody
          guide={guide} row={row} photoUrl={photoUrl} s={s}
          stagesUrl={freshStages ?? row.stagesUrl}
          // Offer the retry whenever a PHOTO decoration has words and no sheet.
          //
          // Not gated on `stages_failed`: that flag only started being written today, so every
          // decoration that failed before it exists — which is precisely the set that needs the
          // button — would never show one. The flag is a useful signal and a poor precondition.
          //
          // Sound without it, for a photo row: the steps and the sheet are generated in one
          // request, so a guide that exists means a render was attempted. Words with no picture
          // can only mean it failed. (Element rows are excluded — their retry goes through the
          // catalogue route, which regenerates the whole guide and can charge.)
          onRetryStages={!row.elementId && !freshStages && canGenerate ? generate : null}
          retrying={busy}
        />
      )}
      {open && <TemplateButton row={row} photoUrl={photoUrl} s={s} />}
    </div>
  );
}

// Steps carry ROLE TOKENS ({body}, {mane}) rather than colour names, so one guide serves every
// colour the decoration is ever made in. Rendered as the role word — the colours themselves are on
// the cream-colour table above, and repeating them here would be a second place to get them wrong.
const readable = (text) => String(text ?? '').replace(/\{(\w+)\}/g, (_, role) => role.replace(/_/g, ' '));

function GuideBody({ guide, row, photoUrl, s, stagesUrl, onRetryStages, retrying }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ReferenceAndColours guide={guide} row={row} photoUrl={photoUrl} s={s} />
      <StageGrid stagesUrl={stagesUrl} s={s} />
      {/* ── The sheet we could not draw ────────────────────────────────────────────────
          The steps are the product and the sheet is the improvement, so a failed picture never
          throws away a guide. But saying NOTHING left a baker with a guide that looked complete
          and a picture they had no idea was missing — and, before this, no way to ask again.
          Retrying costs them nothing: the words are already paid for and the render failed on our
          side. */}
      {!stagesUrl && onRetryStages && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      background: '#FBF7F0', border: '1px solid #EFE3CC', borderRadius: 10, padding: '9px 11px' }}>
          <span style={{ fontSize: 11.5, color: '#8A5200', fontWeight: 600, lineHeight: 1.5 }}>
            We couldn't draw the step-by-step sheet for this one. The steps above are complete.
          </span>
          <button type="button" onClick={onRetryStages} disabled={retrying}
            style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 8,
                     border: '1.5px solid #EFE3CC', background: '#fff', color: '#8A5200',
                     fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit',
                     cursor: retrying ? 'default' : 'pointer' }}>
            {retrying ? 'Drawing…' : 'Try the sheet again'}
          </button>
        </div>
      )}
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

// ── The build sequence ──────────────────────────────────────────────────────────────────────────
// ONE generated image showing the decoration at each stage, drawn in a single pass so the object is
// the same object in every panel — separate generations drift, and a sequence whose subject changes
// shape is worse than no pictures.
//
// It carries NO TEXT by design: the model draws, we write. So it sits ABOVE the written steps
// rather than trying to replace them, and a guide without one is still a complete guide — the
// picture is best-effort at generation time and its absence is never an error to report.
function StageGrid({ stagesUrl, s }) {
  if (!stagesUrl) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#8A857D', marginBottom: 5 }}>
        STEP BY STEP
      </div>
      <img
        src={stagesUrl} alt=""
        style={{ width: '100%', maxWidth: 560, borderRadius: 10, border: '1.5px solid #E8E4DE', display: 'block' }}
      />
      {/* "a guide to the shape, not a photograph" matters: these panels look like photographs of
          real fondant, and a baker who takes one literally will expect their piece to match it
          exactly. Deliberately does not say "your photo" — an element-backed guide is drawn from
          the library picture, and only a photo order's is drawn from the customer's. */}
      <div style={{ ...s.muted, marginTop: 4 }}>
        Drawn by AI — a guide to the shape, not a photograph of this cake.
      </div>
    </div>
  );
}
