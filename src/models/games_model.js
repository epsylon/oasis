const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 5000;

const VALID_GAMES = new Set([
  'cocoland', 'ecoinflow', 'spaceinvaders', 'arkanoid', 'pingpong',
  'asteroids', 'tiktaktoe', 'flipflop',
  '8ball', 'artillery', 'labyrinth', 'cocoman', 'tetris'
]);

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  async function readAll(ssbClient) {
    return new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, results) => (err ? reject(err) : resolve(results)))
      );
    });
  }

  return {
    async submitScore(game, score) {
      if (!VALID_GAMES.has(game)) throw new Error('invalid game');
      const n = Number(score);
      if (!Number.isFinite(n) || n < 0 || n > 9999999) throw new Error('invalid score');
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'gameScore', game, score: Math.round(n) }, (err, msg) => {
          if (err) reject(err); else resolve(msg);
        });
      });
    },

    async getHallOfFame() {
      const ssbClient = await openSsb();
      const messages = await readAll(ssbClient);
      const best = {};
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'gameScore') continue;
        if (!VALID_GAMES.has(c.game)) continue;
        const author = m.value.author;
        const score = Number(c.score);
        if (!Number.isFinite(score) || score < 0) continue;
        const key = `${c.game}:${author}`;
        if (!best[key] || score > best[key].score) {
          best[key] = { author, score, game: c.game, ts: m.value.timestamp || 0 };
        }
      }
      const hall = {};
      for (const game of VALID_GAMES) hall[game] = [];
      for (const entry of Object.values(best)) {
        if (hall[entry.game]) hall[entry.game].push(entry);
      }
      for (const game of VALID_GAMES) {
        hall[game] = hall[game].sort((a, b) => b.score - a.score).slice(0, 10);
      }
      return hall;
    }
  };
};
