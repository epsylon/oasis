const { form, button, div, h2, p, section, input, label, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

const crypto = require('crypto');

function generateRandomPassword(length = 32) {
  return crypto.randomBytes(length).toString('hex').slice(0, length); 
}

const legacyView = async () => {
  const randomPassword = generateRandomPassword();

  const header = div({ class: 'tags-header' },
    h2(i18n.legacyTitle),
    p(i18n.legacyDescription)
  );

  return template(
    i18n.legacyTitle,
    section(
      header,
      p({ id: "randomPassword" }, h2({ class: "generated-password" }, randomPassword)),
      div({ class: "div-center legacy-section" },
        p(i18n.exportDescription),
        form(
          {
            action: "/legacy/export",
            method: "POST",
            id: "exportForm"
          },
          label(i18n.exportPasswordLabel),
          input({
            type: "password",
            name: "password",
            id: "password",
            required: true,
            placeholder: i18n.exportPasswordPlaceholder,
            minlength: 32
          }),
          p({ class: "file-info" }, i18n.fileInfo),
          button({ type: "submit" }, i18n.legacyExportButton)
        ),
        br,
        p(i18n.importDescription),
        form(
          { action: "/legacy/import", method: "POST", enctype: "multipart/form-data" },
          input({ type: "file", name: "uploadedFile", required: true }),
          br,
          p(i18n.passwordImport),
          input({
            type: "password",
            name: "importPassword",
            required: true,
            placeholder: i18n.importPasswordPlaceholder,
            minlength: 32
          }),
          br,
          button({ type: "submit" }, i18n.legacyImportButton)
        )
      )
    )
  );
};

exports.legacyView = legacyView;
