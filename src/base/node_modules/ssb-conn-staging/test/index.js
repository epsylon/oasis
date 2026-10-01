const tape = require('tape');
const pull = require('pull-stream');
const ConnStaging = require('../lib');

const TEST_ADDR =
  'net:localhost:9752~shs:pAhDcHjunq6epPvYYo483vBjcuDkE10qrc2tYC827R0=';

tape('stage(), entries(), unstage(), entries()', t => {
  const connStaging = new ConnStaging();

  const address = TEST_ADDR;
  const result1 = connStaging.stage(address, {mode: 'internet', address});
  t.equals(result1, true, 'stage() succeeds');

  const entries1 = Array.from(connStaging.entries());
  t.equals(entries1.length, 1, 'there is one address in staging');
  const [actualAddress] = entries1[0];
  t.equals(actualAddress, TEST_ADDR, 'staged address is what we expected');

  const result2 = connStaging.unstage(address);
  t.equals(result2, true, 'unstage() succeeds');

  const entries2 = Array.from(connStaging.entries());
  t.equals(entries2.length, 0, 'there is nothing in staging');

  t.end();
});

tape('stage(), get()', t => {
  const connStaging = new ConnStaging();

  const address = TEST_ADDR;
  const result1 = connStaging.stage(address, {mode: 'internet', address});
  t.equals(result1, true, 'stage() succeeds');

  const result2 = connStaging.get(address);
  t.ok(result2, 'there is a result from get()');
  t.equals(result2.mode, 'internet');

  t.end();
});

tape('liveEntries() emits all entries as they update', t => {
  const connStaging = new ConnStaging();

  let i = 0;
  pull(
    connStaging.liveEntries(),
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
        t.equals(entry[1].mode, 'internet', 'mode === internet');
        t.true(entry[1].stagingBirth > 1000, 'there exists stagingBirth');
      } else if (i === 3) {
        t.pass('THIRD EMISSION');
        t.equals(entries.length, 0, 'entries === []');
        t.end();
      } else {
        t.fail('listen() should not emit further events');
      }
    }),
  );

  const address = TEST_ADDR;
  connStaging.stage(address, {mode: 'internet', address});
  connStaging.unstage(address);
});

tape('refuses to stage redundantly', t => {
  const connStaging = new ConnStaging();

  const address = TEST_ADDR;
  const result1 = connStaging.stage(address, {mode: 'internet', address});
  t.equals(result1, true, 'stage() succeeds');

  const entries1 = Array.from(connStaging.entries());
  t.equals(entries1.length, 1, 'there is one address in staging');
  const [actualAddress] = entries1[0];
  t.equals(actualAddress, TEST_ADDR, 'staged address is what we expected');

  const result2 = connStaging.stage(address, {mode: 'internet', address});
  t.equals(result2, false, 'stage() should refuse');

  const entries2 = Array.from(connStaging.entries());
  t.equals(entries2.length, 1, 'there is (still) one address in staging');

  t.end();
});

tape('refuses to unstage redundantly', t => {
  const connStaging = new ConnStaging();

  const address = TEST_ADDR;
  const result1 = connStaging.unstage(address);
  t.equals(result1, false, 'unstage() should refuse');

  const entries1 = Array.from(connStaging.entries());
  t.equals(entries1.length, 0, 'there is nothing in staging');

  t.end();
});
