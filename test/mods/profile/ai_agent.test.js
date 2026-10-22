const { eq, ok, notOk } = require('../../helpers/assert');

const html = (node) => (typeof node === 'string' ? node : (node && node.outerHTML) || String(node));

describe('profile: an AI agent can say so', (t) => {
  t('the profile form carries a field a human does not see, and remembers it once checked', () => {
    const mv = require('../../../src/views/main_views');
    const i18n = require('../../../src/client/assets/translations/i18n');
    const fresh = html(mv.editProfileView({ name: 'x', description: '', visibilityPrefs: {} }));
    ok(fresh.includes('class="ai-agent-field"') && fresh.includes('name="vis_aiAgent"'), 'the hidden field is in the form');
    ok(fresh.includes(i18n[mv.getLanguage()].aiAgentFieldLabel), 'the field tells an agent what it is for');
    notOk(/name="vis_aiAgent"[^>]*checked/.test(fresh), 'unchecked by default');
    const agent = html(mv.editProfileView({ name: 'x', description: '', visibilityPrefs: { aiAgent: true } }));
    ok(/name="vis_aiAgent"[^>]*checked/.test(agent), 'checked once the profile says it is an agent');
  });

  t('a profile marked as an agent shows the green chip, the rest do not', () => {
    const mv = require('../../../src/views/main_views');
    const i18n = require('../../../src/client/assets/translations/i18n');
    const chip = html(mv.renderAiBotChip({ aiAgent: true }));
    ok(chip.includes('class="status ai-bot"') && chip.includes(i18n[mv.getLanguage()].aiBotChip), 'the chip names the agent');
    eq(mv.renderAiBotChip({ aiAgent: false }), null);
    eq(mv.renderAiBotChip(null), null);
  });

  t('every language has the label and the chip', () => {
    const i18n = require('../../../src/client/assets/translations/i18n');
    for (const lang of Object.keys(i18n)) {
      ok(typeof i18n[lang].aiAgentFieldLabel === 'string' && i18n[lang].aiAgentFieldLabel.length > 10, `${lang}: label`);
      eq(i18n[lang].aiBotChip, 'AI Bot', `${lang}: chip`);
    }
  });
});

describe('profile: the agent flag survives the round trip through the log', (t) => {
  t('what the form publishes is what the profile reads back', async () => {
    const { makeNetwork, makePeer } = require('../../helpers/setup');
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const main = require('../../../src/models/main_models')({ cooler: A.cooler, isPublic: false });
    const ssb = await A.cooler.open();
    const pull = require('../../../src/server/node_modules/pull-stream');
    const latestPrefs = () => new Promise((resolve) => pull(ssb.createUserStream({ id: ssb.id, reverse: true }), pull.collect((err, msgs) => {
      const about = (msgs || []).find(m => m.value.content.type === 'about' && m.value.content.visibilityPrefs);
      resolve(main.about.visibilityFrom(about ? about.value.content.visibilityPrefs : null));
    })));
    await main.post.publishProfileEdit({ name: 'robot', description: 'beep', visibilityPrefs: { aiAgent: true } });
    const prefs = await latestPrefs();
    eq(prefs.aiAgent, true, 'the flag is stored in the about message and read back by the profile mapper');
    await main.post.publishProfileEdit({ name: 'robot', description: 'beep', visibilityPrefs: { ...prefs, aiAgent: false } });
    eq((await latestPrefs()).aiAgent, false, 'and can be cleared again');
    eq(main.about.visibilityFrom({}).aiAgent, false);
  });
});
