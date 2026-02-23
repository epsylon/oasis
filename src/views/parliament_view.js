const { form, button, div, h2, p, section, input, label, br, a, span, table, thead, tbody, tr, th, td, textarea, select, option, ul, li, img } = require('../server/node_modules/hyperaxe');
const moment = require("../server/node_modules/moment");
const { template, i18n } = require('./main_views');

const TERM_DAYS = 60;

const fmt = (d) => moment(d).format('YYYY-MM-DD HH:mm:ss');
const timeLeft = (end) => {
  const diff = moment(end).diff(moment());
  if (diff <= 0) return '0d 00:00:00';
  const dur = moment.duration(diff);
  const d = Math.floor(dur.asDays());
  const h = String(dur.hours()).padStart(2,'0');
  const m = String(dur.minutes()).padStart(2,'0');
  const s = String(dur.seconds()).padStart(2,'0');
  return `${d}d ${h}:${m}:${s}`;
};
const reqVotes = (method, total) => {
  const m = String(method || '').toUpperCase();
  if (m === 'DEMOCRACY' || m === 'ANARCHY') return Math.floor(Number(total || 0) / 2) + 1;
  if (m === 'MAJORITY') return Math.ceil(Number(total || 0) * 0.8);
  if (m === 'MINORITY') return Math.ceil(Number(total || 0) * 0.2);
  return 0;
};
const showVoteMetrics = (method) => {
  const m = String(method || '').toUpperCase();
  return !(m === 'DICTATORSHIP' || m === 'KARMATOCRACY');
};
const applyEl = (fn, attrs, kids) => fn.apply(null, [attrs || {}].concat(kids || []));
const methodImageSrc = (method) => `assets/images/${String(method || '').toUpperCase().toLowerCase()}.png`;
const MethodBadge = (method) => {
  const m = String(method || '').toUpperCase();
  const labelTxt = String(i18n[`parliamentMethod${m}`] || m).toUpperCase();
  return span(
    { class: 'method-badge' },
    labelTxt,
    br(),br(),
    img({ src: methodImageSrc(m), alt: labelTxt, class: 'method-badge__icon' })
  );
};
const MethodHero = (method) => {
  const m = String(method || '').toUpperCase();
  const labelTxt = String(i18n[`parliamentMethod${m}`] || m).toUpperCase();
  return span(
    { class: 'method-hero' },
    labelTxt,
    br(),br(),
    img({ src: methodImageSrc(m), alt: labelTxt, class: 'method-hero__icon' })
  );
};
const KPI = (labelTxt, value) =>
  div({ class: 'kpi' },
    span({ class: 'kpi__label' }, labelTxt),
    span({ class: 'kpi__value' }, value)
  );
const CycleInfo = (start, end, labels = {
  since: i18n.parliamentLegSince,
  end: i18n.parliamentLegEnd,
  remaining: i18n.parliamentTimeRemaining
}) =>
  div({ class: 'cycle-info' },
    KPI((labels.since + ': ').toUpperCase(), fmt(start)),
    KPI((labels.end + ': ').toUpperCase(), fmt(end)),
    KPI((labels.remaining + ': ').toUpperCase(), timeLeft(end))
  );
const Tabs = (active) =>
  div(
    { class: 'filters' },
    form(
      { method: 'GET', action: '/parliament' },
      ['government', 'candidatures', 'proposals', 'laws', 'revocations', 'historical', 'leaders', 'rules'].map(f =>
        button({ type: 'submit', name: 'filter', value: f, class: active === f ? 'filter-btn active' : 'filter-btn' }, i18n[`parliamentFilter${f.charAt(0).toUpperCase()+f.slice(1)}`])
      )
    )
  );

