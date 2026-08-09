const { eq, ok, notOk } = require('../../helpers/assert');
const { buildContentPdf, pdfFilename, isSupported } = require('../../../src/backend/contentPdf');
const { buildDocumentPdf } = require('../../../src/backend/pdfDocument');

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
  }, {}]
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
    const { buildLogsPdf } = require('../../../src/backend/logsPdf');
    const text = 'La niña compró piñones en A Coruña, ¿vale?';
    const out = asText(buildLogsPdf([{ ts: Date.UTC(2026, 0, 1), text }], '@me.ed25519'));
    ok(out.includes('La ni\xF1a compr\xF3 pi\xF1ones en A Coru\xF1a, \xBFvale?'), 'written as WinAnsi bytes');
    ok(out.includes('/Encoding /WinAnsiEncoding'), 'and the font declares the encoding that reads them');
  });

  t('typographic dashes, quotes and the euro sign are mapped, not dropped', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdfDocument');
    const out = asText(buildDocumentPdf({
      title: 'OASIS', sections: [{ kind: 'kv', label: 'Note', value: '20 € — “quoted”…' }]
    }));
    ok(out.includes('20 \x80 \x97 \x93quoted\x94\x85'), 'each one lands on its WinAnsi code point');
  });

  t('characters no 8-bit font can show degrade to a question mark, not to broken bytes', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdfDocument');
    const out = asText(buildDocumentPdf({
      title: 'OASIS', sections: [{ kind: 'kv', label: 'Note', value: 'ok 你好' }]
    }));
    ok(out.includes('Note: ok ??'), 'replaced by placeholders');
  });

  t('the stream length matches the bytes actually written', () => {
    const { buildDocumentPdf } = require('../../../src/backend/pdfDocument');
    const buf = buildDocumentPdf({ title: 'OASIS', sections: [{ kind: 'kv', label: 'Ñ', value: 'ñññ' }] });
    const text = buf.toString('latin1');
    const m = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    ok(m, 'a content stream is present');
    eq(Number(m[1]), Buffer.byteLength(m[2], 'latin1'), 'declared length equals real length');
  });
});
