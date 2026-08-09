const { eq, ok, notOk, deepEq } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const { MAX_IMAGES, normalizeImages, normalizeVideo, mergeGallery } = require('../../../src/models/media_gallery');

const blob = (n) => `&${String(n).repeat(43)}=.sha256`;

describe('gallery: normalization', (t) => {
  t('a bare blob id, a markdown image and a video tag all survive', () => {
    const list = normalizeImages([blob(1), `![photo](${blob(2)})`, `[video:clip.ogv](${blob(3)})`]);
    eq(list.length, 3, 'three entries kept');
    eq(list[0], blob(1), 'bare id kept as-is');
    ok(list[1].startsWith('!['), 'markdown image keeps its markdown');
    ok(list[2].startsWith('[video:'), 'video keeps its markdown so it renders as a player');
  });

  t('the same blob added twice is stored once', () => {
    const list = normalizeImages([blob(1), `![again](${blob(1)})`, blob(2)]);
    eq(list.length, 2, 'duplicate dropped');
  });

  t('never stores more than the maximum', () => {
    const many = Array.from({ length: MAX_IMAGES + 5 }, (_, i) => `&${String(i).padStart(43, 'a')}=.sha256`);
    eq(normalizeImages(many).length, MAX_IMAGES, `capped at ${MAX_IMAGES}`);
  });

  t('empty, null and blank entries are discarded', () => {
    deepEq(normalizeImages([null, '', '   ', undefined]), [], 'nothing kept');
    eq(normalizeVideo(''), '', 'blank video is empty string');
    eq(normalizeVideo(null), '', 'null video is empty string');
  });

  t('a single value is accepted where a list is expected', () => {
    deepEq(normalizeImages(blob(7)), [blob(7)], 'scalar promoted to list');
  });

  t('mergeGallery appends uploads, removes by index and keeps the cap', () => {
    const current = [blob(1), blob(2), blob(3)];
    deepEq(mergeGallery(current, [blob(4)]), [blob(1), blob(2), blob(3), blob(4)], 'upload appended');
    deepEq(mergeGallery(current, [], 1), [blob(1), blob(3)], 'index removed');
    deepEq(mergeGallery(current, [blob(4)], 0), [blob(2), blob(3), blob(4)], 'remove and append together');
    const full = Array.from({ length: MAX_IMAGES }, (_, i) => `&${String(i).padStart(43, 'b')}=.sha256`);
    eq(mergeGallery(full, [blob(9)]).length, MAX_IMAGES, 'cap holds when full');
  });
});

