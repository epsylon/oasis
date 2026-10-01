const tape = require('tape');
const ConnDB = require('../lib');
const fs = require('fs');
const path = require('path');

tape('init: create when conn.json=absent, gossip.json=absent', function(t) {
  const dirPath = path.join(__dirname, './absent-absent');
  const connJSONPath = path.join(dirPath, './conn.json');
  const gossipJSONPath = path.join(dirPath, './gossip.json');
  t.ok(!fs.existsSync(connJSONPath), 'conn.json does not exist');
  t.ok(!fs.existsSync(gossipJSONPath), 'gossip.json does not exist');

  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
    t.ok(!fs.existsSync(gossipJSONPath), 'gossip.json does not exist');

    const connData = fs.readFileSync(connJSONPath, 'utf8');
    t.equals(connData, '{}', 'conn.json data should be empty JSON object');

    fs.unlinkSync(connJSONPath);
    t.pass('teardown');
    t.end();
  }, 500);
});

tape('init: migrate when conn.json=absent, gossip.json=present', function(t) {
  const dirPath = path.join(__dirname, './absent-present');
  const connJSONPath = path.join(dirPath, './conn.json');
  const gossipJSONPath = path.join(dirPath, './gossip.json');
  t.ok(!fs.existsSync(connJSONPath), 'conn.json does not exist');
  t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

  const gossipDataBefore = fs.readFileSync(gossipJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
    t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

    const gossipDataAfter = fs.readFileSync(gossipJSONPath, 'utf8');
    t.equals(gossipDataBefore, gossipDataAfter, 'gossip.json stayed untouched');

    const entries = Array.from(connDB.entries());
    t.true(entries.length === 1, 'connDB has one address');

    t.equals(
      entries[0][0],
      'net:bloor.ansuz.xyz:8008~shs:dABVXEERk+yJSzdrDRUfF8R6FlXG7h9PaXKXlt8ma78=',
      'address looks good',
    );

    fs.unlinkSync(connJSONPath);
    t.pass('teardown');
    t.end();
  }, 500);
});

tape('init: load when conn.json=present, gossip.json=absent', function(t) {
  const dirPath = path.join(__dirname, './present-absent');
  const connJSONPath = path.join(dirPath, './conn.json');
  const gossipJSONPath = path.join(dirPath, './gossip.json');
  t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
  t.ok(!fs.existsSync(gossipJSONPath), 'gossip.json does not exist');

  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
    t.ok(!fs.existsSync(gossipJSONPath), 'gossip.json does not exist');

    const entries = Array.from(connDB.entries());
    t.true(entries.length === 1, 'connDB has one address');
    t.equals(entries[0][0], 'net:staltz.com:8008~noauth', 'address looks good');

    t.end();
  }, 500);
});

tape('init: load when conn.json=present, gossip.json=present', function(t) {
  const dirPath = path.join(__dirname, './present-present');
  const connJSONPath = path.join(dirPath, './conn.json');
  const gossipJSONPath = path.join(dirPath, './gossip.json');
  t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
  t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

  const connData = fs.readFileSync(connJSONPath, 'utf8');
  const gossipDataBefore = fs.readFileSync(gossipJSONPath, 'utf8');
  t.notEquals(
    connData,
    gossipDataBefore,
    'conn.json data different than gossip.json data',
  );

  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
    t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

    const connData = fs.readFileSync(connJSONPath, 'utf8');
    const gossipDataAfter = fs.readFileSync(gossipJSONPath, 'utf8');
    t.notEquals(
      connData,
      gossipDataAfter,
      'conn.json data different than gossip.json data',
    );

    t.equals(gossipDataBefore, gossipDataAfter, 'gossip.json stayed untouched');

    const entries = Array.from(connDB.entries());
    t.true(entries.length === 1, 'connDB has one address');

    t.equals(
      entries[0][0],
      'net:bloor.ansuz.xyz:8008~shs:dABVXEERk+yJSzdrDRUfF8R6FlXG7h9PaXKXlt8ma78=',
      'address looks good',
    );

    t.end();
  }, 500);
});

tape('init: loaded() promise works', function(t) {
  const dirPath = path.join(__dirname, './example');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  const entries = Array.from(connDB.entries());
  t.equals(entries.length, 0, 'before loaded(), there is no data');
  connDB.loaded().then(() => {
    const entries = Array.from(connDB.entries());
    t.equals(entries.length, 1, 'after loaded(), there is data');
    const [address, data] = entries[0];
    t.equals(address, 'net:staltz.com:8008~noauth', 'the address looks ok');
    t.equals(data.source, 'stored', 'the data for that address looks ok');
    t.end();
  });
});

tape('init: migrate legacy {host,port,key} without crashing', function(t) {
  const dirPath = path.join(__dirname, './legacy-addr');
  const connJSONPath = path.join(dirPath, './conn.json');
  const gossipJSONPath = path.join(dirPath, './gossip.json');
  t.ok(!fs.existsSync(connJSONPath), 'conn.json does not exist');
  t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

  const gossipDataBefore = fs.readFileSync(gossipJSONPath, 'utf8');

  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');

  setTimeout(() => {
    t.ok(fs.existsSync(connJSONPath), 'conn.json exists');
    t.ok(fs.existsSync(gossipJSONPath), 'gossip.json exists');

    const gossipDataAfter = fs.readFileSync(gossipJSONPath, 'utf8');
    t.equals(gossipDataBefore, gossipDataAfter, 'gossip.json stayed untouched');

    const entries = Array.from(connDB.entries());
    t.true(entries.length === 1, 'connDB has one address');

    t.equals(
      entries[0][0],
      'net:bloor.ansuz.xyz:8008~shs:dABVXEERk+yJSzdrDRUfF8R6FlXG7h9PaXKXlt8ma78=',
      'address looks good',
    );

    fs.unlinkSync(connJSONPath);
    t.pass('teardown');
    t.end();
  }, 500);
});

tape('init: recover from corrupted conn.json file', function(t) {
  const dirPath = path.join(__dirname, './corrupted');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  const entries = Array.from(connDB.entries());
  t.equals(entries.length, 0, 'before loaded(), there is no data');
  connDB.loaded().then(() => {
    const entries = Array.from(connDB.entries());
    t.equals(entries.length, 1, 'after loaded(), there is data');
    const [address, data] = entries[0];
    t.equals(address, 'net:staltz.com:8008~noauth', 'the address looks ok');
    t.equals(data.source, 'stored', 'the data for that address looks ok');
    t.end();
  });
});

tape('init: cannot recover from totally broken conn.json file', function(t) {
  const dirPath = path.join(__dirname, './irrecoverable');
  const connDB = new ConnDB({path: dirPath});
  t.ok(connDB, 'connDB instance was created');
  const entries = Array.from(connDB.entries());
  t.equals(entries.length, 0, 'before loaded(), there is no data');
  connDB.loaded().then(() => {
    const entries = Array.from(connDB.entries());
    t.equals(entries.length, 0, 'after loaded(), there is data');
    t.end();
  });
});
