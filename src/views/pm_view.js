const { div, h2, p, section, button, form, input, textarea, br, label } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

exports.pmView = async () => {
  const title = i18n.pmSendTitle;
  const description = i18n.pmDescription;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      ),
      section(
        div({ class: "pm-form" },
          form({ method: "POST", action: "/pm" },
            label({ for: "recipients" }, i18n.pmRecipients),
            br(),
            input({ type: "text", name: "recipients", placeholder: i18n.pmRecipientsHint, required: true }),
            br(),
            label({ for: "subject" }, i18n.pmSubject),
            br(),
            input({ type: "text", name: "subject", placeholder: i18n.pmSubjectHint }),
            br(),
            label({ for: "text" }, i18n.pmText),
            br(),
            textarea({ name: "text", rows: "6", cols: "50" }),
            br(), br(),
            button({ type: "submit" }, i18n.pmSend)
          )
        )
      )
    )
  );
};
