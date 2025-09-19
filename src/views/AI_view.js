const { div, h2, p, section, button, form, textarea, br, span, input } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');

exports.aiView = (history = [], userPrompt = '') => {
  return template(
    i18n.aiTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.aiTitle),
        p(i18n.aiDescription),
        userPrompt ? div({ class: 'user-prompt', style: 'margin-bottom: 2em; font-size: 0.95em; color: #888;' },
          `${i18n.aiPromptUsed || 'System Prompt'}: `,
          span({ style: 'font-style: italic;' }, `"${userPrompt}"`)
        ) : null,
        form({ method: 'POST', action: '/ai', style: "margin-bottom: 0;" },
          textarea({ name: 'input', rows: 4, placeholder: i18n.aiInputPlaceholder, required: true }),
          br(),
          div({ style: "display: flex; gap: 1.5em; justify-content: flex-end; align-items: center; margin-top: 0.7em;" },
            button({ type: 'submit' }, i18n.aiSubmitButton)
          )
        ),
        div({ style: "display: flex; justify-content: flex-end; margin-bottom: 2em;" },
          form({ method: 'POST', action: '/ai/clear', style: "display: inline;" },
            button({
              type: 'submit',
              style: `
                background: #b80c09;
                color: #fff;
                border: none;
                padding: 0.4em 1.2em;
                border-radius: 6px;
                cursor: pointer;
                font-size: 1em;
                margin-left: 1em;
              `
            }, i18n.aiClearHistory)
          )
        ),
        br(),
        ...history.map(entry =>
          div({
            class: 'chat-entry',
            style: `
              margin-bottom: 2em;
              position: relative;
              background: #191919;
              border-radius: 10px;
              box-shadow: 0 0 8px #0004;
              padding-top: 1.8em;
            `
          },
            entry.timestamp ? span({
              style: `
                position: absolute;
                top: 0.5em;
                right: 1.3em;
                font-size: 0.92em;
                color: #888;
              `
            }, new Date(entry.timestamp).toLocaleString()) : null,
            br(), br(),
            div({ class: 'user-question', style: 'margin-bottom: 0.75em;' },
              h2(`${i18n.aiUserQuestion}:`),
              p(...renderUrl(entry.question))
            ),
            div({
              class: 'ai-response',
              style: `
                max-width: 800px;
                margin: auto;
                background: #111;
                padding: 1.25em;
                border-radius: 6px;
                font-family: sans-serif;
                line-height: 1.6;
                color: #ffcc00;
              `
            },
              h2(`${i18n.aiResponseTitle}:`),
              ...String(entry.answer || '')
                .split('\n\n')
                .flatMap(paragraph =>
                  paragraph
                    .split('\n')
                    .map(line =>
                      p({ style: "margin-bottom: 1.2em;" }, ...renderUrl(line.trim()))
                    )
                )
            ),
            div({
              class: 'ai-train-bar',
              style: `
                display:flex;
                align-items:center;
                gap:12px;
                margin: 12px auto 8px auto;
                max-width: 800px;
                padding: 8px 0;
                border-top: 1px solid #2a2a2a;
                flex-wrap: wrap;
              `
            },
              Array.isArray(entry.snippets) && entry.snippets.length
                ? span({ style: 'color:#9aa; font-size:0.95em;' }, `${i18n.aiSnippetsUsed}: ${entry.snippets.length}`)
                : null,
              h2(`${i18n.statsAITraining}:`),
              entry.trainStatus === 'approved'
                ? span({ style: 'color:#5ad25a; font-weight:600;' }, i18n.aiTrainApproved)
                : entry.trainStatus === 'rejected'
                  ? span({ style: 'color:#ff6b6b; font-weight:600;' }, i18n.aiTrainRejected)
                  : null,
              entry.trainStatus === 'approved' || entry.trainStatus === 'rejected'
                ? null
                : div({ style: 'display:flex; flex-direction:column; gap:8px; width:100%;' },
                    div({ style: 'display:flex; gap:8px; flex-wrap:wrap;' },
                      form({ method: 'POST', action: '/ai/approve', style: 'display:inline-block;' },
                        input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
                        button({ type: 'submit', class: 'approve-btn', style: 'background:#1e7e34;color:#fff;border:none;padding:0.45em 0.9em;border-radius:6px;cursor:pointer;' }, i18n.aiApproveTrain)
                      ),
                      form({ method: 'POST', action: '/ai/reject', style: 'display:inline-block;' },
                        input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
                        button({ type: 'submit', class: 'reject-btn', style: 'background:#a71d2a;color:#fff;border:none;padding:0.45em 0.9em;border-radius:6px;cursor:pointer;' }, i18n.aiRejectTrain)
                      )
                    ),
                    form({ method: 'POST', action: '/ai/approve', style: 'display:flex; flex-direction:column; gap:6px;' },
                      input({ type: 'hidden', name: 'ts', value: String(entry.timestamp) }),
                      textarea({ name: 'custom', rows: 3, placeholder: i18n.aiCustomAnswerPlaceholder, style: 'width:100%;' }),
                      button({ type: 'submit', class: 'approve-custom-btn', style: 'align-self:flex-start;background:#0d6efd;color:#fff;border:none;padding:0.45em 0.9em;border-radius:6px;cursor:pointer;' }, i18n.aiApproveCustomTrain)
                    )
                  )
            )
          )
        )
      )
    )
  );
};
