const { eq, ok, notOk } = require('../../helpers/assert');
const { buildContentPdf, pdfFilename, isSupported } = require('../../../src/backend/pdf');
const { buildDocumentPdf } = require('../../../src/backend/pdf');

const asText = (buf) => buf.toString('latin1');

const SAMPLES = {
  reports: [{
    id: '%report.sha256', title: 'Broken map tiles', category: 'BUGS', severity: 'high', status: 'OPEN',
    description: 'The tiles never load', tags: ['maps', 'ui'],
    template: { stepsToReproduce: 'open the map', environment: 'firefox' },
    confirmations: ['@peer.ed25519'], opinions: { interesting: 2 },
    author: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z'
  }, {}],
  votes: [{
    id: '%vote.sha256', question: 'Do we ship it?', status: 'OPEN', deadline: '2026-09-01T00:00:00Z',
    votes: { YES: 3, NO: 1 }, totalVotes: 4, voters: ['@a.ed25519'],
    createdBy: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z'
  }, {}],
  events: [{
    id: '%event.sha256', title: 'Neighbourhood meetup', date: '2026-09-01T20:00:00Z', location: 'Plaza',
    price: 0, isPublic: 'public', attendees: ['@a.ed25519', '@b.ed25519'],
    organizer: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z', description: 'bring chairs'
  }, {}],
  tasks: [{
    id: '%task.sha256', title: 'Fix the pump', status: 'OPEN', priority: 'HIGH',
    startTime: '2026-09-01T09:00:00Z', endTime: '2026-09-05T09:00:00Z',
    assignees: ['@a.ed25519'], author: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z'
  }, {}],
  calendars: [{
    id: '%cal.sha256', rootId: '%cal.sha256', title: 'Harvest', status: 'OPEN',
    participants: ['@a.ed25519'], author: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z'
  }, {
    dates: [{ key: '%date.sha256', date: '2026-09-01T00:00:00Z', label: 'first pick' }],
    notesByDate: { '%date.sha256': [{ text: 'bring the baskets' }] }
  }],
  cv: [{
    id: '%cv.sha256', name: 'Ada', author: '@me.ed25519', location: 'Madrid',
    status: 'LOOKING FOR WORK', description: 'engineer',
    personalExperiences: 'a life', personalSkills: ['solder', 'weld'],
    createdAt: '2026-01-01T10:00:00Z'
  }, {}],
  pixelia: [{
    title: 'Pixelia', width: 50, height: 200,
    pixels: [{ x: 1, y: 1, color: '#ff0000', contributors_inhabitants: ['@a.ed25519'] }, { x: 50, y: 200, color: '#0000ff', contributors_inhabitants: ['@b.ed25519'] }]
  }, {}],
  maps: [{
    key: '%map.sha256', rootId: '%map.sha256', title: 'Public atlas', description: 'Places we **care** about', mapType: 'OPEN',
    lat: 40.4, lng: -3.7, markerLabel: 'HQ', tags: ['city'], author: '@me.ed25519', createdAt: '2026-01-01T10:00:00Z',
    markers: [
      { key: '%mk1.sha256', lat: 41, lng: 2, label: 'Marker of the author', image: '', author: '@me.ed25519', createdAt: '2026-01-02T10:00:00Z' },
      { key: '%mk2.sha256', lat: 39, lng: -0.4, label: 'Marker of a member', image: '&img.sha256', author: '@a.ed25519', createdAt: '2026-01-03T10:00:00Z' }
    ]
  }, { names: { '@a.ed25519': 'Ada' }, images: {} }]
};