describe('gallery: modules that store a gallery', (t) => {
  t('a task keeps its photos and its video across create and update', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tasks = A.use('tasks');
    const start = new Date(Date.now() + 3600000).toISOString();
    const end = new Date(Date.now() + 7200000).toISOString();
    const created = await tasks.createTask('gallery task', 'desc', start, end, 'HIGH', '', [], 'PUBLIC',
      { images: [blob(1), blob(2)], video: blob(3) });
    const task = await tasks.getTaskById(created.key);
    eq(task.images.length, 2, 'two photos stored');
    eq(task.video, blob(3), 'video stored');

    await tasks.updateTaskById(created.key, { images: [blob(1)], video: '' });
    const after = await tasks.getTaskById(created.key);
    eq(after.images.length, 1, 'photo removed');
    eq(after.video, '', 'video removed');
  });

  t('an event keeps its gallery and an untouched update does not lose it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const events = A.use('events');
    const when = new Date(Date.now() + 86400000).toISOString();
    const created = await events.createEvent('gallery event', 'desc', when, 'here', 0, '', [], [], 'public', '', false,
      { images: [blob(1), blob(2)], video: blob(3) });
    const ev = await events.getEventById(created.key);
    eq(ev.images.length, 2, 'two photos stored');

    await events.updateEventById(created.key, { title: 'renamed' });
    const after = await events.getEventById(created.key);
    eq(after.title, 'renamed', 'title changed');
    eq(after.images.length, 2, 'gallery survived an edit that did not touch it');
    eq(after.video, blob(3), 'video survived too');
  });

  t('a report exposes its first photo as the legacy image field', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const reports = A.use('reports');
    const created = await reports.createReport('gallery report', 'desc', 'BUGS', null, [], 'low', {},
      { images: [blob(1), blob(2)], video: blob(3) });
    const report = await reports.getReportById(created.key);
    eq(report.images.length, 2, 'two photos stored');
    eq(report.image, blob(1), 'first photo is the cover');
    eq(report.video, blob(3), 'video stored');
  });

  t('a report created the old way (single image) still reads as a one-photo gallery', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const reports = A.use('reports');
    const created = await reports.createReport('legacy report', 'desc', 'BUGS', blob(5), [], 'low', {});
    const report = await reports.getReportById(created.key);
    deepEq(report.images, [blob(5)], 'legacy image becomes the gallery');
    eq(report.image, blob(5), 'cover unchanged');
  });

  t('a housing place still stores its gallery after sharing the helper', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const housing = A.use('housing');
    const created = await housing.createHousing({
      housing_type: 'rent', property_type: 'flat', title: 'a place', description: 'desc',
      place: 'here', price: 1, availableFrom: '2030-01-01',
      images: [blob(1), blob(2)], video: blob(3)
    });
    const item = await housing.getHousingById(created.key);
    eq(item.images.length, 2, 'two photos stored');
    eq(item.video, blob(3), 'video stored');
    notOk(item.images.includes(''), 'no blank entries');
  });
});

describe('gallery: adding photos does not fight the rest of the form', (t) => {
  const html = () => {
    const { renderGalleryFields } = require('../../../src/views/gallery_view');
    return renderGalleryFields({ images: ['&abc.sha256'] }, true)
      .flat(Infinity)
      .filter(Boolean)
      .map(n => (n && n.outerHTML) || String(n))
      .join('');
  };

  t('the add button submits without triggering the required fields around it', () => {
    const out = html();
    ok(out.includes('value="addPhoto"'), 'the add button is rendered');
    ok(/<button[^>]*value="addPhoto"[^>]*formnovalidate/.test(out), 'and it carries formnovalidate');
  });

  t('the remove button skips validation too', () => {
    const out = html();
    ok(out.includes('name="removePhoto"'), 'the remove button is rendered');
    ok(/<button[^>]*name="removePhoto"[^>]*formnovalidate/.test(out), 'and it carries formnovalidate');
  });

  t('the file input still takes several images at once', () => {
    ok(/<input[^>]*name="images"[^>]*multiple/.test(html()), 'the picker is multiple');
  });
});

describe('gallery: uploading images before filling the rest of the form', (t) => {
  const render = (item, isEdit) => {
    const { renderGalleryFields } = require('../../../src/views/gallery_view');
    return renderGalleryFields(item, isEdit).flat(Infinity).filter(Boolean)
      .map(n => (n && n.outerHTML) || String(n)).join('');
  };

  t('images already picked survive the next submit as hidden fields', () => {
    const out = render({ images: ['&one.sha256', '&two.sha256'] }, false);
    ok(out.includes('name="keepImages"'), 'they travel with the form');
    eq((out.match(/name="keepImages"/g) || []).length, 2, 'one hidden field per image');
  });

  t('a create form shows the thumbnails, not only the edit form', () => {
    const out = render({ images: ['&one.sha256'] }, false);
    ok(out.includes('gallery-item'), 'the preview is rendered while still creating');
    ok(out.includes('name="removePhoto"'), 'and it can be removed before publishing');
  });

  t('with no images there is nothing to keep', () => {
    const out = render({}, false);
    notOk(out.includes('name="keepImages"'), 'no stray hidden fields');
  });
});
