const { buildDocumentPdf } = require('./pdfDocument');

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

const BUILDERS = {
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

module.exports = { buildContentPdf, pdfFilename, isSupported };
