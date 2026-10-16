import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInspectionParts } from '../src/inspection.js';
import { LoggedOutError } from '../src/net.js';
import { EP } from '../src/endpoints.js';
import { ctx, inspectionFixture, fakeApi } from './fixtures/inspection.js';

test('readInspectionParts reads the inspection, its sections and its items', async () => {
  const f = inspectionFixture();
  const api = fakeApi([f]);
  const parts = await readInspectionParts(api, ctx, 1);
  assert.deepEqual(parts, { insp: f.insp, sections: f.sections, items: f.items });
  assert.deepEqual([...api.calls].sort(), [EP.inspection(ctx, 1), EP.items(ctx, 1), EP.sections(ctx, 1)].sort());
});

test('readInspectionParts passes a logged-out error through', async () => {
  const api = fakeApi([inspectionFixture()], { fail: { 1: new LoggedOutError('HTTP 401', { status: 401 }) } });
  await assert.rejects(readInspectionParts(api, ctx, 1), LoggedOutError);
});
