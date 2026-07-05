const { div, h1, h2, h3, p, section, button, form, input, span, img, a, br, table, tr, td, textarea, label, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink } = require("./main_views");
const moment = require("../server/node_modules/moment");

const fmtCycle = (c) => c && c.formatted ? c.formatted : '';

const houseImageSrc = (house) => (house && house.image) ? house.image : '/assets/larp/images/default.jpg';

const renderCycleBanner = (cycle) => div({ class: 'larp-cycle-banner' },
  span({ class: 'larp-cycle-label' }, i18n.larpCycleLabel || 'Cycle'),
  span({ class: 'larp-cycle-value' }, fmtCycle(cycle))
);

const renderHouseBadges = ({ myHouse, governingHouse }) => div({ class: 'larp-house-badges' },
  myHouse ? div({ class: 'larp-my-house' },
    span({ class: 'larp-my-house-label' }, i18n.larpMyHouse || 'My House'),
    a({ href: `/larp/${myHouse.key}`, class: 'larp-my-house-link' }, myHouse.name)
  ) : null,
  governingHouse ? div({ class: 'larp-my-house' },
    span({ class: 'larp-my-house-label' }, i18n.larpGoverning || 'Governing'),
    a({ href: `/larp/${governingHouse.key}`, class: 'larp-my-house-link' }, governingHouse.name)
  ) : null
);

const renderHouseNav = (houses, currentKey) => div({ class: 'larp-house-nav' },
  span({ class: 'larp-house-nav-label' }, i18n.larpAllHouses || 'Houses:'),
  houses.map(h => a({
    href: `/larp/${h.key}`,
    class: h.key === currentKey ? 'larp-house-nav-chip active' : 'larp-house-nav-chip',
    title: h.name
  }, h.name))
);

const renderHousePanel = (house, members, posts, { canPost, viewerHouseKey, cyclesUntilRuling }) => {
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
        span({ class: 'larp-academia-thumb-name' }, h.name)
      ))
    ),
    canTake && qs.length
      ? [
        h2(i18n.larpWillTestTitle || 'WILL test'),
        p({ class: 'larp-will-test-hint' }, i18n.larpWillTestHint || 'Once completed, you will be assigned the house that best matches your answers. Your individual answers are processed locally and never stored — only the resulting house assignment is published to your feed.'),
        form({ method: 'POST', action: '/larp/test', class: 'larp-test-form larp-test-form-compact' },
          qs.map((q, idx) => div({ class: 'larp-test-question' },
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
      ]
      : null
  );
};

const renderPostsBlock = (posts, house, canPost) => div({ class: 'larp-posts-block' },
  h2(i18n.larpPostsTitle || 'Wall'),
  canPost
    ? form({ method: 'POST', action: '/larp/post', class: 'larp-post-form' },
        input({ type: 'hidden', name: 'house', value: house.key }),
        textarea({ id: 'larp_post_text', name: 'text', rows: '3', maxlength: '4000', placeholder: i18n.larpPostPlaceholder || 'What does this house need to say?' }),
        button({ type: 'submit', class: 'filter-btn larp-post-submit' }, i18n.larpPostSubmit || 'Publish')
      )
    : null,
  posts.length === 0
    ? p({ class: 'empty' }, i18n.larpPostsEmpty || 'No posts yet.')
    : div({ class: 'larp-posts-list' },
        posts.map(post => div({ class: 'larp-post' },
          div({ class: 'larp-post-head' },
            userLink(post.author),
            span({ class: 'larp-post-time' }, moment(post.createdAt).format('YYYY-MM-DD HH:mm'))
          ),
          p({ class: 'larp-post-text' }, post.text)
        ))
      )
);

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

const renderRules = () => div({ class: 'larp-rules' },
  h2(i18n.larpRulesTitle || 'F.A.Q.'),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesEntryTitle || 'Starting house'),
    p(i18n.larpRulesEntryText || 'Every inhabitant begins in ACADEMIA by default.')
  ),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesOneHouseTitle || 'One house at a time'),
    p(i18n.larpRulesOneHouseText || 'You can belong to at most one house at any given moment. If you belong to none, you are in ACADEMIA. Every non-ACADEMIA house page shows a "Leave House" button to its members that resets membership back to ACADEMIA. Leaving does NOT waive the test cooldown.')
  ),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesTestEntry || 'WILL test'),
    p(i18n.larpRulesTestEntryText || 'Each option weights one or more houses; when you submit, the system tallies the scores and auto-admits you into the highest-scoring house.')
  ),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesInviteEntry || 'Invitation code'),
    p(i18n.larpRulesInviteEntryText || 'House members can generate invitation codes that grant direct access to the house.')
  ),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesGovernanceTitle || 'Governance Wall'),
    p(i18n.larpRulesGovernanceText || 'During its cycle, the governing house wears the "Ruling" badge and is the only one whose Wall is surfaced publicly under the RULING tab.')
  ),
  div({ class: 'larp-rules-section' },
    h3(i18n.larpRulesSignTitle || 'L.A.R.P. Emblem'),
    p(i18n.larpRulesSignText || 'Inhabitants can choose whether to add a sensor on their avatar with the emblem of their current house.')
  )
);

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
          p({ class: 'larp-card-count' }, `${i18n.larpMembersCount || 'Members'}: ${h.memberCount || 0}`),
          h.openInviteCode ? p({ class: 'larp-card-count' }, i18n.tribeInviteCodeText, span({ class: 'tribe-open-invite-code' }, h.openInviteCode)) : null
        )
      );
    })
  );
};

