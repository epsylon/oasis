const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'client', 'assets', 'images', 'snh-oasis.jpg');

const escapePdf = s => String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const linkPattern = /(?:https?:\/\/[^\s]+|www\.[^\s]+|@[A-Za-z0-9+/=.\-]+\.ed25519|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const splitSegments = (line) => {
  const segs = [];
  let last = 0;
  const re = new RegExp(linkPattern.source, 'g');
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) segs.push({ t: line.slice(last, m.index), l: false });
    segs.push({ t: m[0], l: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) segs.push({ t: line.slice(last), l: false });
  return segs;
};

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

function buildLogsPdf(entries, oasisId, opts = {}) {
  const pageW = 612;
  const pageH = 792;
  const marginX = 50;
  const headerH = 90;
  const footerH = 40;
  const bodyTop = pageH - headerH - 22;
  const bodyBottom = footerH + 10;
  const lineH = 12;
  const maxBodyLines = Math.floor((bodyTop - bodyBottom) / lineH);

  let logoBuf = null;
  let logoDims = null;
  try {
    logoBuf = fs.readFileSync(LOGO_PATH);
    logoDims = readJpegDims(logoBuf);
  } catch (_) {}

  const allLines = [];
  for (const e of entries) {
    const ts = new Date(e.ts);
    const when = ts.toISOString().replace('T', ' ').slice(0, 19);
    allLines.push({ kind: 'header', text: `[${when}]:` });
    allLines.push({ kind: 'blank', text: '' });
    for (const l of wrap(e.text, 82)) allLines.push({ kind: 'text', text: l });
    allLines.push({ kind: 'blank', text: '' });
  }
  if (!allLines.length) allLines.push({ kind: 'text', text: '(no entries)' });

  const pages = [];
  for (let i = 0; i < allLines.length; i += maxBodyLines) {
    pages.push(allLines.slice(i, i + maxBodyLines));
  }
  if (!pages.length) pages.push([{ kind: 'text', text: '(no entries)' }]);

  const objects = [];
  const addObj = body => { objects.push(body); return objects.length; };

  const catalogId = addObj(null);
  const pagesId = addObj(null);
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');

  let logoXObjId = null;
  if (logoBuf && logoDims) {
    const colorSpace = logoDims.c === 1 ? '/DeviceGray' : '/DeviceRGB';
    const dict = `<< /Type /XObject /Subtype /Image /Width ${logoDims.w} /Height ${logoDims.h} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBuf.length} >>`;
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
      const logoX = marginX;
      const logoY = pageH - headerH + 15;
      parts.push(`q\n${logoW} 0 0 ${logoH} ${logoX} ${logoY} cm\n/Logo Do\nQ`);
    }

    const titleX = (logoXObjId ? marginX + 80 : marginX);
    const titleY = pageH - 45;
    parts.push(`BT\n/F2 16 Tf\n${titleX} ${titleY} Td\n(${escapePdf('OASIS - Experience logs')}) Tj\nET`);
    const inhabitantPrefix = 'Inhabitant: ';
    const inhabitantPrefixW = inhabitantPrefix.length * 5.4;
    parts.push(`BT\n/F1 9 Tf\n${titleX} ${titleY - 16} Td\n(${escapePdf(inhabitantPrefix)}) Tj\nET`);
    parts.push(`BT\n/F2 9 Tf\n${titleX + inhabitantPrefixW} ${titleY - 16} Td\n(${escapePdf(String(oasisId || ''))}) Tj\nET`);

    parts.push(`q\n0.6 0.6 0.6 RG\n0.5 w\n${marginX} ${pageH - headerH} m\n${pageW - marginX} ${pageH - headerH} l\nS\nQ`);

    let y = bodyTop;
    const charW = 6;
    for (const ln of pg) {
      if (ln.kind === 'header') {
        parts.push(`BT\n/F2 10 Tf\n1 0.647 0 rg\n${marginX} ${y} Td\n(${escapePdf(ln.text)}) Tj\nET`);
      } else if (ln.text) {
        const segs = splitSegments(ln.text);
        let x = marginX;
        for (const s of segs) {
          if (!s.t) continue;
          const color = s.l ? '0 0 1 rg' : '0 0 0 rg';
          parts.push(`BT\n/F1 10 Tf\n${color}\n${x} ${y} Td\n(${escapePdf(s.t)}) Tj\nET`);
          x += s.t.length * charW;
        }
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
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(Buffer.from(xref, 'binary'));

  return Buffer.concat(chunks);
}

module.exports = { buildLogsPdf };
