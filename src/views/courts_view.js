const { form, button, div, h2, p, section, input, label, br, a, span, table, thead, tbody, tr, th, td, textarea, select, option, ul, li, img } = require('../server/node_modules/hyperaxe');
const moment = require('../server/node_modules/moment');
const { template, i18n } = require('./main_views');

const fmt = (d) => moment(d).format('YYYY-MM-DD HH:mm:ss');

const applyEl = (fn, attrs, kids) => fn.apply(null, [attrs || {}].concat(kids || []));

const methodKey = (m) => String(m || '').toUpperCase();

const methodLabel = (m) => {
  const key = `courtsMethod${methodKey(m)}`;
  const raw = i18n[key] || '';
  return String(raw).toUpperCase();
};

const showVoteMetrics = (m) => {
  const k = methodKey(m);
  return k === 'POPULAR' || k === 'KARMATOCRACY';
};

const CASE_TITLE_PRESETS = [
  'Minor conflict',
  'Moderate conflict',
  'Severe conflict',
  'Harassment or abuse',
  'Content moderation',
  'Ban or restriction',
  'Governance dispute'
];

const FILTERS = [
  { value: 'cases', key: 'courtsFilterCases' },
  { value: 'mycases', key: 'courtsFilterMyCases' },
  { value: 'actions', key: 'courtsFilterActions' },
  { value: 'judges', key: 'courtsFilterJudges' },
  { value: 'history', key: 'courtsFilterHistory' },
  { value: 'rules', key: 'courtsFilterRules' },
  { value: 'open', key: 'courtsFilterOpenCase' }
];

const Tabs = (active) =>
  div(
    { class: 'filters' },
    form(
      { method: 'GET', action: '/courts' },
      FILTERS.map((f) => {
        const isOpen = f.value === 'open';
        const cls =
          isOpen
            ? 'create-button'
            : active === f.value
            ? 'filter-btn active'
            : 'filter-btn';
        return button(
          {
            type: 'submit',
            name: 'filter',
            value: f.value,
            class: cls
          },
          i18n[f.key]
        );
      })
    )
  );

const CaseForm = () =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsCaseFormTitle),
    form(
      {
        method: 'POST',
        action: '/courts/cases/create'
      },
      label(i18n.courtsCaseTitle),
      br(),
      input({
        type: 'text',
        name: 'titleSuffix',
        required: true,
        placeholder: 'Subject or short description'
      }),
      br(),
      br(),
      label('Case type'),
      br(),
      select(
        { name: 'titlePreset', required: true },
        CASE_TITLE_PRESETS.map((t) => option({ value: t }, t))
      ),
      br(),
      br(),
      label(i18n.courtsCaseRespondent),
      br(),
      input({
        type: 'text',
        name: 'respondentId',
        placeholder: i18n.courtsCaseRespondentPh,
        required: true
      }),
      br(),
      br(),
      label(i18n.courtsCaseMethod),
      br(),
      select(
        { name: 'method', required: true },
        ['JUDGE', 'DICTATOR', 'POPULAR', 'MEDIATION', 'KARMATOCRACY'].map((m) =>
          option({ value: m }, i18n[`courtsMethod${m}`])
        )
      ),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsCaseSubmit)
    )
  );

const NominateJudgeForm = () =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsNominateJudge),
    form(
      { method: 'POST', action: '/courts/judges/nominate' },
      label(i18n.courtsJudgeId),
      br(),
      input({
        type: 'text',
        name: 'judgeId',
        placeholder: i18n.courtsJudgeIdPh,
        required: true
      }),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsNominateBtn)
    )
  );

const EvidenceForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsAddEvidence),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/evidence/add`,
        enctype: 'multipart/form-data'
      },
      label(i18n.courtsEvidenceText),
      br(),
      textarea({ name: 'text', rows: 3, maxlength: 1000 }),
      br(),
      br(),
      label(i18n.courtsEvidenceLink),
      br(),
      input({
        type: 'url',
        name: 'link',
        placeholder: i18n.courtsEvidenceLinkPh
      }),
      br(),
      br(),
      label(i18n.uploadMedia || 'Upload media (max-size: 50MB)'),
      br(),
      input({ type: 'file', name: 'image' }),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsEvidenceSubmit)
    )
  );

const AnswerForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsAnswerTitle),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/answer`
      },
      label(i18n.courtsAnswerText),
      br(),
      textarea({ name: 'answer', rows: 4, maxlength: 2000 }),
      br(),
      br(),
      select(
        { name: 'stance' },
        ['DENY', 'ADMIT', 'PARTIAL'].map((s) =>
          option({ value: s }, i18n[`courtsStance${s}`])
        )
      ),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsAnswerSubmit)
    )
  );

const VerdictForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsVerdictTitle),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/decide`
      },
      label(i18n.courtsVerdictResult),
      br(),
      input({ type: 'text', name: 'outcome', required: true }),
      br(),
      br(),
      label(i18n.courtsVerdictOrders),
      br(),
      textarea({
        name: 'orders',
        rows: 4,
        maxlength: 2000,
        placeholder: i18n.courtsVerdictOrdersPh
      }),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsIssueVerdict)
    )
  );

const SettlementForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsMediationPropose),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/settlements/propose`
      },
      label(i18n.courtsSettlementText),
      br(),
      textarea({ name: 'terms', rows: 3, maxlength: 2000 }),
      br(),
      br(),
      button(
        { type: 'submit', class: 'create-button' },
        i18n.courtsSettlementProposeBtn
      )
    )
  );

const RespondentMediatorsForm = (c) => {
  if (
    !c.isRespondent ||
    c.status === 'SOLVED' ||
    c.status === 'UNSOLVED' ||
    c.status === 'DISCARDED'
  )
    return null;
  return div(
    { class: 'div-center' },
    h2(i18n.courtsCaseMediatorsRespondentTitle),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(c.id)}/mediators/respondent`
      },
      label(i18n.courtsCaseMediatorsRespondent),
      br(),
      input({
        type: 'text',
        name: 'mediators',
        placeholder: i18n.courtsCaseMediatorsPh
      }),
      br(),
      br(),
      button({ type: 'submit', class: 'create-button' }, i18n.courtsMediatorsSubmit)
    )
  );
};

const JudgeAssignForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsAssignJudgeTitle),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/judge`
      },
      label(i18n.courtsJudgeId),
      br(),
      input({
        type: 'text',
        name: 'judgeId',
        placeholder: i18n.courtsJudgeIdPh,
        required: true
      }),
      br(),
      br(),
      button(
        { type: 'submit', class: 'create-button' },
        i18n.courtsAssignJudgeBtn
      )
    )
  );

const SupportCaseForm = (caseId) =>
  form(
    {
      method: 'POST',
      action: `/courts/cases/${encodeURIComponent(caseId)}/support`
    },
    button({ type: 'submit', class: 'vote-btn' }, i18n.courtsSupportCase)
  );

const VerdictVoteForm = (caseId) =>
  div(
    { class: 'div-center' },
    h2(i18n.courtsVerdictVoteTitle),
    form(
      {
        method: 'POST',
        action: `/courts/cases/${encodeURIComponent(caseId)}/verdict/vote`
      },
      label(i18n.courtsVerdictVoteLabel),
      br(),
      select(
        { name: 'decision' },
        option({ value: 'ACCEPT' }, i18n.courtsVerdictVoteAccept),
        option({ value: 'REJECT' }, i18n.courtsVerdictVoteReject)
      ),
      br(),
      br(),
      button(
        { type: 'submit', class: 'create-button' },
        i18n.courtsVerdictVoteSubmit
      )
    )
  );

const shortId = (id) => {
  const s = String(id || '');
  if (!s) return '';
  if (s.length <= 16) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
};

const UserLinkCompact = (id) =>
  id
    ? a(
        { class: 'user-link', href: `/author/${encodeURIComponent(id)}` },
        shortId(id)
      )
    : span('');

const UserLinkFull = (id) =>
  id
    ? a(
        { class: 'user-link', href: `/author/${encodeURIComponent(id)}` },
        id
      )
    : span('');

const renderRichTextNodes = (raw) => {
  const text = String(raw || '');
  if (!text) return [];
  const nodes = [];
  let remaining = text;
  const imgRegex = /!\[[^\]]*]\(([^)]+)\)/;
  const linkRegex = /\[([^\]]+)]\((https?:\/\/[^)]+)\)/;
  while (remaining.length) {
    const imgMatch = imgRegex.exec(remaining);
    const linkMatch = linkRegex.exec(remaining);
    let next = null;
    let type = null;
    if (imgMatch && (!linkMatch || imgMatch.index < linkMatch.index)) {
      next = imgMatch;
      type = 'img';
    } else if (linkMatch) {
      next = linkMatch;
      type = 'link';
    }
    if (!next) {
      if (remaining.trim()) nodes.push(p(remaining));
      break;
    }
    const idx = next.index;
    if (idx > 0) {
      const before = remaining.slice(0, idx);
      if (before.trim()) nodes.push(p(before));
    }
    if (type === 'img') {
      const ref = next[1];
      nodes.push(
        img({
          class: 'evidence-image',
          src: `/blob/${encodeURIComponent(ref)}`,
          alt: 'evidence'
        })
      );
    } else {
      const labelText = next[1];
      const url = next[2];
      nodes.push(
        a(
          {
            class: 'evidence-link',
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          labelText
        )
      );
    }
    remaining = remaining.slice(idx + next[0].length);
  }
  return nodes;
};