exports.larpListView = ({ filter, houses, myHouseKey, cycle, governingKey, governingHouse, governingMembers, governingPosts, canPost }) => {
  const title = i18n.larpTitle || 'L.A.R.P.';
  const description = i18n.larpDescription || 'A live action role-playing layer for collaborative experimentation.';
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const mode = filter === 'houses' ? 'houses' : filter === 'rules' ? 'rules' : 'ruling';

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h1(title),
        p(description)
      ),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse }),
      renderModeButtons(mode),
      mode === 'houses'
        ? renderHousesGrid(houses, myHouseKey, governingKey)
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
  const showWall = viewerIsMember || house.key === governingKey;
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
      renderHouseBadges({ myHouse, governingHouse }),
      renderHouseNav(houses, house.key),
      renderHousePanel(house, members, posts, { canPost, viewerHouseKey: myHouseKey, cyclesUntilRuling: cycles }),
      inviteCode
        ? div({ class: 'larp-invite-banner' },
            p({ class: 'larp-invite-banner-title' }, strong(i18n.larpInviteBannerTitle || 'New invitation code')),
            p({ class: 'larp-invite-banner-hint' }, i18n.larpInviteBannerHint || 'Share this code with someone in ACADEMIA. It expires in 30 cycles or after one use.'),
            p({ class: 'larp-invite-banner-code' }, inviteCode)
          )
        : null,
      showWall
        ? renderPostsBlock(posts, house, viewerIsMember)
        : null,
      isAcademia && viewerInAcademia ? renderAcademiaJoinPanel(houses, testStatus, housesById, questions, myHouseKey) : null
    )
  );
};

exports.larpTestView = ({ questions, cycle, houses, myHouseKey, governingKey, testStatus }) => {
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const governingHouse = houses.find(h => h.key === governingKey) || null;
  const titleText = i18n.larpTestTitle || 'Profile test';

  return template(
    titleText,
    section(
      div({ class: 'tags-header' },
        h1(titleText),
        p(i18n.larpTestIntro || 'Answer the psychological questions. The system will pick the house that best fits your answers. You can attempt one test every 30 cycles.')
      ),
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse }),
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
      renderHouseBadges({ myHouse, governingHouse }),
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
