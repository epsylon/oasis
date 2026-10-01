const tape = require('tape');
const ConnDB = require('../lib');
const fs = require('fs');
const path = require('path');

tape('CRUD: has() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'data exists for a certain address');
    t.end();
  }, 200);
});

tape('CRUD: get() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  setTimeout(() => {
    const data = connDB.get('net:staltz.com:8008~noauth');
    t.equals(data.source, 'stored', 'data exists for a certain address');
    t.end();
  }, 200);
});

tape('CRUD: getAddressForId() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  setTimeout(() => {
    const address = connDB.getAddressForId(
      '@dABVXEERk+yJSzdrDRUfF8R6FlXG7h9PaXKXlt8ma78=.ed25519',
    );
    t.equals(
      address,
      'net:staltz.com:8008~noauth',
      'address exists for given id',
    );
    t.end();
  }, 200);
});

tape('CRUD: entries() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  setTimeout(() => {
    const entries = Array.from(connDB.entries());
    t.equals(entries.length, 1, 'there is one address in the database');
    const [address, data] = entries[0];
    t.equals(address, 'net:staltz.com:8008~noauth', 'the address looks ok');
    t.equals(data.source, 'stored', 'the data for that address looks ok');
    t.end();
  }, 200);
});

tape('CRUD: replace() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:scuttlebutt.nz:8008~noauth');
    t.false(exists, 'address to be inserted is not yet in the database');

    const connDB2 = connDB.replace('net:scuttlebutt.nz:8008~noauth', {
      source: 'stored',
    });

    t.strictEquals(connDB2, connDB, 'replace() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: set() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    const connDB2 = connDB.set('net:staltz.com:8008~noauth', {
      failure: 0,
    });

    t.strictEquals(connDB2, connDB, 'set() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: set() with undefined deletes the property', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    const connDB2 = connDB.set('net:staltz.com:8008~noauth', {
      source: undefined,
    });

    t.strictEquals(connDB2, connDB, 'set() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: update() works with object argument', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    const connDB2 = connDB.update('net:staltz.com:8008~noauth', {
      failure: 0,
    });

    t.strictEquals(connDB2, connDB, 'update() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: update() works with function argument', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    const connDB2 = connDB.update('net:staltz.com:8008~noauth', (prev) => ({
      source: prev.source.toUpperCase(),
    }));

    t.strictEquals(connDB2, connDB, 'update() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: update() is incapable of inserting', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:scuttlebutt.nz:8008~noauth');
    t.false(exists, 'address to be updated is not yet in the database');

    const connDB2 = connDB.update('net:scuttlebutt.nz:8008~noauth', {
      source: 'stored',
    });

    t.strictEquals(connDB2, connDB, 'update() returns the instance');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.equals(connDataAfter, connDataBefore, 'conn.json stayed untouched');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: delete() works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be deleted is in the database');

    connDB.delete('net:staltz.com:8008~noauth');

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.notEquals(connDataAfter, connDataBefore, 'conn.json changed');
      t.equals(connDataAfter, '{}', 'conn.json is the empty JSON object');

      fs.writeFileSync(connJSONPath, connDataBefore);
      t.pass('teardown');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: validates multiserver address upon insertion', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:facebook.com:8008~');
    t.false(exists, 'address to be inserted is not yet in the database');

    t.throws(
      () => {
        connDB.set('net:facebook.com:8008~', {source: 'stored'});
      },
      /not a valid/,
      'set() throws an error upon invalid address',
    );

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.equals(connDataAfter, connDataBefore, 'conn.json did not change');
      t.end();
    }, 200);
  }, 200);
});

tape('CRUD: after close(), nothing works', function (t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:facebook.com:8008~noauth');
    t.false(exists, 'has() can be used before close()');

    connDB.close();
    t.pass('close() succeeds silently');

    t.throws(
      () => {
        connDB.has('net:facebook.com:8008~noauth');
      },
      /instance is closed/,
      'has() throws an error after close()',
    );

    setTimeout(() => {
      const connDataAfter = fs.readFileSync(connJSONPath, 'utf8');
      t.equals(connDataAfter, connDataBefore, 'conn.json did not change');
      t.end();
    }, 200);
  }, 200);
});
