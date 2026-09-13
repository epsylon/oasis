const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { plainText } = require('./renderStyledText');

const LOGO_PATH = path.join(__dirname, '..', 'client', 'assets', 'images', 'snh-oasis.jpg');

const WIN_ANSI_HIGH = {
  '\u20AC': '\x80', '\u201A': '\x82', '\u0192': '\x83', '\u201E': '\x84',
  '\u2026': '\x85', '\u2020': '\x86', '\u2021': '\x87', '\u02C6': '\x88',
  '\u2030': '\x89', '\u0160': '\x8A', '\u2039': '\x8B', '\u0152': '\x8C',
  '\u017D': '\x8E', '\u2018': '\x91', '\u2019': '\x92', '\u201C': '\x93',
  '\u201D': '\x94', '\u2022': '\x95', '\u2013': '\x96', '\u2014': '\x97',
  '\u02DC': '\x98', '\u2122': '\x99', '\u0161': '\x9A', '\u203A': '\x9B',
  '\u0153': '\x9C', '\u017E': '\x9E', '\u0178': '\x9F'
};

const escapePdf = s => String(s == null ? '' : s)
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/[\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g,
    (c) => WIN_ANSI_HIGH[c] || '?')
  .replace(/[^\x20-\xFF\x80-\x9F]/g, '?')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const wrap = (txt, max = 82) => {
  const out = [];
  for (const raw of String(txt == null ? '' : txt).split('\n')) {
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

const decodePng = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8;
  let w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  let palette = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h || depth !== 8 || interlace !== 0 || !idat.length) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (_) { return null; }
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  let inPos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[inPos++];
    const cur = Buffer.from(raw.slice(inPos, inPos + stride));
    inPos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const s = x * channels;
      if (colorType === 2 || colorType === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; }
      else if (colorType === 0 || colorType === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; }
      else if (colorType === 3 && palette) { const pi = cur[s] * 3; out[o] = palette[pi]; out[o + 1] = palette[pi + 1]; out[o + 2] = palette[pi + 2]; }
      if (colorType === 6 || colorType === 4) {
        const alpha = cur[s + channels - 1] / 255;
        out[o] = Math.round(out[o] * alpha + 255 * (1 - alpha));
        out[o + 1] = Math.round(out[o + 1] * alpha + 255 * (1 - alpha));
        out[o + 2] = Math.round(out[o + 2] * alpha + 255 * (1 - alpha));
      }
    }
    prev = cur;
  }
  return { w, h, rgb: out };
};

const imageXObject = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const dims = readJpegDims(buf);
    if (!dims) return null;
    const cs = dims.c === 1 ? '/DeviceGray' : '/DeviceRGB';
    return { w: dims.w, h: dims.h, dict: `<< /Type /XObject /Subtype /Image /Width ${dims.w} /Height ${dims.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${buf.length} >>`, stream: buf };
  }
  const png = decodePng(buf);
  if (!png) return null;
  const compressed = zlib.deflateSync(png.rgb);
  return { w: png.w, h: png.h, dict: `<< /Type /XObject /Subtype /Image /Width ${png.w} /Height ${png.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>`, stream: compressed };
};

const flattenSections = (sections) => {
  const lines = [];
  for (const s of Array.isArray(sections) ? sections : []) {
    if (!s) continue;
    if (s.kind === 'image') {
      const xo = imageXObject(s.buffer);
      if (xo) lines.push({ kind: 'image', xo, caption: s.caption || '' });
      else if (s.caption) lines.push({ kind: 'kv', text: `[image: ${s.caption}]` });
    } else if (s.kind === 'kv') {
      const txt = `${s.label}: ${s.value == null ? '' : s.value}`;
      for (const w of wrap(txt, 82)) lines.push({ kind: 'kv', text: w });
    } else if (s.kind === 'text') {
      for (const w of wrap(plainText(s.text), 82)) lines.push({ kind: 'kv', text: w });
    } else {
      lines.push({ kind: s.kind, text: s.text });
    }
  }
  return lines;
};