const RichTextBlock = (raw) => {
  const nodes = renderRichTextNodes(raw);
  if (!nodes.length) return null;
  return nodes;
};

const CaseCard = (c) => {
  const mid = methodKey(c.method);
  const yes = Number(c.yes || 0);
  const total = Number(c.total || 0);
  const needed = Number(c.needed || 0);
  const showMetricsFlag = showVoteMetrics(mid) && (total > 0 || needed > 0);
  const accLink = UserLinkCompact(c.accuser);
  const resLink = UserLinkCompact(c.respondent);
  const mediatorsAccuser = Array.isArray(c.mediatorsAccuser)
    ? c.mediatorsAccuser
    : [];
  const mediatorsRespondent = Array.isArray(c.mediatorsRespondent)
    ? c.mediatorsRespondent
    : [];
  const canShowDetails = c.mine || c.publicDetails;
  const mediatorLinksAccuser = mediatorsAccuser.map((mId, idx) =>
    span(
      { class: 'mediator' },
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        shortId(mId)
      ),
      idx < mediatorsAccuser.length - 1 ? span(', ') : null
    )
  );
  const mediatorLinksRespondent = mediatorsRespondent.map((mId, idx) =>
    span(
      { class: 'mediator' },
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        shortId(mId)
      ),
      idx < mediatorsRespondent.length - 1 ? span(', ') : null
    )
  );
  const showPublicPrefForm =
    (c.status === 'SOLVED' ||
      c.status === 'UNSOLVED' ||
      c.status === 'DISCARDED') &&
    (c.isAccuser || c.isRespondent);
  const publicPreferenceForm = showPublicPrefForm
    ? form(
        {
          method: 'POST',
          action: `/courts/cases/${encodeURIComponent(c.id)}/public`
        },
        label(i18n.courtsPublicPrefLabel),
        br(),
        select(
          { name: 'preference' },
          option(
            { value: 'YES', selected: c.myPublicPreference === true },
            i18n.courtsPublicPrefYes
          ),
          option(
            { value: 'NO', selected: c.myPublicPreference === false },
            i18n.courtsPublicPrefNo
          )
        ),
        br(),
        br(),
        button(
          { type: 'submit', class: 'create-button' },
          i18n.courtsPublicPrefSubmit
        )
      )
    : null;
  const respondentMediatorsForm = RespondentMediatorsForm(c);
  const canAddEvidence =
    c.isAccuser || c.isRespondent || c.isMediator || c.isJudge || c.isDictator;
  const canAnswer = c.isRespondent;
  const canIssueVerdict =
    (c.isJudge || c.isDictator || c.isMediator) &&
    c.status === 'OPEN' &&
    !c.hasVerdict;
  const canProposeSettlement =
    (c.isAccuser || c.isRespondent || c.isMediator) &&
    methodKey(c.method) === 'MEDIATION' &&
    c.status === 'OPEN';
  const canVoteVerdict =
    c.hasVerdict &&
    (c.isAccuser || c.isRespondent) &&
    c.status === 'OPEN';
  const isNormalUser =
    !c.isAccuser &&
    !c.isRespondent &&
    !c.isMediator &&
    !c.isJudge &&
    !c.isDictator;
  const canSupport =
    isNormalUser &&
    (c.status === 'IN_PROGRESS' || c.status === 'OPEN');
  const canAssignJudge =
    methodKey(c.method) === 'JUDGE' &&
    !c.judgeId &&
    (c.isAccuser || c.isRespondent);
  return div(
    { class: 'card' },
    div(
      { class: 'card-header' },
      div(
        { class: 'card-header__meta' },
        h2(c.title || ''),
        div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsCaseMethod + ': '),
          span({ class: 'card-value' }, methodLabel(c.method))
        ),
        div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThStatus + ': '),
          span({ class: 'card-value' }, String(c.status || ''))
        ),
        c.answerBy
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.courtsThAnswerBy + ': '),
              span({ class: 'card-value' }, fmt(c.answerBy))
            )
          : null,
        c.evidenceBy
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.courtsThEvidenceBy + ': '),
              span({ class: 'card-value' }, fmt(c.evidenceBy))
            )
          : null
      )
    ),
    div(
      { class: 'table-wrap mt-2' },
      applyEl(table, { class: 'table table--centered' }, [
        thead(tr(th(i18n.courtsAccuser), th(i18n.courtsRespondent))),
        tbody(tr(td(accLink), td(resLink)))
      ])
    ),
    mediatorsAccuser.length
      ? div(
          { class: 'card-field' },
          span(
            { class: 'card-label' },
            i18n.courtsMediatorsAccuserLabel + ': '
          ),
          span({ class: 'card-value' }, ...mediatorLinksAccuser)
        )
      : null,
    mediatorsRespondent.length
      ? div(
          { class: 'card-field' },
          span(
            { class: 'card-label' },
            i18n.courtsMediatorsRespondentLabel + ': '
          ),
          span({ class: 'card-value' }, ...mediatorLinksRespondent)
        )
      : null,
    c.supportCount
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsSupportCount + ': '),
          span({ class: 'card-value' }, String(c.supportCount))
        )
      : null,
    canShowDetails ? RichTextBlock(c.description || '') : null,
    showMetricsFlag
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsVotesNeeded + ': '),
          span({ class: 'card-value' }, String(needed))
        )
      : null,
    showMetricsFlag
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsVotesSlashTotal + ': '),
          span({ class: 'card-value' }, `${yes}/${total}`)
        )
      : null,
    c.voteId
      ? form(
          { method: 'GET', action: `/votes/${encodeURIComponent(c.voteId)}` },
          button({ type: 'submit', class: 'vote-btn' }, i18n.courtsOpenVote)
        )
      : null,
    canSupport ? SupportCaseForm(c.id || '') : null,
    publicPreferenceForm,
    respondentMediatorsForm,
    canAssignJudge ? JudgeAssignForm(c.id || '') : null,
    canAddEvidence ? EvidenceForm(c.id || '') : null,
    canAnswer ? AnswerForm(c.id || '') : null,
    canIssueVerdict ? VerdictForm(c.id || '') : null,
    canVoteVerdict ? VerdictVoteForm(c.id || '') : null,
    canProposeSettlement ? SettlementForm(c.id || '') : null
  );
};

