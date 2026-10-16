import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentRoute, watchRoute } from '../src/route.js';

const base = 'https://app.procore.com/webclients/host/companies/12/projects/34/tools/inspections';

test('currentRoute reads company, project and inspection ids', () => {
  assert.deepEqual(currentRoute(base), { companyId: '12', projectId: '34', page: 'inspections', inspectionId: null });
  assert.deepEqual(currentRoute(`${base}/56`), { companyId: '12', projectId: '34', page: 'inspection', inspectionId: '56' });
  assert.equal(currentRoute(`${base}/56/items/7`).inspectionId, '56');
  assert.equal(currentRoute(`${base}/templates`), null);
});

test('currentRoute ignores the query string (list filters live there)', () => {
  assert.equal(currentRoute(`${base}?filters[status]=open`).page, 'inspections');
});

test('pages other than Inspections get no route', () => {
  assert.equal(currentRoute('https://app.procore.com/webclients/host/companies/12/projects/34/tools/observations'), null);
  assert.equal(currentRoute('https://app.procore.com/'), null);
});

test('watchRoute fires once at start and again only when the URL changes', () => {
  let tick; let href = base; const seen = [];
  let cleared = false;
  const stop = watchRoute(r => seen.push(r), {
    poll: 1000,
    setIntervalImpl: (fn, ms) => { tick = fn; assert.equal(ms, 1000); return 7; },
    clearIntervalImpl: id => { cleared = id === 7; },
    getHref: () => href,
  });
  assert.equal(seen.length, 1);
  tick(); tick();
  assert.equal(seen.length, 1);
  href = `${base}/56`;
  tick();
  assert.equal(seen.length, 2);
  assert.equal(seen[1].inspectionId, '56');
  stop();
  assert.ok(cleared);
});
