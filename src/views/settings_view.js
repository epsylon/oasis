const { form, button, div, h2, h3, p, section, select, option, input, br, a, label, span, img, strong, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe");
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');
const { template, selectedLanguage, i18n, setLanguage, INBOX_BOT_ORDER, inboxBotLabel } = require('./main_views');
const i18nBase = require("../client/assets/translations/i18n");
const { WORKFLOWS, currentWorkflow } = require('../models/workflows_model');
const { renderVerificationReport, renderRebuildReport } = require('./backup_view');

const snhUrl = "https://wiki.solarnethub.com/socialnet/overview";
const BLOB_CACHE_OPTIONS = [512, 1024, 2048, 5120, 10240, 0];
const sizeLabel = (bytes) => {
  let value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};
const blobCacheOptionLabel = (mb) => mb === 0 ? i18n.settingsBlobCacheUnlimited : (mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`);

const themeFilePath = require('../configs/config-manager').configFilePath;
const getThemeConfig = () => {
  try {
    const configData = fs.readFileSync(themeFilePath);
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading config file:', error);
    return {};
  }
};

const settingsView = ({ version, aiPrompt, aiExportCount = 0, blobCache = null, fediverseAccount, telegramAccount = null, telegramLogin = null, peertubeAccount = null, verification = null, rebuild = null }) => {
  const currentThemeConfig = getThemeConfig();
  const theme = currentThemeConfig.themes?.current || "Dark-SNH";
  const currentConfig = getConfig();
  let serverConfig = {};
  try { serverConfig = require('../configs/config-manager.js').readServerConfig(); } catch (_) {}
  const currentHops = (serverConfig.friends && Number.isFinite(serverConfig.friends.hops)) ? serverConfig.friends.hops : 2;
  const walletUrl = currentConfig.wallet.url;
  const walletUser = currentConfig.wallet.user;
  const walletFee = currentConfig.wallet.fee;
  const currentWish = ['mutuals', 'only-lan', 'local'].includes(currentConfig.wish) ? currentConfig.wish : 'whole';
  const currentPmVisibility = currentConfig.pmVisibility === 'mutuals' ? 'mutuals' : 'whole';
  const currentPhone = currentConfig.phone && typeof currentConfig.phone === 'object' ? currentConfig.phone : {};

  const themeElements = [
    option({ value: "Dark-SNH", ...(theme === "Dark-SNH" ? { selected: true } : {})}, "Dark-SNH"),
    option({ value: "Clear-SNH", ...(theme === "Clear-SNH" ? { selected: true } : {})}, "Clear-SNH"),
    option({ value: "Purple-SNH", ...(theme === "Purple-SNH" ? { selected: true } : {})}, "Purple-SNH"),
    option({ value: "Matrix-SNH", ...(theme === "Matrix-SNH" ? { selected: true } : {})}, "Matrix-SNH"),
    option({ value: "OasisMobile", ...(theme === "OasisMobile" ? { selected: true } : {})}, "Oasis-Mobile")
  ];

  const activeWorkflow = currentWorkflow(currentConfig) || '';
  const modOn = (name) => (currentConfig.modules || {})[`${name}Mod`] === 'on';

  const workflowSection = section({ id: "workflows" },
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

  const updateInfo = (() => { try { return require('../backend/updater').readUpdateInfo(); } catch (_) { return null; } })();
  let updatePanel = null;
  if (updateInfo) {
    const d = updateInfo.details || {};
    const day = (iso) => String(iso || '').slice(0, 10);
    const versionLine = (v, c) => `${v || '?'}${c ? ` · ${c.hash} · ${day(c.date)}` : ''}`;
    const row = (name, ...value) => tr(td({ class: "tribe-info-label" }, name), td({ class: "tribe-info-value" }, ...value));
    updatePanel = section({ id: "update" },
      div({ class: "torrent-download update-panel" },
        div({ class: "torrent-oasis torrent-detail-section" },
          h3({ class: "torrent-section-title" }, i18n.notifyUpdateLabel),
          table({ class: "tribe-info-table torrent-file-info" },
            row(i18n.updateInstalledLabel, versionLine(updateInfo.installedVersion, d.installed)),
            row(i18n.updateAvailableLabel, versionLine(updateInfo.version, d.available)),
            Array.isArray(d.commits) && d.commits.length
              ? row(i18n.updateChangesLabel, ul({ class: "update-changes" },
                  ...d.commits.map(c => li(`${day(c.date)} · ${c.subject}`)),
                  d.count > d.commits.length ? li(`+${d.count - d.commits.length}`) : null))
              : null,
            d.files ? row(i18n.updateFilesLabel, `${d.files} · +${d.insertions} −${d.deletions}`) : null,
            d.origin ? row(i18n.updateOriginLabel, span({ class: "bank-address-code" }, d.origin)) : null
          ),
          form({ action: "/update", method: "post" },
            button({ type: "submit", class: "filter-btn" }, `\u2B07 OASIS${updateInfo.version ? ` ${updateInfo.version}` : ''}`)
          )
        )
      )
    );
  }

  return template(
    i18n.settings,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.settings),
        p(i18n.settingsDescription)
      )
    ),
    updatePanel,
    section({ id: "language" },
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
            languageOption("Català", "ca"),
            languageOption("Galego", "gl"),
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
    section({ id: "ux" },
      div({ class: "tags-header" },
        h2(i18n.uxModeTitle || "UX"),
        p(i18n.uxModeDescription || "Select which UX navigation mode you want for your GUI."),
        form(
          { action: "/settings/ux", method: "POST" },
          (() => {
            const aiNavEnabled = currentConfig.modules && currentConfig.modules.aiNavMod === 'on';
            const chatsEnabled = currentConfig.modules && currentConfig.modules.chatsMod === 'on';
            const phoneEnabled = !!(currentConfig.modules && currentConfig.modules.phoneMod !== 'off');
            const cur = currentConfig.ux?.current === "ainav" ? "ainav" : currentConfig.ux?.current === "chats" ? "chats" : currentConfig.ux?.current === "feed" ? "feed" : currentConfig.ux?.current === "phone" ? "phone" : "blocks";
            const uxCard = (value, title, image) => label({ class: "welcome-ux-option" },
              input({ type: "radio", name: "ux", value, ...(cur === value ? { checked: true } : {}) }),
              img({ src: image, class: "welcome-ux-shot", alt: title }),
              span({ class: "welcome-ux-label" }, title)
            );
            return div({ class: "welcome-ux-grid" },
              uxCard("blocks", i18n.uxModeMenus || "Blocks", "/assets/images/ux-blocks.png"),
              aiNavEnabled ? uxCard("ainav", i18n.uxModeAINav || "AI", "/assets/images/ux-ainav.png") : null,
              chatsEnabled ? uxCard("chats", i18n.uxModeChats || "Conversations", "/assets/images/ux-chats.png") : null,
              uxCard("feed", i18n.uxModeFeed || "Microblogging", "/assets/images/ux-feed.png"),
              phoneEnabled ? uxCard("phone", i18n.phoneTitle || "Phone", "/assets/images/ux-phone.png") : null
            );
          })(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    section({ id: "theme" },
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
    section({ id: "wish" },
      div({ class: "tags-header" },
        h2(i18n.settingsWishTitle),
        p(i18n.settingsWishDesc),
        form(
          { action: "/settings/wish", method: "POST" },
          select({ name: "wish" },
            option({ value: "whole", ...(currentWish === "whole" ? { selected: true } : {})}, i18n.settingsWishWhole),
            option({ value: "mutuals", ...(currentWish === "mutuals" ? { selected: true } : {})}, i18n.settingsWishMutuals),
            option({ value: "only-lan", ...(currentWish === "only-lan" ? { selected: true } : {})}, i18n.settingsWishOnlyLan || "Only LAN"),
            option({ value: "local", ...(currentWish === "local" ? { selected: true } : {})}, i18n.settingsWishLocal || "Local")
          ), br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    workflowSection,
    section({ id: "home-page" },
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
    modOn('ai') ? section({ id: "ai" },
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
          button({ type: "submit" }, i18n.saveSettings),
          Number(aiExportCount) > 0 ? button({ type: "submit", formaction: "/ai/export", attrs: { formmethod: "GET" }, class: "ai-export-btn" }, `${i18n.aiExportFineTuning} (${aiExportCount})`) : null
        )
      )
    ) : null,
    section({ id: "logstream" },
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
    blobCache ? section({ id: "blobcache" },
      div({ class: "tags-header" },
        h2(i18n.settingsBlobCacheTitle),
        p(i18n.settingsBlobCacheDesc),
        blobCache.usage ? p({ class: "blob-cache-usage" }, strong(`${i18n.settingsBlobCacheUsage}: `), `${sizeLabel(blobCache.usage.bytes)} · ${blobCache.usage.count} ${i18n.settingsBlobCacheFiles}`) : null,
        blobCache.cleaned !== null ? p({ class: "blob-cache-notice" }, String(i18n.settingsBlobCacheCleaned).replace('{n}', String(blobCache.cleaned)).replace('{size}', sizeLabel(blobCache.freed))) : null,
        form(
          { action: "/settings/blob-cache", method: "POST" },
          label({ for: "blob_cache_mb" }, i18n.settingsBlobCacheLimit),
          br(),
          select({ id: "blob_cache_mb", name: "blob_cache_mb" }, ...BLOB_CACHE_OPTIONS.map(mb => option({ value: String(mb), ...(mb === blobCache.maxMB ? { selected: true } : {}) }, blobCacheOptionLabel(mb)))),
          br(), br(),
          button({ type: "submit" }, i18n.saveSettings),
          blobCache.maxMB > 0 ? button({ type: "submit", formaction: "/settings/blob-cache/collect", class: "blob-cache-clean-btn" }, i18n.settingsBlobCacheCleanNow) : null
        )
      )
    ) : null,
    section({ id: "replication" },
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
    section({ id: "lan" },
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
    section({ id: "pm-visibility" },
      div({ class: "tags-header" },
        h2(i18n.settingsPmVisibilityTitle),
        p(i18n.settingsPmVisibilityDesc),
        form(
          { action: "/settings/pm-visibility", method: "POST" },
          select({ name: "pmVisibility" },
            option({ value: "whole", ...(currentPmVisibility === "whole" ? { selected: true } : {})}, i18n.settingsPmVisibilityWhole),
            option({ value: "mutuals", ...(currentPmVisibility === "mutuals" ? { selected: true } : {})}, i18n.settingsPmVisibilityMutuals)
          ), br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ),
    modOn('phone') ? section({ id: "phone" },
      div({ class: "tags-header" },
        h2(i18n.phoneTitle),
        p(i18n.phoneSettingsDesc),
        form(
          { action: "/settings/phone", method: "POST" },
          select({ name: "visibility" },
            option({ value: "whole", ...(!currentPhone.dnd && currentPhone.visibility !== "mutuals" ? { selected: true } : {})}, i18n.settingsPmVisibilityWhole),
            option({ value: "mutuals", ...(!currentPhone.dnd && currentPhone.visibility === "mutuals" ? { selected: true } : {})}, i18n.settingsPmVisibilityMutuals),
            option({ value: "dnd", ...(currentPhone.dnd ? { selected: true } : {})}, i18n.phoneDnd)
          ), br(), br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ) : null,
    modOn('inbox') ? section({ id: "inbox-bots" },
      div({ class: "tags-header" },
        h2(i18n.settingsInboxBotsTitle),
        p(i18n.settingsInboxBotsDesc),
        form(
          { action: "/settings/inbox-bots", method: "POST" },
          ...INBOX_BOT_ORDER.map(bot =>
            label({ for: `inbox-bot-${bot}`, class: "lan-checkbox-label inbox-bot-label" },
              input({
                type: "checkbox",
                id: `inbox-bot-${bot}`,
                name: "bots",
                value: bot,
                class: "lan-checkbox-input",
                checked: (Array.isArray(currentConfig.inboxMutedBots) && currentConfig.inboxMutedBots.includes(bot)) ? undefined : true
              }),
              span({ class: "lan-checkbox-text" }, inboxBotLabel(bot))
            )
          ),
          br(),
          button({ type: "submit" }, i18n.saveSettings)
        )
      )
    ) : null,
    modOn('wallet') ? section(
      { id: "wallet" },
      div({ class: "tags-header" },
        h2(i18n.wallet),
	p(
	  i18n.walletSettingsDescription
	),
        form(
          { action: "/settings/wallet", method: "POST" },
          label({ for: "wallet_url" }, i18n.walletRpcUrl), br(),
          input({ type: "text", id: "wallet_url", name: "wallet_url", placeholder: "http://localhost:7474", value: walletUrl || "http://localhost:7474" }), br(),
          label({ for: "wallet_user" }, i18n.walletUser), br(),
          input({ type: "text", id: "wallet_user", name: "wallet_user", placeholder: "ecoinrpc", value: walletUser }), br(),
          label({ for: "wallet_pass" }, i18n.walletPass), br(),
          input({ type: "password", id: "wallet_pass", name: "wallet_pass" }), br(),
          label({ for: "wallet_fee" }, i18n.walletFee), br(),
          input({ type: "text", id: "wallet_fee", name: "wallet_fee", placeholder: "5", value: walletFee || "5" }), br(),
          button({ type: "submit" }, i18n.walletConfiguration),
          walletUser ? " " : null,
          walletUser ? button({ type: "submit", class: "delete-btn", formaction: "/settings/wallet/disconnect", attrs: { formmethod: "POST" } }, i18n.walletDisconnectButton) : null
        )
      )
    ) : null,
    modOn('fediverse') ? section(
      { id: "multiverse" },
      div({ class: "tags-header" },
        h2(i18n.fediverseSettingsTitle),
        div({ class: "fediverse-network" },
          h3("Mastodon"),
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
        ,
        div({ class: "fediverse-network" },
          h3("PeerTube"),
          peertubeAccount
            ? form(
                { action: "/settings/peertube/disconnect", method: "POST" },
                p(`${i18n.fediverseConnectedAs}: `, a({ href: peertubeAccount.channelUrl || peertubeAccount.profileUrl, target: "_blank", rel: "noopener noreferrer" }, peertubeAccount.handle)),
                button({ type: "submit" }, i18n.fediverseDisconnect)
              )
            : form(
                { action: "/settings/peertube", method: "POST" },
                label({ for: "peertube_instance" }, i18n.fediverseInstanceLabel), br(),
                input({ type: "text", id: "peertube_instance", name: "instance", placeholder: "peertube.example.org", required: true }), br(),
                label({ for: "peertube_username" }, i18n.peertubeUsernameLabel), br(),
                input({ type: "text", id: "peertube_username", name: "username", autocomplete: "off", required: true }), br(),
                label({ for: "peertube_password" }, i18n.peertubePasswordLabel), br(),
                input({ type: "password", id: "peertube_password", name: "password", autocomplete: "off", required: true }), br(),
                button({ type: "submit" }, i18n.fediverseConnect)
              )
        )
      )
    ) : null,
    section({ id: "verification" },
      div({ class: "tags-header" },
        h2(i18n.verificationTitle),
        p(i18n.verificationDescription),
        form({ action: "/settings/verify", method: "post" }, button({ type: "submit" }, i18n.verificationRun)),
        verification && verification.error ? p({ class: "backup-check-bad" }, verification.error) : renderVerificationReport(verification)
      )
    ),
    section({ id: "indexes" },
      div({ class: "tags-header" },
        h2(i18n.indexes),
        p(i18n.indexesDescription),
        rebuildButton,
        renderRebuildReport(rebuild)
      )
    ),
    section({ id: "export" },
      div({ class: "tags-header" },
        h2(i18n.exportDataTitle),
        p(i18n.exportDataDescription),
        form(
          { action: "/export/create", method: "POST", id: "exportForm" },
          button({ type: "submit" }, i18n.exportDataButton)
        )
      )
    ),
    section({ id: "panic" },
      div({ class: "tags-header" },
        h2(i18n.panicMode),
        p(i18n.removeDataDescription),
        form(
          { action: "/panic/remove", method: "POST", id: "removeForm" },
          button({ type: "submit" }, i18n.removePanicButton)
        )
      )
    ),
    section({ class: "settings-anchor-space" })
  );
};

exports.settingsView = settingsView;