const MyCaseCard = (c) => {
  const mid = methodKey(c.method);
  const yes = Number(c.yes || 0);
  const total = Number(c.total || 0);
  const needed = Number(c.needed || 0);
  const showMetricsFlag = showVoteMetrics(mid) && (total > 0 || needed > 0);

  const accLinkFull = UserLinkFull(c.accuser);
  const respondentId = c.respondentId || c.respondent;
  const resLinkFull = UserLinkFull(respondentId);

  const mediatorsAccuser = Array.isArray(c.mediatorsAccuser)
    ? c.mediatorsAccuser
    : [];
  const mediatorsRespondent = Array.isArray(c.mediatorsRespondent)
    ? c.mediatorsRespondent
    : [];

  const mediatorLinksAccuser = mediatorsAccuser.map((mId, idx) =>
    span(
      {},
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        mId
      ),
      idx < mediatorsAccuser.length - 1 ? span(', ') : null
    )
  );

  const mediatorLinksRespondent = mediatorsRespondent.map((mId, idx) =>
    span(
      {},
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        mId
      ),
      idx < mediatorsRespondent.length - 1 ? span(', ') : null
    )
  );

  const judgeLinkFull = c.judgeId ? UserLinkFull(c.judgeId) : span('');
  const showMediatorsTable =
    !!c.method &&
    (mediatorsAccuser.length > 0 ||
      mediatorsRespondent.length > 0 ||
      !!c.judgeId);

  const showPublicPrefForm =
    (c.status === 'SOLVED' ||
      c.status === 'UNSOLVED' ||
      c.status === 'DISCARDED') &&
    (c.isAccuser || c.isRespondent);

  const publicPreferenceForm = showPublicPrefForm
    ? form(
        {
          method: 'POST',
          action: `/courts/cases/${encodeURIComponent(c.id)}/public`
        },
        label(i18n.courtsPublicPrefLabel),
        br(),
        select(
          { name: 'preference' },
          option(
            { value: 'YES', selected: c.myPublicPreference === true },
            i18n.courtsPublicPrefYes
          ),
          option(
            { value: 'NO', selected: c.myPublicPreference === false },
            i18n.courtsPublicPrefNo
          )
        ),
        br(),
        br(),
        button(
          { type: 'submit', class: 'create-button' },
          i18n.courtsPublicPrefSubmit
        )
      )
    : null;

  const respondentMediatorsForm = RespondentMediatorsForm(c);

  const canAddEvidence =
    c.isAccuser || c.isRespondent || c.isMediator || c.isJudge || c.isDictator;
  const canAnswer = c.isRespondent;
  const canIssueVerdict =
    (c.isJudge || c.isDictator || c.isMediator) &&
    c.status === 'OPEN' &&
    !c.hasVerdict;
  const canProposeSettlement =
    (c.isAccuser || c.isRespondent || c.isMediator) &&
    methodKey(c.method) === 'MEDIATION' &&
    c.status === 'OPEN';
  const canVoteVerdict =
    c.hasVerdict &&
    (c.isAccuser || c.isRespondent) &&
    c.status === 'OPEN';
  const isNormalUser =
    !c.isAccuser &&
    !c.isRespondent &&
    !c.isMediator &&
    !c.isJudge &&
    !c.isDictator;
  const canSupport =
    isNormalUser &&
    (c.status === 'IN_PROGRESS' || c.status === 'OPEN');
  const canAssignJudge =
    methodKey(c.method) === 'JUDGE' &&
    !c.judgeId &&
    (c.isAccuser || c.isRespondent);

  return div(
    { class: 'card' },
    br(),
    div(
      { class: 'card-field' },
      span({ class: 'card-label' }, i18n.courtsThCase + ': '),
      span({ class: 'card-value' }, c.title || '')
    ),
    div(
      { class: 'card-field' },
      span({ class: 'card-label' }, i18n.courtsThStatus + ': '),
      span({ class: 'card-value' }, String(c.status || ''))
    ),
    div(
      { class: 'card-field' },
      span({ class: 'card-label' }, i18n.courtsMethod + ': '),
      span({ class: 'card-value' }, methodLabel(c.method))
    ),
    c.answerBy
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThAnswerBy + ': '),
          span({ class: 'card-value' }, fmt(c.answerBy))
        )
      : null,
    c.evidenceBy
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThEvidenceBy + ': '),
          span({ class: 'card-value' }, fmt(c.evidenceBy))
        )
      : null,
    c.decisionBy
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThDecisionBy + ': '),
          span({ class: 'card-value' }, fmt(c.decisionBy))
        )
      : null,
    div(
      { class: 'table-wrap mt-2' },
      applyEl(table, { class: 'table table--centered' }, [
        thead(
          tr(
            th(i18n.courtsAccuser),
            th(i18n.courtsRespondent)
          )
        ),
        tbody(
          tr(
            td(accLinkFull),
            td(resLinkFull)
          )
        )
      ])
    ),
    showMediatorsTable
      ? div(
          { class: 'table-wrap mt-2 mediators-table' },
          applyEl(table, { class: 'table table--centered' }, [
            thead(
              tr(
                th(i18n.courtsThJudge),
                th(
                  i18n.courtsMediatorsAccuserLabel ||
                    i18n.courtsMediatorsLabel ||
                    'Accuser mediators'
                ),
                th(
                  i18n.courtsMediatorsRespondentLabel ||
                    i18n.courtsMediatorsLabel ||
                    'Respondent mediators'
                )
              )
            ),
            tbody(
              tr(
                td(judgeLinkFull),
                td(
                  mediatorLinksAccuser.length
                    ? mediatorLinksAccuser
                    : span('')
                ),
                td(
                  mediatorLinksRespondent.length
                    ? mediatorLinksRespondent
                    : span('')
                )
              )
            )
          ])
        )
      : null,

    c.supportCount
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsSupportCount + ': '),
          span({ class: 'card-value' }, String(c.supportCount))
        )
      : null,
    showMetricsFlag
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsVotesNeeded + ': '),
          span({ class: 'card-value' }, String(needed))
        )
      : null,
    showMetricsFlag
      ? div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsVotesSlashTotal + ': '),
          span({ class: 'card-value' }, `${yes}/${total}`)
        )
      : null,
    c.voteId
      ? form(
          { method: 'GET', action: `/votes/${encodeURIComponent(c.voteId)}` },
          button({ type: 'submit', class: 'vote-btn' }, i18n.courtsOpenVote)
        )
      : null,
    canSupport ? SupportCaseForm(c.id || '') : null,
    publicPreferenceForm,
    respondentMediatorsForm,
    canAssignJudge ? JudgeAssignForm(c.id || '') : null,
    canAddEvidence ? EvidenceForm(c.id || '') : null,
    canAnswer ? AnswerForm(c.id || '') : null,
    canIssueVerdict ? VerdictForm(c.id || '') : null,
    canVoteVerdict ? VerdictVoteForm(c.id || '') : null,
    canProposeSettlement ? SettlementForm(c.id || '') : null
  );
};