const GovHeader = (g) => {
  const termStart = g && g.since ? g.since : moment().toISOString();
  const termEnd = g && g.end ? g.end : moment(termStart).add(TERM_DAYS, 'days').toISOString();
  const methodKeyRaw = g && g.method ? String(g.method) : 'ANARCHY';
  const methodKey = methodKeyRaw.toUpperCase();
  const i18nMeth = i18n[`parliamentMethod${methodKey}`];
  const methodLabel = (i18nMeth && String(i18nMeth).trim() ? String(i18nMeth) : methodKey).toUpperCase();
  const isAnarchy = methodKey === 'ANARCHY';
  const population = String(Number(g.inhabitantsTotal || 0));
  const votesReceivedNum = Number.isFinite(Number(g.votesReceived)) ? Number(g.votesReceived) : 0;
  const totalVotesNum = Number.isFinite(Number(g.totalVotes)) ? Number(g.totalVotes) : 0;
  const votesDisplay = `${votesReceivedNum} (${totalVotesNum})`;
  return div(
    { class: 'cycle-info' },
    div({ class: 'kpi' },
      span({ class: 'kpi__label' }, (i18n.parliamentLegSince + ': ').toUpperCase()),
      span({ class: 'kpi__value' }, fmt(termStart))
    ),
    div({ class: 'kpi' },
      span({ class: 'kpi__label' }, (i18n.parliamentLegEnd + ': ').toUpperCase()),
      span({ class: 'kpi__value' }, fmt(termEnd))
    ),
    div({ class: 'kpi' },
      span({ class: 'kpi__label' }, (i18n.parliamentTimeRemaining + ': ').toUpperCase()),
      span({ class: 'kpi__value' }, timeLeft(termEnd))
    ),
    div({ class: 'kpi' },
      span({ class: 'kpi__label' }, (i18n.parliamentPopulation + ': ').toUpperCase()),
      span({ class: 'kpi__value' }, population)
    ),
    div({ class: 'kpi' },
      span({ class: 'kpi__label' }, (i18n.parliamentGovMethod + ': ').toUpperCase()),
      span({ class: 'kpi__value' }, methodLabel)
    ),
    !isAnarchy
      ? div({ class: 'kpi' },
          span({ class: 'kpi__label' }, (i18n.parliamentVotesReceived + ': ').toUpperCase()),
          span({ class: 'kpi__value' }, votesDisplay)
        )
      : null
  );
};

const GovernmentCard = (g, meta) => {
  const termStart = g && g.since ? g.since : moment().toISOString();
  const termEnd = g && g.end ? g.end : moment(termStart).add(TERM_DAYS, 'days').toISOString();
  const actorLabel =
    g.powerType === 'tribe'
      ? (i18n.parliamentActorInPowerTribe || i18n.parliamentActorInPower || 'TRIBE RULING')
      : (i18n.parliamentActorInPowerInhabitant || i18n.parliamentActorInPower || 'INHABITANT RULING');
  const methodKeyRaw = g && g.method ? String(g.method) : 'ANARCHY';
  const methodKey = methodKeyRaw.toUpperCase();
  const i18nMeth = i18n[`parliamentMethod${methodKey}`];
  const methodLabel = (i18nMeth && String(i18nMeth).trim() ? String(i18nMeth) : methodKey).toUpperCase();
  const actorLink =
    g.powerType === 'tribe'
      ? a({ class: 'user-link', href: `/tribe/${encodeURIComponent(g.powerId)}` }, g.powerTitle || g.powerId)
      : a({ class: 'user-link', href: `/author/${encodeURIComponent(g.powerId)}` }, g.powerTitle || g.powerId);
  const actorBio = meta && meta.bio ? meta.bio : '';
  const memberIds = Array.isArray(g.membersList) ? g.membersList : (Array.isArray(g.members) ? g.members : []);
  const membersRow =
    g.powerType === 'tribe'
      ? tr(
          { class: 'parliament-members-row' },
          td(
            { colspan: 2 },
            div(
              span({ class: 'card-label' }, (i18n.parliamentMembers + ': ').toUpperCase()),
              memberIds && memberIds.length
                ? ul({ class: 'parliament-members-list' }, ...memberIds.map(id => li(a({ class: 'user-link', href: `/author/${encodeURIComponent(id)}` }, id))))
                : span({ class: 'card-value' }, String(g.members || 0))
            )
          )
        )
      : null;
  return div(
    { class: 'card' },
    h2(i18n.parliamentGovernmentCard),
    GovHeader(g),
    div(
      { class: 'table-wrap' },
      applyEl(table, { class: 'table table--centered gov-overview' }, [
        thead(tr(
          th(i18n.parliamentGovMethod),
          th(i18n.parliamentPoliciesProposal || 'LAWS PROPOSAL'),
          th(i18n.parliamentPoliciesApproved || 'LAWS APPROVED'),
          th(i18n.parliamentPoliciesDeclined || 'LAWS DECLINED'),
          th(i18n.parliamentPoliciesDiscarded || 'LAWS DISCARDED'),
          th(i18n.parliamentPoliciesRevocated || 'LAWS REVOCATED'),
          th(i18n.parliamentEfficiency || '% EFFICIENCY')
        )),
        tbody(tr(
          td(div({ class: 'method-cell' }, img({ src: methodImageSrc(methodKey), alt: methodLabel }))),
          td(String(g.proposed || 0)),
          td(String(g.approved || 0)),
          td(String(g.declined || 0)),
          td(String(g.discarded || 0)),
          td(String(g.revocated || 0)),
          td(`${String(g.efficiency || 0)} %`)
        ))
      ])
    ),
    (g.powerType === 'tribe' || g.powerType === 'inhabitant')
      ? div(
          { class: 'table-wrap mt-2' },
          applyEl(table, { class: 'table parliament-actor-table' }, [
            thead(tr(
              th({ class: 'parliament-actor-col' }, String(actorLabel).toUpperCase()),
              th({ class: 'parliament-description-col' }, i18n.description.toUpperCase())
            )),
            tbody(
              tr(
                td({ class: 'parliament-actor-col' }, div({ class: 'leader-cell' }, actorLink)),
                td({ class: 'parliament-description-col' }, p(actorBio || '-'))
              ),
              membersRow
            )
          ])
        )
      : null
  );
};

