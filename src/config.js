// Fixed numbers and matching rules.

export const DEFAULTS = Object.freeze({
  // Inspections read at the same time.
  equipmentConcurrency: 4,
  // Page size for Procore list calls.
  perPage: 500,
});

export const CFG = Object.freeze({
  // Section whose answers go into the Equipment list. Must not match "LLE (Long Lead Equipment) Vendor Checks".
  equipmentSection: /^\s*equipment\s+info/i,
  // Inspection custom field shown next to the inspection name (found by its label).
  assetTagLabel: /asset\s*tag/i,
  // Used when the field labels can't be read.
  assetTagFallbackKey: 'custom_field_12501',
});
