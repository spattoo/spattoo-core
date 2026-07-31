import { useEffect, useMemo, useState } from 'react';
import { dietTone, hasAllergen, dietaryLine, findFlavourConflicts, conflictBenchLine } from '../dietary.js';
import { buildXrayReport } from './report.js';
import { buildXrayPdf, shortRef } from './xrayPdf.js';
import { downloadPdf } from '../pdf.js';
import XrayCakeDiagram from './XrayCakeDiagram.jsx';
import XrayTinDiagram from './XrayTinDiagram.jsx';
import { resolveXraySpec } from './resolveXraySpec.js';
import XrayDecorationSteps from './XrayDecorationSteps.jsx';

// Full-screen "X-Ray" report — how to make a placed order's cake: an annotated
// cake diagram (leader lines projected onto each piping), tin sizes, the
// cream-colour mixing table, and the full piping/nozzle list. Opened from the
// order detail; computed client-side from the order's design + weight, with nozzle
// data via apiClient.fetchCraftGuides.
//
// The design comes from resolveXraySpec (design_snapshot, or an AI reading of the order's
// reference photo for a manual order that never touched the designer). Everything below this line
// is identical either way — the tin plan, the gel recipes and the nozzle guides are the same
// deterministic computation over the same shape. The ONE difference is honesty: an fromPhoto
// report says, on screen and on paper, that it was read off a photo rather than measured.

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 4000, background: '#FAFAF8', overflowY: 'auto', fontFamily: 'inherit' },
  header: { position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1.5px solid #EFEAE3', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: 800, color: '#2C2A26' },
  close: { padding: '8px 16px', borderRadius: 10, border: '1.5px solid #E0DDD8', background: '#fff', fontSize: 13, fontWeight: 700, color: '#555', cursor: 'pointer', fontFamily: 'inherit' },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
  dl: (busy) => ({ padding: '8px 16px', borderRadius: 10, border: 'none', background: busy ? '#C9C4BC' : '#2C2A26', fontSize: 13, fontWeight: 700, color: '#fff', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }),
  err: { fontSize: 12, fontWeight: 700, color: '#C0392B', padding: '0 20px 10px' },
  body: { maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 28 },
  sub: { fontSize: 12, fontWeight: 800, color: '#555', letterSpacing: 0.3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 },
  dot: (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
  card: { background: '#fff', border: '1.5px solid #EFEAE3', borderRadius: 14, padding: 14 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #F4F1EC' },
  swatch: (c) => ({ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: c || '#eee', border: '1.5px solid rgba(0,0,0,0.12)' }),
  hex: { fontFamily: 'monospace', fontSize: 12, color: '#888', fontWeight: 700 },
  muted: { fontSize: 12, color: '#9a958d' },
  tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#F4F1EC', color: '#6b6459' },
  tip: (bg, fg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 800, background: bg, color: fg, border: '1px solid rgba(0,0,0,0.06)' }),
  tin: { display: 'inline-block', padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 800, background: '#EEF6FF', color: '#1B5FA8' },
  strength: (lvl) => {
    const c = lvl === 'Strong' ? ['#E6F4EA', '#1E7A35'] : lvl === 'Good' ? ['#FFF6E5', '#B26B00'] : ['#F0EEF6', '#6A5A8C'];
    return { display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 800, background: c[0], color: c[1] };
  },
};

export default function XrayReport({ order, apiClient, onClose }) {
  // One resolution, shared with the launcher and the PDF (resolveXraySpec.js) — the sheet in the
  // kitchen and the screen in the office must be built from the same design.
  const { design, fromPhoto, edited, stale, coverage, decorations: storedSteps } = resolveXraySpec(order);

  const [guides, setGuides] = useState(null);
  const [loading, setLoading] = useState(false);
  const [baker, setBaker] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState(null);
  const [guideRefresh, setGuideRefresh] = useState(0);

  // Everything the report SAYS — one pure call, shared with the PDF (report.js). The screen decides
  // only how it looks.
  const report = useMemo(
    () => buildXrayReport({
      design, weightKg: order?.weight_kg, guides,
      // Both come off the ORDER, not the design — the flavour a tier is baked in and the
      // words the customer typed are neither of them properties of the 3D model.
      flavours: order?.flavours,
      specialInstructions: order?.special_instructions,
    }),
    [design, order?.weight_kg, guides, order?.flavours, order?.special_instructions],
  );
  const { tins: tinPlan, colors, elements: withNozzle, freehand, diagram: diagramItems } = report;

  // Build guides for the baker's own decorations — same rail, same fetch, different guide_type.
  const [buildGuides, setBuildGuides] = useState({});

  useEffect(() => {
    let alive = true;
    const ids = [...report.elementIds, ...report.placeableElementIds];
    if (!ids.length || !apiClient?.fetchCraftGuides) { setGuides({}); return; }
    setLoading(true);
    Promise.resolve(apiClient.fetchCraftGuides(ids))
      .then(rows => {
        if (!alive) return;
        // One rail, two kinds of row. Split by guide_type so `guides` keeps exactly the shape
        // report.js has always consumed — a nozzle lookup — and build guides travel separately
        // instead of being merged into a structure that was never meant to hold them.
        const nozzle = {}, build = {};
        (rows || []).forEach(r => {
          if (r.guide_type === 'fondant_figure') build[r.element_id] = r;
          else nozzle[r.element_id] = r;          // undefined guide_type = a pre-025 row: piping
        });
        setGuides(nozzle); setBuildGuides(build);
      })
      .catch(() => { if (alive) setGuides({}); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [order?.id, guideRefresh]); // eslint-disable-line

  // The bakery's letterhead for the printed sheet. Only the PDF uses it, and a failure is not worth a
  // word on screen — the sheet simply prints without the logo.
  useEffect(() => {
    let alive = true;
    apiClient?.fetchBakerProfile?.()
      .then(p => { if (alive) setBaker(p?.baker ?? p ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient]);

  // The baker's flavour declarations, so the sheet can flag "customer wants nut-free, this
  // is Hazelnut Praline". Fetched rather than read off the order because a conflict is
  // DERIVED from declarations as they stand today — an order stores what was chosen, not
  // what is currently declared about it (dietary.js explains why storing it would rot).
  // A failure means no band, never a wrong one: silence is recoverable, a false all-clear
  // on a bench sheet is not.
  const [declarations, setDeclarations] = useState({});
  useEffect(() => {
    let alive = true;
    if (!apiClient?.fetchBakerFlavours) return;
    apiClient.fetchBakerFlavours()
      .then(list => {
        if (!alive) return;
        setDeclarations(Object.fromEntries(
          (list ?? []).filter(f => f.conflicts_with?.length).map(f => [f.id, f.conflicts_with]),
        ));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient]);

  const conflicts = useMemo(() => findFlavourConflicts({
    flavours:     order?.flavours,
    requirements: order?.dietary_requirements,
    declarations,
  }), [order?.flavours, order?.dietary_requirements, declarations]);

  // The sheet the baker takes to the bench. Built from the report ABOVE — the same data the screen is
  // showing right now, so what he reads here and what he carries in cannot disagree.
  async function download() {
    if (pdfBusy) return;
    setPdfBusy(true); setPdfErr(null);
    try {
      const blob = await buildXrayPdf({
        order, report, baker,
        // Derived here, not again inside the PDF: one derivation, so the sheet cannot
        // disagree with the screen it was printed from.
        conflicts: conflicts.map(c => conflictBenchLine(c, { tierCount: order?.flavours?.length ?? 1 })),
        // Same rule for provenance: resolveXraySpec was called ONCE, at the top of this
        // component, and the sheet is told what it decided rather than deciding again. A PDF that
        // re-resolved could print a measured-looking sheet from an estimate the screen had
        // labelled — and paper is the copy that reaches the bench.
        spec: { fromPhoto, edited, stale, coverage },
        // A modelled topper is made days ahead, at a bench, from paper — so the steps have to be
        // ON the sheet, not only on the screen they were generated from. Element-backed on a
        // designed order, read from the photo on a photo one; identical shape either way.
        decorationSteps: fromPhoto ? storedSteps : buildGuides,
      });
      downloadPdf(blob, `order-${shortRef(order) ?? 'cake'}-xray.pdf`);
    } catch (e) {
      setPdfErr(e?.message || 'Could not make the PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.header}>
        <div style={s.title}>X-Ray — how to make this cake</div>
        <div style={s.actions}>
          {/* Disabled while the nozzle data is still loading: a sheet printed a second early would say
              "No nozzle tagged yet" against every piping, and the baker would believe it. */}
          <button style={s.dl(pdfBusy || loading)} onClick={download} disabled={pdfBusy || loading}>
            {pdfBusy ? 'Making PDF…' : 'Download PDF'}
          </button>
          <button style={s.close} onClick={onClose}>Close</button>
        </div>
      </div>
      {pdfErr && <div style={s.err}>{pdfErr}</div>}

      <div style={s.body}>
        {/* First thing on the sheet, before the cake itself: this is the one item that
            changes what goes in the bowl rather than how it is decorated, and it is the
            one that cannot be corrected later. Imperative wording — it is the
            customer's requirement to meet, not a claim that the cake meets it. */}
        {order.dietary_requirements?.length > 0 && (() => {
          const allergen = hasAllergen(order.dietary_requirements);
          const t = dietTone(allergen ? 'allergen' : 'diet');
          return (
            <div style={{
              border: `2px solid ${t.border}`, background: t.bg, borderRadius: 12,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: t.fg, letterSpacing: 0.4 }}>
                {dietaryLine(order.dietary_requirements)}
              </span>
              {allergen && (
                <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, opacity: 0.85 }}>
                  Allergen — use clean equipment and separate the batch.
                </span>
              )}
            </div>
          );
        })()}

        {/* The contradiction band. Separate from the requirement band above and BELOW it,
            because it is a different statement: that one says what the customer asked for,
            this one says the order disagrees with itself. Black on white in a heavy frame
            for the same reason the printed sheet is — this is the one thing here that
            should stop a baker mid-scan, and it must not depend on a colour surviving. */}
        {conflicts.length > 0 && (
          <div style={{
            border: '2.5px solid #1a1a1a', borderRadius: 12, background: '#fff',
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#1a1a1a' }}>
              CHECK BEFORE BAKING
            </span>
            {conflicts.map((c, i) => (
              <span key={`${c.flavourId}-${c.requirement.key}-${i}`}
                style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>
                {conflictBenchLine(c, { tierCount: order?.flavours?.length ?? 1 })}
              </span>
            ))}
          </div>
        )}

        {/* ── Read off a photo, not measured ─────────────────────────────────
            Third, not first: the two bands above are about the CUSTOMER's requirements, and an
            allergen has to be the first thing read on any sheet. This one is about the sheet
            itself — that everything below it was inferred from a reference photo rather than
            built in the designer.

            It is not decoration. A baker who takes an fromPhoto tin plan for a measured one bakes
            the wrong size, and the difference is invisible once the numbers are on the page. So
            the provenance is stated plainly, above everything it qualifies, and the same
            statement goes on the printed sheet — a report that only admits it on screen is worse
            than one that never admits it, because paper is what goes to the bench. */}
        {fromPhoto && (
          <div style={{
            border: '2px solid #6A5A8C', background: '#F4F1FA', borderRadius: 12,
            padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#4A3D66' }}>
              READ FROM THE REFERENCE PHOTO
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4A3D66' }}>
              This order has no 3D design, so the cake below was worked out from the customer's
              photo{edited ? ', and corrected by you' : ''}. Check the tiers and colours before you bake.
            </span>

            {/* The reference photo has been replaced since this was read. Stated HERE, in the
                provenance band, because this is the one section whose job is to say what the sheet
                is — and a guide about a photo that is no longer on the order is the strongest
                possible version of that claim being wrong. */}
            {stale && (
              <span style={{
                fontSize: 12.5, fontWeight: 800, color: '#8A2E2E',
                background: '#FBEAEA', borderRadius: 8, padding: '7px 10px',
              }}>
                The reference photo has changed since this was made — read it again from the order
                to bring this up to date.
              </span>
            )}

            {/* What could NOT be identified. harvest.js is blunt about why a checklist that
                silently omits is worse than no checklist: it gets believed. An estimate that
                quietly dropped what it could not read would be that same trap one step earlier,
                so the gaps are named here rather than left out. */}
            {coverage?.unidentified?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#4A3D66' }}>
                  {coverage.unidentified.length} thing{coverage.unidentified.length > 1 ? 's' : ''} on the
                  photo could not be identified — they are NOT in the list below:
                </span>
                {coverage.unidentified.map((u, i) => (
                  <span key={i} style={{ fontSize: 12, color: '#4A3D66' }}>
                    · {u.what}{u.placement ? ` (${String(u.placement).replace(/_/g, ' ')})` : ''}
                  </span>
                ))}
              </div>
            )}

            {coverage?.shapeRecognised === false && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4A3D66' }}>
                The cake shape read as “{coverage.reportedShape}” — the tin sizes below assume a round tin.
              </span>
            )}
          </div>
        )}

        {/* ── Checklist ──────────────────────────────────────────────────────
            Everything that has to go ON the cake, in assembly order (tiers bottom
            up, whole-cake finishing last). Until this existed the sheet was
            piping-centric: a lion topper — the most visible thing on a cake and the
            easiest to forget — appeared nowhere on it.

            Numbers run 1..N unbroken across groups so "number 7 is missing" names
            exactly one thing, and the last number is the total.

            READ-ONLY HERE; the BOXES ARE ON THE PRINTED SHEET. Ticking is a claim
            about the physical cake, made at the bench with icing on your hands —
            not something anyone does at a screen. An on-screen box would have to
            persist to mean anything, and a box that silently forgets is worse than
            none because it gets trusted. So the screen reads the list out and the
            paper carries the ticks. */}
        {report.checklist?.length > 0 && (
          <div>
            <div style={s.sub}>
              <span style={s.dot('#2C2A26')} />
              CHECKLIST — {report.checklistTotal} item{report.checklistTotal === 1 ? '' : 's'}
              <span style={{ ...s.muted, fontWeight: 600, marginLeft: 6 }}>
                (tick them off on the printed sheet)
              </span>
            </div>
            <div style={s.card}>
              {report.checklist.map(group => (
                <div key={group.title} style={group.kind === 'instruction' ? {
                  // Framed, because it is a different kind of claim from the rest of the
                  // list. "Lion topper" is something we derived from the design and can
                  // check off objectively; an instruction is the customer's own words,
                  // which only they can say have been honoured. It also leads the list:
                  // these are constraints on everything below, and a don't-forget note
                  // read at the end is read after the mistake.
                  border: '2px solid #2C2A26', borderRadius: 10,
                  padding: '4px 12px 8px', margin: '4px 0 14px',
                } : undefined}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.4, padding: '10px 0 4px',
                    color: group.kind === 'instruction' ? '#2C2A26' : '#9a958d',
                  }}>
                    {group.title.toUpperCase()}
                  </div>
                  {group.items.map(item => (
                    <div key={item.key} style={{ ...s.row, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#9a958d', minWidth: 22, flexShrink: 0 }}>
                        {item.seq}.
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#2C2A26' }}>
                        {item.what}
                        {item.count > 1 && <span style={{ color: '#8A7CB0' }}> × {item.count}</span>}
                        {item.where && <span style={s.muted}>  ·  {item.where}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How to make the baker's own decorations. After the nozzle sections, because piping is
            what happens ON the cake and a modelled topper is made separately, usually ahead. */}
        <XrayDecorationSteps
          design={design} fromPhoto={fromPhoto} storedSteps={storedSteps}
          guides={buildGuides} orderId={order?.id} apiClient={apiClient}
          // The reference photo the spec was read from — the close-up on each decoration is a CSS
          // crop of it, so no second asset is generated, stored or erased.
          photoUrl={order?.design_thumbnail_url}
          onGenerated={() => setGuideRefresh(n => n + 1)} s={s}
        />

        {/* Annotated cake — DESIGNED ORDERS ONLY.
            xrayProject.js lands the leader lines by rebuilding the thumbnail's camera exactly
            (CAMERA_POSITION / CAMERA_FOV / lookAt) and projecting each piping's 3D anchor through
            it. That works because the thumbnail is OUR render, taken with that camera.

            On an fromPhoto order the picture is the customer's phone photo — arbitrary angle,
            arbitrary lens, arbitrary distance — mirrored into design_thumbnail_url by the manual
            order flow. Projecting through the designer's camera would draw confident leader lines
            pointing at the wrong parts of a real cake, which is worse than drawing none: the rest
            of the sheet is honest about being an estimate, and this would quietly contradict it.

            Omitted rather than approximated. Getting it back means the model returning 2D anchors
            on the photo itself; layoutDiagram already separates where a line POINTS (ax/ay) from
            where its label SITS, so it would take pre-projected anchors with little change. */}
        {!fromPhoto && diagramItems.length > 0 && (
          <XrayCakeDiagram thumbnailUrl={order.design_thumbnail_url} items={diagramItems} snapshotTiers={design.tiers} />
        )}

        {/* Tins */}
        {tinPlan.tiers.length > 0 && (
          <div>
            <div style={s.sub}><span style={s.dot('#1B5FA8')} /> Tins &amp; weight {tinPlan.totalKg && <span style={s.tag}>{tinPlan.totalKg} kg · {tinPlan.tiers.length} tier{tinPlan.tiers.length > 1 ? 's' : ''}</span>}</div>
            <div style={s.card}>
              {tinPlan.totalKg
                ? <XrayTinDiagram tiers={tinPlan.tiers} />
                : <div style={s.muted}>Add a weight to the order to size the tins.</div>}

              {/* What goes IN each tin — the sheet never said, and it is the one mistake
                  here that cannot be patched afterwards. Under the diagram rather than
                  inside it: the diagram is about SIZE, and a flavour name is not a
                  dimension. Only rendered for tiers that actually carry one, so a design
                  with no flavours chosen looks the same as it always did. */}
              {tinPlan.tiers.some(t => t.flavour) && (
                <div style={{ marginTop: 12, borderTop: '1px solid #F4F1EC', paddingTop: 10 }}>
                  {tinPlan.tiers.filter(t => t.flavour).map(t => (
                    <div key={t.index} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9a958d', minWidth: 78 }}>{t.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#2C2A26' }}>{t.flavour}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cream colours */}
        {colors.length > 0 && (
          <div>
            <div style={s.sub}><span style={s.dot('#C2569B')} /> Cream colours <span style={s.tag}>{colors.length}</span></div>
            <div style={s.card}>
              {colors.map((c, i) => {
                const rec = c.recipe;
                return (
                  <div key={c.hex} style={{ ...s.row, alignItems: 'flex-start', borderBottom: i === colors.length - 1 ? 'none' : s.row.borderBottom }}>
                    <div style={s.swatch(c.hex)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={s.hex}>{c.hex}</span>
                        <span style={s.muted}>{c.uses.join(', ')}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#444', marginTop: 3 }}>
                        {rec?.recipe}{rec?.approx && <span style={s.muted}> (closest match — adjust by eye)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Piping & nozzles */}
        {(withNozzle.length > 0 || freehand.length > 0) && (
          <div>
            <div style={s.sub}><span style={s.dot('#1E7A35')} /> Piping &amp; nozzles <span style={s.tag}>{withNozzle.length + freehand.length}</span></div>
            <div style={s.card}>
              {loading && <div style={{ ...s.muted, paddingBottom: 8 }}>Loading nozzle suggestions…</div>}

              {withNozzle.map((el) => (
                <div key={el.elementId + el.idx} style={{ ...s.row, alignItems: 'flex-start' }}>
                  <div style={s.swatch(el.color)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={s.tag}>{el.tier} · {el.zone}{el.count > 1 ? ` · ×${el.count}` : ''}</span>
                    </div>
                    {el.primary.length > 0 ? (
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={s.tip('#F3FBF5', '#1E7A35')}>{el.primaryLabel}</span>
                        {el.strength && <span style={s.strength(el.strength.label)}>{el.strength.pct}% match</span>}
                      </div>
                    ) : (
                      <div style={{ ...s.muted, marginTop: 4 }}>{apiClient?.fetchCraftGuides ? 'No nozzle tagged yet' : 'Nozzle data not connected'}</div>
                    )}
                    {el.others.length > 0 && <div style={{ ...s.muted, marginTop: 4 }}>Also: {el.othersLabel}</div>}
                    {(el.guide?.consistency || el.guide?.technique) && (
                      <div style={{ ...s.muted, marginTop: 4 }}>
                        {el.guide.consistency && <b style={{ textTransform: 'capitalize' }}>{el.guide.consistency} cream. </b>}
                        {el.guide.technique}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {freehand.map((f) => (
                <div key={f.key} style={{ ...s.row, alignItems: 'flex-start' }}>
                  <div style={s.swatch(f.color)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#444' }}>Cream pen — {f.shape}</span>
                      {f.tier && <span style={s.tag}>{f.tier}</span>}
                    </div>
                    <div style={{ marginTop: 5 }}><span style={s.tip('#F3FBF5', '#1E7A35')}>{f.tip}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
