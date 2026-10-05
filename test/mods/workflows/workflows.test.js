const { eq, ok, notOk } = require('../../helpers/assert');

const workflows = require('../../../src/models/workflows_model');

const modulesConfigFor = (names) =>
  Object.fromEntries(workflows.ALL_MODULES.map(m => [`${m}Mod`, names.includes(m) ? 'on' : 'off']));

describe('workflows: presets of theme and modules', (t) => {
  t('every workflow names modules that exist and only mobile uses the phone theme', () => {
    ok(workflows.WORKFLOWS.length > 0, 'there is at least one workflow');
    for (const w of workflows.WORKFLOWS) {
      const unknown = w.modules.filter(m => !workflows.ALL_MODULES.includes(m));
      eq(unknown.length, 0, `${w.key} only names known modules (got ${unknown})`);
      ok(w.theme, `${w.key} has a theme`);
      if (w.key !== 'mobile') ok(w.theme !== 'OasisMobile', `${w.key} uses a desktop theme`);
      ok(workflows.modulesOf(w).length > 0, `${w.key} leaves something enabled`);
    }
    eq(workflows.getWorkflow('mobile').theme, 'OasisMobile', 'the mobile workflow brings the phone theme');
  });

  t('applying a workflow is what the config would look like afterwards', () => {
    const night = workflows.getWorkflow('night');
    const config = { themes: { current: night.theme }, modules: modulesConfigFor(workflows.modulesOf(night)) };
    eq(workflows.currentWorkflow(config), 'night', 'the active workflow is recognised');

    config.themes.current = 'Clear-SNH';
    notOk(workflows.currentWorkflow(config), 'a different theme is no longer that workflow');
  });

  t('a configuration nobody set matches no workflow', () => {
    const config = { themes: { current: 'Dark-SNH' }, modules: modulesConfigFor(workflows.ALL_MODULES) };
    notOk(workflows.currentWorkflow(config), 'having everything on is not a workflow');
  });

  t('the mobile preset carries the whole network group and no heavy modules', () => {
    const unknown = workflows.MOBILE_MODULES.filter(m => !workflows.ALL_MODULES.includes(m));
    eq(unknown.length, 0, `the mobile preset only names known modules (got ${unknown})`);
    for (const m of ['feed', 'blogs', 'tags', 'trending', 'opinions', 'pads', 'forum', 'maps', 'chats']) {
      ok(workflows.MOBILE_MODULES.includes(m), `network keeps ${m}`);
    }
    for (const m of ['ai', 'dev', 'industry']) {
      notOk(workflows.MOBILE_MODULES.includes(m), `${m} stays out of a phone`);
    }
  });
});

describe('workflows: the welcome guide', (t) => {
  t('full experience comes first and every option resolves to a configuration', () => {
    eq(workflows.WIZARD_WORKFLOWS[0], 'full');
    for (const k of workflows.WIZARD_WORKFLOWS) ok(workflows.wizardWorkflow(k), `${k} can be applied`);
    eq(workflows.wizardWorkflow('nonsense'), null, 'unknown choices change nothing');
  });

  t('full experience turns every module on and keeps the look and home page', () => {
    const cfg = { themes: { current: 'Clear-SNH' }, homePage: 'feed', modules: modulesConfigFor(['feed', 'chats']) };
    workflows.applyWorkflow(cfg, workflows.wizardWorkflow('full'));
    ok(workflows.ALL_MODULES.every(m => cfg.modules[`${m}Mod`] === 'on'), 'everything is on');
    eq(cfg.themes.current, 'Clear-SNH');
    eq(cfg.homePage, 'feed');
  });

  t('a configuration turns on exactly its modules and brings its look and home page', () => {
    const cfg = { themes: { current: 'Dark-SNH' }, homePage: 'feed', modules: modulesConfigFor(workflows.ALL_MODULES) };
    const activists = workflows.wizardWorkflow('activists');
    workflows.applyWorkflow(cfg, activists);
    const on = workflows.ALL_MODULES.filter(m => cfg.modules[`${m}Mod`] === 'on');
    eq(on.join(','), workflows.modulesOf(activists).join(','));
    eq(cfg.themes.current, activists.theme);
    eq(cfg.homePage, activists.homePage);
    eq(workflows.currentWorkflow(cfg), 'activists', 'and it is recognised afterwards');
  });
});

