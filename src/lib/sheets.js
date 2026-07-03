// Shared helpers for multi-sheet specialist input, used by all brand specialists and the router.

export function normalizeSheets(input) {
  if (typeof input === 'string') {
    return [{ sheetNumber: 'UNSPECIFIED', revision: null, text: input }];
  }
  return input;
}

export function formatSheetsBlock(sheets) {
  return sheets
    .map((s) => `--- SHEET ${s.sheetNumber}${s.revision ? ` rev ${s.revision}` : ''} ---\n${s.text}`)
    .join('\n\n');
}
