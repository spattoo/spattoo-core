// A4 PDF, by hand — no dependency.
//
// Each page is one baseline JPEG drawn full-bleed (DCTDecode). The caller renders a page to a canvas
// (white background) and we wrap the JPEGs in a valid PDF the baker can print at A4. Hand-rolling it
// keeps a PDF library out of a package that every host app bundles; the format we need is small.
//
// Multi-page because a build sheet does not fit on one page: an X-Ray report grows with the cake (a
// four-tier cake with a dozen pipings runs to three sheets), and a report that silently stopped at
// the bottom of page one would be worse than none — the baker would pipe the tiers it listed and miss
// the rest. PhotoSheet still passes a single draw callback and is unaffected.

const A4_PT = { w: 595.28, h: 841.89 };   // A4 in PostScript points (72 dpi)

// pages: [{ bytes: Uint8Array (JPEG), w, h }] → Uint8Array (the PDF).
//
// Object numbering: 1 = Catalog, 2 = Pages, then THREE objects per page (Page, Image, Contents), so
// page i owns 3 + i*3 … 5 + i*3. The xref table must give the byte offset of every one of them, which
// is why `offsets` is tracked as we push rather than computed afterwards.
export function jpegsToA4Pdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  let len = 0;
  const offsets = [];
  const push = (data) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b); len += b.length;
  };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

  const pageObjNum = (i) => 3 + i * 3;
  const kids  = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ');
  const total = 2 + pages.length * 3;

  push('%PDF-1.3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((page, i) => {
    const pageN = pageObjNum(i);
    const imgN  = pageN + 1;
    const contN = pageN + 2;

    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT.w} ${A4_PT.h}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`);

    // Image XObject (binary stream).
    offsets[imgN] = len;
    push(`${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
    push(page.bytes);
    push('\nendstream\nendobj\n');

    const content = `q\n${A4_PT.w} 0 0 ${A4_PT.h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(contN, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
  });

  const xrefStart = len;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const out = new Uint8Array(len);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// A blank A4 canvas at `dpi` (300 → 2480×3508), white — a page to draw on.
export function newA4Canvas({ dpi = 300, portrait = true } = {}) {
  const mm = 25.4;
  const W = Math.round((portrait ? 210 : 297) / mm * dpi);
  const H = Math.round((portrait ? 297 : 210) / mm * dpi);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  return c;
}

// Canvases (in page order) → a PDF blob.
export async function canvasesToPdfBlob(canvases, { quality = 0.92 } = {}) {
  const pages = [];
  for (const c of canvases) {
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
    pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
  }
  return new Blob([jpegsToA4Pdf(pages)], { type: 'application/pdf' });
}

// Render ONE A4 page via a draw callback and return a PDF blob. draw(ctx, { W, H }) works in canvas
// pixels. (PhotoSheet's A4 photo sheet is exactly one page — this is its entry point.)
export async function buildA4Pdf(draw, { dpi = 300, portrait = true } = {}) {
  const c = newA4Canvas({ dpi, portrait });
  const ctx = c.getContext('2d');
  await draw(ctx, { W: c.width, H: c.height });
  return canvasesToPdfBlob([c]);
}

// Trigger the download. The ONE place a generated PDF becomes a file on the baker's device — both
// the photo sheet and the X-Ray report come through here, so the revoke can't be forgotten in one of
// them (an un-revoked object URL holds the whole PDF in memory for the life of the tab).
export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
