const tape = require('tape');
const ConnQuery = require('../lib');

const TEST_ADDR =
  'net:localhost:9752~shs:pAhDcHjunq6epPvYYo483vBjcuDkE10qrc2tYC827R0=';

const time15 = new Date('2019-01-01T06:30:15').getTime();
const time17 = new Date('2019-01-01T06:30:17').getTime();
const time30 = new Date('2019-01-01T06:30:30').getTime();

const mockedDb = {
  entries: () => [
    [
      'net:hub.com:1234~noauth',
      {
        source: 'friends',
        stateChange: time15,
        failure: 1,
        duration: {mean: 1.1},
        ping: {rtt: {mean: 3.5}},
      },
    ],
    [
      'net:hub.com:2345~noauth',
      {
        source: 'pub',
        stateChange: time15,
        failure: 4,
      },
    ],
    [
      'net:hub.com:3456~noauth',
      {
        source: 'manual',
        stateChange: time15,
        duration: {mean: 1.1},
      },
    ],
    [
      'net:hub.com:4567~noauth',
      {
        source: 'manual',
        stateChange: time17,
        duration: {mean: 1.1},
        ping: {rtt: {mean: 3.5}},
      },
    ],
  ],
  get(address) {
    const entry = this.entries().find(([addr]) => addr === address);
    if (!entry) return undefined;
    else return entry[1];
  },
  has(address) {
    return !!this.get(address);
  },
};

const mockedHub = {
  entries: () => [
    ['net:hub.com:1234~noauth', {state: 'connected'}],
    ['net:hub.com:2345~noauth', {state: 'connecting'}],
    ['net:hub.com:3456~noauth', {state: 'disconnecting'}],
    ['net:hub.com:4567~noauth', {state: 'connected'}],
    ['net:192.168.1.12:5678~noauth', {state: 'connecting'}],
    ['bt:65D900DDB353~noauth', {state: 'connecting'}],
  ],
  getState(address) {
    const entry = this.entries().find(([addr]) => addr === address);
    if (!entry) return undefined;
    return entry[1].state;
  },
};

const mockedStaging = {
  entries: () => [
    ['net:192.168.1.12:5678~noauth', {type: 'lan'}],
    ['net:192.168.1.13:6789~noauth', {type: 'lan'}],
  ],
};

function orderPeersByAddress(array) {
  return array.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
}

tape('peersAll()', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersAll();
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      ['bt:65D900DDB353~noauth', {pool: 'hub', state: 'connecting'}],
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:2345~noauth',
        {
          pool: 'db',
          source: 'pub',
          failure: 4,
          stateChange: time15,
        },
      ],
      [
        'net:hub.com:3456~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time15,
          duration: {mean: 1.1},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:192.168.1.12:5678~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
      [
        'net:192.168.1.13:6789~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('peersConnected()', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersConnected();
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
    ]),
  );

  t.end();
});

tape('peersConnecting()', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersConnecting();
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      ['bt:65D900DDB353~noauth', {pool: 'hub', state: 'connecting'}],
      [
        'net:hub.com:2345~noauth',
        {
          pool: 'db',
          source: 'pub',
          failure: 4,
          stateChange: time15,
        },
      ],
      [
        'net:192.168.1.12:5678~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('peersInConnection()', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersInConnection();
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      ['bt:65D900DDB353~noauth', {pool: 'hub', state: 'connecting'}],
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:2345~noauth',
        {
          pool: 'db',
          source: 'pub',
          failure: 4,
          stateChange: time15,
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:192.168.1.12:5678~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('peersConnectable("db")', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersConnectable('db');
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:3456~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time15,
          duration: {mean: 1.1},
        },
      ],
    ]),
  );

  t.end();
});

