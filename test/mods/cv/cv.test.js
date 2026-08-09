const { eq, ok, throwsAsync, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('cv: create + read', (t) => {
  t('A creates own CV', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('cv').createCV({
      name: 'Alice',
      description: 'developer',
      personalSkills: 'javascript,nodejs',
      personalExperiences: 'oasis',
      educationExperiences: '',
      educationalSkills: '',
      languages: 'en,es',
      professionalExperiences: '',
      professionalSkills: '',
      oasisExperiences: '',
      oasisSkills: '',
      location: 'remote',
      preferences: 'open-source'
    }, null);
    ok(r);
    const cv = await A.use('cv').getCVByUserId(A.keypair.id);
    ok(cv);
    eq(cv.name, 'Alice');
  });
});

describe('cv: visibility (public / hidden)', (t) => {
  const makeData = (visibility) => ({
    name: 'X', description: 'd', personalSkills: '', personalExperiences: '',
    educationExperiences: '', educationalSkills: '', languages: '', professionalExperiences: '',
    professionalSkills: '', oasisExperiences: '', oasisSkills: '', location: 'remote',
    preferences: 'REMOTE WORKING', visibility
  });

  t('default visibility is PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('cv').createCV(makeData(undefined), null);
    const cv = await A.use('cv').getCVByUserId(A.keypair.id);
    eq(cv.visibility, 'PUBLIC');
  });

  t('HIDDEN CV is visible to author', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('cv').createCV(makeData('HIDDEN'), null);
    const cv = await A.use('cv').getCVByUserId(A.keypair.id);
    ok(cv);
    eq(cv.visibility, 'HIDDEN');
  });

  t('HIDDEN CV returns null for non-author viewer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('cv').createCV(makeData('HIDDEN'), null);
    B.setActor();
    eq(await B.use('cv').getCVByUserId(A.keypair.id), null);
  });

  t('PUBLIC CV is visible to non-author viewer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('cv').createCV(makeData('PUBLIC'), null);
    B.setActor();
    const cv = await B.use('cv').getCVByUserId(A.keypair.id);
    ok(cv);
    eq(cv.visibility, 'PUBLIC');
  });

  t('update preserves visibility when not specified', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('cv').createCV(makeData('HIDDEN'), null);
    const data = makeData(undefined); data.name = 'Y';
    await A.use('cv').updateCV(r.key, data, null);
    const cv = await A.use('cv').getCVByUserId(A.keypair.id);
    eq(cv.name, 'Y');
    eq(cv.visibility, 'HIDDEN');
  });

  t('update can flip visibility HIDDEN -> PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('cv').createCV(makeData('HIDDEN'), null);
    await A.use('cv').updateCV(r.key, makeData('PUBLIC'), null);
    B.setActor();
    const cv = await B.use('cv').getCVByUserId(A.keypair.id);
    ok(cv);
    eq(cv.visibility, 'PUBLIC');
  });
});

describe('cv: lifecycle + permissions', (t) => {
  const makeData = (over = {}) => ({
    name: 'Alice', description: 'dev', personalSkills: 'a,b,c', personalExperiences: '',
    educationExperiences: '', educationalSkills: '', languages: 'en', professionalExperiences: '',
    professionalSkills: 'go', oasisExperiences: '', oasisSkills: '', location: 'remote',
    preferences: 'REMOTE WORKING', visibility: 'PUBLIC', ...over
  });

  t('getCVByUserId defaults to the current actor', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('cv').createCV(makeData(), null);
    const cv = await A.use('cv').getCVByUserId();
    ok(cv);
    eq(cv.name, 'Alice');
    eq(cv.contact, A.keypair.id);
  });

  t('createCV parses CSV skill fields into arrays', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('cv').createCV(makeData({ personalSkills: 'x, y ,z' }), null);
    const cv = await A.use('cv').getCVByUserId();
    ok(Array.isArray(cv.personalSkills));
    eq(cv.personalSkills.length, 3);
    ok(cv.personalSkills.includes('y'));
  });

  t('getCVByUserId returns null when the user has no CV', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    eq(await A.use('cv').getCVByUserId(), null);
  });

  t('update replaces the previous CV content', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('cv').createCV(makeData({ name: 'V1' }), null);
    await A.use('cv').updateCV(r.key, makeData({ name: 'V2', description: 'senior dev' }), null);
    const cv = await A.use('cv').getCVByUserId();
    eq(cv.name, 'V2');
    eq(cv.description, 'senior dev');
  });

  t('delete removes the CV (getCVByUserId -> null)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('cv').createCV(makeData(), null);
    await A.use('cv').deleteCVById(r.key);
    eq(await A.use('cv').getCVByUserId(), null);
  });

  t('a non-author cannot update another user CV', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('cv').createCV(makeData(), null);
    B.setActor();
    await throwsAsync(() => B.use('cv').updateCV(r.key, makeData({ name: 'Hacked' }), null), /author/i);
  });

  t('a non-author cannot delete another user CV', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('cv').createCV(makeData(), null);
    B.setActor();
    await throwsAsync(() => B.use('cv').deleteCVById(r.key), /author/i);
  });
});