const NoGovernment = () => div({ class: 'empty' }, p(i18n.parliamentNoStableGov));
const NoProposals = () => div({ class: 'empty' }, p(i18n.parliamentNoProposals));
const NoLaws = () => div({ class: 'empty' }, p(i18n.parliamentNoLaws));
const NoGovernments = () => div({ class: 'empty' }, p(i18n.parliamentNoGovernments));
const NoRevocations = () => null;

const CandidatureForm = () =>
  div(
    { class: 'div-center' },
    h2(i18n.parliamentCandidatureFormTitle),
    form(
      { method: 'POST', action: '/parliament/candidatures/propose' },
      label(i18n.parliamentCandidatureId), br(),
      input({ type: 'text', name: 'candidateId', placeholder: i18n.parliamentCandidatureIdPh, required: true }), br(), br(),
      label(i18n.parliamentCandidatureMethod), br(),
      select({ name: 'method' },
        ['DEMOCRACY','MAJORITY','MINORITY','DICTATORSHIP','KARMATOCRACY'].map(m => option({ value: m }, i18n[`parliamentMethod${m}`] || m))
      ), br(), br(),
      button({ type: 'submit', class: 'create-button' }, i18n.parliamentCandidatureProposeBtn)
    )
  );

const pickLeader = (arr) => {
  if (!arr || !arr.length) return null;
  const sorted = [...arr].sort((a, b) => {
    const va = Number(a.votes || 0), vb = Number(b.votes || 0);
    if (vb !== va) return vb - va;
    const ka = Number(a.karma || 0), kb = Number(b.karma || 0);
    if (kb !== ka) return kb - ka;
    const sa = Number(a.profileSince || 0), sb = Number(b.profileSince || 0);
    if (sa !== sb) return sa - sb;
    const ca = new Date(a.createdAt).getTime(), cb = new Date(b.createdAt).getTime();
    if (ca !== cb) return ca - cb;
    return String(a.targetId).localeCompare(String(b.targetId));
  });
  return sorted[0];
};

const CandidatureStats = (cands, govCard, leaderMeta) => {
  if (!cands || !cands.length) return null;
  const leader = pickLeader(cands || []);
  if (!leader) return null;
  const methodKey = String(leader.method || '').toUpperCase();
  const methodLabel = String(i18n[`parliamentMethod${methodKey}`] || methodKey).toUpperCase();
  const votes = String(leader.votes || 0);
  const avatarSrc = (leaderMeta && leaderMeta.avatarUrl) ? leaderMeta.avatarUrl : '/assets/images/default-avatar.png';
  const winLbl = (i18n.parliamentWinningCandidature || i18n.parliamentCurrentLeader || 'WINNING CANDIDATURE').toUpperCase();
  const idLink = leader
    ? (leader.targetType === 'inhabitant'
        ? a({ class: 'user-link', href: `/author/${encodeURIComponent(leader.targetId)}` }, leader.targetId)
        : a({ class: 'tag-link', href: `/tribe/${encodeURIComponent(leader.targetId)}?` }, leader.targetTitle || leader.targetId))
    : null;
  return div(
    { class: 'card' },
    h2(i18n.parliamentElectionsStatusTitle),
    div({ class: 'card-field card-field--spaced' },
      span({ class: 'card-label' }, winLbl + ': '),
      span({ class: 'card-value' }, idLink)
    ),
    div({ class: 'card-field card-field--spaced' },
      span({ class: 'card-label' }, (i18n.parliamentGovMethod + ': ').toUpperCase()),
      span({ class: 'card-value' }, methodLabel)
    ),
    div(
      { class: 'table-wrap mt-2' },
      applyEl(table, [
        thead(tr(
          th(i18n.parliamentThLeader),
          th({ class: 'parliament-method-col' }, i18n.parliamentGovMethod),
          th({ class: 'parliament-votes-col'  }, i18n.parliamentVotesReceived)
        )),
        tbody(tr(
          td(
            img({ src: avatarSrc })
          ),
          td({ class: 'parliament-method-col' },
            img({ src: methodImageSrc(methodKey), alt: methodLabel, class: 'method-hero__icon' })
          ),
          td({ class: 'parliament-votes-col'  }, span({ class: 'votes-value' }, votes))
        ))
      ])
    )
  );
};

