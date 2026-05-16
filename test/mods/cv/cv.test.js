const { eq, ok } = require('../../helpers/assert');
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
