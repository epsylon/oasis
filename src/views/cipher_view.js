const { form, button, div, h2, p, section, textarea, label, input, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const crypto = require('crypto');

function generateRandomPassword(length = 32) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

const cipherView = async (encryptedText = "", decryptedText = "", iv = "", password = "") => {
  const randomPassword = generateRandomPassword();

  const header = div({ class: "tags-header" },
    h2(i18n.cipherTitle),
    p(i18n.cipherDescription)
  );

  const encryptForm = form(
    { action: "/cipher/encrypt", method: "POST", id: "encryptForm" },
    textarea({
      name: "text",
      id: "text",
      required: true,
      placeholder: i18n.cipherTextPlaceholder,
      rows: 4
    }),
    br,
    label(i18n.cipherPasswordLabel),
    br,
    input({
      type: "password",
      name: "password",
      id: "password",
      required: true,
      placeholder: i18n.cipherPasswordPlaceholder,
      minlength: 32
    }),
    br,
    button({ type: "submit" }, i18n.cipherEncryptButton)
  );

  const decryptForm = form(
    { action: "/cipher/decrypt", method: "POST", id: "decryptForm" },
    textarea({
      name: "encryptedText",
      id: "encryptedText",
      required: true,
      placeholder: i18n.cipherEncryptedTextPlaceholder,
      rows: 4,
      value: encryptedText
    }),
    br,
    label(i18n.cipherPasswordLabel),
    br,
    input({
      type: "password",
      name: "password",
      id: "password",
      required: true,
      placeholder: i18n.cipherPasswordPlaceholder,
      minlength: 32
    }),
    br,
    button({ type: "submit" }, i18n.cipherDecryptButton)
  );

  const encryptResult = encryptedText 
    ? div({ class: "cipher-result visible encrypted-result" }, 
        label(i18n.cipherEncryptedMessageLabel),
        br,br,
        div({ class: "cipher-text" }, encryptedText),
        label(i18n.cipherPasswordUsedLabel),
        br,br,
        div({ class: "cipher-text" }, password) 
      )
    : null;

  const decryptResult = decryptedText 
    ? div({ class: "cipher-result visible decrypted-result" }, 
        label(i18n.cipherDecryptedMessageLabel),
        br,br,
        div({ class: "cipher-text" }, decryptedText) 
      )
    : null;

  return template(
    i18n.cipherTitle,
    section(
      header,
      div({ id: "randomPassword" },
        h2({ class: "generated-password" }, randomPassword)
      ),
      div({ class: "div-center" },
        encryptForm,
        br,
        encryptResult, 
        decryptForm,
        br,
        decryptResult 
      )
    )
  );
};

exports.cipherView = cipherView;