const CandidaturesTable = (candidatures) => {
  const rows = (candidatures || []).map(c => {
    const idLink =
      c.targetType === 'inhabitant'
        ? p(a({ class: 'user-link break-all', href: `/author/${encodeURIComponent(c.targetId)}` }, c.targetId))
        : p(a({ class: 'tag-link', href: `/tribe/${encodeURIComponent(c.targetId)}?` }, c.targetTitle || c.targetId));
    return tr(
      td(idLink),
      td(fmt(c.createdAt)),
      td({ class: 'nowrap' }, c.method),
      td(c.targetType === 'inhabitant' ? String(c.karma || 0) : '-'),
      td(String(c.votes || 0)),
      td(form({ method: 'POST', action: `/parliament/candidatures/${encodeURIComponent(c.id)}/vote` }, button({ class: 'vote-btn' }, i18n.parliamentVoteBtn)))
    );
  });
  return div(
    { class: 'table-wrap' },
    h2(i18n.parliamentCandidaturesListTitle),
    applyEl(table, { class: 'table table--centered' }, [
      thead(tr(
        th(i18n.parliamentThId),
        th(i18n.parliamentThProposalDate),
        th(i18n.parliamentThMethod),
        th(i18n.parliamentThKarma),
        th(i18n.parliamentThSupports),
        th(i18n.parliamentThVote)
      )),
      applyEl(tbody, null, rows)
    ])
  );
};

const ProposalForm = () =>
  div(
    { class: 'div-center' },
    h2(i18n.parliamentProposalFormTitle),
    form(
      { method: 'POST', action: '/parliament/proposals/create' },
      label(i18n.parliamentProposalTitle), br(),
      input({ type: 'text', name: 'title', required: true }), br(), br(),
      label(i18n.parliamentProposalDescription), br(),
      textarea({ name: 'description', rows: 5, maxlength: 1000 }), br(), br(),
      button({ type: 'submit', class: 'create-button' }, i18n.parliamentProposalPublish)
    )
  );

const ProposalsList = (proposals) => {
  if (!proposals || !proposals.length) return null;
  const cards = proposals.map(pItem => {
    const titleNode = pItem && pItem.voteId
      ? a({ class: 'proposal-title-link', href: `/votes/${encodeURIComponent(pItem.voteId)}` }, pItem.title || '')
      : (pItem.title || '');
    const onTrackLabel = pItem && pItem.onTrack
      ? (i18n.parliamentProposalOnTrackYes || 'THRESHOLD REACHED')
      : (i18n.parliamentProposalOnTrackNo || 'BELOW THRESHOLD');
    return div(
      { class: 'card' },
      br(),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentThProposalDate.toUpperCase() + ': '),
        span({ class: 'card-value' }, fmt(pItem.createdAt))
      ),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentLawProposer.toUpperCase() + ': '),
        span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(pItem.proposer)}` }, pItem.proposer))
      ),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentGovMethod.toUpperCase() + ': '),
        span({ class: 'card-value' }, pItem.method)
      ),
      br(),
      div(
        h2(titleNode),
        p(pItem.description || '')
      ),
      pItem.deadline
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalDeadlineLabel.toUpperCase() + ': '),
            span({ class: 'card-value' }, fmt(pItem.deadline))
          )
        : null,
      pItem.deadline
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalTimeLeft.toUpperCase() + ': '),
            span({ class: 'card-value' }, timeLeft(pItem.deadline))
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentVotesNeeded.toUpperCase() + ': '),
            span({ class: 'card-value' }, String(pItem.needed || reqVotes(pItem.method, pItem.total)))
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentVotesSlashTotal.toUpperCase() + ': '),
            span({ class: 'card-value' }, `${Number(pItem.yes || 0)}/${Number(pItem.total || 0)}`)
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalVoteStatusLabel.toUpperCase() + ': '),
            span({ class: 'card-value' }, onTrackLabel)
          )
        : null,
      pItem && pItem.voteId
        ? form(
            { method: 'GET', action: `/votes/${encodeURIComponent(pItem.voteId)}` },
            button({ type: 'submit', class: 'vote-btn' }, i18n.parliamentVoteAction)
          )
        : null
    );
  });
  return div(
    { class: 'cards' },
    h2(i18n.parliamentCurrentProposalsTitle),
    applyEl(div, null, cards)
  );
};

const FutureLawsList = (rows) => {
  if (!rows || !rows.length) return null;
  const cards = rows.map(pItem =>
    div(
      { class: 'card' },
      br(),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentGovMethod.toUpperCase() + ': '), span({ class: 'card-value' }, pItem.method)),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentThProposalDate.toUpperCase() + ': '), span({ class: 'card-value' }, fmt(pItem.createdAt))),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentLawProposer.toUpperCase() + ': '), span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(pItem.proposer)}` }, pItem.proposer))),
      h2(pItem.title || ''),
      p(pItem.description || '')
    )
  );
  return div(
    { class: 'cards' },
    h2(i18n.parliamentFutureLawsTitle),
    applyEl(div, null, cards)
  );
};

