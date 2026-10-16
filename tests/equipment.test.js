import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  customFieldText, assetTagKeys, equipmentFromParts, collectEquipment, groupByTemplate, equipmentTables, equipmentCards, equipmentCsv,
  reportHtml, runEquipment, LOGGED_OUT_TEXT,
} from '../src/equipment.js';
import { LoggedOutError } from '../src/net.js';
import { EP } from '../src/endpoints.js';
import { CFG, DEFAULTS } from '../src/config.js';
import { readInspectionParts } from '../src/inspection.js';
import { ctx, inspectionFixture, fakeApi } from './fixtures/inspection.js';

const golden = name => readFile(new URL(`./fixtures/golden/${name}`, import.meta.url), 'utf8');

// A ui stand-in that records what runEquipment reports.
const fakeUi = () => ({ job: null, statuses: [], finished: 0,
  status(t) { this.statuses.push(t); }, progress() {}, finish() { this.finished++; } });

test('the logged-out sentence is the agreed wording', () => {
  assert.equal(LOGGED_OUT_TEXT, 'Procore logged you out. Log in again, then click the button again.');
});

test('customFieldText reads strings, numbers, picked entries and lists', () => {
  assert.equal(customFieldText({ value: [{ label: 'A' }, { name: 'B' }] }), 'A, B');
  assert.equal(customFieldText({ value: 12 }), '12');
  assert.equal(customFieldText({ value: { label: 'C' } }), 'C');
  assert.equal(customFieldText(undefined), '');
});

test('assetTagKeys finds custom fields labelled "asset tag", else falls back', async () => {
  assert.deepEqual(await assetTagKeys(fakeApi([]), ctx), ['custom_field_900']);
  assert.deepEqual(await assetTagKeys(fakeApi([], { fieldSetsAnswer: [] }), ctx), [CFG.assetTagFallbackKey]);
  const broken = fakeApi([]);
  broken.routes.set(EP.inspectionFieldSets(ctx), new Error('HTTP 500'));
  assert.deepEqual(await assetTagKeys(broken, ctx), [CFG.assetTagFallbackKey]);
});

test('a 403 on field sets falls back to the asset-tag key', async () => {
  const api = fakeApi([], { fieldSetsAnswer: Object.assign(new Error('HTTP 403 on /x'), { status: 403 }) });
  assert.deepEqual(await assetTagKeys(api, ctx), [CFG.assetTagFallbackKey]);
});

test('assetTagKeys does not hide a logout behind the fallback key', async () => {
  const api = fakeApi([]);
  api.routes.set(EP.inspectionFieldSets(ctx), new LoggedOutError('HTTP 401', { status: 401 }));
  await assert.rejects(assetTagKeys(api, ctx), LoggedOutError);
});

test('collectEquipment reads the Equipment Information section, numbering repeated labels', async () => {
  const r = await collectEquipment(fakeApi([inspectionFixture()]), ctx, 1, ['custom_field_900']);
  assert.equal(r.hasSection, true);
  assert.equal(r.usedSection, null);
  assert.equal(r.assetTag, 'TEST-TAG-01');
  assert.deepEqual(r.fields, [
    { number: '1.1', label: 'Manufacturer', value: 'Test Maker' },
    { number: '1.2', label: 'Model', value: 'M-1' },
    { number: '1.3', label: 'Model (2)', value: '' },
  ]);
});

test('collectEquipment falls back to the first section by position when none is named Equipment Info', async () => {
  const f = inspectionFixture();
  f.sections = [{ id: 11, name: 'Tests', position: 2 }, { id: 10, name: 'Nameplate', position: 1 }];
  const r = await collectEquipment(fakeApi([f]), ctx, 1, []);
  assert.equal(r.usedSection, 'Nameplate');
  assert.equal(r.fields.length, 3);
  assert.equal(r.assetTag, '');
});

