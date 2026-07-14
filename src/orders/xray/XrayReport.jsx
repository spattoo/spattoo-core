import { useEffect, useMemo, useState } from 'react';
import { buildXrayReport } from './report.js';
import { buildXrayPdf, shortRef } from './xrayPdf.js';
import { downloadPdf } from '../pdf.js';
import XrayCakeDiagram from './XrayCakeDiagram.jsx';
import XrayTinDiagram from './XrayTinDiagram.jsx';

// Full-screen "X-Ray" report — how to make a placed order's cake: an annotated
// cake diagram (leader lines projected onto each piping), tin sizes, the
// cream-colour mixing table, and the full piping/nozzle list. Opened from the
// order detail; computed client-side from design_snapshot + weight, with nozzle
// data via apiClient.fetchCraftGuides.

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
  const design = order?.design_snapshot;

  const [guides, setGuides] = useState(null);
  const [loading, setLoading] = useState(false);
  const [baker, setBaker] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState(null);

  // Everything the report SAYS — one pure call, shared with the PDF (report.js). The screen decides
  // only how it looks.
  const report = useMemo(
    () => buildXrayReport({ design, weightKg: order?.weight_kg, guides }),
    [design, order?.weight_kg, guides],
  );
  const { tins: tinPlan, colors, elements: withNozzle, freehand, diagram: diagramItems } = report;

  useEffect(() => {
    let alive = true;
    if (!report.elementIds.length || !apiClient?.fetchCraftGuides) { setGuides({}); return; }
    setLoading(true);
    Promise.resolve(apiClient.fetchCraftGuides(report.elementIds))
      .then(rows => { if (!alive) return; const m = {}; (rows || []).forEach(r => { m[r.element_id] = r; }); setGuides(m); })
      .catch(() => { if (alive) setGuides({}); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [order?.id]); // eslint-disable-line

  // The bakery's letterhead for the printed sheet. Only the PDF uses it, and a failure is not worth a
  // word on screen — the sheet simply prints without the logo.
  useEffect(() => {
    let alive = true;
    apiClient?.fetchBakerProfile?.()
      .then(p => { if (alive) setBaker(p?.baker ?? p ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient]);

  // The sheet the baker takes to the bench. Built from the report ABOVE — the same data the screen is
  // showing right now, so what he reads here and what he carries in cannot disagree.
  async function download() {
    if (pdfBusy) return;
    setPdfBusy(true); setPdfErr(null);
    try {
      const blob = await buildXrayPdf({ order, report, baker });
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
        {/* Annotated cake */}
        {diagramItems.length > 0 && (
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
