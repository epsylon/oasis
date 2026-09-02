const { div, h1, h2, h3, p, section, button, form, input, span, img, a, br, table, tr, td, textarea, label, strong, details, summary } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink } = require("./main_views");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const moment = require("../server/node_modules/moment");

const fmtCycle = (c) => c && c.formatted ? c.formatted : '';

const houseImageSrc = (house) => (house && house.image) ? house.image : '/assets/larp/images/default.jpg';

const renderCycleBanner = (cycle) => div({ class: 'larp-cycle-banner' },
  span({ class: 'larp-cycle-label' }, i18n.larpCycleLabel || 'Cycle'),
  span({ class: 'larp-cycle-value' }, fmtCycle(cycle))
);

const renderHouseBadges = ({ myHouse, governingHouse, houses }) => {
  const academia = Array.isArray(houses) ? houses.find(h => h.key === 'academia') : null;
  const isNewcomer = !myHouse;
  return div({ class: 'larp-house-badges' },
    myHouse ? div({ class: 'larp-my-house' },
      span({ class: 'larp-my-house-label' }, i18n.larpMyHouse || 'My House'),
      a({ href: `/larp/${myHouse.key}`, class: 'larp-my-house-link' }, myHouse.name)
    ) : null,
    governingHouse ? div({ class: 'larp-my-house' },
      span({ class: 'larp-my-house-label' }, i18n.larpGoverning || 'Ruling:'),
      a({ href: `/larp/${governingHouse.key}`, class: 'larp-my-house-link' }, governingHouse.name)
    ) : null,
    isNewcomer && academia ? div({ class: 'larp-my-house larp-academia-hint' },
      span({ class: 'larp-my-house-label' }, i18n.larpStartHere),
      a({ href: `/larp/${academia.key}`, class: 'larp-my-house-link' }, academia.name)
    ) : null
  );
};

const renderHouseNav = (houses, currentKey) => div({ class: 'larp-house-nav' },
  span({ class: 'larp-house-nav-label' }, i18n.larpAllHouses || 'Houses:'),
  houses.map(h => a({
    href: `/larp/${h.key}`,
    class: h.key === currentKey ? 'larp-house-nav-chip active' : 'larp-house-nav-chip',
    title: h.name
  }, h.name))
);

