const { div, h1, h2, h3, p, section, button, form, input, span, img, a, br, table, tr, td, textarea, label, strong, details, summary } = require("../server/node_modules/hyperaxe");
const { renderStyledText } = require("../backend/renderStyledText");
const { template, i18n, userLink, paged, renderIcon, renderStateChip } = require("./main_views");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const moment = require("../server/node_modules/moment");
const { larpDate } = require("../models/larp_model");

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

const renderHousePanel = (house, members, posts, { canPost, viewerHouseKey, cyclesUntilRuling, nextRulingAt = null, chooseStatus = null, canTakeTest = false, tribeReady = false }) => {
  const { renderEncryptedChip } = require('./clearnet_view');
  const isInHouse = viewerHouseKey === house.key;
  const isInLarp = viewerHouseKey !== null && viewerHouseKey !== undefined;
  const isMemberE2E = isInHouse && house.key !== 'academia';
  const isAcademia = house.key === 'academia';
  const canInvite = isInHouse && !isAcademia;
  const canLeaveToAcademia = isInHouse && !isAcademia;
  const canLeaveLarp = isInHouse && isAcademia;
  const canJoinAcademia = !isInLarp && isAcademia;
  const canChoose = !isAcademia && viewerHouseKey === 'academia' && !!chooseStatus;
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
      house.wheel ? tr(td({ class: 'card-label' }, i18n.larpMonthLabel || 'Governance cycle'), td({ class: 'card-value' }, String(house.wheel))) : null,
      (typeof cyclesUntilRuling === 'number' && cyclesUntilRuling > 0 && nextRulingAt)
        ? tr(td({ class: 'card-label' }, i18n.larpCyclesUntilRuling || 'Next governance cycle'), td({ class: 'card-value' }, larpDate(nextRulingAt)))
        : null,
      tr(td({ class: 'card-label' }, i18n.larpMembersCount || 'Members'), td({ class: 'card-value' }, String(Array.isArray(members) ? members.length : (house.memberCount || 0))))
    ),
    p({ class: 'larp-detail-description' }, house.description),
    div({ class: 'larp-actions' },
      isAcademia && isInHouse && canTakeTest
        ? a({ href: '/larp/test', class: 'filter-btn larp-start-journey' }, i18n.larpStartJourney)
        : null,
      isInHouse && tribeReady
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
            button({ type: 'submit', class: 'filter-btn danger-btn' }, i18n.larpLeaveLarp)
          )
        : null,
      canJoinAcademia
        ? form({ method: 'POST', action: '/larp/join' },
            input({ type: 'hidden', name: 'house', value: 'academia' }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.larpInviteRedeem || 'Join House')
          )
        : null,
      canChoose && chooseStatus.allowed
        ? form({ method: 'POST', action: '/larp/join' },
            input({ type: 'hidden', name: 'house', value: house.key }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.larpChooseHouse || 'Choose this house')
          )
        : null,
      canChoose && !chooseStatus.allowed
        ? span({ class: 'larp-test-cooldown-banner' }, `${i18n.larpChooseCooldown || 'You can choose a house again in'} ${formatCooldown(chooseStatus.nextAt - Date.now())} ${i18n.larpTestCooldownDays || 'cycles'}`)
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
                  td({ class: 'card-value' }, `${larpDate(last.ts)} ${moment(last.ts).format('HH:mm')}`)
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


const DECREE_CHIP = { OPEN: 'mutuals', APPROVED: 'pending', ENACTED: 'mutuals', REJECTED: 'closed' };
const decreeStatusLabel = (outcome) => ({
  OPEN: i18n.larpDecreeStatusOpen, APPROVED: i18n.larpDecreeStatusApproved, ENACTED: i18n.larpDecreeStatusEnacted, REJECTED: i18n.larpDecreeStatusRejected
})[outcome] || outcome;
const decreeResultLabel = (d) => d.outcome === 'REJECTED' && (Number(d.yes) === Number(d.no) || Number(d.voters) < Number(d.minVoters))
  ? i18n.voteNoQuorum
  : decreeStatusLabel(d.outcome);
