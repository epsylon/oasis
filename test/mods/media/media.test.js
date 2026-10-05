const { ok, eq, notOk } = require('../../helpers/assert');

describe('media: licenses', (t) => {
  const { makeNetwork, makePeer } = require('../../helpers/setup');
  const BLOB = '[file](&lic00000000000000000000000000000000000000000000.sha256)';
  const KINDS = [
    ['audios', 'createAudio', 'updateAudioById', true],
    ['videos', 'createVideo', 'updateVideoById', true],
    ['images', 'createImage', 'updateImageById', true],
    ['documents', 'createDocument', 'updateDocumentById', false]
  ];

  t('the chosen license is stored, kept on edits that do not touch it and replaced when changed', async () => {
    for (const [kind, create, update, hasMap] of KINDS) {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const model = A.use(kind);
      const args = (title, license) => hasMap ? [[], title, 'd', '', license] : [[], title, 'd', license];
      const r = await model[create](BLOB, ...args('first', 'CC-BY-SA-4.0'));
      eq((await model.listAll('all'))[0].license, 'CC-BY-SA-4.0', `${kind}: stored`);
      await model[update](r.key, null, ...args('second', undefined));
      const kept = (await model.listAll('all'))[0];
      eq(kept.title, 'second', `${kind}: the edit went through`);
      eq(kept.license, 'CC-BY-SA-4.0', `${kind}: an edit without the field keeps it`);
      await model[update](kept.key, null, ...args('third', 'CC-BY-4.0'));
      eq((await model.listAll('all'))[0].license, 'CC-BY-4.0', `${kind}: and a new choice replaces it`);
    }
  });

});
