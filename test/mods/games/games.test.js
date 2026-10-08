const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('games: submitting scores', (t) => {
  t('a score is published and shows up in the hall of fame', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const games = A.use('games');
    await games.submitScore('tetris', 1200);
    const hall = await games.getHallOfFame();
    eq(hall.tetris.length, 1);
    eq(hall.tetris[0].score, 1200);
    eq(hall.tetris[0].author, A.keypair.id);
  });

  t('only the best score of each player is kept', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const games = A.use('games');
    await games.submitScore('arkanoid', 300);
    await games.submitScore('arkanoid', 900);
    await games.submitScore('arkanoid', 500);
    const hall = await games.getHallOfFame();
    eq(hall.arkanoid.length, 1, 'one entry per player');
    eq(hall.arkanoid[0].score, 900, 'the best one');
  });

  t('decimal scores are rounded', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('games').submitScore('pingpong', 10.6);
    eq((await A.use('games').getHallOfFame()).pingpong[0].score, 11);
  });

  t('an unknown game or an impossible score is refused', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const games = A.use('games');
    await throwsAsync(() => games.submitScore('chess', 10), /invalid game/);
    await throwsAsync(() => games.submitScore('tetris', -5), /invalid score/);
    await throwsAsync(() => games.submitScore('tetris', 'lots'), /invalid score/);
    await throwsAsync(() => games.submitScore('tetris', 99999999), /invalid score/);
    const hall = await games.getHallOfFame();
    eq(hall.tetris.length, 0, 'nothing was recorded');
  });
});

describe('games: the catalogue', (t) => {
  t('every listed game ships its page and thumbnail, and nothing else is offered', async () => {
    const fs = require('fs'); const path = require('path');
    const dir = path.join(__dirname, '../../../src/games');
    const shipped = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()).sort();
    const { gamesView } = require('../../../src/views/games_view');
    const html = String(gamesView('all', null, ''));
    const listed = [...html.matchAll(/href="\/games\/([a-z0-9]+)"/g)].map(m => m[1]).sort();
    eq(listed.join(','), shipped.join(','), 'the catalogue and the shipped games are the same set');
    for (const id of shipped) {
      ok(fs.existsSync(path.join(dir, id, 'index.html')), `${id} has a page`);
      ok(fs.existsSync(path.join(dir, id, 'thumbnail.svg')), `${id} has a thumbnail`);
    }
  });

  t('a game that keeps no board refuses scores and shows none', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const games = A.use('games');
    const { gamesView } = require('../../../src/views/games_view');
    const html = String(gamesView('all', null, ''));
    const listed = [...html.matchAll(/href="\/games\/([a-z0-9]+)"/g)].map(m => m[1]);
    const hall = await games.getHallOfFame();
    const silent = listed.filter(id => !hall[id]);
    ok(silent.length > 0, 'some games are played for their own sake');
    for (const id of silent) await throwsAsync(() => games.submitScore(id, 10), /invalid game/);
  });
});

describe('games: hall of fame ranking', (t) => {
  t('players are ranked by score across the network', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('games').submitScore('asteroids', 400);
    B.setActor(); await B.use('games').submitScore('asteroids', 1500);
    A.setActor();
    const hall = await A.use('games').getHallOfFame();
    eq(hall.asteroids.length, 2);
    eq(hall.asteroids[0].author, B.keypair.id, 'the highest score leads');
    eq(hall.asteroids[1].author, A.keypair.id);
  });

  t('every game has its own board and an empty one is not an error', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('games').submitScore('labyrinth', 77);
    const hall = await A.use('games').getHallOfFame();
    ok(Array.isArray(hall.labyrinth) && hall.labyrinth.length === 1);
    ok(Array.isArray(hall.tetris) && hall.tetris.length === 0, 'games with no scores are still listed');
    notOk(hall.chess, 'unknown games have no board');
  });

  t('a board keeps at most ten players', async () => {
    const net = makeNetwork();
    const peers = Array.from({ length: 12 }, () => makePeer(net));
    for (let i = 0; i < peers.length; i++) {
      peers[i].setActor();
      await peers[i].use('games').submitScore('cocoman', 100 + i);
    }
    peers[0].setActor();
    const hall = await peers[0].use('games').getHallOfFame();
    eq(hall.cocoman.length, 10);
    eq(hall.cocoman[0].score, 111, 'the top score is first');
    eq(hall.cocoman[9].score, 102, 'the lowest of the top ten closes the board');
  });
});
