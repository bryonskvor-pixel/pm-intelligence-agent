// Shared helpers for multi-sheet specialist input, used by all brand specialists and the router.

export function normalizeSheets(input) {
  if (typeof input === 'string') {
    return [{ sheetNumber: 'UNSPECIFIED', revision: null, text: input }];
  }
  return input;
}

export function formatSheetsBlock(sheets) {
  return sheets
    // s.revision ? ... would treat a legitimate Revision 0 (a real, initial/unrevised sheet — the
    // extraction schema explicitly allows revision as a number) as if no revision were present at
    // all, since 0 is falsy in JS. Explicit null/undefined check instead.
    .map((s) => `--- SHEET ${s.sheetNumber}${s.revision != null ? ` rev ${s.revision}` : ''} ---\n${s.text}`)
    .join('\n\n');
}
