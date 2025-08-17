const { form, button, div, h2, p, section, table, tr, td, input, a, br, ul, li, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');

const modulesView = () => {
  const config = getConfig().modules;
  const modules = [
    { name: 'agenda', label: i18n.modulesAgendaLabel, description: i18n.modulesAgendaDescription },
    { name: 'ai', label: i18n.modulesAILabel, description: i18n.modulesAIDescription },
    { name: 'audios', label: i18n.modulesAudiosLabel, description: i18n.modulesAudiosDescription },
    { name: 'banking', label: i18n.modulesBankingLabel, description: i18n.modulesBankingDescription },
    { name: 'bookmarks', label: i18n.modulesBookmarksLabel, description: i18n.modulesBookmarksDescription },
    { name: 'cipher', label: i18n.modulesCipherLabel, description: i18n.modulesCipherDescription },
    { name: 'docs', label: i18n.modulesDocsLabel, description: i18n.modulesDocsDescription },
    { name: 'events', label: i18n.modulesEventsLabel, description: i18n.modulesEventsDescription },
    { name: 'feed', label: i18n.modulesFeedLabel, description: i18n.modulesFeedDescription },
    { name: 'forum', label: i18n.modulesForumLabel, description: i18n.modulesForumDescription },
    { name: 'governance', label: i18n.modulesGovernanceLabel, description: i18n.modulesGovernanceDescription },
    { name: 'images', label: i18n.modulesImagesLabel, description: i18n.modulesImagesDescription },
    { name: 'invites', label: i18n.modulesInvitesLabel, description: i18n.modulesInvitesDescription },
    { name: 'jobs', label: i18n.modulesJobsLabel, description: i18n.modulesJobsDescription },
    { name: 'legacy', label: i18n.modulesLegacyLabel, description: i18n.modulesLegacyDescription },
    { name: 'latest', label: i18n.modulesLatestLabel, description: i18n.modulesLatestDescription },
    { name: 'market', label: i18n.modulesMarketLabel, description: i18n.modulesMarketDescription },
    { name: 'multiverse', label: i18n.modulesMultiverseLabel, description: i18n.modulesMultiverseDescription },
    { name: 'opinions', label: i18n.modulesOpinionsLabel, description: i18n.modulesOpinionsDescription },
    { name: 'pixelia', label: i18n.modulesPixeliaLabel, description: i18n.modulesPixeliaDescription },
    { name: 'projects', label: i18n.modulesProjectsLabel, description: i18n.modulesProjectsDescription },
    { name: 'popular', label: i18n.modulesPopularLabel, description: i18n.modulesPopularDescription },
    { name: 'reports', label: i18n.modulesReportsLabel, description: i18n.modulesReportsDescription },
    { name: 'summaries', label: i18n.modulesSummariesLabel, description: i18n.modulesSummariesDescription },
    { name: 'tags', label: i18n.modulesTagsLabel, description: i18n.modulesTagsDescription },
    { name: 'tasks', label: i18n.modulesTasksLabel, description: i18n.modulesTasksDescription },
    { name: 'threads', label: i18n.modulesThreadsLabel, description: i18n.modulesThreadsDescription },
    { name: 'transfers', label: i18n.modulesTransfersLabel, description: i18n.modulesTransfersDescription },
    { name: 'trending', label: i18n.modulesTrendingLabel, description: i18n.modulesTrendingDescription },
    { name: 'tribes', label: i18n.modulesTribesLabel, description: i18n.modulesTribesDescription },
    { name: 'videos', label: i18n.modulesVideosLabel, description: i18n.modulesVideosDescription },
    { name: 'wallet', label: i18n.modulesWalletLabel, description: i18n.modulesWalletDescription },
    { name: 'topics', label: i18n.modulesTopicsLabel, description: i18n.modulesTopicsDescription }
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
    div({ style: 'margin-bottom:16px;' },
      `${i18n.modulesTotalModulesLabel}: `,
      strong({ style: 'color:#888;' }, totalModulesCount),
      ul({ style: 'list-style-type:none; padding:0; margin:0;' },
        li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
          `${i18n.modulesEnabledModulesLabel}: `,
          span({ style: 'color:#888;' }, activeModulesCount)
        ),
        li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
          `${i18n.modulesDisabledModulesLabel}: `,
          span({ style: 'color:#888;' }, disabledModulesCount)
        )
      )
    )
  );

  return template(
    i18n.modules,
    section(header),
    section(
      form(
        { action: "/save-modules", method: "post" },
        table(
          { class: "module-table" },
          tr(
            td(i18n.modulesModuleName),
            td(i18n.modulesModuleDescription),
            td({ style: 'text-align: center;' }, i18n.modulesModuleStatus)
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
          { class: "save-button-container", style: "margin-top: 20px; text-align: center;" },
          button({ type: "submit", class: "submit-button" }, i18n.saveSettings)
        )
      )
    )
  );
};

exports.modulesView = modulesView;

