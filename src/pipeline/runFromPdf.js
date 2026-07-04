import { extractSheetsFromPdf } from '../lib/extraction.js';
import { splitPdfIntoPages } from '../lib/pdfSplit.js';
import { triageFromIndexText } from '../lib/triage.js';
import { findMissingCrossReferences } from '../lib/gapCheck.js';
import { normalizeSheetNumber } from '../lib/sheetNumber.js';
import { runProjectSynthesis } from '../synthesis/report.js';

const BRAND_NAMES = ['Modernfold', 'Skyfold', 'Euro-Wall', 'Airolite', 'Smoke Guard'];

// Full pipeline: a real PDF in, a bid qualification package out, extracting only the pages
// triage thinks are worth the cost instead of every page in the document — with a PM
// confirmation gate between planning and execution (Phase 5 of the remediation work order).
//
// The pipeline is split in two, with a hard stop between them:
//
// planPipeline(pdfBytes) — stages 1-3:
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
//    later-listed sheet produces a wildly wrong offset. The ordering-mismatch check in execution
//    is what catches it if a document breaks the flat-offset assumption, not a cleverer guess up front.
// Returns a manifest: per-brand candidate sheet lists (editable by the PM), unresolved
// candidates, and the page mapping (pageOffset + orderedSheetNumbers). The already-paid-for
// index sheet and plan usage ride along inside the manifest so execution never re-extracts it.
//
// The PM reviews the manifest, may add/remove candidate sheets per brand (the human curation
// step is a feature, not friction), then confirms via confirmManifest(). Execution is
// unreachable without that confirmation — executePipeline throws on anything else.
//
// executePipeline(pdfBytes, confirmedManifest) — stages 4-7:
// 4. Map the (possibly edited) candidate sheet numbers -> page indices using the manifest's
//    page mapping, then extract only the newly-needed candidate pages (the index page was
//    already extracted during planning — never re-extract it, that would pay for the same
//    page twice).
// 5. Cross-validate the offset assumption: did the pages we extracted turn out to actually be
//    the sheet numbers we expected at that position? A mismatch means the assumption broke down
//    for this document (e.g. extra inserted front matter) and results should be treated cautiously.
// 6. Gap-check the extracted candidate set against itself — anything it references but doesn't
//    include is surfaced, not silently dropped, whether that's triage under-covering, a PM edit
//    removing too much, or a real document defect (as it was for the A-101/A-102 duplicate).
// 7. Hand the candidate sheets to the routing/synthesis pipeline ALONG WITH the manifest's
//    per-brand candidate lists — routing ORs both signals (keyword/model detection on extracted
//    content, and the candidate list's judgment that e.g. a structural sheet matters to Skyfold
//    even though it never names the brand) to decide which specialists fire. Both consumers of
//    the candidate lists — page selection AND routing signal (b) — read the same edited manifest,
//    so a PM-added structural sheet is both extracted and routed to its specialist.

// Confirmation marker. Module-private on purpose: the only way to produce a manifest that
// executePipeline accepts is an explicit confirmManifest() call — there is no flag a caller
// can set by hand, so the gate cannot be skipped by accident.
const CONFIRMED = Symbol('pm-confirmed-manifest');

// Stage 1-3 → manifest. The only paid calls here are the index-page extraction and the triage
// call; candidate pages are untouched until the manifest comes back confirmed.
export async function planPipeline(pdfBytes, { indexPageIndex = 0 } = {}) {
  const { sheets: indexSheets, usage: indexUsage } = await extractSheetsFromPdf(pdfBytes, {
    pageIndices: [indexPageIndex],
  });
  const indexSheet = indexSheets[0];
  if (!indexSheet?.rawText) {
    throw new Error(`Page ${indexPageIndex} did not yield usable text — cannot triage from it.`);
  }

  const { result: triageResult, usage: triageUsage } = await triageFromIndexText(indexSheet.rawText);

  return buildManifest({
    indexPageIndex,
    triageResult,
    indexSheet,
    planUsage: { index: indexUsage, triage: triageUsage },
  });
}

// Pure manifest construction — no API calls, deterministic, testable for free.
export function buildManifest({ indexPageIndex, triageResult, indexSheet, planUsage }) {
  const perBrandCandidates = {};
  const perBrandReasoning = {};
  for (const brand of BRAND_NAMES) {
    perBrandCandidates[brand] = [...(triageResult[brand]?.candidateSheetNumbers || [])];
    perBrandReasoning[brand] = triageResult[brand]?.reasoning ?? null;
  }

  const manifest = {
    indexPageIndex,
    // List position and physical page index are different axes. The index page occupies exactly
    // one physical page immediately before the listing starts — confirmed against real extraction
    // data (a listing's first entry is the first sheet *after* the cover/index page, not page 0).
    pageOffset: indexPageIndex + 1,
    orderedSheetNumbers: [...(triageResult.orderedSheetNumbers || [])],
    perBrandCandidates,
    perBrandReasoning,
    // Informational snapshot as of planning; execution recomputes from the edited lists.
    unresolvedCandidates: resolveManifestSelections({
      pageOffset: indexPageIndex + 1,
      indexPageIndex,
      orderedSheetNumbers: triageResult.orderedSheetNumbers || [],
      perBrandCandidates,
    }).unresolvedCandidates,
    // Already paid for during planning — carried through so execution never re-extracts it.
    indexSheet,
    planUsage,
  };
  return manifest;
}

