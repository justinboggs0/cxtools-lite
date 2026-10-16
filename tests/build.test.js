import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build, topLevelNames } from '../tools/build.mjs';

const UPDATE_URL = 'https://raw.githubusercontent.com/justinboggs0/cxtools-lite/main/cxtools-lite.user.js';
const meta = (text, key) => [...text.matchAll(new RegExp(`^// @${key}\\s+(.+)$`, 'gm'))].map(m => m[1].trim());

test('build wraps modules in one IIFE under the header', async () => {
  const out = await build({ srcDir: 'src', outFile: null, order: ['main'], version: '9.8.7' });
  assert.ok(out.startsWith('// ==UserScript=='));
  assert.match(out, /@version\s+9\.8\.7\n/);
  assert.ok(out.trimEnd().endsWith('})();'));
  assert.doesNotMatch(out, /^\s*(import|export) /m);
});

test('build refuses duplicate top-level names', async () => {
  assert.deepEqual(topLevelNames('export function a(){}\nconst b = 1;\nexport class C {}'), ['a', 'b', 'C']);
  await assert.rejects(build({ srcDir: 'tests/fixtures/dup', outFile: null, order: ['one', 'two'], version: '1.0.0' }), /duplicate top-level name: same/);
});

test('the header asks for nothing extra and updates from GitHub', async () => {
  const out = await build({ srcDir: 'src', outFile: null, order: ['main'], version: '1.0.0' });
  assert.deepEqual(meta(out, 'updateURL'), [UPDATE_URL]);
  assert.deepEqual(meta(out, 'downloadURL'), [UPDATE_URL]);
  assert.deepEqual(meta(out, 'grant').sort(), ['GM_addStyle', 'GM_getValue', 'GM_registerMenuCommand', 'GM_setValue']);
  assert.deepEqual(meta(out, 'require'), []);
  assert.deepEqual(meta(out, 'connect'), []);
  assert.deepEqual(meta(out, 'namespace'), ['cxtools-lite']);
  assert.deepEqual(meta(out, 'name'), ['CxTools Lite']);
});

test('the committed build matches package.json', async () => {
  if (!existsSync('cxtools-lite.user.js')) return;
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.deepEqual(meta(await readFile('cxtools-lite.user.js', 'utf8'), 'version'), [version]);
});
