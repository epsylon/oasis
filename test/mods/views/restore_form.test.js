const { eq, ok, notOk } = require('../../helpers/assert');

describe('views: what the user typed comes back after an error', (t) => {
  const { restoreFormFields } = require('../../../src/views/main_views');
  const form = '<form><input name="title" type="text" value=""/><textarea name="description" rows="6"></textarea>' +
    '<input type="checkbox" name="anonymous" value="1"/><input type="hidden" name="tribeId" value="%x"/>' +
    '<select name="category"><option value="art" selected>Art</option><option value="code">Code</option></select>' +
    '<input name="price" type="number"/><input type="password" name="pw"/></form>';

  t('text fields, long texts and selects are filled with the stored values, escaped', () => {
    const long = 'línea con <b>html</b> & "comillas"\n'.repeat(300);
    const out = restoreFormFields(form, { title: 'Hola "mundo" <3', description: long, category: 'code', price: '12', anonymous: '1', tribeId: '%evil', pw: 'nope' });
    ok(out.includes('<input name="title" type="text" value="Hola &quot;mundo&quot; &lt;3"/>'), 'the title is set and escaped');
    ok(out.includes(`<textarea name="description" rows="6">${long.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>`), 'the long text is back whole, escaped');
    ok(out.includes('<option value="art">Art</option><option value="code" selected>Code</option>'), 'the chosen option is selected');
    ok(out.includes('<input name="price" type="number" value="12"/>'), 'an input without value gets one');
    ok(out.includes('<input type="checkbox" name="anonymous" value="1"/>'), 'checkboxes are left alone');
    ok(out.includes('<input type="hidden" name="tribeId" value="%x"/>'), 'hidden fields are never overwritten');
    ok(out.includes('<input type="password" name="pw"/>'), 'passwords are never filled');
    notOk(out.includes('<script'), 'nothing executable is injected');
  });

  t('fields that are not in the page and odd names are ignored', () => {
    const out = restoreFormFields(form, { missing: 'x', 'weird name': 'y', title: 42 });
    eq(out, form);
  });
});