const renderHousePanel = (house, members, posts, { canPost, viewerHouseKey, cyclesUntilRuling, canTakeTest = false }) => {
  const { renderEncryptedChip } = require('./clearnet_view');
  const isInHouse = viewerHouseKey === house.key;
  const isInLarp = viewerHouseKey !== null && viewerHouseKey !== undefined;
  const isMemberE2E = isInHouse && house.key !== 'academia';
  const isAcademia = house.key === 'academia';
  const canInvite = isInHouse && !isAcademia;
  const canLeaveToAcademia = isInHouse && !isAcademia;
  const canLeaveLarp = isInHouse && isAcademia;
  const canJoinAcademia = !isInLarp && isAcademia;
  const showInviteForm = !isAcademia && !isInHouse && (viewerHouseKey === 'academia' || !isInLarp);
  return div({ class: 'larp-detail' },
  div({ class: 'larp-detail-image-col' },
    img({ src: houseImageSrc(house), alt: house.name, class: 'larp-detail-image' })
  ),
  div({ class: 'larp-detail-body' },
    div({ class: 'title-with-chip' },
      h2({ class: 'larp-detail-name' }, house.name),
      (cyclesUntilRuling === 0 && !isAcademia)
        ? span({ class: 'larp-badge larp-badge-ruling' }, i18n.larpBadgeRuling || 'Ruling')
        : null,
      isMemberE2E ? renderEncryptedChip(i18n) : null
    ),
    p({ class: 'larp-detail-motto' }, '“' + house.motto + '”'),
    table({ class: 'larp-info-table' },
      tr(td({ class: 'card-label' }, i18n.larpRolesLabel || 'Roles'),     td({ class: 'card-value' }, house.roles)),
      tr(td({ class: 'card-label' }, i18n.larpFunctionLabel || 'Function'), td({ class: 'card-value' }, house.function)),
      tr(td({ class: 'card-label' }, i18n.larpMonthLabel || 'Governance cycle'), td({ class: 'card-value' }, String(house.month || ''))),
      (typeof cyclesUntilRuling === 'number' && cyclesUntilRuling > 0)
        ? tr(td({ class: 'card-label' }, i18n.larpCyclesUntilRuling || 'Next governance cycle'), td({ class: 'card-value' }, String(cyclesUntilRuling)))
        : null,
      tr(td({ class: 'card-label' }, i18n.larpMembersCount || 'Members'), td({ class: 'card-value' }, String(Array.isArray(members) ? members.length : (house.memberCount || 0))))
    ),
    p({ class: 'larp-detail-description' }, house.description),
    div({ class: 'larp-actions' },
      isAcademia && isInHouse && canTakeTest
        ? a({ href: '/larp/test', class: 'filter-btn larp-start-journey' }, i18n.larpStartJourney)
        : null,
      isInHouse
        ? a({ href: `/larp/tribe/${encodeURIComponent(house.key)}`, class: 'filter-btn' }, i18n.larpVisitTribe || 'Visit Tribe')
        : null,
      canInvite
        ? form({ method: 'POST', action: '/larp/invite/create', class: 'larp-invite-create-form' },
            input({ type: 'hidden', name: 'house', value: house.key }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.larpInviteCreate || 'Generate invitation code')
          )
        : null,
      canLeaveToAcademia
        ? form({ method: 'POST', action: '/larp/join' },
            input({ type: 'hidden', name: 'house', value: 'academia' }),
            button({ type: 'submit', class: 'filter-btn danger-btn' }, i18n.larpLeaveToAcademia || 'Leave House')
          )
        : null,
      canLeaveLarp
        ? form({ method: 'POST', action: '/larp/leave' },
            button({ type: 'submit', class: 'filter-btn danger-btn' }, i18n.larpLeaveToAcademia || 'Leave House')
          )
        : null,
      canJoinAcademia
        ? form({ method: 'POST', action: '/larp/join' },
            input({ type: 'hidden', name: 'house', value: 'academia' }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.larpInviteRedeem || 'Join House')
          )
        : null,
      showInviteForm
        ? form({ method: 'POST', action: '/larp/invite/redeem', class: 'larp-card-invite-form' },
            input({ type: 'hidden', name: 'returnTo', value: `/larp/${house.key}` }),
            input({ type: 'text', name: 'code', placeholder: i18n.larpInvitePlaceholder || 'Invitation code', maxlength: '32', required: 'required' }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.larpInviteRedeem || 'Join House')
          )
        : null
    )
  )
);
};

const formatCooldown = (ms) => {
  if (ms <= 0) return '';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return String(days);
};

const renderAcademiaJoinPanel = (allHouses, testStatus, housesById, questions, myHouseKey) => {
  const myKey = myHouseKey || 'academia';
  const ordered = [
    ...allHouses.filter(h => h.key === myKey),
    ...allHouses.filter(h => h.key !== myKey)
  ];
  const last = testStatus && testStatus.last ? testStatus.last : null;
  const lastHouse = last && housesById ? housesById[last.house] : null;
  const lastHouseName = lastHouse ? lastHouse.name : (last ? last.house : null);
  const remainingMs = testStatus && !testStatus.allowed ? (testStatus.nextAt - Date.now()) : 0;
  const canTake = testStatus && testStatus.allowed;
  const qs = Array.isArray(questions) ? questions : [];
  return div({ class: 'larp-academia-join' },
    h2(i18n.larpAcademiaJoinTitle || 'Houses Current Status'),
    last
      ? div({ class: 'larp-last-attempt' },
          h2({ class: 'larp-last-attempt-title' }, i18n.larpLastAttemptTitle || 'Your last attempt'),
          table({ class: 'larp-info-table' },
            tr(
              td({ class: 'card-label' }, i18n.larpLastAttemptHouse || 'House'),
              td({ class: 'card-value' }, lastHouse
                ? a({ href: `/larp/${lastHouse.key}` }, lastHouseName)
                : lastHouseName || '—')
            ),
            Number.isFinite(last.score)
              ? tr(
                  td({ class: 'card-label' }, i18n.larpTestScore || 'Score'),
                  td({ class: 'card-value' }, String(last.score))
                )
              : null,
            last.ts
              ? tr(
                  td({ class: 'card-label' }, i18n.larpLastAttemptWhen || 'When'),
                  td({ class: 'card-value' }, moment(last.ts).format('YYYY/MM/DD HH:mm:ss'))
                )
              : null,
            !testStatus.allowed
              ? tr(
                  td({ class: 'card-label' }, i18n.larpLastAttemptCooldown || 'Next attempt in'),
                  td({ class: 'card-value' }, formatCooldown(remainingMs) + ' ' + (i18n.larpTestCooldownDays || 'cycles'))
                )
              : null
          )
        )
      : (testStatus && !testStatus.allowed
        ? p({ class: 'larp-test-cooldown-banner' },
            (i18n.larpTestCooldownActive || 'Next test available in') + ' ' + formatCooldown(remainingMs) + ' ' + (i18n.larpTestCooldownDays || 'cycles')
          )
        : null),
    div({ class: 'larp-academia-grid' },
      ordered.map(h => a({ href: `/larp/${h.key}`, class: h.key === myKey ? 'larp-academia-thumb larp-academia-thumb-mine' : 'larp-academia-thumb' },
        img({ src: houseImageSrc(h), alt: h.name, class: 'larp-academia-thumb-image' }),
        span({ class: 'larp-academia-thumb-name' }, h.name),
        table({ class: 'larp-info-table larp-academia-thumb-table' },
          tr(td({ class: 'card-label' }, i18n.larpRolesLabel || 'Roles'), td({ class: 'card-value' }, h.roles)),
          tr(td({ class: 'card-label' }, i18n.larpFunctionLabel || 'Function'), td({ class: 'card-value' }, h.function)),
          tr(td({ class: 'card-label' }, i18n.larpMembersCount || 'Members'), td({ class: 'card-value' }, String(h.memberCount || 0)))
        )
      ))
    ),
  );
};


