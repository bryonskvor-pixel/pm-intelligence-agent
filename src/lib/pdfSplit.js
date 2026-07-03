import { PDFDocument } from 'pdf-lib';

// Splits a multi-page PDF into individual single-page PDFs (as bytes).
// Necessary because Claude's PDF input caps at 32MB per document call, and large-format
// (24x36) commercial sheet scans routinely blow past that well before the 100-page limit.
export async function splitPdfIntoPages(pdfBytes) {
  const src = await PDFDocument.load(pdfBytes, { updateMetadata: false, ignoreEncryption: true });
  const pageCount = src.getPageCount();
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const doc = await PDFDocument.create();
    const [copiedPage] = await doc.copyPages(src, [i]);
    doc.addPage(copiedPage);
    const bytes = await doc.save();
    pages.push(bytes);
  }

  return pages;
}

// Groups indexed pages ({ index, bytes }) into batches for extraction calls, respecting both a
// page-count cap and a byte-size cap so no batch risks exceeding Claude's per-request limits.
// Operating on { index, bytes } rather than bare bytes means the subset doesn't need to be
// contiguous — each page keeps its real original document index through to extraction, which is
// what lets triage hand in a sparse candidate set (e.g. pages 4, 9, 23, 50) instead of a range.
export function batchPages(indexedPages, { maxPagesPerBatch = 15, maxBytesPerBatch = 25 * 1024 * 1024 } = {}) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const page of indexedPages) {
    const wouldExceed =
      current.length >= maxPagesPerBatch || (current.length > 0 && currentBytes + page.bytes.length > maxBytesPerBatch);
    if (wouldExceed) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(page);
    currentBytes += page.bytes.length;
  }
  if (current.length) batches.push(current);

  return batches;
}