const RevocationForm = (laws = []) =>
  div(
    { class: 'div-center' },
    h2(i18n.parliamentRevocationFormTitle),
    form(
      {
        method: 'POST',
        action: '/parliament/revocations/create'
      },
      label(i18n.parliamentRevocationLaw), br(),
      select(
        { name: 'lawId', required: true },
        ...(laws || []).map(l =>
          option(
            { value: l.id },
            `${l.question || l.title || l.id}`
          )
        )
      ),
      br(), br(),
      label(i18n.parliamentRevocationReasons), br(),
      textarea({ name: 'reasons', rows: 4, maxlength: 1000 }),
      br(), br(),
      button({ type: 'submit', class: 'create-button' }, i18n.parliamentRevocationPublish || 'Publish Revocation')
    )
  );

const RevocationsList = (revocations) => {
  if (!revocations || !revocations.length) return null;
  const cards = revocations.map(pItem => {
    const titleNode = pItem && pItem.voteId
      ? a({ class: 'revocation-title-link', href: `/votes/${encodeURIComponent(pItem.voteId)}` }, pItem.title || pItem.lawTitle || '')
      : (pItem.title || pItem.lawTitle || '');
    const onTrackLabel = pItem && pItem.onTrack
      ? (i18n.parliamentProposalOnTrackYes || 'THRESHOLD REACHED')
      : (i18n.parliamentProposalOnTrackNo || 'BELOW THRESHOLD');
    return div(
      { class: 'card' },
      br(),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentThProposalDate.toUpperCase() + ': '),
        span({ class: 'card-value' }, fmt(pItem.createdAt))
      ),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentLawProposer.toUpperCase() + ': '),
        span(
          { class: 'card-value' },
          a({ class: 'user-link', href: `/author/${encodeURIComponent(pItem.proposer)}` }, pItem.proposer)
        )
      ),
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentGovMethod + ': '),
        span({ class: 'card-value' }, pItem.method)
      ),
      br(),
      div(
        h2(titleNode),
        p(pItem.reasons || '')
      ),
      pItem.deadline
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalDeadlineLabel.toUpperCase() + ': '),
            span({ class: 'card-value' }, fmt(pItem.deadline))
          )
        : null,
      pItem.deadline
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalTimeLeft.toUpperCase() + ': '),
            span({ class: 'card-value' }, timeLeft(pItem.deadline))
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentVotesNeeded.toUpperCase() + ': '),
            span({ class: 'card-value' }, String(pItem.needed || reqVotes(pItem.method, pItem.total)))
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentVotesSlashTotal.toUpperCase() + ': '),
            span({ class: 'card-value' }, `${Number(pItem.yes || 0)}/${Number(pItem.total || 0)}`)
          )
        : null,
      showVoteMetrics(pItem.method)
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentProposalVoteStatusLabel.toUpperCase() + ': '),
            span({ class: 'card-value' }, onTrackLabel)
          )
        : null,
      pItem && pItem.voteId
        ? form(
            { method: 'GET', action: `/votes/${encodeURIComponent(pItem.voteId)}` },
            button({ type: 'submit', class: 'vote-btn' }, i18n.parliamentVoteAction)
          )
        : null
    );
  });
  return div(
    { class: 'cards' },
    h2(i18n.parliamentCurrentRevocationsTitle),
    applyEl(div, null, cards)
  );
};

