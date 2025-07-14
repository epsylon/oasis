const { form, button, div, h2, p, section, select, option, input, br, a, label } = require("../server/node_modules/hyperaxe");
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');
const { template, selectedLanguage, i18n, setLanguage } = require('./main_views');
const i18nBase = require("../client/assets/translations/i18n");

const snhUrl = "https://wiki.solarnethub.com/socialnet/overview";

const themeFilePath = path.join(__dirname, '../configs/oasis-config.json');
const getThemeConfig = () => {
  try {
    const configData = fs.readFileSync(themeFilePath);
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading config file:', error);
    return {};
  }
};

const settingsView = ({ version }) => {
  const currentThemeConfig = getThemeConfig();
  const theme = currentThemeConfig.themes?.current || "Dark-SNH";
  const currentConfig = getConfig();
  const walletUrl = currentConfig.wallet.url;
  const walletUser = currentConfig.wallet.user;
  const walletFee = currentConfig.wallet.feee;

  const themeElements = [
    option({ value: "Dark-SNH", selected: theme === "Dark-SNH" ? true : undefined }, "Dark-SNH"),
    option({ value: "Clear-SNH", selected: theme === "Clear-SNH" ? true : undefined }, "Clear-SNH"),
    option({ value: "Purple-SNH", selected: theme === "Purple-SNH" ? true : undefined }, "Purple-SNH"),
    option({ value: "Matrix-SNH", selected: theme === "Matrix-SNH" ? true : undefined }, "Matrix-SNH")
  ];

  const languageOption = (longName, shortName) => {
    return shortName === selectedLanguage
      ? option({ value: shortName, selected: true }, longName)
      : option({ value: shortName }, longName);
  };

  const rebuildButton = form(
    { action: "/settings/rebuild", method: "post" },
    button({ type: "submit" }, i18n.rebuildName)
  );

  const updateFlagPath = path.join(__dirname, '../server/.update_required');
  let updateButton = null;
  if (fs.existsSync(updateFlagPath)) {
    updateButton = form(
      { action: "/update", method: "post" },
      button({ type: "submit" }, i18n.updateit)
    );
  }

  return template(
    i18n.settings,
    section(
      div({ class: "tags-header" },
        h2(i18n.settings),
        p(a({ href: snhUrl, target: "_blank" }, i18n.settingsIntro({ version }))),
        updateButton
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.theme),
        p(i18n.themeIntro),
        form(
          { action: "/settings/theme", method: "post" },
          select({ name: "theme" }, ...themeElements),
          br(),
          br(),
          button({ type: "submit" }, i18n.setTheme)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.language),
        p(i18n.languageDescription),
        form(
          { action: "/language", method: "post" },
          select({ name: "language" }, [
            languageOption("English", "en"),
            languageOption("Castellano", "es"),
            languageOption("Euskara", "eu")
          ]),
          br(),
          br(),
          button({ type: "submit" }, i18n.setLanguage)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.wallet),
	p(
	  i18n.walletSettingsDescription, " ",
	  a({ href: "docs/ecoin.md", target: "_blank", rel: "noopener" }, `[${i18n.walletSettingsDocLink}]`)
	),
        form(
          { action: "/settings/wallet", method: "POST" },
          label({ for: "wallet_url" }, i18n.walletAddress), br(),
          input({ type: "text", id: "wallet_url", name: "wallet_url", placeholder: walletUrl, value: walletUrl }), br(),
          label({ for: "wallet_user" }, i18n.walletUser), br(),
          input({ type: "text", id: "wallet_user", name: "wallet_user", placeholder: walletUser, value: walletUser }), br(),
          label({ for: "wallet_pass" }, i18n.walletPass), br(),
          input({ type: "password", id: "wallet_pass", name: "wallet_pass" }), br(),
          label({ for: "wallet_fee" }, i18n.walletFee), br(),
          input({ type: "text", id: "wallet_fee", name: "wallet_fee", placeholder: walletFee, value: walletFee }), br(),
          button({ type: "submit" }, i18n.walletConfiguration)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.indexes),
        p(i18n.indexesDescription),
        rebuildButton
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.exportDataTitle),
        p(i18n.exportDataDescription),
        form(
          { action: "/export/create", method: "POST", id: "exportForm" },
          button({ type: "submit" }, i18n.exportDataButton)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.panicMode),
        p(i18n.removeDataDescription),
        form(
          { action: "/panic/remove", method: "POST", id: "removeForm" },
          button({ type: "submit" }, i18n.removePanicButton)
        )
      )
    )
  );
};

exports.settingsView = settingsView;