function buildDocumentPdf({ title, issuedToLabel, issuedTo, sections } = {}) {
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

  const lines = flattenSections(sections);
  const maxImgW = 240;
  const maxImgH = 160;
  const imageBox = (xo) => {
    const scale = Math.min(1, maxImgW / xo.w, maxImgH / xo.h);
    return { w: Math.round(xo.w * scale), h: Math.round(xo.h * scale) };
  };
  const heightOf = (ln) => ln.kind === 'image' ? imageBox(ln.xo).h + lineH : lineH;

  const bodyHeight = bodyTop - bodyBottom;
  const pages = [];
  let current = [];
  let used = 0;
  for (const ln of lines) {
    const hgt = Math.min(heightOf(ln), bodyHeight);
    if (used + hgt > bodyHeight && current.length) { pages.push(current); current = []; used = 0; }
    current.push(ln);
    used += hgt;
  }
  pages.push(current);

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

  const imageIds = new Map();
  for (const ln of lines) {
    if (ln.kind !== 'image') continue;
    const id = addObj({ dict: ln.xo.dict, stream: ln.xo.stream });
    imageIds.set(ln, id);
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
    parts.push(`BT\n/F2 16 Tf\n${titleX} ${titleY} Td\n(${escapePdf(title || 'OASIS')}) Tj\nET`);
    if (issuedTo) {
      const prefix = `${issuedToLabel || 'Issued to'}: `;
      const prefixW = prefix.length * 5.4;
      parts.push(`BT\n/F1 9 Tf\n${titleX} ${titleY - 16} Td\n(${escapePdf(prefix)}) Tj\nET`);
      parts.push(`BT\n/F2 9 Tf\n${titleX + prefixW} ${titleY - 16} Td\n(${escapePdf(String(issuedTo))}) Tj\nET`);
    }

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
      } else if (ln.kind === 'image') {
        const box = imageBox(ln.xo);
        parts.push(`q\n${box.w} 0 0 ${box.h} ${marginX} ${y - box.h + lineH - 4} cm\n/Im${imageIds.get(ln)} Do\nQ`);
        y -= box.h;
      }
      y -= lineH;
    }

    parts.push(`q\n0.6 0.6 0.6 RG\n0.5 w\n${marginX} ${footerH + 5} m\n${pageW - marginX} ${footerH + 5} l\nS\nQ`);
    parts.push(`BT\n/F1 8 Tf\n${marginX} ${footerH - 10} Td\n(${escapePdf(footerLeft)}) Tj\nET`);
    const pageLabel = `Page ${pgIdx + 1} of ${pages.length}`;
    const pageLabelW = pageLabel.length * 4.8;
    parts.push(`BT\n/F1 8 Tf\n${pageW - marginX - pageLabelW} ${footerH - 10} Td\n(${escapePdf(pageLabel)}) Tj\nET`);

    const content = parts.join('\n');
    const stream = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
    const cid = addObj(stream);
    contentIds.push(cid);
    const pid = addObj(null);
    pageIds.push(pid);
  });

  const imageRefs = Array.from(imageIds.values()).map(id => `/Im${id} ${id} 0 R`).join(' ');
  for (let i = 0; i < pageIds.length; i++) {
    const xobjects = [logoXObjId ? `/Logo ${logoXObjId} 0 R` : '', imageRefs].filter(Boolean).join(' ');
    const resources = xobjects
      ? `<< /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << ${xobjects} >> >>`
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

const fmtDate = v => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
};

const fmtDay = v => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

const asList = v => (Array.isArray(v) ? v : []);
const txt = v => (v == null ? '' : String(v));

const humanLabel = (key) => String(key || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, c => c.toUpperCase());

const pushMeta = (out, item) => {
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'METADATA' });
  if (item.id) out.push({ kind: 'kv', label: 'Content ID', value: item.id });
  const author = item.author || item.organizer || item.createdBy || item.from || '';
  if (author) out.push({ kind: 'kv', label: 'Author', value: author });
  if (item.createdAt) out.push({ kind: 'kv', label: 'Created At', value: fmtDate(item.createdAt) });
  if (item.updatedAt) out.push({ kind: 'kv', label: 'Updated At', value: fmtDate(item.updatedAt) });
};

const pushOpinions = (out, item) => {
  const op = item.opinions && typeof item.opinions === 'object' ? item.opinions : {};
  const entries = Object.entries(op).filter(([, n]) => Number(n) > 0);
  if (!entries.length) return;
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'OPINIONS' });
  for (const [cat, n] of entries) out.push({ kind: 'kv', label: humanLabel(cat), value: String(n) });
};

