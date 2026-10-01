import Set, * as SetModule from 'es-set';
import test from 'tape';
import runTests from './tests.js';

test('as a function', (t) => {
	runTests(Set, t);

	t.end();
});

test('named exports', async (t) => {
	t.deepEqual(
		Object.keys(SetModule).sort(),
		['default', 'shim', 'getPolyfill', 'implementation'].sort(),
		'has expected named exports',
	);

	const { shim, getPolyfill, implementation } = SetModule;
	t.equal((await import('es-set/shim')).default, shim, 'shim named export matches deep export');
	t.equal((await import('es-set/implementation')).default, implementation, 'implementation named export matches deep export');
	t.equal((await import('es-set/polyfill')).default, getPolyfill, 'getPolyfill named export matches deep export');

	t.end();
});