describe('cv: AI managed matching', (t) => {
  t('a new CV is AI managed by default, at 80%', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cv = A.use('cv');
    await cv.createCV({ name: 'Ada', description: 'd', personalSkills: 'solder' }, null);
    const mine = await cv.getCVByUserId();
    eq(mine.aiManaged, true, 'on by default');
    eq(mine.matchThreshold, 80, 'at 80%');
  });

  t('the switch and the threshold survive an update', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cv = A.use('cv');
    const created = await cv.createCV({ name: 'Ada', description: 'd', personalSkills: 'solder' }, null);
    await cv.updateCV(created.key, { name: 'Ada', description: 'd', personalSkills: 'solder', aiManaged: '0', matchThreshold: '60' }, null);
    const off = await cv.getCVByUserId();
    eq(off.aiManaged, false, 'turned off');
    eq(off.matchThreshold, 60, 'threshold kept');

    const tip = await cv.getCVByUserId();
    await cv.updateCV(tip.id, { name: 'Ada 2', description: 'd', personalSkills: 'solder' }, null);
    const after = await cv.getCVByUserId();
    eq(after.name, 'Ada 2', 'edited');
    eq(after.aiManaged, false, 'and the switch was not silently turned back on');
    eq(after.matchThreshold, 60, 'nor the threshold reset');
  });

  t('only jobs above the threshold are proposed, and never my own', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('cv').createCV({ name: 'Ada', description: 'd', personalSkills: 'solder, weld' }, null);
    await new Promise((res, rej) => A.node.publish(
      { type: 'job', title: 'my own job', tags: ['solder', 'weld'], tasks: [], createdAt: new Date().toISOString() },
      (e) => e ? rej(e) : res()));
    B.setActor();
    await new Promise((res, rej) => B.node.publish(
      { type: 'job', title: 'perfect fit', tags: ['solder', 'weld'], tasks: [], createdAt: new Date().toISOString() },
      (e) => e ? rej(e) : res()));
    await new Promise((res, rej) => B.node.publish(
      { type: 'job', title: 'far fit', tags: ['cooking'], tasks: [], createdAt: new Date().toISOString() },
      (e) => e ? rej(e) : res()));

    A.setActor();
    const matches = await A.use('data').jobMatchesFor(A.keypair.id, { minScore: 0.8 });
    eq(matches.length, 1, 'a single proposal');
    eq(matches[0].title, 'perfect fit', 'the one that fits');
    ok(matches[0].score >= 0.8, 'above the threshold');

    const lower = await A.use('data').jobMatchesFor(A.keypair.id, { minScore: 0.1 });
    eq(lower.length, 1, 'the unrelated job still does not match at all');
  });

  t('without a CV nothing is proposed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await new Promise((res, rej) => B.node.publish(
      { type: 'job', title: 'a job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() },
      (e) => e ? rej(e) : res()));
    A.setActor();
    eq((await A.use('data').jobMatchesFor(A.keypair.id, { minScore: 0.5 })).length, 0, 'nothing to match');
  });
});

describe('cv: rendering', (t) => {
  t('the CV page shows the metadata column, the visibility switch and the content', async () => {
    const { cvView, createCVView } = require('../../../src/views/cv_view');
    const cv = {
      id: '%cv.sha256', author: '@me.ed25519', contact: '@me.ed25519', name: 'Ada',
      description: 'engineer', photo: null, languages: 'es, en',
      personalSkills: ['solder'], personalExperiences: 'a life',
      educationalSkills: [], educationExperiences: '',
      professionalSkills: ['weld'], professionalExperiences: 'shipyards',
      oasisSkills: [], oasisExperiences: '',
      location: 'Madrid', status: 'LOOKING FOR WORK', preferences: 'REMOTE WORKING',
      visibility: 'PUBLIC', aiManaged: true, matchThreshold: 80,
      createdAt: new Date().toISOString()
    };

    const page = String(await cvView(cv));
    ok(page.includes('tribe-details'), 'it uses the two-column card of the rest of the modules');
    ok(page.includes('Ada'), 'the name is the card title');
    ok(page.includes('/cv/visibility/'), 'the visibility switch is there');
    ok(page.includes('/cv/pdf'), 'and the PDF button');
    ok(page.includes('#solder') && page.includes('#weld'), 'skills are tags');
    ok(page.includes('Madrid'), 'location is in the metadata table');
    notOk(page.includes('style="'), 'no inline styles, the CSP would drop them');
    notOk(page.includes('>false<'), 'no falsy value leaked into the html');

    const hidden = String(await cvView({ ...cv, visibility: 'HIDDEN' }));
    ok(hidden.includes(String(require('../../../src/views/main_views').i18n.visibilityMakePublic)), 'a hidden CV offers to go public');

    const form = String(await createCVView({}, false));
    ok(form.includes('aiManaged'), 'the create form opens with the AI switch');
    ok(form.includes('matchThreshold'), 'and the match threshold');
  });
});