const CasesList = (rows = []) => {
  const cards = rows.map(CaseCard);
  return div({ class: 'cards' }, ...cards);
};

const MyCasesList = (rows = []) => {
  const cards = rows.map(MyCaseCard);
  return div({ class: 'cards' }, ...cards);
};

const roleTextForCase = (c) => {
  if (c.isAccuser) return i18n.courtsRoleAccuser || 'Accuser';
  if (c.isRespondent) return i18n.courtsRoleDefence || 'Defence';
  if (c.isMediator) return i18n.courtsRoleMediator || 'Mediator';
  if (c.isJudge) return i18n.courtsRoleJudge || 'Judge';
  if (c.isDictator) return i18n.courtsRoleDictator || 'Dictator';
  return '';
};

const CasesTable = (rows = [], opts = {}) => {
  if (!rows.length) return div({ class: 'empty' }, p(i18n.courtsNoCases));
  const showRole = !!opts.showRole;
  const bodyRows = rows.map((c) => {
    const role = showRole ? roleTextForCase(c) : '';
    return tr(
      td(c.title || ''),
      td(
        c.accuser
          ? a(
              {
                class: 'user-link',
                href: `/author/${encodeURIComponent(c.accuser)}`
              },
              c.accuser
            )
          : ''
      ),
      td(methodLabel(c.method)),
      td(c.createdAt ? fmt(c.createdAt) : ''),
      showRole ? td(role) : null,
      td(
        c.id
          ? form(
              {
                method: 'GET',
                action: `/courts/cases/${encodeURIComponent(c.id)}`
              },
              button(
                { type: 'submit', class: 'link-button' },
                i18n.courtsViewDetailsShort ||
                  i18n.courtsViewDetails ||
                  'View'
              )
            )
          : ''
      )
    );
  });
  return div(
    { class: 'table-wrap' },
    applyEl(table, { class: 'table table--centered' }, [
      thead(
        tr(
          th(i18n.courtsThCase),
          th(i18n.courtsAccuser),
          th(i18n.courtsCaseMethod),
          th(i18n.courtsThCreatedAt),
          showRole ? th(i18n.courtsThRole || 'Role') : null,
          th(i18n.courtsThDetails || '')
        )
      ),
      applyEl(tbody, null, bodyRows)
    ])
  );
};

