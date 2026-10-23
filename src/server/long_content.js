const longText = require('../backend/long_text');

const wrapPublish = (fn, self, publishChunk) => function (content, ...rest) {
  const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : null;
  if (!cb || !content || typeof content !== 'object') return fn.call(self, content, ...rest);
  longText.autoChunk(content, publishChunk).then(
    (head) => fn.call(self, head, ...rest),
    (err) => cb(err)
  );
};

module.exports = {
  name: 'longContent',
  version: '1.0.0',
  manifest: {},
  init(server) {
    const db = server.db;
    if (!db || typeof db.publish !== 'function') return {};
    const publishChunk = (chunk) => new Promise((resolve, reject) => db.publish(chunk, (err, msg) => err ? reject(err) : resolve(msg)));
    db.publish = wrapPublish(db.publish, db, publishChunk);
    if (typeof server.publish === 'function') server.publish = wrapPublish(server.publish, server, publishChunk);
    if (typeof db.create === 'function') {
      const create = db.create;
      db.create = function (opts, cb) {
        const content = opts && opts.content;
        if (typeof cb !== 'function' || !content || typeof content !== 'object') return create.call(db, opts, cb);
        const withRecps = Array.isArray(opts.recps) && opts.recps.length && !Array.isArray(content.recps) ? { ...content, recps: opts.recps } : content;
        const chunkViaCreate = (chunk) => new Promise((resolve, reject) => {
          const { recps, ...body } = chunk;
          create.call(db, { ...opts, content: body }, (err, kvt) => err ? reject(err) : resolve(kvt));
        });
        longText.autoChunk(withRecps, chunkViaCreate).then((head) => {
          const body = head === withRecps ? content : (({ recps, ...rest }) => (Array.isArray(content.recps) ? head : rest))(head);
          create.call(db, { ...opts, content: body }, cb);
        }, (err) => cb(err));
      };
    }
    return {};
  }
};