const pushTags = (out, item) => {
  const tags = asList(item.tags).filter(Boolean);
  if (tags.length) out.push({ kind: 'kv', label: 'Tags', value: tags.join(', ') });
};

const reportSections = (report) => {
  const out = [];
  out.push({ kind: 'title', text: `Report: ${txt(report.title) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'CLASSIFICATION' });
  out.push({ kind: 'kv', label: 'Category', value: txt(report.category).toUpperCase() });
  out.push({ kind: 'kv', label: 'Severity', value: txt(report.severity).toUpperCase() });
  out.push({ kind: 'kv', label: 'Status', value: txt(report.status).toUpperCase() });
  pushTags(out, report);

  if (txt(report.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'text', text: report.description });
  }

  const tpl = report.template && typeof report.template === 'object' ? report.template : {};
  const tplEntries = Object.entries(tpl).filter(([, v]) => txt(v).trim());
  if (tplEntries.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DETAILS' });
    for (const [k, v] of tplEntries) out.push({ kind: 'kv', label: humanLabel(k), value: v });
  }

  const confirmations = asList(report.confirmations);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'CONFIRMATIONS' });
  out.push({ kind: 'kv', label: 'Confirmed', value: String(confirmations.length) });
  for (const c of confirmations) out.push({ kind: 'kv', label: 'Confirmed by', value: c });

  pushOpinions(out, report);
  pushMeta(out, report);
  return out;
};

const voteSections = (vote) => {
  const out = [];
  out.push({ kind: 'title', text: `Votation: ${txt(vote.question) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'TERMS' });
  out.push({ kind: 'kv', label: 'Status', value: txt(vote.status).toUpperCase() });
  if (vote.deadline) out.push({ kind: 'kv', label: 'Deadline', value: fmtDate(vote.deadline) });
  pushTags(out, vote);

  const votes = vote.votes && typeof vote.votes === 'object' ? vote.votes : {};
  const total = Number(vote.totalVotes) || asList(vote.voters).length;
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'RESULTS' });
  out.push({ kind: 'kv', label: 'Total votes', value: String(total) });
  for (const [choice, n] of Object.entries(votes)) {
    const count = Number(n) || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    out.push({ kind: 'kv', label: choice, value: `${count} (${pct}%)` });
  }

  pushOpinions(out, vote);
  pushMeta(out, vote);
  return out;
};

const eventSections = (event) => {
  const out = [];
  out.push({ kind: 'title', text: `Event: ${txt(event.title) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'SCHEDULE' });
  out.push({ kind: 'kv', label: 'Date', value: fmtDate(event.date) });
  out.push({ kind: 'kv', label: 'Status', value: txt(event.status).toUpperCase() });
  if (event.location) out.push({ kind: 'kv', label: 'Location', value: event.location });
  if (event.mapUrl) out.push({ kind: 'kv', label: 'Map', value: event.mapUrl });
  if (Number(event.price) > 0) out.push({ kind: 'kv', label: 'Price', value: `${Number(event.price)} ECO` });
  out.push({ kind: 'kv', label: 'Privacy', value: txt(event.isPublic).toUpperCase() });
  if (event.url) out.push({ kind: 'kv', label: 'Url', value: event.url });
  pushTags(out, event);

  if (txt(event.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'text', text: event.description });
  }

  const attendees = asList(event.attendees);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'ATTENDEES' });
  out.push({ kind: 'kv', label: 'Total', value: String(attendees.length) });
  for (const a of attendees) out.push({ kind: 'kv', label: 'Attendee', value: a });

  pushOpinions(out, event);
  pushMeta(out, event);
  return out;
};

const taskSections = (task) => {
  const out = [];
  out.push({ kind: 'title', text: `Task: ${txt(task.title) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'SCHEDULE' });
  out.push({ kind: 'kv', label: 'Status', value: txt(task.status).toUpperCase() });
  out.push({ kind: 'kv', label: 'Priority', value: txt(task.priority).toUpperCase() });
  if (task.startTime) out.push({ kind: 'kv', label: 'Starts', value: fmtDate(task.startTime) });
  if (task.endTime) out.push({ kind: 'kv', label: 'Ends', value: fmtDate(task.endTime) });
  if (task.location) out.push({ kind: 'kv', label: 'Location', value: task.location });
  out.push({ kind: 'kv', label: 'Privacy', value: txt(task.isPublic).toUpperCase() });
  pushTags(out, task);

  if (txt(task.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'text', text: task.description });
  }

  const assignees = asList(task.assignees);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'ASSIGNEES' });
  out.push({ kind: 'kv', label: 'Total', value: String(assignees.length) });
  for (const a of assignees) out.push({ kind: 'kv', label: 'Assignee', value: a });

  pushOpinions(out, task);
  pushMeta(out, task);
  return out;
};