// Pure resolution of a (possibly PM-edited) manifest into everything downstream consumes from
// the candidate lists. Both consumers — the page set to extract AND the triageCandidates routing
// signal handed to synthesis — derive from the same perBrandCandidates here, so an edit flows
// into both or neither. No API calls; testable for free.
export function resolveManifestSelections(manifest) {
  const { indexPageIndex, pageOffset, orderedSheetNumbers, perBrandCandidates } = manifest;

  const expectedPageIndexBySheetNumber = new Map(
    orderedSheetNumbers.map((num, i) => [normalizeSheetNumber(num), i + pageOffset])
  );

  const candidateSheetNumbers = new Set();
  const triageCandidates = {};
  for (const brand of BRAND_NAMES) {
    const list = perBrandCandidates[brand] || [];
    triageCandidates[brand] = [...list];
    for (const num of list) candidateSheetNumbers.add(normalizeSheetNumber(num));
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

  return {
    pagesToExtract: [...pagesToExtract].sort((a, b) => a - b),
    unresolvedCandidates,
    triageCandidates,
  };
}

// Explicit PM confirmation. Snapshots the manifest as-edited and marks it accepted; the
// returned object is frozen — edits happen BEFORE confirming, on the plain manifest.
export function confirmManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('confirmManifest requires the manifest object returned by planPipeline.');
  }
  if (!manifest.indexSheet?.rawText) {
    throw new Error('Manifest is missing its extracted index sheet — confirm the object planPipeline returned, not a rebuilt one.');
  }
  const confirmed = {
    ...manifest,
    orderedSheetNumbers: Object.freeze([...manifest.orderedSheetNumbers]),
    perBrandCandidates: Object.freeze(
      Object.fromEntries(
        BRAND_NAMES.map((b) => [b, Object.freeze([...(manifest.perBrandCandidates?.[b] || [])])])
      )
    ),
  };
  Object.defineProperty(confirmed, CONFIRMED, { value: true, enumerable: false });
  return Object.freeze(confirmed);
}

// Stage 4-7. Throws — before any API call — unless the manifest went through confirmManifest().
export async function executePipeline(pdfBytes, confirmedManifest) {
  if (!confirmedManifest?.[CONFIRMED]) {
    throw new Error(
      'executePipeline requires a confirmed manifest. Call planPipeline(), let the PM review/edit the manifest, then pass confirmManifest(manifest) — candidate-page extraction does not run without explicit confirmation.'
    );
  }

  const { indexPageIndex, pageOffset, orderedSheetNumbers, indexSheet, planUsage } = confirmedManifest;
  const { pagesToExtract, unresolvedCandidates, triageCandidates } =
    resolveManifestSelections(confirmedManifest);

  // The index page was already extracted during planning — never re-extract it via a second paid call.
  const { sheets: newlyExtractedSheets, usage: extractionUsage } = pagesToExtract.length
    ? await extractSheetsFromPdf(pdfBytes, { pageIndices: pagesToExtract })
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

  // The reconciler (inside runProjectSynthesis) needs the full extracted inventory with titles/
  // disciplines (to judge whether an absence finding's where_expected sheet type is missing from
  // the set entirely) and the gap-check results — pass both, since a direct synthesis call
  // wouldn't have them.
  const sheetInventory = candidateSheets
    .filter((s) => s.sheetNumber)
    .map((s) => ({ sheetNumber: s.sheetNumber, title: s.title ?? null, discipline: s.discipline ?? null }));
  // Phase 4: unresolved triage candidates and surviving ordering mismatches feed the report's
  // required Unresolved Items section, not just the diagnostics appendix.
  const report = await runProjectSynthesis(synthesisSheets, {
    triageCandidates,
    sheetInventory,
    gapCheck: { gaps },
    unresolvedCandidates,
    orderingMismatches,
  });

  // triage.perBrand reflects the confirmed (possibly edited) candidate lists — what actually
  // drove this run — with the planning-time reasoning kept alongside for the audit trail.
  const perBrand = {};
  for (const brand of BRAND_NAMES) {
    perBrand[brand] = {
      candidateSheetNumbers: triageCandidates[brand],
      reasoning: confirmedManifest.perBrandReasoning?.[brand] ?? null,
    };
  }

  return {
    report,
    triage: { perBrand, unresolvedCandidates, pageOffset },
    orderingMismatches,
    gapCheck: { gaps, excludedNonSheetReferences },
    extractionWarnings,
    pagesExtracted,
    usage: { ...planUsage, extraction: extractionUsage },
  };
}

// Thin plan → confirm-unedited → execute wrapper, for callers (tests, scripts) that want the
// old single-call behavior. The gate still runs — the manifest is just confirmed as planned,
// with no PM edits.
export async function runPipelineFromPdf(pdfBytes, { indexPageIndex = 0 } = {}) {
  const manifest = await planPipeline(pdfBytes, { indexPageIndex });
  return executePipeline(pdfBytes, confirmManifest(manifest));
}