const DECREE_ERRORS = { 'not-governing': 'larpDecreeErrorNotGoverning', limit: 'larpDecreeErrorLimit', late: 'larpDecreeErrorLate', title: 'larpDecreeErrorTitle', votes: 'larpDecreeErrorVotes' };

const renderDecreeCard = (d) => div({ class: 'card larp-decree' },
  div({ class: 'title-with-chip' },
    h3(d.title),
    renderStateChip(DECREE_CHIP[d.outcome] || 'whole', '', String(decreeStatusLabel(d.outcome) || '').toUpperCase())
  ),
  d.description ? p(...renderStyledText(d.description)) : null,
  table({ class: 'larp-info-table' },
    d.deadline ? tr(td({ class: 'card-label' }, i18n.larpDecreeDeadline), td({ class: 'card-value', colspan: '2' }, `${larpDate(d.deadline)} ${moment(d.deadline).format('HH:mm')}`)) : null,
    tr(td({ class: 'card-label' }, i18n.larpDecreeTally), td({ class: 'card-value larp-decree-yes' }, `${i18n.voteOptionYes || 'Yes'}: ${d.yes}`), td({ class: 'card-value larp-decree-no' }, `${i18n.voteOptionNo || 'No'}: ${d.no}`)),
    tr(td({ class: 'card-label' }, i18n.larpDecreeVoters), td({ class: 'card-value', colspan: '2' }, `${d.voters} / ${d.minVoters}`)),
    tr(td({ class: 'card-label' }, i18n.larpDecreeProposer), td({ class: 'card-value', colspan: '2' }, userLink(d.author))),
    tr(td({ class: 'card-label' }, i18n.larpDecreeResult), td({ class: 'card-value', colspan: '2' }, String(decreeResultLabel(d) || '').toUpperCase()))
  ),
  d.outcome === 'OPEN'
    ? a({ href: `/votes/${encodeURIComponent(d.voteId)}`, class: 'filter-btn' }, i18n.larpDecreeVote)
    : d.outcome === 'ENACTED'
      ? a({ href: '/parliament?filter=laws', class: 'filter-btn' }, i18n.larpDecreeSeeLaw)
      : null
);

const renderDecreesBlock = (decrees, house, { decreeStatus = null, viewerHouseKey = null, error = null } = {}) => {
  const list = Array.isArray(decrees) ? decrees : [];
  const canWrite = decreeStatus && decreeStatus.house === house.key && viewerHouseKey === house.key;
  if (!list.length && !canWrite) return null;
  return div({ class: 'larp-posts-block larp-decrees-block' },
    h2(i18n.larpDecreesTitle),
    error && DECREE_ERRORS[error] ? p({ class: 'larp-test-cooldown-banner' }, i18n[DECREE_ERRORS[error]]) : null,
    canWrite && decreeStatus.allowed
      ? form({ method: 'POST', action: '/larp/decree', class: 'larp-post-form' },
          input({ type: 'text', name: 'title', maxlength: '160', required: 'required', placeholder: i18n.larpDecreeTitlePlaceholder }),
          textarea({ name: 'description', rows: '3', maxlength: '1000', placeholder: i18n.larpDecreeDescriptionPlaceholder }),
          button({ type: 'submit', class: 'filter-btn larp-post-submit' }, i18n.larpDecreePropose)
        )
      : canWrite && DECREE_ERRORS[decreeStatus.reason]
        ? p({ class: 'larp-test-cooldown-banner' }, i18n[DECREE_ERRORS[decreeStatus.reason]])
        : null,
    list.length ? div({ class: 'larp-posts-list' }, list.map(renderDecreeCard)) : p({ class: 'empty' }, i18n.larpDecreesEmpty)
  );
};

