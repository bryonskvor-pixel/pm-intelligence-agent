// Strict normalization for matching sheet numbers exactly (e.g. "A-405" vs "A405" vs " a-405 ").
// Deliberately stricter than tagIndex.js's normalizeKey, which intentionally preserves internal
// whitespace because it also normalizes multi-word tags/room names ("NURSING LAB 155"), where
// stripping spaces would merge distinct words together.
export function normalizeSheetNumber(s) {
  return String(s).trim().toUpperCase().replace(/\s+/g, '');
}
