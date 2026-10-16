import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, csvCell, today } from '../src/naming.js';

test('clean makes Windows-safe names', () => {
  assert.equal(clean('a/b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
  assert.equal(clean('  x  '), 'x');
  assert.equal(clean('name.'), 'name');
  assert.equal(clean(''), 'untitled');
  assert.equal(clean('a--b'), 'a-b');
  assert.equal(clean('abcdef', 3), 'abc');
});

test('csvCell quotes and doubles quotes', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(null), '""');
});

test('today is YYYY-MM-DD', () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
