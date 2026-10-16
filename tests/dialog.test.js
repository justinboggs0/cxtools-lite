import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, tickVisible, countText, selectedStubs } from '../src/ui/dialog.js';

const rows = () => [
  { text: 'cx-ats-001 open', hidden: false, checked: true, data: { id: 1 } },
  { text: 'cx-ups-002 closed', hidden: false, checked: true, data: { id: 2 } },
];

test('filterRows hides rows that do not contain the text, ignoring case and spaces', () => {
  const r = rows();
  filterRows(r, '  UPS ');
  assert.deepEqual(r.map(x => x.hidden), [true, false]);
  filterRows(r, '');
  assert.deepEqual(r.map(x => x.hidden), [false, false]);
});

test('tickVisible only changes visible rows', () => {
  const r = rows();
  filterRows(r, 'ups');
  tickVisible(r, false);
  assert.deepEqual(r.map(x => x.checked), [true, false]);
});

test('countText counts ticked of all rows', () => {
  const r = rows();
  r[1].checked = false;
  assert.equal(countText(r), '1 of 2 selected');
});

test('selectedStubs returns the data of ticked rows in order', () => {
  const r = [...rows(), { text: 'c', hidden: true, checked: true, data: { id: 3 } }];
  r[0].checked = false;
  assert.deepEqual(selectedStubs(r), [{ id: 2 }, { id: 3 }]);
});