const FutureRevocationsList = (rows) => {
  if (!rows || !rows.length) return null;
  const cards = rows.map(pItem =>
    div(
      { class: 'card' },
      br(),
      pItem.method ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentGovMethod.toUpperCase() + ': '), span({ class: 'card-value' }, pItem.method)) : null,
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentThProposalDate.toUpperCase() + ': '), span({ class: 'card-value' }, fmt(pItem.createdAt))),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentLawProposer.toUpperCase() + ': '), span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(pItem.proposer)}` }, pItem.proposer))),
      h2(pItem.title || pItem.lawTitle || ''),
      p(pItem.reasons || '')
    )
  );
  return div(
    { class: 'cards' },
    h2(i18n.parliamentFutureRevocationsTitle),
    applyEl(div, null, cards)
  );
};

const LawsStats = (laws = [], revocatedCount = 0) => {
  const proposed = laws.length;
  const approved = laws.length;
  const declined = 0;
  const discarded = 0;
  const revocated = Number(revocatedCount || 0);
  return div(
    { class: 'table-wrap' },
    h2(i18n.parliamentPoliciesTitle || 'POLICIES'),
    applyEl(table, { class: 'table table--centered' }, [
      thead(tr(
        th(i18n.parliamentThProposed),
        th(i18n.parliamentThApproved),
        th(i18n.parliamentThDeclined),
        th(i18n.parliamentThDiscarded),
        th(i18n.parliamentPoliciesRevocated)
      )),
      tbody(
        tr(
          td(String(proposed)),
          td(String(approved)),
          td(String(declined)),
          td(String(discarded)),
          td(String(revocated))
        )
      )
    ])
  );
};

const LawsList = (laws) => {
  if (!laws || !laws.length) return NoLaws();
  const cards = laws.map(l => {
    const total = Number((l.votes && (l.votes.total || l.votes.TOTAL)) || 0);
    const yes = Number((l.votes && (l.votes.YES || l.votes.Yes || l.votes.yes)) || 0);
    const needed = reqVotes(l.method, total);
    const showMetricsFlag = showVoteMetrics(l.method);
    return div(
      { class: 'card' },
      br(),
      div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.parliamentGovMethod + ': ').toUpperCase()), span({ class: 'card-value' }, l.method)),
      div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.parliamentLawEnacted + ': ').toUpperCase()), span({ class: 'card-value' }, fmt(l.enactedAt))),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.parliamentLawProposer.toUpperCase() + ': '), span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(l.proposer)}` }, l.proposer))),
      h2(l.question || ''),
      p(l.description || ''),
      showMetricsFlag ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.parliamentVotesNeeded + ': ').toUpperCase()), span({ class: 'card-value' }, String(needed))) : null,
      showMetricsFlag ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.parliamentVotesSlashTotal + ': ').toUpperCase()), span({ class: 'card-value' }, `${yes}/${total}`)) : null
    );
  });
  return div(
    { class: 'cards' },
    h2(i18n.parliamentLawsTitle || 'LAWS'),
    applyEl(div, null, cards)
  );
};

const HistoricalGovsSummary = (rows = []) => {
  const byMethod = new Map();
  for (const g of rows) {
    const k = String(g.method || 'ANARCHY').toUpperCase();
    byMethod.set(k, (byMethod.get(k) || 0) + 1);
  }
  const entries = Array.from(byMethod.entries()).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  const lines = entries.map(([method, count]) =>
    tr(td(method), td(String(count)))
  );
  return div(
    { class: 'table-wrap' },
    h2(i18n.parliamentHistoricalGovernmentsTitle || 'Governments'),
    applyEl(table, { class: 'table table--centered' }, [
      thead(tr(th(i18n.parliamentGovMethod), th(i18n.parliamentThCycles))),
      applyEl(tbody, null, lines)
    ])
  );
};

const HistoricalList = (rows, metasByKey = {}) => {
  if (!rows || !rows.length) return NoGovernments();
  const cards = rows.map(g => {
    const key = `${g.powerType}:${g.powerId}`;
    const meta = metasByKey[key];
    const showActor = g.powerType === 'tribe' || g.powerType === 'inhabitant';
    const showMembers = g.powerType === 'tribe';
    const actorLabel =
      g.powerType === 'tribe'
        ? (i18n.parliamentActorInPowerTribe || 'TRIBE RULING')
        : (i18n.parliamentActorInPowerInhabitant || 'INHABITANT RULING');
    return div(
      { class: 'card' },
      h2(g.method),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, (i18n.parliamentLegSince + ': ').toUpperCase()),
        span({ class: 'card-value' }, fmt(g.since))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, (i18n.parliamentLegEnd + ': ').toUpperCase()),
        span({ class: 'card-value' }, fmt(g.end))
      ),
      showActor ? div({ class: 'card-field' },
        span({ class: 'card-label' }, String(actorLabel).toUpperCase() + ': '),
        span({ class: 'card-value' },
          g.powerType === 'tribe'
            ? a({ class: 'user-link', href: `/tribe/${encodeURIComponent(g.powerId)}` }, g.powerTitle || g.powerId)
            : a({ class: 'user-link', href: `/author/${encodeURIComponent(g.powerId)}` }, g.powerTitle || g.powerId)
        )
      ) : null,
      (g.method !== 'ANARCHY')
        ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentVotesReceived + ': '),
            span({ class: 'card-value' }, `${g.votesReceived} (${g.totalVotes})`)
          )
        : null,
      br(),
      showActor && meta && (meta.avatarUrl || meta.bio)
        ? div(
            { class: 'actor-meta' },
            meta.avatarUrl ? img({ src: meta.avatarUrl, alt: '', class: 'avatar--lg' }) : null,
            meta.bio ? p({ class: 'bio' }, meta.bio) : null
          )
        : null,
      showMembers
        ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.parliamentMembers + ': '),
            span({ class: 'card-value' }, String(g.members || 0))
          )
        : null,
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentPoliciesProposal + ': '),
        span({ class: 'card-value' }, String(g.proposed || 0))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentPoliciesApproved + ': '),
        span({ class: 'card-value' }, String(g.approved || 0))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentPoliciesDeclined + ': '),
        span({ class: 'card-value' }, String(g.declined || 0))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentPoliciesDiscarded + ': '),
        span({ class: 'card-value' }, String(g.discarded || 0))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentPoliciesRevocated + ': '),
        span({ class: 'card-value' }, String(g.revocated || 0))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.parliamentEfficiency + ': '),
        span({ class: 'card-value' }, `${g.efficiency || 0} %`)
      )
    );
  });
  return div(
    { class: 'cards' },
    h2(i18n.parliamentHistoricalElectionsTitle || 'ELECTION CYCLES'),
    applyEl(div, null, cards)
  );
};