test('equipmentFromParts gives the same answer from an inspection already read', async () => {
  const api = fakeApi([inspectionFixture()]);
  const parts = await readInspectionParts(api, ctx, 1);
  assert.deepEqual(equipmentFromParts(parts, ['custom_field_900']), await collectEquipment(api, ctx, 1, ['custom_field_900']));
});

test('equipmentCsv starts with a BOM so Excel reads UTF-8', async () => {
  const r = await collectEquipment(fakeApi([inspectionFixture()]), ctx, 1, ['custom_field_900']);
  assert.ok(equipmentCsv([r]).startsWith('﻿'));
});

test('groupByTemplate unions labels per template in first-seen order', () => {
  const rec = (template, labels) => ({ insp: { list_template_name: template }, fields: labels.map(label => ({ label })) });
  const groups = groupByTemplate([rec('T1', ['A', 'B']), rec('T2', ['X']), rec('T1', ['B', 'C']), rec(undefined, ['Z'])]);
  assert.deepEqual(groups.map(g => [g.template, g.labels, g.records.length]), [['T1', ['A', 'B', 'C'], 2], ['T2', ['X'], 1], ['Other', ['Z'], 1]]);
});

test('output is identical to CxTools 2.1.0', async () => {
  const fixtures = [inspectionFixture(), inspectionFixture({ id: 2, identifier: 8, template: 'L3 Test Transformer', name: 'Cx-Test <Transformer> "B"' })];
  fixtures[1].sections[0].name = 'Nameplate';
  const api = fakeApi(fixtures);
  const keys = await assetTagKeys(api, ctx);
  const records = [await collectEquipment(api, ctx, 1, keys), await collectEquipment(api, ctx, 2, keys)];
  const page = { title: 'T', subtitle: 'S', body: '<p>b</p>', notes: ['n <1>'], toolbar: true };
  assert.equal(JSON.stringify(records, null, 2), await golden('records.json'));
  assert.equal(equipmentTables(ctx, groupByTemplate(records)), await golden('tables.html'));
  assert.equal(equipmentCards(ctx, records), await golden('cards.html'));
  assert.equal(equipmentCsv(records), await golden('equipment.csv'));
  assert.equal(reportHtml(page), await golden('report-toolbar.html'));
  assert.equal(reportHtml({ ...page, toolbar: false, notes: [] }), await golden('report-plain.html'));
});

test('runEquipment reads every inspection and falls back to saving HTML when the tab is gone', async () => {
  const api = fakeApi([inspectionFixture(), inspectionFixture({ id: 2, identifier: 8 })]);
  const saved = [];
  const ui = fakeUi();
  await runEquipment(api, ctx, [{ id: 1 }, { id: 2 }], ui, null, DEFAULTS, (blob, name) => saved.push(name));
  assert.equal(saved.length, 1);
  assert.match(saved[0], /^Test Project - Equipment Information - \d{4}-\d{2}-\d{2}\.html$/);
  assert.match(ui.statuses.at(-1), /saved as an \.html file.*2 inspection\(s\) with Equipment Information/);
  assert.equal(ui.finished, 1);
});

test('the report starts on the remembered view and reports a change of view', async () => {
  const page = { title: 'T', subtitle: 'S', body: '<p>b</p>', notes: [], toolbar: true };
  assert.match(reportHtml({ ...page, view: 'cards' }), /value="cards" checked/);
  assert.doesNotMatch(reportHtml({ ...page, view: 'cards' }), /value="table" checked/);
  assert.match(reportHtml(page), /value="table" checked/);

  // A report tab just big enough for showReport: the written HTML, the radios and the toolbar buttons.
  const radios = ['table', 'cards'].map(value => ({ value, on: {}, addEventListener(t, fn) { this.on[t] = fn; } }));
  const els = new Map();
  const doc = {
    html: '', open() {}, write(h) { this.html = h; }, close() {},
    getElementById: id => els.get(id) ?? els.set(id, { on: {}, addEventListener(t, fn) { this.on[t] = fn; }, innerHTML: '', textContent: '' }).get(id),
    querySelectorAll: () => radios,
  };
  const win = { closed: false, document: doc, focus() {} };
  const api = fakeApi([inspectionFixture()]);
  const views = [];
  await runEquipment(api, ctx, [{ id: 1 }], fakeUi(), win, { ...DEFAULTS, reportView: 'cards', onReportView: v => views.push(v) }, () => {});
  assert.match(doc.html, /value="cards" checked/);
  assert.match(doc.html, /<div id="view"><div class="card">/);
  radios[0].on.change();
  assert.deepEqual(views, ['table']);
  assert.match(doc.getElementById('view').innerHTML, /<table class="grid">/);
});

