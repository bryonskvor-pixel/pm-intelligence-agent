import { extractSheetsFromPdf } from '../lib/extraction.js';
import { splitPdfIntoPages } from '../lib/pdfSplit.js';
import { triageFromIndexText } from '../lib/triage.js';
import { findMissingCrossReferences } from '../lib/gapCheck.js';
import { normalizeSheetNumber } from '../lib/sheetNumber.js';
import { runProjectSynthesis } from '../synthesis/report.js';

const BRAND_NAMES = ['Modernfold', 'Skyfold', 'Euro-Wall', 'Airolite', 'Smoke Guard'];

// Full pipeline: a real PDF in, a six-section report out, extracting only the pages triage
// thinks are worth the cost instead of every page in the document.
//
// Stages:
// 1. Extract just the index/cover page (cheap — one page).
// 2. Triage: one cheap call reasoning over that page's sheet listing, returning per-brand
//    candidate sheet numbers plus the full listing in its original (assumed physical) order.
// 3. Compute the offset between "position in that listing" and "physical page index" — these
//    are NOT the same axis (the listing rarely names the index/cover page itself, so position 0
//    in the list is usually physical page indexPageIndex + 1, not page 0). Uses a flat "one page
//    of front matter" default rather than trying to self-correct by matching the index page's own
//    sheet number against its own listing — tested that against real data and it's actively
//    worse, since real sheet sets can have numbering irregularities (this project has a confirmed
//    duplicate, "A-101" used for two different sheets), so a coincidental match to an unrelated
//    later-listed sheet produces a wildly wrong offset. The ordering-mismatch check in step 5 is
//    what catches it if a document breaks the flat-offset assumption, not a cleverer guess up front.
// 4. Map candidate sheet numbers -> page indices using that offset, then extract only the
//    newly-needed candidate pages (the index page was already extracted in step 1 — never
//    re-extract it, that would pay for the same page twice).
// 5. Cross-validate the offset assumption: did the pages we extracted turn out to actually be
//    the sheet numbers we expected at that position? A mismatch means the assumption broke down
//    for this document (e.g. extra inserted front matter) and results should be treated cautiously.
// 6. Gap-check the extracted candidate set against itself — anything it references but doesn't
//    include is surfaced, not silently dropped, whether that's triage under-covering or a real
//    document defect (as it was for the A-101/A-102 duplicate found earlier this session).
// 7. Hand the candidate sheets to the routing/synthesis pipeline ALONG WITH triage's per-brand
//    candidate lists — routing ORs both signals (keyword/model detection on extracted content,
//    and triage's judgment that e.g. a structural sheet matters to Skyfold even though it never
//    names the brand) to decide which specialists fire; every firing specialist then receives
//    the full extracted set, role-tagged primary vs. context.
export async function runPipelineFromPdf(pdfBytes, { indexPageIndex = 0 } = {}) {
  const { sheets: indexSheets, usage: indexUsage } = await extractSheetsFromPdf(pdfBytes, {
    pageIndices: [indexPageIndex],
  });
  const indexSheet = indexSheets[0];
  if (!indexSheet?.rawText) {
    throw new Error(`Page ${indexPageIndex} did not yield usable text — cannot triage from it.`);
  }

  const { result: triageResult, usage: triageUsage } = await triageFromIndexText(indexSheet.rawText);
  const orderedSheetNumbers = triageResult.orderedSheetNumbers || [];

  // List position and physical page index are different axes. The index page occupies exactly
  // one physical page immediately before the listing starts — confirmed against real extraction
  // data (a listing's first entry is the first sheet *after* the cover/index page, not page 0).
  const pageOffset = indexPageIndex + 1;
  const expectedPageIndexBySheetNumber = new Map(
    orderedSheetNumbers.map((num, i) => [normalizeSheetNumber(num), i + pageOffset])
  );

  const candidateSheetNumbers = new Set();
  for (const brand of BRAND_NAMES) {
    for (const num of triageResult[brand]?.candidateSheetNumbers || []) {
      candidateSheetNumbers.add(normalizeSheetNumber(num));
    }
  }

  const pagesToExtract = new Set();
  const unresolvedCandidates = [];
  for (const num of candidateSheetNumbers) {
    const pageIndex = expectedPageIndexBySheetNumber.get(num);
    if (pageIndex === undefined) {
      unresolvedCandidates.push(num);
      continue;
    }
    if (pageIndex !== indexPageIndex) pagesToExtract.add(pageIndex);
  }

  // The index page was already extracted in step 1 — never re-extract it via a second paid call.
  const { sheets: newlyExtractedSheets, usage: extractionUsage } = pagesToExtract.size
    ? await extractSheetsFromPdf(pdfBytes, { pageIndices: [...pagesToExtract] })
    : { sheets: [], usage: { callCount: 0, inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } };

  const candidateSheets = [indexSheet, ...newlyExtractedSheets];
  const pagesExtracted = [indexPageIndex, ...pagesToExtract].sort((a, b) => a - b);

  const orderingMismatches = [];
  for (const sheet of candidateSheets) {
    if (!sheet.sheetNumber || sheet.pageIndex === indexPageIndex) continue;
    const expectedNumber = orderedSheetNumbers[sheet.pageIndex - pageOffset];
    if (expectedNumber && normalizeSheetNumber(expectedNumber) !== normalizeSheetNumber(sheet.sheetNumber)) {
      orderingMismatches.push({ pageIndex: sheet.pageIndex, expected: expectedNumber, actual: sheet.sheetNumber });
    }
  }

  const { gaps, excludedNonSheetReferences } = findMissingCrossReferences(candidateSheets);

  // Aggregate the per-sheet guard warnings (noisy tags, schedule misalignment, thin extraction)
  // into one pipeline-level list so they surface in diagnostics instead of living only on the
  // sheet objects where nobody looks after synthesis.
  const extractionWarnings = candidateSheets.flatMap((s) =>
    (s.extractionWarnings || []).map((w) => ({ sheetNumber: s.sheetNumber, pageIndex: s.pageIndex, ...w }))
  );

  // Each sheet carries its original single-page PDF into synthesis so the brand specialists can
  // read the drawing itself, not just its transcription — spatial conflicts (obstructions in a
  // travel path, clearances) are drawn, not written, and rawText alone can't carry them.
  // Splitting is local/free (pdf-lib, no API call), same as inside extractSheetsFromPdf.
  const pageBytesByIndex = await splitPdfIntoPages(pdfBytes);

  const synthesisSheets = candidateSheets
    .filter((s) => s.sheetNumber)
    .map((s) => ({
      sheetNumber: s.sheetNumber,
      revision: s.revision,
      text: s.rawText,
      pageBytes: s.pageIndex != null ? pageBytesByIndex[s.pageIndex] : undefined,
    }));

  // Triage's judgment must survive into routing (it's signal (b) for which specialists fire) —
  // not just decide which pages got extracted.
  const triageCandidates = {};
  for (const brand of BRAND_NAMES) {
    triageCandidates[brand] = triageResult[brand]?.candidateSheetNumbers || [];
  }
  const report = await runProjectSynthesis(synthesisSheets, { triageCandidates });

  return {
    report,
    triage: { perBrand: triageResult, unresolvedCandidates, pageOffset },
    orderingMismatches,
    gapCheck: { gaps, excludedNonSheetReferences },
    extractionWarnings,
    pagesExtracted,
    usage: { index: indexUsage, triage: triageUsage, extraction: extractionUsage },
  };
}
