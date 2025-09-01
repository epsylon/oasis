const { div, h2, p, section, button, form, input, textarea, br, label, pre } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

exports.pmView = async (initialRecipients = '', initialSubject = '', initialText = '', showPreview = false) => {
  const title = i18n.pmSendTitle;
  const description = i18n.pmDescription;
  const textLen = (initialText || '').length;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      ),
      section(
        div({ class: "pm-form" },
          form({ method: "POST", action: "/pm", id: "pm-form" },
            label({ for: "recipients" }, i18n.pmRecipients),
            br(),
            input({
              type: "text",
              name: "recipients",
              placeholder: i18n.pmRecipientsHint,
              required: true,
              value: initialRecipients
            }),
            br(),
            label({ for: "subject" }, i18n.pmSubject),
            br(),
            input({ type: "text", name: "subject", placeholder: i18n.pmSubjectHint, value: initialSubject }),
            br(),
            label({ for: "text" }, i18n.pmText),
            br(),
            textarea({ name: "text", rows: "6", cols: "50", id: "pm-text", maxlength: "8096" }, initialText),
		div({ class: "pm-actions-block" },
		  div({ class: "pm-actions" },
		    button({ type: "submit", formaction: "/pm/preview", formmethod: "POST" }, i18n.pmPreview),
		    button({ type: "submit", class: "btn-compact" }, i18n.pmSend)
		  )
		)
          ),
          showPreview
            ? div({ id: "pm-preview-area", class: "pm-preview" },
                h2(i18n.pmPreviewTitle),
                p({ id: "pm-preview-count", class: "pm-preview-count" }, `${textLen}/8096`),
                div({ id: "pm-preview-content", class: "pm-preview-content" },
                  pre({ class: "pm-pre" }, initialText || '')
                )
              )
            : null
        )
      )
    )
  );
};