const NominationsTable = (nominations = [], currentUserId = '') => {
  if (!nominations || !nominations.length)
    return div({ class: 'empty' }, p(i18n.courtsNoNominations));
  const rows = nominations.map((n) => {
    const isSelf =
      currentUserId &&
      String(n.judgeId || '') === String(currentUserId || '');
    return tr(
      td(
        a(
          { class: 'user-link', href: `/author/${encodeURIComponent(n.judgeId)}` },
          n.judgeId
        )
      ),
      td(String(n.supports || 0)),
      td(fmt(n.createdAt)),
      td(
        isSelf
          ? span('')
          : form(
              {
                method: 'POST',
                action: `/courts/judges/${encodeURIComponent(n.id)}/vote`
              },
              button({ class: 'vote-btn' }, i18n.courtsThVote)
            )
      )
    );
  });
  return div(
    { class: 'table-wrap' },
    h2(i18n.courtsNominationsTitle),
    applyEl(table, { class: 'table table--centered' }, [
      thead(
        tr(
          th(i18n.courtsThJudge),
          th(i18n.courtsThSupports),
          th(i18n.courtsThDate),
          th(i18n.courtsThVote)
        )
      ),
      applyEl(tbody, null, rows)
    ])
  );
};

const JudgesSection = (nominations = [], currentUserId = '') => {
  const nomBlock = NominationsTable(nominations, currentUserId);
  return div(NominateJudgeForm(), nomBlock);
};

const HistoryList = (rows = []) => {
  if (!rows.length) return div({ class: 'empty' }, p(i18n.courtsNoHistory));
  const cards = rows.map((hh) => {
    const canShowDescription = hh.mine || hh.publicDetails;
    return div(
      { class: 'card' },
      br(),
      hh.method
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.courtsCaseMethod + ': '),
            span({ class: 'card-value' }, methodLabel(hh.method))
          )
        : null,
      hh.decidedAt
        ? div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.courtsThDecisionBy + ': '),
            span({ class: 'card-value' }, fmt(hh.decidedAt))
          )
        : null,
      div(
        { class: 'card-field' },
        span({ class: 'card-label' }, i18n.courtsThStatus + ': '),
        span({ class: 'card-value' }, String(hh.status || ''))
      ),
      h2(hh.title || ''),
      canShowDescription ? RichTextBlock(hh.description || '') : null,
      form(
        {
          method: 'GET',
          action: `/courts/cases/${encodeURIComponent(hh.id)}`
        },
        button({ type: 'submit', class: 'create-button' }, i18n.courtsViewDetails)
      )
    );
  });
  return div({ class: 'cards' }, ...cards);
};

const RulesContent = () =>
  div(
    { class: 'card' },
    h2(i18n.courtsRulesTitle),
    ul(
      li(i18n.courtsRulesIntro),
      li(i18n.courtsRulesLifecycle),
      li(i18n.courtsRulesRoles),
      li(i18n.courtsRulesEvidence),
      li(i18n.courtsRulesDeliberation),
      li(i18n.courtsRulesVerdict),
      li(i18n.courtsRulesAppeals),
      li(i18n.courtsRulesPrivacy),
      li(i18n.courtsRulesMisconduct),
      li(i18n.courtsRulesGlossary)
    )
  );

