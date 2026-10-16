// Reads one inspection with its sections and items.

import { EP } from './endpoints.js';

/**
 * @param {{json: Function, all: Function}} api
 * @param {{companyId: string, projectId: string}} ctx
 * @param {string|number} id
 * @returns {Promise<{insp: object, sections: Array<object>, items: Array<object>}>}
 */
export async function readInspectionParts(api, ctx, id) {
  const [insp, sections, items] = await Promise.all([
    api.json(ctx, EP.inspection(ctx, id)),
    api.all(ctx, EP.sections(ctx, id)),
    api.all(ctx, EP.items(ctx, id)),
  ]);
  return { insp, sections, items };
}
