// Made-up inspection data in the shapes Procore returns. No real project, asset or person.
import { EP } from '../../src/endpoints.js';

export const ctx = { companyId: '1', projectId: '2', origin: 'https://app.procore.com' };

export function inspectionFixture({ id = 1, template = 'L2 Test Switchgear', name = 'Cx-Test Switchgear', identifier = 7 } = {}) {
  const insp = {
    id, identifier, name,
    list_template_name: template,
    status: 'Open',
    location: { name: 'Test Hall A' },
    custom_fields: { custom_field_900: { value: 'TEST-TAG-01' }, custom_field_901: { value: [{ label: 'X' }, { name: 'Y' }] } },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    attachments: [{ id: 'a1', url: 'https://s3.example.test/a1', filename: 'drawing.pdf' }],
  };
  const sections = [
    { id: 10, name: 'Equipment Information', position: 1 },
    { id: 11, name: 'Tests', position: 2 },
  ];
  const items = [
    { id: 100, number: '1.1', section_id: 10, name: 'Manufacturer:', responded_with: 'Test Maker', item_response: { payload: { text: 'Test Maker' } }, not_applicable: false, photo_ids: [], attachment_ids: [], comment_ids: [] },
    { id: 101, number: '1.2', section_id: 10, name: 'Model', responded_with: 'M-1', photo_ids: [], attachment_ids: [], comment_ids: [] },
    { id: 102, number: '1.3', section_id: 10, name: 'Model', responded_with: 'No Response', photo_ids: [], attachment_ids: [], comment_ids: [] },
    { id: 103, number: '2.1', section_id: 11, name: 'Insulation resistance test', responded_with: 'Pass', item_response: { payload: { value: 'Pass' } }, photo_ids: [300], attachment_ids: [200, 201], comment_ids: [400] },
  ];
  return { insp, sections, items };
}

export const fieldSets = [{ fields: {
  custom_field_900: { label: 'Asset Tag Plate ID' },
  custom_field_901: { label: 'Other field' },
  standard_field: { label: 'Asset tag (not custom)' },
} }];

/**
 * A stand-in for makeApi() that answers the EP paths from fixtures.
 * `fail` maps an inspection id to an error thrown when that inspection is read.
 * A route whose value is an Error throws it.
 */
export function fakeApi(fixtures, { fail = {}, fieldSetsAnswer = fieldSets } = {}) {
  const routes = new Map();
  for (const f of fixtures) {
    const id = f.insp.id;
    routes.set(EP.inspection(ctx, id), f.insp);
    routes.set(EP.sections(ctx, id), f.sections);
    routes.set(EP.items(ctx, id), f.items);
  }
  routes.set(EP.inspectionFieldSets(ctx), fieldSetsAnswer);
  routes.set(EP.project(ctx), { id: 2, name: 'Test Project' });
  const calls = [];
  const answer = async (_ctx, path) => {
    calls.push(path);
    for (const [id, err] of Object.entries(fail)) {
      if (path === EP.inspection(ctx, id) || path.includes(`filters[list_id]=${id}&`)) throw err;
    }
    if (!routes.has(path)) throw new Error(`HTTP 404 on ${path.split('?')[0]}`);
    const v = routes.get(path);
    if (v instanceof Error) throw v;
    return structuredClone(v);
  };
  return { json: answer, all: answer, calls, routes };
}