test('logged out mid-run: stops reading, one sentence, no per-inspection errors', async () => {
  const fixtures = [1, 2, 3].map(id => inspectionFixture({ id, identifier: id }));
  const api = fakeApi(fixtures, { fail: { 2: new LoggedOutError('HTTP 401 on /x', { status: 401 }) } });
  const ui = fakeUi();
  let html = '';
  await runEquipment(api, ctx, [{ id: 1 }, { id: 2 }, { id: 3 }], ui, null, { ...DEFAULTS, equipmentConcurrency: 1 },
    async blob => { html = await blob.text(); });
  assert.equal(api.calls.some(p => p === EP.inspection(ctx, 3)), false);
  assert.equal(html.split(LOGGED_OUT_TEXT).length - 1, 1);
  assert.doesNotMatch(html, /HTTP 401/);
  assert.equal(ui.statuses.at(-1), LOGGED_OUT_TEXT);
  assert.equal(ui.finished, 1);
});

test('logged out before any inspection is read', async () => {
  const api = fakeApi([inspectionFixture()]);
  api.routes.set(EP.project(ctx), new LoggedOutError('HTTP 401', { status: 401 }));
  const ui = fakeUi();
  const win = { closed: false, close() { this.closed = true; } };
  let saves = 0;
  await runEquipment(api, ctx, [{ id: 1 }], ui, win, DEFAULTS, () => { saves++; });
  assert.equal(win.closed, true);
  assert.equal(ui.statuses.at(-1), LOGGED_OUT_TEXT);
  assert.equal(ui.finished, 1);
  assert.equal(saves, 0);
});

test('an inspection that cannot be read is named in the notes and the rest still show', async () => {
  const fixtures = [1, 2].map(id => inspectionFixture({ id, identifier: id }));
  const api = fakeApi(fixtures, { fail: { 2: new Error('HTTP 500 on /x') } });
  let html = '';
  const ui = fakeUi();
  await runEquipment(api, ctx, [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }], ui, null, DEFAULTS, async blob => { html = await blob.text(); });
  assert.match(html, /Could not read Two: HTTP 500 on \/x/);
  assert.match(ui.statuses.at(-1), /1 inspection\(s\) with Equipment Information/);
});

test('Cancel stops reading and says how many were read', async () => {
  const fixtures = [1, 2, 3].map(id => inspectionFixture({ id, identifier: id }));
  const api = fakeApi(fixtures);
  const ui = fakeUi();
  // Pressing Cancel in the dialog sets job.cancelled; here it happens once the first inspection is read.
  ui.progress = d => { if (d === 1) ui.job.cancelled = true; };
  let html = '';
  await runEquipment(api, ctx, [{ id: 1 }, { id: 2 }, { id: 3 }], ui, null, { ...DEFAULTS, equipmentConcurrency: 1 },
    async blob => { html = await blob.text(); });
  assert.equal(api.calls.some(p => p === EP.inspection(ctx, 2)), false);
  assert.match(html, /Cancelled: only 1 of 3 inspections were read\./);
  assert.match(ui.statuses.at(-1), /^Cancelled\. /);
  assert.equal(ui.finished, 1);
});