const countCandidaturesByActor = (cands = []) => {
  const m = new Map();
  for (const c of cands) {
    const key = `${c.targetType}:${c.targetId}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
};

const LeadersSummary = (leaders = [], candidatures = []) => {
  const candCounts = countCandidaturesByActor(candidatures);
  const totals = leaders.reduce((acc, l) => {
    const key = `${l.powerType}:${l.powerId}`;
    const candsFromMap = candCounts.get(key) || 0;
    const presentedNorm = Math.max(Number(l.presented || 0), Number(l.inPower || 0), candsFromMap);
    acc.presented += presentedNorm;
    acc.inPower += Number(l.inPower || 0);
    acc.proposed += Number(l.proposed || 0);
    acc.approved += Number(l.approved || 0);
    acc.declined += Number(l.declined || 0);
    acc.discarded += Number(l.discarded || 0);
    acc.revocated += Number(l.revocated || 0);
    return acc;
  }, { presented:0, inPower:0, proposed:0, approved:0, declined:0, discarded:0, revocated:0 });
  const efficiencyPct = totals.proposed > 0 ? Math.round((totals.approved / totals.proposed) * 100) : 0;
  return div(
    { class: 'table-wrap' },
    h2(i18n.parliamentHistoricalLawsTitle || 'Actions'),
    applyEl(table, { class: 'table table--centered' }, [
      thead(tr(
        th(i18n.parliamentThTotalCandidatures),
        th(i18n.parliamentThTimesInPower),
        th(i18n.parliamentThProposed),
        th(i18n.parliamentThApproved),
        th(i18n.parliamentThDeclined),
        th(i18n.parliamentThDiscarded),
        th(i18n.parliamentPoliciesRevocated),
        th(i18n.parliamentEfficiency)
      )),
      tbody(
        tr(
          td(String(totals.presented)),
          td(String(totals.inPower)),
          td(String(totals.proposed)),
          td(String(totals.approved)),
          td(String(totals.declined)),
          td(String(totals.discarded)),
          td(String(totals.revocated)),
          td(`${efficiencyPct} %`)
        )
      )
    ])
  );
};

const LeadersList = (leaders, metas = {}, candidatures = []) => {
  if (!leaders || !leaders.length) return div({ class: 'empty' }, p(i18n.parliamentNoLeaders));
  const rows = leaders.map(l => {
    const key = `${l.powerType}:${l.powerId}`;
    const meta = metas[key] || {};
    const avatar = meta.avatarUrl ? img({ src: meta.avatarUrl, alt: '', class: 'leader-table__avatar' }) : null;
    const link = l.powerType === 'tribe'
      ? a({ class: 'user-link', href: `/tribe/${encodeURIComponent(l.powerId)}` }, l.powerTitle || l.powerId)
      : a({ class: 'user-link', href: `/author/${encodeURIComponent(l.powerId)}` }, l.powerTitle || l.powerId);
    const leaderCell = div({ class: 'leader-cell' }, avatar, link);
    return tr(
      td(leaderCell),
      td(String(l.proposed || 0)),
      td(String(l.approved || 0)),
      td(String(l.declined || 0)),
      td(String(l.discarded || 0)),
      td(String(l.revocated || 0)),
      td(`${(l.efficiency != null ? Math.round(l.efficiency * 100) : (l.proposed > 0 ? Math.round((l.approved / l.proposed) * 100) : 0))} %`)
    );
  });
  return div(
    { class: 'table-wrap' },
    h2(i18n.parliamentHistoricalLeadersTitle),
    applyEl(table, { class: 'table table--centered gov-overview' }, [
      thead(tr(
        th(i18n.parliamentActorInPowerInhabitant),
        th(i18n.parliamentPoliciesProposal),
        th(i18n.parliamentPoliciesApproved),
        th(i18n.parliamentPoliciesDeclined),
        th(i18n.parliamentPoliciesDiscarded),
        th(i18n.parliamentPoliciesRevocated),
        th(i18n.parliamentEfficiency)
      )),
      applyEl(tbody, null, rows)
    ])
  );
};

const RulesContent = () =>
  div(
    { class: 'card' },
    h2(i18n.parliamentRulesTitle),
    ul(
      li(i18n.parliamentRulesIntro),
      li(i18n.parliamentRulesTerm),
      li(i18n.parliamentRulesMethods),
      li(i18n.parliamentRulesAnarchy),
      li(i18n.parliamentRulesCandidates),
      li(i18n.parliamentRulesElection),
      li(i18n.parliamentRulesTies),
      li(i18n.parliamentRulesProposals),
      li(i18n.parliamentRulesLimit),
      li(i18n.parliamentRulesLaws),
      li(i18n.parliamentRulesRevocations),
      li(i18n.parliamentRulesHistorical),
      li(i18n.parliamentRulesLeaders)
    )
  );

const CandidaturesSection = (governmentCard, candidatures, leaderMeta) => {
  return div(
    h2(i18n.parliamentGovernmentCard),
    GovHeader(governmentCard || {}),
    CandidatureStats(candidatures || [], governmentCard || null, leaderMeta || null),
    CandidatureForm(),
    candidatures && candidatures.length ? CandidaturesTable(candidatures) : null
  );
};

const ProposalsSection = (governmentCard, proposals, futureLaws, canPropose) => {
  const has = proposals && proposals.length > 0;
  const fl = FutureLawsList(futureLaws || []);
  if (!has && canPropose) return div(h2(i18n.parliamentGovernmentCard), GovHeader(governmentCard || {}), ProposalForm(), fl);
  if (!has && !canPropose) return div(h2(i18n.parliamentGovernmentCard), GovHeader(governmentCard || {}), NoProposals(), fl);
  return div(h2(i18n.parliamentGovernmentCard), GovHeader(governmentCard || {}), ProposalForm(), ProposalsList(proposals), fl);
};

const RevocationsSection = (governmentCard, laws, revocations, futureRevocations) =>
  div(
    h2(i18n.parliamentGovernmentCard),
    GovHeader(governmentCard || {}),
    RevocationForm(laws || []),
    RevocationsList(revocations || []) || '',
    FutureRevocationsList(futureRevocations || []) || ''
  );

const normalizeGovCard = (governmentCard, inhabitantsTotal) => {
  const pop = Number(inhabitantsTotal ?? governmentCard?.inhabitantsTotal ?? 0) || 0;
  if (governmentCard && (governmentCard.method || governmentCard.since || governmentCard.end || governmentCard.powerType)) {
    return { ...governmentCard, inhabitantsTotal: pop };
  }
  return null;
};

const parliamentView = async (state) => {
  const {
    filter,
    governmentCard,
    candidatures,
    proposals,
    futureLaws,
    canPropose,
    laws,
    historical,
    leaders,
    leaderMeta,
    powerMeta,
    revocations,
    futureRevocations,
    revocationsEnactedCount,
    historicalMetas = {},
    leadersMetas = {},
    inhabitantsTotal
  } = state;

  const fallbackGov = {
    method: 'ANARCHY',
    votesReceived: 0,
    totalVotes: 0,
    proposed: 0,
    approved: 0,
    declined: 0,
    discarded: 0,
    revocated: 0,
    efficiency: 0,
    powerType: 'none',
    powerId: null,
    powerTitle: 'ANARCHY',
    since: moment().toISOString(),
    end: moment().add(TERM_DAYS, 'days').toISOString(),
    inhabitantsTotal: Number(inhabitantsTotal ?? 0) || 0
  };

  const gov = normalizeGovCard(governmentCard, inhabitantsTotal) || fallbackGov;

  const LawsSectionWrap = () =>
    div(
      LawsStats(laws || [], revocationsEnactedCount || 0),
      LawsList(laws || [])
    );

  return template(
    i18n.parliamentTitle,
    section(div({ class: 'tags-header' }, h2(i18n.parliamentTitle), p(i18n.parliamentDescription)), Tabs(filter)),
    section(
      filter === 'government' ? GovernmentCard(gov, powerMeta) : null,
      filter === 'candidatures' ? CandidaturesSection(gov, candidatures, leaderMeta) : null,
      filter === 'proposals' ? ProposalsSection(gov, proposals, futureLaws, canPropose) : null,
      filter === 'laws' ? LawsSectionWrap() : null,
      filter === 'revocations' ? RevocationsSection(gov, laws, revocations, futureRevocations) : null,
      filter === 'historical' ? div(HistoricalGovsSummary(historical || []), HistoricalList(historical || [], historicalMetas)) : null,
      filter === 'leaders' ? div(LeadersSummary(leaders || [], candidatures || []), LeadersList(leaders || [], leadersMetas, candidatures || [])) : null,
      filter === 'rules' ? RulesContent() : null
    )
  );
};

module.exports = { parliamentView, pickLeader };

