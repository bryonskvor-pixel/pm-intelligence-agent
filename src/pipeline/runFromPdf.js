import { extractSheetsFromPdf } from '../lib/extraction.js';
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
// 3. Map candidate sheet numbers -> page indices using that order as a position heuristic
//    (bid sets are almost always compiled in the same order as their own index).
// 4. Extract only the candidate pages (the real cost, now trimmed to what plausibly matters).
// 5. Cross-validate the ordering heuristic: did the pages we extracted turn out to actually be
//    the sheet numbers we expected at that position? A mismatch means the heuristic broke down
//    for this document (e.g. an inserted unnumbered page) and results should be treated cautiously.
// 6. Gap-check the extracted candidate set against itself — anything it references but doesn't
//    include is surfaced, not silently dropped, whether that's triage under-covering or a real
//    document defect (as it was for the A-101/A-102 duplicate found earlier this session).
// 7. Hand the candidate sheets to the already-validated routing/synthesis pipeline — brand
//    routing there uses actual extracted content (keyword/model detection), not triage's
//    candidate list, so any triage imprecision never leaks into the final routing decision.
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
  const expectedPageIndexBySheetNumber = new Map(
    orderedSheetNumbers.map((num, i) => [normalizeSheetNumber(num), i])
  );

  const candidateSheetNumbers = new Set();
  for (const brand of BRAND_NAMES) {
    for (const num of triageResult[brand]?.candidateSheetNumbers || []) {
      candidateSheetNumbers.add(normalizeSheetNumber(num));
    }
  }

  const candidatePageIndices = new Set([indexPageIndex]);
  const unresolvedCandidates = [];
  for (const num of candidateSheetNumbers) {
    const pageIndex = expectedPageIndexBySheetNumber.get(num);
    if (pageIndex === undefined) {
      unresolvedCandidates.push(num);
      continue;
    }
    candidatePageIndices.add(pageIndex);
  }

  const { sheets: candidateSheets, usage: extractionUsage } = await extractSheetsFromPdf(pdfBytes, {
    pageIndices: [...candidatePageIndices],
  });

  const orderingMismatches = [];
  for (const sheet of candidateSheets) {
    if (!sheet.sheetNumber) continue;
    const expectedNumber = orderedSheetNumbers[sheet.pageIndex];
    if (expectedNumber && normalizeSheetNumber(expectedNumber) !== normalizeSheetNumber(sheet.sheetNumber)) {
      orderingMismatches.push({ pageIndex: sheet.pageIndex, expected: expectedNumber, actual: sheet.sheetNumber });
    }
  }

  const { gaps, excludedNonSheetReferences } = findMissingCrossReferences(candidateSheets);

  const synthesisSheets = candidateSheets
    .filter((s) => s.sheetNumber)
    .map((s) => ({ sheetNumber: s.sheetNumber, revision: s.revision, text: s.rawText }));
  const report = await runProjectSynthesis(synthesisSheets);

  return {
    report,
    triage: { perBrand: triageResult, unresolvedCandidates },
    orderingMismatches,
    gapCheck: { gaps, excludedNonSheetReferences },
    pagesExtracted: [...candidatePageIndices].sort((a, b) => a - b),
    usage: { index: indexUsage, triage: triageUsage, extraction: extractionUsage },
  };
}
