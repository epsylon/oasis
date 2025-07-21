const { div, h2, p, section, button, form, textarea, br, span } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

exports.aiView = (response = '', userQuestion = '') => {
  return template(
    i18n.aiTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.aiTitle),
        p(i18n.aiDescription),
        form({ method: 'POST', action: '/ai' },
          textarea({ name: 'input', placeholder: i18n.aiInputPlaceholder, required: true }),
          br(),
          button({ type: 'submit' }, i18n.aiSubmitButton)
        ),
        br(),
        userQuestion ? div({ class: 'user-question' },
          h2(`${i18n.aiUserQuestion}:`),
          userQuestion
        ) : null,

        response ? div({ class: 'ai-response' },
          h2(`${i18n.aiResponseTitle}:`),
          response
        ) : null
      )
    )
  );
};
