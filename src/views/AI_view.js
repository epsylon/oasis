const { div, h2, p, section, button, form, textarea, br, span, input, label, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');

exports.aiView = (history = [], userPrompt = '') => {
  return template(
    i18n.aiTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.aiTitle),
        p(i18n.aiDescription),
        userPrompt ? div({ class: 'user-prompt' },
          `${i18n.aiPromptUsed || 'System Prompt'}: `,
          span({ class: 'user-prompt-text' }, `"${userPrompt}"`)
        ) : null,
        form({ method: 'POST', action: '/ai', class: 'ai-prompt-form' },
          textarea({ name: 'input', rows: 4, placeholder: i18n.aiInputPlaceholder, required: true }),
          br(),
          div({ class: 'ai-submit-row' },
            button({ type: 'submit' }, i18n.aiSubmitButton)
          )
        ),
        div({ class: 'ai-clear-row' },
          form({ method: 'POST', action: '/ai/clear', class: 'ai-clear-form' },
            button({ type: 'submit', class: 'ai-clear-btn' }, i18n.aiClearHistory)
          )
        ),
        br(),
        ...history.map(entry =>
          div({ class: 'chat-entry' },
            entry.timestamp
              ? span({ class: 'chat-entry-timestamp' }, new Date(entry.timestamp).toLocaleString())
              : null,
            br(), br(),
            div({ class: 'user-question' },
              h2(`${i18n.aiUserQuestion}:`),
              p(...renderUrl(entry.question))
            ),
            div({ class: 'ai-response' },
              h2(`${i18n.aiResponseTitle}:`),
              ...String(entry.answer || '')
                .split('\n\n')
                .flatMap(paragraph =>
                  paragraph
                    .split('\n')
                    .map(line =>
                      p(...renderUrl(line.trim()))
                    )
                )
            ),
            div({ class: 'ai-train-bar' },
              Array.isArray(entry.snippets) && entry.snippets.length
                ? span({ class: 'ai-snippets-used' }, `${i18n.aiSnippetsUsed}: ${entry.snippets.length}`)
                : null,
              h2(`${i18n.statsAITraining}:`),
              entry.trainStatus === 'approved'
                ? span({ class: 'ai-train-approved' }, i18n.aiTrainApproved)
                : entry.trainStatus === 'rejected'
                  ? span({ class: 'ai-train-rejected' }, i18n.aiTrainRejected)
                  : null,
              entry.trainStatus === 'approved' || entry.trainStatus === 'rejected'
                ? null
                : div({ class: 'ai-approve-block' },
                    form({ method: 'POST', action: '/ai/approve', class: 'ai-approve-form' },
                      input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
                      div({ class: 'ai-approve-meta' },
                        label({ class: 'ai-approve-meta-label' }, i18n.aiApproveTagsLabel || 'Tags (comma-separated)'),
                        input({ type: 'text', name: 'tags', placeholder: i18n.aiApproveTagsPlaceholder || 'e.g. oasis, governance, ecology', maxlength: '160' }),
                        label({ class: 'ai-approve-meta-label' }, i18n.aiApproveRatingLabel || 'Rating'),
                        select({ name: 'rating' },
                          option({ value: '0' }, '—'),
                          option({ value: '1' }, '★'),
                          option({ value: '2' }, '★★'),
                          option({ value: '3' }, '★★★'),
                          option({ value: '4' }, '★★★★'),
                          option({ value: '5' }, '★★★★★')
                        )
                      ),
                      textarea({ name: 'custom', rows: 3, placeholder: i18n.aiCustomAnswerPlaceholder, class: 'ai-approve-custom' }),
                      div({ class: 'ai-approve-actions' },
                        button({ type: 'submit', class: 'approve-btn' }, i18n.aiApproveTrain)
                      )
                    ),
                    form({ method: 'POST', action: '/ai/reject', class: 'ai-approve-reject' },
                      input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
                      button({ type: 'submit', class: 'reject-btn' }, i18n.aiRejectTrain)
                    )
                  )
            )
          )
        )
      )
    )
  );
};