const renderInfluenceTable = (rows, houses) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const byKey = Object.fromEntries((houses || []).map(h => [h.key, h]));
  return div({ class: 'larp-posts-block larp-influence-block' },
    h2(i18n.larpInfluenceTitle),
    table({ class: 'block-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.larpInfluenceHouse),
        td({ class: 'card-label' }, i18n.larpInfluencePoints),
        td({ class: 'card-label' }, i18n.larpInfluenceLaws),
        td({ class: 'card-label' }, i18n.larpInfluenceVotes)
      ),
      ...list.map(r => tr(
        td({ 'data-label': i18n.larpInfluenceHouse }, a({ href: `/larp/${encodeURIComponent(r.house)}` }, (byKey[r.house] && byKey[r.house].name) || r.house)),
        td({ 'data-label': i18n.larpInfluencePoints }, String(r.points)),
        td({ 'data-label': i18n.larpInfluenceLaws }, String(r.laws)),
        td({ 'data-label': i18n.larpInfluenceVotes }, String(r.votes))
      ))
    )
  );
};

const renderSolsticeBanner = (solstice, houses) => {
  if (!solstice) return null;
  const house = (houses || []).find(h => h.key === solstice.house);
  if (!house) return null;
  return a({ href: `/larp/${encodeURIComponent(house.key)}`, class: 'larp-invite-banner larp-solstice-banner' },
    img({ src: houseImageSrc(house), alt: house.name, class: 'larp-solstice-image' }),
    span({ class: 'larp-solstice-text' },
      span({ class: 'larp-invite-banner-title' }, i18n.larpSolsticeHouse),
      strong(house.name),
      span({ class: 'larp-invite-banner-hint' }, String(i18n.larpSolsticePoints || '').replace('{points}', String(solstice.points)))
    )
  );
};

const renderPostsBlock = (posts, house, canPost, housesById = {}) => {
  const stream = (Array.isArray(posts) ? posts : [])
    .map(post => ({ ts: post.ts || Date.parse(post.createdAt) || 0, post }))
    .sort((a, b) => b.ts - a.ts);

  return div({ class: 'larp-posts-block' },
    h2(i18n.larpPostsTitle || 'Wall'),
    canPost
      ? div({ class: 'comment-form-wrapper' },
          form({ method: 'POST', action: '/larp/post', class: 'comment-form' },
            input({ type: 'hidden', name: 'house', value: house.key }),
            textarea({ id: 'larp_post_text', name: 'text', rows: '4', class: 'comment-textarea', placeholder: i18n.larpPostPlaceholder || 'What does this house need to say?' }),
            button({ type: 'submit', class: 'comment-submit-btn' }, i18n.larpPostSubmit || 'Publish')
          )
        )
      : null,
    stream.length === 0
      ? p({ class: 'votations-no-comments' }, i18n.larpPostsEmpty || 'No posts yet.')
      : div({ class: 'comments-list' },
          paged(stream).map(entry => div({ class: entry.post.author === userId ? 'votations-comment-card own-comment' : 'votations-comment-card', id: entry.post.id || undefined },
            entry.post.author === userId && entry.post.id
              ? form({ method: 'POST', action: `/larp/post/delete/${encodeURIComponent(entry.post.id)}`, class: 'comment-delete-form' },
                  button({ type: 'submit', class: 'btn-singleview btn-delete', title: i18n.chatDelete }, renderIcon('close')))
              : null,
            span({ class: 'created-at' },
              userLink(entry.post.author),
              house.key === 'academia' && entry.post.authorHouse && entry.post.authorHouse !== 'academia' && housesById[entry.post.authorHouse]
                ? [' ', a({ href: `/larp/${encodeURIComponent(entry.post.authorHouse)}` }, renderStateChip('whole', '', String(housesById[entry.post.authorHouse].name || entry.post.authorHouse).toUpperCase()))]
                : null,
              span(' | '),
              span({ class: 'votations-comment-date' }, `${larpDate(entry.post.createdAt)} ${moment(entry.post.createdAt).format('HH:mm')}`)
            ),
            p({ class: 'votations-comment-text' }, ...renderStyledText(String(entry.post.text || ''), { zoomImages: true }))
          ))
        )
  );
};

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
    i18n.larpRulesTribeText,
    i18n.larpRulesGovernanceText,
    i18n.larpRulesDecreesText,
    i18n.larpRulesInfluenceText,
    i18n.larpRulesWallText,
    i18n.larpRulesBotText,
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

