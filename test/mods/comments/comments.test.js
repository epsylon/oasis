const { eq, ok, notOk } = require('../../helpers/assert');

const { renderCommentsSection, COMMENT_ICON } = require('../../../src/views/comments_view');

const comment = (text, key = '%c1.sha256') => ({
  key,
  value: { author: '@a.ed25519', timestamp: 1700000000000, content: { type: 'post', text } }
});

describe('comments: one dropdown for every module', (t) => {
  t('the section is a collapsed icon with a counter', () => {
    const html = String(renderCommentsSection({
      action: '/tasks/%t.sha256/comments',
      comments: [comment('first'), comment('second', '%c2.sha256')],
      returnTo: '/tasks/%t.sha256'
    }).outerHTML);

    ok(html.includes('<details'), 'it is a dropdown');
    ok(html.includes(COMMENT_ICON), 'with an icon');
    ok(html.includes('(2)'), 'and the number of comments');
    ok(html.includes('/tasks/%t.sha256/comments'), 'the form posts to the module route');
    ok(html.includes('name="returnTo"'), 'and comes back where it was opened');
    ok(html.includes('first') && html.includes('second'), 'both comments are listed');
    notOk(html.includes('>false<'), 'no falsy value leaked into the html');
  });

  t('empty comments do not count and the form is still offered', () => {
    const html = String(renderCommentsSection({
      action: '/blogs/%b.sha256/comments',
      comments: [comment(''), comment('   ', '%c2.sha256'), null]
    }).outerHTML);

    ok(html.includes('(0)'), 'blank comments are not counted');
    ok(html.includes('/blogs/%b.sha256/comments'), 'anyone can still write one');
  });

  t('when the author closed the comments there is no form', () => {
    const html = String(renderCommentsSection({
      action: '/blogs/%b.sha256/comments',
      comments: [],
      closedNote: 'Comments are closed'
    }).outerHTML);

    ok(html.includes('Comments are closed'), 'it says so');
    notOk(html.includes('<form'), 'and offers no way to comment');
  });

});

describe('comments: opinions and comments side by side', (t) => {
  t('both sit in the same row and can be open at the same time', () => {
    const { renderEngagement, renderOpinionsVoting } = require('../../../src/views/main_views');
    const { renderCommentsSection } = require('../../../src/views/comments_view');

    const id = '%item.sha256';
    const html = String(renderEngagement(id,
      renderOpinionsVoting('/tasks/opinions', id, {}, null, []),
      renderCommentsSection({ action: `/tasks/${encodeURIComponent(id)}/comments`, comments: [] })
    ).outerHTML);

    ok(html.includes('card-engage'), 'both live in the same row');
    ok(html.indexOf('opinions-summary') < html.indexOf('comments-summary'), 'opinions on the left, comments on the right');
    notOk(/name="engage/.test(html), 'no accordion group ties them together, so opening one leaves the other alone');
  });

  t('a panel only lights up when it has something inside', () => {
    const { renderOpinionsVoting } = require('../../../src/views/main_views');
    const { renderCommentsSection } = require('../../../src/views/comments_view');

    const emptyOpinions = String(renderOpinionsVoting('/tasks/opinions', '%x.sha256', {}, null, []).outerHTML);
    const emptyComments = String(renderCommentsSection({ action: '/tasks/%x/comments', comments: [] }).outerHTML);
    notOk(emptyOpinions.includes('engage-on'), 'no opinions, no highlight');
    notOk(emptyComments.includes('engage-on'), 'no comments, no highlight');

    const withOpinions = String(renderOpinionsVoting('/tasks/opinions', '%x.sha256', { interesting: 2 }, null, []).outerHTML);
    const withComments = String(renderCommentsSection({
      action: '/tasks/%x/comments',
      comments: [{ key: '%c.sha256', value: { author: '@a.ed25519', timestamp: 1, content: { text: 'hi' } } }]
    }).outerHTML);
    ok(withOpinions.includes('engage-on'), 'one opinion lights the button up');
    ok(withComments.includes('engage-on'), 'one comment lights the button up');
  });

  t('a row with only one of the two still renders', () => {
    const { renderEngagement, renderOpinionsVoting } = require('../../../src/views/main_views');
    const only = renderEngagement('%x.sha256', renderOpinionsVoting('/tasks/opinions', '%x.sha256', {}, null, []), null);
    ok(String(only.outerHTML).includes('opinions-summary'), 'the opinions panel is there on its own');
    eq(renderEngagement('%x.sha256', null, null), null, 'and nothing renders when there is neither');
  });
});

describe('comments: the same row in a list card', (t) => {
  t('a card links to the detail with the icon and the counter', () => {
    const { renderCommentsLink } = require('../../../src/views/comments_view');

    const empty = String(renderCommentsLink({ href: '/feed/%f.sha256', count: 0 }).outerHTML);
    ok(empty.includes('/feed/%f.sha256'), 'it goes to the detail page');
    ok(empty.includes('(0)'), 'and carries the counter');
    notOk(empty.includes('engage-on'), 'with nothing to read it stays neutral');

    const some = String(renderCommentsLink({ href: '/feed/%f.sha256', count: 4 }).outerHTML);
    ok(some.includes('engage-on'), 'with comments it lights up like the panel does');
    eq(renderCommentsLink({}), null, 'without a target there is no button');
  });
});
