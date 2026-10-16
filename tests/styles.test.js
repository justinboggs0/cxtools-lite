// The full CxTools can run on the same page, so every id and class here must be our own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CSS } from '../src/ui/styles.js';

test('the stylesheet only styles cxl- elements', () => {
  assert.match(CSS, /#cxl-fab/);
  assert.match(CSS, /#cxl-overlay/);
  assert.doesNotMatch(CSS, /#pid-|\.pid-|\.cx-(?!l-)|#cx-(?!l-)/);
});

test('the button and the dialog use cxl- ids only', async () => {
  for (const f of ['src/ui/dialog.js', 'src/ui/fab.js']) {
    assert.doesNotMatch(await readFile(f, 'utf8'), /['"]pid-|['"]cx-(?!l-)/, f);
  }
});
