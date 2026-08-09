const { form, button, div, h2, p, section, table, tr, td, input, a, br, ul, li, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');
const { MOBILE_MODULES, ALL_MODULES } = require('../models/workflows_model');

const modulesView = () => {
  const config = getConfig().modules;
  const modules = [
    { name: 'agenda', label: i18n.modulesAgendaLabel, description: i18n.modulesAgendaDescription },
    { name: 'ai', label: i18n.modulesAILabel, description: i18n.modulesAIDescription },
    { name: 'aiNav', label: i18n.modulesAINavLabel, description: i18n.modulesAINavDescription },
    { name: 'audios', label: i18n.modulesAudiosLabel, description: i18n.modulesAudiosDescription },
    { name: 'banking', label: i18n.modulesBankingLabel, description: i18n.modulesBankingDescription },
    { name: 'bookmarks', label: i18n.modulesBookmarksLabel, description: i18n.modulesBookmarksDescription },
    { name: 'calendars', label: i18n.modulesCalendarsLabel, description: i18n.modulesCalendarsDescription },
    { name: 'chats', label: i18n.modulesChatsLabel, description: i18n.modulesChatsDescription },
    { name: 'cipher', label: i18n.modulesCipherLabel, description: i18n.modulesCipherDescription },
    { name: 'courts', label: i18n.modulesCourtsLabel, description: i18n.modulesCourtsDescription },
    { name: 'dev', label: i18n.modulesDevLabel, description: i18n.modulesDevDescription },
    { name: 'docs', label: i18n.modulesDocsLabel, description: i18n.modulesDocsDescription },
    { name: 'events', label: i18n.modulesEventsLabel, description: i18n.modulesEventsDescription },
    { name: 'favorites', label: i18n.modulesFavoritesLabel, description: i18n.modulesFavoritesDescription },
    { name: 'blogs', label: i18n.modulesBlogsLabel, description: i18n.modulesBlogsDescription },
    { name: 'fediverse', label: i18n.modulesFediverseLabel, description: i18n.modulesFediverseDescription },
    { name: 'feed', label: i18n.modulesFeedLabel, description: i18n.modulesFeedDescription },
    { name: 'forum', label: i18n.modulesForumLabel, description: i18n.modulesForumDescription },
    { name: 'games', label: i18n.modulesGamesLabel, description: i18n.modulesGamesDescription },
    { name: 'graphos', label: i18n.modulesGraphosLabel, description: i18n.modulesGraphosDescription },
    { name: 'housing', label: i18n.modulesHousingLabel, description: i18n.modulesHousingDescription },
    { name: 'images', label: i18n.modulesImagesLabel, description: i18n.modulesImagesDescription },
    { name: 'industry', label: i18n.modulesIndustryLabel, description: i18n.modulesIndustryDescription },
    { name: 'invites', label: i18n.modulesInvitesLabel, description: i18n.modulesInvitesDescription },
    { name: 'jobs', label: i18n.modulesJobsLabel, description: i18n.modulesJobsDescription },
    { name: 'larp', label: i18n.modulesLarpLabel, description: i18n.modulesLarpDescription },
    { name: 'legacy', label: i18n.modulesLegacyLabel, description: i18n.modulesLegacyDescription },
    { name: 'logs', label: i18n.modulesLogsLabel, description: i18n.modulesLogsDescription },
    { name: 'maps', label: i18n.modulesMapLabel, description: i18n.modulesMapDescription },
    { name: 'market', label: i18n.modulesMarketLabel, description: i18n.modulesMarketDescription },
    { name: 'melody', label: i18n.modulesMelodyLabel, description: i18n.modulesMelodyDescription },
    { name: 'opinions', label: i18n.modulesOpinionsLabel, description: i18n.modulesOpinionsDescription },
    { name: 'pads', label: i18n.modulesPadsLabel, description: i18n.modulesPadsDescription },
    { name: 'parliament', label: i18n.modulesParliamentLabel, description: i18n.modulesParliamentDescription },
    { name: 'pixelia', label: i18n.modulesPixeliaLabel, description: i18n.modulesPixeliaDescription },
    { name: 'polls', label: i18n.modulesPollsLabel, description: i18n.modulesPollsDescription },
    { name: 'projects', label: i18n.modulesProjectsLabel, description: i18n.modulesProjectsDescription },
    { name: 'reports', label: i18n.modulesReportsLabel, description: i18n.modulesReportsDescription },
    { name: 'shops', label: i18n.modulesShopsLabel, description: i18n.modulesShopsDescription },
    { name: 'tags', label: i18n.modulesTagsLabel, description: i18n.modulesTagsDescription },
    { name: 'tasks', label: i18n.modulesTasksLabel, description: i18n.modulesTasksDescription },
    { name: 'torrents', label: i18n.modulesTorrentsLabel, description: i18n.modulesTorrentsDescription },
    { name: 'transfers', label: i18n.modulesTransfersLabel, description: i18n.modulesTransfersDescription },
    { name: 'trending', label: i18n.modulesTrendingLabel, description: i18n.modulesTrendingDescription },
    { name: 'tribes', label: i18n.modulesTribesLabel, description: i18n.modulesTribesDescription },
    { name: 'videos', label: i18n.modulesVideosLabel, description: i18n.modulesVideosDescription },
    { name: 'votes', label: i18n.modulesVotationsLabel, description: i18n.modulesVotationsDescription },
    { name: 'wallet', label: i18n.modulesWalletLabel, description: i18n.modulesWalletDescription }
  ];

  const moduleStates = modules.reduce((acc, mod) => {
    acc[`${mod.name}Mod`] = config[`${mod.name}Mod`] === 'on' ? 'on' : 'off';
    return acc;
  }, {});

  const activeModulesCount = modules.filter(mod => moduleStates[`${mod.name}Mod`] === 'on').length;
  const totalModulesCount = modules.length;
  const disabledModulesCount = totalModulesCount - activeModulesCount;

  const header = div({ class: 'tags-header' },
    h2(i18n.modulesViewTitle),
    p(i18n.modulesViewDescription),
    div({ class: 'modules-counts' },
      `${i18n.modulesTotalModulesLabel}: `,
      strong({ class: 'modules-count-value' }, totalModulesCount),
      ul({ class: 'modules-count-list' },
        li({ class: 'modules-count-item' },
          `${i18n.modulesEnabledModulesLabel}: `,
          span({ class: 'modules-count-value' }, activeModulesCount)
        ),
        li({ class: 'modules-count-item' },
          `${i18n.modulesDisabledModulesLabel}: `,
          span({ class: 'modules-count-value' }, disabledModulesCount)
        )
      )
    )
  );

  const PRESETS = {
    minimal: ['feed', 'forum', 'games', 'images', 'videos', 'audios', 'bookmarks', 'tags', 'trending', 'blogs', 'polls', 'opinions', 'cipher', 'legacy'],
    social: ['agenda', 'audios', 'bookmarks', 'calendars', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'images', 'invites', 'larp', 'legacy', 'logs', 'maps', 'blogs', 'polls', 'opinions', 'pads', 'parliament', 'pixelia', 'melody', 'projects', 'reports', 'tags', 'tasks', 'trending', 'tribes', 'videos', 'votes'],
    economy: ['agenda', 'audios', 'bookmarks', 'calendars', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'images', 'invites', 'larp', 'legacy', 'logs', 'maps', 'blogs', 'polls', 'opinions', 'pads', 'parliament', 'pixelia', 'melody', 'projects', 'reports', 'tags', 'tasks', 'trending', 'tribes', 'videos', 'votes', 'banking', 'wallet', 'transfers', 'market', 'housing', 'jobs', 'shops', 'industry'],
    mobile: MOBILE_MODULES,
    full: ALL_MODULES
  };

  const presetButtons = div({ class: 'preset-group' },
    Object.entries(PRESETS).map(([key, mods]) => {
      const presetLabel = (i18n[`modulesPreset_${key}`] || key).toUpperCase();
      const isActive = modules.every(m => mods.includes(m.name) === (moduleStates[`${m.name}Mod`] === 'on'));
      return form({ action: "/modules/preset", method: "post", class: "modules-preset-form" },
        input({ type: "hidden", name: "preset", value: key }),
        button({
          type: 'submit',
          class: isActive ? 'filter-btn active' : 'filter-btn',
        }, presetLabel)
      );
    })
  );

  return template(
    i18n.modules,
    section(header),
    section(
      h2(i18n.modulesPresetTitle || "Common Configurations"),
      presetButtons,
      form(
        { action: "/save-modules", method: "post" },
        table(
          { class: "module-table" },
          tr(
            td(i18n.modulesModuleName),
            td(i18n.modulesModuleDescription),
            td({ class: 'module-status-cell' }, i18n.modulesModuleStatus)
          ),
          modules.map(mod => 
            tr(
              td(a({ href: `/${mod.name}` }, mod.label)),
              td(p(mod.description)),
              td(
                input({
                  type: "checkbox",
                  id: `${mod.name}Mod`,
                  name: `${mod.name}Form`,
                  class: "input-checkbox",
                  value: 'on',
                  checked: moduleStates[`${mod.name}Mod`] === 'on' ? true : undefined
                })
              )
            )
          )
        ),
        div(
          { class: "save-button-container" },
          button({ type: "submit", class: "submit-button" }, i18n.saveSettings)
        )
      )
    )
  );
};

exports.modulesView = modulesView;

