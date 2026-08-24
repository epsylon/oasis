const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'client', 'assets', 'images', 'snh-oasis.jpg');

const { escapePdf } = require('./pdfDocument');

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

function buildCertificatePdf({ cert, course, studentName, teacherName }) {
  const pageW = 792;
  const pageH = 612;
  const margin = 40;

  let logoBuf = null;
  let logoDims = null;
  try {
    logoBuf = fs.readFileSync(LOGO_PATH);
    logoDims = readJpegDims(logoBuf);
  } catch (_) {}

  const c = cert || {};
  const courseTitle = String((course && course.title) || c.courseTitle || 'Oasis Course');
  const issued = c.createdAt ? new Date(c.createdAt) : new Date();
  const issuedStr = issued.toISOString().slice(0, 10);

  const charW = (size) => size * 0.6;
  const centered = (text, size, font, y, rgb = '0 0 0') => {
    const t = String(text || '');
    const x = Math.max(margin, (pageW - t.length * charW(size)) / 2);
    return `BT\n/${font} ${size} Tf\n${rgb} rg\n${x} ${y} Td\n(${escapePdf(t)}) Tj\nET`;
  };

  const parts = [];

  parts.push(`q\n0.85 0.65 0.1 RG\n3 w\n${margin} ${margin} ${pageW - margin * 2} ${pageH - margin * 2} re\nS\nQ`);
  parts.push(`q\n0.3 0.3 0.3 RG\n1 w\n${margin + 8} ${margin + 8} ${pageW - (margin + 8) * 2} ${pageH - (margin + 8) * 2} re\nS\nQ`);

  if (logoBuf && logoDims) {
    const logoH = 64;
    const logoW = Math.round((logoDims.w / logoDims.h) * logoH);
    parts.push(`q\n${logoW} 0 0 ${logoH} ${(pageW - logoW) / 2} ${pageH - 140} cm\n/Logo Do\nQ`);
  }

  parts.push(centered('OASIS', 26, 'F2', pageH - 175));
  parts.push(centered('CERTIFICATE OF COMPLETION', 16, 'F2', pageH - 205, '0.55 0.4 0.05'));

  parts.push(centered('This certifies that', 11, 'F1', pageH - 250, '0.25 0.25 0.25'));
  parts.push(centered(studentName || c.student || '', 18, 'F2', pageH - 280));
  if (studentName && c.student && studentName !== c.student) {
    parts.push(centered(c.student, 7, 'F1', pageH - 296, '0.45 0.45 0.45'));
  }

  parts.push(centered('has successfully completed the course', 11, 'F1', pageH - 330, '0.25 0.25 0.25'));
  parts.push(centered(courseTitle, 16, 'F2', pageH - 360));

  if (c.text) parts.push(centered(`"${String(c.text).slice(0, 90)}"`, 10, 'F1', pageH - 392, '0.3 0.3 0.3'));

  parts.push(centered(`Issued on ${issuedStr}`, 10, 'F1', pageH - 425, '0.25 0.25 0.25'));

  const sigY = 135;
  parts.push(`q\n0.3 0.3 0.3 RG\n0.7 w\n${margin + 60} ${sigY + 14} m\n${margin + 280} ${sigY + 14} l\nS\nQ`);
  parts.push(`BT\n/F2 11 Tf\n0 0 0 rg\n${margin + 60} ${sigY} Td\n(${escapePdf(teacherName || c.author || '')}) Tj\nET`);
  parts.push(`BT\n/F1 8 Tf\n0.35 0.35 0.35 rg\n${margin + 60} ${sigY - 13} Td\n(${escapePdf('Teacher')}) Tj\nET`);
  if (teacherName && c.author && teacherName !== c.author) {
    parts.push(`BT\n/F1 6 Tf\n0.45 0.45 0.45 rg\n${margin + 60} ${sigY - 24} Td\n(${escapePdf(c.author)}) Tj\nET`);
  }

  parts.push(centered('Cryptographically signed on the Oasis P2P network — verifiable by anyone', 8, 'F1', margin + 30, '0.35 0.35 0.35'));
  if (c.id) parts.push(centered(`Certificate ID: ${c.id}`, 6, 'F1', margin + 18, '0.45 0.45 0.45'));

  const content = parts.join('\n');

  const objects = [];
  const addObj = body => { objects.push(body); return objects.length; };

  const catalogId = addObj(null);
  const pagesId = addObj(null);
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  let logoXObjId = null;
  if (logoBuf && logoDims) {
    const cs = logoDims.c === 1 ? '/DeviceGray' : '/DeviceRGB';
    const dict = `<< /Type /XObject /Subtype /Image /Width ${logoDims.w} /Height ${logoDims.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBuf.length} >>`;
    logoXObjId = addObj({ dict, stream: logoBuf });
  }

  const stream = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  const contentId = addObj(stream);
  const pageId = addObj(null);

  const resources = logoXObjId
    ? `<< /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${logoXObjId} 0 R >> >>`
    : `<< /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >>`;
  objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources ${resources} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;

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

module.exports = { buildCertificatePdf };
