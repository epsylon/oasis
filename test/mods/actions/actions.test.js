const { ok } = require('../../helpers/assert');
const { renderContentActions } = require('../../../src/views/main_views');

describe('content actions: the order of the icon bar', (t) => {
  t('pin, spread, report and message come before the chain and visit icons', () => {
    const node = renderContentActions('%item.sha256', '/housing/%item.sha256', {
      author: '@someone.ed25519', favKind: 'housing', isFavorite: false, reportTitle: 'a place'
    });
    const html = node.outerHTML;

    const at = (needle) => html.indexOf(needle);
    const pin = at('/housing/favorites/add/');
    const report = at('/reports?filter=create');
    const pm = at('/pm?recipients=');
    const chain = at('/blockexplorer/block/');
    const visit = at('btn-content');

    ok(pin > 0 && report > 0 && pm > 0 && chain > 0 && visit > 0, 'every action is rendered');
    ok(report < chain, 'report comes before the blockexplorer icon');
    ok(pm < chain, 'the private message comes before it too');
    ok(pin < report, 'the pin still opens the bar');
    ok(chain < visit, 'and the two navigation icons close it, in order');
  });

  t('a bar with nothing to show renders nothing at all', () => {
    const nothing = renderContentActions('', '', {});
    ok(nothing === null, 'no empty container is emitted');
  });
});
