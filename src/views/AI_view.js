const { div, h2, p, section, button, form, textarea, span, input, br } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n, userLinkLabel } = require('./main_views');
const config = require('../server/ssb_config');
const { renderStyledText } = require('../backend/renderStyledText');

const statusBanner = (status) => {
  if (!status) return null;
  if (status.installed === false || /model_missing/.test(String(status.error || ''))) {
    return div({ class: 'ai-status ai-status-missing' }, i18n.aiStatusMissingModel);
  }
  if (status.error && !/model_missing/.test(String(status.error))) {
    return div({ class: 'ai-status ai-status-loading' }, `${i18n.aiServerError} (${status.error})`);
  }
  return null;
};

const renderAnswerText = (text) => {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines.flatMap((line, i) => (i > 0 ? [br()] : []).concat(renderStyledText(line)));
};

const myNick = () => { try { return userLinkLabel(config.keys.id); } catch (_) { return '@me'; } };

const ratingRow = (entry) => {
  if (entry.source !== 'model') return null;
  const rating = Math.max(0, Math.min(5, Number(entry.rating) || 0));
  if (entry.trainStatus === 'approved') {
    return div({ class: 'ai-rating ai-rating-done', title: i18n.aiTrainApproved },
      span({ class: 'ai-stars-static' }, '★'.repeat(rating || 5) + '☆'.repeat(5 - (rating || 5))),
      span({ class: 'ai-rating-label' }, i18n.aiTrainApproved)
    );
  }
  return form({ method: 'POST', action: '/ai/approve', class: 'ai-rating ai-stars', title: i18n.aiApproveTrain },
    input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
    ...[5, 4, 3, 2, 1].map(n => button({ type: 'submit', name: 'rating', value: String(n), class: 'ai-star-btn', title: `${n} ★` }, '★'))
  );
};

const SPLIT_MARKER = '<span id="oasis-ai-split"></span>';

const stateChip = (kind) => span({ class: `pm-exposition-chip ai-chip ai-chip-${kind}` },
  span({ class: 'pm-exposition-icon' }, kind === 'thinking' ? '⏳' : '🤖'),
  span({ class: 'pm-exposition-text' }, kind === 'thinking' ? i18n.aiThinking : i18n.aiWaiting)
);


const renderEntry = (entry, { split = false } = {}) => {
  const time = entry.timestamp ? moment(entry.timestamp).format("YYYY/MM/DD HH:mm") : '';
  const thinking = entry.trainStatus === 'thinking';
  return [
    div({ class: 'chat-bubble-row ai-row' },
      div({ class: 'chat-message ai-bubble-user' },
        span({ class: 'chat-bubble-sender' }, myNick()),
        div({ class: 'chat-message-text' }, ...renderStyledText(String(entry.question || ''))),
        span({ class: 'chat-bubble-time' }, time)
      )
    ),
    thinking ? stateChip('thinking') : null,
    split ? span({ id: 'oasis-ai-split' }) : null,
    thinking ? null : div({ class: 'chat-bubble-row chat-bubble-row-self ai-row' },
      div({ class: `chat-message chat-message-self ai-bubble-42 ai-bubble-${entry.source || 'model'}` },
        span({ class: 'chat-bubble-sender chat-bubble-sender-owner' }, '🤖 42'),
        div({ class: 'chat-message-text' }, ...renderAnswerText(entry.answer)),
        span({ class: 'chat-bubble-time' }, time),
        ratingRow(entry)
      )
    )
  ];
};

exports.aiView = (history = [], userPrompt = '', { status = null, split = false } = {}) => {
  const ordered = [...history].reverse();
  const thinking = ordered.length ? ordered[ordered.length - 1].trainStatus === 'thinking' : false;
  return template(
    i18n.aiTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.aiTitle),
        p(i18n.aiDescription)
      ),
      statusBanner(status),
      div({ class: 'chat-workspace ai-workspace' },
        ordered.length ? div({ class: 'chat-messages-list ai-messages-list' }, ...ordered.flatMap((e, i) => renderEntry(e, { split: split && i === ordered.length - 1 }))) : null,
        thinking ? null : div({ class: 'chat-message-form ai-message-form' },
          form({ id: 'ai-prompt-form', method: 'POST', action: '/ai', class: 'ai-prompt-form' },
            textarea({ maxlength: "5000", name: 'input', rows: 3, placeholder: i18n.aiInputPlaceholder, required: true })
          ),
          div({ class: 'ai-submit-row' },
            stateChip('waiting'),
            button({ type: 'submit', form: 'ai-prompt-form' }, i18n.aiSubmitButton),
            ordered.length ? form({ method: 'POST', action: '/ai/clear', class: 'ai-clear-form' },
              button({ type: 'submit', class: 'ai-clear-btn' }, i18n.aiClearHistory)
            ) : null
          )
        )
      )
    )
  );
};

exports.SPLIT_MARKER = SPLIT_MARKER;