const renderPostsBlock = (posts, house, canPost) => {
  const stream = (Array.isArray(posts) ? posts : [])
    .map(post => ({ ts: Date.parse(post.createdAt) || post.ts || 0, post }))
    .sort((a, b) => b.ts - a.ts);

  return div({ class: 'larp-posts-block' },
    h2(i18n.larpPostsTitle || 'Wall'),
    canPost
      ? form({ method: 'POST', action: '/larp/post', class: 'larp-post-form' },
          input({ type: 'hidden', name: 'house', value: house.key }),
          textarea({ id: 'larp_post_text', name: 'text', rows: '3', maxlength: '4000', placeholder: i18n.larpPostPlaceholder || 'What does this house need to say?' }),
          button({ type: 'submit', class: 'filter-btn larp-post-submit' }, i18n.larpPostSubmit || 'Publish')
        )
      : null,
    stream.length === 0
      ? p({ class: 'empty' }, i18n.larpPostsEmpty || 'No posts yet.')
      : div({ class: 'larp-posts-list' },
          stream.map(entry => div({ class: 'larp-post' },
            div({ class: 'larp-post-head' },
              userLink(entry.post.author),
              span({ class: 'larp-post-time' }, moment(entry.post.createdAt).format('YYYY/MM/DD HH:mm'))
            ),
            p({ class: 'larp-post-text' }, entry.post.text)
          ))
        )
  );
};

const renderHouseSearch = (q) => div({ class: 'filters activity-filter-chips activity-toolbar-row' },
  form({ method: 'GET', action: '/larp', class: 'filter-box' },
    input({ type: 'hidden', name: 'filter', value: 'houses' }),
    input({ type: 'text', name: 'q', value: q || '', placeholder: i18n.larpSearchPlaceholder, class: 'filter-box__input' }),
    div({ class: 'filter-box__controls' },
      button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
    )
  )
);

const matchesHouse = (house, q) => {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  return ['name', 'motto', 'roles', 'function', 'description']
    .some(f => String(house[f] || '').toLowerCase().includes(needle));
};

const renderModeButtons = (filter) => div({ class: 'mode-buttons stats-mode-row' },
  ['ruling', 'houses', 'rules'].map(m =>
    form({ method: 'GET', action: '/larp' },
      input({ type: 'hidden', name: 'filter', value: m }),
      button({
        type: 'submit',
        class: filter === m ? 'filter-btn active' : 'filter-btn'
      },
        m === 'ruling' ? (i18n.larpFilterRuling || 'RULING')
        : m === 'houses' ? (i18n.larpFilterHouses || 'HOUSES')
        : (i18n.larpFilterRules || 'FAQ')
      )
    )
  )
);

const renderRules = () => {
  const points = [
    i18n.larpRulesEntryText,
    i18n.larpRulesOneHouseText,
    i18n.larpRulesTestEntryText,
    i18n.larpRulesInviteEntryText,
    i18n.larpRulesGovernanceText,
    i18n.larpRulesWallText,
    i18n.larpRulesSignText
  ];
  return div(
    { class: 'card' },
    h2(i18n.larpRulesTitle || 'F.A.Q.'),
    div({ class: 'rules-points' },
      points.filter(Boolean).map((text, i) =>
        div({ class: 'rules-point' },
          span({ class: 'rules-point-num' }, String(i + 1)),
          span({ class: 'rules-point-text' }, text)
        )
      )
    )
  );
};