const CaseSearch = (filter, search = '') =>
  div(
    { class: 'filters' },
    form(
      { method: 'GET', action: '/courts' },
      input({ type: 'hidden', name: 'filter', value: filter }),
      input({
        type: 'text',
        name: 'search',
        placeholder: i18n.searchCasesPlaceholder,
        value: search || ''
      }),
      br(),
      button({ type: 'submit' }, i18n.applyFilters),
      br()
    )
  );

const CaseDetailsBlock = (c) => {
  if (!c) return div({ class: 'empty' }, p(i18n.courtsNoCases));
  const canShowFull = c.mine || c.publicDetails;
  const accLink = UserLinkFull(c.accuser);
  const resLink = UserLinkFull(c.respondent || c.respondentId);
  const judgeValue = c.judgeId
    ? UserLinkFull(c.judgeId)
    : span(i18n.courtsJudgeNotAssigned || '-');
  const mediatorsAccuser = Array.isArray(c.mediatorsAccuser)
    ? c.mediatorsAccuser
    : [];
  const mediatorsRespondent = Array.isArray(c.mediatorsRespondent)
    ? c.mediatorsRespondent
    : [];
  const mediatorLinksAccuser = mediatorsAccuser.map((mId, idx) =>
    span(
      { class: 'mediator' },
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        shortId(mId)
      ),
      idx < mediatorsAccuser.length - 1 ? span(', ') : null
    )
  );
  const mediatorLinksRespondent = mediatorsRespondent.map((mId, idx) =>
    span(
      { class: 'mediator' },
      a(
        { class: 'user-link', href: `/author/${encodeURIComponent(mId)}` },
        shortId(mId)
      ),
      idx < mediatorsRespondent.length - 1 ? span(', ') : null
    )
  );
  const showMediatorsTable =
    c.method && (mediatorsAccuser.length || mediatorsRespondent.length);
  const evidences = Array.isArray(c.evidences) ? c.evidences : [];
  const answers = Array.isArray(c.answers) ? c.answers : [];
  const settlements = Array.isArray(c.settlements) ? c.settlements : [];

  const evidenceSideLabel = (e) => {
    const side = String((e && e.side) || '').toUpperCase();
    if (side === 'ACCUSER') {
      return i18n.courtsEvidenceSideAccuser || 'Accuser evidence';
    }
    if (side === 'RESPONDENT' || side === 'DEFENCE' || side === 'DEFENSE') {
      return i18n.courtsEvidenceSideRespondent || 'Defence evidence';
    }
    return i18n.courtsEvidenceSideUnknown || '';
  };

  return div(
    { class: 'card case-details-card' },
    br(),
    div(
      { class: 'card-header' },
      div(
        { class: 'card-header__meta' },
        h2(c.title || ''),
        c.method
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.courtsCaseMethod + ': '),
              span({ class: 'card-value' }, methodLabel(c.method))
            )
          : null,
        div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThJudge + ': '),
          span({ class: 'card-value' }, judgeValue)
        ),
        div(
          { class: 'card-field' },
          span({ class: 'card-label' }, i18n.courtsThStatus + ': '),
          span({ class: 'card-value' }, String(c.status || ''))
        ),
        c.createdAt
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.courtsThCreatedAt + ': '),
              span({ class: 'card-value' }, fmt(c.createdAt))
            )
          : null,
        c.decidedAt
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.courtsThDecisionBy + ': '),
              span({ class: 'card-value' }, fmt(c.decidedAt))
            )
          : null
      )
    ),
    div(
      { class: 'table-wrap mt-2' },
      applyEl(table, { class: 'table table--centered' }, [
        thead(
          tr(
            th(i18n.courtsAccuser),
            th(i18n.courtsRespondent)
          )
        ),
        tbody(
          tr(
            td(accLink),
            td(resLink)
          )
        )
      ])
    ),
    showMediatorsTable
      ? div(
          { class: 'table-wrap mt-2 mediators-table' },
          applyEl(table, { class: 'table table--centered' }, [
            thead(
              tr(
                th(
                  i18n.courtsMediatorsAccuserLabel ||
                    i18n.courtsMediatorsLabel ||
                    'Accuser mediators'
                ),
                th(
                  i18n.courtsMediatorsRespondentLabel ||
                    i18n.courtsMediatorsLabel ||
                    'Respondent mediators'
                )
              )
            ),
            tbody(
              tr(
                td(
                  mediatorLinksAccuser.length
                    ? mediatorLinksAccuser
                    : span('')
                ),
                td(
                  mediatorLinksRespondent.length
                    ? mediatorLinksRespondent
                    : span('')
                )
              )
            )
          ])
        )
      : null,
    canShowFull ? RichTextBlock(c.description || '') : null,
    !canShowFull
      ? div(
          { class: 'card-field' },
          p(i18n.courtsDetailsNotPublic)
        )
      : null,
    canShowFull && evidences.length
      ? div(
          { class: 'card-section evidences-section' },
          h2(i18n.courtsDetailsEvidenceTitle),
          ...evidences.map((e) => {
            const bodyChildren = [];
            if (e.text && String(e.text).trim()) {
              bodyChildren.push(RichTextBlock(e.text));
            }
            if (e.link && String(e.link).trim()) {
              bodyChildren.push(
                a(
                  {
                    class: 'evidence-link',
                    href: e.link,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                  },
                  e.link
                )
              );
            }
            if (e.imageUrl && String(e.imageUrl).trim()) {
              bodyChildren.push(
                br(),br(),
                img({
                  class: 'evidence-image',
                  src: `/blob/${encodeURIComponent(e.imageUrl)}`,
                  alt: 'evidence'
                })
              );
            }
            if (!bodyChildren.length) {
              bodyChildren.push(span(''));
            }
            const sideLabel = evidenceSideLabel(e);
            const dateText = fmt(e.createdAt);
            const dateWithSide = sideLabel
              ? dateText + ' · ' + sideLabel
              : dateText;
            return div(
              { class: 'evidence-item' },
              div(
                { class: 'evidence-date' },
                dateWithSide
              ),
              div(
                { class: 'evidence-body' },
                ...bodyChildren
              )
            );
          })
        )
      : null,
    canShowFull && answers.length
      ? div(
          { class: 'card-section answers-section' },
          h2(i18n.courtsDetailsAnswersTitle),
          ...answers.map((aItem) => {
            const stanceKey = methodKey(aItem.stance);
            const stanceLabel =
              stanceKey && i18n[`courtsStance${stanceKey}`]
                ? i18n[`courtsStance${stanceKey}`]
                : aItem.stance || '';
            const dateText = fmt(aItem.createdAt);
            const metaText = stanceLabel
              ? dateText + ' · ' + stanceLabel
              : dateText;
            return div(
              { class: 'answer-item' },
              div(
                { class: 'answer-meta' },
                metaText
              ),
              RichTextBlock(aItem.text || '')
            );
          })
        )
      : null,
    canShowFull && c.verdict
      ? div(
          { class: 'card-section verdict-section' },
          h2(i18n.courtsDetailsVerdictTitle),
          div(
            { class: 'card-field' },
            span({ class: 'card-label' }, i18n.courtsVerdictResult + ': '),
            span({ class: 'card-value' }, c.verdict.result || '')
          ),
          c.verdict.orders
            ? div(
                { class: 'card-field' },
                span(
                  { class: 'card-label' },
                  i18n.courtsVerdictOrders + ': '
                ),
                RichTextBlock(c.verdict.orders || '')
              )
            : null
        )
      : null,
    canShowFull && settlements.length
      ? div(
          { class: 'card-section settlements-section' },
          h2(i18n.courtsDetailsSettlementsTitle),
          ...settlements.map((sItem) =>
            div(
              { class: 'settlement-item' },
              div(
                { class: 'settlement-date' },
                fmt(sItem.createdAt)
              ),
              RichTextBlock(sItem.terms || '')
            )
          )
        )
      : null
  );
};

