// Every Procore path this script reads. All are reads; if Procore moves one, fix it here.
// `c` is a route: {companyId, projectId}.

export const EP = {
  // The project record (for its name).
  project: c => `/rest/v1.0/projects/${c.projectId}?company_id=${c.companyId}`,
  // One inspection: name, number, status, template, custom fields.
  inspection: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/lists/${id}`,
  // The inspection's sections, in order.
  sections: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/list_sections?filters[list_id]=${id}&sort=position&view=flat_v2`,
  // Every item with its answer.
  items: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/list_items?filters[list_id]=${id}&view=extended&sort=position_by_section`,
  // The Inspections list as the list page shows it; the page's filters are added as query parameters.
  groupedIndex: c => `/rest/v1.0/projects/${c.projectId}/checklist/lists/grouped_index`,
  // Labels for the inspection custom fields (custom_field_12501 -> "Asset Tag Plate ID").
  inspectionFieldSets: c => `/rest/v1.0/projects/${c.projectId}/configurable_field_sets?types[]=ConfigurableFieldSet::Checklist::List&include_lov_entries=false`,
};
