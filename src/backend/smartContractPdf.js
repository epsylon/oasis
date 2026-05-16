const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'client', 'assets', 'images', 'snh-oasis.jpg');

const escapePdf = s => String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrap = (txt, max = 82) => {
  const out = [];
  for (const raw of String(txt || '').split('\n')) {
    let line = raw;
    while (line.length > max) {
      let cut = line.lastIndexOf(' ', max);
      if (cut <= 0) cut = max;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^\s+/, '');
    }
    out.push(line);
  }
  return out;
};

const readJpegDims = (buf) => {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const marker = buf[i + 1];
    if (marker === 0xD8 || marker === 0xD9) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      const c = buf[i + 9];
      return { w, h, c };
    }
    i += 2 + len;
  }
  return null;
};

function buildSmartContractPdf({ transfer, block, viewerId }) {
  const pageW = 612;
  const pageH = 792;
  const marginX = 50;
  const headerH = 90;
  const footerH = 40;
  const bodyTop = pageH - headerH - 24;
  const bodyBottom = footerH + 10;
  const lineH = 14;

  let logoBuf = null;
  let logoDims = null;
  try {
    logoBuf = fs.readFileSync(LOGO_PATH);
    logoDims = readJpegDims(logoBuf);
  } catch (_) {}

  const t = transfer || {};
  const b = block || {};
  const fmt = v => (v === undefined || v === null) ? '' : String(v);
  const fmtAmount = () => {
    const cat = String(t.category || 'ECONOMIC').toUpperCase();
    const unit = cat === 'TIME' ? 'h' : cat === 'TRUST' ? 'trust' : 'ECO';
    return `${Number(t.amount || 0).toFixed(6)} ${unit}`;
  };
  const fmtDate = v => v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';
  const confirmedBy = Array.isArray(t.confirmedBy) ? t.confirmedBy : [];
  const required = t.from === t.to ? 1 : 2;
  const confirmedCount = confirmedBy.length;
  const tags = Array.isArray(t.tags) ? t.tags.join(', ') : '';

  const sections = [];
  sections.push({ kind: 'title', text: `Concept: ${t.concept || '-'}` });
  sections.push({ kind: 'blank' });

  sections.push({ kind: 'section', text: 'OASIS IDs' });
  sections.push({ kind: 'kv', label: 'From',   value: fmt(t.from) });
  sections.push({ kind: 'kv', label: 'To',     value: fmt(t.to) });
  sections.push({ kind: 'blank' });

  sections.push({ kind: 'section', text: 'TERMS' });
  sections.push({ kind: 'kv', label: 'Category', value: String(t.category || 'ECONOMIC').toUpperCase() });
  if (String(t.category || '').toUpperCase() !== 'TRUST') sections.push({ kind: 'kv', label: 'Amount', value: fmtAmount() });
  sections.push({ kind: 'kv', label: 'Status', value: fmt(t.status) });
  if (t.deadline) sections.push({ kind: 'kv', label: 'Deadline', value: fmtDate(t.deadline) });
  if (tags) sections.push({ kind: 'kv', label: 'Tags', value: tags });
  sections.push({ kind: 'blank' });

  sections.push({ kind: 'section', text: 'CONFIRMATIONS' });
  sections.push({ kind: 'kv', label: 'Required', value: String(required) });
  sections.push({ kind: 'kv', label: 'Confirmed', value: String(confirmedCount) });
  if (confirmedBy.length) {
    for (const f of confirmedBy) sections.push({ kind: 'kv', label: 'Signed by', value: fmt(f) });
  }
  sections.push({ kind: 'blank' });

  sections.push({ kind: 'section', text: 'BLOCK VERIFICATION' });
  if (b && b.id) {
    sections.push({ kind: 'kv', label: 'Block ID', value: fmt(b.id) });
    if (b.ts) sections.push({ kind: 'kv', label: 'Block Timestamp', value: fmtDate(b.ts) });
    if (b.type) sections.push({ kind: 'kv', label: 'Block Type', value: String(b.type).toUpperCase() });
    if (b.author) sections.push({ kind: 'kv', label: 'Block Author', value: fmt(b.author) });
    if (b.size) sections.push({ kind: 'kv', label: 'Block Size', value: `${b.size} bytes` });
  } else {
    sections.push({ kind: 'kv', label: 'Block ID', value: fmt(t.id) });
  }
  sections.push({ kind: 'blank' });

  sections.push({ kind: 'section', text: 'METADATA' });
  sections.push({ kind: 'kv', label: 'Transfer ID', value: fmt(t.id) });
  if (t.createdAt) sections.push({ kind: 'kv', label: 'Created At', value: fmtDate(t.createdAt) });
  if (t.updatedAt) sections.push({ kind: 'kv', label: 'Updated At', value: fmtDate(t.updatedAt) });

  const lines = [];
  for (const s of sections) {
    if (s.kind === 'kv') {
      const txt = `${s.label}: ${s.value}`;
      for (const w of wrap(txt, 82)) lines.push({ kind: 'kv', text: w });
    } else {
      lines.push(s);
    }
  }

  const maxBodyLines = Math.floor((bodyTop - bodyBottom) / lineH);
  const pages = [];
  for (let i = 0; i < lines.length; i += maxBodyLines) pages.push(lines.slice(i, i + maxBodyLines));
  if (!pages.length) pages.push([]);

  const objects = [];
  const addObj = body => { objects.push(body); return objects.length; };

  const catalogId = addObj(null);
  const pagesId = addObj(null);
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  let logoXObjId = null;
  if (logoBuf && logoDims) {
    const cs = logoDims.c === 1 ? '/DeviceGray' : '/DeviceRGB';
    const dict = `<< /Type /XObject /Subtype /Image /Width ${logoDims.w} /Height ${logoDims.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBuf.length} >>`;
    logoXObjId = addObj({ dict, stream: logoBuf });
  }

  const exportDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const footerLeft = `Generated: ${exportDate}`;

  const pageIds = [];
  const contentIds = [];

  pages.forEach((pg, pgIdx) => {
    const parts = [];
    if (logoXObjId) {
      const logoH = 60;
      const logoW = Math.round((logoDims.w / logoDims.h) * logoH);
      parts.push(`q\n${logoW} 0 0 ${logoH} ${marginX} ${pageH - headerH + 15} cm\n/Logo Do\nQ`);
    }
    const titleX = (logoXObjId ? marginX + 80 : marginX);
    const titleY = pageH - 45;
    parts.push(`BT\n/F2 16 Tf\n${titleX} ${titleY} Td\n(${escapePdf('OASIS - Smart Contract')}) Tj\nET`);
    const prefix = 'Issued to: ';
    const prefixW = prefix.length * 5.4;
    parts.push(`BT\n/F1 9 Tf\n${titleX} ${titleY - 16} Td\n(${escapePdf(prefix)}) Tj\nET`);
    parts.push(`BT\n/F2 9 Tf\n${titleX + prefixW} ${titleY - 16} Td\n(${escapePdf(String(viewerId || ''))}) Tj\nET`);

    parts.push(`q\n0.6 0.6 0.6 RG\n0.5 w\n${marginX} ${pageH - headerH} m\n${pageW - marginX} ${pageH - headerH} l\nS\nQ`);

    let y = bodyTop;
    for (const ln of pg) {
      if (ln.kind === 'title') {
        parts.push(`BT\n/F2 14 Tf\n0 0 0 rg\n${marginX} ${y} Td\n(${escapePdf(ln.text)}) Tj\nET`);
      } else if (ln.kind === 'subtitle') {
        parts.push(`BT\n/F1 11 Tf\n0.2 0.2 0.2 rg\n${marginX} ${y} Td\n(${escapePdf(ln.text)}) Tj\nET`);
      } else if (ln.kind === 'section') {
        parts.push(`BT\n/F2 11 Tf\n0 0 0 rg\n${marginX} ${y} Td\n(${escapePdf(ln.text)}) Tj\nET`);
        parts.push(`q\n0 0 0 RG\n0.5 w\n${marginX} ${y - 3} m\n${pageW - marginX} ${y - 3} l\nS\nQ`);
      } else if (ln.kind === 'kv') {
        parts.push(`BT\n/F1 10 Tf\n0 0 0 rg\n${marginX} ${y} Td\n(${escapePdf(ln.text)}) Tj\nET`);
      }
      y -= lineH;
    }

    parts.push(`q\n0.6 0.6 0.6 RG\n0.5 w\n${marginX} ${footerH + 5} m\n${pageW - marginX} ${footerH + 5} l\nS\nQ`);
    parts.push(`BT\n/F1 8 Tf\n${marginX} ${footerH - 10} Td\n(${escapePdf(footerLeft)}) Tj\nET`);
    const pageLabel = `Page ${pgIdx + 1} of ${pages.length}`;
    const pageLabelW = pageLabel.length * 4.8;
    parts.push(`BT\n/F1 8 Tf\n${pageW - marginX - pageLabelW} ${footerH - 10} Td\n(${escapePdf(pageLabel)}) Tj\nET`);

    const content = parts.join('\n');
    const stream = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    const cid = addObj(stream);
    contentIds.push(cid);
    const pid = addObj(null);
    pageIds.push(pid);
  });

  for (let i = 0; i < pageIds.length; i++) {
    const resources = logoXObjId
      ? `<< /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${logoXObjId} 0 R >> >>`
      : `<< /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >>`;
    objects[pageIds[i] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentIds[i]} 0 R /Resources ${resources} >>`;
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks = [];
  const offsets = [0];
  let byteLen = 0;
  const push = (buf) => { chunks.push(buf); byteLen += buf.length; };
  push(Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary'));
  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteLen);
    const obj = objects[i];
    if (obj && typeof obj === 'object' && obj.dict && obj.stream) {
      push(Buffer.from(`${i + 1} 0 obj\n${obj.dict}\nstream\n`, 'binary'));
      push(obj.stream);
      push(Buffer.from('\nendstream\nendobj\n', 'binary'));
    } else {
      push(Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'binary'));
    }
  }
  const xrefStart = byteLen;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(Buffer.from(xref, 'binary'));
  return Buffer.concat(chunks);
}

module.exports = { buildSmartContractPdf };
