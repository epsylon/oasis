const { div, h2, h3, p, section, form, input, button, a, img, table, tr, td, th, span, iframe } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");

const getGames = () => [
  { id: 'cocoland', title: () => i18n.gamesCocolandTitle, desc: () => i18n.gamesCocolandDesc },
  { id: 'ecoinflow', title: () => i18n.gamesTheFlowTitle, desc: () => i18n.gamesTheFlowDesc },
  { id: 'neoninfiltrator', title: () => i18n.gamesNeonInfiltratorTitle, desc: () => i18n.gamesNeonInfiltratorDesc },
  { id: 'audiopendulum', title: () => i18n.gamesAudioPendulumTitle, desc: () => i18n.gamesAudioPendulumDesc },
  { id: 'spaceinvaders', title: () => i18n.gamesSpaceInvadersTitle, desc: () => i18n.gamesSpaceInvadersDesc },
  { id: 'arkanoid', title: () => i18n.gamesArkanoidTitle, desc: () => i18n.gamesArkanoidDesc },
  { id: 'pingpong', title: () => i18n.gamesPingPongTitle, desc: () => i18n.gamesPingPongDesc },
  { id: 'asteroids', title: () => i18n.gamesAsteroidsTitle, desc: () => i18n.gamesAsteroidsDesc },
  { id: 'rockpaperscissors', title: () => i18n.gamesRockPaperScissorsTitle, desc: () => i18n.gamesRockPaperScissorsDesc },
  { id: 'tiktaktoe', title: () => i18n.gamesTikTakToeTitle, desc: () => i18n.gamesTikTakToeDesc },
  { id: 'flipflop', title: () => i18n.gamesFlipFlopTitle, desc: () => i18n.gamesFlipFlopDesc },
  { id: '8ball', title: () => i18n.games8BallTitle, desc: () => i18n.games8BallDesc },
  { id: 'artillery', title: () => i18n.gamesArtilleryTitle, desc: () => i18n.gamesArtilleryDesc },
  { id: 'labyrinth', title: () => i18n.gamesLabyrinthTitle, desc: () => i18n.gamesLabyrinthDesc },
  { id: 'cocoman', title: () => i18n.gamesCocomanTitle, desc: () => i18n.gamesCocomanDesc },
  { id: 'tetris', title: () => i18n.gamesTetrisTitle, desc: () => i18n.gamesTetrisDesc }
];

const shortId = (feedId) => feedId ? '@' + feedId.slice(1, 9) + '...' : '?';

const renderHallOfFame = (hall) => {
  const games = getGames();
  const gamesWithScores = games.filter(g => hall[g.id] && hall[g.id].length > 0);
  if (gamesWithScores.length === 0) {
    return p({ class: 'no-content' }, i18n.gamesNoScores || 'No scores yet.');
  }
  return div({ class: 'games-scoring-list' },
    gamesWithScores.map(game =>
      div({ class: 'game-scoring-section' },
        div({ class: 'game-scoring-header' },
          img({ src: `/game-assets/${game.id}/thumbnail.svg`, alt: game.title(), class: 'game-scoring-thumb', loading: 'lazy' }),
          div({ class: 'game-scoring-info' },
            h3({ class: 'game-card-title' }, game.title()),
            p({ class: 'game-card-desc game-desc-yellow' }, game.desc())
          )
        ),
        table({ class: 'hall-of-fame-table' },
          tr(th('#'), th(i18n.gamesHallPlayer), th(i18n.gamesHallScore), th(i18n.gamesHallDate || 'Date')),
          ...hall[game.id].map((entry, idx) =>
            tr(
              td(String(idx + 1)),
              td(a({ href: `/author/${encodeURIComponent(entry.author)}`, class: 'user-link' }, entry.author)),
              td({ class: idx === 0 ? 'score-first' : '' }, String(entry.score)),
              td(entry.ts ? moment(entry.ts).format('YYYY-MM-DD') : '\u2014')
            )
          )
        )
      )
    )
  );
};

const VALID_GAME_IDS = new Set(['cocoland','ecoinflow','neoninfiltrator','audiopendulum','spaceinvaders','arkanoid','pingpong','asteroids','rockpaperscissors','tiktaktoe','flipflop','8ball','artillery','labyrinth','cocoman','tetris']);

exports.gameShellView = (name) => {
  if (!VALID_GAME_IDS.has(name)) {
    return template(i18n.gamesTitle, section(p(i18n.notFound || 'Not found')));
  }
  const game = getGames().find(g => g.id === name);
  const filterBar = div({ class: 'filter-group' },
    form({ method: 'GET', action: '/games' },
      input({ type: 'hidden', name: 'filter', value: 'all' }),
      button({ type: 'submit', class: 'filter-btn' }, i18n.gamesFilterAll)
    ),
    form({ method: 'GET', action: '/games' },
      input({ type: 'hidden', name: 'filter', value: 'scoring' }),
      button({ type: 'submit', class: 'filter-btn' }, i18n.gamesFilterScoring)
    )
  );
  return template(
    game ? game.title() : name,
    section(
      div({ class: 'tags-header' },
        h2(i18n.gamesTitle),
        p(i18n.gamesDescription || 'Discover and play some mini-games in your network.')
      ),
      filterBar
    ),
    section({ class: 'game-shell-section' },
      iframe({
        src: `/game-assets/${name}/index.html`,
        class: `game-iframe game-iframe-${name}`,
        scrolling: 'no',
        allowfullscreen: true
      })
    )
  );
};

exports.gamesView = (filter = 'all', hall = null) => {
  const games = getGames();

  const filterBar = div({ class: 'filter-group' },
    form({ method: 'GET', action: '/games' },
      input({ type: 'hidden', name: 'filter', value: 'all' }),
      button({ type: 'submit', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' },
        i18n.gamesFilterAll
      )
    ),
    form({ method: 'GET', action: '/games' },
      input({ type: 'hidden', name: 'filter', value: 'scoring' }),
      button({ type: 'submit', class: filter === 'scoring' ? 'filter-btn active' : 'filter-btn' },
        i18n.gamesFilterScoring
      )
    )
  );

  const content = filter === 'scoring' && hall
    ? renderHallOfFame(hall)
    : div({ class: 'games-single-col' },
        games.map(game => {
          const topScore = hall && hall[game.id] && hall[game.id].length > 0 ? hall[game.id][0] : null;
          return div({ class: 'game-row' },
            div({ class: 'game-row-media' },
              img({ src: `/game-assets/${game.id}/thumbnail.svg`, alt: game.title(), loading: 'lazy' })
            ),
            div({ class: 'game-row-body' },
              h2({ class: 'game-card-title' }, game.title()),
              p({ class: 'game-card-desc game-desc-yellow' }, game.desc()),
              topScore
                ? p({ class: 'game-top-score' },
                    a({ href: `/author/${encodeURIComponent(topScore.author)}`, class: 'user-link' }, topScore.author),
                    span({ class: 'game-new-record-label' }, ' - ' + (i18n.gamesNewRecord || 'New Record') + ': '),
                    String(topScore.score)
                  )
                : null
            ),
            div({ class: 'game-row-actions' },
              a({ href: `/games/${game.id}`, class: 'filter-btn' }, i18n.gamesPlayButton)
            )
          );
        })
      );

  return template(
    i18n.gamesTitle,
    section(
      div({ class: 'tags-header' },
        h2(i18n.gamesTitle),
        p(filter === 'scoring' ? i18n.gamesHallOfFame : (i18n.gamesDescription || 'Discover and play some mini-games in your network.'))
      ),
      filterBar
    ),
    section(content)
  );
};