const renderHousesGrid = (houses, myHouseKey, governingKey) => {
  const inLarp = !!myHouseKey;
  const mine = inLarp ? houses.filter(h => h.key === myHouseKey) : [];
  const ruling = houses.filter(h => h.key === governingKey && h.key !== myHouseKey);
  const rest = houses.filter(h => h.key !== myHouseKey && h.key !== governingKey);
  const ordered = [...mine, ...ruling, ...rest];
  return div({ class: 'larp-grid' },
    ordered.map(h => {
      const isMine = h.key === myHouseKey;
      const isGoverning = h.key === governingKey;
      const highlight = isGoverning ? 'larp-card-ruling' : (isMine ? 'larp-card-mine' : '');
      return div({ class: `larp-card larp-card-${h.key}${highlight ? ' ' + highlight : ''}` },
        a({ href: `/larp/${h.key}`, class: 'larp-card-image-link' },
          img({ class: 'larp-card-image', src: houseImageSrc(h), alt: h.name })
        ),
        div({ class: 'larp-card-body' },
          div({ class: 'larp-card-title-row' },
            a({ href: `/larp/${h.key}`, class: 'larp-card-title' }, h.name),
            isMine ? span({ class: 'larp-badge larp-badge-mine' }, i18n.larpBadgeYou || 'You') : null,
            isGoverning ? span({ class: 'larp-badge larp-badge-ruling' }, i18n.larpBadgeRuling || 'Ruling') : null
          ),
          p({ class: 'larp-card-motto' }, '“' + h.motto + '”'),
          p({ class: 'larp-card-roles' }, h.roles),
          div({ class: 'tribe-card-members' },
            span({ class: 'tribe-members-count' }, `${i18n.larpMembersCount || 'Members'}: ${h.memberCount || 0}`)
          ),
          h.openInviteCode ? p({ class: 'larp-card-count' }, i18n.tribeInviteCodeText, span({ class: 'tribe-open-invite-code' }, h.openInviteCode)) : null
        )
      );
    })
  );
};

exports.larpListView = ({ filter, houses, myHouseKey, cycle, governingKey, governingHouse, governingMembers, governingPosts, canPost, q }) => {
  const title = i18n.larpTitle || 'L.A.R.P.';
  const description = i18n.larpDescription || 'A live action role-playing layer for collaborative experimentation.';
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const search = String(q || '').trim();
  const mode = search ? 'houses' : filter === 'houses' ? 'houses' : filter === 'rules' ? 'rules' : 'ruling';
  const matched = search ? houses.filter(h => matchesHouse(h, search)) : houses;

  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(description)
      ),
      renderModeButtons(mode),
      renderHouseSearch(search),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse, houses }),
      mode === 'houses'
        ? (matched.length
            ? renderHousesGrid(matched, myHouseKey, governingKey)
            : p({ class: 'no-content' }, i18n.larpNoHousesMatch))
        : mode === 'rules'
          ? renderRules()
          : [
              renderHousePanel(governingHouse, governingMembers, governingPosts, { canPost, viewerHouseKey: myHouseKey, cyclesUntilRuling: 0 }),
              renderPostsBlock(governingPosts, governingHouse, canPost)
            ]
    )
  );
};

const computeCyclesUntilRuling = (house, governingKey, now = new Date()) => {
  if (!house || house.key === governingKey) return 0;
  const houseIdx = (Number(house.month) || 1) - 1;
  const currentMonth = now.getMonth();
  for (let i = 1; i <= 12; i += 1) {
    const futureMonth = (currentMonth + i) % 12;
    if (futureMonth % 9 === houseIdx) return i;
  }
  return 0;
};

