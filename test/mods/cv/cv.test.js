const { eq, ok, throwsAsync } = require('../../helpers/assert');
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