describe('pdf: content documents', (t) => {
  t('every supported kind builds a valid PDF', () => {
    for (const [kind, [item, extra]] of Object.entries(SAMPLES)) {
      ok(isSupported(kind), `${kind} is a supported kind`);
      const buf = buildContentPdf(kind, item, extra, '@me.ed25519');
      ok(Buffer.isBuffer(buf), `${kind} returns a buffer`);
      eq(buf.subarray(0, 8).toString(), '%PDF-1.4', `${kind} starts with a PDF header`);
      ok(asText(buf).trimEnd().endsWith('%%EOF'), `${kind} ends with %%EOF`);
    }
  });

  const pixeliaImages = (buf) => {
    const zlib = require('zlib');
    const s = asText(buf);
    const out = [];
    for (const m of s.matchAll(/(\d+) 0 obj\n<< \/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Interpolate false \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index + m[0].length;
      const placed = s.match(new RegExp(`(\\d+) 0 0 (\\d+) [\\d.-]+ [\\d.-]+ cm\\n/Im${m[1]} Do`));
      out.push({ w: Number(m[2]), h: Number(m[3]), rgb: zlib.inflateSync(buf.subarray(start, start + Number(m[4]))), shownW: placed ? Number(placed[1]) : 0 });
    }
    return out;
  };
  const cellAt = (img, cols, cx, cy) => {
    const c = img.w / cols;
    const o = (Math.floor((cy - 0.5) * c) * img.w + Math.floor((cx - 0.5) * c)) * 3;
    return [...img.rgb.subarray(o, o + 3)].join(',');
  };

  t('the Pixelia PDF carries the painted canvas at a readable size, each cell in its colour', () => {
    const imgs = pixeliaImages(buildContentPdf('pixelia', ...SAMPLES.pixelia, '@me.ed25519'));
    ok(imgs.length > 1, 'a drawing taller than a page continues on the next pages');
    const first = imgs[0];
    const last = imgs[imgs.length - 1];
    eq(cellAt(first, 50, 1, 1), '255,0,0', 'the first cell is red');
    eq(cellAt(last, 50, 50, last.h / (last.w / 50)), '0,0,255', 'the last cell is blue');
    notOk(['255,0,0', '0,0,255'].includes(cellAt(first, 50, 25, 10)), 'an unpainted cell keeps the empty canvas colour');
    ok(first.shownW / 50 >= 8, 'each cell is printed big enough to be seen');
  });

  t('the whole Pixelia canvas is printed, never cropped to the painted part', () => {
    const imgs = pixeliaImages(buildContentPdf('pixelia', { title: 'Pixelia', width: 50, height: 200, pixels: [{ x: 10, y: 10, color: '#00ff00' }] }, {}, null));
    ok(imgs.every(img => img.w === imgs[0].w), 'every page keeps the full width of the canvas');
    eq(imgs.reduce((sum, img) => sum + img.h / (img.w / 50), 0), 200, 'all the rows are printed, in order');
    eq(cellAt(imgs[0], 50, 10, 10), '0,255,0', 'the painted cell keeps its place');
  });

  t('the map PDF embeds one JPEG tile per covered tile of the fitted view and lists every marker', () => {
    const { fitView, makeView, tileCoverage } = require('../../../src/maps/map_renderer');
    const [item, extra] = SAMPLES.maps;
    const pins = [{ lat: item.lat, lng: item.lng }].concat(item.markers.map(mk => ({ lat: mk.lat, lng: mk.lng })));
    const fit = fitView(pins, { singleZoom: 8 });
    const covered = tileCoverage(makeView(fit.lat, fit.lng, fit.zoom)).length;
    const buf = buildContentPdf('maps', item, extra, '@me.ed25519');
    const text = asText(buf);
    eq(buf.subarray(0, 4).toString(), '%PDF', 'starts with a PDF header');
    const jpegs = (text.match(/\/Subtype \/Image [^>]*\/Filter \/DCTDecode/g) || []).length;
    ok(covered > 0, 'the fitted view covers at least one tile');
    eq(jpegs, covered + 1, `one DCTDecode XObject per tile plus the logo (tiles: ${covered})`);
    eq((text.match(/ re W n/g) || []).length, 1, 'the tiles are drawn inside one clipped map rectangle');
    ok(text.includes('Public atlas'), 'title present');
    ok(text.includes('Main marker: HQ'), 'the map location is the main marker');
    ok(text.includes('Marker of the author') && text.includes('Marker of a member'), 'every marker label listed');
    ok(text.includes('Ada \\(@a.ed25519\\)'), 'a known author is named');
    ok(text.includes('Coordinates: 41.0000, 2.0000'), 'marker coordinates listed');
    ok(text.includes('Places we care about'), 'description printed as plain text');
    eq(pdfFilename('maps', item), 'oasis-maps-public-atlas.pdf', 'filename follows the map title');
  });

  t('an unsupported kind is rejected instead of producing an empty file', () => {
    let threw = false;
    try { buildContentPdf('secrets', {}, {}, null); } catch (_) { threw = true; }
    ok(threw, 'unknown kind throws');
    notOk(isSupported('secrets'), 'unknown kind is not supported');
  });

  t('the report body carries its classification, template and confirmations', () => {
    const [item] = SAMPLES.reports;
    const text = asText(buildContentPdf('reports', item, {}, '@me.ed25519'));
    ok(text.includes('Broken map tiles'), 'title present');
    ok(text.includes('Severity: HIGH'), 'severity present');
    ok(text.includes('Steps To Reproduce: open the map'), 'template field humanized');
    ok(text.includes('Confirmed by: @peer.ed25519'), 'confirmation listed');
  });

  t('vote results include the percentage of each option', () => {
    const [item] = SAMPLES.votes;
    const text = asText(buildContentPdf('votes', item, {}, null));
    ok(text.includes('YES: 3 \\(75%\\)'), 'yes tallied and percentaged');
    ok(text.includes('NO: 1 \\(25%\\)'), 'no tallied and percentaged');
  });

  t('the calendar summary carries its dates and the notes of each date', () => {
    const [item, extra] = SAMPLES.calendars;
    const text = asText(buildContentPdf('calendars', item, extra, null));
    ok(text.includes('2026-09-01: first pick'), 'date and label present');
    ok(text.includes('bring the baskets'), 'note of that date present');
    ok(text.includes('Notes: 1'), 'note total counted');
  });

  t('a shared document omits the viewer Oasis ID', () => {
    const [item] = SAMPLES.tasks;
    const mine = asText(buildContentPdf('tasks', item, {}, '@me.ed25519'));
    const shared = asText(buildContentPdf('tasks', item, {}, null));
    ok(mine.includes('Issued to'), 'own copy is issued to the viewer');
    notOk(shared.includes('Issued to'), 'shared copy has no issued-to line');
  });

  t('filenames are slugged per kind and never leak path separators', () => {
    eq(pdfFilename('reports', { title: 'Broken map tiles' }), 'oasis-reports-broken-map-tiles.pdf');
    eq(pdfFilename('votes', { question: '../../etc/passwd' }), 'oasis-votes-etc-passwd.pdf');
    eq(pdfFilename('tasks', {}), 'oasis-tasks-document.pdf');
  });

  t('parentheses and backslashes in the text cannot break the PDF string syntax', () => {
    const text = asText(buildDocumentPdf({
      title: 'OASIS', sections: [{ kind: 'kv', label: 'Note', value: 'a (b) \\ c' }]
    }));
    ok(text.includes('a \\(b\\) \\\\ c'), 'delimiters escaped');
  });

  t('long text is wrapped and paginated instead of overflowing one page', () => {
    const sections = [];
    for (let i = 0; i < 120; i++) sections.push({ kind: 'kv', label: `Row ${i}`, value: 'x'.repeat(200) });
    const text = asText(buildDocumentPdf({ title: 'OASIS', sections }));
    ok(text.includes('Page 1 of '), 'pages are numbered');
    const pageCount = (text.match(/\/Type \/Page[^s]/g) || []).length;
    ok(pageCount > 1, `content spans several pages (got ${pageCount})`);
  });
});

describe('pdf: text that is not plain ASCII', (t) => {
  t('accents, eñes and question marks survive the export', () => {
    const { buildLogsPdf } = require('../../../src/backend/pdf');
    const text = 'La niña compró piñones en A Coruña, ¿vale?';
    const out = asText(buildLogsPdf([{ ts: Date.UTC(2026, 0, 1), text }], '@me.ed25519'));
    ok(out.includes('La ni\xF1a compr\xF3 pi\xF1ones en A Coru\xF1a, \xBFvale?'), 'written as WinAnsi bytes');
    ok(out.includes('/Encoding /WinAnsiEncoding'), 'and the font declares the encoding that reads them');
  });

  t('typographic dashes, quotes and the euro sign are mapped, not dropped', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdf');
    const out = asText(buildDocumentPdf({
      title: 'OASIS', sections: [{ kind: 'kv', label: 'Note', value: '20 € — “quoted”…' }]
    }));
    ok(out.includes('20 \x80 \x97 \x93quoted\x94\x85'), 'each one lands on its WinAnsi code point');
  });

  t('characters no 8-bit font can show degrade to a question mark, not to broken bytes', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdf');
    const out = asText(buildDocumentPdf({
      title: 'OASIS', sections: [{ kind: 'kv', label: 'Note', value: 'ok 你好' }]
    }));
    ok(out.includes('Note: ok ??'), 'replaced by placeholders');
  });

  t('the stream length matches the bytes actually written', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdf');
    const buf = buildDocumentPdf({ title: 'OASIS', sections: [{ kind: 'kv', label: 'Ñ', value: 'ñññ' }] });
    const text = buf.toString('latin1');
    const m = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    ok(m, 'a content stream is present');
    eq(Number(m[1]), Buffer.byteLength(m[2], 'latin1'), 'declared length equals real length');
  });
});