const courtsView = async (state) => {
  const {
    filter = 'cases',
    cases = [],
    myCases = [],
    history = [],
    nominations = [],
    search = '',
    userId = ''
  } = state;
  return template(
    i18n.courtsTitle,
    section(
      div(
        { class: 'tags-header' },
        h2(i18n.courtsTitle),
        p(i18n.courtsDescription)
      ),
      Tabs(filter),
      filter === 'cases' ? CaseSearch(filter, search) : null
    ),
    section(
      filter === 'cases' ? CasesTable(cases) : null,
      filter === 'mycases'
        ? myCases.length
          ? CasesTable(myCases, { showRole: true })
          : div({ class: 'empty' }, p(i18n.courtsNoMyCases))
        : null,
      filter === 'actions'
        ? myCases.length
          ? MyCasesList(myCases)
          : div({ class: 'empty' }, p(i18n.courtsNoMyCases))
        : null,
      filter === 'judges' ? JudgesSection(nominations, userId) : null,
      filter === 'history' ? HistoryList(history) : null,
      filter === 'rules' ? RulesContent() : null,
      filter === 'open' ? CaseForm() : null
    )
  );
};

const courtsCaseView = async (state) => {
  const { caseData } = state;
  return template(
    i18n.courtsTitle,
    section(
      div(
        { class: 'tags-header' },
        h2(i18n.courtsTitle),
        p(i18n.courtsDescription)
      ),
      Tabs('cases')
    ),
    section(CaseDetailsBlock(caseData))
  );
};

module.exports = { courtsView, courtsCaseView };

