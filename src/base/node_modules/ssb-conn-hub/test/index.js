const tape = require('tape');
const ssbKeys = require('ssb-keys');
const SecretStack = require('secret-stack');
const caps = require('ssb-caps');
const pull = require('pull-stream');
const ConnHub = require('../lib');

const ssbServer = SecretStack({
  appKey: caps.shs,
  temp: 'connhub',
  keys: ssbKeys.generate(),
  timeout: 1000,
})();

const TEST_KEY = '@pAhDcHjunq6epPvYYo483vBjcuDkE10qrc2tYC827R0=.ed25519';
const TEST_ADDR =
  'net:localhost:9752~shs:pAhDcHjunq6epPvYYo483vBjcuDkE10qrc2tYC827R0=';

tape('connect() rejects promise, given unreachable peer', t => {
  const connHub = new ConnHub(ssbServer);

  connHub.connect(TEST_ADDR).then(
    () => {
      t.fail('The connection should not succeed');
    },
    err => {
      t.ok(err, 'The connection should fail');
      t.equals(err.code, 'ECONNREFUSED', 'The error should be ECONNREFUSED');
      t.end();
    },
  );
});

tape('listen() emits connecting then connecting-failed', t => {
  const connHub = new ConnHub(ssbServer);

  let i = 0;
  pull(
    connHub.listen(),
    pull.drain(ev => {
      ++i;
      if (i === 1) {
        t.equals(ev.type, 'connecting', '1st event is connecting');
        t.equals(ev.key, TEST_KEY, 'The event has the correct .key');
        t.equals(ev.address, TEST_ADDR, 'The event has the correct .address');
      } else if (i === 2) {
        t.equals(ev.type, 'connecting-failed', '2nd is connecting-failed');
        t.equals(ev.key, TEST_KEY, 'The event has the correct .key');
        t.equals(ev.address, TEST_ADDR, 'The event has the correct .address');
        t.ok(ev.details, 'The event has .details property');
        t.equals(ev.details.code, 'ECONNREFUSED', 'The detail is an error');
        t.end();
      } else {
        t.fail('listen() should not emit further events');
      }
    }),
  );

  connHub.connect(TEST_ADDR).then(
    () => {
      t.fail('The connection should not succeed');
    },
    _err => {},
  );
});

tape('update() returns true when the peer is in ConnHub', t => {
  const connHub = new ConnHub(ssbServer);

  let i = 0;
  pull(
    connHub.listen(),
    pull.drain(ev => {
      ++i;
      if (i === 1) {
        t.equals(ev.type, 'connecting', '1st event is connecting');

        const a1 = [...connHub.entries()];
        t.equals(a1.length, 1, 'There is one entry');
        t.equals(a1[0].length, 2, 'The entry is a tuple');
        t.equals(typeof a1[0][1].foo, 'undefined', 'Field "foo" is undefined');

        const result = connHub.update(TEST_ADDR, {foo: 'bar'});
        t.strictEqual(result, true, 'Returns true');

        const a2 = [...connHub.entries()];
        t.equals(a2.length, 1, 'There is one entry');
        t.equals(a2[0].length, 2, 'The entry is a tuple');
        t.equals(a2[0][1].foo, 'bar', 'Field "foo" equals "bar"');
      } else if (i === 2) {
        t.equals(ev.type, 'connecting-failed', '2nd is connecting-failed');
        t.end();
      } else {
        t.fail('listen() should not emit further events');
      }
    }),
  );

  connHub.connect(TEST_ADDR).then(
    () => {
      t.fail('The connection should not succeed');
    },
    _err => {},
  );
});

tape('update() returns false when the peer is not in ConnHub', t => {
  const connHub = new ConnHub(ssbServer);

  const result = connHub.update(TEST_ADDR, {foo: 'bar'});
  t.strictEqual(result, false, 'Returns false');
  t.end();
});

tape('liveEntries() emits all entries as they update', t => {
  const connHub = new ConnHub(ssbServer);

  let i = 0;
  pull(
    connHub.liveEntries(),
    pull.drain(entries => {
      ++i;
      if (i === 1) {
        t.pass('FIRST EMISSION');
        t.equals(entries.length, 0, 'entries === []');
      } else if (i === 2) {
        t.pass('SECOND EMISSION');
        t.equals(entries.length, 1, 'there is one entry');
        const entry = entries[0];
        t.equals(entry[0], TEST_ADDR, 'left is the address');
        t.equals(typeof entry[1], 'object', 'right is the data');
        t.equals(entry[1].state, 'connecting', 'state is connecting');
      } else if (i === 3) {
        t.pass('THIRD EMISSION');
        t.equals(entries.length, 0, 'entries === []');
        t.end();
      } else {
        t.fail('listen() should not emit further events');
      }
    }),
  );

  connHub.connect(TEST_ADDR).then(
    () => {
      t.fail('The connection should not succeed');
    },
    _err => {},
  );
});

tape('disconnect() resolves with false when there was no connection', t => {
  const connHub = new ConnHub(ssbServer);

  connHub.disconnect(TEST_ADDR).then(
    result => {
      t.strictEquals(result, false, 'Resolves with false');
      t.end();
    },
    _err => {
      t.fail('The disconnection should not happen');
    },
  );
});

tape('after close(), nothing works', function(t) {
  t.plan(3);
  const connHub = new ConnHub(ssbServer);

  connHub.disconnect(TEST_ADDR).then(
    result => {
      t.strictEquals(result, false, 'Resolves with false');

      connHub.close();
      t.pass('close() succeeds silently');

      t.throws(
        () => {
          const x = connHub.entries();
        },
        /instance is closed/,
        'entries() throws an error after close()',
      );

      t.end();
    },
    _err => {
      t.fail('The disconnection should not happen');
    },
  );
});

tape('teardown', t => {
  ssbServer.close();
  t.end();
});