tape('peersConnectable("staging")', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersConnectable('staging');
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:192.168.1.13:6789~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('peersConnectable("dbAndStaging")', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersConnectable('dbAndStaging');
  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:3456~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time15,
          duration: {mean: 1.1},
        },
      ],
      [
        'net:192.168.1.13:6789~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('query hasNoAttempts', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersAll().filter(ConnQuery.hasNoAttempts);

  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      ['bt:65D900DDB353~noauth', {pool: 'hub', state: 'connecting'}],
      [
        'net:192.168.1.12:5678~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
      [
        'net:192.168.1.13:6789~noauth',
        {
          pool: 'staging',
          type: 'lan',
        },
      ],
    ]),
  );

  t.end();
});

tape('query hasOnlyFailedAttempts', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersAll().filter(ConnQuery.hasOnlyFailedAttempts);

  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:2345~noauth',
        {
          pool: 'db',
          source: 'pub',
          failure: 4,
          stateChange: time15,
        },
      ],
    ]),
  );

  t.end();
});

tape('query hasSuccessfulAttempts', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersAll().filter(ConnQuery.hasSuccessfulAttempts);

  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:3456~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time15,
          duration: {mean: 1.1},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
    ]),
  );

  t.end();
});

tape('query hasPinged', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = connQuery.peersAll().filter(ConnQuery.hasPinged);

  t.deepEquals(
    orderPeersByAddress(peers),
    orderPeersByAddress([
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
    ]),
  );

  t.end();
});

tape('query passesExpBackoff', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const smallBackoff = connQuery
    .peersAll()
    .filter(ConnQuery.hasPinged)
    .filter(ConnQuery.passesExpBackoff(5e3, 60e3, time30));

  t.deepEquals(
    orderPeersByAddress(smallBackoff),
    orderPeersByAddress([
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
    ]),
  );

  const mediumBackoff = connQuery
    .peersAll()
    .filter(ConnQuery.hasPinged)
    .filter(ConnQuery.passesExpBackoff(8e3, 60e3, time30));

  t.deepEquals(mediumBackoff, [
    [
      'net:hub.com:4567~noauth',
      {
        pool: 'db',
        source: 'manual',
        stateChange: time17,
        duration: {mean: 1.1},
        ping: {rtt: {mean: 3.5}},
      },
    ],
  ]);

  const bigBackoff = connQuery
    .peersAll()
    .filter(ConnQuery.hasPinged)
    .filter(ConnQuery.passesExpBackoff(20e3, 60e3, time30));

  t.deepEquals(bigBackoff, []);

  t.end();
});

tape('query passesGroupDebounce', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const smallDebounce = ConnQuery.passesGroupDebounce(10e3, time30)(
    connQuery.peersAll().filter(ConnQuery.hasPinged),
  );

  t.deepEquals(
    orderPeersByAddress(smallDebounce),
    orderPeersByAddress([
      [
        'net:hub.com:1234~noauth',
        {
          pool: 'db',
          source: 'friends',
          failure: 1,
          stateChange: time15,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
      [
        'net:hub.com:4567~noauth',
        {
          pool: 'db',
          source: 'manual',
          stateChange: time17,
          duration: {mean: 1.1},
          ping: {rtt: {mean: 3.5}},
        },
      ],
    ]),
  );

  const bigDebounce = ConnQuery.passesGroupDebounce(15e3, time30)(
    connQuery.peersAll().filter(ConnQuery.hasPinged),
  );

  t.deepEquals(bigDebounce, []);

  t.end();
});

tape('sortByStateChange', t => {
  const connQuery = new ConnQuery(mockedDb, mockedHub, mockedStaging);

  const peers = ConnQuery.sortByStateChange(
    connQuery.peersAll().filter(ConnQuery.hasPinged),
  ).reverse();

  t.deepEquals(peers, [
    [
      'net:hub.com:4567~noauth',
      {
        pool: 'db',
        source: 'manual',
        stateChange: time17,
        duration: {mean: 1.1},
        ping: {rtt: {mean: 3.5}},
      },
    ],
    [
      'net:hub.com:1234~noauth',
      {
        pool: 'db',
        source: 'friends',
        failure: 1,
        stateChange: time15,
        duration: {mean: 1.1},
        ping: {rtt: {mean: 3.5}},
      },
    ],
  ]);

  t.end();
});
