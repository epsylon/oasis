const { div, h2, p, section, button, form, input, textarea, br, label, pre, span, strong, a } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');

exports.pmView = async (initialRecipients = '', initialSubject = '', initialText = '', showPreview = false, sentKey = '', crypterError = false, crypterPreview = null, recipientError = false, fileError = '', fileSharePreview = null) => {
  const title = i18n.pmSendTitle;
  const description = i18n.pmDescription;
  const textLen = (initialText || '').length;

  const fileErrorText = {
    recipient: i18n.pmInvalidRecipients || 'Invalid Oasis ID',
    mutual: i18n.fileShareMutualError || 'You can only share files with habitants with mutual support.',
    nofile: i18n.fileShareNoFile || 'No file selected.',
    size: i18n.fileShareTooLarge || 'The file exceeds the allowed size.',
    failed: i18n.fileShareFailed || 'Could not prepare the file.',
    send: i18n.fileShareSendError || 'Could not send the file.'
  }[fileError] || '';

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
          h2({ class: "pm-section-title" }, i18n.pmComposeTitle || 'Send a message'),
          form({ method: "POST", action: "/pm/preview", id: "pm-form" },
            input({
              type: "text",
              name: "recipients",
              placeholder: `${i18n.pmRecipientsHint}. ${i18n.pmLimitsHint}`,
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
            textarea({ name: "text", rows: "6", cols: "50", id: "pm-text", maxlength: "8096", placeholder: i18n.pmTextPlaceholder || '' }, initialText),
            div({ class: "pm-crypter-row" },
              label({ for: "pm-crypter" },
                input({ type: "checkbox", name: "crypter", value: "1", id: "pm-crypter", ...(crypterPreview ? { checked: true } : {}) }),
                renderDoubleEncryptionChip(i18n)
              )
            ),
		div({ class: "pm-actions-block" },
		  div({ class: "pm-actions" },
		    button({ type: "submit", class: "pm-btn" }, i18n.pmPreview),
		    button({ type: "reset", class: "pm-btn danger-btn" }, i18n.pmReset || 'Reset')
		  )
		)
          ),
          showPreview
            ? (crypterPreview
                ? div({ class: "pm-preview pm-crypter-preview" },
                    div({ class: "title-with-chip" }, h2(i18n.pmPreviewTitle), renderEncryptedChip(i18n)),
                    p({ class: "pm-preview-count" }, `${(initialText || '').length} ${i18n.pmCrypterCharsLabel}`),
                    div({ class: "pm-preview-content" }, pre({ class: "pm-pre" }, initialText || '')),
                    div({ class: "title-with-chip" }, h2(i18n.pmCrypterCipherLabel), renderDoubleEncryptionChip(i18n)),
                    p({ class: "pm-key-hint" }, i18n.pmSharedKeyHint),
                    div({ class: "pm-sent-key" },
                      input({ type: "text", readonly: true, value: crypterPreview.key, class: "pm-sent-key-value" })
                    ),
                    p({ class: "pm-preview-count" }, `${(crypterPreview.cipher || '').length} ${i18n.pmCrypterCharsLabel}`),
                    div({ class: "pm-preview-content" }, pre({ class: "pm-pre" }, crypterPreview.cipher || '')),
                    form({ method: "POST", action: "/pm", class: "pm-crypter-send-form" },
                      input({ type: "hidden", name: "recipients", value: initialRecipients }),
                      input({ type: "hidden", name: "subject", value: initialSubject }),
                      input({ type: "hidden", name: "text", value: initialText }),
                      input({ type: "hidden", name: "crypter", value: "1" }),
                      input({ type: "hidden", name: "crypterKey", value: crypterPreview.key }),
                      input({ type: "hidden", name: "precomputed", value: crypterPreview.cipher }),
                      div({ class: "pm-actions" },
                        button({ type: "submit", class: "pm-btn" }, i18n.pmSend),
                        a({ href: "/pm", class: "pm-btn danger-btn" }, i18n.pmCancel || 'Cancel')
                      )
                    )
                  )
                : div({ id: "pm-preview-area", class: "pm-preview" },
                    div({ class: "title-with-chip" }, h2(i18n.pmPreviewTitle), renderEncryptedChip(i18n)),
                    p({ id: "pm-preview-count", class: "pm-preview-count" }, `${textLen}/8096`),
                    div({ id: "pm-preview-content", class: "pm-preview-content" },
                      pre({ class: "pm-pre" }, initialText || '')
                    ),
                    form({ method: "POST", action: "/pm", class: "pm-send-form" },
                      input({ type: "hidden", name: "recipients", value: initialRecipients }),
                      input({ type: "hidden", name: "subject", value: initialSubject }),
                      input({ type: "hidden", name: "text", value: initialText }),
                      div({ class: "pm-actions" },
                        button({ type: "submit", class: "pm-btn" }, i18n.pmSend),
                        a({ href: "/pm", class: "pm-btn danger-btn" }, i18n.pmCancel || 'Cancel')
                      )
                    )
                  ))
            : null
        )
      ),
      section({ id: "fileshare" },
        div({ class: "pm-form pm-fileshare-form-wrap" },
          h2({ class: "pm-section-title" }, i18n.fileShareTitle || 'Share a file'),
          fileErrorText ? div({ class: "pm-form-error-msg" }, p('✗ ' + fileErrorText)) : null,
          form({ method: "POST", action: "/pm/file/preview#fileshare", enctype: "multipart/form-data", class: "pm-fileshare-form" },
            input({ id: "fs-recipient", type: "text", name: "recipient", placeholder: i18n.fileShareRecipientPlaceholder || 'Enter Oasis ID (@....ed25519)', required: true, value: initialRecipients, maxlength: "120" }),
            br(),
            label({ for: "fs-subject" }, i18n.pmSubject),
            br(),
            input({ id: "fs-subject", type: "text", name: "subject", placeholder: i18n.pmSubjectHint, value: initialSubject, maxlength: "150" }),
            br(),
            label({ for: "fs-file" }, i18n.fileShareFileLabel || 'File'),
            br(),
            input({ id: "fs-file", type: "file", name: "file", required: true }),
            div({ class: "pm-crypter-row" },
              label({ for: "fs-crypter" },
                input({ type: "checkbox", name: "crypter", value: "1", id: "fs-crypter", ...(fileSharePreview && fileSharePreview.crypter ? { checked: true } : {}) }),
                renderDoubleEncryptionChip(i18n)
              )
            ),
            div({ class: "pm-actions-block" },
              div({ class: "pm-actions" },
                button({ type: "submit", class: "pm-btn" }, i18n.pmPreview),
                button({ type: "reset", class: "pm-btn danger-btn" }, i18n.pmReset || 'Reset')
              )
            )
          ),
          fileSharePreview
            ? div({ class: "pm-preview pm-fileshare-preview" },
                div({ class: "title-with-chip" }, h2(i18n.pmPreviewTitle), renderEncryptedChip(i18n)),
                fileSharePreview.crypter
                  ? div(
                      div({ class: "title-with-chip" }, h2(i18n.pmCrypterCipherLabel), renderDoubleEncryptionChip(i18n)),
                      p({ class: "pm-key-hint" }, i18n.pmSharedKeyHint),
                      div({ class: "pm-sent-key" }, input({ type: "text", readonly: true, value: fileSharePreview.sharedKey, class: "pm-sent-key-value" }))
                    )
                  : null,
                div({ class: "pm-fileshare-info" },
                  span({ class: "pm-fileshare-icon" }, '📎'),
                  span({ class: "pm-fileshare-name" }, String(fileSharePreview.filename || 'file')),
                  span({ class: "pm-fileshare-meta" }, `${fileSharePreview.sizeLabel || ''} · ${String(fileSharePreview.mime || 'application/octet-stream')}`)
                ),
                form({ method: "POST", action: "/pm/file", class: "pm-fileshare-send-form" },
                  input({ type: "hidden", name: "recipient", value: fileSharePreview.recipient }),
                  input({ type: "hidden", name: "subject", value: fileSharePreview.subject || '' }),
                  input({ type: "hidden", name: "manifestBlobId", value: fileSharePreview.manifestBlobId }),
                  input({ type: "hidden", name: "keyHex", value: fileSharePreview.keyHex }),
                  input({ type: "hidden", name: "filename", value: fileSharePreview.filename || 'file' }),
                  input({ type: "hidden", name: "mime", value: fileSharePreview.mime || 'application/octet-stream' }),
                  input({ type: "hidden", name: "size", value: String(fileSharePreview.size || 0) }),
                  fileSharePreview.crypter ? input({ type: "hidden", name: "crypter", value: "1" }) : null,
                  fileSharePreview.crypter ? input({ type: "hidden", name: "sharedKey", value: fileSharePreview.sharedKey }) : null,
                  div({ class: "pm-actions" },
                    button({ type: "submit", class: "pm-btn" }, i18n.pmSend),
                    a({ href: "/pm", class: "pm-btn danger-btn" }, i18n.pmCancel || 'Cancel')
                  )
                )
              )
            : null
        )
      )
    )
  );
};
