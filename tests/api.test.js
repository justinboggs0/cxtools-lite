import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApi } from '../src/api.js';
import { LoggedOutError } from '../src/net.js';

const ctx = { companyId: '1', projectId: '2' };

// A minimal stand-in for a fetch Response.
function res(body, { status = 200, headers = {}, redirected = false, url = 'https://app.procore.com/x', type = 'basic' } = {}) {
  const h = new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    status, ok: status >= 200 && status < 300, redirected, url, type,
    headers: { get: k => h.get(k.toLowerCase()) ?? null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}

// Records every call and answers from a list (the last answer repeats).
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (path, init) => {
    calls.push({ path, init });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a(path, init) : a;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('json sends the session cookie, JSON Accept and the company header', async () => {
  const fetchImpl = fakeFetch([res({ name: 'P' })]);
  const api = makeApi({ fetchImpl });
  assert.deepEqual(await api.json(ctx, '/rest/v1.0/projects/2'), { name: 'P' });
  const { init } = fetchImpl.calls[0];
  assert.equal(init.credentials, 'include');
  assert.equal(init.headers.Accept, 'application/json');
  assert.equal(init.headers['Procore-Company-Id'], '1');
});

test('all pages until a page adds nothing new', async () => {
  const fetchImpl = fakeFetch([res([{ id: 1 }, { id: 2 }]), res([{ id: 2 }])]);
  const api = makeApi({ fetchImpl, perPage: 2 });
  assert.deepEqual((await api.all(ctx, '/rest/list?a=1')).map(x => x.id), [1, 2]);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].path, '/rest/list?a=1&per_page=2&page=1');
  assert.equal(fetchImpl.calls[1].path, '/rest/list?a=1&per_page=2&page=2');
});

test('all stops as soon as the total header is reached', async () => {
  const fetchImpl = fakeFetch([res([{ id: 1 }, { id: 2 }], { headers: { total: 2 } }), res([{ id: 3 }])]);
  const api = makeApi({ fetchImpl });
  assert.deepEqual((await api.all(ctx, '/rest/list')).map(x => x.id), [1, 2]);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].path, '/rest/list?per_page=500&page=1');
});

test('a 401 is LoggedOutError', async () => {
  const api = makeApi({ fetchImpl: fakeFetch([res({}, { status: 401 })]) });
  const err = await api.json(ctx, '/rest/v1.0/projects/2').then(() => null, e => e);
  assert.ok(err instanceof LoggedOutError);
  assert.equal(err.status, 401);
});

test('a redirect to a login page is LoggedOutError', async () => {
  const answer = res('<html>', { status: 200, redirected: true, url: 'https://login.procore.com/x', headers: { 'content-type': 'text/html' } });
  const api = makeApi({ fetchImpl: fakeFetch([answer]) });
  await assert.rejects(api.json(ctx, '/rest/v1.0/projects/2'), LoggedOutError);
});

test('a redirect the browser refuses to follow (login page on another site) is LoggedOutError', async () => {
  const fetchImpl = fakeFetch([
    Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }),
    (path, init) => { assert.equal(init.redirect, 'manual'); return res(null, { status: 0, type: 'opaqueredirect' }); },
  ]);
  const api = makeApi({ fetchImpl });
  await assert.rejects(api.json(ctx, '/rest/x'), LoggedOutError);
});

test('a 403 is an ordinary error, not logged out', async () => {
  const api = makeApi({ fetchImpl: fakeFetch([res({}, { status: 403 })]) });
  const err = await api.json(ctx, '/rest/v1.0/projects/2').then(() => null, e => e);
  assert.ok(err instanceof Error);
  assert.ok(!(err instanceof LoggedOutError));
  assert.equal(err.message, 'HTTP 403 on /rest/v1.0/projects/2');
  assert.equal(err.status, 403);
});

test('other HTTP errors name the path without its query and carry the status', async () => {
  const api = makeApi({ fetchImpl: fakeFetch([res({}, { status: 500 })]) });
  const err = await api.json(ctx, '/rest/x?secret=1').then(() => null, e => e);
  assert.ok(!(err instanceof LoggedOutError));
  assert.equal(err.message, 'HTTP 500 on /rest/x');
  assert.equal(err.status, 500);
});

test('a plain network failure stays a network failure (offline is not logged out)', async () => {
  const offline = Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
  const fetchImpl = fakeFetch([offline, offline]);
  const api = makeApi({ fetchImpl });
  const err = await api.json(ctx, '/rest/x').then(() => null, e => e);
  assert.equal(err, offline);
  assert.equal(fetchImpl.calls.length, 2);
});

test('a 200 that is not JSON names the path and the content type', async () => {
  const answer = res('<html>', { headers: { 'content-type': 'text/html' } });
  const api = makeApi({ fetchImpl: fakeFetch([answer]) });
  await assert.rejects(api.json(ctx, '/rest/x?y=1'), /not JSON.*\/rest\/x.*text\/html/);
});

test('filteredInspections replays only the list filters, maps search, and pages until empty', async () => {
  const fetchImpl = fakeFetch([
    res([{ data: [{ id: 1 }, { id: 2 }] }, { data: [{ id: 3 }] }]),
    res([{ data: [{ id: 3 }] }]),
  ]);
  const api = makeApi({ fetchImpl });
  const search = new URLSearchParams('filters[status_id]=3&search=pump&tab=open&filters[location_id][]=7&filters[location_id][]=8');
  const rows = await api.filteredInspections(ctx, search);
  assert.deepEqual(rows.map(r => r.id), [1, 2, 3]);
  assert.equal(fetchImpl.calls.length, 2);
  const [path, query] = fetchImpl.calls[0].path.split('?');
  assert.equal(path, '/rest/v1.0/projects/2/checklist/lists/grouped_index');
  const q = new URLSearchParams(query);
  assert.equal(q.get('filters[status_id]'), '3');
  assert.deepEqual(q.getAll('filters[location_id][]'), ['7', '8']);
  assert.equal(q.get('filters[query]'), 'pump');
  assert.equal(q.get('view'), 'list');
  assert.equal(q.get('sort'), 'identifier');
  assert.equal(q.get('page'), '1');
  assert.equal(q.has('tab'), false);
  assert.equal(q.has('search'), false);
  assert.equal(new URLSearchParams(fetchImpl.calls[1].path.split('?')[1]).get('page'), '2');
});
