const { div, h2, p, section, button, form, textarea, br, span } = require("../server/node_modules/hyperaxe");
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
            }, i18n.aiClearHistory || 'Clear chat history')
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
            br(),br(),
            div({ class: 'user-question', style: 'margin-bottom: 0.75em;' },
              h2(`${i18n.aiUserQuestion}:`),
              p( ...renderUrl(entry.question))
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
              ...entry.answer
                .split('\n\n')
                .flatMap(paragraph =>
                  paragraph
                    .split('\n')
                    .map(line =>
                      p({ style: "margin-bottom: 1.2em;" }, ...renderUrl(line.trim()))
                )
              )
            )
          )
        )
      )
    )
  );
};

