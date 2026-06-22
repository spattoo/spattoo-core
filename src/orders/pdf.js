// Minimal single-page A4 PDF that embeds one baseline JPEG full-page (DCTDecode) — no dependency.
// The caller renders the whole A4 sheet to a canvas (white background), exports JPEG bytes, and we
// wrap them in a valid PDF the baker can print at A4.

const A4_PT = { w: 595.28, h: 841.89 };   // A4 in PostScript points (72 dpi)

export function jpegToA4Pdf(jpegBytes) {
  const enc = new TextEncoder();
  const chunks = [];
  let len = 0;
  const offsets = [];
  const push = (data) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b); len += b.length;
  };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

  push('%PDF-1.3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT.w} ${A4_PT.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  // Image XObject (binary stream).
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpegBytes._w} /Height ${jpegBytes._h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push('\nendstream\nendobj\n');

  const content = `q\n${A4_PT.w} 0 0 ${A4_PT.h} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);

  const xrefStart = len;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const out = new Uint8Array(len);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Render an A4 canvas (white) at the given DPI, run a draw callback (px coords), return a PDF blob.
// draw(ctx, { W, H }) places the shaped images + cut guides in canvas pixels.
export async function buildA4Pdf(draw, { dpi = 300, portrait = true } = {}) {
  const mm = 25.4;
  const W = Math.round((portrait ? 210 : 297) / mm * dpi);
  const H = Math.round((portrait ? 297 : 210) / mm * dpi);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  await draw(ctx, { W, H });
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  bytes._w = W; bytes._h = H;
  return new Blob([jpegToA4Pdf(bytes)], { type: 'application/pdf' });
}
