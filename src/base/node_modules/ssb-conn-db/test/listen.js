const tape = require('tape');
const ConnDB = require('../lib');
const pull = require('pull-stream');
const fs = require('fs');
const path = require('path');

tape('pull stream emits when inserting new entry', function(t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:scuttlebutt.nz:8008~noauth');
    t.false(exists, 'address to be inserted is not yet in the database');

    let drained = false;
    pull(
      connDB.listen(),
      pull.drain(event => {
        t.equals(drained, false, 'this is the only event expected');
        drained = true;
        t.ok(event, 'the event object looks ok');
        t.equals(event.type, 'insert', 'event type is "insert"');
        t.equals(
          event.address,
          'net:scuttlebutt.nz:8008~noauth',
          'event address is correct',
        );

        setTimeout(() => {
          fs.writeFileSync(connJSONPath, connDataBefore);
          t.pass('teardown');
          t.end();
        }, 200);
      }),
    );

    t.pass('inserted a new entry');
    connDB.set('net:scuttlebutt.nz:8008~noauth', {source: 'stored'});
  }, 200);
});

tape('pull stream emits when updating existing entry', function(t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    let drained = false;
    pull(
      connDB.listen(),
      pull.drain(event => {
        t.equals(drained, false, 'this is the only event expected');
        drained = true;
        t.ok(event, 'the event object looks ok');
        t.equals(event.type, 'update', 'event type is "update"');
        t.equals(
          event.address,
          'net:staltz.com:8008~noauth',
          'event address is correct',
        );

        setTimeout(() => {
          fs.writeFileSync(connJSONPath, connDataBefore);
          t.pass('teardown');
          t.end();
        }, 200);
      }),
    );

    t.pass('updated an entry');
    connDB.set('net:staltz.com:8008~noauth', {source: 'pub'});
  }, 200);
});

tape('pull stream emits when deleting existing entry', function(t) {
  const dirPath = path.join(__dirname, './example');
  const connJSONPath = path.join(dirPath, './conn.json');
  const connDataBefore = fs.readFileSync(connJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath, writeTimeout: 0});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    const exists = connDB.has('net:staltz.com:8008~noauth');
    t.true(exists, 'address to be updated is in the database');

    let drained = false;
    pull(
      connDB.listen(),
      pull.drain(event => {
        t.equals(drained, false, 'this is the only event expected');
        drained = true;
        t.ok(event, 'the event object looks ok');
        t.equals(event.type, 'delete', 'event type is "delete"');
        t.equals(
          event.address,
          'net:staltz.com:8008~noauth',
          'event address is correct',
        );

        setTimeout(() => {
          fs.writeFileSync(connJSONPath, connDataBefore);
          t.pass('teardown');
          t.end();
        }, 200);
      }),
    );

    t.pass('deleted an entry');
    connDB.delete('net:staltz.com:8008~noauth');
  }, 200);
});