exports.larpListView = ({ filter, houses, myHouseKey, cycle, governingKey, governingHouse, governingMembers, governingPosts, canPost, tribeReady, q, decrees = [], decreeStatus = null, decreeError = null, influence = [], solstice = null }) => {
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
      renderCycleBanner(cycle),
      renderHouseBadges({ myHouse, governingHouse, houses }),
      renderSolsticeBanner(solstice, houses),
      mode === 'houses'
        ? (matched.length
            ? renderHousesGrid(matched, myHouseKey, governingKey)
            : div({ class: 'no-content-box' }, p({ class: 'no-content' }, i18n.larpNoHousesMatch)))
        : mode === 'rules'
          ? renderRules()
          : [
              h2(i18n.larpBadgeRuling || 'Ruling'),
              renderHousePanel(governingHouse, governingMembers, governingPosts, { canPost, viewerHouseKey: myHouseKey, cyclesUntilRuling: 0, tribeReady }),
              renderInfluenceTable(influence, houses),
              renderDecreesBlock(decrees, governingHouse, { decreeStatus, viewerHouseKey: myHouseKey, error: decreeError }),
              renderPostsBlock(governingPosts, governingHouse, canPost)
            ]
    )
  );
};

exports.larpHouseView = ({ house, members, myHouseKey, cycle, governingKey, houses, posts, canPost, testStatus, inviteCode, questions, tribeReady, cyclesUntilRuling = null, nextRulingAt = null, chooseStatus = null, decrees = [], decreeStatus = null, decreeError = null, solstice = null }) => {
  const myHouse = houses.find(h => h.key === myHouseKey) || null;
  const governingHouse = houses.find(h => h.key === governingKey) || null;
  const isAcademia = house.key === 'academia';
  const viewerInAcademia = myHouseKey === 'academia';
  const viewerIsMember = myHouseKey === house.key && house.key !== 'academia';
  const canWriteWall = myHouseKey === house.key || (isAcademia && houses.some(h => h.key === myHouseKey));
  const showWall = viewerIsMember || house.key === governingKey || house.key === 'academia';
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
      renderSolsticeBanner(solstice, houses),
      renderHouseNav(houses, house.key),
      renderHousePanel(house, members, posts, {
        canPost,
        viewerHouseKey: myHouseKey,
        cyclesUntilRuling,
        nextRulingAt,
        chooseStatus,
        tribeReady,
        canTakeTest: isAcademia && viewerInAcademia && !!(testStatus && testStatus.allowed)
      }),
      inviteCode
        ? div({ class: 'larp-invite-banner' },
            p({ class: 'larp-invite-banner-title' }, strong(i18n.larpInviteBannerTitle || 'New invitation code')),
            p({ class: 'larp-invite-banner-hint' }, i18n.larpInviteBannerHint || 'Share this code with someone in ACADEMIA. It expires in 30 cycles or after one use.'),
            p({ class: 'larp-invite-banner-code' }, inviteCode)
          )
        : null,
      renderDecreesBlock(decrees, house, { decreeStatus, viewerHouseKey: myHouseKey, error: decreeError }),
      showWall
        ? renderPostsBlock(posts, house, canWriteWall, housesById)
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

exports.renderInfluenceTable = renderInfluenceTable;