const calendarSections = (calendar, extra = {}) => {
  const dates = asList(extra.dates);
  const notesByDate = extra.notesByDate && typeof extra.notesByDate === 'object' ? extra.notesByDate : {};

  const out = [];
  out.push({ kind: 'title', text: `Calendar: ${txt(calendar.title) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'SUMMARY' });
  out.push({ kind: 'kv', label: 'Status', value: calendar.isClosed ? 'CLOSED' : txt(calendar.status).toUpperCase() });
  if (calendar.deadline) out.push({ kind: 'kv', label: 'Deadline', value: fmtDate(calendar.deadline) });
  if (calendar.mapUrl) out.push({ kind: 'kv', label: 'Map', value: calendar.mapUrl });
  out.push({ kind: 'kv', label: 'Participants', value: String(asList(calendar.participants).length) });
  out.push({ kind: 'kv', label: 'Dates', value: String(dates.length) });
  const noteTotal = Object.values(notesByDate).reduce((n, arr) => n + asList(arr).length, 0);
  out.push({ kind: 'kv', label: 'Notes', value: String(noteTotal) });
  pushTags(out, calendar);

  const participants = asList(calendar.participants);
  if (participants.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'PARTICIPANTS' });
    for (const p of participants) out.push({ kind: 'kv', label: 'Participant', value: p });
  }

  if (dates.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DATES' });
    for (const d of dates) {
      const day = fmtDay(d && d.date) || txt(d && d.date);
      out.push({ kind: 'kv', label: day, value: txt(d && d.label) });
      for (const note of asList(notesByDate[d && d.key])) {
        const noteText = txt(note && note.text);
        if (noteText) out.push({ kind: 'text', text: `    - ${noteText}` });
      }
    }
  }

  pushMeta(out, calendar);
  return out;
};

const cvSections = (cv) => {
  const out = [];
  out.push({ kind: 'title', text: `Curriculum: ${txt(cv.name) || txt(cv.author) || '-'}` });
  out.push({ kind: 'blank' });

  out.push({ kind: 'section', text: 'PROFILE' });
  if (cv.location) out.push({ kind: 'kv', label: 'Location', value: cv.location });
  if (cv.status) out.push({ kind: 'kv', label: 'Status', value: txt(cv.status).toUpperCase() });
  if (cv.preferences) out.push({ kind: 'kv', label: 'Preferences', value: txt(cv.preferences).toUpperCase() });
  if (cv.languages) out.push({ kind: 'kv', label: 'Languages', value: cv.languages });

  if (txt(cv.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'text', text: cv.description });
  }

  const blocks = [
    ['PERSONAL', cv.personalExperiences, cv.personalSkills],
    ['EDUCATION', cv.educationExperiences, cv.educationalSkills],
    ['PROFESSIONAL', cv.professionalExperiences, cv.professionalSkills],
    ['OASIS', cv.oasisExperiences, cv.oasisSkills]
  ];

  for (const [heading, experiences, skills] of blocks) {
    const skillList = asList(skills).filter(Boolean);
    const body = txt(experiences).trim();
    if (!body && !skillList.length) continue;
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: heading });
    if (body) out.push({ kind: 'text', text: body });
    if (skillList.length) out.push({ kind: 'kv', label: 'Skills', value: skillList.join(', ') });
  }

  pushMeta(out, cv);
  return out;
};

const IMAGE_MD = /^\s*!\[image:([^\]]*)\]\((&[^)]+)\)\s*$/;
const MEDIA_MD = /^\s*\[(audio|video|pdf|torrent):([^\]]*)\]\((&[^)]+)\)\s*$/;
const inlineMarkdown = (line) => String(line || '')
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  .replace(/\[\[([^\]]+)\]\]/g, (m, t) => t.replace(/^.*:/, ''))
  .replace(/!\[image:([^\]]*)\]\((&[^)]+)\)/g, '[image: $1]')
  .replace(/\[(audio|video|pdf|torrent):([^\]]*)\]\((&[^)]+)\)/g, '[$1: $2]')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  .replace(/(\*\*|__)(.*?)\1/g, '$2')
  .replace(/(\*|_)(.*?)\1/g, '$2')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/^\s{0,3}>\s?/, '| ');

const pushWikiBody = (out, body, images = {}) => {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  let paragraph = [];
  const flush = () => { if (paragraph.length) { out.push({ kind: 'text', text: paragraph.join('\n') }); paragraph = []; } };
  for (const raw of lines) {
    const img = raw.match(IMAGE_MD);
    if (img) {
      flush();
      const buf = images && images[img[2]];
      if (buf) out.push({ kind: 'image', buffer: buf, caption: txt(img[1]) });
      else out.push({ kind: 'text', text: `[image: ${txt(img[1])}]` });
      continue;
    }
    const media = raw.match(MEDIA_MD);
    if (media) { flush(); out.push({ kind: 'text', text: `[${media[1]}: ${txt(media[2])}]` }); continue; }
    const heading = raw.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading) { flush(); out.push({ kind: 'blank' }); out.push({ kind: 'section', text: inlineMarkdown(heading[1]).toUpperCase() }); continue; }
    if (!raw.trim()) { flush(); out.push({ kind: 'blank' }); continue; }
    paragraph.push(inlineMarkdown(raw));
  }
  flush();
};

const wikiSections = (page, extra = {}) => {
  const out = [];
  out.push({ kind: 'title', text: txt(page.title) || '-' });
  out.push({ kind: 'blank' });
  out.push({ kind: 'kv', label: 'Author', value: txt(page.author) });
  out.push({ kind: 'kv', label: 'Updated', value: fmtDate(page.updatedAt) });
  out.push({ kind: 'kv', label: 'Versions', value: String(page.versionCount || 1) });
  pushTags(out, page);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'CONTENT' });
  out.push({ kind: 'blank' });
  pushWikiBody(out, page.body, (extra && extra.images) || {});
  return out;
};

const emergencySections = (item, extra = {}) => {
  const out = [];
  out.push({ kind: 'title', text: txt(item.title) || '-' });
  out.push({ kind: 'blank' });
  out.push({ kind: 'kv', label: 'Status', value: txt(item.status).toUpperCase() });
  out.push({ kind: 'kv', label: 'Severity', value: `${txt(item.severity).toUpperCase()} (${Number(item.confirmationCount) || 0} confirmations)` });
  out.push({ kind: 'kv', label: 'Category', value: txt(item.category).toUpperCase() });
  if (item.expiresAt) out.push({ kind: 'kv', label: 'Expires', value: fmtDate(item.expiresAt) });
  out.push({ kind: 'kv', label: 'Author', value: txt(item.author) });
  out.push({ kind: 'kv', label: 'Created', value: fmtDate(item.createdAt) });
  if (item.mapUrl) out.push({ kind: 'kv', label: 'Map', value: txt(item.mapUrl) });
  pushTags(out, item);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'CONTENT' });
  out.push({ kind: 'blank' });
  pushWikiBody(out, item.text, (extra && extra.images) || {});
  const updates = asList(item.updates);
  if (updates.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'LAST UPDATES' });
    for (const u of updates) {
      out.push({ kind: 'blank' });
      out.push({ kind: 'kv', label: fmtDate(u.createdAt), value: txt(u.author) });
      pushWikiBody(out, u.text, (extra && extra.images) || {});
    }
  }
  return out;
};

const campaignSections = (item, extra = {}) => {
  const out = [];
  out.push({ kind: 'title', text: txt(item.title) || '-' });
  out.push({ kind: 'blank' });
  out.push({ kind: 'kv', label: 'Status', value: txt(item.status).toUpperCase() });
  out.push({ kind: 'kv', label: 'Category', value: txt(item.category).toUpperCase() });
  out.push({ kind: 'kv', label: 'Signatures', value: `${Number(item.signatureCount) || 0} / ${Number(item.goal) || 0} (${Number(item.progress) || 0}%)` });
  if (item.deadline) out.push({ kind: 'kv', label: 'Deadline', value: fmtDate(item.deadline) });
  out.push({ kind: 'kv', label: 'Promoter', value: txt(item.author) });
  out.push({ kind: 'kv', label: 'Created', value: fmtDate(item.createdAt) });
  if (item.mapUrl) out.push({ kind: 'kv', label: 'Map', value: txt(item.mapUrl) });
  pushTags(out, item);
  out.push({ kind: 'blank' });
  out.push({ kind: 'section', text: 'CONTENT' });
  out.push({ kind: 'blank' });
  pushWikiBody(out, item.text, (extra && extra.images) || {});
  const updates = asList(item.updates);
  if (updates.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'LAST UPDATES' });
    for (const u of updates) {
      out.push({ kind: 'blank' });
      out.push({ kind: 'kv', label: fmtDate(u.createdAt), value: txt(u.author) });
      pushWikiBody(out, u.text, (extra && extra.images) || {});
    }
  }
  const signatures = asList(item.signatures);
  if (signatures.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: `SUPPORTERS (${signatures.length})` });
    for (const s of signatures) out.push({ kind: 'kv', label: fmtDate(s.createdAt), value: `${txt(s.author)}${s.text ? ' - ' + txt(s.text) : ''}` });
  }
  return out;
};

const logisticsSections = (item, extra = {}) => {
  const out = [];
  out.push({ kind: 'title', text: txt(item.title) || '-' });
  out.push({ kind: 'blank' });
  out.push({ kind: 'kv', label: 'Type', value: `${txt(item.kind).toUpperCase()} - ${txt(item.mode).toUpperCase()}` });
  out.push({ kind: 'kv', label: 'Status', value: txt(item.status).toUpperCase() });
  out.push({ kind: 'kv', label: 'Route', value: `${txt(item.origin)} -> ${txt(item.destination)}` });
  if (item.date) out.push({ kind: 'kv', label: 'Date', value: `${fmtDate(item.date)}${item.recurrence && item.recurrence !== 'NONE' ? ' (' + txt(item.recurrence) + ')' : ''}` });
  if (item.kind === 'TRIP' && item.seats) out.push({ kind: 'kv', label: 'Seats', value: `${Number(item.seatsLeft) || 0} / ${Number(item.seats) || 0}` });
  if (item.size) out.push({ kind: 'kv', label: 'Size', value: txt(item.size) });
  if (item.weight) out.push({ kind: 'kv', label: 'Weight', value: txt(item.weight) });
  out.push({ kind: 'kv', label: 'Price', value: item.priceType === 'FREE' || !(Number(item.price) > 0) ? 'FREE' : `${item.price} ${txt(item.priceType)}` });
  if (item.orderRef) out.push({ kind: 'kv', label: 'Order', value: txt(item.orderRef) });
  if (item.mapUrl) out.push({ kind: 'kv', label: 'Map', value: txt(item.mapUrl) });
  out.push({ kind: 'kv', label: 'Author', value: txt(item.author) });
  out.push({ kind: 'kv', label: 'Created', value: fmtDate(item.createdAt) });
  pushTags(out, item);
  if (txt(item.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'blank' });
    pushWikiBody(out, item.description, (extra && extra.images) || {});
  }
  const bookings = asList(item.bookings);
  if (bookings.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: `BOOKINGS (${bookings.length})` });
    for (const b of bookings) out.push({ kind: 'kv', label: `${fmtDate(b.createdAt)} ${txt(b.status)}`, value: `${txt(b.booker)}${b.seats ? ' x' + b.seats : ''}${b.notes ? ' - ' + txt(b.notes) : ''}${b.receipt ? ' [' + txt(b.receipt) + ']' : ''}` });
  }
  const ratings = asList(item.ratings);
  if (ratings.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: `RATINGS (${ratings.length}) - ${Number(item.ratingAvg) || 0}/5` });
    for (const r of ratings) out.push({ kind: 'kv', label: `${'*'.repeat(Number(r.score) || 0)} ${fmtDate(r.createdAt)}`, value: `${txt(r.author)}${r.text ? ' - ' + txt(r.text) : ''}` });
  }
  return out;
};

const mailingSections = (item, extra = {}) => {
  const out = [];
  out.push({ kind: 'title', text: txt(item.title) || '-' });
  out.push({ kind: 'blank' });
  out.push({ kind: 'kv', label: 'Type', value: txt(item.listType).toUpperCase() });
  out.push({ kind: 'kv', label: 'Status', value: txt(item.status).toUpperCase() });
  out.push({ kind: 'kv', label: 'Subscribers', value: String(Number(item.participantCount) || 0) });
  out.push({ kind: 'kv', label: 'Messages', value: String(Number(item.messageCount) || 0) });
  out.push({ kind: 'kv', label: 'Author', value: txt(item.author) });
  out.push({ kind: 'kv', label: 'Created', value: fmtDate(item.createdAt) });
  pushTags(out, item);
  if (txt(item.description).trim()) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: 'DESCRIPTION' });
    out.push({ kind: 'blank' });
    pushWikiBody(out, item.description, (extra && extra.images) || {});
  }
  const history = asList(item.history);
  if (history.length) {
    out.push({ kind: 'blank' });
    out.push({ kind: 'section', text: `HISTORY (${history.length})` });
    for (const m of history) {
      out.push({ kind: 'blank' });
      out.push({ kind: 'kv', label: fmtDate(m.sentAt), value: `${txt(m.author)} - ${txt(m.subject)}` });
      pushWikiBody(out, m.text, {});
    }
  }
  return out;
};

const BUILDERS = {
  wiki: { title: 'OASIS - Wiki', sections: wikiSections, name: item => item.title },
  campaigns: { title: 'OASIS - Campaign', sections: campaignSections, name: item => item.title },
  logistics: { title: 'OASIS - Route', sections: logisticsSections, name: item => item.title },
  mailing: { title: 'OASIS - Mailing List', sections: mailingSections, name: item => item.title },
  emergencies: { title: 'OASIS - Emergency', sections: emergencySections, name: item => item.title },
  reports: { title: 'OASIS - Report', sections: reportSections, name: item => item.title },
  votes: { title: 'OASIS - Votation', sections: voteSections, name: item => item.question },
  events: { title: 'OASIS - Event', sections: eventSections, name: item => item.title },
  tasks: { title: 'OASIS - Task', sections: taskSections, name: item => item.title },
  calendars: { title: 'OASIS - Calendar', sections: calendarSections, name: item => item.title },
  cv: { title: 'OASIS - Curriculum', sections: cvSections, name: item => item.name || item.author }
};

const isSupported = kind => Object.prototype.hasOwnProperty.call(BUILDERS, kind);

const pdfFilename = (kind, item) => {
  const b = BUILDERS[kind];
  const raw = b ? txt(b.name(item || {})) : '';
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `oasis-${kind}-${slug || 'document'}.pdf`;
};

const buildContentPdf = (kind, item, extra = {}, viewerId = null) => {
  const b = BUILDERS[kind];
  if (!b) throw new Error('Unsupported pdf kind');
  return buildDocumentPdf({
    title: b.title,
    issuedToLabel: 'Issued to',
    issuedTo: viewerId || null,
    sections: b.sections(item || {}, extra)
  });
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
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
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
    const stream = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
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

  parts.push(centered(`Issued on ${issuedStr}`, 10, 'F1', pageH - 400, '0.25 0.25 0.25'));

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
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');

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
    const stream = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
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

const buildRecoveryKitPdf = (kit, { qr = null, labels = {} } = {}) => {
  const sections = [];
  sections.push({ kind: 'title', text: labels.title || 'RECOVERY' });
  sections.push({ kind: 'blank' });
  sections.push({ kind: 'kv', label: labels.id || 'Oasis ID', value: kit.id || '' });
  sections.push({ kind: 'kv', label: labels.date || 'Generated', value: fmtDate(kit.createdAt) });
  if (qr) { sections.push({ kind: 'blank' }); sections.push({ kind: 'image', buffer: qr, caption: '' }); }
  sections.push({ kind: 'blank' });
  sections.push({ kind: 'section', text: 'SECRET' });
  sections.push({ kind: 'blank' });
  for (const line of String(kit.secret || '').split('\n')) sections.push({ kind: 'text', text: line });
  return buildDocumentPdf({ title: 'OASIS - Recovery', issuedToLabel: labels.id || 'Oasis ID', issuedTo: kit.id || '', sections });
};

module.exports = { buildDocumentPdf, escapePdf, wrap, buildContentPdf, pdfFilename, isSupported, buildSmartContractPdf, buildCertificatePdf, buildLogsPdf, buildRecoveryKitPdf };