exports.larpHouseView = ({ house, members, myHouseKey, cycle, governingKey, houses, posts, canPost, testStatus, inviteCode, questions }) => {
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const governingHouse = houses.find(h => h.key === governingKey) || null;
  const isAcademia = house.key === 'academia';
  const viewerInAcademia = myHouseKey === 'academia';
  const viewerIsMember = myHouseKey === house.key && house.key !== 'academia';
  const canWriteWall = myHouseKey === house.key;
  const showWall = viewerIsMember || house.key === governingKey || house.key === 'academia';
  const cycles = computeCyclesUntilRuling(house, governingKey);
  const housesById = Object.fromEntries(houses.map(h => [h.key, h]));

  return template(
    house.name,
    section(
      div({ class: 'tags-header' },
        h1(house.name),
        p({ class: 'larp-detail-motto' }, '“' + house.motto + '”')
      ),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse, houses }),
      renderHouseNav(houses, house.key),
      renderHousePanel(house, members, posts, {
        canPost,
        viewerHouseKey: myHouseKey,
        cyclesUntilRuling: cycles,
        canTakeTest: isAcademia && viewerInAcademia && !!(testStatus && testStatus.allowed)
      }),
      inviteCode
        ? div({ class: 'larp-invite-banner' },
            p({ class: 'larp-invite-banner-title' }, strong(i18n.larpInviteBannerTitle || 'New invitation code')),
            p({ class: 'larp-invite-banner-hint' }, i18n.larpInviteBannerHint || 'Share this code with someone in ACADEMIA. It expires in 30 cycles or after one use.'),
            p({ class: 'larp-invite-banner-code' }, inviteCode)
          )
        : null,
      null,
      showWall
        ? renderPostsBlock(posts, house, canWriteWall)
        : null
    )
  );
};

exports.larpTestView = ({ questions, cycle, houses, myHouseKey, governingKey, testStatus }) => {
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const governingHouse = houses.find(h => h.key === governingKey) || null;
  const title = i18n.larpTitle || 'L.A.R.P.';
  const description = i18n.larpDescription || 'A live action role-playing layer for collaborative experimentation.';

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h1(title),
        p(description)
      ),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse, houses }),
      renderModeButtons(''),
      testStatus && !testStatus.allowed
        ? div({ class: 'larp-test-cooldown' },
            p((i18n.larpTestCooldownActive || 'Next test available in') + ' ' + formatCooldown(testStatus.nextAt - Date.now()) + ' ' + (i18n.larpTestCooldownDays || 'cycles')),
            p(a({ href: '/larp/academia', class: 'filter-btn' }, i18n.larpBackToAcademia || 'Back to ACADEMIA'))
          )
        : form({ method: 'POST', action: '/larp/test', class: 'larp-test-form' },
            questions.map((q, idx) => div({ class: 'larp-test-question' },
              p({ class: 'larp-test-q-text' }, strong(`${idx + 1}. `), i18n[q.key] || q.question),
              div({ class: 'larp-test-options' },
                q.options.map((opt, oi) => label({ class: 'larp-test-option' },
                  input({ type: 'radio', name: `q${idx}`, value: String(oi), required: 'required' }),
                  ' ', i18n[opt.key] || opt.text
                ))
              )
            )),
            div({ class: 'larp-actions' },
              button({ type: 'submit', class: 'filter-btn' }, i18n.larpTestSubmit || 'Join House')
            )
          )
    )
  );
};

exports.larpTestResultView = ({ house, result, cycle, houses, myHouseKey, governingKey }) => {
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const governingHouse = houses.find(h => h.key === governingKey) || null;
  const titleText = (i18n.larpTestResultTitle || 'Test result') + (house && house.name ? ' — ' + house.name : '');
  const ranking = Array.isArray(result && result.ranking) ? result.ranking : [];
  const housesById = Object.fromEntries(houses.map(h => [h.key, h]));

  return template(
    titleText,
    section(
      div({ class: 'tags-header' }, h1(titleText)),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse, houses }),
      div({ class: 'larp-test-result' },
        ranking.length
          ? div({ class: 'larp-test-ranking' },
              h2({ class: 'larp-test-ranking-title' }, i18n.larpTestRankingTitle || 'Score by house'),
              table({ class: 'larp-info-table' },
                ranking.map(([key, score]) => tr(
                  td({ class: 'card-label' }, housesById[key] ? a({ href: `/larp/${key}` }, housesById[key].name) : key),
                  td({ class: 'card-value' }, String(score))
                ))
              )
            )
          : null,
        p({ class: 'larp-test-next' }, i18n.larpTestNextAttempt || 'You can attempt another test in 30 cycles.'),
        div({ class: 'larp-actions' },
          a({ href: house ? `/larp/${house.key}` : '/larp/academia', class: 'filter-btn' },
            i18n.larpGoToHouse || 'Go to your house'
          )
        )
      )
    )
  );
};
