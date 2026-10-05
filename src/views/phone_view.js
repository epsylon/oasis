const { div, h2, p, section, button, form, input, span, audio, table, tr, td, th, br, a } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, userLinkLabel, renderCallButton } = require("./main_views");
const { renderEncryptedChip } = require("./clearnet_view");
const { phoneNumberOf } = require("../models/phone_number");
const moment = require("../server/node_modules/moment");

const PAM_MAX_MS = 120000;

const clock = (ms) => {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const postButton = (action, label, danger = false, fields = {}) =>
  form({ method: 'POST', action, class: 'phone-action-form' },
    ...Object.entries(fields).map(([name, value]) => input({ type: 'hidden', name, value: String(value) })),
    button({ type: 'submit', class: danger ? 'tribe-action-btn danger-btn' : 'tribe-action-btn' }, String(label).toUpperCase())
  );

const linkList = (ids) => ids.reduce((acc, id, i) => i > 0 ? [...acc, ', ', userLink(id)] : [userLink(id)], []);
const peersOf = (h) => (Array.isArray(h.peers) && h.peers.length ? h.peers : [h.peer]).filter(Boolean);

const OUTCOME_LABEL = {
  ended: () => i18n.phoneOutcomeEnded,
  missed: () => i18n.phoneOutcomeMissed,
  rejected: () => i18n.phoneOutcomeRejected,
  noanswer: () => i18n.phoneOutcomeNoanswer,
  cancelled: () => i18n.phoneOutcomeCancelled,
  pam: () => i18n.phoneOutcomePam,
  failed: () => i18n.phoneOutcomeFailed
};

const renderCallPanel = (st, now) => {
  if (!st) return null;
  const who = st.group ? linkList(st.peers.map(x => x.id)) : [userLink(st.peer)];
  const line = (...parts) => div({ class: 'phone-call-who' }, span({ class: 'phone-call-icon' }, '✆'), ...parts);
  const actions = (...btns) => div({ class: 'phone-call-actions' }, ...btns);
  let body;
  if (st.dir === 'in' && st.phase === 'incoming') {
    body = [line(...who, ' ', i18n.phoneIsCalling), actions(postButton('/phone/accept', i18n.phoneAnswer), postButton('/phone/reject', i18n.phoneReject, true))];
  } else if (st.phase === 'calling') {
    body = [line(i18n.phoneCalling, ' ', ...who, ' ', span({ class: 'phone-call-clock' }, clock(now - st.startedAt))), actions(postButton('/phone/hangup', i18n.phoneHangup, true))];
  } else if (st.phase === 'connecting' || st.phase === 'connected') {
    const inCall = st.group ? linkList(st.peers.filter(x => x.phase === 'connected').map(x => x.id)) : who;
    const ringing = st.group ? st.peers.filter(x => x.phase === 'calling').map(x => x.id) : [];
    body = [
      line(i18n.phoneInCall, ' ', ...inCall, ' ', span({ class: 'phone-call-clock' }, clock(now - (st.answeredAt || st.startedAt)))),
      ringing.length ? div({ class: 'phone-call-ringing' }, i18n.phoneCalling, ' ', ...linkList(ringing)) : null,
      actions(
        st.muted ? postButton('/phone/mute', i18n.phoneUnmute, false, { mute: 0 }) : postButton('/phone/mute', i18n.phoneMute, false, { mute: 1 }),
        postButton('/phone/hangup', i18n.phoneHangup, true)
      )
    ];
  } else if (st.phase === 'recording' || st.phase === 'recorded') {
    const elapsed = st.phase === 'recorded' ? PAM_MAX_MS : Math.min(PAM_MAX_MS, now - (st.recordingStartedAt || now));
    body = [line(i18n.phoneRecording, ' ', ...who, ' ', span({ class: 'phone-call-clock' }, `${clock(elapsed)} / ${clock(PAM_MAX_MS)}`)), actions(postButton('/phone/pam/send', i18n.phoneSendPam), postButton('/phone/pam/cancel', i18n.phoneCancel, true))];
  } else {
    return null;
  }
  return div({ class: 'phone-call-panel' },
    div({ class: 'room-live-head' },
      div({ class: 'room-live-head-main' },
        div({ class: 'card-chips-row' }, renderEncryptedChip(i18n), st.group ? span({ class: 'pm-exposition-chip phone-joint-chip' }, span({ class: 'pm-exposition-text' }, i18n.phoneJointCall)) : null)
      ),
      a({ href: '/phone', class: 'tribe-action-btn room-refresh-btn' }, String(i18n.liveRefresh).toUpperCase())
    ),
    ...body
  );
};

const renderNumberChooser = (compose) =>
  div({ class: 'phone-number-chooser' },
    p(String(i18n.phoneNumberChoose || '').replace('{number}', compose.number || '')),
    div({ class: 'phone-contacts' },
      ...(compose.candidates || []).map(c => div({ class: 'phone-contact' },
        userLink(c.id),
        span({ class: 'date-link' }, c.id),
        postButton('/phone/call', `✆ ${i18n.phoneCallButton}`, false, { to: c.to, compose: 1 })
      )),
      ...(compose.rooms || []).map(r => div({ class: 'phone-contact' },
        a({ href: `/rooms/${encodeURIComponent(r.id)}`, class: 'user-link' }, r.title || i18n.roomsTitle),
        span({ class: 'date-link' }, i18n.roomsTitle),
        postButton(`/rooms/join/${encodeURIComponent(r.id)}`, `ꘒ ${i18n.roomJoin}`)
      ))
    )
  );

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const NUMBER_TOKEN = /^\d{3}-\d{3}$/;

const renderCompose = (compose) => {
  const recipients = Array.isArray(compose.recipients) ? compose.recipients : [];
  const max = Number(compose.max) || 7;
  const dial = String(compose.dial || '');
  const full = recipients.length >= max;
  const keep = () => [input({ type: 'hidden', name: 'filter', value: 'create' }), input({ type: 'hidden', name: 'to', value: compose.to || '' })];
  const key = (value, label, cls = 'phone-key', extra = {}) => button({ type: 'submit', name: 'key', value, class: cls, ...extra }, label);
  const callTo = [...recipients, dial].filter(Boolean).join(',');
  return section(
    div({ class: 'pm-form phone-compose' },
      compose.choose && ((compose.candidates || []).length || (compose.rooms || []).length) ? renderNumberChooser(compose) : null,
      form({ method: 'GET', action: '/phone', class: 'phone-dialer' },
        ...keep(),
        key('add', `+ ${i18n.phoneDialAdd}`, 'phone-dial-add', full ? { disabled: true } : {}),
        div({ class: 'phone-screen' },
          input({ type: 'text', name: 'dial', value: dial, placeholder: i18n.phoneDialPlaceholder, maxlength: '64', autocomplete: 'off', autofocus: true })
        ),
        div({ class: 'phone-dialpad' },
          ...DIAL_KEYS.map(d => key(d, d)),
          key('back', '⌫', 'phone-key phone-key-fn', { title: i18n.phoneDialBack }),
          key('0', '0'),
          key('clear', '✕', 'phone-key phone-key-fn', { title: i18n.phoneDialClear })
        )
      ),
      p({ class: 'phone-empty phone-dial-hint' }, i18n.phoneLimitsHint),
      div({ class: 'phone-recipients' },
        span({ class: 'card-label' }, `${i18n.phoneDialInhabitants}: ${recipients.length}/${max}`),
        recipients.length ? div({ class: 'phone-recipient-list' },
          ...recipients.map((r, i) => span({ class: 'phone-recipient' },
            NUMBER_TOKEN.test(r) ? span(`✆ ${r}`) : [userLink(r), span(`✆ ${phoneNumberOf(r)}`)],
            form({ method: 'GET', action: '/phone' },
              ...keep(),
              input({ type: 'hidden', name: 'dial', value: dial }),
              button({ type: 'submit', name: 'key', value: `remove:${i}`, class: 'phone-recipient-remove', title: i18n.phoneDialRemove }, '✕')
            )
          ))
        ) : null
      ),
      form({ method: 'POST', action: '/phone/call', class: 'phone-dial-call' },
        input({ type: 'hidden', name: 'compose', value: '1' }),
        input({ type: 'hidden', name: 'to', value: callTo }),
        button({ type: 'submit', class: 'pm-btn', ...(callTo ? {} : { disabled: true }) }, `✆ ${String(i18n.phoneCallButton).toUpperCase()}`)
      )
    )
  );
};

const renderRecords = (pams) =>
  div({ class: 'phone-block' },
    h2(i18n.phonePamTitle),
    pams.length
      ? div({ class: 'message-list' },
          ...pams.map(m => div({ class: 'pm-card normal-pm phone-record' },
            table({ class: 'pm-info-table' },
              tr(td({ class: 'card-label' }, i18n.pmFromLabel || 'From:'), td({ class: 'card-value' }, userLink(m.from))),
              tr(td({ class: 'card-label' }, i18n.privateDate || 'Date'), td({ class: 'card-value' }, moment(m.sentAt).format('YYYY/MM/DD HH:mm:ss'))),
              tr(
                td({ class: 'card-label' }, i18n.phoneDuration),
                td({ class: 'card-value pm-subject-cell' },
                  span(clock(m.durationSec * 1000)),
                  m.heard ? null : span({ class: 'pm-exposition-chip pm-unread-chip' }, span({ class: 'pm-exposition-text' }, i18n.phoneNew))
                )
              ),
              tr(td({ class: 'card-label' }, i18n.pmEncryptionLabel || 'Encryption'), td({ class: 'card-value pm-encryption-cell' }, renderEncryptedChip(i18n)))
            ),
            audio({ controls: true, preload: 'none', src: `/phone/pam/${encodeURIComponent(m.key)}/audio` }),
            div({ class: 'pm-actions' },
              renderCallButton(m.from, { upper: true, cls: 'pm-btn' }),
              form({ method: 'POST', action: `/phone/pam/${encodeURIComponent(m.key)}/delete`, class: 'pm-action-form' },
                button({ type: 'submit', class: 'pm-btn delete-btn danger-btn' }, String(i18n.phoneDelete).toUpperCase())
              )
            )
          ))
        )
      : p({ class: 'phone-empty' }, i18n.phoneNoPams)
  );

const deleteCalls = (ids) => ids.length
  ? form({ method: 'POST', action: '/phone/delete-shown', class: 'content-action-form phone-row-delete' },
      ...ids.map(id => input({ type: 'hidden', name: 'calls', value: id })),
      button({ type: 'submit', class: 'btn-singleview btn-delete', title: i18n.phoneDelete }, '✕')
    )
  : null;

const renderLatest = (latest, canCall, history = []) =>
  div({ class: 'phone-block' },
    h2(i18n.phoneLatestTitle),
    latest.length
      ? div({ class: 'phone-contacts' },
          ...latest.map(c => div({ class: 'phone-contact phone-latest-row' },
            span({ class: 'phone-dir', title: c.dir === 'out' ? i18n.phoneOutgoing : i18n.phoneIncoming }, c.dir === 'out' ? '↗' : '↙'),
            userLink(c.id),
            span({ class: 'date-link' }, moment(c.startedAt).format('YYYY/MM/DD HH:mm')),
            canCall ? renderCallButton(c.id) : null,
            deleteCalls(history.filter(h => peersOf(h).includes(c.id)).map(h => h.id))
          ))
        )
      : p({ class: 'phone-empty' }, i18n.phoneNoHistory)
  );

const renderHistory = (items) =>
  div({ class: 'phone-block' },
    h2(i18n.phoneHistoryTitle),
    items.length
      ? table({ class: 'phone-history' },
          tr(th(''), th(i18n.phoneWith), th(i18n.phoneResult), th(i18n.phoneWhen), th(i18n.phoneDuration), th('')),
          ...items.map(h => tr(
            td({ class: 'phone-dir', title: h.dir === 'out' ? i18n.phoneOutgoing : i18n.phoneIncoming }, h.dir === 'out' ? '↗' : '↙'),
            td({ 'data-label': i18n.phoneWith }, ...linkList(peersOf(h))),
            td({ 'data-label': i18n.phoneResult }, (OUTCOME_LABEL[h.outcome] || OUTCOME_LABEL.failed)()),
            td({ 'data-label': i18n.phoneWhen }, moment(h.startedAt).format('YYYY/MM/DD HH:mm')),
            td({ 'data-label': i18n.phoneDuration }, h.answeredAt ? clock(h.endedAt - h.answeredAt) : '—'),
            td({ class: 'phone-row-actions' }, deleteCalls([h.id]))
          ))
        )
      : p({ class: 'phone-empty' }, i18n.phoneNoHistory)
  );

exports.phoneView = ({ available = false, state = null, pams = [], history = [], latest = [], q = '', filter = 'all', compose = {}, now = Date.now(), refused = [] } = {}) => {
  const qNorm = String(q || '').trim().toLowerCase();
  const matchId = (id) => !qNorm || [id, userLinkLabel(id)].some(v => String(v || '').toLowerCase().includes(qNorm));
  const isMissed = (h) => h.dir === 'in' && h.outcome === 'missed';
  const counts = {
    all: pams.length + history.length,
    records: pams.length,
    missed: history.filter(isMissed).length,
    incoming: history.filter(h => h.dir === 'in').length,
    outgoing: history.filter(h => h.dir === 'out').length
  };
  const records = pams.filter(m => matchId(m.from));
  const calls = history.filter(h => peersOf(h).some(matchId));
  const shownCalls = filter === 'missed' ? calls.filter(isMissed)
    : filter === 'incoming' ? calls.filter(h => h.dir === 'in')
    : filter === 'outgoing' ? calls.filter(h => h.dir === 'out')
    : calls;
  const showRecords = filter === 'all' || filter === 'records';
  const showCalls = filter === 'all' || filter === 'missed' || filter === 'incoming' || filter === 'outgoing';
  const unheard = showRecords ? records.filter(m => !m.heard).map(m => m.key) : [];
  const deletable = [...(showRecords ? records.map(m => m.key) : []), ...(showCalls ? shownCalls.map(h => h.id) : [])];
  const canCall = available && !state;
  const empty = counts.all === 0;
  const filterBtn = (value, label, count) =>
    !empty && (value === 'all' || count > 0 || filter === value)
      ? button({ type: 'submit', name: 'filter', value, class: filter === value ? 'filter-btn active' : 'filter-btn' }, `${String(label).toUpperCase()} (${count})`)
      : null;

  return template(
    i18n.phoneTitle,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(i18n.phoneTitle),
        p(i18n.phoneDescription),
        renderEncryptedChip(i18n)
      ),
      available ? null : div({ class: 'pm-form-error-msg' }, p('✗ ' + i18n.phoneUnavailable)),
      refused.length ? div({ class: 'phone-refused' }, span(i18n.phoneRefusedNotice), ' ', ...linkList(refused)) : null,
      state ? renderCallPanel(state, now) : null,
      div({ class: 'filters' },
        form({ method: 'GET', action: '/phone' },
          filterBtn('all', i18n.allButton || 'ALL', counts.all),
          filterBtn('records', i18n.phonePamTitle, counts.records),
          filterBtn('missed', i18n.phoneOutcomeMissed, counts.missed),
          filterBtn('incoming', i18n.phoneIncoming, counts.incoming),
          filterBtn('outgoing', i18n.phoneOutgoing, counts.outgoing),
          canCall ? button({ type: 'submit', name: 'filter', value: 'create', class: 'create-button' }, i18n.phoneCreateButton) : null
        )
      ),
      (filter === 'create' || empty) ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        (unheard.length || deletable.length) ? div({ class: 'pm-exposition inbox-exposition' },
          span({ class: 'inbox-filters-label' }, i18n.inboxFiltersLabel || 'Filters:'),
          unheard.length ? form({ method: 'POST', action: '/phone/heard-all', class: 'inbox-vis-toggle' },
            ...unheard.map(k => input({ type: 'hidden', name: 'keys', value: k })),
            button({ type: 'submit', class: 'btn' }, `${i18n.inboxMarkAllRead} (${unheard.length})`)
          ) : null,
          deletable.length ? form({ method: 'POST', action: '/phone/delete-shown', class: 'inbox-vis-toggle inbox-bulk-delete' },
            ...(showRecords ? records.map(m => input({ type: 'hidden', name: 'keys', value: m.key })) : []),
            ...(showCalls ? shownCalls.map(h => input({ type: 'hidden', name: 'calls', value: h.id })) : []),
            button({ type: 'submit', class: 'btn delete-btn' }, `${String(i18n.inboxDeleteShown).toUpperCase()} (${deletable.length})`)
          ) : null
        ) : null,
        form({ method: 'GET', action: '/phone', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'text', name: 'q', value: String(q || ''), placeholder: i18n.phoneSearchPlaceholder, class: 'filter-box__input' }),
          button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
        )
      ),
      filter === 'create' && canCall ? renderCompose(compose) : null,
      showRecords ? renderRecords(records) : null,
      filter === 'all' ? renderLatest(latest.filter(c => matchId(c.id)), canCall, history) : null,
      showCalls ? renderHistory(shownCalls) : null
    )
  );
};
