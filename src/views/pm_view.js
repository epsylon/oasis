const { div, h2, p, section, button, form, input, textarea, br, label, pre, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');

exports.pmView = async (initialRecipients = '', initialSubject = '', initialText = '', showPreview = false, sentKey = '', crypterError = false, crypterPreview = null, recipientError = false) => {
  const title = i18n.pmSendTitle;
  const description = i18n.pmDescription;
  const textLen = (initialText || '').length;

  const { renderEncryptedChip, renderDoubleEncryptionChip } = require('./clearnet_view');
  return template(
    title,
    section(
      div({ class: "tags-header" },
        div({ class: "title-with-chip" }, h2(title), renderEncryptedChip(i18n)),
        p(description)
      ),
      crypterError
        ? div({ class: "pm-form-error-msg" }, p('✗ ' + i18n.pmCrypterTooLong))
        : null,
      recipientError
        ? div({ class: "pm-form-error-msg" }, p('✗ ' + i18n.pmInvalidRecipients))
        : null,
      sentKey
        ? div({ class: "pm-sent-key" },
            input({ type: "text", readonly: true, value: sentKey, class: "pm-sent-key-value" })
          )
        : null,
      section(
        div({ class: "pm-form" },
          form({ method: "POST", action: "/pm", id: "pm-form" },
            label({ for: "recipients" }, i18n.pmLimitsHint),
            br(),
            input({
              type: "text",
              name: "recipients",
              placeholder: i18n.pmRecipientsHint,
              required: true,
              value: initialRecipients,
              maxlength: "511"
            }),
            br(),
            label({ for: "subject" }, i18n.pmSubject),
            br(),
            input({ type: "text", name: "subject", placeholder: i18n.pmSubjectHint, value: initialSubject, maxlength: "150" }),
            br(),
            label({ for: "text" }, i18n.pmText),
            br(),
            textarea({ name: "text", rows: "6", cols: "50", id: "pm-text", maxlength: "8096" }, initialText),
            div({ class: "pm-crypter-row" },
              label({ for: "pm-crypter" },
                input({ type: "checkbox", name: "crypter", value: "1", id: "pm-crypter" }),
                renderDoubleEncryptionChip(i18n)
              )
            ),
		div({ class: "pm-actions-block" },
		  div({ class: "pm-actions" },
		    button({ type: "submit", formaction: "/pm/preview", formmethod: "POST" }, i18n.pmPreview),
		    button({ type: "submit", class: "btn-compact" }, i18n.pmSend)
		  )
		)
          ),
          showPreview
            ? (crypterPreview
                ? div({ class: "pm-preview pm-crypter-preview" },
                    div({ class: "title-with-chip" }, h2(i18n.pmPreviewTitle), renderEncryptedChip(i18n)),
                    p({ class: "pm-preview-count" }, `${(initialText || '').length} ${i18n.pmCrypterCharsLabel}`),
                    div({ class: "pm-preview-content" }, pre({ class: "pm-pre" }, initialText || '')),
                    div({ class: "pm-sent-key" },
                      input({ type: "text", readonly: true, value: crypterPreview.key, class: "pm-sent-key-value" })
                    ),
                    div({ class: "title-with-chip" }, h2(i18n.pmCrypterCipherLabel), renderDoubleEncryptionChip(i18n)),
                    p({ class: "pm-preview-count" }, `${(crypterPreview.cipher || '').length} ${i18n.pmCrypterCharsLabel}`),
                    div({ class: "pm-preview-content" }, pre({ class: "pm-pre" }, crypterPreview.cipher || '')),
                    form({ method: "POST", action: "/pm", class: "pm-crypter-send-form" },
                      input({ type: "hidden", name: "recipients", value: initialRecipients }),
                      input({ type: "hidden", name: "subject", value: initialSubject }),
                      input({ type: "hidden", name: "text", value: initialText }),
                      input({ type: "hidden", name: "crypter", value: "1" }),
                      input({ type: "hidden", name: "crypterKey", value: crypterPreview.key }),
                      input({ type: "hidden", name: "precomputed", value: crypterPreview.cipher }),
                      button({ type: "submit", class: "btn-compact" }, i18n.pmSend)
                    )
                  )
                : div({ id: "pm-preview-area", class: "pm-preview" },
                    div({ class: "title-with-chip" }, h2(i18n.pmPreviewTitle), renderEncryptedChip(i18n)),
                    p({ id: "pm-preview-count", class: "pm-preview-count" }, `${textLen}/8096`),
                    div({ id: "pm-preview-content", class: "pm-preview-content" },
                      pre({ class: "pm-pre" }, initialText || '')
                    )
                  ))
            : null
        )
      )
    )
  );
};
