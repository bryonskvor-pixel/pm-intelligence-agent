// Shared helpers for multi-sheet specialist input, used by all brand specialists and the router.

export function normalizeSheets(input) {
  if (typeof input === 'string') {
    return [{ sheetNumber: 'UNSPECIFIED', revision: null, text: input }];
  }
  return input;
}

function sheetHeader(s) {
  // s.revision ? ... would treat a legitimate Revision 0 (a real, initial/unrevised sheet — the
  // extraction schema explicitly allows revision as a number) as if no revision were present at
  // all, since 0 is falsy in JS. Explicit null/undefined check instead.
  return `--- SHEET ${s.sheetNumber}${s.revision != null ? ` rev ${s.revision}` : ''} ---`;
}

export function formatSheetsBlock(sheets) {
  return sheets.map((s) => `${sheetHeader(s)}\n${s.text}`).join('\n\n');
}

// Builds the DRAWING INPUT portion of a specialist call as Anthropic content blocks. When a
// sheet carries its original single-page PDF (`pageBytes`, attached by the PDF pipeline), the
// actual page is sent alongside the extracted text so the specialist reads the drawing itself,
// not only a transcription — spatial conflicts (an obstruction drawn across a travel path, a
// clearance that's visibly absent) live in the graphics and may never appear in extracted text.
// Sheets without pageBytes (hand-typed tests, plain-string input) degrade to text-only blocks,
// so every existing caller keeps working unchanged.
//
// maxAttachedBytes caps the total raw PDF bytes attached per call (base64 inflates ~4/3, and the
// same request also carries D1 params + Vectorize context) so a many-sheet brand batch can't
// blow the per-request size limit. Sheets past the budget fall back to text-only and are
// reported in `omittedPdfSheets` — degraded visibly, never silently.
export function buildDrawingInputBlocks(sheets, { maxAttachedBytes = 20 * 1024 * 1024 } = {}) {
  const blocks = [];
  const omittedPdfSheets = [];
  const attachedPdfSheets = [];
  let attachedBytes = 0;

  for (const s of sheets) {
    const canAttach = s.pageBytes && attachedBytes + s.pageBytes.length <= maxAttachedBytes;
    if (s.pageBytes && !canAttach) omittedPdfSheets.push(s.sheetNumber);

    if (canAttach) {
      attachedBytes += s.pageBytes.length;
      attachedPdfSheets.push(s.sheetNumber);
      blocks.push({
        type: 'text',
        text: `${sheetHeader(s)}\nThe original drawing page (PDF) is attached directly below; its extracted text follows after it.`,
      });
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(s.pageBytes).toString('base64') },
      });
      blocks.push({ type: 'text', text: `EXTRACTED TEXT for SHEET ${s.sheetNumber}:\n${s.text}` });
    } else {
      blocks.push({ type: 'text', text: `${sheetHeader(s)}\n${s.text}` });
    }
  }

  return { blocks, attachedPdfSheets, omittedPdfSheets };
}