describe('pdf: license in the footer', (t) => {
  const pdf = require('../../../src/backend/pdf');
  const footerLicense = (buf) => {
    const s = asText(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).replace(/\\\(/g, '(').replace(/\\\)/g, ')');
    const m = s.match(/\((License: [^\n]*?)\) Tj/);
    return m ? m[1] : null;
  };

  t('every generated PDF names a license, Public Domain when the content has none', async () => {
    const docs = [
      ...Object.entries(SAMPLES).map(([kind, [item, extra]]) => [kind, buildContentPdf(kind, item, extra, '@me.ed25519')]),
      ['transfer', pdf.buildSmartContractPdf({ transfer: { id: '%t.sha256', from: '@a.ed25519', to: '@b.ed25519', amount: 1, concept: 'c', status: 'UNCONFIRMED', deadline: '2026-09-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }, block: null, viewerId: null })],
      ['certificate', pdf.buildCertificatePdf({ cert: { id: '%c.sha256', author: '@t.ed25519', createdAt: '2026-01-01T00:00:00Z' }, course: { title: 'Course' }, studentName: 'S', teacherName: 'T' })],
      ['logs', await pdf.buildLogsPdf([{ ts: Date.now(), type: 'log', text: 'x' }], '@me.ed25519')],
      ['recovery', pdf.buildRecoveryKitPdf({ id: '@me.ed25519', createdAt: '2026-01-01T00:00:00Z', secret: 's' })]
    ];
    for (const [kind, buf] of docs) eq(footerLicense(buf), 'License: Public Domain', `${kind}: Public Domain in the footer`);
  });

  t('a wiki page prints its own license', () => {
    const buf = buildContentPdf('wiki', { title: 'Page', body: 'text', license: 'CC-BY-SA-4.0' }, {}, '@me.ed25519');
    eq(footerLicense(buf), 'License: Creative Commons Attribution-ShareAlike 4.0');
  });
});
