const { form, button, div, h2, h3, p, section, select, option, input, br, a, label, span, img, strong } = require("../server/node_modules/hyperaxe");
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');
const { template, selectedLanguage, i18n, setLanguage } = require('./main_views');
const i18nBase = require("../client/assets/translations/i18n");
const { WORKFLOWS, currentWorkflow } = require('../models/workflows_model');

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

const settingsView = ({ version, aiPrompt, fediverseAccount, fediverseError, telegramAccount = null, telegramLogin = null, telegramError = "" }) => {
  const currentThemeConfig = getThemeConfig();
  const theme = currentThemeConfig.themes?.current || "Dark-SNH";
  const currentConfig = getConfig();
  let serverConfig = {};
  try { serverConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../configs/server-config.json'), 'utf8')); } catch (_) {}
  const currentHops = (serverConfig.friends && Number.isFinite(serverConfig.friends.hops)) ? serverConfig.friends.hops : 2;
  const walletUrl = currentConfig.wallet.url;
  const walletUser = currentConfig.wallet.user;
  const walletFee = currentConfig.wallet.fee;
  const currentWish = currentConfig.wish === 'mutuals' ? 'mutuals' : 'whole';
  const currentPmVisibility = currentConfig.pmVisibility === 'mutuals' ? 'mutuals' : 'whole';

  const themeElements = [
    option({ value: "Dark-SNH", ...(theme === "Dark-SNH" ? true : undefined ? { selected: true } : {})}, "Dark-SNH"),
    option({ value: "Clear-SNH", ...(theme === "Clear-SNH" ? true : undefined ? { selected: true } : {})}, "Clear-SNH"),
    option({ value: "Purple-SNH", ...(theme === "Purple-SNH" ? true : undefined ? { selected: true } : {})}, "Purple-SNH"),
    option({ value: "Matrix-SNH", ...(theme === "Matrix-SNH" ? true : undefined ? { selected: true } : {})}, "Matrix-SNH"),
    option({ value: "OasisMobile", ...(theme === "OasisMobile" ? true : undefined ? { selected: true } : {})}, "Oasis-Mobile")
  ];

  const activeWorkflow = currentWorkflow(currentConfig) || '';
  const modOn = (name) => (currentConfig.modules || {})[`${name}Mod`] === 'on';

  const workflowSection = section(
    div({ class: "tags-header" },
      h2(i18n.workflowsTitle),
      p(i18n.workflowsDescription),
      form(
        { action: "/settings/workflow", method: "POST" },
        select({ name: "workflow" },
          ...WORKFLOWS.map(w => activeWorkflow === w.key
            ? option({ value: w.key, selected: true }, i18n[`workflow_${w.key}`])
            : option({ value: w.key }, i18n[`workflow_${w.key}`]))
        ),
        br(), br(),
        button({ type: "submit" }, i18n.workflowsSet)
      )
    )
  );

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
        h2(i18n.language),
        p(i18n.languageDescription),
        form(
          { action: "/language", method: "post" },
          select({ name: "language" }, [
            languageOption("English", "en"),
            languageOption("Español", "es"),
            languageOption("Français", "fr"),
            languageOption("Euskara", "eu"),
            languageOption("Deutsch", "de"),
            languageOption("Italiano", "it"),
            languageOption("Português", "pt"),
            languageOption("中文", "zh"),
            languageOption("العربية", "ar"),
            languageOption("हिन्दी", "hi"),
            languageOption("Русский", "ru")
          ]),
          br(),
          br(),
          button({ type: "submit" }, i18n.setLanguage)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.uxModeTitle || "UX"),
        p(i18n.uxModeDescription || "Select which UX navigation mode you want for your GUI."),
        form(
          { action: "/settings/ux", method: "POST" },
          (() => {
            const aiNavEnabled = currentConfig.modules && currentConfig.modules.aiNavMod === 'on';
            const chatsEnabled = currentConfig.modules && currentConfig.modules.chatsMod === 'on';
            const cur = currentConfig.ux?.current === "ainav" ? "ainav" : currentConfig.ux?.current === "chats" ? "chats" : currentConfig.ux?.current === "feed" ? "feed" : "blocks";
            const uxCard = (value, title, image) => label({ class: "welcome-ux-option" },
              input({ type: "radio", name: "ux", value, ...(cur === value ? { checked: true } : {}) }),
              img({ src: image, class: "welcome-ux-shot", alt: title }),
              span({ class: "welcome-ux-label" }, title)
            );
            return div({ class: "welcome-ux-grid" },
              uxCard("blocks", i18n.uxModeMenus || "Blocks", "/assets/images/ux-blocks.png"),
              aiNavEnabled ? uxCard("ainav", i18n.uxModeAINav || "AI", "/assets/images/ux-ainav.png") : null,
              chatsEnabled ? uxCard("chats", i18n.uxModeChats || "Conversations", "/assets/images/ux-chats.png") : null,
              uxCard("feed", i18n.uxModeFeed || "Microblogging", "/assets/images/ux-feed.png")
            );
          })(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    workflowSection,
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
        h2(i18n.homePageTitle),
        p(i18n.homePageDescription),
        form(
          { action: "/settings/home-page", method: "POST" },
          select({ name: "homePage" },
            ...[
              { value: "activity", label: i18n.activityTitle },
              { value: "ai", label: i18n.aiTitle, mod: "ai" },
              { value: "trending", label: i18n.trendingTitle, mod: "trending" },
              { value: "forum", label: i18n.forumTitle, mod: "forum" },
              { value: "feed", label: i18n.feedTitle, mod: "feed" },
              { value: "chats", label: i18n.chatsTitle, mod: "chats" },
              { value: "inbox", label: i18n.inbox },
              { value: "mentions", label: i18n.mentions },
              { value: "agenda", label: i18n.agendaTitle, mod: "agenda" },
              { value: "market", label: i18n.marketTitle, mod: "market" },
              { value: "favorites", label: i18n.favoritesTitle, mod: "favorites" }
            ].filter(o => !o.mod || modOn(o.mod)).map(o => currentConfig.homePage === o.value
              ? option({ value: o.value, selected: true }, o.label)
              : option({ value: o.value }, o.label))
          ),
          br(), br(),
          button({ type: "submit" }, i18n.saveHomePage)
        )
      )
    ),
    modOn('ai') ? section(
      div({ class: "tags-header" },
        h2(i18n.aiTitle),
        p(i18n.aiSettingsDescription),
        form(
          { action: "/settings/ai", method: "POST" },
          input({
            type: "text",
            id: "ai_prompt",
            name: "ai_prompt",
            placeholder: aiPrompt,
            value: aiPrompt,
            maxlength: "128",
            required: true
          }), br(),
          label({ for: "aiSuggestions", class: "lan-checkbox-label" },
            input({
              type: "checkbox",
              id: "aiSuggestions",
              name: "ai_suggestions",
              value: "on",
              class: "lan-checkbox-input",
              checked: currentConfig.ai?.suggestions !== false ? true : undefined
            }),
            span({ class: "lan-checkbox-text" }, i18n.aiSuggestionsEnable)
          ),
          br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ) : null,
    section(
      div({ class: "tags-header" },
      h2(i18n.ssbLogStream),
      p(i18n.ssbLogStreamDescription),
      form(
        { action: "/settings/ssb-logstream", method: "POST" },
        input({
          type: "number",
          id: "ssb_log_limit",
          name: "ssb_log_limit",
          min: 1,
          max: 100000,
          value: currentConfig.ssbLogStream?.limit || 1000
        }), br(),br(),
        button({ type: "submit" }, i18n.saveSettings)
      )
     )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.settingsReplicationTitle || 'Replication'),
        p(i18n.settingsReplicationDesc || 'Configure the number of hops your peer follows out from your own feed when replicating content.'),
        form(
          { action: "/settings/replication", method: "POST" },
          label({ for: "replication_hops" }, i18n.settingsReplicationHopsLabel || 'Hops'),
          br(),
          input({
            type: "number",
            id: "replication_hops",
            name: "hops",
            min: 0,
            max: 6,
            value: currentHops
          }),
          br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.settingsLanTitle || 'LAN Broadcasting'),
        p(i18n.settingsLanDesc || 'Periodically announce this peer to other Oasis instances on the same local network. Disable to stop UDP broadcasts.'),
        form(
          { action: "/settings/lan-broadcasting", method: "POST" },
          label({ for: "lanBroadcasting", class: "lan-checkbox-label" },
            input({
              type: "checkbox",
              id: "lanBroadcasting",
              name: "lanBroadcasting",
              value: "on",
              class: "lan-checkbox-input",
              checked: currentConfig.lanBroadcasting !== false ? true : undefined
            }),
            span({ class: "lan-checkbox-text" }, i18n.settingsLanEnable || 'Enable LAN broadcasting')
          ),
          br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.settingsWishTitle),
        p(i18n.settingsWishDesc),
        form(
          { action: "/settings/wish", method: "POST" },
          select({ name: "wish" },
            option({ value: "whole", ...(currentWish === "whole" ? true : undefined ? { selected: true } : {})}, i18n.settingsWishWhole),
            option({ value: "mutuals", ...(currentWish === "mutuals" ? true : undefined ? { selected: true } : {})}, i18n.settingsWishMutuals),
            option({ value: "only-lan", ...(currentWish === "only-lan" ? true : undefined ? { selected: true } : {})}, i18n.settingsWishOnlyLan || "Only LAN")
          ), br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    section(
      div({ class: "tags-header" },
        h2(i18n.settingsPmVisibilityTitle),
        p(i18n.settingsPmVisibilityDesc),
        form(
          { action: "/settings/pm-visibility", method: "POST" },
          select({ name: "pmVisibility" },
            option({ value: "whole", ...(currentPmVisibility === "whole" ? true : undefined ? { selected: true } : {})}, i18n.settingsPmVisibilityWhole),
            option({ value: "mutuals", ...(currentPmVisibility === "mutuals" ? true : undefined ? { selected: true } : {})}, i18n.settingsPmVisibilityMutuals)
          ), br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    modOn('wallet') ? section(
      { id: "wallet" },
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
    ) : null,
    modOn('fediverse') ? section(
      { id: "multiverse" },
      div({ class: "tags-header" },
        h2(i18n.fediverseSettingsTitle),
        div({ class: "fediverse-network" },
          h3("Mastodon"),
          p(i18n.fediverseTokenHelp),
          fediverseError ? p({ class: "fediverse-error" }, i18n[fediverseError] || i18n.fediverseError) : "",
          fediverseAccount
            ? (() => {
                const host = String(fediverseAccount.instance || "").replace(/^https?:\/\//, "");
                const profileUrl = `${fediverseAccount.instance}/@${fediverseAccount.acct}`;
                const link = (txt) => a({ href: profileUrl, target: "_blank", rel: "noopener noreferrer" }, txt);
                return form(
                  { action: "/settings/fediverse/disconnect", method: "POST" },
                  p(
                    `${i18n.fediverseConnectedAs}: `,
                    link(`${fediverseAccount.acct}@${host}`)
                  ),
                  button({ type: "submit" }, i18n.fediverseDisconnect)
                );
              })()
            : form(
                { action: "/settings/fediverse", method: "POST" },
                label({ for: "fediverse_instance" }, i18n.fediverseInstanceLabel), br(),
                input({ type: "text", id: "fediverse_instance", name: "instance", placeholder: "mastodon.social", required: true }), br(),
                label({ for: "fediverse_token" }, i18n.fediverseTokenLabel), br(),
                input({ type: "password", id: "fediverse_token", name: "token", autocomplete: "off", required: true }), br(),
                button({ type: "submit" }, i18n.fediverseConnect)
              )
        ),
        div({ class: "fediverse-network" },
          h3("Telegram"),
          p(i18n.telegramSettingsHelp),
          telegramError ? p({ class: "fediverse-error" }, i18n[telegramError] || i18n.telegramErrConnect) : "",
          telegramAccount
            ? form(
                { action: "/settings/telegram/disconnect", method: "POST" },
                p(`${i18n.fediverseConnectedAs}: `, strong(telegramAccount.displayName || ""), telegramAccount.username ? span(` (@${telegramAccount.username})`) : ""),
                br(),
                button({ type: "submit" }, i18n.fediverseDisconnect)
              )
            : telegramLogin && telegramLogin.step === "code"
              ? form(
                  { action: "/settings/telegram/code", method: "POST" },
                  br(),
                  p(i18n.telegramCodeHelp),
                  input({ type: "text", id: "telegram_code", name: "code", autocomplete: "off", inputmode: "numeric", placeholder: "12345", required: true }), br(), br(),
                  button({ type: "submit" }, i18n.telegramVerify),
                  " ",
                  button({ type: "submit", formaction: "/settings/telegram/cancel", class: "delete-btn" }, i18n.telegramCancel)
                )
              : telegramLogin && telegramLogin.step === "password"
                ? form(
                    { action: "/settings/telegram/password", method: "POST" },
                    br(),
                    p(i18n.telegramPasswordHelp),
                    input({ type: "password", id: "telegram_password", name: "password", autocomplete: "off", required: true }), br(), br(),
                    button({ type: "submit" }, i18n.telegramVerify),
                    " ",
                    button({ type: "submit", formaction: "/settings/telegram/cancel", class: "delete-btn" }, i18n.telegramCancel)
                  )
                : form(
                    { action: "/settings/telegram/start", method: "POST" },
                    label({ for: "telegram_api_id" }, i18n.telegramApiIdLabel), br(),
                    input({ type: "text", id: "telegram_api_id", name: "apiId", inputmode: "numeric", placeholder: "12345678", required: true }), br(),
                    label({ for: "telegram_api_hash" }, i18n.fediverseTokenLabel), br(),
                    input({ type: "password", id: "telegram_api_hash", name: "apiHash", autocomplete: "off", placeholder: "0123456789abcdef0123456789abcdef", required: true }), br(),
                    label({ for: "telegram_phone" }, i18n.telegramPhoneLabel), br(),
                    input({ type: "tel", id: "telegram_phone", name: "phone", placeholder: "+34 60000000", required: true }), br(), br(),
                    button({ type: "submit" }, i18n.fediverseConnect)
                  )
        )
      )
    ) : null,
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

